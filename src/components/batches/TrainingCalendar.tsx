import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Batch, Course, Trainer } from '../../types/tcms';
import { NotificationBanner, StatusText } from '../ui/UiKit';

type CalendarView = 'daily' | 'weekly' | 'monthly';

function toMinutes(val: string | undefined, fallback: number): number {
  if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fallback;
  const [h, m] = val.trim().split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return next;
}

function startOfWeek(d: Date): Date {
  // Sunday-start week (standard KSA workweek Sun–Thu)
  const day = d.getDay();
  return addDays(d, -day);
}

export function TrainingCalendar({
  batches,
  courseMap,
  trainerMap,
  onSelectBatch,
}: {
  batches: Batch[];
  courseMap: Map<string, Course>;
  trainerMap: Map<string, Trainer>;
  onSelectBatch: (batch: Batch) => void;
}) {
  const { lang, t } = useLanguage();
  const [calView, setCalView] = useState<CalendarView>('monthly');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());

  const { conflictBatchIds, conflictPairs } = useMemo(() => {
    const ids = new Set<string>();
    const pairs: Array<{ a: Batch; b: Batch }> = [];
    const active = batches.filter((b) => b.status === 'scheduled' || b.status === 'in_progress');
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        if (a.trainerId !== b.trainerId) continue;
        if (!(a.startDate <= b.endDate && a.endDate >= b.startDate)) continue;
        const aS = toMinutes(a.startTime, 8 * 60);
        const aE = toMinutes(a.endTime, 16 * 60);
        const bS = toMinutes(b.startTime, 8 * 60);
        const bE = toMinutes(b.endTime, 16 * 60);
        if (aS < bE && aE > bS) {
          ids.add(a.id);
          ids.add(b.id);
          pairs.push({ a, b });
        }
      }
    }
    return { conflictBatchIds: ids, conflictPairs: pairs };
  }, [batches]);

  const navigate = (dir: -1 | 1) => {
    if (calView === 'daily') {
      setAnchorDate((prev) => addDays(prev, dir));
    } else if (calView === 'weekly') {
      setAnchorDate((prev) => addDays(prev, dir * 7));
    } else {
      setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
    }
  };

  const todayIso = toIsoDate(new Date());
  const anchorIso = toIsoDate(anchorDate);

  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';

  const headerLabel = useMemo(() => {
    if (calView === 'daily') {
      return anchorDate.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    if (calView === 'weekly') {
      const s = startOfWeek(anchorDate);
      const e = addDays(s, 6);
      return `${toIsoDate(s)} — ${toIsoDate(e)}`;
    }
    return anchorDate.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  }, [calView, anchorDate, locale]);

  const batchesOnDate = (iso: string) =>
    batches
      .filter((b) => b.startDate <= iso && b.endDate >= iso)
      .sort((a, b) => (a.startTime || '08:00').localeCompare(b.startTime || '08:00'));

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [anchorDate]);

  const monthCells = useMemo(() => {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }).map((_, i) => {
      const d = addDays(gridStart, i);
      return {
        date: d,
        iso: toIsoDate(d),
        inMonth: d.getMonth() === anchorDate.getMonth(),
      };
    });
  }, [anchorDate]);

  const dayHeaders = useMemo(() => {
    const sun = startOfWeek(new Date());
    return Array.from({ length: 7 }).map((_, i) =>
      addDays(sun, i).toLocaleDateString(locale, { weekday: 'short' })
    );
  }, [locale]);

  return (
    <div className="space-y-4">
      {conflictPairs.length > 0 && (
        <NotificationBanner
          variant="warning"
          message={`${t('calendarConflictsAlert')} ${conflictPairs
            .map((p) => {
              const trn = trainerMap.get(p.a.trainerId);
              return `${trn ? (lang === 'ar' ? trn.nameAr : trn.nameEn) : p.a.trainerId}: ${p.a.batchNumber} & ${p.b.batchNumber}`;
            })
            .join(' | ')}`}
        />
      )}

      {/* Calendar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
          >
            {t('todayLabel')}
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>
          <span className="ms-2 text-sm font-semibold text-slate-900 font-mono-tabular">
            {headerLabel}
          </span>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          {(['daily', 'weekly', 'monthly'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCalView(v)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                calView === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {v === 'daily' ? t('calendarDaily') : v === 'weekly' ? t('calendarWeekly') : t('calendarMonthly')}
            </button>
          ))}
        </div>
      </div>

      {/* Daily View */}
      {calView === 'daily' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          {batchesOnDate(anchorIso).length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">{t('noBatchesOnDate')}</p>
          ) : (
            <div className="space-y-2.5">
              {batchesOnDate(anchorIso).map((b) => {
                const crs = courseMap.get(b.courseId);
                const trn = trainerMap.get(b.trainerId);
                const hasConflict = conflictBatchIds.has(b.id);
                const available = Math.max(0, b.capacity - (b.enrollmentCount || 0));
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBatch(b)}
                    className={`w-full text-start border rounded-lg p-3.5 hover:bg-slate-50 transition-colors ${
                      hasConflict ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-xs font-bold text-slate-900">
                            {b.startTime || '08:00'}–{b.endTime || '16:00'}
                          </span>
                          <span className="font-mono-tabular text-xs font-semibold text-sky-700">
                            {b.batchNumber}
                          </span>
                          {b.batchName && <span className="text-xs text-slate-600">· {b.batchName}</span>}
                          {hasConflict && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                              <AlertTriangle className="w-3 h-3" />
                              {t('conflictDetected')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-1">
                          {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-1">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {trn ? (lang === 'ar' ? trn.nameAr : trn.nameEn) : b.trainerId}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {t(`mode_${b.trainingMode || 'classroom'}`)} · {b.venue}
                          </span>
                          <span className="font-mono-tabular">
                            {b.enrollmentCount}/{b.capacity} ({available} {t('seatsLeftShort')})
                          </span>
                        </div>
                      </div>
                      <StatusText status={b.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekly View */}
      {calView === 'weekly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
          {weekDays.map((d) => {
            const iso = toIsoDate(d);
            const dayBatches = batchesOnDate(iso);
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                className={`bg-white border rounded-lg p-2.5 min-h-[220px] flex flex-col gap-2 ${
                  isToday ? 'border-slate-900' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-700">
                    {d.toLocaleDateString(locale, { weekday: 'short' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAnchorDate(parseIsoDate(iso));
                      setCalView('daily');
                    }}
                    className={`font-mono-tabular text-xs px-1.5 py-0.5 rounded ${
                      isToday ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                </div>

                <div className="space-y-1.5 flex-1">
                  {dayBatches.map((b) => {
                    const crs = courseMap.get(b.courseId);
                    const trn = trainerMap.get(b.trainerId);
                    const hasConflict = conflictBatchIds.has(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBatch(b)}
                        className={`w-full text-start p-2 rounded border text-[11px] transition-colors ${
                          hasConflict
                            ? 'border-red-300 bg-red-50/70 hover:bg-red-50'
                            : b.status === 'cancelled'
                              ? 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                              : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-mono-tabular font-semibold text-slate-900">
                          <span>{b.batchNumber}</span>
                          {hasConflict && <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />}
                        </div>
                        <div className="text-slate-800 font-medium truncate">
                          {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId}
                        </div>
                        <div className="text-slate-500 truncate">
                          {trn ? (lang === 'ar' ? trn.nameAr : trn.nameEn) : b.trainerId}
                        </div>
                        <div className="font-mono-tabular text-[10px] text-slate-500 mt-0.5">
                          {b.startTime || '08:00'}–{b.endTime || '16:00'} · {b.enrollmentCount}/{b.capacity}
                        </div>
                      </button>
                    );
                  })}
                  {dayBatches.length === 0 && (
                    <p className="text-[11px] text-slate-300 text-center pt-6">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly View */}
      {calView === 'monthly' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {dayHeaders.map((h) => (
              <div key={h} className="py-2 px-2 text-center text-[11px] font-semibold text-slate-600">
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 rtl:divide-x-reverse">
            {monthCells.map((cell) => {
              const dayBatches = batchesOnDate(cell.iso);
              const isToday = cell.iso === todayIso;
              return (
                <div
                  key={cell.iso}
                  className={`min-h-[104px] p-1.5 flex flex-col gap-1 ${
                    cell.inMonth ? 'bg-white' : 'bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setAnchorDate(cell.date);
                        setCalView('daily');
                      }}
                      className={`font-mono-tabular text-[11px] px-1.5 py-0.5 rounded ${
                        isToday
                          ? 'bg-slate-900 text-white font-semibold'
                          : cell.inMonth
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-slate-400'
                      }`}
                    >
                      {cell.date.getDate()}
                    </button>
                    {dayBatches.length > 0 && (
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        {dayBatches.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[76px]">
                    {dayBatches.slice(0, 3).map((b) => {
                      const crs = courseMap.get(b.courseId);
                      const hasConflict = conflictBatchIds.has(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onSelectBatch(b)}
                          className={`w-full text-start px-1.5 py-1 rounded border text-[10px] truncate block ${
                            hasConflict
                              ? 'border-red-300 bg-red-50 text-red-900'
                              : b.status === 'cancelled'
                                ? 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                                : b.status === 'completed'
                                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                                  : 'border-sky-200 bg-sky-50/70 text-slate-900'
                          }`}
                          title={`${b.batchNumber}: ${crs?.titleEn || b.courseId}`}
                        >
                          <span className="font-mono-tabular font-semibold">{b.batchNumber}</span>{' '}
                          <span>{crs?.courseCode || ''}</span>
                        </button>
                      );
                    })}
                    {dayBatches.length > 3 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnchorDate(cell.date);
                          setCalView('daily');
                        }}
                        className="text-[10px] text-sky-700 hover:underline px-1"
                      >
                        +{dayBatches.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
