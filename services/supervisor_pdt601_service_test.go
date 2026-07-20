package services

import (
	"testing"

	"miappfiber/database"
	"miappfiber/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupPdt601TestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.Company{},
		&models.SupervisorPeriod{},
		&models.SupervisorMonthlyControl{},
		&models.SupervisorDeclaration{},
		&models.SupervisorPdt601Planilla{},
		&models.SupervisorAttachment{},
		&models.CompanyAccessCredential{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	database.DB = db
	return db
}

func seedEstudioCompany(t *testing.T, db *gorm.DB, code string) models.Company {
	t.Helper()
	co := models.Company{
		RUC:          "20" + code + "1",
		BusinessName: "Empresa " + code,
		InternalCode: code,
		ClientType:   models.CompanyClientTypeEstudio,
		Status:       "activo",
	}
	if err := db.Create(&co).Error; err != nil {
		t.Fatalf("company: %v", err)
	}
	return co
}

// TestSavePdt601PlanillaRoundTrip cubre guardar → leer → listar, aislamiento por período y upsert.
func TestSavePdt601PlanillaRoundTrip(t *testing.T) {
	db := setupPdt601TestDB(t)
	svc := NewSupervisorService()
	co := seedEstudioCompany(t, db, "P001")

	if _, err := svc.CreatePeriod("2026-05", "test"); err != nil {
		t.Fatalf("CreatePeriod 05: %v", err)
	}
	if _, err := svc.CreatePeriod("2026-06", "test"); err != nil {
		t.Fatalf("CreatePeriod 06: %v", err)
	}

	in := Pdt601PlanillaInput{
		TrabajadoresONP:             4,
		TrabajadoresAFP:             6,
		Essalud:                     100,
		Onp:                         50,
		Afp:                         30,
		Sis:                         10,
		Rta4ta:                      5,
		Rta5ta:                      5,
		Rh:                          0,
		FechaEntrega:                "2026-06-10",
		NPS:                         "NPS-123",
		EstadoEnvioBoletas:          "Enviado",
		FechaEnvioNpsTicketsBoletas: "2026-06-12",
	}
	saved, err := svc.SavePdt601Planilla(co.ID, "2026-05", in)
	if err != nil {
		t.Fatalf("SavePdt601Planilla: %v", err)
	}
	if saved.Planilla == nil {
		t.Fatal("detalle sin planilla tras guardar")
	}
	if saved.Planilla.TrabajadoresTotal != 10 {
		t.Fatalf("trabajadores_total=%d want 10", saved.Planilla.TrabajadoresTotal)
	}
	if saved.Planilla.TotalAportes != 200 {
		t.Fatalf("total_aportes=%v want 200", saved.Planilla.TotalAportes)
	}
	if saved.Planilla.FechaEntrega == nil || *saved.Planilla.FechaEntrega != "2026-06-10" {
		t.Fatalf("fecha_entrega=%v want 2026-06-10", saved.Planilla.FechaEntrega)
	}

	// GET del detalle rehidrata la planilla guardada.
	got, err := svc.EnsurePdt601(co.ID, "2026-05")
	if err != nil {
		t.Fatalf("EnsurePdt601: %v", err)
	}
	if got.Planilla == nil || got.Planilla.NPS != "NPS-123" {
		t.Fatalf("planilla rehidratada inesperada: %+v", got.Planilla)
	}
	if got.Planilla.FechaEnvioNpsTicketsBoletas == nil || *got.Planilla.FechaEnvioNpsTicketsBoletas != "2026-06-12" {
		t.Fatalf("fecha_envio_nps_tickets_boletas=%v want 2026-06-12", got.Planilla.FechaEnvioNpsTicketsBoletas)
	}

	// El listado del período 2026-05 trae la planilla.
	list05, err := svc.ListPdt601(Pdt601ListParams{PeriodYM: "2026-05", Page: 1, PerPage: 20})
	if err != nil {
		t.Fatalf("ListPdt601 05: %v", err)
	}
	if len(list05.Rows) != 1 {
		t.Fatalf("filas 05=%d want 1", len(list05.Rows))
	}
	if list05.Rows[0].Planilla == nil || list05.Rows[0].Planilla.TrabajadoresTotal != 10 {
		t.Fatalf("planilla en listado 05 inesperada: %+v", list05.Rows[0].Planilla)
	}

	// Aislamiento por período: 2026-06 no tiene planilla.
	list06, err := svc.ListPdt601(Pdt601ListParams{PeriodYM: "2026-06", Page: 1, PerPage: 20})
	if err != nil {
		t.Fatalf("ListPdt601 06: %v", err)
	}
	if len(list06.Rows) != 1 {
		t.Fatalf("filas 06=%d want 1", len(list06.Rows))
	}
	if list06.Rows[0].Planilla != nil {
		t.Fatalf("06 no debería tener planilla: %+v", list06.Rows[0].Planilla)
	}

	// Re-guardar el mismo período actualiza (upsert), no duplica.
	in.TrabajadoresONP = 7
	if _, err := svc.SavePdt601Planilla(co.ID, "2026-05", in); err != nil {
		t.Fatalf("Save upsert: %v", err)
	}
	var count int64
	if err := db.Model(&models.SupervisorPdt601Planilla{}).Count(&count).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("filas planilla=%d want 1 (upsert)", count)
	}
	again, err := svc.EnsurePdt601(co.ID, "2026-05")
	if err != nil {
		t.Fatalf("EnsurePdt601 tras upsert: %v", err)
	}
	if again.Planilla.TrabajadoresTotal != 13 {
		t.Fatalf("trabajadores_total tras upsert=%d want 13", again.Planilla.TrabajadoresTotal)
	}
}
