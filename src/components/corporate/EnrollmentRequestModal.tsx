import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Batch, Candidate, Course, EnrollmentRequest } from '../../types/tcms';
import { ErrorAlert, FormField, Modal, SelectInput, TextArea } from '../ui/UiKit';

interface EnrollmentRequestModalProps {
  open: boolean;
  editingRequest?: EnrollmentRequest | null;
  courses: Course[];
  batches: Batch[];
  candidates: Candidate[];
  initialCourseId?: string;
  initialBatchId?: string;
  onClose: () => void;
  onSaved: (request: EnrollmentRequest) => Promise<void> | void;
}

export function EnrollmentRequestModal({
  open,
  editingRequest,
  courses,
  batches,
  candidates,
  initialCourseId = '',
  initialBatchId = '',
  onClose,
  onSaved,
}: EnrollmentRequestModalProps) {
  const { lang, t } = useLanguage();

  const [courseId, setCourseId] = useState('');
  const [preferredBatchId, setPreferredBatchId] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [corporateResponseNotes, setCorporateResponseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRespondMode = Boolean(editingRequest && editingRequest.status === 'info_requested');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setEmployeeSearch('');
    if (editingRequest) {
      setCourseId(editingRequest.courseId || '');
      setPreferredBatchId(editingRequest.preferredBatchId || '');
      setSelectedCandidateIds(editingRequest.candidateDocIds || []);
      setRequestNotes(editingRequest.requestNotes || '');
      setCorporateResponseNotes(editingRequest.corporateResponseNotes || '');
    } else {
      const activeCourses = courses.filter((c) => c.status === 'active');
      const fallbackCourseId = initialCourseId || activeCourses[0]?.id || '';
      setCourseId(fallbackCourseId);
      setPreferredBatchId(initialBatchId || '');
      setSelectedCandidateIds([]);
      setRequestNotes('');
      setCorporateResponseNotes('');
    }
  }, [open, editingRequest, courses, initialCourseId, initialBatchId]);

  const activeCourses = useMemo(
    () => courses.filter((c) => c.status === 'active' || c.id === courseId),
    [courses, courseId]
  );

  const matchingBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          (!courseId || b.courseId === courseId) &&
          (b.status === 'scheduled' || b.status === 'in_progress')
      ),
    [batches, courseId]
  );

  const activeEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return candidates.filter((c) => {
      if (c.status !== 'active' && !selectedCandidateIds.includes(c.id)) return false;
      if (!q) return true;
      return (
        c.candidateId.toLowerCase().includes(q) ||
        c.fullNameEn.toLowerCase().includes(q) ||
        c.fullNameAr.toLowerCase().includes(q) ||
        (c.employeeId || '').toLowerCase().includes(q) ||
        (c.jobTitle || '').toLowerCase().includes(q)
      );
    });
  }, [candidates, employeeSearch, selectedCandidateIds]);

  const handleToggleEmployee = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = activeEmployees.map((c) => c.id);
    setSelectedCandidateIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleClearFiltered = () => {
    const filteredSet = new Set(activeEmployees.map((c) => c.id));
    setSelectedCandidateIds((prev) => prev.filter((id) => !filteredSet.has(id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || selectedCandidateIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let saved: EnrollmentRequest;
      if (isRespondMode && editingRequest) {
        const res = await apiFetch<{ request: EnrollmentRequest }>(
          `/api/enrollment-requests/${editingRequest.id}/respond`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              courseId,
              preferredBatchId: preferredBatchId || undefined,
              candidateDocIds: selectedCandidateIds,
              requestNotes,
              corporateResponseNotes,
            }),
          }
        );
        saved = res.request;
      } else {
        const res = await apiFetch<{ request: EnrollmentRequest }>('/api/enrollment-requests', {
          method: 'POST',
          body: JSON.stringify({
            courseId,
            preferredBatchId: preferredBatchId || undefined,
            candidateDocIds: selectedCandidateIds,
            requestNotes,
          }),
        });
        saved = res.request;
      }
      await onSaved(saved);
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
      title={
        isRespondMode && editingRequest
          ? `${t('resubmitEnrollmentRequest')} — ${editingRequest.requestNumber}`
          : t('requestCourseEnrollment')
      }
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        {isRespondMode && editingRequest?.missingInfoNotes && (
          <div className="border border-amber-300 bg-amber-50 rounded-md p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">{t('missingInfoNotes')}</p>
              <p className="whitespace-pre-line text-amber-900">{editingRequest.missingInfoNotes}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('targetCourse')} required>
            <SelectInput
              required
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setPreferredBatchId('');
              }}
            >
              <option value="">{t('targetCourse')}...</option>
              {activeCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} — {lang === 'ar' ? c.titleAr : c.titleEn}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('preferredBatch')}>
            <SelectInput
              value={preferredBatchId}
              onChange={(e) => setPreferredBatchId(e.target.value)}
            >
              <option value="">{t('noBatchPreference')}</option>
              {matchingBatches.map((b) => {
                const openSeats = Math.max(0, b.capacity - b.enrollmentCount);
                return (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} ({b.startDate} → {b.endDate}) · {openSeats} {t('openSeats')}
                  </option>
                );
              })}
            </SelectInput>
          </FormField>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-slate-700">
              {t('selectEmployees')} * ({selectedCandidateIds.length} {t('selectedEmployeesCount')})
            </label>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-slate-700 hover:text-slate-900 underline"
              >
                {t('all')}
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={handleClearFiltered}
                className="text-slate-500 hover:text-slate-800 underline"
              >
                {t('clearFilters')}
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full ps-8 pe-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
            />
          </div>

          <div className="border border-slate-200 rounded-md max-h-60 overflow-y-auto divide-y divide-slate-100">
            {activeEmployees.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">{t('noRecords')}</div>
            ) : (
              activeEmployees.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedCandidateIds.includes(c.id)}
                      onChange={() => handleToggleEmployee(c.id)}
                    />
                    <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                      {c.candidateId}
                    </span>
                    <span className="truncate font-medium text-slate-800">
                      {lang === 'ar' ? c.fullNameAr || c.fullNameEn : c.fullNameEn}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {[c.employeeId, c.jobTitle].filter(Boolean).join(' · ') || '—'}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <FormField label={t('requestNotes')}>
          <TextArea
            rows={2}
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
          />
        </FormField>

        {isRespondMode && (
          <FormField label={t('corporateResponseNotes')} required>
            <TextArea
              required
              rows={2}
              value={corporateResponseNotes}
              onChange={(e) => setCorporateResponseNotes(e.target.value)}
            />
          </FormField>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !courseId || selectedCandidateIds.length === 0}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting
              ? t('loading')
              : isRespondMode
                ? t('resubmitEnrollmentRequest')
                : t('requestEnrollment')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
