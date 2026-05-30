package debt

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"miappfiber/models"

	"gorm.io/gorm"
)

// PaymentAllocationLine imputación a una deuda (equivale conceptualmente a payment_item).
type PaymentAllocationLine struct {
	DocumentID uint
	Amount     float64
}

// ApplyPaymentInput datos para registrar un pago aplicado con allocations.
type ApplyPaymentInput struct {
	CompanyID       uint
	Date            time.Time
	Amount          float64
	Method          string
	Reference       string
	Attachment      string
	Description     string
	Notes           string
	FiscalStatus    string
	TaxSettlementID *uint
	Lines           []PaymentAllocationLine
}

// DocumentOpenBalance saldo pendiente efectivo de una deuda.
func (s *Service) DocumentOpenBalance(tx *gorm.DB, documentID uint) (float64, error) {
	var d models.Document
	if err := tx.First(&d, documentID).Error; err != nil {
		return 0, err
	}
	return s.EffectiveBalance(tx, &d), nil
}

// ValidateAllocationsTx valida imputaciones antes de persistir (sin escribir).
func (s *Service) ValidateAllocationsTx(tx *gorm.DB, companyID uint, lines []PaymentAllocationLine, taxSettlementID *uint) error {
	if len(lines) == 0 {
		return errors.New("indique al menos una imputación")
	}
	seen := map[uint]struct{}{}
	var settlementDocIDs map[uint]struct{}
	if taxSettlementID != nil && *taxSettlementID > 0 {
		var err error
		settlementDocIDs, err = s.settlementDocumentIDs(tx, *taxSettlementID)
		if err != nil {
			return err
		}
	}
	for _, ln := range lines {
		if ln.DocumentID == 0 || ln.Amount <= 0 {
			return errors.New("cada imputación requiere documento y monto válido")
		}
		if _, dup := seen[ln.DocumentID]; dup {
			return errors.New("documento repetido en imputación; una sola línea por documento")
		}
		seen[ln.DocumentID] = struct{}{}

		var d models.Document
		if err := tx.First(&d, ln.DocumentID).Error; err != nil {
			return errors.New("documento inválido")
		}
		if d.CompanyID != companyID {
			return errors.New("el documento no pertenece a la empresa")
		}
		if stringsTrimLower(d.Status) == StatusCancelled {
			return errors.New("no se puede imputar a un documento anulado")
		}
		bal := s.EffectiveBalance(tx, &d)
		if ln.Amount > bal+MoneyEpsilon {
			return errors.New("el monto excede el saldo de un documento imputado")
		}
		if settlementDocIDs != nil {
			if _, ok := settlementDocIDs[ln.DocumentID]; !ok {
				return errors.New("el pago desde liquidación solo puede imputar deudas vinculadas a esa liquidación")
			}
		}
	}
	return nil
}

func (s *Service) settlementDocumentIDs(tx *gorm.DB, settlementID uint) (map[uint]struct{}, error) {
	var lines []models.TaxSettlementLine
	if err := tx.Where("tax_settlement_id = ?", settlementID).Find(&lines).Error; err != nil {
		return nil, err
	}
	out := make(map[uint]struct{})
	for _, ln := range lines {
		if ln.DocumentID != nil && *ln.DocumentID > 0 {
			out[*ln.DocumentID] = struct{}{}
		}
	}
	// También documentos con tax_settlement_id directo (vinculados fuera de línea)
	var docs []models.Document
	if err := tx.Where("tax_settlement_id = ?", settlementID).Select("id").Find(&docs).Error; err != nil {
		return nil, err
	}
	for _, d := range docs {
		out[d.ID] = struct{}{}
	}
	if len(out) == 0 {
		return nil, errors.New("la liquidación no tiene deudas vinculadas para imputar")
	}
	return out, nil
}

// ApplyPaymentTx crea payment + allocations y actualiza balance_amount/status (transaccional).
func (s *Service) ApplyPaymentTx(tx *gorm.DB, in ApplyPaymentInput) (uint, error) {
	if in.CompanyID == 0 {
		return 0, errors.New("la empresa es requerida")
	}
	if in.Amount <= 0 {
		return 0, errors.New("el monto debe ser mayor a 0")
	}
	var sum float64
	for _, ln := range in.Lines {
		sum += ln.Amount
	}
	if math.Abs(sum-in.Amount) > 0.02 {
		return 0, errors.New("la suma de imputaciones debe igualar el monto del pago")
	}
	if err := s.ValidateAllocationsTx(tx, in.CompanyID, in.Lines, in.TaxSettlementID); err != nil {
		return 0, err
	}

	fs := strings.TrimSpace(in.FiscalStatus)
	if fs == "" {
		fs = "na"
	}
	if in.Date.IsZero() {
		in.Date = time.Now()
	}
	pay := models.Payment{
		CompanyID:       in.CompanyID,
		DocumentID:      nil,
		Type:            "applied",
		Date:            in.Date,
		Amount:          in.Amount,
		Method:          in.Method,
		Reference:       in.Reference,
		Attachment:      in.Attachment,
		Description:     in.Description,
		Notes:           in.Notes,
		FiscalStatus:    fs,
		TaxSettlementID: in.TaxSettlementID,
	}
	if err := tx.Create(&pay).Error; err != nil {
		return 0, err
	}
	for _, ln := range in.Lines {
		a := models.PaymentAllocation{
			PaymentID:  pay.ID,
			DocumentID: ln.DocumentID,
			Amount:     roundMoney(ln.Amount),
		}
		if err := tx.Create(&a).Error; err != nil {
			return 0, err
		}
		if err := s.PersistBalanceAndStatus(tx, ln.DocumentID); err != nil {
			return 0, fmt.Errorf("actualizar saldo documento %d: %w", ln.DocumentID, err)
		}
	}
	return pay.ID, nil
}

// RevertPaymentAllocationsTx elimina allocations de un pago y restaura saldos (sin borrar el payment).
// TODO: remove legacy after migration stable — solo usado si se migra Update de pagos aplicados.
func (s *Service) RevertPaymentAllocationsTx(tx *gorm.DB, paymentID uint) ([]uint, error) {
	var allocs []models.PaymentAllocation
	if err := tx.Where("payment_id = ?", paymentID).Find(&allocs).Error; err != nil {
		return nil, err
	}
	docIDs := make([]uint, 0, len(allocs))
	seen := map[uint]struct{}{}
	for _, a := range allocs {
		if _, ok := seen[a.DocumentID]; !ok {
			docIDs = append(docIDs, a.DocumentID)
			seen[a.DocumentID] = struct{}{}
		}
	}
	if err := tx.Where("payment_id = ?", paymentID).Delete(&models.PaymentAllocation{}).Error; err != nil {
		return nil, err
	}
	for _, did := range docIDs {
		if err := s.PersistBalanceAndStatus(tx, did); err != nil {
			return nil, err
		}
	}
	return docIDs, nil
}
