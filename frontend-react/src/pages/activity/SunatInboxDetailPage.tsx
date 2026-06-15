import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MailboxCaptureSlotCell } from '../../components/activity/MailboxCaptureSlotCell';
import {
  mailboxStatusBadgeClass,
  mailboxStatusLabel,
} from '../../components/activity/sunatInboxConfig';
import { PAGE_WORKSPACE_CLASS } from '../../constants/pageLayout';
import { activityModulePath, type ActivityWorkspace } from '../../navigation/activityRoutes';
import { auth } from '../../services/auth';
import { P } from '../../rbac/codes';
import {
  sunatInboxService,
  type MailboxType,
  type SunatInboxCaptureSlot,
  type SunatInboxDetail,
} from '../../services/sunatInbox';
import { currentPeriodYM } from '../../utils/supervisorLabels';
import { defaultWeekStartForPeriod } from '../../utils/mailboxWeek';
import { summarizeMailboxSlots } from '../../utils/mailboxCaptureUtils';
import { extractApiErrorMessage } from '../../utils/apiError';

type SunatInboxDetailPageProps = {
  workspace: ActivityWorkspace;
};

const SunatInboxDetailPage = ({ workspace }: SunatInboxDetailPageProps) => {
  const { companyId: companyIdParam } = useParams();
  const companyId = Number(companyIdParam);
  const [searchParams, setSearchParams] = useSearchParams();
  const periodYm = searchParams.get('period_ym') || currentPeriodYM();
  const weekStartParam = searchParams.get('week_start') || defaultWeekStartForPeriod(periodYm);
  const [weekStart, setWeekStart] = useState(weekStartParam);

  const listPath = `${activityModulePath(workspace, 'sunat-inbox')}?period_ym=${encodeURIComponent(periodYm)}&week_start=${encodeURIComponent(weekStart)}`;

  const canUpload = useMemo(() => auth.hasPermission(P.supervisorsAttachmentsUpload), []);
  const canVerify = useMemo(() => auth.hasPermission(P.supervisorsDeclarationsApprove), []);

  const [detail, setDetail] = useState<SunatInboxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!Number.isFinite(companyId) || companyId <= 0) {
      setError('Empresa inválida.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const data = await sunatInboxService.getDetail(companyId, periodYm, weekStart);
      setDetail(data);
      if (data.week_start && data.week_start !== weekStart) {
        setWeekStart(data.week_start);
      }
    } catch (err) {
      console.error(err);
      setError(extractApiErrorMessage(err, 'No se pudo cargar el detalle.'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, periodYm, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('period_ym', periodYm);
        next.set('week_start', weekStart);
        return next;
      },
      { replace: true },
    );
  }, [periodYm, weekStart, setSearchParams]);

  const patchSlot = (updated: SunatInboxCaptureSlot) => {
    setDetail((d) => {
      if (!d) return d;
      const slots = d.slots.map((s) => (s.slot_index === updated.slot_index ? updated : s));
      return { ...d, slots, summary_status: summarizeMailboxSlots(slots) };
    });
  };

  const handleUpload = async (slotIndex: number, mailboxType: MailboxType, file: File) => {
    try {
      setMsg('');
      const slot = await sunatInboxService.uploadCapture(
        companyId,
        slotIndex,
        file,
        mailboxType,
        periodYm,
        weekStart,
      );
      patchSlot(slot);
      setMsg('Archivo subido correctamente.');
    } catch (err) {
      setMsg(extractApiErrorMessage(err, 'Error al subir archivo.'));
    }
  };

  const handleVerify = async (slotId: number, mailboxType: MailboxType) => {
    try {
      setMsg('');
      const slot = await sunatInboxService.verifyCapture(slotId, mailboxType);
      patchSlot(slot);
      setMsg('Buzón verificado.');
    } catch (err) {
      setMsg(extractApiErrorMessage(err, 'No se pudo verificar.'));
    }
  };

  if (loading) {
    return (
      <div className={`${PAGE_WORKSPACE_CLASS} text-center text-slate-500 py-12`}>
        <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
        Cargando detalle…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={PAGE_WORKSPACE_CLASS}>
        <Link to={listPath} className="text-sm text-primary-700 hover:underline">
          ← Volver al listado
        </Link>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error || 'No se encontró el registro.'}
        </div>
      </div>
    );
  }

  const weekOptions = detail.weeks?.length ? detail.weeks : [{ week_start: weekStart, label: weekStart }];

  return (
    <div className={PAGE_WORKSPACE_CLASS}>
      <Link to={listPath} className="text-sm text-primary-700 hover:underline">
        ← Volver al listado
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Buzón SOL — {detail.business_name}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Período {periodYm} · RUC {detail.ruc} · Código {detail.code}
            {detail.dig ? ` · Dígito ${detail.dig}` : ''}
          </p>
        </div>
        <div className="min-w-[12rem]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Semana</label>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          >
            {weekOptions.map((w) => (
              <option key={w.week_start} value={w.week_start}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg ? (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">{msg}</div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Asistente</dt>
          <dd className="text-slate-800">{detail.assistant_username || '—'}</dd>
          <dt className="text-slate-500">Cargas / semana</dt>
          <dd className="text-slate-800 tabular-nums">{detail.captures_per_week}</dd>
          <dt className="text-slate-500">Resumen semana</dt>
          <dd>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${mailboxStatusBadgeClass(detail.summary_status)}`}
            >
              {mailboxStatusLabel(detail.summary_status)}
            </span>
          </dd>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {detail.slots.map((slot) => (
                  <th
                    key={slot.slot_index}
                    className="px-3 py-3 text-center text-xs font-semibold uppercase text-slate-500 min-w-[10rem]"
                  >
                    Carga {slot.slot_index}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {detail.slots.map((slot) => (
                  <td key={slot.slot_index} className="px-3 py-3 border-t border-slate-100 align-top">
                    <MailboxCaptureSlotCell
                      slot={slot}
                      canUpload={canUpload}
                      canVerify={canVerify}
                      uploadKey={`detail-${companyId}-${weekStart}`}
                      onUpload={handleUpload}
                      onVerify={handleVerify}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SunatInboxDetailPage;
