import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { auth } from '../../services/auth';
import { P } from '../../rbac/codes';
import { PAGE_WORKSPACE_CLASS } from '../../constants/pageLayout';
import { companiesService } from '../../services/companies';
import { companyAccessCredentialsService } from '../../services/companyAccessCredentials';
import { supervisorTaxSettlementsService } from '../../services/supervisorTaxSettlements';
import type { Company } from '../../types/dashboard';
import { extractApiErrorMessage } from '../../utils/apiError';
import SupervisorTaxSectionsForm from '../../components/supervisors/SupervisorTaxSectionsForm';
import {
  computeTaxSettlementSections,
  defaultTaxSections,
  parseTaxSectionsJson,
  type TaxSettlementSectionsPayload,
} from '../../utils/taxSettlementSections';
import { formatCompanyIgvRateLabel, parseCompanyIgvRate } from '../../utils/companyIgv';

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function previousMonthYMFromDate(d: Date): string {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
}

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function periodLabelFromYM(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return '';
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (!Number.isFinite(y) || m < 1 || m > 12) return '';
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
}

function issueDateFromSettlement(raw?: string): string {
  if (!raw) return formatDateInput(new Date());
  if (raw.length >= 10) return raw.slice(0, 10);
  return raw;
}

const SupervisorLiquidacionCreatePage = () => {
  const { companyId: companyIdParam, settlementId: settlementIdParam } = useParams();
  const settlementId = settlementIdParam ? Number(settlementIdParam) : null;
  const isEdit = Boolean(settlementId && Number.isFinite(settlementId) && settlementId > 0);
  const companyIdFromRoute = companyIdParam ? Number(companyIdParam) : null;
  const navigate = useNavigate();
  const canCreate = useMemo(() => auth.hasPermission(P.supervisorsLiquidationsCreate), []);
  const canUpdate = useMemo(() => auth.hasPermission(P.supervisorsLiquidationsUpdate), []);
  const canSubmit = isEdit ? canUpdate : canCreate;

  const [companyId, setCompanyId] = useState<number | null>(companyIdFromRoute);
  const [company, setCompany] = useState<Company | null>(null);
  const [assistantName, setAssistantName] = useState('—');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [issueDate, setIssueDate] = useState(() => formatDateInput(new Date()));
  const [liquidationPeriod, setLiquidationPeriod] = useState(() => previousMonthYMFromDate(new Date()));
  const liquidationPeriodManualRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [taxSections, setTaxSections] = useState<TaxSettlementSectionsPayload>(() => defaultTaxSections(new Date().getFullYear()));
  const [settlementNumber, setSettlementNumber] = useState('');

  const taxSectionsComputed = useMemo(() => computeTaxSettlementSections(taxSections), [taxSections]);
  const currentYear = new Date().getFullYear();
  const companyIgvRate = useMemo(() => parseCompanyIgvRate(company?.igv_rate), [company?.igv_rate]);
  const igvConfigured = companyIgvRate != null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoadingCompany(true);
        setError('');

        let coId: number;
        if (isEdit && settlementId) {
          const settlement = await supervisorTaxSettlementsService.get(settlementId);
          if (cancelled) return;
          if (settlement.status !== 'borrador') {
            setError('Esta liquidación ya no está en borrador y no puede editarse desde Supervisores.');
            setCompany(null);
            return;
          }
          coId = settlement.company_id;
          setCompanyId(coId);
          setSettlementNumber(settlement.number || `#${settlement.id}`);
          setIssueDate(issueDateFromSettlement(settlement.issue_date));
          setLiquidationPeriod(settlement.liquidation_period || previousMonthYMFromDate(new Date()));
          liquidationPeriodManualRef.current = true;
          const parsed = parseTaxSectionsJson(settlement.pdt621_json);
          if (parsed) {
            setTaxSections({
              version: parsed.version,
              pdt621: parsed.pdt621,
              pdt601: parsed.pdt601,
              itan: parsed.itan,
              grand_total_impuesto_a_pagar: parsed.grand_total_impuesto_a_pagar,
            });
          }
        } else if (Number.isFinite(companyIdFromRoute) && companyIdFromRoute && companyIdFromRoute > 0) {
          coId = companyIdFromRoute;
          setCompanyId(coId);
        } else {
          setError('Empresa inválida');
          setCompany(null);
          return;
        }

        const [co, cred] = await Promise.all([
          companiesService.get(coId),
          companyAccessCredentialsService.get(coId).catch(() => null),
        ]);
        if (cancelled) return;
        setCompany(co);
        setAssistantName(
          co.assistant?.name?.trim() ||
            co.assistant?.username?.trim() ||
            cred?.assistant_username?.trim() ||
            '—',
        );
      } catch (err) {
        if (!cancelled) {
          setError(extractApiErrorMessage(err, isEdit ? 'No se pudo cargar la liquidación.' : 'No se pudo cargar la empresa.'));
          setCompany(null);
        }
      } finally {
        if (!cancelled) setLoadingCompany(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyIdFromRoute, isEdit, settlementId]);

  useEffect(() => {
    if (isEdit) return;
    if (liquidationPeriodManualRef.current) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return;
    const [yy, mo, dd] = issueDate.split('-').map((x) => Number(x));
    if (!Number.isFinite(yy) || !Number.isFinite(mo) || !Number.isFinite(dd)) return;
    const d = new Date(yy, mo - 1, dd);
    setLiquidationPeriod(previousMonthYMFromDate(d));
  }, [issueDate, isEdit]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!company || !companyId || companyId <= 0) return;
    if (!companyIgvRate) {
      setError('Configure el IGV de la empresa antes de guardar la liquidación.');
      return;
    }
    const lp = liquidationPeriod.trim();
    if (!/^\d{4}-\d{2}$/.test(lp)) {
      setError('Indique un periodo válido (AAAA-MM)');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        issue_date: `${issueDate}T12:00:00Z`,
        liquidation_period: lp,
        period_label: periodLabelFromYM(lp) || lp,
        tax_sections: taxSectionsComputed,
      };
      if (isEdit && settlementId) {
        const updated = await supervisorTaxSettlementsService.update(settlementId, payload);
        window.dispatchEvent(
          new CustomEvent('miweb:toast', {
            detail: {
              type: 'success',
              message: `Liquidación ${updated.number || `#${updated.id}`} actualizada.`,
            },
          }),
        );
      } else {
        const created = await supervisorTaxSettlementsService.create({
          company_id: companyId,
          ...payload,
        });
        window.dispatchEvent(
          new CustomEvent('miweb:toast', {
            detail: {
              type: 'success',
              message: `Liquidación ${created.number || `#${created.id}`} creada en borrador. Finanzas puede continuar el proceso.`,
            },
          }),
        );
      }
      navigate('/supervisors/liquidaciones');
    } catch (err) {
      setError(extractApiErrorMessage(err, isEdit ? 'No se pudo actualizar la liquidación.' : 'No se pudo crear la liquidación.'));
    } finally {
      setSaving(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className={PAGE_WORKSPACE_CLASS}>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
          No tiene permiso para {isEdit ? 'editar' : 'crear'} liquidaciones.
        </div>
      </div>
    );
  }

  if (loadingCompany) {
    return (
      <div className={`${PAGE_WORKSPACE_CLASS} text-center text-slate-500 text-sm py-12`}>
        <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
        Cargando…
      </div>
    );
  }

  if (!company) {
    return (
      <div className={PAGE_WORKSPACE_CLASS}>
        <Link to="/supervisors/liquidaciones" className="text-sm text-primary-700 hover:text-primary-800 font-medium">
          ← Volver al listado
        </Link>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error || 'Empresa no encontrada o sin acceso.'}
        </div>
      </div>
    );
  }

  return (
    <div className={`${PAGE_WORKSPACE_CLASS} w-full min-w-0 max-w-full`}>
      <div>
        <Link to="/supervisors/liquidaciones" className="text-sm text-primary-700 hover:text-primary-800 font-medium">
          ← Volver al listado
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mt-2">
          {isEdit ? 'Editar liquidación' : 'Crear liquidación'}
        </h1>
        <p className="text-slate-500 mt-1 text-sm max-w-3xl">
          {isEdit ? (
            <>
              Actualice la información fiscal de la liquidación{' '}
              <span className="font-medium text-slate-700">{settlementNumber}</span> para{' '}
              <span className="font-medium text-slate-700">{company.business_name}</span>. Solo editable mientras esté
              en borrador.
            </>
          ) : (
            <>
              Registro inicial para <span className="font-medium text-slate-700">{company.business_name}</span>. Indique
              fecha, periodo y las secciones fiscales que correspondan; Finanzas completará deudas y emisión.
            </>
          )}
        </p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="w-full min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 md:p-6">
        <h2 className="text-sm font-semibold text-slate-800">Empresa</h2>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6 text-sm">
          <div className="min-w-0 sm:col-span-2 lg:col-span-5">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Razón social</dt>
            <dd className="mt-1 font-medium text-slate-800 leading-snug">{company.business_name}</dd>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">RUC</dt>
            <dd className="mt-1 font-mono text-slate-800">{company.ruc || '—'}</dd>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Código interno</dt>
            <dd className="mt-1 font-mono text-slate-800">{company.code || '—'}</dd>
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Asistente asignado</dt>
            <dd className="mt-1 text-slate-800">{assistantName}</dd>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">IGV aplicable</dt>
            <dd className="mt-1 text-slate-800">
              {companyIgvRate ? formatCompanyIgvRateLabel(companyIgvRate) : 'Sin configurar'}
            </dd>
          </div>
        </dl>
      </section>

      {!igvConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p className="font-medium">Esta empresa no tiene IGV configurado.</p>
          <p className="mt-1 text-amber-900/90">
            Debe registrar la tasa IGV en los datos de la empresa antes de guardar la liquidación.
          </p>
          <Link
            to={`/companies/${company.id}/edit`}
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary-800 hover:text-primary-900 underline-offset-2 hover:underline"
          >
            <i className="fas fa-building text-xs" aria-hidden />
            Configurar IGV en la empresa
          </Link>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void submit(e)}
        className="w-full min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 md:p-6 space-y-5"
      >
        <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Datos de la liquidación</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:max-w-2xl">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="sup-liq-issue-date">
              Fecha de emisión
            </label>
            <input
              id="sup-liq-issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              required
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="sup-liq-period">
              Periodo de la liquidación (año-mes)
            </label>
            <input
              id="sup-liq-period"
              type="month"
              value={liquidationPeriod}
              onChange={(e) => {
                liquidationPeriodManualRef.current = true;
                setLiquidationPeriod(e.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              required
            />
            {!isEdit ? (
              <p className="mt-1.5 text-[11px] text-slate-500 leading-snug max-w-md">
                Al cambiar la fecha de emisión se sugiere el mes calendario anterior como periodo liquidado, salvo que
                lo modifique manualmente.
              </p>
            ) : null}
          </div>
        </div>

        {igvConfigured ? (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Secciones fiscales</h3>
              <p className="text-xs text-slate-500 mt-1">
                Active solo las secciones que va a registrar. Ventas y notas de crédito usan el IGV de la empresa (
                {formatCompanyIgvRateLabel(companyIgvRate)}); las compras se calculan al 10.5 % o 18 % según corresponda.
              </p>
            </div>
            <SupervisorTaxSectionsForm
              value={taxSections}
              onChange={setTaxSections}
              currentYear={currentYear}
              companyIgvRate={companyIgvRate}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving || !igvConfigured}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? <i className="fas fa-spinner fa-spin text-xs" aria-hidden /> : null}
            {isEdit ? 'Guardar cambios' : 'Crear liquidación'}
          </button>
          <Link
            to="/supervisors/liquidaciones"
            className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
};

export default SupervisorLiquidacionCreatePage;
