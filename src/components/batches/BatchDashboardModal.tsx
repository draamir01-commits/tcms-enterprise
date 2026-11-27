import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Ban,
  BookOpen,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  Lock,
  Unlock,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Batch, Course, Enrollment, Trainer } from '../../types/tcms';
import {
  ErrorAlert,
  Modal,
  NotificationBanner,
  StatusText,
  TableSkeleton,
  TextArea,
} from '../ui/UiKit';

interface DashboardRosterItem {
  enrollment: Enrollment;
  candidate: {
    id: string;
    candidateId: string;
    fullNameEn: string;
    fullNameAr: string;
    organizationId?: string;
    companyName?: string;
    companyNameAr?: string;
  } | null;
  attendance: {
    total: number;
    present: number;
    absent: number;
    pct: number;
  };
  latestAssessment: {
    assessmentType: string;
    obtainedMarks: number;
    maxMarks: number;
    result: 'pass' | 'fail';
  } | null;
  trainingCard: { id: string; cardSerialNumber: string; status: string } | null;
  certificate: { id: string; certificateNumber: string; status: string } | null;
}

interface BatchDashboardResponse {
  batch: Batch;
  course: Course | null;
  trainer: Trainer | null;
  conflictingBatches: Batch[];
  summary: {
    capacity: number;
    minParticipants: number;
    enrolledCount: number;
    availableSeats: number;
    pendingCount: number;
    confirmedCount: number;
    inProgressCount: number;
    completedCount: number;
    failedCount: number;
    cancelledOrWithdrawnCount: number;
    enrollmentClosed: boolean;
    uniqueAttendanceDates: number;
    attendanceRatePct: number;
    assessedCount: number;
    assessmentPassCount: number;
    assessmentFailCount: number;
    trainerRecommendedCount: number;
    completionApprovedCount: number;
    trainingCardsCount: number;
    certificatesCount: number;
  };
  roster: DashboardRosterItem[];
}

export function BatchDashboardModal({
  batchId,
  canManage,
  onClose,
  onEdit,
  onBatchChanged,
}: {
  batchId: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (batch: Batch) => void;
  onBatchChanged: () => Promise<void> | void;
}) {
  const { lang, t, formatDate } = useLanguage();
  const [data, setData] = useState<BatchDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<BatchDashboardResponse>(`/api/batches/${batchId}/dashboard`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (batchId) {
      setCancelOpen(false);
      setCancelReason('');
      void loadDashboard();
    } else {
      setData(null);
    }
  }, [batchId, loadDashboard]);

  const handleToggleEnrollment = async () => {
    if (!data) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/batches/${data.batch.id}/toggle-enrollment`, {
        method: 'POST',
        body: JSON.stringify({ closed: !data.summary.enrollmentClosed }),
      });
      await loadDashboard();
      await onBatchChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusUpdate = async (nextStatus: Batch['status']) => {
    if (!data) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/batches/${data.batch.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadDashboard();
      await onBatchChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !cancelReason.trim()) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/batches/${data.batch.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setCancelOpen(false);
      await loadDashboard();
      await onBatchChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const title = data
    ? `${t('batchDashboard')} — ${data.batch.batchNumber}${data.batch.batchName ? ` (${data.batch.batchName})` : ''}`
    : t('batchDashboard');

  return (
    <Modal open={Boolean(batchId)} onClose={onClose} title={title} maxWidth="max-w-5xl">
      <div className="space-y-5">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        {loading && !data ? (
          <TableSkeleton rows={5} cols={6} />
        ) : data ? (
          <>
            {data.conflictingBatches.length > 0 && (
              <NotificationBanner
                variant="warning"
                message={`${t('scheduleConflictWarning')}: ${data.conflictingBatches.map((c) => `${c.batchNumber} (${c.startDate}→${c.endDate})`).join(', ')}`}
              />
            )}

            {data.batch.status === 'cancelled' && data.batch.cancellationReason && (
              <NotificationBanner
                variant="error"
                message={`${t('cancellationReasonLabel')}: ${data.batch.cancellationReason}`}
              />
            )}

            {/* Header Metadata + Quick Admin Actions */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono-tabular text-xs font-bold text-slate-900">
                      {data.batch.batchNumber}
                    </span>
                    <StatusText status={data.batch.status} />
                    <span
                      className={`text-xs font-medium ${
                        data.summary.enrollmentClosed ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {data.summary.enrollmentClosed ? t('enrollmentClosedLabel') : t('enrollmentOpenLabel')}
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900">
                    {data.course ? (lang === 'ar' ? data.course.titleAr : data.course.titleEn) : data.batch.courseId}
                    {data.course?.courseCode && (
                      <span className="ms-2 text-xs font-mono-tabular text-slate-500">
                        ({data.course.courseCode})
                      </span>
                    )}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      {data.trainer
                        ? lang === 'ar'
                          ? data.trainer.nameAr
                          : data.trainer.nameEn
                        : data.batch.trainerId}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-mono-tabular">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(data.batch.startDate)} → {formatDate(data.batch.endDate)} ({data.batch.startTime || '08:00'}–{data.batch.endTime || '16:00'})
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      {t(`mode_${data.batch.trainingMode || 'classroom'}`)} · {data.batch.venue}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEdit(data.batch);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{t('rescheduleBatch')}</span>
                    </button>

                    {data.batch.status !== 'cancelled' && data.batch.status !== 'completed' && (
                      <>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleToggleEnrollment()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50 disabled:opacity-50"
                        >
                          {data.summary.enrollmentClosed ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                              <span>{t('reopenEnrollment')}</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-700" />
                              <span>{t('closeEnrollment')}</span>
                            </>
                          )}
                        </button>

                        {data.batch.status === 'scheduled' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleStatusUpdate('in_progress')}
                            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
                          >
                            {t('markInProgressAction')}
                          </button>
                        )}
                        {data.batch.status === 'in_progress' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleStatusUpdate('completed')}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {t('markCompletedAction')}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => setCancelOpen((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 bg-white rounded-md hover:bg-red-50 disabled:opacity-50"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{t('cancelBatch')}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {data.batch.notes && (
                <p className="text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                  <span className="font-medium text-slate-700">{t('batchNotesLabel')}: </span>
                  {data.batch.notes}
                </p>
              )}
            </div>

            {cancelOpen && (
              <form onSubmit={handleConfirmCancel} className="border border-red-200 bg-red-50/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t('cancelBatchTitle')}</span>
                </div>
                <TextArea
                  required
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('cancellationReasonPlaceholder')}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelOpen(false)}
                    className="px-3 py-1.5 text-xs border border-slate-200 bg-white rounded-md"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy || !cancelReason.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {t('cancelBatch')}
                  </button>
                </div>
              </form>
            )}

            {/* 4 Dashboard Progress Panels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{t('availableSeatsLabel')}</span>
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl font-semibold text-slate-900 font-mono-tabular">
                  {data.summary.enrolledCount} / {data.summary.capacity}
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      data.summary.enrolledCount > data.summary.capacity ? 'bg-amber-600' : 'bg-slate-900'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((data.summary.enrolledCount / Math.max(1, data.summary.capacity)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono-tabular">
                  {data.summary.availableSeats} {t('seatsLeftShort')} · Min {data.summary.minParticipants} (
                  {data.summary.enrolledCount >= data.summary.minParticipants
                    ? t('minThresholdMet')
                    : t('minThresholdPending')}
                  )
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{t('attendanceProgressLabel')}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl font-semibold text-slate-900 font-mono-tabular">
                  {data.summary.attendanceRatePct}%
                </div>
                <p className="text-[11px] text-slate-500 font-mono-tabular">
                  {data.summary.uniqueAttendanceDates} {t('sessionsRecordedLabel')}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{t('assessmentProgressLabel')}</span>
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl font-semibold text-slate-900 font-mono-tabular">
                  {data.summary.assessedCount} / {data.summary.enrolledCount}
                </div>
                <p className="text-[11px] text-slate-500 font-mono-tabular">
                  {data.summary.assessmentPassCount} {t('passedLabel')} · {data.summary.assessmentFailCount}{' '}
                  {t('failedLabel')}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{t('completionStatusLabel')}</span>
                  <Award className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xl font-semibold text-slate-900 font-mono-tabular">
                  {data.summary.completedCount} / {data.summary.enrolledCount}
                </div>
                <p className="text-[11px] text-slate-500 font-mono-tabular">
                  {data.summary.trainingCardsCount} {t('cardsIssuedLabel')} · {data.summary.certificatesCount}{' '}
                  {t('certsIssuedLabel')}
                </p>
              </div>
            </div>

            {/* Roster Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold text-slate-900">
                  {t('batchRosterTitle')} ({data.roster.length})
                </h5>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono-tabular">
                  <span>{t('status_pending')}: {data.summary.pendingCount}</span>
                  <span>{t('status_confirmed')}: {data.summary.confirmedCount}</span>
                  <span>{t('status_in_progress')}: {data.summary.inProgressCount}</span>
                  <span>{t('status_completed')}: {data.summary.completedCount}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2 px-3 text-start">#</th>
                      <th className="py-2 px-3 text-start">{t('nav_candidates')}</th>
                      <th className="py-2 px-3 text-start">{t('attendanceProgressLabel')}</th>
                      <th className="py-2 px-3 text-start">{t('assessmentProgressLabel')}</th>
                      <th className="py-2 px-3 text-start">{t('nav_training_cards')}</th>
                      <th className="py-2 px-3 text-start">{t('nav_certificates')}</th>
                      <th className="py-2 px-3 text-start">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.roster.map((item) => (
                      <tr key={item.enrollment.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono-tabular font-semibold text-slate-900">
                          {item.enrollment.enrollmentNumber}
                          {item.enrollment.capacityOverride && (
                            <span className="block text-[10px] font-normal text-amber-700">
                              {t('capacityOverrideBadge')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-900">
                            {item.candidate
                              ? lang === 'ar'
                                ? item.candidate.fullNameAr
                                : item.candidate.fullNameEn
                              : item.enrollment.candidateId}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular">
                            {item.enrollment.candidateId}
                            {item.candidate?.companyName ? ` · ${lang === 'ar' ? item.candidate.companyNameAr || item.candidate.companyName : item.candidate.companyName}` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono-tabular">
                          {item.attendance.total > 0
                            ? `${item.attendance.pct}% (${item.attendance.present}/${item.attendance.total})`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono-tabular">
                          {item.latestAssessment ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span>
                                {item.latestAssessment.obtainedMarks}/{item.latestAssessment.maxMarks}
                              </span>
                              <StatusText status={item.latestAssessment.result} />
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono-tabular">
                          {item.trainingCard ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CreditCard className="w-3 h-3" />
                              {item.trainingCard.cardSerialNumber}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono-tabular">
                          {item.certificate ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <Award className="w-3 h-3" />
                              {item.certificate.certificateNumber}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <StatusText status={item.enrollment.status} />
                        </td>
                      </tr>
                    ))}
                    {data.roster.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                          {t('noBatchEnrollments')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
