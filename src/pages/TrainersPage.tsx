import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Edit2, Eye, Plus, Power, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type { Batch, Course, Trainer, TrainerEmploymentStatus } from '../types/tcms';
import {
  EmptyState,
  ErrorAlert,
  NotificationBanner,
  SearchFilterBar,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import { TrainerFormModal } from '../components/trainers/TrainerFormModal';
import {
  TrainerProfileModal,
  type TrainerWorkloadItem,
} from '../components/trainers/TrainerProfileModal';

type MainTab = 'directory' | 'workload';

export function TrainersPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [workloads, setWorkloads] = useState<TrainerWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employmentFilter, setEmploymentFilter] = useState<'all' | TrainerEmploymentStatus>('all');
  const [courseFilter, setCourseFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [viewTrainer, setViewTrainer] = useState<Trainer | null>(null);

  const canManage = isTenantAdminRole(profile?.role);
  const isTrainerUser = profile?.role === 'trainer';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trnRes, crsRes, bthRes, wlRes] = await Promise.all([
        apiFetch<{ trainers: Trainer[] }>('/api/trainers'),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        apiFetch<{ workloads: TrainerWorkloadItem[] }>('/api/trainers/workload').catch(() => ({
          workloads: [],
        })),
      ]);
      setTrainers(trnRes.trainers);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
      setWorkloads(wlRes.workloads);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const workloadMap = useMemo(
    () => new Map(workloads.map((w) => [w.trainerId, w])),
    [workloads]
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (tr: Trainer) => {
    setEditing(tr);
    setFormOpen(true);
  };

  const toggleTrainerStatus = async (tr: Trainer) => {
    try {
      const nextStatus = tr.status === 'active' ? 'inactive' : 'active';
      await apiFetch(`/api/trainers/${tr.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEmploymentFilter('all');
    setCourseFilter('all');
  };

  const filteredTrainers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trainers.filter((tr) => {
      if (statusFilter !== 'all' && tr.status !== statusFilter) return false;
      if (employmentFilter !== 'all' && (tr.employmentStatus || 'full_time') !== employmentFilter) {
        return false;
      }
      if (courseFilter !== 'all' && !(tr.assignedCourseIds || []).includes(courseFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = `${tr.trainerId} ${tr.nameEn} ${tr.nameAr} ${tr.specialization} ${tr.certifications || ''} ${tr.nationality || ''} ${tr.email} ${tr.mobile}`.toLowerCase();
      return hay.includes(q);
    });
  }, [trainers, searchQuery, statusFilter, employmentFilter, courseFilter]);

  const upcomingScheduleRows = useMemo(() => {
    const trainerById = new Map(trainers.map((tr) => [tr.id, tr]));
    const rows: Array<
      TrainerWorkloadItem['schedule'][number] & { trainer: Trainer | undefined }
    > = [];
    for (const wl of workloads) {
      const tr = trainerById.get(wl.trainerId);
      if (courseFilter !== 'all' && !(tr?.assignedCourseIds || []).includes(courseFilter)) {
        continue;
      }
      for (const s of wl.schedule) {
        if (s.status === 'scheduled' || s.status === 'in_progress') {
          rows.push({ ...s, trainer: tr });
        }
      }
    }
    return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [workloads, trainers, courseFilter]);

  return (
    <div className="space-y-5">
      {isTrainerUser && (
        <NotificationBanner variant="info" message={t('trainerSelfNotice')} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ${
              activeTab === 'directory' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('tabTrainersDirectory')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workload')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ${
              activeTab === 'workload' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{t('tabWorkloadSchedule')}</span>
          </button>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('addTrainer')}</span>
          </button>
        )}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {activeTab === 'directory' && (
        <>
          <SearchFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={
              lang === 'ar'
                ? 'ابحث برقم المدرب أو الاسم أو التخصص أو الشهادات...'
                : 'Search by Trainer ID, Name, Specialization, Certifications, or Contact...'
            }
            onReset={resetFilters}
            filters={
              <>
                <select
                  value={employmentFilter}
                  onChange={(e) =>
                    setEmploymentFilter(e.target.value as 'all' | TrainerEmploymentStatus)
                  }
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="all">{t('filterEmploymentStatus')}</option>
                  <option value="full_time">{t('empStatus_full_time')}</option>
                  <option value="part_time">{t('empStatus_part_time')}</option>
                  <option value="contract">{t('empStatus_contract')}</option>
                  <option value="freelance">{t('empStatus_freelance')}</option>
                </select>

                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md max-w-[200px]"
                >
                  <option value="all">{t('filterAssignedCourse')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode} — {lang === 'ar' ? c.titleAr : c.titleEn}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="all">{t('filterByStatus')}</option>
                  <option value="active">{t('status_active')}</option>
                  <option value="inactive">{t('status_inactive')}</option>
                  <option value="archived">{t('status_archived')}</option>
                </select>
              </>
            }
          />

          {loading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : filteredTrainers.length === 0 ? (
            <EmptyState
              title={t('noRecords')}
              description={
                canManage
                  ? 'Register certified trainers with qualifications, certifications, and course assignments.'
                  : t('noRecords')
              }
              actionLabel={canManage ? t('addTrainer') : undefined}
              onAction={canManage ? openCreate : undefined}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4 text-start">{t('trainerIdLabel')} / {t('trainerNameEn')}</th>
                    <th className="py-2.5 px-4 text-start">{t('nationality')}</th>
                    <th className="py-2.5 px-4 text-start">{t('specializationLabel')}</th>
                    <th className="py-2.5 px-4 text-start">{t('employmentStatus')}</th>
                    <th className="py-2.5 px-4 text-start">{t('assignedCoursesCountLabel')}</th>
                    <th className="py-2.5 px-4 text-start">{t('mobileNumber')} / {t('emailAddress')}</th>
                    <th className="py-2.5 px-4 text-start">{t('status')}</th>
                    <th className="py-2.5 px-4 text-end">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredTrainers.map((tr) => {
                    const wl = workloadMap.get(tr.id);
                    const batchCount =
                      wl?.totalBatches ?? batches.filter((b) => b.trainerId === tr.id).length;
                    return (
                      <tr key={tr.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <ProtectedImage
                              fileId={tr.photoFileId}
                              alt={tr.nameEn}
                              fallbackText={tr.nameEn}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200"
                            />
                            <div>
                              <button
                                type="button"
                                onClick={() => setViewTrainer(tr)}
                                className="font-medium text-slate-900 hover:underline text-start block"
                              >
                                {tr.nameEn}
                              </button>
                              <div className="text-[11px] text-slate-500">
                                <span className="font-mono-tabular font-semibold me-1.5">
                                  {tr.trainerId}
                                </span>
                                <span dir="rtl">{tr.nameAr}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {tr.nationality || '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="text-slate-900 font-medium">{tr.specialization}</div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular">
                            {tr.experienceYears || 0} {t('yrsShort')}
                            {tr.certifications ? ` · ${tr.certifications}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                          {t(`empStatus_${tr.employmentStatus || 'full_time'}`)}
                        </td>
                        <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap">
                          <div className="text-slate-900 font-semibold">
                            {(tr.assignedCourseIds || []).length} {t('enrolledCoursesCount')}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {batchCount} {t('nav_batches')}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-mono-tabular text-slate-900">{tr.mobile}</div>
                          <div className="text-[11px] text-slate-500">{tr.email}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={tr.status} />
                        </td>
                        <td className="py-2.5 px-4 text-end whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setViewTrainer(tr)}
                            title={t('view')}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(tr)}
                                title={t('editTrainer')}
                                className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleTrainerStatus(tr)}
                                title={tr.status === 'active' ? t('deactivateAccount') : t('activateAccount')}
                                className={`p-1.5 rounded ${
                                  tr.status === 'active'
                                    ? 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
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
        </>
      )}

      {activeTab === 'workload' && (
        <div className="space-y-5">
          {loading ? (
            <TableSkeleton rows={4} cols={7} />
          ) : workloads.length === 0 ? (
            <EmptyState title={t('noRecords')} description={t('noBatchesAssigned')} />
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-xs font-semibold text-slate-900">{t('trainerWorkload')}</h3>
                </div>
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-4 text-start">{t('trainerNameEn')}</th>
                      <th className="py-2.5 px-4 text-start">{t('assignedCoursesCountLabel')}</th>
                      <th className="py-2.5 px-4 text-start">{t('upcomingBatchesCount')}</th>
                      <th className="py-2.5 px-4 text-start">{t('activeBatchesCount')}</th>
                      <th className="py-2.5 px-4 text-start">{t('completedBatchesCount')}</th>
                      <th className="py-2.5 px-4 text-start">{t('totalTraineesCount')}</th>
                      <th className="py-2.5 px-4 text-start">{t('scheduledHoursCount')}</th>
                      <th className="py-2.5 px-4 text-end">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {workloads.map((wl) => {
                      const tr = trainers.find((item) => item.id === wl.trainerId);
                      return (
                        <tr key={wl.trainerId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">
                              {tr ? (lang === 'ar' ? tr.nameAr : tr.nameEn) : wl.trainerCode}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-tabular">
                              {wl.trainerCode}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular font-semibold">
                            {wl.assignedCoursesCount}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular text-amber-700 font-semibold">
                            {wl.upcomingBatches}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular text-emerald-700 font-semibold">
                            {wl.activeBatches}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                            {wl.completedBatches}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular text-slate-900">
                            {wl.totalEnrolledTrainees}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular text-slate-900 font-semibold">
                            {wl.scheduledHours} {t('hrsShort')}
                          </td>
                          <td className="py-2.5 px-4 text-end">
                            {tr && (
                              <button
                                type="button"
                                onClick={() => setViewTrainer(tr)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('view')}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-xs font-semibold text-slate-900">{t('trainerSchedule')}</h3>
                </div>
                {upcomingScheduleRows.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">{t('noBatchesAssigned')}</p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {upcomingScheduleRows.map((row) => (
                      <div
                        key={row.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/60"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-tabular font-semibold text-slate-900">
                              {row.batchNumber}
                            </span>
                            <span className="font-mono-tabular text-slate-600">
                              {row.courseCode}
                            </span>
                            <span className="font-medium text-slate-900">
                              {lang === 'ar' ? row.courseTitleAr : row.courseTitleEn}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-medium text-slate-700 me-2">
                              {row.trainer
                                ? lang === 'ar'
                                  ? row.trainer.nameAr
                                  : row.trainer.nameEn
                                : row.trainerId}
                            </span>
                            <span className="font-mono-tabular">
                              · {row.startDate} → {row.endDate} ({row.startTime || '08:00'}–{row.endTime || '16:00'}) · {row.venue}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusText status={row.status} />
                          {row.trainer && (
                            <button
                              type="button"
                              onClick={() => setViewTrainer(row.trainer!)}
                              className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50"
                            >
                              {t('view')}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <TrainerFormModal
        open={formOpen}
        editing={editing}
        courses={courses}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
      />

      <TrainerProfileModal
        trainer={viewTrainer}
        courses={courses}
        allBatches={batches}
        workload={viewTrainer ? workloadMap.get(viewTrainer.id) : undefined}
        canManage={canManage}
        onClose={() => setViewTrainer(null)}
        onRefresh={loadData}
      />
    </div>
  );
}
