package services

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"miappfiber/database"
	"miappfiber/models"

	"gorm.io/gorm"
)

func roundFiscalMoney(v float64) float64 {
	return math.Round(v*100) / 100
}

func documentPeriodLabel(doc *models.Document) string {
	if doc == nil {
		return ""
	}
	if p := strings.TrimSpace(doc.AccountingPeriod); p != "" {
		return p
	}
	return strings.TrimSpace(doc.ServiceMonth)
}

// buildLinesFromPaymentAllocations genera líneas de PDF desde imputaciones del pago (deudas / liquidación).
func buildLinesFromPaymentAllocations(pay *models.Payment) []models.FiscalReceiptLine {
	if pay == nil || len(pay.Allocations) == 0 {
		return nil
	}
	lines := make([]models.FiscalReceiptLine, 0)
	sortIdx := 0
	payDesc := strings.TrimSpace(pay.Description)
	for _, a := range pay.Allocations {
		amt := roundFiscalMoney(a.Amount)
		if amt <= 0 || a.Document == nil {
			continue
		}
		paidAcc := DocumentPaidTotal(database.DB, a.DocumentID)
		paidBefore := roundFiscalMoney(paidAcc - amt)
		if paidBefore < 0 {
			paidBefore = 0
		}
		chunk := buildLinesFromDocumentAllocation(a.Document, amt, paidBefore, payDesc, sortIdx)
		lines = append(lines, chunk...)
		sortIdx += len(chunk)
	}
	return lines
}

func documentItemLabel(it models.DocumentItem) string {
	if it.Product != nil {
		if n := productDisplayName(it.Product); n != "" {
			return n
		}
	}
	return strings.TrimSpace(it.Description)
}

func appendPeriodToDesc(desc string, doc *models.Document) string {
	if per := documentPeriodLabel(doc); per != "" {
		return fmt.Sprintf("%s — %s", desc, per)
	}
	return desc
}

func newFiscalLineFromAmount(desc string, amt float64, sortOrder int) models.FiscalReceiptLine {
	amt = roundFiscalMoney(amt)
	base := roundFiscalMoney(amt / 1.18)
	igv := roundFiscalMoney(amt - base)
	return models.FiscalReceiptLine{
		LineType:     models.FiscalReceiptLineTypeManual,
		ProductName:  desc,
		Description:  desc,
		InternalCode: fmt.Sprintf("%04d", sortOrder+1),
		UnitTypeID:   "NIU",
		Quantity:     1,
		UnitPrice:    amt,
		LineSubtotal: base,
		IGVRate:      18,
		IGVAmount:    igv,
		LineTotal:    amt,
		SortOrder:    sortOrder,
	}
}

func sortedDocumentItems(doc *models.Document) []models.DocumentItem {
	if doc == nil || len(doc.Items) == 0 {
		return nil
	}
	items := append([]models.DocumentItem(nil), doc.Items...)
	sort.Slice(items, func(i, j int) bool {
		if items[i].SortOrder != items[j].SortOrder {
			return items[i].SortOrder < items[j].SortOrder
		}
		return items[i].ID < items[j].ID
	})
	return items
}

// buildLinesFromDocumentAllocation asigna el monto imputado a ítems de la deuda (waterfill tras pagos previos).
func buildLinesFromDocumentAllocation(doc *models.Document, allocAmount, paidBefore float64, payDesc string, lineStart int) []models.FiscalReceiptLine {
	allocAmount = roundFiscalMoney(allocAmount)
	if allocAmount <= 0 || doc == nil {
		return nil
	}
	items := sortedDocumentItems(doc)
	if len(items) > 0 {
		out := make([]models.FiscalReceiptLine, 0)
		remaining := allocAmount
		skipped := paidBefore
		sortIdx := lineStart
		for _, it := range items {
			itemAmt := roundFiscalMoney(it.Amount)
			if itemAmt <= documentMoneyEpsilon {
				continue
			}
			if skipped >= itemAmt-documentMoneyEpsilon {
				skipped = roundFiscalMoney(skipped - itemAmt)
				continue
			}
			itemRemain := roundFiscalMoney(itemAmt - skipped)
			skipped = 0
			lineAmt := itemRemain
			if lineAmt > remaining+documentMoneyEpsilon {
				lineAmt = remaining
			}
			if lineAmt <= documentMoneyEpsilon {
				continue
			}
			desc := documentItemLabel(it)
			if desc == "" {
				desc = "Concepto"
			}
			desc = appendPeriodToDesc(desc, doc)
			out = append(out, newFiscalLineFromAmount(desc, lineAmt, sortIdx))
			sortIdx++
			remaining = roundFiscalMoney(remaining - lineAmt)
			if remaining <= documentMoneyEpsilon {
				break
			}
		}
		if remaining > documentMoneyEpsilon {
			fallback := strings.TrimSpace(payDesc)
			if fallback == "" {
				fallback = strings.TrimSpace(doc.Description)
			}
			if fallback == "" {
				fallback = "Saldo adicional"
			}
			fallback = appendPeriodToDesc(fallback, doc)
			out = append(out, newFiscalLineFromAmount(fallback, remaining, sortIdx))
		}
		return out
	}

	desc := strings.TrimSpace(payDesc)
	if desc == "" {
		desc = strings.TrimSpace(doc.Description)
	}
	if desc == "" {
		desc = "Pago de deuda"
	}
	desc = appendPeriodToDesc(desc, doc)
	return []models.FiscalReceiptLine{newFiscalLineFromAmount(desc, allocAmount, lineStart)}
}

func fiscalLineConceptLabel(ln models.FiscalReceiptLine) string {
	if d := strings.TrimSpace(ln.ProductName); d != "" {
		return d
	}
	return strings.TrimSpace(ln.Description)
}

func paidConceptsFromFiscalLines(lines []models.FiscalReceiptLine) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(lines))
	for _, ln := range lines {
		label := fiscalLineConceptLabel(ln)
		if label == "" {
			continue
		}
		k := strings.ToLower(label)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, label)
	}
	return out
}

func setDebtPaymentContextConcepts(ctx *models.DebtPaymentContext, concepts []string) {
	if ctx == nil {
		return
	}
	ctx.PaidConcepts = concepts
	if len(ctx.PaidConcepts) == 1 {
		ctx.PaidConceptLabel = ctx.PaidConcepts[0]
	} else if len(ctx.PaidConcepts) > 1 {
		ctx.PaidConceptLabel = strings.Join(ctx.PaidConcepts, "; ")
	}
}

func sumLineTotals(lines []models.FiscalReceiptLine) (subtotal, tax, total float64) {
	for _, ln := range lines {
		subtotal += ln.LineSubtotal
		tax += ln.IGVAmount
		total += ln.LineTotal
	}
	return roundFiscalMoney(subtotal), roundFiscalMoney(tax), roundFiscalMoney(total)
}

func uniqueNonEmptyStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		k := strings.ToLower(t)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}

func resolveFiscalReceiptPeriodLabel(rec *models.TukifacFiscalReceipt) string {
	if rec == nil {
		return ""
	}
	if rec.TaxSettlement != nil {
		if pl := strings.TrimSpace(rec.TaxSettlement.PeriodLabel); pl != "" {
			return pl
		}
		if lp := strings.TrimSpace(rec.TaxSettlement.LiquidationPeriod); lp != "" {
			return lp
		}
	}
	if rec.LinkedPayment != nil && rec.LinkedPayment.TaxSettlement != nil {
		st := rec.LinkedPayment.TaxSettlement
		if pl := strings.TrimSpace(st.PeriodLabel); pl != "" {
			return pl
		}
		if lp := strings.TrimSpace(st.LiquidationPeriod); lp != "" {
			return lp
		}
	}
	periods := make([]string, 0)
	if rec.LinkedPayment != nil {
		for _, a := range rec.LinkedPayment.Allocations {
			if p := documentPeriodLabel(a.Document); p != "" {
				periods = append(periods, p)
			}
		}
	}
	periods = uniqueNonEmptyStrings(periods)
	if len(periods) == 0 {
		return ""
	}
	return strings.Join(periods, ", ")
}

func splitPaymentMethodHeader(header string) []string {
	h := strings.TrimSpace(header)
	if h == "" {
		return nil
	}
	if strings.Contains(h, "+") {
		parts := strings.Split(h, "+")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				out = append(out, t)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return []string{h}
}

func syncFiscalReceiptPayments(rec *models.TukifacFiscalReceipt) {
	if rec == nil {
		return
	}
	if len(rec.Payments) > 0 {
		methods := make([]string, 0, len(rec.Payments))
		for _, p := range rec.Payments {
			if m := strings.TrimSpace(p.Method); m != "" {
				methods = append(methods, m)
			}
		}
		methods = uniqueNonEmptyStrings(methods)
		if len(methods) > 0 {
			rec.PaymentMethod = strings.Join(methods, " + ")
		}
		return
	}

	if rec.LinkedPayment != nil {
		m := strings.TrimSpace(rec.LinkedPayment.Method)
		if m != "" {
			rec.PaymentMethod = m
			rec.Payments = []models.FiscalReceiptPayment{{
				SortOrder:       0,
				Method:          m,
				Amount:          rec.Total,
				OperationNumber: strings.TrimSpace(rec.LinkedPayment.Reference),
			}}
			return
		}
	}

	pm := strings.TrimSpace(rec.PaymentMethod)
	if pm == "" {
		return
	}
	parts := splitPaymentMethodHeader(pm)
	if len(parts) > 1 {
		rows := make([]models.FiscalReceiptPayment, 0, len(parts))
		for i, part := range parts {
			rows = append(rows, models.FiscalReceiptPayment{
				SortOrder: i,
				Method:    part,
				Amount:    rec.Total,
			})
		}
		rec.Payments = rows
		return
	}
	rec.Payments = []models.FiscalReceiptPayment{{
		SortOrder: 0,
		Method:    pm,
		Amount:    rec.Total,
	}}
}

// GetFiscalReceiptDetail detalle para PDF / vista (líneas, pagos, empresa, período).
func (s *FiscalReceiptService) GetFiscalReceiptDetail(id uint) (*models.TukifacFiscalReceipt, error) {
	var rec models.TukifacFiscalReceipt
	err := database.DB.
		Preload("Company").
		Preload("TaxSettlement").
		Preload("Lines", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Preload("Payments", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Preload("IssuedByUser").
		Preload("LinkedPayment").
		Preload("LinkedPayment.TaxSettlement").
		Preload("LinkedPayment.Allocations", func(db *gorm.DB) *gorm.DB {
			return db.Order("id ASC")
		}).
		Preload("LinkedPayment.Allocations.Document.Items", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Preload("LinkedPayment.Allocations.Document.Items.Product").
		First(&rec, id).Error
	if err != nil {
		return nil, err
	}

	if len(rec.Lines) == 0 && rec.LinkedPaymentID != nil && *rec.LinkedPaymentID > 0 {
		var pay models.Payment
		if err := database.DB.
			Preload("Allocations", func(db *gorm.DB) *gorm.DB {
				return db.Order("id ASC")
			}).
			Preload("Allocations.Document.Items", func(db *gorm.DB) *gorm.DB {
				return db.Order("sort_order ASC, id ASC")
			}).
			Preload("Allocations.Document.Items.Product").
			Preload("TaxSettlement").
			First(&pay, *rec.LinkedPaymentID).Error; err == nil {
			rec.Lines = buildLinesFromPaymentAllocations(&pay)
			if rec.LinkedPayment == nil {
				rec.LinkedPayment = &pay
			} else if len(rec.LinkedPayment.Allocations) == 0 {
				rec.LinkedPayment.Allocations = pay.Allocations
			}
		}
	}

	if rec.Subtotal == 0 && rec.TaxAmount == 0 && len(rec.Lines) > 0 {
		sub, tax, tot := sumLineTotals(rec.Lines)
		rec.Subtotal = sub
		rec.TaxAmount = tax
		if rec.Total == 0 {
			rec.Total = tot
		}
	}

	syncFiscalReceiptPayments(&rec)
	rec.PeriodLabel = resolveFiscalReceiptPeriodLabel(&rec)
	enrichDebtPaymentContext(&rec)

	return &rec, nil
}

func enrichDebtPaymentContext(rec *models.TukifacFiscalReceipt) {
	if rec == nil || rec.LinkedPayment == nil {
		return
	}
	pay := rec.LinkedPayment
	if len(pay.Allocations) == 0 && pay.DocumentID != nil && *pay.DocumentID > 0 {
		var doc models.Document
		if err := database.DB.
			Preload("Items", func(db *gorm.DB) *gorm.DB {
				return db.Order("sort_order ASC, id ASC")
			}).
			Preload("Items.Product").
			First(&doc, *pay.DocumentID).Error; err != nil {
			return
		}
		paidAcc := DocumentPaidTotal(database.DB, doc.ID)
		balance := DocumentBalance(doc.TotalAmount, paidAcc)
		paidThis := roundFiscalMoney(pay.Amount)
		paidBefore := roundFiscalMoney(paidAcc - paidThis)
		if paidBefore < 0 {
			paidBefore = 0
		}
		ctx := &models.DebtPaymentContext{
			DocumentNumber:    strings.TrimSpace(doc.DisplayNumber),
			DebtTotal:         doc.TotalAmount,
			PaidThisOperation: paidThis,
			PaidAccumulated:   roundFiscalMoney(paidAcc),
			BalancePending:    balance,
		}
		if ctx.DocumentNumber == "" {
			ctx.DocumentNumber = strings.TrimSpace(doc.Number)
		}
		setDebtPaymentStatusLabel(ctx)
		concepts := paidConceptsFromFiscalLines(rec.Lines)
		if len(concepts) == 0 {
			chunk := buildLinesFromDocumentAllocation(&doc, paidThis, paidBefore, strings.TrimSpace(pay.Description), 0)
			concepts = paidConceptsFromFiscalLines(chunk)
		}
		setDebtPaymentContextConcepts(ctx, concepts)
		rec.DebtPaymentContext = ctx
		attachDebtPaymentConcepts(rec)
		return
	}
	if len(pay.Allocations) == 0 {
		return
	}
	// Resumen del primer documento con saldo o el primero imputado.
	var primary *models.PaymentAllocation
	for i := range pay.Allocations {
		a := &pay.Allocations[i]
		if a.Document == nil || a.DocumentID == 0 {
			continue
		}
		if primary == nil {
			primary = a
		}
		paidAcc := DocumentPaidTotal(database.DB, a.DocumentID)
		if DocumentBalance(a.Document.TotalAmount, paidAcc) > documentMoneyEpsilon {
			primary = a
			break
		}
	}
	if primary == nil || primary.Document == nil {
		return
	}
	doc := primary.Document
	paidAcc := DocumentPaidTotal(database.DB, doc.ID)
	balance := DocumentBalance(doc.TotalAmount, paidAcc)
	paidThis := roundFiscalMoney(primary.Amount)
	ctx := &models.DebtPaymentContext{
		DocumentNumber:    strings.TrimSpace(doc.DisplayNumber),
		DebtTotal:         doc.TotalAmount,
		PaidThisOperation: paidThis,
		PaidAccumulated:   roundFiscalMoney(paidAcc),
		BalancePending:    balance,
	}
	if ctx.DocumentNumber == "" {
		ctx.DocumentNumber = strings.TrimSpace(doc.Number)
	}
	setDebtPaymentStatusLabel(ctx)
	concepts := paidConceptsFromFiscalLines(rec.Lines)
	if len(concepts) == 0 {
		paidBefore := roundFiscalMoney(paidAcc - paidThis)
		if paidBefore < 0 {
			paidBefore = 0
		}
		chunk := buildLinesFromDocumentAllocation(doc, paidThis, paidBefore, strings.TrimSpace(pay.Description), 0)
		concepts = paidConceptsFromFiscalLines(chunk)
	}
	setDebtPaymentContextConcepts(ctx, concepts)
	rec.DebtPaymentContext = ctx
	attachDebtPaymentConcepts(rec)
}

func attachDebtPaymentConcepts(rec *models.TukifacFiscalReceipt) {
	if rec == nil || rec.DebtPaymentContext == nil || len(rec.Lines) == 0 {
		return
	}
	concepts := paidConceptsFromFiscalLines(rec.Lines)
	if len(concepts) == 0 {
		return
	}
	setDebtPaymentContextConcepts(rec.DebtPaymentContext, concepts)
}

func setDebtPaymentStatusLabel(ctx *models.DebtPaymentContext) {
	if ctx == nil {
		return
	}
	if ctx.BalancePending <= documentMoneyEpsilon {
		ctx.IsPartialPayment = false
		ctx.StatusLabel = "DEUDA CANCELADA"
		return
	}
	ctx.IsPartialPayment = true
	ctx.StatusLabel = "PAGO PARCIAL"
}
