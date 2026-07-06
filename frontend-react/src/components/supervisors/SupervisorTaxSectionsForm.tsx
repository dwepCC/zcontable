import { useMemo, useState } from 'react';
import {
  computeTaxSettlementSections,
  defaultTaxSections,
  formatImpuestoPeriodo,
  formatTaxAmountInput,
  formatTaxMoney,
  formatTaxRowMoney,
  getPdt621NotasCreditoRow,
  getPdt621VentasRow,
  normalizePdt621IgvVentas,
  parseTaxAmount,
  patchPdt621NotasCreditoRow,
  patchPdt621VentasRow,
  sanitizeTaxAmountInput,
  type TaxIGVRow,
  type TaxSectionItan,
  type TaxSectionPdt601,
  type TaxSectionPdt621,
  type TaxSettlementSectionsPayload,
} from '../../utils/taxSettlementSections';
import {
  formatRentaRateLabel,
  getRentaMensualRatePct,
  type CompanyTaxRegime,
  type LiquidationRentaRegime,
} from '../../utils/companyTaxRegime';
import {
  computeIgvFromBase,
  formatCompanyIgvRateLabel,
  type CompanyIgvRate,
} from '../../utils/companyIgv';

type Props = {
  value: TaxSettlementSectionsPayload;
  onChange: (next: TaxSettlementSectionsPayload) => void;
  currentYear?: number;
  companyIgvRate: CompanyIgvRate;
  companyTaxRegime: CompanyTaxRegime;
  igvAplicableVentas: CompanyIgvRate[];
  rentaRegimen: LiquidationRentaRegime;
};

function AmountField({
  label,
  value,
  onChange,
  readOnly,
  className = '',
  formatValue,
  useRowMoneyFormat = false,
}: {
  label: string;
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
  className?: string;
  formatValue?: (n: number) => string;
  useRowMoneyFormat?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const readDisplay = formatValue
    ? formatValue(value)
    : useRowMoneyFormat
      ? formatTaxRowMoney(value)
      : formatTaxMoney(value);

  const inputValue = focused ? (draft ?? formatTaxAmountInput(value)) : formatTaxAmountInput(value);

  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      {readOnly ? (
        <div className="px-2.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm tabular-nums text-slate-800">
          {readDisplay}
        </div>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onFocus={() => {
            setFocused(true);
            setDraft(formatTaxAmountInput(value));
          }}
          onChange={(e) => {
            const sanitized = sanitizeTaxAmountInput(e.target.value);
            setDraft(sanitized);
            if (sanitized === '' || sanitized === '.') {
              if (sanitized === '') onChange?.(0);
              return;
            }
            if (sanitized.endsWith('.')) return;
            onChange?.(parseTaxAmount(sanitized));
          }}
          onBlur={() => {
            setFocused(false);
            if (draft !== null) {
              onChange?.(parseTaxAmount(draft));
            }
            setDraft(null);
          }}
          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm tabular-nums focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
          placeholder="0.00"
        />
      )}
    </div>
  );
}

function IGVRowFields({
  title,
  row,
  onChange,
  withNoGravadas,
  igvRate,
}: {
  title: string;
  row: TaxIGVRow;
  onChange: (patch: Partial<TaxIGVRow>) => void;
  withNoGravadas: boolean;
  igvRate: CompanyIgvRate;
}) {
  const applyPatch = (patch: Partial<TaxIGVRow>) => {
    const nextBase = patch.base ?? row.base;
    const next: Partial<TaxIGVRow> = { ...patch };
    if ('base' in patch) {
      next.impuesto = computeIgvFromBase(nextBase, igvRate);
    }
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      <div className={`grid grid-cols-2 ${withNoGravadas ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2`}>
        <AmountField label="Base imponible" value={row.base} onChange={(n) => applyPatch({ base: n })} />
        {withNoGravadas ? (
          <AmountField label="No gravadas" value={row.no_gravadas ?? 0} onChange={(n) => applyPatch({ no_gravadas: n })} />
        ) : null}
        <AmountField label={`Impuesto (${formatCompanyIgvRateLabel(igvRate)})`} value={row.impuesto} readOnly useRowMoneyFormat />
        <AmountField label="Total" value={row.total} readOnly useRowMoneyFormat />
      </div>
    </div>
  );
}

function SectionToggle({
  id,
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <label
        htmlFor={id}
        className="flex items-start gap-3 px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100/80 transition-colors"
      >
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          <span className="block text-xs text-slate-500 mt-0.5">{subtitle}</span>
        </span>
      </label>
      {enabled ? <div className="p-4 space-y-4 border-t border-slate-100">{children}</div> : null}
    </div>
  );
}

const SupervisorTaxSectionsForm = ({
  value,
  onChange,
  currentYear = new Date().getFullYear(),
  companyIgvRate,
  companyTaxRegime,
  igvAplicableVentas,
  rentaRegimen,
}: Props) => {
  const computed = useMemo(() => computeTaxSettlementSections(value), [value]);

  const p621Raw = computed.pdt621 ?? defaultTaxSections(currentYear).pdt621!;
  const p621 = useMemo(() => normalizePdt621IgvVentas(p621Raw, companyIgvRate), [p621Raw, companyIgvRate]);
  const rentaRatePct = getRentaMensualRatePct(rentaRegimen, p621.renta_coeficiente_pct, companyTaxRegime);
  const p601 = computed.pdt601 ?? defaultTaxSections(currentYear).pdt601!;
  const itan = computed.itan ?? defaultTaxSections(currentYear).itan!;

  const patch = (partial: Partial<TaxSettlementSectionsPayload>) => {
    onChange(computeTaxSettlementSections({ ...value, ...partial }));
  };

  const patch621 = (partial: Partial<TaxSectionPdt621>) => {
    patch({ pdt621: { ...p621, ...partial } });
  };

  const patchVentasByRate = (rate: CompanyIgvRate, rowPatch: Partial<TaxIGVRow>) => {
    const current = getPdt621VentasRow(p621, rate);
    const nextBase = rowPatch.base ?? current.base;
    const next: Partial<TaxIGVRow> = { ...rowPatch };
    if ('base' in rowPatch) {
      next.impuesto = computeIgvFromBase(nextBase, rate);
    }
    patch621(patchPdt621VentasRow(p621, rate, next));
  };

  const patchNotasByRate = (rate: CompanyIgvRate, rowPatch: Partial<TaxIGVRow>) => {
    const current = getPdt621NotasCreditoRow(p621, rate);
    const nextBase = rowPatch.base ?? current.base;
    const next: Partial<TaxIGVRow> = { ...rowPatch };
    if ('base' in rowPatch) {
      next.impuesto = computeIgvFromBase(nextBase, rate);
    }
    patch621(patchPdt621NotasCreditoRow(p621, rate, next));
  };

  const patchIGV = (key: 'compras_105' | 'compras_18', rowPatch: Partial<TaxIGVRow>, igvRate: CompanyIgvRate) => {
    const row = p621[key];
    const nextBase = rowPatch.base ?? row.base;
    const next: Partial<TaxIGVRow> = { ...rowPatch };
    if ('base' in rowPatch) {
      next.impuesto = computeIgvFromBase(nextBase, igvRate);
    }
    patch621({ [key]: { ...row, ...next } });
  };

  const patch601 = (partial: Partial<TaxSectionPdt601>) => {
    patch({ pdt601: { ...p601, ...partial } });
  };

  const patchItan = (partial: Partial<TaxSectionItan>) => {
    patch({ itan: { ...itan, ...partial } });
  };

  return (
    <div className="space-y-4">
      <SectionToggle
        id="sec-pdt621"
        title="PDT 621 — IGV y Renta"
        subtitle="IGV mensual, créditos, percepciones y renta mensual."
        enabled={p621.enabled}
        onToggle={(enabled) => patch621({ enabled })}
      >
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">1. IGV mensual</h4>
          <div className="space-y-3">
            {igvAplicableVentas.map((rate) => (
              <div key={`ventas-nc-${rate}`} className="space-y-3">
                <IGVRowFields
                  title={`Ventas netas (${formatCompanyIgvRateLabel(rate)})`}
                  row={getPdt621VentasRow(p621, rate)}
                  onChange={(p) => patchVentasByRate(rate, p)}
                  withNoGravadas
                  igvRate={rate}
                />
                <IGVRowFields
                  title={`(−) Notas de crédito (${formatCompanyIgvRateLabel(rate)})`}
                  row={getPdt621NotasCreditoRow(p621, rate)}
                  onChange={(p) => patchNotasByRate(rate, p)}
                  withNoGravadas
                  igvRate={rate}
                />
              </div>
            ))}
            <IGVRowFields
              title="(−) Compras 10.5 %"
              row={p621.compras_105}
              onChange={(p) => patchIGV('compras_105', p, 10.5)}
              withNoGravadas
              igvRate={10.5}
            />
            <IGVRowFields
              title="(−) Compras 18 %"
              row={p621.compras_18}
              onChange={(p) => patchIGV('compras_18', p, 18)}
              withNoGravadas
              igvRate={18}
            />
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AmountField
              label="Impuesto del periodo"
              value={p621.impuesto_periodo}
              readOnly
              formatValue={formatImpuestoPeriodo}
            />
            <AmountField
              label="Crédito periodo anterior"
              value={p621.credito_periodo_anterior}
              onChange={(n) => patch621({ credito_periodo_anterior: n })}
            />
            <AmountField label="Saldo a favor" value={p621.saldo_favor} readOnly />
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Percepciones</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AmountField
                label="Percepciones del periodo"
                value={p621.percepciones_periodo}
                onChange={(n) => patch621({ percepciones_periodo: n })}
              />
              <AmountField
                label="Percepciones periodos anteriores"
                value={p621.percepciones_anteriores}
                onChange={(n) => patch621({ percepciones_anteriores: n })}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Retenciones</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AmountField
                label="Retenciones del periodo"
                value={p621.retenciones_periodo}
                onChange={(n) => patch621({ retenciones_periodo: n })}
              />
              <AmountField
                label="Retenciones periodos anteriores"
                value={p621.retenciones_anteriores}
                onChange={(n) => patch621({ retenciones_anteriores: n })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
            <AmountField label="Saldo a favor (final)" value={p621.saldo_favor_final} readOnly />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">2. Renta mensual</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <AmountField label="Ingresos netos (base)" value={p621.renta_ventas_base} readOnly useRowMoneyFormat />
            <AmountField
              label={`Impuesto renta (${formatRentaRateLabel(rentaRatePct)})`}
              value={p621.renta_ventas_impuesto}
              readOnly
              useRowMoneyFormat
            />
            <AmountField
              label="Saldo a favor ITAN"
              value={p621.renta_saldo_favor_itan}
              onChange={(n) => patch621({ renta_saldo_favor_itan: n })}
            />
            <AmountField label="Impuesto a pagar (renta)" value={p621.renta_impuesto_a_pagar} readOnly />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <div className="text-right">
            <p className="text-xs text-slate-500">Impuesto a pagar — PDT 621</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatTaxMoney(p621.impuesto_a_pagar)}</p>
          </div>
        </div>
      </SectionToggle>

      <SectionToggle
        id="sec-pdt601"
        title="PDT 601 — Planilla electrónica"
        subtitle="ESSALUD, ONP, AFP y renta de 4ta y 5ta categoría."
        enabled={p601.enabled}
        onToggle={(enabled) => patch601({ enabled })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <AmountField label="ESSALUD" value={p601.essalud} onChange={(n) => patch601({ essalud: n })} />
          <AmountField label="ONP" value={p601.onp} onChange={(n) => patch601({ onp: n })} />
          <AmountField label="AFP" value={p601.afp} onChange={(n) => patch601({ afp: n })} />
          <AmountField label="Rta 4ta categoría" value={p601.rta_4ta} onChange={(n) => patch601({ rta_4ta: n })} />
          <AmountField label="Rta 5ta categoría" value={p601.rta_5ta} onChange={(n) => patch601({ rta_5ta: n })} />
        </div>
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <div className="text-right">
            <p className="text-xs text-slate-500">Impuesto a pagar — PDT 601</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatTaxMoney(p601.impuesto_a_pagar)}</p>
          </div>
        </div>
      </SectionToggle>

      <SectionToggle
        id="sec-itan"
        title={`ITAN ${currentYear}`}
        subtitle="Cuota del Impuesto Temporal a los Activos Netos."
        enabled={itan.enabled}
        onToggle={(enabled) => patchItan({ enabled, year: currentYear })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Cuota N°</label>
            <input
              type="number"
              min={1}
              max={12}
              value={itan.cuota_nro}
              onChange={(e) => patchItan({ cuota_nro: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500/30 outline-none"
            />
          </div>
          <AmountField label="Impuesto" value={itan.impuesto} onChange={(n) => patchItan({ impuesto: n })} />
          <AmountField label="Impuesto a pagar" value={itan.impuesto_a_pagar} readOnly />
        </div>
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <div className="text-right">
            <p className="text-xs text-slate-500">Impuesto a pagar — ITAN</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatTaxMoney(itan.impuesto_a_pagar)}</p>
          </div>
        </div>
      </SectionToggle>

      <div className="rounded-xl border-2 border-primary-200 bg-primary-50/80 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary-900">Total impuestos a pagar</p>
          <p className="text-xs text-primary-800/80 mt-0.5">Suma de las secciones activas.</p>
        </div>
        <p className="text-2xl font-bold text-primary-900 tabular-nums">{formatTaxMoney(computed.grand_total_impuesto_a_pagar)}</p>
      </div>
    </div>
  );
};

export default SupervisorTaxSectionsForm;
