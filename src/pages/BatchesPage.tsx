import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Edit2, Eye, List, Lock, Plus, Unlock } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type { Batch, Course, Trainer, TrainingMode } from '../types/tcms';
import {
  EmptyState,
  ErrorAlert,
  SearchFilterBar,
  StatusText,
  SuccessAlert,
  TableSkeleton,
} from '../components/ui/UiKit';
import { BatchFormModal } from '../components/batches/BatchFormModal';
import { BatchDashboardModal } from '../components/batches/BatchDashboardModal';
import { TrainingCalendar } from '../components/batches/TrainingCalendar';

const TRAINING_MODES: TrainingMode[] = ['classroom', 'practical', 'online', 'hybrid'];

export function BatchesPage() {
  const { profile } = useAuth();
  const { lang, t, formatDate } = useLanguage();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [dashboardBatchId, setDashboardBatchId] = useState<string | null>(null);

  const canManage = isTenantAdminRole(profile?.role);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bthRes, crsRes, trnRes] = await Promise.all([
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ trainers: Trainer[] }>('/api/trainers').catch(() => ({ trainers: [] })),
      ]);
      setBatches(bthRes.batches);
      setCourses(crsRes.courses);
      setTrainers(trnRes.trainers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const trainerMap = useMemo(() => new Map(trainers.map((tr) => [tr.id, tr])), [trainers]);

  const filteredBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...batches]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .filter((b) => {
        if (courseFilter && b.courseId !== courseFilter) return false;
        if (statusFilter && b.status !== statusFilter) return false;
        if (modeFilter && (b.trainingMode || 'classroom') !== modeFilter) return false;
        if (!q) return true;
        const crs = courseMap.get(b.courseId);
        const trn = trainerMap.get(b.trainerId);
        return (
          b.batchId.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.batchName || '').toLowerCase().includes(q) ||
          b.venue.toLowerCase().includes(q) ||
          (crs?.titleEn || '').toLowerCase().includes(q) ||
          (crs?.titleAr || '').toLowerCase().includes(q) ||
          (crs?.courseCode || '').toLowerCase().includes(q) ||
          (trn?.nameEn || '').toLowerCase().includes(q) ||
          (trn?.nameAr || '').toLowerCase().includes(q)
        );
      });
  }, [batches, search, courseFilter, statusFilter, modeFilter, courseMap, trainerMap]);

  const handleStatusChange = async (b: Batch, nextStatus: string) => {
    setError(null);
    try {
      await apiFetch(`/api/batches/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleEnrollment = async (b: Batch) => {
    setError(null);
    try {
      const res = await apiFetch<{ batch: Batch }>(`/api/batches/${b.id}/toggle-enrollment`, {
        method: 'POST',
        body: JSON.stringify({ closed: !b.enrollmentClosed }),
      });
      setSuccessMsg(
        `${res.batch.batchNumber}: ${
          res.batch.enrollmentClosed ? t('enrollmentClosedLabel') : t('enrollmentOpenLabel')
        }`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ${
              viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>{t('viewBatchList')}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ${
              viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{t('viewTrainingCalendar')}</span>
          </button>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingBatch(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('scheduleBatch')}</span>
          </button>
        )}
      </div>

      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        filters={
          <>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">{t('filterAllCourses')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} — {lang === 'ar' ? c.titleAr : c.titleEn}
                </option>
              ))}
            </select>

            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">{t('filterAllModes')}</option>
              {TRAINING_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode_${m}`)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">{t('filterByStatus')}</option>
              <option value="scheduled">{t('status_scheduled')}</option>
              <option value="in_progress">{t('status_in_progress')}</option>
              <option value="completed">{t('status_completed')}</option>
              <option value="cancelled">{t('status_cancelled')}</option>
            </select>
          </>
        }
        onReset={
          search || courseFilter || statusFilter || modeFilter
            ? () => {
                setSearch('');
                setCourseFilter('');
                setStatusFilter('');
                setModeFilter('');
              }
            : undefined
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      <SuccessAlert message={successMsg} onDismiss={() => setSuccessMsg(null)} />

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : viewMode === 'calendar' ? (
        <TrainingCalendar
          batches={filteredBatches}
          courseMap={courseMap}
          trainerMap={trainerMap}
          onSelectBatch={(b) => setDashboardBatchId(b.id)}
        />
      ) : filteredBatches.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description={t('scheduleBatch')}
          actionLabel={canManage ? t('scheduleBatch') : undefined}
          onAction={
            canManage
              ? () => {
                  setEditingBatch(null);
                  setFormOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start">{t('batchIdLabel')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_courses')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_trainers')}</th>
                <th className="py-2.5 px-4 text-start">{t('trainingLocationLabel')}</th>
                <th className="py-2.5 px-4 text-start">{t('availableSeatsLabel')}</th>
                <th className="py-2.5 px-4 text-start">{t('status')}</th>
                <th className="py-2.5 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredBatches.map((b) => {
                const crs = courseMap.get(b.courseId);
                const trn = trainerMap.get(b.trainerId);
                const availableSeats = Math.max(0, b.capacity - (b.enrollmentCount || 0));
                const pct = Math.min(100, Math.round((b.enrollmentCount / Math.max(1, b.capacity)) * 100));
                return (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setDashboardBatchId(b.id)}
                        className="font-mono-tabular font-semibold text-slate-900 hover:underline text-start"
                      >
                        {b.batchNumber}
                      </button>
                      {b.batchName && (
                        <div className="text-[11px] text-slate-600 truncate max-w-[200px]">
                          {b.batchName}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">
                        {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">{crs?.courseCode}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      {trn ? (lang === 'ar' ? trn.nameAr : trn.nameEn) : b.trainerId}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-slate-900">
                        {t(`mode_${b.trainingMode || 'classroom'}`)} · {b.venue}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">
                        {formatDate(b.startDate)} → {formatDate(b.endDate)} ({b.startTime || '08:00'}–{b.endTime || '16:00'})
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              b.enrollmentCount > b.capacity ? 'bg-amber-600' : 'bg-slate-900'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono-tabular font-medium text-slate-900">
                          {b.enrollmentCount}/{b.capacity}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        {availableSeats} {t('seatsLeftShort')}
                        {b.enrollmentClosed && (
                          <span className="ms-1.5 text-red-700 font-medium">· {t('enrollmentClosedLabel')}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      {canManage || profile?.role === 'trainer' ? (
                        <select
                          value={b.status}
                          onChange={(e) => void handleStatusChange(b, e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                        >
                          <option value="scheduled">{t('status_scheduled')}</option>
                          <option value="in_progress">{t('status_in_progress')}</option>
                          <option value="completed">{t('status_completed')}</option>
                          <option value="cancelled">{t('status_cancelled')}</option>
                        </select>
                      ) : (
                        <StatusText status={b.status} />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-end whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDashboardBatchId(b.id)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('viewBatchDashboard')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBatch(b);
                              setFormOpen(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                            title={t('editBatchTitle')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {b.status !== 'cancelled' && b.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => void handleToggleEnrollment(b)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                              title={b.enrollmentClosed ? t('reopenEnrollment') : t('closeEnrollment')}
                            >
                              {b.enrollmentClosed ? (
                                <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-amber-700" />
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BatchFormModal
        open={formOpen}
        editingBatch={editingBatch}
        courses={courses}
        trainers={trainers}
        allBatches={batches}
        onClose={() => {
          setFormOpen(false);
          setEditingBatch(null);
        }}
        onSaved={async (saved) => {
          setSuccessMsg(`${saved.batchNumber} (${saved.batchName || ''}) ${t('saved') || 'saved'}`);
          await loadData();
        }}
      />

      <BatchDashboardModal
        batchId={dashboardBatchId}
        canManage={canManage}
        onClose={() => setDashboardBatchId(null)}
        onEdit={(b) => {
          setEditingBatch(b);
          setFormOpen(true);
        }}
        onBatchChanged={loadData}
      />
    </div>
  );
}
