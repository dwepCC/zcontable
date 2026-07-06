import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { formatCompanyIgvRateLabel } from '../../utils/companyIgv';
import {
  formatLiquidationRentaRegimeLabel,
  formatRentaRateLabel,
  getRentaMensualRatePct,
} from '../../utils/companyTaxRegime';
import {
  computeTaxSettlementSections,
  formatImpuestoPeriodo,
  formatTaxMoney,
  formatTaxRowMoney,
  listPdt621IgvDisplayRows,
  parseTaxSectionsJson,
  type TaxSettlementSectionsPayload,
} from '../../utils/taxSettlementSections';

type Props = {
  pdt621Json?: string | null;
  sections?: TaxSettlementSectionsPayload | null;
  className?: string;
  /** embedded = dentro del panel Finanzas; sin título duplicado */
  variant?: 'default' | 'embedded';
};

function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <h4 className="text-xs font-semibold text-slate-800">{title}</h4>
        {subtitle ? <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="p-3 space-y-3 text-sm">{children}</div>
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 pt-1">{children}</p>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 ${bold ? 'font-semibold text-slate-900 pt-1 border-t border-slate-100' : 'text-slate-700'}`}
    >
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums shrink-0 text-right">{value}</span>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 leading-snug">{value}</p>
    </div>
  );
}

export function TaxSettlementSectionsSummary({
  pdt621Json,
  sections: sectionsProp,
  className = '',
  variant = 'default',
}: Props) {
  const sections = useMemo(() => {
    if (sectionsProp) return computeTaxSettlementSections(sectionsProp);
    return parseTaxSectionsJson(pdt621Json);
  }, [pdt621Json, sectionsProp]);
  if (!sections) return null;

  const hasAny = sections.pdt621?.enabled || sections.pdt601?.enabled || sections.itan?.enabled;
  if (!hasAny) return null;

  const p621 = sections.pdt621;
  const igvRatesLabel =
    p621?.enabled && p621.igv_aplicable_ventas?.length
      ? p621.igv_aplicable_ventas.map((r) => formatCompanyIgvRateLabel(r)).join(' · ')
      : null;
  const rentaRegimen = p621?.renta_regimen;
  const rentaRatePct =
    p621?.enabled && rentaRegimen
      ? getRentaMensualRatePct(rentaRegimen, p621.renta_coeficiente_pct ?? 0)
      : null;

  return (
    <div className={`space-y-4 ${className}`}>
      {variant === 'default' ? (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Detalle fiscal (supervisor)</h3>
        </div>
      ) : null}

      {sections.pdt621?.enabled ? (
        <SectionBlock title="PDT 621 — IGV y Renta" subtitle="Impuesto mensual, créditos, percepciones, retenciones y renta.">
          {igvRatesLabel || rentaRegimen ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {igvRatesLabel ? (
                <MetaChip label="IGV aplicable (ventas y NC)" value={igvRatesLabel} />
              ) : null}
              {rentaRegimen && rentaRatePct != null ? (
                <MetaChip
                  label="Régimen renta mensual"
                  value={`${formatLiquidationRentaRegimeLabel(rentaRegimen)} · ${formatRentaRateLabel(rentaRatePct)}`}
                />
              ) : null}
            </div>
          ) : null}

          <SubHeading>1. IGV mensual</SubHeading>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-1.5 pr-2 font-medium">Concepto</th>
                  <th className="py-1.5 px-2 font-medium text-right">Base</th>
                  <th className="py-1.5 px-2 font-medium text-right">No grav.</th>
                  <th className="py-1.5 px-2 font-medium text-right">Impuesto</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {listPdt621IgvDisplayRows(sections.pdt621!).map(({ label, row, withNoGravadas }) => (
                  <tr key={label} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2">{label}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatTaxMoney(row.base)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {withNoGravadas ? formatTaxMoney(row.no_gravadas ?? 0) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatTaxMoney(row.impuesto)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{formatTaxMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <Row label="Impuesto del periodo" value={formatImpuestoPeriodo(sections.pdt621!.impuesto_periodo)} />
            <Row label="Crédito periodo anterior" value={formatTaxMoney(sections.pdt621!.credito_periodo_anterior)} />
            <Row label="Saldo a favor" value={formatTaxMoney(sections.pdt621!.saldo_favor)} />
          </div>

          <SubHeading>Percepciones</SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <Row label="Del periodo" value={formatTaxMoney(sections.pdt621!.percepciones_periodo)} />
            <Row label="Periodos anteriores" value={formatTaxMoney(sections.pdt621!.percepciones_anteriores)} />
          </div>

          <SubHeading>Retenciones</SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <Row label="Del periodo" value={formatTaxMoney(sections.pdt621!.retenciones_periodo)} />
            <Row label="Periodos anteriores" value={formatTaxMoney(sections.pdt621!.retenciones_anteriores)} />
          </div>

          <Row label="Saldo a favor (final)" value={formatTaxMoney(sections.pdt621!.saldo_favor_final)} bold />

          <SubHeading>2. Renta mensual</SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1">
            <Row label="Ingresos netos (base)" value={formatTaxRowMoney(sections.pdt621!.renta_ventas_base)} />
            <Row
              label={`Impuesto renta${rentaRatePct != null ? ` (${formatRentaRateLabel(rentaRatePct)})` : ''}`}
              value={formatTaxRowMoney(sections.pdt621!.renta_ventas_impuesto)}
            />
            <Row label="Saldo a favor ITAN" value={formatTaxMoney(sections.pdt621!.renta_saldo_favor_itan)} />
            <Row label="Impuesto a pagar (renta)" value={formatTaxMoney(sections.pdt621!.renta_impuesto_a_pagar)} />
          </div>

          <Row label="Subtotal PDT 621" value={formatTaxMoney(sections.pdt621!.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      {sections.pdt601?.enabled ? (
        <SectionBlock title="PDT 601 — Planilla electrónica">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            <Row label="ESSALUD" value={formatTaxMoney(sections.pdt601.essalud)} />
            <Row label="ONP" value={formatTaxMoney(sections.pdt601.onp)} />
            <Row label="AFP" value={formatTaxMoney(sections.pdt601.afp)} />
            <Row label="Rta 4ta categoría" value={formatTaxMoney(sections.pdt601.rta_4ta)} />
            <Row label="Rta 5ta categoría" value={formatTaxMoney(sections.pdt601.rta_5ta)} />
          </div>
          <Row label="Subtotal PDT 601" value={formatTaxMoney(sections.pdt601.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      {sections.itan?.enabled ? (
        <SectionBlock title={`ITAN ${sections.itan.year} — Cuota ${sections.itan.cuota_nro}`}>
          <Row label="Impuesto a pagar" value={formatTaxMoney(sections.itan.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      <div className="rounded-lg border-2 border-primary-200 bg-primary-50/70 px-4 py-3 flex flex-wrap justify-between items-center gap-3">
        <span className="text-sm font-semibold text-primary-900">Total impuestos a pagar</span>
        <span className="text-xl font-bold text-primary-900 tabular-nums">
          {formatTaxMoney(sections.grand_total_impuesto_a_pagar)}
        </span>
      </div>
    </div>
  );
}

export function hasTaxSectionsData(pdt621Json?: string | null): boolean {
  const s = parseTaxSectionsJson(pdt621Json) as TaxSettlementSectionsPayload | null;
  if (!s) return false;
  return Boolean(s.pdt621?.enabled || s.pdt601?.enabled || s.itan?.enabled);
}

export default TaxSettlementSectionsSummary;
