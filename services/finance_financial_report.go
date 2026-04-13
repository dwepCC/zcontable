package services

import (
	"math"
	"time"

	"miappfiber/database"
	"miappfiber/models"
)

// FinancialReportParams filtros para el reporte financiero por empresa.
type FinancialReportParams struct {
	DateFrom          *time.Time
	DateToExclusive   *time.Time // issue_date / pago date < este instante
	CompanyID         uint
	MinOverdueMonths  int // 0 = sin filtro; >= N muestra empresas con al menos N meses de retraso en deudas vencidas
	AllowedCompanyIDs []uint
	IsAdmin           bool
}

// FinancialCompanyReportRow una fila del reporte financiero.
type FinancialCompanyReportRow struct {
	Company          models.Company `json:"company"`
	TotalDocuments   float64        `json:"total_documents"`
	TotalPayments    float64        `json:"total_payments"`
	Balance          float64        `json:"balance"`
	MaxOverdueMonths int            `json:"max_overdue_months"`
	HasOverdue       bool           `json:"has_overdue"`
}

// monthsOverdueCalendar meses completos de calendario desde la fecha de vencimiento hasta hoy (deuda vencida).
func monthsOverdueCalendar(due time.Time, now time.Time) int {
	loc := now.Location()
	dueDay := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, loc)
	nowDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if !dueDay.Before(nowDay) {
		return 0
	}
	y1, m1, d1 := dueDay.Date()
	y2, m2, d2 := nowDay.Date()
	months := (y2-y1)*12 + int(m2-m1)
	if d2 < d1 {
		months--
	}
	if months < 0 {
		return 0
	}
	return months
}

// MaxOverdueMonthsForCompany meses máximos de retraso en documentos pendientes/parciales con saldo y vencimiento pasado.
func (s *FinanceService) MaxOverdueMonthsForCompany(companyID uint) (int, bool) {
	var docs []models.Document
	if err := database.DB.Where("company_id = ? AND status IN ?", companyID, []string{"pendiente", "parcial"}).Find(&docs).Error; err != nil {
		return 0, false
	}
	now := time.Now()
	maxM := 0
	hasOverdue := false
	for _, d := range docs {
		if d.DueDate == nil || d.DueDate.IsZero() {
			continue
		}
		bal := d.TotalAmount - DocumentPaidTotal(database.DB, d.ID)
		if bal <= 0.005 {
			continue
		}
		due := *d.DueDate
		m := monthsOverdueCalendar(due, now)
		if m > 0 {
			hasOverdue = true
		}
		if m > maxM {
			maxM = m
		}
	}
	return maxM, hasOverdue
}

func companyTotalsForReport(companyID uint, dateFrom, dateToExclusive *time.Time) (totalDocs, totalPays float64) {
	dq := database.DB.Model(&models.Document{}).Where("company_id = ? AND status <> ?", companyID, "anulado")
	if dateFrom != nil {
		dq = dq.Where("issue_date >= ?", *dateFrom)
	}
	if dateToExclusive != nil {
		dq = dq.Where("issue_date < ?", *dateToExclusive)
	}
	dq.Select("COALESCE(SUM(total_amount),0)").Scan(&totalDocs)

	pq := database.DB.Model(&models.Payment{}).Where("company_id = ?", companyID)
	if dateFrom != nil {
		pq = pq.Where("date >= ?", *dateFrom)
	}
	if dateToExclusive != nil {
		pq = pq.Where("date < ?", *dateToExclusive)
	}
	pq.Select("COALESCE(SUM(amount),0)").Scan(&totalPays)
	return
}

// GetFinancialReportRows totales por empresa (opcionalmente por rango de fechas) y meses máximos de mora en deudas con saldo.
func (s *FinanceService) GetFinancialReportRows(p FinancialReportParams) (rows []FinancialCompanyReportRow, grandDocs, grandPays, grandBal float64, err error) {
	var companies []models.Company
	q := database.DB.Order("business_name ASC")
	if !p.IsAdmin {
		if len(p.AllowedCompanyIDs) == 0 {
			return nil, 0, 0, 0, nil
		}
		q = q.Where("id IN ?", p.AllowedCompanyIDs)
	}
	if p.CompanyID > 0 {
		q = q.Where("id = ?", p.CompanyID)
	}
	if err = q.Find(&companies).Error; err != nil {
		return nil, 0, 0, 0, err
	}

	rows = make([]FinancialCompanyReportRow, 0, len(companies))
	for _, cpy := range companies {
		td, tp := companyTotalsForReport(cpy.ID, p.DateFrom, p.DateToExclusive)
		td = math.Round(td*100) / 100
		tp = math.Round(tp*100) / 100
		bal := math.Round((td-tp)*100) / 100

		maxOverdue, hasOvd := s.MaxOverdueMonthsForCompany(cpy.ID)
		if p.MinOverdueMonths > 0 && maxOverdue < p.MinOverdueMonths {
			continue
		}

		rows = append(rows, FinancialCompanyReportRow{
			Company:          cpy,
			TotalDocuments:   td,
			TotalPayments:    tp,
			Balance:          bal,
			MaxOverdueMonths: maxOverdue,
			HasOverdue:       hasOvd,
		})
		grandDocs += td
		grandPays += tp
		grandBal += bal
	}
	grandDocs = math.Round(grandDocs*100) / 100
	grandPays = math.Round(grandPays*100) / 100
	grandBal = math.Round(grandBal*100) / 100
	return rows, grandDocs, grandPays, grandBal, nil
}
