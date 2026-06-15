package services

import (
	"errors"
	"fmt"
	"strings"

	"miappfiber/database"
	"miappfiber/models"
)

// detraccionesProgressFromStatus avance por estado F4.1a.
func detraccionesProgressFromStatus(status string) int {
	switch status {
	case models.SupervisorDeclPendiente:
		return 0
	case models.SupervisorDeclEnElaboracion:
		return 20
	case models.SupervisorDetraccionDepositoPendiente:
		return 40
	case models.SupervisorDetraccionDepositoRegistrado:
		return 55
	case models.SupervisorDetraccionSinOperaciones:
		return 60
	case models.SupervisorDeclEnRevision:
		return 75
	case models.SupervisorDeclObservado:
		return 40
	case models.SupervisorSunatValidado:
		return 100
	default:
		return 0
	}
}

// detraccionesAllowedTransitions whitelist F4.1a (sin observado/validado vía PUT).
var detraccionesAllowedTransitions = map[string][]string{
	models.SupervisorDeclPendiente:              {models.SupervisorDeclEnElaboracion, models.SupervisorDetraccionSinOperaciones},
	models.SupervisorDeclEnElaboracion:          {models.SupervisorDetraccionDepositoPendiente, models.SupervisorDetraccionSinOperaciones, models.SupervisorDeclEnRevision},
	models.SupervisorDetraccionDepositoPendiente: {models.SupervisorDetraccionDepositoRegistrado, models.SupervisorDeclEnElaboracion},
	models.SupervisorDetraccionDepositoRegistrado: {models.SupervisorDeclEnRevision, models.SupervisorDeclEnElaboracion},
	models.SupervisorDetraccionSinOperaciones:   {models.SupervisorDeclEnRevision},
	models.SupervisorDeclObservado:              {models.SupervisorDeclEnElaboracion},
}

func detraccionesTransitionAllowed(from, to string) bool {
	for _, t := range detraccionesAllowedTransitions[from] {
		if t == to {
			return true
		}
	}
	return false
}

func countDeclarationAttachments(declarationID uint) (int64, error) {
	var n int64
	err := database.DB.Model(&models.SupervisorAttachment{}).
		Where("declaration_id = ?", declarationID).
		Count(&n).Error
	return n, err
}

func effectiveDeclarationNotes(current, incoming string) string {
	if strings.TrimSpace(incoming) != "" {
		return strings.TrimSpace(incoming)
	}
	return strings.TrimSpace(current)
}

// validateDetraccionesStatusTransition valida transición manual (PUT declarations).
func (s *SupervisorService) validateDetraccionesStatusTransition(d *models.SupervisorDeclaration, from, to, incomingNotes string) error {
	if from == to {
		return nil
	}
	if to == models.SupervisorDeclObservado || to == models.SupervisorSunatValidado {
		return errors.New("use los botones Observar o Validar del módulo de Detracciones")
	}
	if !detraccionesTransitionAllowed(from, to) {
		return fmt.Errorf("transición no permitida: %s → %s", from, to)
	}
	notes := effectiveDeclarationNotes(d.Notes, incomingNotes)

	if to == models.SupervisorDetraccionSinOperaciones && notes == "" {
		return errors.New("indique en notas que no hay operaciones sujetas a detracción en el período")
	}

	if to == models.SupervisorDeclEnRevision {
		if from == models.SupervisorDetraccionSinOperaciones {
			if notes == "" {
				return errors.New("indique en notas el motivo del período sin operaciones sujetas")
			}
		} else {
			n, err := countDeclarationAttachments(d.ID)
			if err != nil {
				return err
			}
			if n < 1 {
				return errors.New("cargue al menos una evidencia antes de enviar a revisión")
			}
		}
	}

	return nil
}

// observeDetraccionesDeclaration observa una declaración detracciones (solo desde en_revision).
func (s *SupervisorService) observeDetraccionesDeclaration(id uint, approverID uint, notes string) (*models.SupervisorDeclaration, error) {
	var d models.SupervisorDeclaration
	if err := database.DB.First(&d, id).Error; err != nil {
		return nil, errors.New("declaración no encontrada")
	}
	if d.Status != models.SupervisorDeclEnRevision {
		return nil, errors.New("solo se puede observar desde estado en revisión")
	}
	if strings.TrimSpace(notes) == "" {
		return nil, errors.New("indique el texto de la observación")
	}
	old := d.Status
	pct := detraccionesProgressFromStatus(models.SupervisorDeclObservado)
	d.Status = models.SupervisorDeclObservado
	d.Notes = strings.TrimSpace(notes)
	d.ApproverUserID = &approverID
	d.ProgressPct = pct
	if err := database.DB.Save(&d).Error; err != nil {
		return nil, err
	}
	s.LogChange("declaration", id, "status", old, d.Status, approverID)
	_ = database.DB.Model(&models.SupervisorMonthlyControl{}).
		Where("id = ?", d.MonthlyControlID).
		Update("general_status", models.SupervisorControlObservado).Error
	did := id
	_, _ = s.CreateObservation(d.MonthlyControlID, did, approverID, notes)
	return &d, nil
}

// validateDetraccionesPreconditions comprobaciones previas a validar.
func validateDetraccionesPreconditions(d *models.SupervisorDeclaration) error {
	switch d.Status {
	case models.SupervisorDeclEnRevision:
		n, err := countDeclarationAttachments(d.ID)
		if err != nil {
			return err
		}
		if n < 1 {
			return errors.New("cargue al menos una evidencia antes de validar")
		}
	case models.SupervisorDetraccionSinOperaciones:
		if strings.TrimSpace(d.Notes) == "" {
			return errors.New("indique en notas que no hay operaciones sujetas antes de validar")
		}
	default:
		return errors.New("solo se puede validar desde en revisión o sin operaciones sujetas")
	}
	return nil
}

// mapLegacyDetraccionesStatus convierte estados F4 legacy a F4.1a (migración).
func mapLegacyDetraccionesStatus(oldStatus string, attachmentCount int64) (string, int) {
	var newStatus string
	switch oldStatus {
	case models.SupervisorDistractionAbierto:
		newStatus = models.SupervisorDeclPendiente
	case models.SupervisorDistractionEnProceso:
		newStatus = models.SupervisorDeclEnElaboracion
	case models.SupervisorDistractionResuelto:
		if attachmentCount >= 1 {
			newStatus = models.SupervisorDeclEnRevision
		} else {
			newStatus = models.SupervisorDetraccionDepositoRegistrado
		}
	case models.SupervisorDistractionEscalado:
		newStatus = models.SupervisorDeclObservado
	case models.SupervisorDeclObservado:
		newStatus = models.SupervisorDeclObservado
	case models.SupervisorSunatValidado:
		newStatus = models.SupervisorSunatValidado
	case models.SupervisorDeclPendiente, models.SupervisorDeclEnElaboracion,
		models.SupervisorDetraccionDepositoPendiente, models.SupervisorDetraccionDepositoRegistrado,
		models.SupervisorDetraccionSinOperaciones, models.SupervisorDeclEnRevision:
		newStatus = oldStatus
	default:
		newStatus = models.SupervisorDeclPendiente
	}
	return newStatus, detraccionesProgressFromStatus(newStatus)
}
