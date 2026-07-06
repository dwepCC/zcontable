import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { formatImpuestoPeriodo, formatTaxMoney, parseTaxSectionsJson, type TaxSettlementSectionsPayload } from '../../utils/taxSettlementSections';

type Props = {
  pdt621Json?: string | null;
  className?: string;
};

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <h4 className="text-xs font-semibold text-slate-800">{title}</h4>
      </div>
      <div className="p-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'font-semibold text-slate-900 pt-1 border-t border-slate-100' : 'text-slate-700'}`}>
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
  );
}

export function TaxSettlementSectionsSummary({ pdt621Json, className = '' }: Props) {
  const sections = useMemo(() => parseTaxSectionsJson(pdt621Json), [pdt621Json]);
  if (!sections) return null;

  const hasAny =
    sections.pdt621?.enabled || sections.pdt601?.enabled || sections.itan?.enabled;
  if (!hasAny) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Detalle fiscal (supervisor)</h3>
      </div>

      {sections.pdt621?.enabled ? (
        <SectionBlock title="PDT 621 — IGV y Renta">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-1 pr-2 font-medium">Concepto</th>
                  <th className="py-1 px-2 font-medium text-right">Base</th>
                  <th className="py-1 px-2 font-medium text-right">No grav.</th>
                  <th className="py-1 px-2 font-medium text-right">Impuesto</th>
                  <th className="py-1 pl-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {(
                  [
                    ['Ventas netas', sections.pdt621.ventas_netas, true],
                    ['Notas de crédito', sections.pdt621.notas_credito, true],
                    ['Compras 10.5 %', sections.pdt621.compras_105, false],
                    ['Compras 18 %', sections.pdt621.compras_18, false],
                  ] as const
                ).map(([label, r, withNoGrav]) => (
                  <tr key={label} className="border-b border-slate-50">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatTaxMoney(r.base)}</td>
                    <td className="py-1 px-2 text-right tabular-nums">
                      {withNoGrav ? formatTaxMoney(r.no_gravadas ?? 0) : '—'}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums">{formatTaxMoney(r.impuesto)}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">{formatTaxMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Row label="Impuesto del periodo" value={formatImpuestoPeriodo(sections.pdt621.impuesto_periodo)} />
          <Row label="Crédito periodo anterior" value={formatTaxMoney(sections.pdt621.credito_periodo_anterior)} />
          <Row label="Saldo a favor (final)" value={formatTaxMoney(sections.pdt621.saldo_favor_final)} />
          <Row label="Renta — impuesto a pagar" value={formatTaxMoney(sections.pdt621.renta_impuesto_a_pagar)} />
          <Row label="Subtotal PDT 621" value={formatTaxMoney(sections.pdt621.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      {sections.pdt601?.enabled ? (
        <SectionBlock title="PDT 601 — Planilla electrónica">
          <Row label="ESSALUD" value={formatTaxMoney(sections.pdt601.essalud)} />
          <Row label="ONP" value={formatTaxMoney(sections.pdt601.onp)} />
          <Row label="AFP" value={formatTaxMoney(sections.pdt601.afp)} />
          <Row label="Rta 4ta categoría" value={formatTaxMoney(sections.pdt601.rta_4ta)} />
          <Row label="Rta 5ta categoría" value={formatTaxMoney(sections.pdt601.rta_5ta)} />
          <Row label="Subtotal PDT 601" value={formatTaxMoney(sections.pdt601.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      {sections.itan?.enabled ? (
        <SectionBlock title={`ITAN ${sections.itan.year} — Cuota ${sections.itan.cuota_nro}`}>
          <Row label="Impuesto a pagar" value={formatTaxMoney(sections.itan.impuesto_a_pagar)} bold />
        </SectionBlock>
      ) : null}

      <div className="rounded-lg border-2 border-primary-200 bg-primary-50/70 px-4 py-3 flex justify-between items-center gap-3">
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
