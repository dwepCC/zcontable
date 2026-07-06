export type TaxIGVRow = {
  base: number;
  no_gravadas?: number;
  impuesto: number;
  total: number;
};

export type TaxSectionPdt621 = {
  enabled: boolean;
  ventas_netas: TaxIGVRow;
  notas_credito: TaxIGVRow;
  compras_105: TaxIGVRow;
  compras_18: TaxIGVRow;
  credito_periodo_anterior: number;
  percepciones_periodo: number;
  percepciones_anteriores: number;
  retenciones_periodo: number;
  retenciones_anteriores: number;
  renta_ventas_base: number;
  renta_ventas_impuesto: number;
  renta_saldo_favor_itan: number;
  impuesto_periodo: number;
  saldo_favor: number;
  saldo_favor_final: number;
  renta_impuesto_a_pagar: number;
  impuesto_a_pagar: number;
};

export type TaxSectionPdt601 = {
  enabled: boolean;
  essalud: number;
  onp: number;
  afp: number;
  rta_4ta: number;
  rta_5ta: number;
  impuesto_a_pagar: number;
};

export type TaxSectionItan = {
  enabled: boolean;
  year: number;
  cuota_nro: number;
  impuesto: number;
  impuesto_a_pagar: number;
};

export type TaxSettlementSectionsPayload = {
  version: number;
  pdt621?: TaxSectionPdt621;
  pdt601?: TaxSectionPdt601;
  itan?: TaxSectionItan;
  grand_total_impuesto_a_pagar: number;
};

export const TAX_SECTIONS_VERSION = 1;

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Impuesto del periodo: entero superior en magnitud si hay centavos (106.50→107, -106.50→-107). */
export function roundImpuestoPeriodo(v: number): number {
  const normalized = roundMoney(v);
  const cents = Math.round(normalized * 100);
  const whole = Math.trunc(cents / 100);
  const rem = cents - whole * 100;
  if (rem === 0) return whole;
  if (cents > 0) return whole + 1;
  return whole - 1;
}

function computeIGVRowTotal(base: number, noGravadas: number, impuesto: number, withNoGravadas: boolean): number {
  if (withNoGravadas) return roundMoney(base + noGravadas + impuesto);
  return roundMoney(base + impuesto);
}

function emptyIGVRow(): TaxIGVRow {
  return { base: 0, no_gravadas: 0, impuesto: 0, total: 0 };
}

export function defaultPdt621Section(): TaxSectionPdt621 {
  return {
    enabled: false,
    ventas_netas: emptyIGVRow(),
    notas_credito: emptyIGVRow(),
    compras_105: emptyIGVRow(),
    compras_18: emptyIGVRow(),
    credito_periodo_anterior: 0,
    percepciones_periodo: 0,
    percepciones_anteriores: 0,
    retenciones_periodo: 0,
    retenciones_anteriores: 0,
    renta_ventas_base: 0,
    renta_ventas_impuesto: 0,
    renta_saldo_favor_itan: 0,
    impuesto_periodo: 0,
    saldo_favor: 0,
    saldo_favor_final: 0,
    renta_impuesto_a_pagar: 0,
    impuesto_a_pagar: 0,
  };
}

export function defaultPdt601Section(): TaxSectionPdt601 {
  return {
    enabled: false,
    essalud: 0,
    onp: 0,
    afp: 0,
    rta_4ta: 0,
    rta_5ta: 0,
    impuesto_a_pagar: 0,
  };
}

export function defaultItanSection(currentYear: number): TaxSectionItan {
  return {
    enabled: false,
    year: currentYear,
    cuota_nro: 1,
    impuesto: 0,
    impuesto_a_pagar: 0,
  };
}

export function defaultTaxSections(currentYear = new Date().getFullYear()): TaxSettlementSectionsPayload {
  return {
    version: TAX_SECTIONS_VERSION,
    pdt621: defaultPdt621Section(),
    pdt601: defaultPdt601Section(),
    itan: defaultItanSection(currentYear),
    grand_total_impuesto_a_pagar: 0,
  };
}

function computePdt621Section(s: TaxSectionPdt621): TaxSectionPdt621 {
  const ventas_netas = {
    ...s.ventas_netas,
    total: computeIGVRowTotal(s.ventas_netas.base, s.ventas_netas.no_gravadas ?? 0, s.ventas_netas.impuesto, true),
  };
  const notas_credito = {
    ...s.notas_credito,
    total: computeIGVRowTotal(s.notas_credito.base, s.notas_credito.no_gravadas ?? 0, s.notas_credito.impuesto, true),
  };
  const compras_105 = {
    ...s.compras_105,
    total: computeIGVRowTotal(s.compras_105.base, 0, s.compras_105.impuesto, false),
  };
  const compras_18 = {
    ...s.compras_18,
    total: computeIGVRowTotal(s.compras_18.base, 0, s.compras_18.impuesto, false),
  };

  const impuesto_periodo = roundImpuestoPeriodo(
    ventas_netas.impuesto - notas_credito.impuesto - compras_105.impuesto - compras_18.impuesto,
  );
  const saldo_favor = roundMoney(impuesto_periodo - s.credito_periodo_anterior);
  const saldo_favor_final = roundMoney(
    saldo_favor +
      s.percepciones_periodo +
      s.percepciones_anteriores +
      s.retenciones_periodo +
      s.retenciones_anteriores,
  );

  let renta_impuesto_a_pagar = roundMoney(s.renta_ventas_impuesto - s.renta_saldo_favor_itan);
  if (renta_impuesto_a_pagar < 0) renta_impuesto_a_pagar = 0;

  const igvPagar = saldo_favor_final > 0 ? saldo_favor_final : 0;
  const impuesto_a_pagar = roundMoney(renta_impuesto_a_pagar + igvPagar);

  return {
    ...s,
    ventas_netas,
    notas_credito,
    compras_105,
    compras_18,
    impuesto_periodo,
    saldo_favor,
    saldo_favor_final,
    renta_impuesto_a_pagar,
    impuesto_a_pagar,
  };
}

function computePdt601Section(s: TaxSectionPdt601): TaxSectionPdt601 {
  const impuesto_a_pagar = roundMoney(s.essalud + s.onp + s.afp + s.rta_4ta + s.rta_5ta);
  return { ...s, impuesto_a_pagar };
}

function computeItanSection(s: TaxSectionItan): TaxSectionItan {
  return { ...s, impuesto_a_pagar: roundMoney(s.impuesto) };
}

export function computeTaxSettlementSections(p: TaxSettlementSectionsPayload): TaxSettlementSectionsPayload {
  const out: TaxSettlementSectionsPayload = {
    ...p,
    version: p.version || TAX_SECTIONS_VERSION,
    pdt621: p.pdt621 ? computePdt621Section(p.pdt621) : undefined,
    pdt601: p.pdt601 ? computePdt601Section(p.pdt601) : undefined,
    itan: p.itan ? computeItanSection(p.itan) : undefined,
    grand_total_impuesto_a_pagar: 0,
  };
  let grand = 0;
  if (out.pdt621?.enabled) grand += out.pdt621.impuesto_a_pagar;
  if (out.pdt601?.enabled) grand += out.pdt601.impuesto_a_pagar;
  if (out.itan?.enabled) grand += out.itan.impuesto_a_pagar;
  out.grand_total_impuesto_a_pagar = roundMoney(grand);
  return out;
}

export function parseTaxSectionsJson(raw: string | undefined | null): TaxSettlementSectionsPayload | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  try {
    const p = JSON.parse(t) as TaxSettlementSectionsPayload;
    if (!p.version && !p.pdt621 && !p.pdt601 && !p.itan) return null;
    return computeTaxSettlementSections(p);
  } catch {
    return null;
  }
}

export function formatTaxMoney(n: number): string {
  return `S/ ${Number(n ?? 0).toFixed(2)}`;
}

/** Formato entero para impuesto del periodo (sin decimales). */
export function formatImpuestoPeriodo(n: number): string {
  return `S/ ${Math.trunc(Number(n ?? 0))}`;
}

/** Sanitiza entrada numérica de montos. */
export function sanitizeTaxAmountInput(raw: string): string {
  let out = '';
  let hasSep = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
      continue;
    }
    if ((ch === '.' || ch === ',') && !hasSep) {
      out += ch;
      hasSep = true;
    }
  }
  return out;
}

export function parseTaxAmount(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
