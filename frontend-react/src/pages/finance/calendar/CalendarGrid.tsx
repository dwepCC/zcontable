import { useCallback, useMemo, useState } from 'react';
import type { FinanceCalendarActivity, FinanceCalendarMark } from '../../../services/financeCalendar';
import {
  WEEKDAYS,
  applyActivityDatePatch,
  buildMonthGrid,
  chunkWeeks,
  localDateKey,
  markStyles,
  marksByDayKey,
  activitiesForDay,
  trafficStyles,
  type ActivityDatePatch,
  type CalendarCell,
} from './calendarUtils';
import { useCalendarDrag, type DragPreview } from './useCalendarDrag';

const MAX_VISIBLE_MARKS = 2;
const MAX_VISIBLE_ACTIVITIES = 3;

type Props = {
  periodYm: string;
  lastDayOfMonth: number;
  marks: FinanceCalendarMark[];
  activities: FinanceCalendarActivity[];
  canInteract: boolean;
  selectedDay: number | null;
  isToday: (cell: CalendarCell) => boolean;
  onDayClick: (dayNum: number, date: Date) => void;
  onActivityClick: (activity: FinanceCalendarActivity, e: React.MouseEvent) => void;
  onOverflowClick: (dayNum: number) => void;
  onActivityDatesChange: (
    activityId: number,
    patch: ActivityDatePatch,
    origin: ActivityDatePatch,
  ) => void;
};

const CalendarGrid = ({
  periodYm,
  lastDayOfMonth,
  marks,
  activities,
  canInteract,
  selectedDay,
  isToday,
  onDayClick,
  onActivityClick,
  onOverflowClick,
  onActivityDatesChange,
}: Props) => {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const handleCommit = useCallback(
    (activityId: number, patch: ActivityDatePatch, origin: ActivityDatePatch) => {
      onActivityDatesChange(activityId, patch, origin);
    },
    [onActivityDatesChange],
  );

  const { startDrag, draggingId, wasDragged } = useCalendarDrag({
    enabled: canInteract,
    lastDayOfMonth,
    onPreview: setDragPreview,
    onCommit: handleCommit,
  });

  const displayActivities = useMemo(() => {
    if (!dragPreview) return activities;
    return activities.map((a) =>
      a.id === dragPreview.activityId ? applyActivityDatePatch(a, dragPreview.patch, periodYm) : a,
    );
  }, [activities, dragPreview, periodYm]);

  const highlightDays = useMemo(() => new Set(dragPreview?.highlightDays ?? []), [dragPreview]);

  const cells = useMemo(() => buildMonthGrid(periodYm), [periodYm]);
  const weeks = useMemo(() => chunkWeeks(cells), [cells]);
  const markMap = useMemo(() => marksByDayKey(marks), [marks]);

  const handleActivityChipClick = (a: FinanceCalendarActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    if (wasDragged()) {
      e.preventDefault();
      return;
    }
    onActivityClick(a, e);
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${canInteract ? '' : 'calendar-readonly'}`}
    >
      <div className="grid grid-cols-7 bg-primary-600 border-b border-primary-700">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-center text-[10px] sm:text-xs font-semibold py-2 sm:py-2.5 text-white uppercase tracking-wide"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="divide-y divide-slate-100">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7" data-week-grid>
            {week.map((cell) => {
              const key = localDateKey(cell.date);
              const dayMarks = cell.inMonth ? markMap.get(key) ?? [] : [];
              const dayActs = cell.inMonth ? activitiesForDay(displayActivities, cell.dayNum) : [];
              const selected = cell.inMonth && selectedDay === cell.dayNum;
              const today = cell.inMonth && isToday(cell);
              const dropHighlight = cell.inMonth && highlightDays.has(cell.dayNum);
              const hiddenActs = Math.max(0, dayActs.length - MAX_VISIBLE_ACTIVITIES);

              return (
                <div
                  key={key}
                  role={cell.inMonth ? 'button' : undefined}
                  tabIndex={cell.inMonth ? 0 : undefined}
                  data-cal-day={cell.inMonth ? cell.dayNum : undefined}
                  onClick={() => cell.inMonth && onDayClick(cell.dayNum, cell.date)}
                  onKeyDown={(e) => {
                    if (cell.inMonth && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onDayClick(cell.dayNum, cell.date);
                    }
                  }}
                  className={`min-h-[88px] sm:min-h-[100px] border-r border-slate-100 p-1.5 text-left transition-colors duration-150 last:border-r-0 outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 ${
                    cell.inMonth
                      ? `hover:bg-primary-50/40 ${selected ? 'bg-primary-50/80 ring-1 ring-inset ring-primary-200' : 'bg-white'} ${
                          dropHighlight ? 'bg-primary-100/70 ring-1 ring-inset ring-primary-300' : ''
                        } ${canInteract ? 'cursor-pointer' : 'cursor-default'}`
                      : 'bg-slate-50/60 cursor-default'
                  }`}
                >
                  <span
                    className={`inline-flex text-xs sm:text-sm font-semibold w-7 h-7 items-center justify-center rounded-full mb-1 transition-colors ${
                      today ? 'bg-primary-600 text-white' : cell.inMonth ? 'text-slate-700' : 'text-slate-300'
                    } ${dropHighlight && !today ? 'bg-primary-200 text-primary-900' : ''}`}
                  >
                    {cell.dayNum}
                  </span>

                  {dayMarks.slice(0, MAX_VISIBLE_MARKS).map((m) => (
                    <div
                      key={m.id}
                      className={`text-[10px] rounded-md border px-1 py-0.5 mb-0.5 truncate ${markStyles(m.kind)}`}
                      title={m.label}
                    >
                      {m.kind === 'feriado' ? '🏛 ' : m.kind === 'festividad' ? '🎉 ' : '📌 '}
                      {m.label}
                    </div>
                  ))}

                  {dayActs.slice(0, MAX_VISIBLE_ACTIVITIES).map((a) => {
                    const st = trafficStyles(a.traffic_light || 'azul');
                    const isDragging = draggingId === a.id;
                    return (
                      <div
                        key={a.id}
                        role="presentation"
                        title={a.name}
                        onClick={(e) => handleActivityChipClick(a, e)}
                        onPointerDown={(e) => {
                          if (!canInteract) return;
                          e.stopPropagation();
                          startDrag(e, a, 'move');
                        }}
                        className={`text-[10px] rounded-md border px-1 py-0.5 mb-0.5 truncate select-none touch-none ${st.bar} ${
                          isDragging ? 'opacity-60 ring-2 ring-primary-300/50 shadow-sm' : 'hover:shadow-sm'
                        } ${canInteract ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle ${st.dot}`} />
                        {a.name}
                      </div>
                    );
                  })}

                  {hiddenActs > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOverflowClick(cell.dayNum);
                      }}
                      className="text-[10px] text-primary-700 font-medium hover:underline"
                    >
                      +{hiddenActs} más
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarGrid;
