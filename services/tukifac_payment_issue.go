package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"miappfiber/config"
	"miappfiber/database"
	"miappfiber/models"
)

func tukifacItemTypeIDForNewItem() int {
	if config.AppConfig == nil || config.AppConfig.TukifacDefaultItemTypeID <= 0 {
		return 1
	}
	return config.AppConfig.TukifacDefaultItemTypeID
}

// Moneda para ítems creados en Tukifac (tabla `items` solo expone currency_type_id; no enviar currency_type_symbol: en algunas versiones se usa en WHERE y la columna no existe).
func tukifacItemCurrencyPEN() map[string]interface{} {
	return map[string]interface{}{
		"currency_type_id": "PEN",
	}
}

// tukifacUnidadMedidaFromDocument devuelve código SUNAT de unidad (ZZ servicio, NIU unidad, etc.) para líneas Tukifac.
// - Si el producto (manual o sincronizado desde el módulo de productos) tiene unit_type_id, se usa tal cual (NIU, ZZ, …).
// - Si no hay unidad guardada: servicio → ZZ; producto u otro → ZZ por defecto (operación habitual); NIU solo llega por catálogo explícito.
// - Sin líneas con producto: ZZ (deudas / liquidaciones mayormente servicios).
func tukifacUnidadMedidaFromDocument(d *models.Document) string {
	if d == nil {
		return "ZZ"
	}
	items := append([]models.DocumentItem(nil), d.Items...)
	sort.Slice(items, func(i, j int) bool { return items[i].SortOrder < items[j].SortOrder })
	for i := range items {
		p := items[i].Product
		if p == nil {
			continue
		}
		if u := strings.TrimSpace(strings.ToUpper(p.UnitTypeID)); u != "" {
			return u
		}
		kind := strings.TrimSpace(strings.ToLower(p.ProductKind))
		if kind == "service" {
			return "ZZ"
		}
		// product (u otro) sin unit_type_id en BD: no inventar NIU; predominio servicios / evitar líneas mal rotuladas
		return "ZZ"
	}
	if len(items) > 0 {
		return "ZZ"
	}
	if strings.TrimSpace(d.ServiceMonth) != "" {
		return "ZZ"
	}
	return "ZZ"
}

// PaymentTukifacIssueInput emisión SUNAT desde un pago ya registrado (imputaciones = líneas del comprobante).
type PaymentTukifacIssueInput struct {
	Kind                 string `json:"kind"` // boleta | factura | sale_note
	SerieDocumento       string `json:"serie_documento"`
	SaleNoteSeriesID     uint   `json:"sale_note_series_id"`
	PaymentMethodTypeID  string `json:"payment_method_type_id"`
	PaymentDestinationID string `json:"payment_destination_id"`
	PaymentReference     string `json:"payment_reference"`
}

func roundMoney2(v float64) float64 {
	return math.Round(v*100) / 100
}

func peruDocIdentidadTipo(ruc string) string {
	s := strings.TrimSpace(ruc)
	if len(s) == 8 {
		return "1"
	}
	return "6"
}

func documentLineDescription(d *models.Document) string {
	if d == nil {
		return "Servicio"
	}
	desc := strings.TrimSpace(d.Description)
	if desc != "" {
		r := []rune(desc)
		if len(r) > 400 {
			return string(r[:400])
		}
		return desc
	}
	return strings.TrimSpace(fmt.Sprintf("%s %s", d.Type, d.Number))
}

func leyendaMontoSoles(total float64) string {
	cents := int64(math.Round(total * 100))
	sol := cents / 100
	cen := cents % 100
	if cen < 0 {
		cen = -cen
	}
	return fmt.Sprintf("SON: %d CON %02d/100 SOLES", sol, cen)
}

func receptorMapFromCompany(c *models.Company) map[string]interface{} {
	addr := strings.TrimSpace(c.Address)
	if addr == "" {
		addr = "-"
	}
	email := strings.TrimSpace(c.Email)
	tel := strings.TrimSpace(c.Phone)
	nombreCom := strings.TrimSpace(c.TradeName)
	return map[string]interface{}{
		"codigo_tipo_documento_identidad": peruDocIdentidadTipo(c.RUC),
		"numero_documento":                strings.TrimSpace(c.RUC),
		"apellidos_y_nombres_o_razon_social": strings.TrimSpace(c.BusinessName),
		"nombre_comercial":                nombreCom,
		"codigo_pais":                     "PE",
		"ubigeo":                          "150101",
		"direccion":                       addr,
		"correo_electronico":              email,
		"telefono":                        tel,
		"codigo_tipo_direccion":           "01",
	}
}

func buildSUNATDocumentItem(codigoInterno, descripcion string, cantidad float64, totalConIGV float64, unidadMedida string) map[string]interface{} {
	um := strings.TrimSpace(strings.ToUpper(unidadMedida))
	if um == "" {
		um = "ZZ"
	}
	qty := cantidad
	if qty < 0.0001 {
		qty = 1
	}
	totalItem := roundMoney2(totalConIGV)
	base := roundMoney2(totalItem / 1.18)
	igv := roundMoney2(totalItem - base)
	uv := roundMoney2(base / qty)
	pu := roundMoney2(totalItem / qty)
	return map[string]interface{}{
		"codigo_interno":               codigoInterno,
		"descripcion":                  descripcion,
		"nombre":                       descripcion,
		"unidad_de_medida":             um,
		"codigo_tipo_item":             "01",
		"codigo_producto_sunat":        "",
		"codigo_producto_gsl":          "",
		"cantidad":                     qty,
		"valor_unitario":               uv,
		"codigo_tipo_precio":           "01",
		"precio_unitario":              pu,
		"codigo_tipo_afectacion_igv":   "10",
		"total_base_igv":               base,
		"porcentaje_igv":               18,
		"total_igv":                    igv,
		"total_base_isc":               0,
		"porcentaje_isc":               0,
		"total_isc":                    0,
		"total_base_otros_impuestos":   0,
		"porcentaje_otros_impuestos":   0,
		"total_otros_impuestos":        0,
		"total_impuestos_bolsa_plastica": 0,
		"total_impuestos":              igv,
		"total_valor_item":             base,
		"total_cargos":                 0,
		"total_descuentos":             0,
		"total_item":                   totalItem,
		"informacion_adicional":        "",
		"actualizar_descripcion":       true,
		"nombre_producto_pdf":          descripcion,
		"nombre_producto_xml":          descripcion,
		"dato_adicional":               "",
		"datos_adicionales":            []interface{}{},
		"descuentos":                   []interface{}{},
		"cargos":                       []interface{}{},
		"lots":                         []interface{}{},
		"IdLoteSelected":               nil,
		"esFusionado":                  false,
		"item": mergeMaps(map[string]interface{}{
			"description":    descripcion,
			"unit_type_id":   um,
			"item_type_id":   tukifacItemTypeIDForNewItem(),
			"has_igv":        true,
			"presentation":   map[string]interface{}{"quantity_unit": 1},
			"lots":           []interface{}{},
			"IdLoteSelected": nil,
		}, tukifacItemCurrencyPEN()),
	}
}

func mergeMaps(base map[string]interface{}, extra map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(base)+len(extra))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func buildSaleNoteItem(desc string, totalConIGV float64, unidadMedida string) map[string]interface{} {
	um := strings.TrimSpace(strings.ToUpper(unidadMedida))
	if um == "" {
		um = "ZZ"
	}
	totalItem := roundMoney2(totalConIGV)
	base := roundMoney2(totalItem / 1.18)
	igv := roundMoney2(totalItem - base)
	pu := totalItem
	uv := base
	return map[string]interface{}{
		"full_item": mergeMaps(map[string]interface{}{
			"description":                      desc,
			"unit_type_id":                     um,
			"item_type_id":                     tukifacItemTypeIDForNewItem(),
			"sale_unit_price":                  pu,
			"sale_affectation_igv_type_id":     "10",
			"purchase_affectation_igv_type_id": "10",
		}, tukifacItemCurrencyPEN()),
		"quantity":                1,
		"unit_value":              uv,
		"price_type_id":           "01",
		"unit_price":              pu,
		"affectation_igv_type_id": "10",
		"total_base_igv":          base,
		"percentage_igv":          18,
		"total_igv":               igv,
		"total_taxes":             igv,
		"total_value":             base,
		"total_charge":            0,
		"total_discount":          0,
		"total":                   totalItem,
		// No enviar objeto anidado `item` si ya va `full_item`: en Tukifac el merge con el modelo Item
		// puede añadir `currency_type_symbol` al WHERE aunque la tabla `items` no tenga esa columna.
	}
}

// tukifacPaymentReferenceContext texto para OC/leyendas del comprobante; fromSettlement indica liquidación emitida.
func tukifacPaymentReferenceContext(pay *models.Payment) (ref string, fromSettlement bool, err error) {
	if pay.TaxSettlementID != nil && *pay.TaxSettlementID > 0 {
		if pay.TaxSettlement == nil || pay.TaxSettlement.Status != models.TaxSettlementStatusIssued {
			return "", false, errors.New("la liquidación debe estar emitida")
		}
		fromSettlement = true
		if strings.TrimSpace(pay.TaxSettlement.Number) != "" {
			return strings.TrimSpace(pay.TaxSettlement.Number), fromSettlement, nil
		}
		return fmt.Sprintf("LI-%d", *pay.TaxSettlementID), fromSettlement, nil
	}
	if pay.Type != "applied" || len(pay.Allocations) == 0 {
		return "", false, errors.New("solo se puede emitir en Tukifac para pagos aplicados con imputación a deudas")
	}
	if len(pay.Allocations) == 1 {
		r := strings.TrimSpace(documentLineDescription(pay.Allocations[0].Document))
		if r == "" {
			r = fmt.Sprintf("Documento #%d", pay.Allocations[0].DocumentID)
		}
		return r, false, nil
	}
	return fmt.Sprintf("Pago %d · %d deuda(s)", pay.ID, len(pay.Allocations)), false, nil
}

// IssueComprobanteFromPayment construye el JSON según docs y lo envía a Tukifac (liquidación emitida o pago aplicado a deuda(s) sin liquidación).
func (s *TukifacService) IssueComprobanteFromPayment(paymentID uint, in PaymentTukifacIssueInput) (*models.TukifacFiscalReceipt, []byte, error) {
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	if kind != "boleta" && kind != "factura" && kind != "sale_note" {
		return nil, nil, errors.New("kind debe ser boleta, factura o sale_note")
	}

	var pay models.Payment
	if err := database.DB.
		Preload("Allocations.Document.Items.Product").
		Preload("TaxSettlement").
		First(&pay, paymentID).Error; err != nil {
		return nil, nil, errors.New("pago no encontrado")
	}

	settleRef, fromSettlement, err := tukifacPaymentReferenceContext(&pay)
	if err != nil {
		return nil, nil, err
	}
	if pay.Type != "applied" || len(pay.Allocations) == 0 {
		return nil, nil, errors.New("el pago debe estar aplicado con imputaciones a deudas")
	}

	var sumAlloc float64
	for _, a := range pay.Allocations {
		sumAlloc += a.Amount
	}
	if math.Abs(sumAlloc-pay.Amount) > 0.03 {
		return nil, nil, errors.New("las imputaciones no coinciden con el monto del pago")
	}

	var co models.Company
	if err := database.DB.First(&co, pay.CompanyID).Error; err != nil {
		return nil, nil, err
	}

	method := strings.TrimSpace(in.PaymentMethodTypeID)
	if method == "" {
		method = "01"
	}
	dest := strings.TrimSpace(in.PaymentDestinationID)
	if dest == "" {
		dest = "cash"
	}
	ref := strings.TrimSpace(in.PaymentReference)
	if ref == "" {
		ref = "Caja"
	}

	issueDate := pay.Date
	if issueDate.IsZero() {
		issueDate = time.Now()
	}
	dateStr := issueDate.Format("2006-01-02")
	timeStr := issueDate.Format("15:04:05")

	if kind == "sale_note" {
		if in.SaleNoteSeriesID == 0 {
			return nil, nil, errors.New("indique sale_note_series_id (serie numérica en Tukifac)")
		}
		items := make([]interface{}, 0, len(pay.Allocations))
		var totalVenta float64
		for _, a := range pay.Allocations {
			desc := documentLineDescription(a.Document)
			um := tukifacUnidadMedidaFromDocument(a.Document)
			items = append(items, buildSaleNoteItem(desc, a.Amount, um))
			totalVenta += roundMoney2(a.Amount)
		}
		totalVenta = roundMoney2(totalVenta)
		if math.Abs(totalVenta-pay.Amount) > 0.03 {
			return nil, nil, errors.New("inconsistencia en montos del comprobante")
		}
		payload := map[string]interface{}{
			"series_id":                 in.SaleNoteSeriesID,
			"date_of_issue":             dateStr,
			"time_of_issue":             timeStr,
			"codigo_tipo_moneda":        "PEN",
			"exchange_rate_sale":        1,
			"force_create_if_not_exist": true,
			"datos_del_cliente_o_receptor": map[string]interface{}{
				"codigo_tipo_documento_identidad": peruDocIdentidadTipo(co.RUC),
				"numero_documento":                strings.TrimSpace(co.RUC),
				"apellidos_y_nombres_o_razon_social": strings.TrimSpace(co.BusinessName),
				"codigo_pais":                     "PE",
				"ubigeo":                          "150101",
				"direccion":                       strings.TrimSpace(co.Address),
				"correo_electronico":              strings.TrimSpace(co.Email),
				"telefono":                        strings.TrimSpace(co.Phone),
			},
			"type_period":     nil,
			"quantity_period": 0,
			"items":           items,
			"payments": []interface{}{
				map[string]interface{}{
					"date_of_payment":         dateStr,
					"payment_method_type_id":  method,
					"payment_destination_id":  dest,
					"reference":               ref,
					"payment":                 totalVenta,
					"payment_received":        totalVenta,
				},
			},
		}
		if strings.TrimSpace(co.Address) == "" {
			payload["datos_del_cliente_o_receptor"].(map[string]interface{})["direccion"] = "-"
		}
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, nil, err
		}
		rec, respBody, err := s.issueToTukifac(pay.CompanyID, raw, true)
		if err != nil {
			return nil, respBody, err
		}
		if err := s.LinkIssuedReceiptToPayment(rec, &pay); err != nil {
			return rec, respBody, err
		}
		return rec, respBody, nil
	}

	// factura / boleta (JSON documentos SUNAT)
	tipoDoc := "03"
	if kind == "factura" {
		tipoDoc = "01"
	}
	serie := strings.TrimSpace(in.SerieDocumento)
	if serie == "" {
		if tipoDoc == "01" {
			serie = "F001"
		} else {
			serie = "B001"
		}
	}

	items := make([]interface{}, 0, len(pay.Allocations))
	var totGrav float64
	var totIGV float64
	var totVenta float64
	for _, a := range pay.Allocations {
		desc := documentLineDescription(a.Document)
		cod := fmt.Sprintf("DEU-%d", a.DocumentID)
		um := tukifacUnidadMedidaFromDocument(a.Document)
		it := buildSUNATDocumentItem(cod, desc, 1, a.Amount, um)
		items = append(items, it)
		t := roundMoney2(a.Amount)
		b := roundMoney2(t / 1.18)
		g := roundMoney2(t - b)
		totGrav += b
		totIGV += g
		totVenta += t
	}
	totGrav = roundMoney2(totGrav)
	totIGV = roundMoney2(totIGV)
	totVenta = roundMoney2(totVenta)
	if math.Abs(totVenta-pay.Amount) > 0.03 {
		return nil, nil, errors.New("inconsistencia en totales del comprobante")
	}

	terminos := fmt.Sprintf("Cobro aplicado a deuda(s). Ref.: %s.", settleRef)
	if fromSettlement {
		terminos = fmt.Sprintf("Honorarios según liquidación %s.", settleRef)
	}

	totales := map[string]interface{}{
		"total_anticipos":                 0,
		"total_descuentos":                0,
		"total_cargos":                    0,
		"total_exportacion":               0,
		"total_operaciones_gratuitas":     0,
		"total_operaciones_gravadas":      totGrav,
		"total_operaciones_inafectas":     0,
		"total_operaciones_exoneradas":    0,
		"total_igv":                       totIGV,
		"total_igv_operaciones_gratuitas": 0,
		"total_base_isc":                  0,
		"total_isc":                       0,
		"total_base_otros_impuestos":      0,
		"total_otros_impuestos":           0,
		"total_impuestos_bolsa_plastica":  0,
		"total_impuestos":                 totIGV,
		"total_valor":                     totGrav,
		"subtotal_venta":                  totVenta,
		"total_venta":                     totVenta,
		"total_pendiente_pago":            0,
	}

	doc := map[string]interface{}{
		"serie_documento":              serie,
		"numero_documento":             "#",
		"fecha_de_emision":             dateStr,
		"hora_de_emision":              timeStr,
		"codigo_tipo_documento":        tipoDoc,
		"codigo_tipo_moneda":           "PEN",
		"factor_tipo_de_cambio":        1,
		"codigo_tipo_operacion":        "0101",
		"fecha_de_vencimiento":         dateStr,
		"numero_orden_de_compra":       fmt.Sprintf("Pago %d · %s", pay.ID, settleRef),
		"numero_de_placa":              "",
		"folio":                        "",
		"codigo_consignado":            nil,
		"codigo_direccion_consignado":  nil,
		"consignado_ubigeo":            nil,
		"consignado_direccion":         nil,
		"datos_del_cliente_o_receptor": receptorMapFromCompany(&co),
		"codigo_condicion_de_pago":     "01",
		"codigo_nota_venta":            nil,
		"codigo_vendedor":              "ZContable",
		"pago_anticipado":              0,
		"es_itinerante":                false,
		"totales":                      totales,
		"pagos": []interface{}{
			map[string]interface{}{
				"codigo_metodo_pago":    method,
				"codigo_destino_pago":   dest,
				"referencia":            ref,
				"monto":                 totVenta,
				"pago_recibido":         totVenta,
			},
		},
		"cuotas": []interface{}{},
		"leyendas": []interface{}{
			map[string]interface{}{"codigo": "1000", "valor": leyendaMontoSoles(totVenta)},
		},
		"acciones": map[string]interface{}{
			"enviar_email":       true,
			"enviar_xml_firmado": true,
			"formato_pdf":        "a4",
		},
		"items":                items,
		"descuentos":           []interface{}{map[string]interface{}{"codigo": "00", "descripcion": "Descuento global", "factor": 0, "monto": 0, "base": 0}},
		"cargos":               []interface{}{map[string]interface{}{"codigo": "50", "descripcion": "Cargo global", "factor": 0, "monto": 0, "base": 0}},
		"detraccion":           nil,
		"retencion":            nil,
		"percepcion":           nil,
		"anticipos":            []interface{}{},
		"guias":                []interface{}{},
		"relacionados":         []interface{}{},
		"hotel":                []interface{}{},
		"transport":            []interface{}{},
		"terminos_condiciones": terminos,
	}

	raw, err := json.Marshal(doc)
	if err != nil {
		return nil, nil, err
	}
	rec, respBody, err := s.issueToTukifac(pay.CompanyID, raw, false)
	if err != nil {
		return nil, respBody, err
	}
	if err := s.LinkIssuedReceiptToPayment(rec, &pay); err != nil {
		return rec, respBody, err
	}
	return rec, respBody, nil
}
