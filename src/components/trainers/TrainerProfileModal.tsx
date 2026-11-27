import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CalendarDays,
  Download,
  Eye,
  FileText,
  History,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AuditLogItem, Batch, Course, Trainer } from '../../types/tcms';
import {
  ErrorAlert,
  Modal,
  NotificationBanner,
  PdfPreviewModal,
  SelectInput,
  StatusText,
  SuccessAlert,
} from '../ui/UiKit';
import { ProtectedImage } from '../ui/ProtectedImage';

interface VaultFileMeta {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface TrainerWorkloadItem {
  trainerId: string;
  trainerCode: string;
  assignedCoursesCount: number;
  totalBatches: number;
  upcomingBatches: number;
  activeBatches: number;
  completedBatches: number;
  totalEnrolledTrainees: number;
  scheduledHours: number;
  schedule: Array<
    Batch & {
      courseCode: string;
      courseTitleEn: string;
      courseTitleAr: string;
    }
  >;
}

interface TrainerHistoryBundle {
  trainer: Trainer;
  logs: AuditLogItem[];
  batches: Batch[];
}

interface TrainerProfileModalProps {
  trainer: Trainer | null;
  courses: Course[];
  allBatches: Batch[];
  workload?: TrainerWorkloadItem;
  canManage: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}

type ProfileTab = 'profile' | 'courses' | 'schedule' | 'history';

function toMinutes(val: string | undefined, fallback: number): number {
  if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fallback;
  const [h, m] = val.trim().split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

export function TrainerProfileModal({
  trainer,
  courses,
  allBatches,
  workload,
  canManage,
  onClose,
  onRefresh,
}: TrainerProfileModalProps) {
  const { lang, t, formatDate } = useLanguage();
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [bundle, setBundle] = useState<TrainerHistoryBundle | null>(null);
  const [docMetaMap, setDocMetaMap] = useState<Record<string, VaultFileMeta>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [savingCourses, setSavingCourses] = useState(false);

  const [assignBatchId, setAssignBatchId] = useState('');
  const [assigningBatch, setAssigningBatch] = useState(false);

  const [previewPdf, setPreviewPdf] = useState<{ fileId: string; title: string } | null>(null);
  const [previewImg, setPreviewImg] = useState<{ fileId: string; title: string } | null>(null);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  useEffect(() => {
    if (!trainer) {
      setBundle(null);
      setDocMetaMap({});
      return;
    }
    setActiveTab('profile');
    setError(null);
    setSuccess(null);
    setAssignBatchId('');
    setSelectedCourseIds(trainer.assignedCourseIds || []);

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const hist = await apiFetch<TrainerHistoryBundle>(`/api/trainers/${trainer.id}/history`);
        if (!active) return;
        setBundle(hist);
        setSelectedCourseIds(hist.trainer.assignedCourseIds || []);

        const credIds = hist.trainer.credentialFileIds || [];
        if (credIds.length > 0) {
          const metaRes = await apiFetch<{ files: VaultFileMeta[] }>('/api/files/meta-batch', {
            method: 'POST',
            body: JSON.stringify({ fileIds: credIds }),
          }).catch(() => ({ files: [] }));
          if (!active) return;
          const map: Record<string, VaultFileMeta> = {};
          for (const f of metaRes.files) map[f.fileId] = f;
          setDocMetaMap(map);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [trainer]);

  const tr = bundle?.trainer || trainer;

  const trainerBatches = useMemo(() => {
    if (!tr) return [];
    const list = bundle?.batches || allBatches.filter((b) => b.trainerId === tr.id);
    return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [tr, bundle, allBatches]);

  const assignableBatches = useMemo(() => {
    if (!tr) return [];
    return allBatches.filter(
      (b) =>
        (b.status === 'scheduled' || b.status === 'in_progress') &&
        b.trainerId !== tr.id
    );
  }, [tr, allBatches]);

  const batchConflict = useMemo(() => {
    if (!assignBatchId || !tr) return null;
    const target = allBatches.find((b) => b.id === assignBatchId);
    if (!target) return null;
    const tS = toMinutes(target.startTime, 8 * 60);
    const tE = toMinutes(target.endTime, 16 * 60);

    return (
      trainerBatches.find((b) => {
        if (b.id === target.id) return false;
        if (b.status !== 'scheduled' && b.status !== 'in_progress') return false;
        const datesOverlap = target.startDate <= b.endDate && target.endDate >= b.startDate;
        if (!datesOverlap) return false;
        const bS = toMinutes(b.startTime, 8 * 60);
        const bE = toMinutes(b.endTime, 16 * 60);
        return tS < bE && tE > bS;
      }) || null
    );
  }, [assignBatchId, tr, allBatches, trainerBatches]);

  if (!tr) return null;

  const handleSaveCourses = async () => {
    setSavingCourses(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{ trainer: Trainer }>(
        `/api/trainers/${tr.id}/assign-courses`,
        {
          method: 'POST',
          body: JSON.stringify({ courseIds: selectedCourseIds }),
        }
      );
      setBundle((prev) => (prev ? { ...prev, trainer: res.trainer } : prev));
      setSuccess(t('saveCourseAssignments'));
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCourses(false);
    }
  };

  const handleAssignBatch = async () => {
    if (!assignBatchId) return;
    setAssigningBatch(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/batches/${assignBatchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ trainerId: tr.id }),
      });
      setAssignBatchId('');
      const refreshed = await apiFetch<TrainerHistoryBundle>(`/api/trainers/${tr.id}/history`);
      setBundle(refreshed);
      setSuccess(t('assignToBatch'));
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigningBatch(false);
    }
  };

  const tabs: Array<{ key: ProfileTab; label: string; icon: React.ReactNode }> = [
    { key: 'profile', label: t('tabProfileCredentials'), icon: <Award className="w-3.5 h-3.5" /> },
    { key: 'courses', label: t('tabAssignedCoursesWorkload'), icon: <BookOpen className="w-3.5 h-3.5" /> },
    { key: 'schedule', label: t('tabScheduleBatches'), icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { key: 'history', label: t('tabTrainerHistory'), icon: <History className="w-3.5 h-3.5" /> },
  ];

  const formatBytes = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      <Modal
        open={Boolean(trainer)}
        onClose={onClose}
        title={`${tr.trainerId} · ${lang === 'ar' ? tr.nameAr : tr.nameEn}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            <ProtectedImage
              fileId={tr.photoFileId}
              alt={tr.nameEn}
              fallbackText={tr.nameEn}
              className="w-14 h-14 rounded-full object-cover border border-slate-200"
              fallbackClassName="w-14 h-14 rounded-full bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center text-sm font-semibold shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono-tabular text-[11px] font-semibold text-slate-500 me-2">
                    {tr.trainerId}
                  </span>
                  <span className="font-semibold text-sm text-slate-900">{tr.nameEn}</span>
                  <span className="text-slate-500 ms-2" dir="rtl">
                    {tr.nameAr}
                  </span>
                </div>
                <StatusText status={tr.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 mt-1">
                <span>{tr.specialization}</span>
                {tr.nationality && <span>· {tr.nationality}</span>}
                <span>
                  · {t(`empStatus_${tr.employmentStatus || 'full_time'}`)}
                </span>
                <span className="font-mono-tabular">
                  · {tr.experienceYears || 0} {t('yrsShort')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <ErrorAlert message={error} onDismiss={() => setError(null)} />
          <SuccessAlert message={success} onDismiss={() => setSuccess(null)} />

          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 border border-slate-200 rounded-md">
                  <span className="text-[11px] text-slate-500 block">{t('mobileNumber')}</span>
                  <span className="font-mono-tabular font-medium text-slate-900">{tr.mobile}</span>
                </div>
                <div className="p-3 border border-slate-200 rounded-md">
                  <span className="text-[11px] text-slate-500 block">{t('emailAddress')}</span>
                  <span className="font-medium text-slate-900 break-all">{tr.email}</span>
                </div>
                <div className="p-3 border border-slate-200 rounded-md">
                  <span className="text-[11px] text-slate-500 block">{t('nationality')}</span>
                  <span className="font-medium text-slate-900">{tr.nationality || '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 border border-slate-200 rounded-md space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    {t('professionalQualifications')}
                  </span>
                  <p className="text-slate-800 whitespace-pre-line">{tr.qualifications || '—'}</p>
                </div>
                <div className="p-3.5 border border-slate-200 rounded-md space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    {t('certificationsLabel')}
                  </span>
                  <p className="text-slate-800 whitespace-pre-line">{tr.certifications || '—'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('qualificationDocuments')}</span>
                </h4>
                {(tr.credentialFileIds || []).length === 0 ? (
                  <p className="text-slate-500 border border-slate-200 rounded-md p-3">
                    {t('noRecords')}
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                    {(tr.credentialFileIds || []).map((fid) => {
                      const meta = docMetaMap[fid];
                      const isPdf = meta?.mimeType === 'application/pdf';
                      const isImg = meta?.mimeType?.startsWith('image/');
                      return (
                        <div key={fid} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-slate-900 block truncate">
                              {meta?.fileName || fid}
                            </span>
                            {meta && (
                              <span className="text-[11px] text-slate-500 font-mono-tabular">
                                {meta.mimeType} · {formatBytes(meta.fileSize)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {(isPdf || isImg) && (
                              <button
                                type="button"
                                onClick={() =>
                                  isPdf
                                    ? setPreviewPdf({ fileId: fid, title: meta?.fileName || fid })
                                    : setPreviewImg({ fileId: fid, title: meta?.fileName || fid })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('previewFile')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void downloadProtectedFile(
                                  `/api/files/${encodeURIComponent(fid)}`,
                                  meta?.fileName || `${fid}.bin`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                            >
                              <Download className="w-3 h-3" />
                              <span>{t('download')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="space-y-4">
              {workload && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('assignedCoursesCountLabel')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-slate-900">
                      {workload.assignedCoursesCount}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('upcomingBatchesCount')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-amber-700">
                      {workload.upcomingBatches}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('activeBatchesCount')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-emerald-700">
                      {workload.activeBatches}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('completedBatchesCount')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-slate-700">
                      {workload.completedBatches}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('totalTraineesCount')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-slate-900">
                      {workload.totalEnrolledTrainees}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-md">
                    <span className="text-[11px] text-slate-500 block">{t('scheduledHoursCount')}</span>
                    <span className="text-base font-semibold font-mono-tabular text-slate-900">
                      {workload.scheduledHours} {t('hrsShort')}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">{t('assignCourses')}</h4>
                  {canManage && (
                    <button
                      type="button"
                      disabled={savingCourses}
                      onClick={() => void handleSaveCourses()}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60"
                    >
                      {savingCourses ? t('loading') : t('saveCourseAssignments')}
                    </button>
                  )}
                </div>

                {canManage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-slate-200 rounded-md p-3 max-h-64 overflow-y-auto">
                    {courses.map((c) => (
                      <label key={c.id} className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(c.id)}
                          onChange={(e) => {
                            setSelectedCourseIds((prev) =>
                              e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                        <span className="truncate">
                          <span className="font-mono-tabular font-semibold me-1">{c.courseCode}</span>
                          — {lang === 'ar' ? c.titleAr : c.titleEn}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                    {(tr.assignedCourseIds || []).map((cid) => {
                      const crs = courseMap.get(cid);
                      return (
                        <div key={cid} className="px-3 py-2 flex items-center justify-between">
                          <div>
                            <span className="font-mono-tabular font-semibold me-2">
                              {crs?.courseCode || cid}
                            </span>
                            <span className="text-slate-900">
                              {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : cid}
                            </span>
                          </div>
                          {crs && <StatusText status={crs.status} />}
                        </div>
                      );
                    })}
                    {(tr.assignedCourseIds || []).length === 0 && (
                      <p className="p-3 text-slate-500">{t('noRecords')}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-4">
              {canManage && tr.status === 'active' && (
                <div className="p-3.5 border border-slate-200 rounded-md bg-slate-50/60 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[220px] space-y-1">
                      <label className="block text-xs font-medium text-slate-700">
                        {t('reassignTrainer')} / {t('assignToBatch')}
                      </label>
                      <SelectInput
                        value={assignBatchId}
                        onChange={(e) => setAssignBatchId(e.target.value)}
                      >
                        <option value="">{t('selectBatchToAssign')}</option>
                        {assignableBatches.map((b) => {
                          const crs = courseMap.get(b.courseId);
                          return (
                            <option key={b.id} value={b.id}>
                              {b.batchNumber} — {crs?.courseCode || b.courseId} ({b.startDate} → {b.endDate}, {b.startTime || '08:00'}–{b.endTime || '16:00'})
                            </option>
                          );
                        })}
                      </SelectInput>
                    </div>
                    <button
                      type="button"
                      disabled={!assignBatchId || Boolean(batchConflict) || assigningBatch}
                      onClick={() => void handleAssignBatch()}
                      className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      {assigningBatch ? t('loading') : t('assignToBatch')}
                    </button>
                  </div>

                  {batchConflict && (
                    <NotificationBanner
                      variant="warning"
                      message={`${t('scheduleConflictWarning')}: ${t('scheduleConflictDesc')} ${batchConflict.batchNumber} (${batchConflict.startDate} → ${batchConflict.endDate}, ${batchConflict.startTime || '08:00'}–${batchConflict.endTime || '16:00'})`}
                    />
                  )}
                </div>
              )}

              {canManage && tr.status !== 'active' && (
                <div className="flex items-center gap-2 p-3 border border-amber-200 bg-amber-50 rounded-md text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t(`status_${tr.status}`)}</span>
                </div>
              )}

              <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                {trainerBatches.map((b) => {
                  const crs = courseMap.get(b.courseId);
                  return (
                    <div key={b.id} className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular font-semibold text-slate-900">
                            {b.batchNumber}
                          </span>
                          <span className="font-medium text-slate-800">
                            {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                          {b.startDate} → {b.endDate} · {b.startTime || '08:00'}–{b.endTime || '16:00'} · {b.venue} ({b.enrollmentCount}/{b.capacity})
                        </div>
                      </div>
                      <StatusText status={b.status} />
                    </div>
                  );
                })}
                {trainerBatches.length === 0 && (
                  <p className="p-4 text-slate-500">{t('noBatchesAssigned')}</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {loading && (
                <div className="h-20 bg-slate-50 animate-pulse" />
              )}
              {(bundle?.logs || []).map((log) => (
                <div key={log.id} className="px-3.5 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-semibold text-slate-800">
                      {log.action}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-slate-500">
                      {log.createdAt ? formatDate(log.createdAt) : '—'}
                    </span>
                  </div>
                  <p className="text-slate-600">{log.details}</p>
                  <p className="text-[11px] text-slate-400">{log.actorEmail}</p>
                </div>
              ))}
              {!loading && (bundle?.logs || []).length === 0 && (
                <p className="p-4 text-slate-500">{t('noAuditHistory')}</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <PdfPreviewModal
        fileId={previewPdf?.fileId || null}
        title={previewPdf?.title || ''}
        onClose={() => setPreviewPdf(null)}
      />

      <Modal
        open={Boolean(previewImg)}
        onClose={() => setPreviewImg(null)}
        title={previewImg?.title || ''}
        maxWidth="max-w-2xl"
      >
        {previewImg && (
          <div className="flex justify-center bg-slate-50 border border-slate-200 rounded-md p-3">
            <ProtectedImage
              fileId={previewImg.fileId}
              alt={previewImg.title}
              className="max-h-[70vh] w-auto object-contain rounded"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
