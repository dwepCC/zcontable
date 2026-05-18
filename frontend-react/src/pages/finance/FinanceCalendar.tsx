import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  financeCalendarService,
  type CalendarComplianceSummary,
  type FinanceCalendarActivity,
  type FinanceCalendarDetail,
  type FinanceCalendarMark,
} from '../../services/financeCalendar';
import { auth } from '../../services/auth';
import { P } from '../../rbac/codes';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ACTIVITY_KINDS = [
  { value: 'nps', label: 'Generación NPS' },
  { value: 'pdt_601', label: 'PDT 601' },
  { value: 'pdt_621', label: 'PDT 621' },
  { value: 'sire', label: 'SIRE' },
  { value: 'payment', label: 'Pagos' },
  { value: 'liquidation', label: 'Liquidación' },
  { value: 'closing', label: 'Cierre contable' },
  { value: 'other', label: 'Otra' },
];

function currentPeriodYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function trafficDot(tl: string): string {
  if (tl === 'rojo') return 'bg-red-500';
  if (tl === 'amarillo') return 'bg-amber-400';
  return 'bg-emerald-500';
}

function markBg(kind: string): string {
  if (kind === 'feriado') return 'bg-red-50 border-red-200';
  if (kind === 'festividad') return 'bg-purple-50 border-purple-200';
  return 'bg-sky-50 border-sky-200';
}

const FinanceCalendar = () => {
  const canView = useMemo(() => auth.hasPermission(P.financeCalendarView), []);
  const canManage = useMemo(() => auth.hasPermission(P.financeCalendarManage), []);

  const [periodYm, setPeriodYm] = useState(currentPeriodYM());
  const [detail, setDetail] = useState<FinanceCalendarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [compliance, setCompliance] = useState<CalendarComplianceSummary | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [newMonth, setNewMonth] = useState('');
  const [dupFrom, setDupFrom] = useState('');
  const [dupTo, setDupTo] = useState('');
  const [actForm, setActForm] = useState({ name: '', due_day: 5, activity_kind: 'nps', priority: 'media' });
  const loadDetail = useCallback(async () => {
    if (!periodYm) return;
    try {
      setLoading(true);
      setDetail(await financeCalendarService.get(periodYm));
      setMsg('');
    } catch {
      setDetail(null);
      setMsg('No hay calendario para este mes. Finanzas puede crearlo.');
    } finally {
      setLoading(false);
    }
  }, [periodYm]);

  useEffect(() => {
    if (canView) void loadDetail();
  }, [canView, loadDetail]);

  const grid = useMemo(() => {
    const [ys, ms] = periodYm.split('-').map(Number);
    const first = new Date(ys, ms - 1, 1);
    const last = new Date(ys, ms, 0);
    let startPad = first.getDay() - 1;
    if (startPad < 0) startPad = 6;
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      cells.push({ date: new Date(ys, ms - 1, 1 - (startPad - i)), inMonth: false });
    }
    for (let day = 1; day <= last.getDate(); day++) {
      cells.push({ date: new Date(ys, ms - 1, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const d = new Date(cells[cells.length - 1].date);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [periodYm]);

  const marksByDay = useMemo(() => {
    const map = new Map<string, FinanceCalendarMark[]>();
    for (const m of detail?.marks ?? []) {
      const key = m.mark_date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [detail?.marks]);

  const activitiesByDay = useMemo(() => {
    const map = new Map<number, FinanceCalendarActivity[]>();
    for (const a of detail?.activities ?? []) {
      if (!map.has(a.due_day)) map.set(a.due_day, []);
      map.get(a.due_day)!.push(a);
    }
    return map;
  }, [detail?.activities]);

  const openCompliance = async (activityId: number) => {
    try {
      setComplianceLoading(true);
      setCompliance(await financeCalendarService.compliance(activityId, periodYm));
    } catch {
      setMsg('No se pudo cargar el cumplimiento');
    } finally {
      setComplianceLoading(false);
    }
  };

  if (!canView) {
    return <p className="p-6 text-center text-slate-600">Sin permiso para ver el calendario contable.</p>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Calendario contable global</h2>
          <p className="text-sm text-slate-500">
            Guía de obligaciones del mes. Supervisor y asistente ven cumplimiento solo de sus empresas asignadas.
          </p>
        </div>
        <label className="text-sm text-slate-600">
          Mes
          <input
            type="month"
            value={periodYm}
            onChange={(e) => setPeriodYm(e.target.value)}
            className="block mt-1 border border-slate-200 rounded-lg px-3 py-1.5"
          />
        </label>
      </div>

      {msg ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p> : null}

      {canManage ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 text-sm items-end">
          <label>
            Crear mes
            <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1" />
          </label>
          <button type="button" onClick={() => void financeCalendarService.create(newMonth).then(() => loadDetail())} className="px-3 py-2 rounded-full bg-primary-600 text-white text-xs">
            Crear
          </button>
          <input type="month" value={dupFrom} onChange={(e) => setDupFrom(e.target.value)} className="border rounded-lg px-2 py-1" />
          <span>→</span>
          <input type="month" value={dupTo} onChange={(e) => setDupTo(e.target.value)} className="border rounded-lg px-2 py-1" />
          <button type="button" onClick={() => void financeCalendarService.duplicate(dupFrom, dupTo).then(() => { setPeriodYm(dupTo); loadDetail(); })} className="px-3 py-2 rounded-full border text-xs">
            Duplicar
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : detail ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-50 border-b">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-xs font-medium py-2 text-slate-600">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((cell) => {
                const key = cell.date.toISOString().slice(0, 10);
                const dayNum = cell.date.getDate();
                const acts = cell.inMonth ? activitiesByDay.get(dayNum) ?? [] : [];
                const marks = cell.inMonth ? marksByDay.get(key) ?? [] : [];
                return (
                  <div key={key} className={`min-h-[90px] border-b border-r p-1 text-xs ${cell.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-300'}`}>
                    <div className="font-medium mb-1">{dayNum}</div>
                    {marks.map((m) => (
                      <div key={m.id} className={`rounded px-1 mb-0.5 border ${markBg(m.kind)}`}>
                        {m.label}
                      </div>
                    ))}
                    {acts.map((a) => (
                      <button key={a.id} type="button" onClick={() => void openCompliance(a.id)} className="w-full text-left rounded bg-slate-100 px-1 py-0.5 mb-0.5 flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${trafficDot(a.traffic_light || 'verde')}`} />
                        <span className="truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <section className="rounded-xl border bg-white p-4 text-sm mt-4">
            <h3 className="font-semibold mb-2">Cumplimiento — mis empresas</h3>
            {complianceLoading ? (
              <p className="text-slate-500">Calculando…</p>
            ) : compliance ? (
              <>
                <p className="font-medium">{compliance.activity_name}</p>
                <p className="mt-1">
                  <span className="text-emerald-700">{compliance.completed} completadas</span>
                  {' · '}
                  <span className="text-amber-700">{compliance.pending} pendientes</span>
                  {' · '}
                  <span className="text-red-700">{compliance.overdue} vencidas</span>
                </p>
                <ul className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {compliance.companies.map((c) => (
                    <li key={c.company_id} className="flex justify-between gap-2">
                      <span>{c.company_name}</span>
                      {c.control_id ? (
                        <Link to={`/supervisors/controls/${c.control_id}`} className="text-primary-700 text-xs">
                          Ver
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-slate-500">Seleccione una actividad en el calendario.</p>
            )}
            {canManage ? (
              <div className="mt-4 pt-3 border-t flex gap-2">
                <input
                  value={actForm.name}
                  onChange={(e) => setActForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nueva actividad"
                  className="flex-1 border rounded px-2 py-1"
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={actForm.due_day}
                  onChange={(e) => setActForm((f) => ({ ...f, due_day: Number(e.target.value) }))}
                  className="w-14 border rounded px-1"
                />
                <select
                  value={actForm.activity_kind}
                  onChange={(e) => setActForm((f) => ({ ...f, activity_kind: e.target.value }))}
                  className="border rounded px-1"
                >
                  {ACTIVITY_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void financeCalendarService.addActivity(detail.id, actForm).then(() => loadDetail())}
                  className="px-2 py-1 rounded-full bg-primary-600 text-white text-xs"
                >
                  +
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default FinanceCalendar;
