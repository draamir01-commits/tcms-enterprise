import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Check, XCircle, CreditCard, ClipboardCheck, Award } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type { Batch, Candidate, Course, Enrollment, EnrollmentRequest, EnrollmentStatus } from '../types/tcms';
import {
  DataTable,
  EmptyState,
  ErrorAlert,
  FormField,
  Modal,
  NotificationBanner,
  SearchFilterBar,
  StatusText,
  SuccessAlert,
  TableSkeleton,
  TextInput,
} from '../components/ui/UiKit';
import { EnrollmentRequestModal } from '../components/corporate/EnrollmentRequestModal';
import { EnrollmentRequestReviewModal } from '../components/corporate/EnrollmentRequestReviewModal';
import { EnrollmentWorkflowModal } from '../components/enrollments/EnrollmentWorkflowModal';

const ALL_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'withdrawn',
];

export function EnrollmentsPage() {
  const { profile } = useAuth();
  const { lang, t, formatDate } = useLanguage();

  const [tab, setTab] = useState<'enrollments' | 'requests'>('enrollments');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<EnrollmentRequest | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<EnrollmentRequest | null>(null);

  const [exceptionTarget, setExceptionTarget] = useState<Enrollment | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [confirmingException, setConfirmingException] = useState(false);

  const isCorporate = profile?.role === 'corporate_client';
  const canCreate = isTenantAdminRole(profile?.role) || profile?.role === 'corporate_client';
  const canConfirm = isTenantAdminRole(profile?.role);
  const canUpdateStatus = isTenantAdminRole(profile?.role) || profile?.role === 'trainer';
  const showRequestsTab = isTenantAdminRole(profile?.role) || profile?.role === 'corporate_client';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [enrRes, candRes, crsRes, bthRes, reqRes] = await Promise.all([
        apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments'),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        showRequestsTab
          ? apiFetch<{ requests: EnrollmentRequest[] }>('/api/enrollment-requests').catch(() => ({
              requests: [],
            }))
          : Promise.resolve({ requests: [] }),
      ]);
      setEnrollments(enrRes.enrollments);
      setCandidates(candRes.candidates);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
      setRequests(reqRes.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [showRequestsTab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const pendingReqCount = useMemo(
    () => requests.filter((r) => r.status === 'pending_review' || r.status === 'info_requested').length,
    [requests]
  );

  const filteredEnrollments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrollments.filter((enr) => {
      if (courseFilter && enr.courseId !== courseFilter) return false;
      if (batchFilter && enr.batchId !== batchFilter) return false;
      if (statusFilter && enr.status !== statusFilter) return false;
      if (!q) return true;
      const cand = candMap.get(enr.candidateDocId);
      const crs = courseMap.get(enr.courseId);
      const bth = batchMap.get(enr.batchId);
      return (
        enr.enrollmentNumber.toLowerCase().includes(q) ||
        enr.candidateId.toLowerCase().includes(q) ||
        (cand?.fullNameEn || '').toLowerCase().includes(q) ||
        (cand?.fullNameAr || '').toLowerCase().includes(q) ||
        (crs?.titleEn || '').toLowerCase().includes(q) ||
        (crs?.titleAr || '').toLowerCase().includes(q) ||
        (crs?.courseCode || '').toLowerCase().includes(q) ||
        (bth?.batchNumber || '').toLowerCase().includes(q)
      );
    });
  }, [enrollments, search, courseFilter, batchFilter, statusFilter, candMap, courseMap, batchMap]);

  const handleConfirm = async (enr: Enrollment) => {
    setError(null);
    setSuccessMsg(null);
    const bth = batchMap.get(enr.batchId);
    if (bth && (bth.enrollmentCount >= bth.capacity || bth.enrollmentClosed)) {
      setExceptionTarget(enr);
      setExceptionReason('');
      return;
    }

    try {
      const res = await apiFetch<{ card?: { cardSerialNumber: string } }>(`/api/enrollments/${enr.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSuccessMsg(
        res.card
          ? `Enrollment confirmed and Training Card ${res.card.cardSerialNumber} generated automatically.`
          : 'Enrollment confirmed.'
      );
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('capacity') || msg.toLowerCase().includes('closed')) {
        setExceptionTarget(enr);
        setExceptionReason('');
      } else {
        setError(msg);
      }
    }
  };

  const handleConfirmWithException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionTarget || !exceptionReason.trim()) return;
    setConfirmingException(true);
    setError(null);
    try {
      const res = await apiFetch<{ card?: { cardSerialNumber: string } }>(
        `/api/enrollments/${exceptionTarget.id}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            overrideCapacity: true,
            capacityOverrideReason: exceptionReason.trim(),
          }),
        }
      );
      setSuccessMsg(
        res.card
          ? `Capacity exception approved. Enrollment confirmed and Training Card ${res.card.cardSerialNumber} issued.`
          : 'Capacity exception approved and enrollment confirmed.'
      );
      setExceptionTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmingException(false);
    }
  };

  const handleStatusChange = async (enrId: string, status: string) => {
    setError(null);
    try {
      await apiFetch(`/api/enrollments/${enrId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-5">
      {showRequestsTab && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('enrollments')}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === 'enrollments'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('nav_enrollments')} ({enrollments.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('requests')}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === 'requests'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('tabEnrollmentRequestsQueue')} ({pendingReqCount})
            </button>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                if (isCorporate || tab === 'requests') {
                  setEditingRequest(null);
                  setReqModalOpen(true);
                } else {
                  setWorkflowOpen(true);
                }
              }}
              className="mb-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isCorporate ? t('requestEnrollment') : t('newEnrollmentWizard')}</span>
            </button>
          )}
        </div>
      )}

      {tab === 'enrollments' && (
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
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
              >
                <option value="">{t('filterAllBatches')}</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
              >
                <option value="">{t('filterByStatus')}</option>
                {ALL_ENROLLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status_${s}`)}
                  </option>
                ))}
              </select>
            </>
          }
          onReset={
            search || courseFilter || batchFilter || statusFilter
              ? () => {
                  setSearch('');
                  setCourseFilter('');
                  setBatchFilter('');
                  setStatusFilter('');
                }
              : undefined
          }
        />
      )}

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      <SuccessAlert message={successMsg} onDismiss={() => setSuccessMsg(null)} />

      {tab === 'requests' && showRequestsTab ? (
        <DataTable
          loading={loading}
          rows={requests}
          rowKey={(r) => r.id}
          emptyActionLabel={isCorporate ? t('requestEnrollment') : undefined}
          onEmptyAction={
            isCorporate
              ? () => {
                  setEditingRequest(null);
                  setReqModalOpen(true);
                }
              : undefined
          }
          columns={[
            {
              key: 'number',
              header: t('requestNumber'),
              render: (r) => <span className="font-mono-tabular font-semibold">{r.requestNumber}</span>,
            },
            {
              key: 'org',
              header: t('corporateOrganization'),
              render: (r) =>
                lang === 'ar'
                  ? r.organizationNameAr || r.organizationNameEn || r.organizationId
                  : r.organizationNameEn || r.organizationId,
            },
            {
              key: 'course',
              header: t('targetCourse'),
              render: (r) => {
                const crs = courseMap.get(r.courseId);
                return crs ? `${crs.courseCode} — ${lang === 'ar' ? crs.titleAr : crs.titleEn}` : r.courseId;
              },
            },
            {
              key: 'employees',
              header: t('employeesCount'),
              render: (r) => <span className="font-mono-tabular">{r.candidateDocIds.length}</span>,
            },
            {
              key: 'batch',
              header: t('assignedBatch'),
              render: (r) => {
                const b = batchMap.get(r.assignedBatchId || r.preferredBatchId || '');
                return <span className="font-mono-tabular">{b?.batchNumber || '—'}</span>;
              },
            },
            {
              key: 'status',
              header: t('status'),
              render: (r) => <StatusText status={r.status} />,
            },
            {
              key: 'decision',
              header: t('decisionDate'),
              render: (r) => (
                <span className="font-mono-tabular text-[11px]">
                  {r.decisionDate ? formatDate(r.decisionDate) : formatDate(r.createdAt)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: t('actions'),
              align: 'end',
              render: (r) => {
                if (isCorporate && r.status === 'info_requested') {
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRequest(r);
                        setReqModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      {t('respondAction')}
                    </button>
                  );
                }
                if (canConfirm) {
                  return (
                    <button
                      type="button"
                      onClick={() => setReviewingRequest(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      <span>{r.status === 'approved' || r.status === 'rejected' ? t('view') : t('reviewAction')}</span>
                    </button>
                  );
                }
                return <span className="text-slate-400">—</span>;
              },
            },
          ]}
        />
      ) : loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filteredEnrollments.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description={t('multiCourseHint')}
          actionLabel={canCreate ? (isCorporate ? t('requestEnrollment') : t('newEnrollmentWizard')) : undefined}
          onAction={
            canCreate
              ? () => {
                  if (isCorporate) {
                    setEditingRequest(null);
                    setReqModalOpen(true);
                  } else {
                    setWorkflowOpen(true);
                  }
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start">#</th>
                <th className="py-2.5 px-4 text-start">{t('nav_candidates')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_courses')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_batches')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_training_cards')}</th>
                <th className="py-2.5 px-4 text-start">{t('status')}</th>
                {(canConfirm || canUpdateStatus) && <th className="py-2.5 px-4 text-end">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEnrollments.map((enr) => {
                const cand = candMap.get(enr.candidateDocId);
                const crs = courseMap.get(enr.courseId);
                const bth = batchMap.get(enr.batchId);
                return (
                  <tr key={enr.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-tabular font-semibold">
                      {enr.enrollmentNumber}
                      {enr.capacityOverride && (
                        <span className="block text-[10px] font-normal text-amber-700">
                          {t('capacityOverrideBadge')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">
                        {cand ? (lang === 'ar' ? cand.fullNameAr : cand.fullNameEn) : enr.candidateId}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">{enr.candidateId}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-slate-900">
                        {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : enr.courseId}
                      </div>
                      {crs?.courseCode && (
                        <div className="text-[11px] text-slate-500 font-mono-tabular">{crs.courseCode}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular">
                      <div>{bth?.batchNumber || enr.batchId}</div>
                      {bth?.startDate && (
                        <div className="text-[11px] text-slate-500">{formatDate(bth.startDate)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {enr.trainingCardId ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CreditCard className="w-3.5 h-3.5" />
                          {t('trainingCardIssuedShort')}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t('trainingCardPendingShort')}</span>
                      )}
                      {enr.certificateId && (
                        <div className="inline-flex items-center gap-1 text-[11px] text-sky-700 mt-0.5 block">
                          <Award className="w-3 h-3" />
                          <span className="font-mono-tabular">{enr.certificateId}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText status={enr.status} />
                    </td>
                    {(canConfirm || canUpdateStatus) && (
                      <td className="py-2.5 px-4 text-end whitespace-nowrap space-x-1 rtl:space-x-reverse">
                        {canConfirm && enr.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleConfirm(enr)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
                            >
                              <Check className="w-3 h-3" />
                              {t('confirmEnrollmentAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(enr.id, 'cancelled')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              <XCircle className="w-3 h-3" />
                              {t('rejectCancelAction')}
                            </button>
                          </>
                        )}
                        {canConfirm && enr.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(enr.id, 'in_progress')}
                            className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                          >
                            {t('markInProgressAction')}
                          </button>
                        )}
                        {canConfirm && enr.status === 'in_progress' && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(enr.id, 'completed')}
                              className="px-2 py-1 text-[11px] border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50"
                            >
                              {t('markCompletedAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(enr.id, 'failed')}
                              className="px-2 py-1 text-[11px] border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              {t('markFailedAction')}
                            </button>
                          </>
                        )}
                        {canConfirm && ['confirmed', 'in_progress'].includes(enr.status) && (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(enr.id, 'withdrawn')}
                            className="px-2 py-1 text-[11px] text-slate-500 hover:text-red-700"
                          >
                            {t('withdrawAction')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Capacity Exception Confirmation Modal */}
      <Modal
        open={Boolean(exceptionTarget)}
        onClose={() => setExceptionTarget(null)}
        title={t('capacityExceededTitle')}
        maxWidth="max-w-lg"
      >
        {exceptionTarget && (
          <form onSubmit={handleConfirmWithException} className="space-y-4">
            <NotificationBanner
              variant="warning"
              message={`${t('capacityExceededHint')} (${exceptionTarget.enrollmentNumber})`}
            />
            <FormField label={t('capacityOverrideReasonLabel')} required>
              <TextInput
                required
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder={t('capacityOverrideReasonPlaceholder')}
              />
            </FormField>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setExceptionTarget(null)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={confirmingException || !exceptionReason.trim()}
                className="px-4 py-2 text-xs font-medium bg-amber-700 text-white rounded-md hover:bg-amber-800 disabled:opacity-50"
              >
                {confirmingException ? t('loading') : t('approveExceptionAndConfirm')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <EnrollmentWorkflowModal
        open={workflowOpen}
        courses={courses}
        batches={batches}
        candidates={candidates}
        onClose={() => setWorkflowOpen(false)}
        onCompleted={async (msg) => {
          setSuccessMsg(msg);
          await loadData();
        }}
      />

      <EnrollmentRequestModal
        open={reqModalOpen}
        editingRequest={editingRequest}
        courses={courses}
        batches={batches}
        candidates={candidates}
        onClose={() => {
          setReqModalOpen(false);
          setEditingRequest(null);
        }}
        onSaved={async (saved) => {
          setSuccessMsg(`${saved.requestNumber} — ${t('status_pending_review')}`);
          await loadData();
        }}
      />

      <EnrollmentRequestReviewModal
        open={Boolean(reviewingRequest)}
        request={reviewingRequest}
        courses={courses}
        batches={batches}
        candidates={candidates}
        onClose={() => setReviewingRequest(null)}
        onReviewed={async (updated) => {
          setSuccessMsg(`${updated.requestNumber} — ${t(`status_${updated.status}`)}`);
          await loadData();
        }}
      />
    </div>
  );
}
