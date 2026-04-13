import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { saveAs } from 'file-saver';
import { companiesService } from '../services/companies';
import { configService } from '../services/config';
import type { CompanyStatement as CompanyStatementData } from '../types/dashboard';
import {
  companyAccountStatementPdfFilename,
  generateCompanyAccountStatementPdfBlob,
  getLogoDataUrlForAccountPdf,
} from '../pdf/companyAccountStatementPdf';

function defaultPeriodLima(): string {
  return formatInTimeZone(new Date(), 'America/Lima', 'yyyy-MM');
}

function formatDate(value?: string): string {
  if (!value) return '';
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

function formatPEN(amount?: number): string {
  const n = typeof amount === 'number' ? amount : 0;
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDocumentLabel(status: string, dueDate?: string): { label: string; cls: string } {
  const due = dueDate ? new Date(dueDate) : null;
  const isOverdue = Boolean(
    due && Number.isFinite(due.getTime()) && due.getTime() < Date.now() && status !== 'pagado' && status !== 'anulado',
  );
  const label = isOverdue ? 'vencido' : status;
  const cls =
    label === 'pendiente'
      ? 'bg-amber-50 text-amber-700 border border-amber-200'
      : label === 'parcial'
        ? 'bg-sky-50 text-sky-700 border border-sky-200'
        : label === 'pagado'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : label === 'anulado'
            ? 'bg-slate-50 text-slate-700 border border-slate-200'
            : 'bg-red-50 text-red-700 border border-red-200';
  return { label, cls };
}

function getPaymentTypeLabel(type?: string, documentId?: number): { label: string; cls: string } {
  const normalized = (type ?? '').toLowerCase().trim();
  const isOnAccount = normalized === 'on_account' || !documentId;
  const label = isOnAccount ? 'a cuenta' : 'aplicado';
  const cls = isOnAccount
    ? 'bg-slate-50 text-slate-700 border border-slate-200'
    : 'bg-primary-50 text-primary-700 border border-primary-200';
  return { label, cls };
}

type TabId = 'account' | 'profile';

function StatementProfileTab({ data }: { data: CompanyStatementData }) {
  const balanceClass = (data.Balance ?? 0) > 0 ? 'text-amber-700' : 'text-emerald-700';
  const appliedPayments = (data.Payments ?? []).filter((p) => (p.type ?? '') !== 'on_account' && Boolean(p.document_id));
  const onAccountPayments = (data.Payments ?? []).filter((p) => (p.type ?? '') === 'on_account' || !p.document_id);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total deudas</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{formatPEN(data.TotalDocuments)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total pagos</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{formatPEN(data.TotalPayments)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Saldo por cobrar</p>
          <p className={`mt-1 text-2xl font-bold ${balanceClass}`}>{formatPEN(data.Balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Deudas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.Documents?.length ? (
                  data.Documents.map((row) => (
                    <tr key={row.Document.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{formatDate(row.Document.issue_date)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(row.Document.due_date)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.Document.type}</td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{row.Document.number}</td>
                      <td className="px-4 py-3 text-right text-slate-800">{formatPEN(row.Document.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatPEN(row.Paid)}</td>
                      <td className="px-4 py-3 text-right text-slate-800">{formatPEN(row.Balance)}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const { label, cls } = getDocumentLabel(row.Document.status, row.Document.due_date);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500 text-sm">
                      No hay deudas registradas para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Pagos aplicados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Deuda</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appliedPayments.length ? (
                  appliedPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{formatDate(p.date)}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const { label, cls } = getPaymentTypeLabel(p.type, p.document_id);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{p.document ? p.document.number : '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{p.method}</td>
                      <td className="px-4 py-3 text-right text-slate-800">{formatPEN(p.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-sm">
                      No hay pagos aplicados registrados para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Pagos a cuenta</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {onAccountPayments.length ? (
                  onAccountPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{formatDate(p.date)}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const { label, cls } = getPaymentTypeLabel(p.type, p.document_id);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{p.method}</td>
                      <td className="px-4 py-3 text-right text-slate-800">{formatPEN(p.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-sm">
                      No hay pagos a cuenta registrados para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function BankStatementView({
  data,
  period,
  onPeriodChange,
  pdfLoading,
  onDownloadPdf,
}: {
  data: CompanyStatementData;
  period: string;
  onPeriodChange: (v: string) => void;
  pdfLoading: boolean;
  onDownloadPdf: () => void;
}) {
  const ledger = data.ledger;
  const c = data.Company;

  const rows = useMemo(() => ledger?.movements ?? [], [ledger]);

  if (!ledger) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No se pudo armar el libro del mes. Actualice la página o contacte al administrador.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label htmlFor="stmt-period" className="block text-xs font-medium text-slate-600 mb-1">
            Periodo (mes)
          </label>
          <input
            id="stmt-period"
            type="month"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">Fechas según zona horaria Perú (America/Lima).</p>
        </div>
        <button
          type="button"
          disabled={pdfLoading}
          onClick={onDownloadPdf}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-60 shadow-sm"
        >
          {pdfLoading ? <i className="fas fa-spinner fa-spin text-xs" /> : <i className="fas fa-file-pdf text-xs" />}
          Descargar PDF
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Cliente</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <p>
              <span className="text-slate-500 font-medium">Código cliente: </span>
              <span className="text-slate-900">{c.code?.trim() || '—'}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">RUC: </span>
              <span className="text-slate-900 font-mono text-xs">{c.ruc}</span>
            </p>
            <p className="sm:col-span-2">
              <span className="text-slate-500 font-medium">Razón social: </span>
              <span className="text-slate-900 font-semibold">{c.business_name}</span>
            </p>
            <p className="sm:col-span-2">
              <span className="text-slate-500 font-medium">Dirección: </span>
              <span className="text-slate-800">{c.address?.trim() || '—'}</span>
            </p>
          </div>
        </div>

        <div className="border-b border-slate-200">
          <div className="bg-slate-200 px-4 py-2 text-center">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Resumen del mes</p>
            <p className="text-[11px] text-slate-600 mt-0.5">MES: {ledger.period_label}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4">
            <div className="p-4 bg-slate-100 border-b border-r border-slate-200 lg:border-b-0 text-center">
              <p className="text-[10px] font-bold text-slate-600 uppercase leading-tight mb-2">Saldo anterior</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{formatPEN(ledger.saldo_anterior)}</p>
            </div>
            <div className="p-4 bg-emerald-50 border-b border-slate-200 lg:border-b-0 lg:border-r border-emerald-100 text-center">
              <p className="text-[10px] font-bold text-emerald-900 uppercase leading-tight mb-2">
                Abonos / pagos del cliente
              </p>
              <p className="text-lg font-bold text-emerald-800 tabular-nums">{formatPEN(ledger.total_abonos)}</p>
            </div>
            <div className="p-4 bg-red-50 border-r border-slate-200 border-red-100 text-center">
              <p className="text-[10px] font-bold text-red-900 uppercase leading-tight mb-2">Cargos / deudas</p>
              <p className="text-lg font-bold text-red-800 tabular-nums">{formatPEN(ledger.total_cargos)}</p>
            </div>
            <div className="p-4 bg-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-600 uppercase leading-tight mb-2">Saldo final</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{formatPEN(ledger.saldo_final)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-600 text-white">
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Fecha operación</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Fecha proceso</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Tipo</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Nro. documento</th>
                <th className="px-2 py-2.5 font-semibold min-w-[180px]">Detalle</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Método pago</th>
                <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Cód. operación</th>
                <th className="px-2 py-2.5 font-semibold text-right whitespace-nowrap">Cargo</th>
                <th className="px-2 py-2.5 font-semibold text-right whitespace-nowrap">Abono</th>
                <th className="px-2 py-2.5 font-semibold text-right whitespace-nowrap">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    No hay movimientos registrados en este mes.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.type_code}-${idx}`} className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}>
                    <td className="px-2 py-2 text-slate-700 whitespace-nowrap tabular-nums">{row.operation_date?.slice(0, 10) || '—'}</td>
                    <td className="px-2 py-2 text-slate-700 whitespace-nowrap tabular-nums">{row.process_date?.slice(0, 10) || '—'}</td>
                    <td className="px-2 py-2 text-slate-800 font-mono text-[11px]">{row.type_code}</td>
                    <td className="px-2 py-2 text-slate-700 font-mono text-[11px]">{row.document_number}</td>
                    <td className="px-2 py-2 text-slate-700 max-w-[280px]">{row.detail || '—'}</td>
                    <td className="px-2 py-2 text-slate-600">{row.payment_method || '—'}</td>
                    <td className="px-2 py-2 text-slate-600 font-mono text-[11px]">{row.operation_code || '—'}</td>
                    <td className="px-2 py-2 text-right text-red-800 font-medium tabular-nums">
                      {row.cargo > 0 ? formatPEN(row.cargo) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-800 font-medium tabular-nums">
                      {row.abono > 0 ? formatPEN(row.abono) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-900 font-semibold tabular-nums">{formatPEN(row.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const CompanyStatement = () => {
  const params = useParams();
  const navigate = useNavigate();
  const companyId = params.id ? Number(params.id) : NaN;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<CompanyStatementData | null>(null);
  const [tab, setTab] = useState<TabId>('account');
  const [period, setPeriod] = useState(defaultPeriodLima);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || Number.isNaN(companyId)) return;
    try {
      setLoading(true);
      setError('');
      const statement = await companiesService.getStatement(companyId, period);
      setData(statement);
    } catch (e) {
      console.error(e);
      setError('Error al cargar estado de cuenta');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const ledgerMatchesSelectedPeriod = useMemo(() => {
    if (!data?.ledger || !period || period.length < 7) return true;
    const y = Number(period.slice(0, 4));
    const m = Number(period.slice(5, 7));
    return data.ledger.period_year === y && data.ledger.period_month === m;
  }, [data?.ledger, period]);

  const handleDownloadPdf = async () => {
    if (!data?.ledger || !companyId) return;
    try {
      setPdfLoading(true);
      const [firm, fresh] = await Promise.all([
        configService.getFirmBranding().catch(() => null),
        companiesService.getStatement(companyId, period),
      ]);
      if (!fresh.ledger) {
        window.dispatchEvent(new CustomEvent('miweb:toast', { detail: { type: 'error', message: 'Sin datos de libro para PDF.' } }));
        return;
      }
      const logoDataUrl = firm?.logo_url ? await getLogoDataUrlForAccountPdf(firm.logo_url) : null;
      const blob = await generateCompanyAccountStatementPdfBlob(fresh.Company, fresh.ledger, firm, logoDataUrl);
      saveAs(blob, companyAccountStatementPdfFilename(fresh.Company, fresh.ledger));
      window.dispatchEvent(
        new CustomEvent('miweb:toast', { detail: { type: 'success', message: 'PDF generado correctamente.' } }),
      );
    } catch (e) {
      console.error(e);
      window.dispatchEvent(
        new CustomEvent('miweb:toast', { detail: { type: 'error', message: 'No se pudo generar el PDF.' } }),
      );
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <i className="fas fa-spinner fa-spin mr-2"></i> Cargando...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Empresa no encontrada'}
        </div>
        <button
          type="button"
          onClick={() => navigate('/companies')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <i className="fas fa-arrow-left text-xs"></i> Volver a empresas
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Empresa</p>
          <h2 className="text-xl font-semibold text-slate-800">{data.Company.business_name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {tab === 'account'
              ? 'Estado de cuenta tipo extracto bancario por mes (cargos, abonos y saldo corrido).'
              : 'Perfil operativo: deudas, pagos aplicados y pagos a cuenta.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/documents/new?company_id=${data.Company.id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-700 text-white text-xs font-medium shadow-sm hover:bg-emerald-800"
          >
            <i className="fas fa-file-invoice-dollar text-xs"></i> Registrar cargo
          </Link>
          <Link
            to="/companies"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <i className="fas fa-arrow-left text-xs"></i> Volver a empresas
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-0">
        <button
          type="button"
          onClick={() => setTab('account')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition ${
            tab === 'account'
              ? 'bg-white border-slate-200 text-primary-800 -mb-px'
              : 'bg-slate-50 border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <i className="fas fa-file-invoice mr-2 text-xs opacity-80" />
          Estado de cuenta
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition ${
            tab === 'profile'
              ? 'bg-white border-slate-200 text-primary-800 -mb-px'
              : 'bg-slate-50 border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <i className="fas fa-building mr-2 text-xs opacity-80" />
          Perfil de empresa
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {tab === 'account' ? (
        !ledgerMatchesSelectedPeriod && loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 text-sm">
            <i className="fas fa-spinner fa-spin mr-2" />
            Cargando periodo…
          </div>
        ) : (
          <BankStatementView
            data={data}
            period={period}
            onPeriodChange={setPeriod}
            pdfLoading={pdfLoading}
            onDownloadPdf={() => void handleDownloadPdf()}
          />
        )
      ) : (
        <StatementProfileTab data={data} />
      )}

      {tab === 'profile' && loading && data ? (
        <p className="text-xs text-slate-400 text-center">
          <i className="fas fa-spinner fa-spin mr-1" /> Actualizando datos…
        </p>
      ) : null}
    </div>
  );
};

export default CompanyStatement;
