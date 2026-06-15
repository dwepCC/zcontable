package services

import (
	"errors"
	"strings"
	"time"

	"miappfiber/database"
	"miappfiber/models"

	"gorm.io/gorm"
)

// SunatInboxListParams filtros del listado Buzón SOL por empresa y período.
type SunatInboxListParams struct {
	PeriodYM          string
	Status            string
	Q                 string
	AllowedCompanyIDs []uint
	Page              int
	PerPage           int
}

// SunatInboxListRow fila del listado (empresa + período + módulo sunat_inbox).
type SunatInboxListRow struct {
	CompanyID         uint       `json:"company_id"`
	Code              string     `json:"code"`
	Dig               string     `json:"dig"`
	BusinessName      string     `json:"business_name"`
	RUC               string     `json:"ruc"`
	AssistantUsername string     `json:"assistant_username"`
	ControlID         *uint      `json:"control_id,omitempty"`
	DeclarationID     *uint      `json:"declaration_id,omitempty"`
	Status            string     `json:"status"`
	AttachmentCount   int64      `json:"attachment_count"`
	LastStoredAt      *time.Time `json:"last_stored_at,omitempty"`
}

// SunatInboxDetail detalle tras EnsureSunatInbox (lazy create).
type SunatInboxDetail struct {
	PeriodYM          string                      `json:"period_ym"`
	CompanyID         uint                        `json:"company_id"`
	Code              string                      `json:"code"`
	Dig               string                      `json:"dig"`
	BusinessName      string                      `json:"business_name"`
	RUC               string                      `json:"ruc"`
	AssistantUsername string                      `json:"assistant_username"`
	ControlID         uint                        `json:"control_id"`
	Declaration       models.SupervisorDeclaration `json:"declaration"`
}

type sunatInboxListResult struct {
	Rows       []SunatInboxListRow
	Total      int64
	Page       int
	PerPage    int
	TotalPages int
}

func (s *SupervisorService) validateOpenPeriod(periodYM string) error {
	periodYM = strings.TrimSpace(periodYM)
	if !validPeriodYM(periodYM) {
		return errors.New("período inválido (YYYY-MM)")
	}
	var p models.SupervisorPeriod
	if err := database.DB.Where("period_ym = ?", periodYM).First(&p).Error; err != nil {
		return errors.New("período no encontrado")
	}
	if p.Status == models.SupervisorPeriodClosed {
		return errors.New("el período está cerrado")
	}
	return nil
}

func (s *SupervisorService) companyDig(companyID uint) string {
	var cred models.CompanyAccessCredential
	if err := database.DB.Where("company_id = ?", companyID).First(&cred).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(cred.Dig)
}

func assistantUsername(u *models.User) string {
	return userUsername(u)
}

// EnsureSunatInbox crea control y declaración sunat_inbox solo si el usuario abre el detalle (lazy puro).
// No invoca bootstrapControlChildren ni crea otros módulos.
func (s *SupervisorService) EnsureSunatInbox(companyID uint, periodYM string) (*SunatInboxDetail, error) {
	if err := s.validateOpenPeriod(periodYM); err != nil {
		return nil, err
	}
	var company models.Company
	if err := database.DB.Preload("Assistant").First(&company, companyID).Error; err != nil {
		return nil, errors.New("empresa no encontrada")
	}
	if company.ClientType != models.CompanyClientTypeEstudio || company.Status != "activo" {
		return nil, errors.New("empresa no disponible")
	}

	var ctrl models.SupervisorMonthlyControl
	var decl models.SupervisorDeclaration
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("company_id = ? AND period_ym = ?", companyID, periodYM).First(&ctrl).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			due := periodDefaultDueDate(periodYM)
			ctrl = models.SupervisorMonthlyControl{
				CompanyID:         companyID,
				PeriodYM:          periodYM,
				ResponsibleUserID: company.AccountantUserID,
				SupervisorUserID:  company.SupervisorUserID,
				DueDate:           &due,
				GeneralStatus:     models.SupervisorControlPendiente,
				RiskLevel:         models.SupervisorRiskBajo,
			}
			if err := tx.Create(&ctrl).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("monthly_control_id = ? AND declaration_type = ?", ctrl.ID, models.SupervisorDeclSunatInbox).
			First(&decl).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			decl = models.SupervisorDeclaration{
				MonthlyControlID: ctrl.ID,
				DeclarationType:  models.SupervisorDeclSunatInbox,
				Status:           models.SupervisorDeclPendiente,
				Priority:         models.SupervisorPriorityMedia,
			}
			return tx.Create(&decl).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return &SunatInboxDetail{
		PeriodYM:          periodYM,
		CompanyID:         company.ID,
		Code:              strings.TrimSpace(company.InternalCode),
		Dig:               s.companyDig(company.ID),
		BusinessName:      strings.TrimSpace(company.BusinessName),
		RUC:               strings.TrimSpace(company.RUC),
		AssistantUsername: assistantUsername(company.Assistant),
		ControlID:         ctrl.ID,
		Declaration:       decl,
	}, nil
}

// ListSunatInbox listado empresa+período; sin lazy create.
func (s *SupervisorService) ListSunatInbox(p SunatInboxListParams) (*sunatInboxListResult, error) {
	p.PeriodYM = strings.TrimSpace(p.PeriodYM)
	if err := s.validateOpenPeriod(p.PeriodYM); err != nil {
		return nil, err
	}
	page := p.Page
	if page < 1 {
		page = 1
	}
	perPage := p.PerPage
	if perPage < 1 {
		perPage = 20
	}
	if perPage > 200 {
		perPage = 200
	}

	q := database.DB.Model(&models.Company{}).
		Where("companies.client_type = ? AND companies.status = ?", models.CompanyClientTypeEstudio, "activo").
		Preload("Assistant")

	if len(p.AllowedCompanyIDs) > 0 {
		q = q.Where("companies.id IN ?", p.AllowedCompanyIDs)
	} else if p.AllowedCompanyIDs != nil {
		return &sunatInboxListResult{
			Rows: []SunatInboxListRow{}, Total: 0, Page: page, PerPage: perPage, TotalPages: 0,
		}, nil
	}

	term := strings.TrimSpace(p.Q)
	if len(term) >= 2 {
		like := "%" + term + "%"
		q = q.Where(
			"companies.ruc LIKE ? OR companies.business_name LIKE ? OR companies.internal_code LIKE ?",
			like, like, like,
		)
	}

	statusFilter := strings.TrimSpace(p.Status)
	if statusFilter == models.SupervisorSunatSinRegistro {
		q = q.Where(`NOT EXISTS (
			SELECT 1 FROM supervisor_monthly_controls c
			INNER JOIN supervisor_declarations d ON d.monthly_control_id = c.id AND d.declaration_type = ?
			WHERE c.company_id = companies.id AND c.period_ym = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL
		)`, models.SupervisorDeclSunatInbox, p.PeriodYM)
	} else if statusFilter != "" {
		q = q.Where(`EXISTS (
			SELECT 1 FROM supervisor_monthly_controls c
			INNER JOIN supervisor_declarations d ON d.monthly_control_id = c.id AND d.declaration_type = ? AND d.status = ?
			WHERE c.company_id = companies.id AND c.period_ym = ? AND c.deleted_at IS NULL AND d.deleted_at IS NULL
		)`, models.SupervisorDeclSunatInbox, statusFilter, p.PeriodYM)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}

	var companies []models.Company
	offset := (page - 1) * perPage
	if err := q.Order("companies.internal_code ASC").Offset(offset).Limit(perPage).Find(&companies).Error; err != nil {
		return nil, err
	}

	rows := make([]SunatInboxListRow, 0, len(companies))
	if len(companies) == 0 {
		return &sunatInboxListResult{Rows: rows, Total: total, Page: page, PerPage: perPage, TotalPages: sunatInboxTotalPages(total, perPage)}, nil
	}

	ids := make([]uint, 0, len(companies))
	for _, c := range companies {
		ids = append(ids, c.ID)
	}

	type declRow struct {
		CompanyID     uint
		ControlID     uint
		DeclarationID uint
		Status        string
	}
	var decls []declRow
	_ = database.DB.Table("supervisor_monthly_controls AS c").
		Select("c.company_id, c.id AS control_id, d.id AS declaration_id, d.status").
		Joins("INNER JOIN supervisor_declarations d ON d.monthly_control_id = c.id AND d.declaration_type = ? AND d.deleted_at IS NULL", models.SupervisorDeclSunatInbox).
		Where("c.company_id IN ? AND c.period_ym = ? AND c.deleted_at IS NULL", ids, p.PeriodYM).
		Scan(&decls).Error

	declByCompany := make(map[uint]declRow, len(decls))
	declIDs := make([]uint, 0, len(decls))
	for _, d := range decls {
		declByCompany[d.CompanyID] = d
		declIDs = append(declIDs, d.DeclarationID)
	}

	type attStat struct {
		DeclarationID uint
		Cnt           int64
		LastAt        *time.Time
	}
	statsByDecl := map[uint]attStat{}
	if len(declIDs) > 0 {
		var stats []attStat
		_ = database.DB.Model(&models.SupervisorAttachment{}).
			Select("declaration_id, COUNT(*) AS cnt, MAX(created_at) AS last_at").
			Where("declaration_id IN ?", declIDs).
			Group("declaration_id").
			Scan(&stats).Error
		for _, st := range stats {
			statsByDecl[st.DeclarationID] = st
		}
	}

	credDig := map[uint]string{}
	var creds []models.CompanyAccessCredential
	_ = database.DB.Where("company_id IN ?", ids).Find(&creds).Error
	for _, cr := range creds {
		credDig[cr.CompanyID] = strings.TrimSpace(cr.Dig)
	}

	for _, co := range companies {
		row := SunatInboxListRow{
			CompanyID:         co.ID,
			Code:              strings.TrimSpace(co.InternalCode),
			Dig:               credDig[co.ID],
			BusinessName:      strings.TrimSpace(co.BusinessName),
			RUC:               strings.TrimSpace(co.RUC),
			AssistantUsername: assistantUsername(co.Assistant),
			Status:            models.SupervisorSunatSinRegistro,
		}
		if d, ok := declByCompany[co.ID]; ok {
			cid, did := d.ControlID, d.DeclarationID
			row.ControlID = &cid
			row.DeclarationID = &did
			row.Status = d.Status
			if st, ok := statsByDecl[d.DeclarationID]; ok {
				row.AttachmentCount = st.Cnt
				row.LastStoredAt = st.LastAt
			}
		}
		rows = append(rows, row)
	}

	return &sunatInboxListResult{
		Rows: rows, Total: total, Page: page, PerPage: perPage,
		TotalPages: sunatInboxTotalPages(total, perPage),
	}, nil
}

func sunatInboxTotalPages(total int64, perPage int) int {
	if total <= 0 {
		return 0
	}
	return int((total + int64(perPage) - 1) / int64(perPage))
}

// ValidateSunatInbox marca la declaración sunat_inbox como validado (acción supervisor).
func (s *SupervisorService) ValidateSunatInbox(declarationID uint, approverID uint) (*models.SupervisorDeclaration, error) {
	var d models.SupervisorDeclaration
	if err := database.DB.First(&d, declarationID).Error; err != nil {
		return nil, errors.New("declaración no encontrada")
	}
	if d.DeclarationType != models.SupervisorDeclSunatInbox {
		return nil, errors.New("no es un registro de Buzón SOL")
	}
	old := d.Status
	d.Status = models.SupervisorSunatValidado
	d.ApproverUserID = &approverID
	if err := database.DB.Save(&d).Error; err != nil {
		return nil, err
	}
	s.LogChange("declaration", declarationID, "status", old, d.Status, approverID)
	return &d, nil
}

// EnsureSunatInboxDeclarationType verifica que la declaración sea sunat_inbox.
func (s *SupervisorService) EnsureSunatInboxDeclarationType(declarationID uint) error {
	var d models.SupervisorDeclaration
	if err := database.DB.Select("declaration_type").First(&d, declarationID).Error; err != nil {
		return errors.New("declaración no encontrada")
	}
	if d.DeclarationType != models.SupervisorDeclSunatInbox {
		return errors.New("no es un registro de Buzón SOL")
	}
	return nil
}
