import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { taxSettlementsService } from '../services/taxSettlements';
import type { TaxSettlement } from '../types/dashboard';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { companiesService } from '../services/companies';
import type { Company } from '../types/dashboard';
import { auth } from '../services/auth';

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i <= 0) return fallback;
  return i;
}

function settlementDeleteWarningFromRow(row: TaxSettlement): string {
  const ref = row.number?.trim() ? `«${row.number.trim()}»` : `#${row.id}`;
  const st = row.status === 'emitida' ? 'emitida' : row.status === 'borrador' ? 'borrador' : row.status;
  return `Va a eliminar permanentemente la liquidación ${ref} (estado: ${st}).\n\nEsta acción no se puede deshacer. Se borrarán las líneas de la liquidación en el sistema.\n\n${
    row.status === 'emitida'
      ? 'Si la liquidación estaba emitida, además se revertirán: los pagos registrados «desde esta liquidación» (imputaciones y estados de deuda), la referencia a la liquidación en comprobantes fiscales locales, y las deudas internas generadas solo por esta liquidación (códigos DEU-LIQ…). Las deudas externas que solo se referenciaron en la liquidación no se eliminan.\n\nSi alguna deuda interna tiene otros abonos o pagos no vinculados a esta liquidación, el sistema rechazará la operación hasta que los regularice.'
      : 'En borrador no hay pagos ni comprobantes vinculados a liquidación emitida; solo se elimina el borrador y sus líneas.'
  }`;
}

const TaxSettlements = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCompanyId = searchParams.get('company_id') ?? '';
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const perPage = parsePositiveInt(searchParams.get('per_page'), 20);

  const role = auth.getRole() ?? '';
  const canCreate = ['Administrador', 'Supervisor', 'Contador'].includes(role);
  const canRegisterPayment = ['Administrador', 'Supervisor', 'Contador', 'Asistente'].includes(role);

  const [list, setList] = useState<TaxSettlement[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TaxSettlement | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState(initialCompanyId);
  const [pagination, setPagination] = useState({
    page,
    per_page: perPage,
    total: 0,
    total_pages: 0,
  });

  useEffect(() => {
    void companiesService.list().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await taxSettlementsService.listPaged({
        company_id: filterCompanyId || undefined,
        page,
        per_page: perPage,
      });
      setList(res.items);
      setPagination(res.pagination);
    } catch {
      setError('No se pudieron cargar las liquidaciones');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filterCompanyId, page, perPage]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (filterCompanyId) next.set('company_id', filterCompanyId);
        else next.delete('company_id');
        next.set('page', '1');
        if (!next.get('per_page')) next.set('per_page', String(perPage));
        return next;
      }, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [filterCompanyId, perPage, setSearchParams]);

  const handlePageChange = (p: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  const handlePerPageChange = (n: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('per_page', String(n));
      next.set('page', '1');
      return next;
    });
  };

  const statusLabel = (s: string) => {
    if (s === 'borrador') return 'Borrador';
    if (s === 'emitida') return 'Emitida';
    if (s === 'anulada') return 'Anulada';
    return s;
  };

  const confirmDeleteFromList = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await taxSettlementsService.delete(deleteTarget.id);
      window.dispatchEvent(
        new CustomEvent('miweb:toast', { detail: { type: 'success', message: 'Liquidación eliminada.' } }),
      );
      setDeleteTarget(null);
      void fetchList();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      window.dispatchEvent(
        new CustomEvent('miweb:toast', {
          detail: {
            type: 'error',
            message: typeof msg === 'string' && msg.trim() ? msg : 'No se pudo eliminar la liquidación.',
          },
        }),
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Liquidaciones de impuestos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Agrupan cargos pendientes por cliente para presentación. Los honorarios siguen en Deudas; los pagos se registran en Pagos con imputación manual o FIFO.
          </p>
        </div>
        {canCreate ? (
          <Link
            to="/tax-settlements/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 shadow-sm"
          >
            <i className="fas fa-plus text-xs" aria-hidden />
            Nueva liquidación
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
          <SearchableSelect
            value={filterCompanyId}
            onChange={setFilterCompanyId}
            placeholder="Todas"
            searchPlaceholder="Buscar…"
            options={[{ value: '', label: 'Todas' }, ...companies.map((c) => ({ value: String(c.id), label: c.business_name }))]}
          />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fas fa-hashtag text-slate-400 opacity-80" aria-hidden />
                  Número
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fas fa-building text-slate-400 opacity-80" aria-hidden />
                  Empresa
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fas fa-calendar-alt text-slate-400 opacity-80" aria-hidden />
                  Periodo
                </span>
              </th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fas fa-flag text-slate-400 opacity-80" aria-hidden />
                  Estado
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end gap-1.5 w-full">
                  <i className="fas fa-coins text-slate-400 opacity-80" aria-hidden />
                  Total
                </span>
              </th>
              <th className="px-4 py-3 text-center whitespace-nowrap">
                <span className="inline-flex items-center justify-center gap-1.5">
                  <i className="fas fa-list-ul text-slate-400 opacity-80" aria-hidden />
                  Ítems
                </span>
              </th>
              <th className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end gap-1.5 w-full">
                  <i className="fas fa-bars text-slate-400 opacity-80" aria-hidden />
                  Acciones
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  <i className="fas fa-spinner fa-spin mr-2" />
                  Cargando…
                </td>
              </tr>
            ) : list.length ? (
              list.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="fas fa-file-invoice-dollar text-slate-400 text-[11px]" aria-hidden />
                      {row.number || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.company?.business_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="fas fa-calendar-day text-slate-400 text-[11px]" aria-hidden />
                      {row.liquidation_period || row.period_label || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.status === 'emitida'
                          ? 'bg-emerald-50 text-emerald-800'
                          : row.status === 'borrador'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.status === 'emitida' ? (
                        <i className="fas fa-check-circle text-[10px] opacity-90" aria-hidden />
                      ) : row.status === 'borrador' ? (
                        <i className="fas fa-edit text-[10px] opacity-90" aria-hidden />
                      ) : (
                        <i className="fas fa-ban text-[10px] opacity-90" aria-hidden />
                      )}
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.status === 'emitida' ? (
                      <span className="inline-flex items-center justify-end gap-1">
                        <i className="fas fa-coins text-slate-400 text-[11px]" aria-hidden />
                        {row.total_general.toFixed(2)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      to={`/tax-settlements/${row.id}#liquidacion-lineas`}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 hover:border-primary-200"
                      title="Ver líneas de la liquidación"
                    >
                      <i className="fas fa-list-ul text-[11px]" aria-hidden />
                      Ver ítems
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1.5">
                      {row.status === 'emitida' && canRegisterPayment && row.can_register_payment ? (
                        <Link
                          to={`/payments/new?company_id=${row.company_id}&tax_settlement_id=${row.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 shadow-sm"
                          title="Precargar imputaciones de esta liquidación"
                        >
                          <i className="fas fa-coins text-[10px]" aria-hidden />
                          Registrar pago
                        </Link>
                      ) : null}
                      <Link
                        to={`/tax-settlements/${row.id}`}
                        className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800 text-xs font-medium self-center"
                      >
                        <i className="fas fa-eye text-[10px]" aria-hidden />
                        Ver
                      </Link>
                      {canCreate ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 self-center"
                        >
                          <i className="fas fa-trash-alt text-[10px]" aria-hidden />
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay liquidaciones. {canCreate ? 'Cree una desde «Nueva liquidación».' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 sm:px-6 py-4 border-t border-slate-100">
          <Pagination
            page={pagination.page || page}
            perPage={pagination.per_page || perPage}
            total={pagination.total ?? 0}
            onPageChange={handlePageChange}
            onPerPageChange={handlePerPageChange}
          />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Advertencia: eliminar liquidación"
        message={deleteTarget ? settlementDeleteWarningFromRow(deleteTarget) : ''}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        danger
        loading={deleteLoading}
        onClose={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDeleteFromList()}
      />
    </div>
  );
};

export default TaxSettlements;
