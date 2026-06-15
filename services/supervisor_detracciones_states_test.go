package services

import (
	"testing"

	"miappfiber/models"
)

func TestDetraccionesProgressFromStatus(t *testing.T) {
	if got := detraccionesProgressFromStatus(models.SupervisorDeclEnRevision); got != 75 {
		t.Fatalf("en_revision progress=%d want 75", got)
	}
	if got := detraccionesProgressFromStatus(models.SupervisorSunatValidado); got != 100 {
		t.Fatalf("validado progress=%d want 100", got)
	}
}

func TestMapLegacyDetraccionesStatus(t *testing.T) {
	st, pct := mapLegacyDetraccionesStatus(models.SupervisorDistractionAbierto, 0)
	if st != models.SupervisorDeclPendiente || pct != 0 {
		t.Fatalf("abierto -> %s %d", st, pct)
	}
	st, pct = mapLegacyDetraccionesStatus(models.SupervisorDistractionResuelto, 2)
	if st != models.SupervisorDeclEnRevision || pct != 75 {
		t.Fatalf("resuelto+att -> %s %d", st, pct)
	}
	st, pct = mapLegacyDetraccionesStatus(models.SupervisorDistractionResuelto, 0)
	if st != models.SupervisorDetraccionDepositoRegistrado || pct != 55 {
		t.Fatalf("resuelto sin att -> %s %d", st, pct)
	}
}

func TestDetraccionesTransitionAllowed(t *testing.T) {
	if !detraccionesTransitionAllowed(models.SupervisorDetraccionDepositoRegistrado, models.SupervisorDeclEnRevision) {
		t.Fatal("deposito_registrado -> en_revision debe permitirse")
	}
	if detraccionesTransitionAllowed(models.SupervisorDeclPendiente, models.SupervisorSunatValidado) {
		t.Fatal("pendiente -> validado no debe permitirse")
	}
}
