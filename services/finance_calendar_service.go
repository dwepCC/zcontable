package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"miappfiber/database"
	"miappfiber/models"

	"gorm.io/gorm"
)

type FinanceCalendarService struct{}

func NewFinanceCalendarService() *FinanceCalendarService {
	return &FinanceCalendarService{}
}

func validCalendarPeriodYM(ym string) bool {
	ym = strings.TrimSpace(ym)
	if len(ym) != 7 || ym[4] != '-' {
		return false
	}
	var y, m int
	if _, err := fmt.Sscanf(ym, "%d-%d", &y, &m); err != nil {
		return false
	}
	return y >= 2000 && m >= 1 && m <= 12
}

func dueDateForActivity(periodYM string, dueDay int) (time.Time, error) {
	if !validCalendarPeriodYM(periodYM) {
		return time.Time{}, errors.New("período inválido")
	}
	var y, m int
	_, _ = fmt.Sscanf(periodYM, "%d-%d", &y, &m)
	lastDay := time.Date(y, time.Month(m+1), 0, 0, 0, 0, 0, time.Local).Day()
	if dueDay < 1 {
		dueDay = 1
	}
	if dueDay > lastDay {
		dueDay = lastDay
	}
	return time.Date(y, time.Month(m), dueDay, 0, 0, 0, 0, time.Local), nil
}

// TrafficLight verde | amarillo | rojo según cercanía al vencimiento.
func TrafficLight(due time.Time, completed bool) string {
	if completed {
		return "verde"
	}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	d := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.Local)
	if d.Before(today) {
		return "rojo"
	}
	diff := int(d.Sub(today).Hours() / 24)
	if diff <= 3 {
		return "amarillo"
	}
	return "verde"
}

type FinanceCalendarActivityDTO struct {
	models.FinanceCalendarActivity
	DueDate      string `json:"due_date"`
	TrafficLight string `json:"traffic_light"`
}

type FinanceCalendarDetail struct {
	models.FinanceCalendar
	Activities []FinanceCalendarActivityDTO `json:"activities"`
}

type CalendarComplianceCompany struct {
	CompanyID     uint   `json:"company_id"`
	CompanyName   string `json:"company_name"`
	CompanyRUC    string `json:"company_ruc"`
	ControlID     uint   `json:"control_id,omitempty"`
	Status        string `json:"status"`
	TrafficLight  string `json:"traffic_light"`
	Detail        string `json:"detail,omitempty"`
}

type CalendarComplianceSummary struct {
	ActivityID   uint                        `json:"activity_id"`
	ActivityName string                      `json:"activity_name"`
	DueDate      string                      `json:"due_date"`
	TrafficLight string                      `json:"traffic_light"`
	Total        int64                       `json:"total"`
	Completed    int64                       `json:"completed"`
	Pending      int64                       `json:"pending"`
	Overdue      int64                       `json:"overdue"`
	Companies    []CalendarComplianceCompany `json:"companies"`
}

func (s *FinanceCalendarService) ListCalendars() ([]models.FinanceCalendar, error) {
	var rows []models.FinanceCalendar
	err := database.DB.Order("period_ym DESC").Find(&rows).Error
	return rows, err
}

func (s *FinanceCalendarService) GetCalendarDetail(periodYM string) (*FinanceCalendarDetail, error) {
	periodYM = strings.TrimSpace(periodYM)
	var cal models.FinanceCalendar
	if err := database.DB.Where("period_ym = ?", periodYM).First(&cal).Error; err != nil {
		return nil, errors.New("calendario no encontrado")
	}
	var marks []models.FinanceCalendarMark
	_ = database.DB.Where("calendar_id = ?", cal.ID).Order("mark_date ASC").Find(&marks).Error
	cal.Marks = marks

	var acts []models.FinanceCalendarActivity
	if err := database.DB.Where("calendar_id = ?", cal.ID).Order("due_day ASC, id ASC").Find(&acts).Error; err != nil {
		return nil, err
	}

	out := &FinanceCalendarDetail{FinanceCalendar: cal, Activities: make([]FinanceCalendarActivityDTO, 0, len(acts))}
	for _, a := range acts {
		due, _ := dueDateForActivity(cal.PeriodYM, a.DueDay)
		out.Activities = append(out.Activities, FinanceCalendarActivityDTO{
			FinanceCalendarActivity: a,
			DueDate:               due.Format("2006-01-02"),
			TrafficLight:          TrafficLight(due, false),
		})
	}
	return out, nil
}

func (s *FinanceCalendarService) CreateCalendar(periodYM, notes string) (*models.FinanceCalendar, error) {
	periodYM = strings.TrimSpace(periodYM)
	if !validCalendarPeriodYM(periodYM) {
		return nil, errors.New("período inválido (YYYY-MM)")
	}
	var n int64
	if err := database.DB.Model(&models.FinanceCalendar{}).Where("period_ym = ?", periodYM).Count(&n).Error; err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, errors.New("ya existe calendario para ese mes")
	}
	cal := models.FinanceCalendar{PeriodYM: periodYM, Notes: strings.TrimSpace(notes)}
	if err := database.DB.Create(&cal).Error; err != nil {
		return nil, err
	}
	return &cal, nil
}

func (s *FinanceCalendarService) UpdateCalendarNotes(id uint, notes string) (*models.FinanceCalendar, error) {
	var cal models.FinanceCalendar
	if err := database.DB.First(&cal, id).Error; err != nil {
		return nil, errors.New("calendario no encontrado")
	}
	cal.Notes = strings.TrimSpace(notes)
	if err := database.DB.Save(&cal).Error; err != nil {
		return nil, err
	}
	return &cal, nil
}

func (s *FinanceCalendarService) DeleteCalendar(id uint) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("calendar_id = ?", id).Delete(&models.FinanceCalendarMark{}).Error; err != nil {
			return err
		}
		if err := tx.Where("calendar_id = ?", id).Delete(&models.FinanceCalendarActivity{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.FinanceCalendar{}, id).Error
	})
}

func (s *FinanceCalendarService) DuplicateCalendar(fromYM, toYM string) (*models.FinanceCalendar, error) {
	fromYM = strings.TrimSpace(fromYM)
	toYM = strings.TrimSpace(toYM)
	if !validCalendarPeriodYM(fromYM) || !validCalendarPeriodYM(toYM) {
		return nil, errors.New("período inválido")
	}
	if fromYM == toYM {
		return nil, errors.New("el período destino debe ser distinto")
	}
	var src models.FinanceCalendar
	if err := database.DB.Where("period_ym = ?", fromYM).First(&src).Error; err != nil {
		return nil, errors.New("calendario origen no encontrado")
	}
	created, err := s.CreateCalendar(toYM, "Copiado desde "+fromYM)
	if err != nil && !strings.Contains(err.Error(), "ya existe") {
		return nil, err
	}
	if err != nil {
		var existing models.FinanceCalendar
		if e := database.DB.Where("period_ym = ?", toYM).First(&existing).Error; e != nil {
			return nil, err
		}
		_ = s.DeleteCalendar(existing.ID)
		created, err = s.CreateCalendar(toYM, "Copiado desde "+fromYM)
		if err != nil {
			return nil, err
		}
	}

	var marks []models.FinanceCalendarMark
	_ = database.DB.Where("calendar_id = ?", src.ID).Find(&marks).Error
	for _, m := range marks {
		var y, mo int
		_, _ = fmt.Sscanf(toYM, "%d-%d", &y, &mo)
		d := m.MarkDate
		nd := time.Date(y, time.Month(mo), d.Day(), 0, 0, 0, 0, time.Local)
		last := time.Date(y, time.Month(mo+1), 0, 0, 0, 0, 0, time.Local).Day()
		if nd.Day() > last {
			nd = time.Date(y, time.Month(mo), last, 0, 0, 0, 0, time.Local)
		}
		_ = database.DB.Create(&models.FinanceCalendarMark{
			CalendarID: created.ID, MarkDate: nd, Kind: m.Kind, Label: m.Label,
		}).Error
	}

	var acts []models.FinanceCalendarActivity
	_ = database.DB.Where("calendar_id = ?", src.ID).Find(&acts).Error
	for _, a := range acts {
		_ = database.DB.Create(&models.FinanceCalendarActivity{
			CalendarID: created.ID, Name: a.Name, Description: a.Description,
			DueDay: a.DueDay, ActivityKind: a.ActivityKind, Priority: a.Priority,
		}).Error
	}
	return created, nil
}

type CalendarMarkInput struct {
	MarkDate time.Time
	Kind     string
	Label    string
}

func (s *FinanceCalendarService) UpsertMark(calendarID uint, in CalendarMarkInput) (*models.FinanceCalendarMark, error) {
	if in.Label == "" {
		return nil, errors.New("etiqueta requerida")
	}
	kind := strings.TrimSpace(in.Kind)
	if kind == "" {
		kind = models.CalendarMarkImportant
	}
	m := models.FinanceCalendarMark{
		CalendarID: calendarID,
		MarkDate:   in.MarkDate,
		Kind:       kind,
		Label:      strings.TrimSpace(in.Label),
	}
	if err := database.DB.Create(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *FinanceCalendarService) DeleteMark(id uint) error {
	return database.DB.Delete(&models.FinanceCalendarMark{}, id).Error
}

type CalendarActivityInput struct {
	Name         string
	Description  string
	DueDay       int
	ActivityKind string
	Priority     string
}

func (s *FinanceCalendarService) CreateActivity(calendarID uint, in CalendarActivityInput) (*models.FinanceCalendarActivity, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, errors.New("nombre requerido")
	}
	if in.DueDay < 1 || in.DueDay > 31 {
		return nil, errors.New("día límite inválido (1-31)")
	}
	kind := strings.TrimSpace(in.ActivityKind)
	if kind == "" {
		kind = models.CalendarActivityOther
	}
	pri := strings.TrimSpace(in.Priority)
	if pri == "" {
		pri = models.SupervisorPriorityMedia
	}
	a := models.FinanceCalendarActivity{
		CalendarID: calendarID, Name: strings.TrimSpace(in.Name),
		Description: strings.TrimSpace(in.Description), DueDay: in.DueDay,
		ActivityKind: kind, Priority: pri,
	}
	if err := database.DB.Create(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *FinanceCalendarService) UpdateActivity(id uint, in CalendarActivityInput) (*models.FinanceCalendarActivity, error) {
	var a models.FinanceCalendarActivity
	if err := database.DB.First(&a, id).Error; err != nil {
		return nil, errors.New("actividad no encontrada")
	}
	if strings.TrimSpace(in.Name) != "" {
		a.Name = strings.TrimSpace(in.Name)
	}
	a.Description = strings.TrimSpace(in.Description)
	if in.DueDay >= 1 && in.DueDay <= 31 {
		a.DueDay = in.DueDay
	}
	if strings.TrimSpace(in.ActivityKind) != "" {
		a.ActivityKind = strings.TrimSpace(in.ActivityKind)
	}
	if strings.TrimSpace(in.Priority) != "" {
		a.Priority = strings.TrimSpace(in.Priority)
	}
	if err := database.DB.Save(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *FinanceCalendarService) DeleteActivity(id uint) error {
	return database.DB.Delete(&models.FinanceCalendarActivity{}, id).Error
}

func declarationComplete(status string) bool {
	return status == models.SupervisorDeclAprobado ||
		status == models.SupervisorDeclPresentado ||
		status == models.SupervisorDeclCerrado
}

func (s *FinanceCalendarService) companyCompliance(
	periodYM string,
	companyID uint,
	kind string,
	due time.Time,
) (status string, detail string) {
	var ctrl models.SupervisorMonthlyControl
	err := database.DB.Where("company_id = ? AND period_ym = ?", companyID, periodYM).First(&ctrl).Error
	if err != nil {
		return "sin_control", "Sin control mensual en el período"
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	d := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.Local)
	markOverdue := func() string {
		if d.Before(today) {
			return "vencida"
		}
		return "pendiente"
	}

	switch kind {
	case models.CalendarActivityPDT601, models.CalendarActivityPDT621, models.CalendarActivitySIRE:
		var decl models.SupervisorDeclaration
		if err := database.DB.Where("monthly_control_id = ? AND declaration_type = ?", ctrl.ID, kind).
			First(&decl).Error; err != nil {
			return markOverdue(), "Declaración no encontrada"
		}
		if declarationComplete(decl.Status) {
			return "completada", declarationStatusLabel(decl.Status)
		}
		return markOverdue(), declarationStatusLabel(decl.Status)

	case models.CalendarActivityNPS:
		var total int64
		_ = database.DB.Model(&models.SupervisorNPS{}).Where("monthly_control_id = ?", ctrl.ID).Count(&total).Error
		if total == 0 {
			return markOverdue(), "Sin NPS registrados"
		}
		var done int64
		_ = database.DB.Model(&models.SupervisorNPS{}).
			Where("monthly_control_id = ? AND payment_status NOT IN ?", ctrl.ID,
				[]string{models.SupervisorNPSPendienteGenerar}).
			Count(&done).Error
		if done > 0 {
			return "completada", "NPS generado o en gestión"
		}
		return markOverdue(), "NPS pendiente de generar"

	case models.CalendarActivityPayment:
		var pending int64
		_ = database.DB.Model(&models.SupervisorNPS{}).
			Where("monthly_control_id = ? AND payment_status IN ?", ctrl.ID,
				[]string{models.SupervisorNPSPendientePago, models.SupervisorNPSVencido, models.SupervisorNPSPendienteGenerar, models.SupervisorNPSGenerado, models.SupervisorNPSEnviadoCliente}).
			Count(&pending).Error
		if pending == 0 {
			var any int64
			_ = database.DB.Model(&models.SupervisorNPS{}).Where("monthly_control_id = ?", ctrl.ID).Count(&any).Error
			if any == 0 {
				return markOverdue(), "Sin NPS"
			}
			return "completada", "Pagos al día"
		}
		return markOverdue(), "Pagos pendientes"

	case models.CalendarActivityLiquidation:
		var liq models.SupervisorTaxLiquidation
		if err := database.DB.Where("monthly_control_id = ?", ctrl.ID).First(&liq).Error; err != nil {
			return markOverdue(), "Sin liquidación"
		}
		if liq.ValidationStatus == models.SupervisorLiqAprobada {
			return "completada", "Liquidación aprobada"
		}
		return markOverdue(), liq.ValidationStatus

	case models.CalendarActivityClosing:
		if ctrl.GeneralStatus == models.SupervisorControlCerrado || ctrl.GeneralStatus == models.SupervisorControlAlDia {
			return "completada", ctrl.GeneralStatus
		}
		return markOverdue(), ctrl.GeneralStatus

	default:
		return markOverdue(), "Seguimiento manual"
	}
}

func declarationStatusLabel(st string) string {
	m := map[string]string{
		models.SupervisorDeclPendiente: "Pendiente", models.SupervisorDeclEnElaboracion: "En elaboración",
		models.SupervisorDeclEnRevision: "En revisión", models.SupervisorDeclObservado: "Observado",
		models.SupervisorDeclAprobado: "Aprobado", models.SupervisorDeclPresentado: "Presentado",
		models.SupervisorDeclCerrado: "Cerrado",
	}
	if v, ok := m[st]; ok {
		return v
	}
	return st
}

func (s *FinanceCalendarService) ActivityCompliance(activityID uint, periodYM string, companyIDs []uint) (*CalendarComplianceSummary, error) {
	var act models.FinanceCalendarActivity
	if err := database.DB.First(&act, activityID).Error; err != nil {
		return nil, errors.New("actividad no encontrada")
	}
	var cal models.FinanceCalendar
	if err := database.DB.First(&cal, act.CalendarID).Error; err != nil {
		return nil, errors.New("calendario no encontrado")
	}
	if periodYM == "" {
		periodYM = cal.PeriodYM
	}
	due, err := dueDateForActivity(periodYM, act.DueDay)
	if err != nil {
		return nil, err
	}

	q := database.DB.Model(&models.Company{}).Where("status = ?", "activo")
	if len(companyIDs) > 0 {
		q = q.Where("id IN ?", companyIDs)
	}
	var companies []models.Company
	if err := q.Order("business_name ASC").Find(&companies).Error; err != nil {
		return nil, err
	}

	summary := &CalendarComplianceSummary{
		ActivityID: activityID, ActivityName: act.Name,
		DueDate: due.Format("2006-01-02"), Companies: make([]CalendarComplianceCompany, 0, len(companies)),
	}

	for _, co := range companies {
		st, detail := s.companyCompliance(periodYM, co.ID, act.ActivityKind, due)
		var ctrlID uint
		var ctrl models.SupervisorMonthlyControl
		if database.DB.Where("company_id = ? AND period_ym = ?", co.ID, periodYM).First(&ctrl).Error == nil {
			ctrlID = ctrl.ID
		}
		tl := TrafficLight(due, st == "completada")
		row := CalendarComplianceCompany{
			CompanyID: co.ID, CompanyName: co.BusinessName, CompanyRUC: co.RUC,
			ControlID: ctrlID, Status: st, TrafficLight: tl, Detail: detail,
		}
		summary.Companies = append(summary.Companies, row)
		summary.Total++
		switch st {
		case "completada":
			summary.Completed++
		case "vencida":
			summary.Overdue++
		default:
			summary.Pending++
		}
	}
	summary.TrafficLight = TrafficLight(due, summary.Total > 0 && summary.Completed == summary.Total)
	return summary, nil
}
