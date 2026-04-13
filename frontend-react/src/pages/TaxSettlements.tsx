import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { taxSettlementsService } from '../services/taxSettlements';
import type { TaxSettlement } from '../types/dashboard';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
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

const TaxSettlements = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCompanyId = searchParams.get('company_id') ?? '';
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const perPage = parsePositiveInt(searchParams.get('per_page'), 20);

  const role = auth.getRole() ?? '';
  const canCreate = ['Administrador', 'Supervisor', 'Contador'].includes(role);

  const [list, setList] = useState<TaxSettlement[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Periodo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  <i className="fas fa-spinner fa-spin mr-2" />
                  Cargando…
                </td>
              </tr>
            ) : list.length ? (
              list.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{row.number || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.company?.business_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.period_label || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.status === 'emitida'
                          ? 'bg-emerald-50 text-emerald-800'
                          : row.status === 'borrador'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.status === 'emitida' ? row.total_general.toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/tax-settlements/${row.id}`} className="text-primary-700 hover:text-primary-800 text-xs font-medium">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
    </div>
  );
};

export default TaxSettlements;
