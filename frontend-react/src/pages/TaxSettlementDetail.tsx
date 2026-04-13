import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { saveAs } from 'file-saver';
import { taxSettlementsService } from '../services/taxSettlements';
import { configService } from '../services/config';
import type { TaxSettlement } from '../types/dashboard';
import { auth } from '../services/auth';
import {
  generateTaxSettlementPdfBlob,
  getLogoDataUrlForPdf,
  taxSettlementPdfFilename,
} from '../pdf/taxSettlementDocument';

const TaxSettlementDetail = () => {
  const { id } = useParams<{ id: string }>();
  const settlementId = Number(id);
  const role = auth.getRole() ?? '';
  const canEmit = ['Administrador', 'Supervisor', 'Contador'].includes(role);

  const [row, setRow] = useState<TaxSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emitting, setEmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!settlementId) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const data = await taxSettlementsService.get(settlementId);
        if (!cancelled) {
          setRow(data);
          setError('');
        }
      } catch {
        if (!cancelled) {
          setError('No se encontró la liquidación');
          setRow(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settlementId]);

  const emit = async () => {
    if (!settlementId) return;
    if (!confirm('¿Emitir liquidación? Se asignará un número correlativo y se fijarán los totales.')) return;
    setEmitting(true);
    try {
      const updated = await taxSettlementsService.emit(settlementId);
      setRow(updated);
      window.dispatchEvent(new CustomEvent('miweb:toast', { detail: { type: 'success', message: 'Liquidación emitida.' } }));
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Error al emitir';
      window.dispatchEvent(new CustomEvent('miweb:toast', { detail: { type: 'error', message: typeof msg === 'string' ? msg : 'Error al emitir' } }));
    } finally {
      setEmitting(false);
    }
  };

  const downloadPdf = async () => {
    if (!row || exportingPdf) return;
    try {
      setExportingPdf(true);
      const [firm, fresh] = await Promise.all([
        configService.getFirmBranding().catch(() => null),
        taxSettlementsService.get(settlementId),
      ]);
      const logoDataUrl = firm?.logo_url ? await getLogoDataUrlForPdf(firm.logo_url) : null;
      const blob = await generateTaxSettlementPdfBlob(fresh, firm, logoDataUrl);
      saveAs(blob, taxSettlementPdfFilename(fresh));
      window.dispatchEvent(
        new CustomEvent('miweb:toast', { detail: { type: 'success', message: 'PDF listo para entregar al cliente.' } }),
      );
    } catch (e) {
      console.error(e);
      window.dispatchEvent(
        new CustomEvent('miweb:toast', { detail: { type: 'error', message: 'No se pudo generar el PDF.' } }),
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="text-slate-500 text-sm py-12 text-center">
        <i className="fas fa-spinner fa-spin mr-2" />
        Cargando…
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || 'No encontrado'}
        <div className="mt-2">
          <Link to="/tax-settlements" className="text-primary-700 font-medium">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  const lineTypeLabel = (t: string) => {
    if (t === 'document_ref') return 'Deuda';
    return 'Concepto';
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link to="/tax-settlements" className="text-sm text-primary-700 hover:text-primary-800 font-medium">
            ← Listado
          </Link>
          <h2 className="text-xl font-semibold text-slate-800 mt-2">Liquidación {row.number || `#${row.id}`}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {row.company?.business_name} · {row.status === 'emitida' ? 'Emitida' : row.status === 'borrador' ? 'Borrador' : row.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.status === 'borrador' && canEmit ? (
            <button
              type="button"
              onClick={() => void emit()}
              disabled={emitting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {emitting ? <i className="fas fa-spinner fa-spin text-xs" /> : null}
              Emitir liquidación
            </button>
          ) : null}
          {row.status === 'emitida' ? (
            <Link
              to={`/payments/new?company_id=${row.company_id}&tax_settlement_id=${row.id}`}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 shadow-sm"
            >
              Registrar pago (desde liquidación)
            </Link>
          ) : null}
          <Link
            to={`/payments/new?company_id=${row.company_id}`}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {row.status === 'emitida' ? 'Pago sin vínculo' : 'Registrar pago'}
          </Link>
          <Link
            to={`/comprobantes?tax_settlement_id=${row.id}`}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-primary-200 bg-primary-50/80 text-sm font-medium text-primary-900 hover:bg-primary-50"
          >
            Comprobantes de esta liquidación
          </Link>
          <Link
            to={`/documents/fiscal-receipts?company_id=${row.company_id}`}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Conciliación (pendientes)
          </Link>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={exportingPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 shadow-sm"
          >
            <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'} text-xs`} aria-hidden />
            {exportingPdf ? 'Generando PDF…' : 'Descargar PDF (cliente)'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-medium text-slate-500">Fecha emisión</span>
            <p className="text-slate-800">{row.issue_date?.slice(0, 10)}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Periodo</span>
            <p className="text-slate-800">{row.period_label || '—'}</p>
          </div>
        </div>
        {row.notes ? (
          <div>
            <span className="text-xs font-medium text-slate-500">Notas</span>
            <p className="text-slate-700 whitespace-pre-wrap">{row.notes}</p>
          </div>
        ) : null}
        {row.status === 'emitida' ? (
          <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-100">
            <div>
              <span className="text-xs font-medium text-slate-500">Honorarios / cargos</span>
              <p className="text-lg font-semibold tabular-nums">S/ {row.total_honorarios.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500">Fiscal (PDT)</span>
              <p className="text-lg font-semibold tabular-nums">S/ {row.total_impuestos.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500">Total</span>
              <p className="text-lg font-semibold tabular-nums text-primary-800">S/ {row.total_general.toFixed(2)}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(row.lines ?? []).map((ln) => (
              <tr key={ln.id ?? `${ln.concept}-${ln.sort_order}`}>
                <td className="px-4 py-3 text-slate-600">{lineTypeLabel(ln.line_type)}</td>
                <td className="px-4 py-3 text-slate-800">{ln.concept}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{ln.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaxSettlementDetail;
