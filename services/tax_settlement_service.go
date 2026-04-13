package services

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"miappfiber/database"
	"miappfiber/models"

	"gorm.io/gorm"
)

type TaxSettlementService struct{}

func NewTaxSettlementService() *TaxSettlementService {
	return &TaxSettlementService{}
}

type SettlementPreviewLine struct {
	DocumentID uint    `json:"document_id"`
	Concept    string  `json:"concept"`
	Amount     float64 `json:"amount"`
	IssueDate  string  `json:"issue_date"`
	Status     string  `json:"status"`
}

func documentPreviewConcept(d models.Document) string {
	concept := strings.TrimSpace(d.Description)
	if len(d.Items) == 0 {
		return concept
	}
	parts := make([]string, 0, len(d.Items))
	for _, it := range d.Items {
		if t := strings.TrimSpace(it.Description); t != "" {
			parts = append(parts, t)
		}
	}
	if len(parts) == 0 {
		return concept
	}
	joined := strings.Join(parts, " · ")
	if len(joined) > 480 {
		return joined[:480] + "…"
	}
	return joined
}

func (s *TaxSettlementService) PreviewOpenDocuments(companyID uint, asOf *time.Time) ([]SettlementPreviewLine, error) {
	var docs []models.Document
	q := database.DB.Where("company_id = ? AND status IN ?", companyID, []string{"pendiente", "parcial"}).
		Preload("Items", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Order("issue_date ASC, id ASC")
	if err := q.Find(&docs).Error; err != nil {
		return nil, err
	}
	out := make([]SettlementPreviewLine, 0, len(docs))
	for _, d := range docs {
		paid := DocumentPaidTotal(database.DB, d.ID)
		bal := d.TotalAmount - paid
		if bal <= 0.005 {
			continue
		}
		if asOf != nil && d.IssueDate.After(*asOf) {
			continue
		}
		out = append(out, SettlementPreviewLine{
			DocumentID: d.ID,
			Concept:    documentPreviewConcept(d),
			Amount:     math.Round(bal*100) / 100,
			IssueDate:  d.IssueDate.Format("2006-01-02"),
			Status:     d.Status,
		})
	}
	return out, nil
}

type TaxSettlementLineInput struct {
	LineType   string   `json:"line_type"`
	DocumentID *uint    `json:"document_id"`
	ProductID  *uint    `json:"product_id"`
	Concept    string   `json:"concept"`
	Amount     float64  `json:"amount"`
	SortOrder  int      `json:"sort_order"`
}

type TaxSettlementCreateInput struct {
	CompanyID   uint                   `json:"company_id"`
	IssueDate   time.Time              `json:"issue_date"`
	PeriodLabel string                 `json:"period_label"`
	PeriodFrom  *time.Time             `json:"period_from"`
	PeriodTo    *time.Time             `json:"period_to"`
	Notes       string                 `json:"notes"`
	Pdt621JSON  string                 `json:"pdt621_json"`
	Lines       []TaxSettlementLineInput `json:"lines"`
}

func (s *TaxSettlementService) validateLine(in TaxSettlementLineInput) error {
	switch in.LineType {
	case models.TaxSettlementLineDocRef, models.TaxSettlementLineTaxManual, models.TaxSettlementLineAdjust:
	default:
		return fmt.Errorf("line_type inválido: %s", in.LineType)
	}
	if strings.TrimSpace(in.Concept) == "" {
		return errors.New("cada línea requiere concepto")
	}
	if in.Amount < 0 {
		return errors.New("monto de línea no puede ser negativo")
	}
	if in.LineType == models.TaxSettlementLineDocRef && (in.DocumentID == nil || *in.DocumentID == 0) {
		return errors.New("línea document_ref requiere document_id")
	}
	return nil
}

func (s *TaxSettlementService) CreateDraft(in TaxSettlementCreateInput) (*models.TaxSettlement, error) {
	if in.CompanyID == 0 {
		return nil, errors.New("company_id requerido")
	}
	if len(in.Lines) == 0 {
		return nil, errors.New("agregue al menos una línea")
	}
	ts := models.TaxSettlement{
		CompanyID:   in.CompanyID,
		Status:      models.TaxSettlementStatusDraft,
		Notes:       in.Notes,
		Pdt621JSON:  in.Pdt621JSON,
		PeriodLabel: strings.TrimSpace(in.PeriodLabel),
		PeriodFrom:  in.PeriodFrom,
		PeriodTo:    in.PeriodTo,
	}
	if in.IssueDate.IsZero() {
		ts.IssueDate = time.Now()
	} else {
		ts.IssueDate = in.IssueDate
	}
	lines := make([]models.TaxSettlementLine, 0, len(in.Lines))
	for i, li := range in.Lines {
		if err := s.validateLine(li); err != nil {
			return nil, err
		}
		if li.LineType == models.TaxSettlementLineDocRef {
			var d models.Document
			if err := database.DB.First(&d, *li.DocumentID).Error; err != nil {
				return nil, err
			}
			if d.CompanyID != in.CompanyID {
				return nil, errors.New("el documento no pertenece a la empresa de la liquidación")
			}
		}
		order := li.SortOrder
		if order == 0 {
			order = i
		}
		lines = append(lines, models.TaxSettlementLine{
			LineType:   li.LineType,
			DocumentID: li.DocumentID,
			ProductID:  li.ProductID,
			Concept:    strings.TrimSpace(li.Concept),
			Amount:     li.Amount,
			SortOrder:  order,
		})
	}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&ts).Error; err != nil {
			return err
		}
		for i := range lines {
			lines[i].TaxSettlementID = ts.ID
		}
		if err := tx.Create(&lines).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetByID(ts.ID)
}

type TaxSettlementUpdateInput struct {
	IssueDate   time.Time              `json:"issue_date"`
	PeriodLabel string                 `json:"period_label"`
	PeriodFrom  *time.Time             `json:"period_from"`
	PeriodTo    *time.Time             `json:"period_to"`
	Notes       string                 `json:"notes"`
	Pdt621JSON  string                 `json:"pdt621_json"`
	Lines       []TaxSettlementLineInput `json:"lines"`
}

func (s *TaxSettlementService) UpdateDraft(id uint, in TaxSettlementUpdateInput) (*models.TaxSettlement, error) {
	var ts models.TaxSettlement
	if err := database.DB.First(&ts, id).Error; err != nil {
		return nil, err
	}
	if ts.Status != models.TaxSettlementStatusDraft {
		return nil, errors.New("solo se puede editar una liquidación en borrador")
	}
	if len(in.Lines) == 0 {
		return nil, errors.New("agregue al menos una línea")
	}
	if !in.IssueDate.IsZero() {
		ts.IssueDate = in.IssueDate
	}
	ts.PeriodLabel = strings.TrimSpace(in.PeriodLabel)
	ts.PeriodFrom = in.PeriodFrom
	ts.PeriodTo = in.PeriodTo
	ts.Notes = in.Notes
	ts.Pdt621JSON = in.Pdt621JSON

	lines := make([]models.TaxSettlementLine, 0, len(in.Lines))
	for i, li := range in.Lines {
		if err := s.validateLine(li); err != nil {
			return nil, err
		}
		if li.LineType == models.TaxSettlementLineDocRef {
			var d models.Document
			if err := database.DB.First(&d, *li.DocumentID).Error; err != nil {
				return nil, err
			}
			if d.CompanyID != ts.CompanyID {
				return nil, errors.New("el documento no pertenece a la empresa de la liquidación")
			}
		}
		order := li.SortOrder
		if order == 0 {
			order = i
		}
		lines = append(lines, models.TaxSettlementLine{
			TaxSettlementID: ts.ID,
			LineType:        li.LineType,
			DocumentID:      li.DocumentID,
			ProductID:       li.ProductID,
			Concept:         strings.TrimSpace(li.Concept),
			Amount:          li.Amount,
			SortOrder:       order,
		})
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.TaxSettlementLine{}).Where("tax_settlement_id = ?", ts.ID).Delete(&models.TaxSettlementLine{}).Error; err != nil {
			return err
		}
		if err := tx.Save(&ts).Error; err != nil {
			return err
		}
		if err := tx.Create(&lines).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

func (s *TaxSettlementService) GetByID(id uint) (*models.TaxSettlement, error) {
	var ts models.TaxSettlement
	if err := database.DB.Preload("Company").Preload("Lines", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order ASC, id ASC")
	}).First(&ts, id).Error; err != nil {
		return nil, err
	}
	return &ts, nil
}

type TaxSettlementListParams struct {
	CompanyID         uint
	Status            string
	AllowedCompanyIDs []uint
	Page              int
	PerPage           int
}

func (s *TaxSettlementService) ListPaged(params TaxSettlementListParams) ([]models.TaxSettlement, int64, error) {
	page := params.Page
	if page <= 0 {
		page = 1
	}
	perPage := params.PerPage
	if perPage <= 0 {
		perPage = 20
	}
	if perPage > 200 {
		perPage = 200
	}
	q := database.DB.Model(&models.TaxSettlement{})
	if params.AllowedCompanyIDs != nil {
		if len(params.AllowedCompanyIDs) == 0 {
			return []models.TaxSettlement{}, 0, nil
		}
		q = q.Where("company_id IN ?", params.AllowedCompanyIDs)
	}
	if params.CompanyID > 0 {
		q = q.Where("company_id = ?", params.CompanyID)
	}
	if st := strings.TrimSpace(params.Status); st != "" {
		q = q.Where("status = ?", st)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []models.TaxSettlement
	err := q.Preload("Company").
		Order("issue_date DESC, id DESC").
		Limit(perPage).
		Offset((page - 1) * perPage).
		Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func (s *TaxSettlementService) Emit(id uint) (*models.TaxSettlement, error) {
	var ts models.TaxSettlement
	if err := database.DB.Preload("Lines").First(&ts, id).Error; err != nil {
		return nil, err
	}
	if ts.Status != models.TaxSettlementStatusDraft {
		return nil, errors.New("solo se puede emitir una liquidación en borrador")
	}
	var th, tm, tg float64
	for _, ln := range ts.Lines {
		switch ln.LineType {
		case models.TaxSettlementLineDocRef, models.TaxSettlementLineAdjust:
			th += ln.Amount
		case models.TaxSettlementLineTaxManual:
			tm += ln.Amount
		}
	}
	tg = th + tm
	ts.Status = models.TaxSettlementStatusIssued
	ts.Number = fmt.Sprintf("LI-%s-%06d", ts.IssueDate.Format("20060102"), ts.ID)
	ts.TotalHonorarios = math.Round(th*100) / 100
	ts.TotalImpuestos = math.Round(tm*100) / 100
	ts.TotalGeneral = math.Round(tg*100) / 100
	if err := database.DB.Save(&ts).Error; err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

// PaymentSuggestionLine imputación sugerida desde líneas document_ref de la liquidación (monto = min(snapshot, saldo vivo)).
type PaymentSuggestionLine struct {
	DocumentID           uint    `json:"document_id"`
	Amount               float64 `json:"amount"`
	Concept              string  `json:"concept"`
	SettlementLineAmount float64 `json:"settlement_line_amount"`
	DocumentNumber       string  `json:"document_number"`
}

// PaymentSuggestionsResult respuesta para precargar el formulario de pago.
type PaymentSuggestionsResult struct {
	TaxSettlementID  uint                  `json:"tax_settlement_id"`
	SettlementNumber   string                `json:"settlement_number"`
	CompanyID          uint                  `json:"company_id"`
	Status             string                `json:"status"`
	Lines              []PaymentSuggestionLine `json:"lines"`
	SuggestedTotal     float64               `json:"suggested_total"`
}

func (s *TaxSettlementService) PaymentSuggestions(settlementID uint) (*PaymentSuggestionsResult, error) {
	ts, err := s.GetByID(settlementID)
	if err != nil {
		return nil, err
	}
	out := &PaymentSuggestionsResult{
		TaxSettlementID: ts.ID,
		SettlementNumber: strings.TrimSpace(ts.Number),
		CompanyID:       ts.CompanyID,
		Status:          ts.Status,
		Lines:           []PaymentSuggestionLine{},
	}
	for _, ln := range ts.Lines {
		if ln.LineType != models.TaxSettlementLineDocRef || ln.DocumentID == nil {
			continue
		}
		var d models.Document
		if err := database.DB.First(&d, *ln.DocumentID).Error; err != nil {
			continue
		}
		if d.CompanyID != ts.CompanyID {
			continue
		}
		if d.Status == "anulado" {
			continue
		}
		bal := d.TotalAmount - DocumentPaidTotal(database.DB, d.ID)
		if bal < 0.005 {
			continue
		}
		sug := ln.Amount
		if sug > bal+1e-9 {
			sug = bal
		}
		if sug < 0.005 {
			continue
		}
		sug = math.Round(sug*100) / 100
		out.Lines = append(out.Lines, PaymentSuggestionLine{
			DocumentID:           *ln.DocumentID,
			Amount:               sug,
			Concept:              strings.TrimSpace(ln.Concept),
			SettlementLineAmount: ln.Amount,
			DocumentNumber:       strings.TrimSpace(d.Number),
		})
		out.SuggestedTotal += sug
	}
	out.SuggestedTotal = math.Round(out.SuggestedTotal*100) / 100
	return out, nil
}
