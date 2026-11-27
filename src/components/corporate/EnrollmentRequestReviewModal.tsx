import React, { useEffect, useMemo, useState } from 'react';
import { Check, HelpCircle, XCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Batch, Candidate, Course, EnrollmentRequest } from '../../types/tcms';
import { ErrorAlert, FormField, Modal, SelectInput, StatusText, TextArea } from '../ui/UiKit';

interface EnrollmentRequestReviewModalProps {
  open: boolean;
  request: EnrollmentRequest | null;
  courses: Course[];
  batches: Batch[];
  candidates: Candidate[];
  onClose: () => void;
  onReviewed: (request: EnrollmentRequest) => Promise<void> | void;
}

type ReviewAction = 'approve' | 'request_info' | 'reject';

export function EnrollmentRequestReviewModal({
  open,
  request,
  courses,
  batches,
  candidates,
  onClose,
  onReviewed,
}: EnrollmentRequestReviewModalProps) {
  const { lang, t, formatDate } = useLanguage();

  const [action, setAction] = useState<ReviewAction>('approve');
  const [batchId, setBatchId] = useState('');
  const [missingInfoNotes, setMissingInfoNotes] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const course = useMemo(
    () => courses.find((c) => c.id === request?.courseId),
    [courses, request?.courseId]
  );

  const eligibleBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          b.courseId === request?.courseId &&
          (b.status === 'scheduled' || b.status === 'in_progress')
      ),
    [batches, request?.courseId]
  );

  const resolvedEmployees = useMemo(() => {
    if (!request) return [];
    const candMap = new Map(candidates.map((c) => [c.id, c]));
    return request.candidateDocIds.map((id) => ({
      id,
      candidate: candMap.get(id),
    }));
  }, [request, candidates]);

  useEffect(() => {
    if (!open || !request) return;
    setError(null);
    setAction('approve');
    setBatchId(request.preferredBatchId || eligibleBatches[0]?.id || '');
    setMissingInfoNotes(request.missingInfoNotes || '');
    setDecisionReason('');
  }, [open, request, eligibleBatches]);

  if (!request) return null;

  const isFinalized = request.status === 'approved' || request.status === 'rejected';
  const assignedBatch = batches.find((b) => b.id === (request.assignedBatchId || request.preferredBatchId));
  const selectedBatchObj = eligibleBatches.find((b) => b.id === batchId);
  const selectedBatchRemaining = selectedBatchObj
    ? Math.max(0, selectedBatchObj.capacity - selectedBatchObj.enrollmentCount)
    : 0;
  const capacityShortfall =
    action === 'approve' &&
    selectedBatchObj &&
    request.candidateDocIds.length > selectedBatchRemaining;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, string | undefined> = { action };
      if (action === 'approve') {
        payload.batchId = batchId;
        payload.decisionReason = decisionReason || undefined;
      } else if (action === 'request_info') {
        payload.missingInfoNotes = missingInfoNotes;
      } else if (action === 'reject') {
        payload.decisionReason = decisionReason;
      }
      const res = await apiFetch<{ request: EnrollmentRequest }>(
        `/api/enrollment-requests/${request.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      await onReviewed(res.request);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('reviewEnrollmentRequest')} — ${request.requestNumber}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        {/* Summary Header */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500">{t('corporateOrganization')}:</span>
            <p className="font-semibold text-slate-900 mt-0.5">
              {lang === 'ar'
                ? request.organizationNameAr || request.organizationNameEn || request.organizationId
                : request.organizationNameEn || request.organizationId}
            </p>
          </div>
          <div>
            <span className="text-slate-500">{t('status')}:</span>
            <div className="mt-0.5">
              <StatusText status={request.status} />
            </div>
          </div>
          <div>
            <span className="text-slate-500">{t('targetCourse')}:</span>
            <p className="font-medium text-slate-900 mt-0.5">
              {course ? `${course.courseCode} — ${lang === 'ar' ? course.titleAr : course.titleEn}` : request.courseId}
            </p>
          </div>
          <div>
            <span className="text-slate-500">{t('submittedBy')}:</span>
            <p className="text-slate-800 mt-0.5">
              {request.requestedByName || '—'} ·{' '}
              <span className="font-mono-tabular">{formatDate(request.createdAt)}</span>
            </p>
          </div>
          {request.preferredBatchId && (
            <div>
              <span className="text-slate-500">{t('preferredBatch')}:</span>
              <p className="font-mono-tabular text-slate-800 mt-0.5">
                {assignedBatch?.batchNumber || request.preferredBatchId}
              </p>
            </div>
          )}
          {request.decisionDate && (
            <div>
              <span className="text-slate-500">{t('decisionDate')}:</span>
              <p className="font-mono-tabular text-slate-800 mt-0.5">
                {formatDate(request.decisionDate)} ({request.reviewedByName || '—'})
              </p>
            </div>
          )}
        </div>

        {(request.requestNotes || request.corporateResponseNotes || request.missingInfoNotes) && (
          <div className="space-y-2 text-xs">
            {request.requestNotes && (
              <div className="border border-slate-200 rounded-md p-3 bg-white">
                <p className="font-medium text-slate-700">{t('requestNotes')}</p>
                <p className="mt-1 text-slate-600 whitespace-pre-line">{request.requestNotes}</p>
              </div>
            )}
            {request.missingInfoNotes && (
              <div className="border border-amber-200 rounded-md p-3 bg-amber-50/70">
                <p className="font-medium text-amber-900">{t('missingInfoNotes')}</p>
                <p className="mt-1 text-amber-800 whitespace-pre-line">{request.missingInfoNotes}</p>
              </div>
            )}
            {request.corporateResponseNotes && (
              <div className="border border-sky-200 rounded-md p-3 bg-sky-50/70">
                <p className="font-medium text-sky-900">{t('corporateResponseNotes')}</p>
                <p className="mt-1 text-sky-800 whitespace-pre-line">{request.corporateResponseNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Requested Employees */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-800">
            {t('employeesCount')} ({resolvedEmployees.length})
          </p>
          <div className="border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y divide-slate-100">
            {resolvedEmployees.map(({ id, candidate }) => (
              <div key={id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {candidate?.candidateId || id}
                  </span>
                  <span className="text-slate-800">
                    {candidate
                      ? lang === 'ar'
                        ? candidate.fullNameAr || candidate.fullNameEn
                        : candidate.fullNameEn
                      : '—'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {candidate ? [candidate.employeeId, candidate.jobTitle].filter(Boolean).join(' · ') || candidate.mobile : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isFinalized ? (
          <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
            {request.decisionReason && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="font-medium text-slate-700">{t('decisionReason')}</p>
                <p className="mt-1 text-slate-700">{request.decisionReason}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                {t('close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-3 border-t border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAction('approve')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-md transition-colors ${
                  action === 'approve'
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('actionApproveAssign')}</span>
              </button>

              <button
                type="button"
                onClick={() => setAction('request_info')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-md transition-colors ${
                  action === 'request_info'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{t('actionRequestInfo')}</span>
              </button>

              <button
                type="button"
                onClick={() => setAction('reject')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-md transition-colors ${
                  action === 'reject'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>{t('actionReject')}</span>
              </button>
            </div>

            {action === 'approve' && (
              <div className="space-y-3">
                <FormField label={t('assignedBatch')} required>
                  <SelectInput
                    required
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                  >
                    <option value="">{t('assignedBatch')}...</option>
                    {eligibleBatches.map((b) => {
                      const remaining = Math.max(0, b.capacity - b.enrollmentCount);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} ({b.startDate} → {b.endDate}) · {remaining}/{b.capacity} {t('openSeats')}
                        </option>
                      );
                    })}
                  </SelectInput>
                </FormField>

                {capacityShortfall && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {selectedBatchRemaining} {t('openSeats')} ({request.candidateDocIds.length} {t('employeesCount')})
                  </p>
                )}

                <FormField label={t('decisionReason')}>
                  <TextArea
                    rows={2}
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                  />
                </FormField>
              </div>
            )}

            {action === 'request_info' && (
              <FormField label={t('missingInfoNotes')} required>
                <TextArea
                  required
                  rows={3}
                  value={missingInfoNotes}
                  onChange={(e) => setMissingInfoNotes(e.target.value)}
                />
              </FormField>
            )}

            {action === 'reject' && (
              <FormField label={t('decisionReason')} required>
                <TextArea
                  required
                  rows={3}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                />
              </FormField>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || (action === 'approve' && (!batchId || Boolean(capacityShortfall)))}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? t('loading') : t('confirm')}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
