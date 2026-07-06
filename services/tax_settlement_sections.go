package services

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
)

const taxSettlementSectionsVersion = 1

// TaxSettlementSectionsPayload bloque fiscal PDT 621 / 601 / ITAN (JSON en tax_settlements.pdt621_json).
type TaxSettlementSectionsPayload struct {
	Version              int                    `json:"version"`
	Pdt621               *TaxSectionPdt621      `json:"pdt621,omitempty"`
	Pdt601               *TaxSectionPdt601      `json:"pdt601,omitempty"`
	Itan                 *TaxSectionItan        `json:"itan,omitempty"`
	GrandTotalImpuesto   float64                `json:"grand_total_impuesto_a_pagar"`
}

type TaxIGVRow struct {
	Base        float64 `json:"base"`
	NoGravadas  float64 `json:"no_gravadas,omitempty"`
	Impuesto    float64 `json:"impuesto"`
	Total       float64 `json:"total"`
}

type TaxSectionPdt621 struct {
	Enabled              bool      `json:"enabled"`
	VentasNetas          TaxIGVRow `json:"ventas_netas"`
	NotasCredito         TaxIGVRow `json:"notas_credito"`
	Compras105           TaxIGVRow `json:"compras_105"`
	Compras18            TaxIGVRow `json:"compras_18"`
	CreditoPeriodoAnt    float64   `json:"credito_periodo_anterior"`
	PercepcionesPeriodo  float64   `json:"percepciones_periodo"`
	PercepcionesAnteriores float64 `json:"percepciones_anteriores"`
	RetencionesPeriodo   float64   `json:"retenciones_periodo"`
	RetencionesAnteriores float64  `json:"retenciones_anteriores"`
	RentaVentasBase      float64   `json:"renta_ventas_base"`
	RentaVentasImpuesto  float64   `json:"renta_ventas_impuesto"`
	RentaSaldoFavorItan  float64   `json:"renta_saldo_favor_itan"`
	ImpuestoPeriodo      float64   `json:"impuesto_periodo"`
	SaldoFavor           float64   `json:"saldo_favor"`
	SaldoFavorFinal      float64   `json:"saldo_favor_final"`
	RentaImpuestoPagar   float64   `json:"renta_impuesto_a_pagar"`
	ImpuestoAPagar       float64   `json:"impuesto_a_pagar"`
}

type TaxSectionPdt601 struct {
	Enabled        bool    `json:"enabled"`
	Essalud        float64 `json:"essalud"`
	Onp            float64 `json:"onp"`
	Afp            float64 `json:"afp"`
	Rta4ta         float64 `json:"rta_4ta"`
	Rta5ta         float64 `json:"rta_5ta"`
	ImpuestoAPagar float64 `json:"impuesto_a_pagar"`
}

type TaxSectionItan struct {
	Enabled        bool    `json:"enabled"`
	Year           int     `json:"year"`
	CuotaNro       int     `json:"cuota_nro"`
	Impuesto       float64 `json:"impuesto"`
	ImpuestoAPagar float64 `json:"impuesto_a_pagar"`
}

func roundTaxMoney(v float64) float64 {
	return math.Round(v*100) / 100
}

// roundImpuestoPeriodo redondea al entero superior en magnitud si hay centavos.
// Positivo: 106.50 → 107. Negativo: -106.50 → -107.
func roundImpuestoPeriodo(v float64) float64 {
	normalized := roundTaxMoney(v)
	cents := int64(math.Round(normalized * 100))
	whole := cents / 100
	rem := cents % 100
	if rem == 0 {
		return float64(whole)
	}
	if cents > 0 {
		return float64(whole + 1)
	}
	return float64(whole - 1)
}

func computeIGVRowTotal(base, noGravadas, impuesto float64, withNoGravadas bool) float64 {
	if withNoGravadas {
		return roundTaxMoney(base + noGravadas + impuesto)
	}
	return roundTaxMoney(base + impuesto)
}

func computePdt621Section(s *TaxSectionPdt621) {
	if s == nil {
		return
	}
	s.VentasNetas.Total = computeIGVRowTotal(s.VentasNetas.Base, s.VentasNetas.NoGravadas, s.VentasNetas.Impuesto, true)
	s.NotasCredito.Total = computeIGVRowTotal(s.NotasCredito.Base, s.NotasCredito.NoGravadas, s.NotasCredito.Impuesto, true)
	s.Compras105.Total = computeIGVRowTotal(s.Compras105.Base, 0, s.Compras105.Impuesto, false)
	s.Compras18.Total = computeIGVRowTotal(s.Compras18.Base, 0, s.Compras18.Impuesto, false)

	s.ImpuestoPeriodo = roundImpuestoPeriodo(
		s.VentasNetas.Impuesto-s.NotasCredito.Impuesto-s.Compras105.Impuesto-s.Compras18.Impuesto,
	)
	s.SaldoFavor = roundTaxMoney(s.ImpuestoPeriodo - s.CreditoPeriodoAnt)
	s.SaldoFavorFinal = roundTaxMoney(
		s.SaldoFavor + s.PercepcionesPeriodo + s.PercepcionesAnteriores + s.RetencionesPeriodo + s.RetencionesAnteriores,
	)

	renta := roundTaxMoney(s.RentaVentasImpuesto - s.RentaSaldoFavorItan)
	if renta < 0 {
		renta = 0
	}
	s.RentaImpuestoPagar = renta

	// Impuesto a pagar de la sección: renta positiva; IGV solo si hay deuda (saldo final > 0).
	igvPagar := 0.0
	if s.SaldoFavorFinal > 0 {
		igvPagar = s.SaldoFavorFinal
	}
	s.ImpuestoAPagar = roundTaxMoney(renta + igvPagar)
}

func computePdt601Section(s *TaxSectionPdt601) {
	if s == nil {
		return
	}
	s.ImpuestoAPagar = roundTaxMoney(s.Essalud + s.Onp + s.Afp + s.Rta4ta + s.Rta5ta)
}

func computeItanSection(s *TaxSectionItan) {
	if s == nil {
		return
	}
	s.ImpuestoAPagar = roundTaxMoney(s.Impuesto)
}

// ComputeTaxSettlementSections recalcula totales derivados y gran total.
func ComputeTaxSettlementSections(p *TaxSettlementSectionsPayload) *TaxSettlementSectionsPayload {
	if p == nil {
		return nil
	}
	if p.Version == 0 {
		p.Version = taxSettlementSectionsVersion
	}
	if p.Pdt621 != nil && p.Pdt621.Enabled {
		computePdt621Section(p.Pdt621)
	}
	if p.Pdt601 != nil && p.Pdt601.Enabled {
		computePdt601Section(p.Pdt601)
	}
	if p.Itan != nil && p.Itan.Enabled {
		computeItanSection(p.Itan)
	}
	var grand float64
	if p.Pdt621 != nil && p.Pdt621.Enabled {
		grand += p.Pdt621.ImpuestoAPagar
	}
	if p.Pdt601 != nil && p.Pdt601.Enabled {
		grand += p.Pdt601.ImpuestoAPagar
	}
	if p.Itan != nil && p.Itan.Enabled {
		grand += p.Itan.ImpuestoAPagar
	}
	p.GrandTotalImpuesto = roundTaxMoney(grand)
	return p
}

// ParseTaxSettlementSectionsJSON interpreta pdt621_json (v1 estructurado o legado).
func ParseTaxSettlementSectionsJSON(raw string) (*TaxSettlementSectionsPayload, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var p TaxSettlementSectionsPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Version == 0 && p.Pdt621 == nil && p.Pdt601 == nil && p.Itan == nil {
		return nil, nil
	}
	return ComputeTaxSettlementSections(&p), nil
}

// MarshalTaxSettlementSectionsJSON serializa el payload con totales calculados.
func MarshalTaxSettlementSectionsJSON(p *TaxSettlementSectionsPayload) (string, error) {
	if p == nil {
		return "", nil
	}
	p = ComputeTaxSettlementSections(p)
	hasSection := (p.Pdt621 != nil && p.Pdt621.Enabled) ||
		(p.Pdt601 != nil && p.Pdt601.Enabled) ||
		(p.Itan != nil && p.Itan.Enabled)
	if !hasSection {
		return "", nil
	}
	b, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func validateTaxSettlementSections(p *TaxSettlementSectionsPayload) error {
	if p == nil {
		return nil
	}
	if p.Itan != nil && p.Itan.Enabled {
		if p.Itan.Year < 2000 || p.Itan.Year > 2100 {
			return errors.New("año ITAN inválido")
		}
		if p.Itan.CuotaNro < 1 || p.Itan.CuotaNro > 12 {
			return errors.New("cuota ITAN inválida (1-12)")
		}
	}
	return nil
}
