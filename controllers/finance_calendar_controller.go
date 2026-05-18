package controllers

import (
	"strconv"
	"strings"
	"time"

	"miappfiber/services"

	"github.com/gofiber/fiber/v3"
)

type FinanceCalendarController struct {
	svc    *services.FinanceCalendarService
	access *services.AccessService
}

func NewFinanceCalendarController() *FinanceCalendarController {
	return &FinanceCalendarController{
		svc:    services.NewFinanceCalendarService(),
		access: services.NewAccessService(),
	}
}

func (ctrl *FinanceCalendarController) allowedCompanyIDs(c fiber.Ctx) ([]uint, error) {
	if hasStudioScope(c) {
		return nil, nil
	}
	uid, err := getUserID(c)
	if err != nil {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "No autenticado")
	}
	return ctrl.access.GetAllowedCompanyIDs(uid)
}

func (ctrl *FinanceCalendarController) ListAPI(c fiber.Ctx) error {
	rows, err := ctrl.svc.ListCalendars()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": rows})
}

func (ctrl *FinanceCalendarController) GetAPI(c fiber.Ctx) error {
	ym := strings.TrimSpace(c.Params("periodYm"))
	if ym == "" {
		ym = strings.TrimSpace(c.Query("period_ym", ""))
	}
	if ym == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "period_ym requerido"})
	}
	row, err := ctrl.svc.GetCalendarDetail(ym)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) CreateAPI(c fiber.Ctx) error {
	var body struct {
		PeriodYM string `json:"period_ym"`
		Notes    string `json:"notes"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	row, err := ctrl.svc.CreateCalendar(body.PeriodYM, body.Notes)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) UpdateAPI(c fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	var body struct {
		Notes string `json:"notes"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	row, err := ctrl.svc.UpdateCalendarNotes(uint(id), body.Notes)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) DeleteAPI(c fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	if err := ctrl.svc.DeleteCalendar(uint(id)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (ctrl *FinanceCalendarController) DuplicateAPI(c fiber.Ctx) error {
	var body struct {
		FromPeriodYM string `json:"from_period_ym"`
		ToPeriodYM   string `json:"to_period_ym"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	row, err := ctrl.svc.DuplicateCalendar(body.FromPeriodYM, body.ToPeriodYM)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) CreateMarkAPI(c fiber.Ctx) error {
	cid, _ := strconv.ParseUint(c.Params("calendarId"), 10, 32)
	var body struct {
		MarkDate string `json:"mark_date"`
		Kind     string `json:"kind"`
		Label    string `json:"label"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	dt, err := time.Parse("2006-01-02", body.MarkDate)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "mark_date inválida"})
	}
	row, err := ctrl.svc.UpsertMark(uint(cid), services.CalendarMarkInput{
		MarkDate: dt, Kind: body.Kind, Label: body.Label,
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) DeleteMarkAPI(c fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	if err := ctrl.svc.DeleteMark(uint(id)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (ctrl *FinanceCalendarController) CreateActivityAPI(c fiber.Ctx) error {
	cid, _ := strconv.ParseUint(c.Params("calendarId"), 10, 32)
	var body struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DueDay       int    `json:"due_day"`
		ActivityKind string `json:"activity_kind"`
		Priority     string `json:"priority"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	row, err := ctrl.svc.CreateActivity(uint(cid), services.CalendarActivityInput{
		Name: body.Name, Description: body.Description, DueDay: body.DueDay,
		ActivityKind: body.ActivityKind, Priority: body.Priority,
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) UpdateActivityAPI(c fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	var body struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DueDay       int    `json:"due_day"`
		ActivityKind string `json:"activity_kind"`
		Priority     string `json:"priority"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	row, err := ctrl.svc.UpdateActivity(uint(id), services.CalendarActivityInput{
		Name: body.Name, Description: body.Description, DueDay: body.DueDay,
		ActivityKind: body.ActivityKind, Priority: body.Priority,
	})
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": row})
}

func (ctrl *FinanceCalendarController) DeleteActivityAPI(c fiber.Ctx) error {
	id, _ := strconv.ParseUint(c.Params("id"), 10, 32)
	if err := ctrl.svc.DeleteActivity(uint(id)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (ctrl *FinanceCalendarController) ComplianceAPI(c fiber.Ctx) error {
	aid, _ := strconv.ParseUint(c.Params("activityId"), 10, 32)
	periodYM := strings.TrimSpace(c.Query("period_ym", ""))
	allowed, err := ctrl.allowedCompanyIDs(c)
	if err != nil {
		return err
	}
	summary, err := ctrl.svc.ActivityCompliance(uint(aid), periodYM, allowed)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": summary})
}
