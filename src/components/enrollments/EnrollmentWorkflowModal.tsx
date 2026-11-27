import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { isTenantAdminRole } from '../../lib/permissions';
import type { Batch, Candidate, Course, Enrollment } from '../../types/tcms';
import { ErrorAlert, FormField, Modal, NotificationBanner, SelectInput, TextArea, TextInput } from '../ui/UiKit';

interface CandidateEligibilityCheck {
  candidateDocId: string;
  candidateId: string;
  fullNameEn: string;
  fullNameAr: string;
  alreadyInBatch: boolean;
  activeOtherEnrollmentsCount: number;
  completedCoursesCount: number;
  completedCourseCodes: string[];
  prerequisiteMet: boolean;
}

interface EligibilityCheckResponse {
  batchId: string;
  batchNumber: string;
  batchStatus: string;
  batchClosed: boolean;
  enrollmentClosed: boolean;
  capacity: number;
  enrollmentCount: number;
  availableSeats: number;
  hasPrerequisites: boolean;
  prerequisitesText: string;
  candidates: CandidateEligibilityCheck[];
}

export function EnrollmentWorkflowModal({
  open,
  courses,
  batches,
  candidates,
  onClose,
  onCompleted,
}: {
  open: boolean;
  courses: Course[];
  batches: Batch[];
  candidates: Candidate[];
  onClose: () => void;
  onCompleted: (message: string) => Promise<void> | void;
}) {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const isAuthorizedAdmin = isTenantAdminRole(profile?.role);

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candSearch, setCandSearch] = useState('');
  const [confirmImmediately, setConfirmImmediately] = useState(true);
  const [prerequisiteConfirmed, setPrerequisiteConfirmed] = useState(true);
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [capacityOverrideReason, setCapacityOverrideReason] = useState('');
  const [notes, setNotes] = useState('');

  const [eligibility, setEligibility] = useState<EligibilityCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCourses = useMemo(
    () => courses.filter((c) => c.status === 'active'),
    [courses]
  );

  const courseBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          (!selectedCourseId || b.courseId === selectedCourseId) &&
          (b.status === 'scheduled' || b.status === 'in_progress')
      ),
    [batches, selectedCourseId]
  );

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) || null,
    [batches, selectedBatchId]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    const defaultCourse = activeCourses[0]?.id || courses[0]?.id || '';
    setSelectedCourseId(defaultCourse);
    const firstBatch = batches.find(
      (b) => b.courseId === defaultCourse && (b.status === 'scheduled' || b.status === 'in_progress')
    );
    setSelectedBatchId(firstBatch?.id || '');
    setSelectedCandidateIds([]);
    setCandSearch('');
    setConfirmImmediately(true);
    setPrerequisiteConfirmed(true);
    setOverrideCapacity(false);
    setCapacityOverrideReason('');
    setNotes('');
    setEligibility(null);
  }, [open, activeCourses, courses, batches]);

  useEffect(() => {
    if (!open || !selectedCourseId) return;
    if (selectedBatch && selectedBatch.courseId === selectedCourseId) return;
    const nextBatch = courseBatches[0];
    setSelectedBatchId(nextBatch?.id || '');
  }, [open, selectedCourseId, selectedBatch, courseBatches]);

  useEffect(() => {
    if (!open || !selectedBatchId) {
      setEligibility(null);
      return;
    }
    let active = true;
    setChecking(true);
    apiFetch<EligibilityCheckResponse>('/api/enrollments/check-eligibility', {
      method: 'POST',
      body: JSON.stringify({
        batchId: selectedBatchId,
        candidateDocIds: selectedCandidateIds,
      }),
    })
      .then((res) => {
        if (active) {
          setEligibility(res);
          if (res.hasPrerequisites && res.candidates.some((c) => !c.prerequisiteMet)) {
            setPrerequisiteConfirmed(false);
          } else {
            setPrerequisiteConfirmed(true);
          }
        }
      })
      .catch(() => {
        if (active) setEligibility(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [open, selectedBatchId, selectedCandidateIds]);

  const filteredCandidates = useMemo(() => {
    const q = candSearch.trim().toLowerCase();
    return candidates
      .filter((c) => c.status === 'active')
      .filter((c) => {
        if (!q) return true;
        return (
          c.candidateId.toLowerCase().includes(q) ||
          c.fullNameEn.toLowerCase().includes(q) ||
          c.fullNameAr.toLowerCase().includes(q) ||
          (c.companyName || '').toLowerCase().includes(q)
        );
      });
  }, [candidates, candSearch]);

  const eligByCand = useMemo(
    () => new Map((eligibility?.candidates || []).map((c) => [c.candidateDocId, c])),
    [eligibility]
  );

  const newSeatsRequested = useMemo(
    () =>
      selectedCandidateIds.filter((id) => !eligByCand.get(id)?.alreadyInBatch).length,
    [selectedCandidateIds, eligByCand]
  );

  const availableSeats = selectedBatch
    ? Math.max(0, selectedBatch.capacity - (selectedBatch.enrollmentCount || 0))
    : 0;
  const exceedsCapacity = confirmImmediately && selectedBatch && newSeatsRequested > availableSeats;
  const batchIsClosed = Boolean(selectedBatch?.enrollmentClosed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId || selectedCandidateIds.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        results: Array<{ enrollment: Enrollment; card?: { cardSerialNumber: string }; skippedReason?: string }>;
      }>('/api/enrollments', {
        method: 'POST',
        body: JSON.stringify({
          batchId: selectedBatchId,
          candidateDocIds: selectedCandidateIds,
          confirmImmediately,
          prerequisiteConfirmed,
          overrideCapacity,
          capacityOverrideReason: overrideCapacity ? capacityOverrideReason : undefined,
          notes: notes || undefined,
        }),
      });
      const cardsCount = res.results.filter((r) => r.card).length;
      const skippedCount = res.results.filter((r) => r.skippedReason).length;
      const createdCount = res.results.length - skippedCount;
      await onCompleted(
        confirmImmediately
          ? `Confirmed ${createdCount} enrollment(s) and auto-generated ${cardsCount} Training Card(s).`
          : `Saved ${createdCount} pending enrollment(s) awaiting confirmation.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('newEnrollmentWizard')} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        <p className="text-xs text-slate-500">{t('multiCourseHint')}</p>

        {/* Step 1 & 2: Course & Batch */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('stepSelectCourse')} required>
            <SelectInput
              required
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              <option value="">--</option>
              {activeCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} — {lang === 'ar' ? c.titleAr : c.titleEn}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('stepSelectBatch')} required>
            <SelectInput
              required
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
            >
              <option value="">--</option>
              {courseBatches.map((b) => {
                const seats = Math.max(0, b.capacity - (b.enrollmentCount || 0));
                return (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} ({b.startDate}) — {b.enrollmentCount}/{b.capacity} ({seats} {t('seatsLeftShort')})
                    {b.enrollmentClosed ? ` [${t('enrollmentClosedLabel')}]` : ''}
                  </option>
                );
              })}
            </SelectInput>
          </FormField>
        </div>

        {/* Step 3: Select Candidates */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-700">
              {t('stepSelectCandidates')} ({selectedCandidateIds.length} {t('selectedEmployeesCount')}) *
            </label>
            <div className="relative w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={candSearch}
                onChange={(e) => setCandSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full ps-8 pe-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-md max-h-52 overflow-y-auto divide-y divide-slate-100">
            {filteredCandidates.map((c) => {
              const checked = selectedCandidateIds.includes(c.id);
              const checkInfo = eligByCand.get(c.id);
              return (
                <label
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer gap-3"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedCandidateIds((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                    <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                      {c.candidateId}
                    </span>
                    <span className="truncate font-medium text-slate-800">
                      {lang === 'ar' ? c.fullNameAr : c.fullNameEn}
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-[11px] shrink-0">
                    {checkInfo?.alreadyInBatch && (
                      <span className="text-amber-700 font-medium">{t('alreadyInBatchBadge')}</span>
                    )}
                    {checkInfo && checkInfo.activeOtherEnrollmentsCount > 0 && (
                      <span className="text-sky-700 font-mono-tabular">
                        +{checkInfo.activeOtherEnrollmentsCount} {t('otherActiveCoursesShort')}
                      </span>
                    )}
                    <span className="text-slate-400">{c.companyName || 'Individual'}</span>
                  </span>
                </label>
              );
            })}
            {filteredCandidates.length === 0 && (
              <p className="p-4 text-center text-xs text-slate-500">{t('noRecords')}</p>
            )}
          </div>
        </div>

        {/* Step 4: Prerequisite & Capacity Validation */}
        {selectedBatch && (
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
              <span>{t('stepValidationSummary')}</span>
              {checking && <span className="text-[11px] font-normal text-slate-500">{t('loading')}</span>}
            </div>

            {selectedCourse?.prerequisites?.trim() ? (
              <div className="border border-amber-200 bg-amber-50/70 rounded-md p-3 space-y-2">
                <div className="text-xs text-amber-900">
                  <span className="font-semibold">{t('prerequisiteCheckLabel')}: </span>
                  {selectedCourse.prerequisites}
                </div>
                <label className="flex items-center gap-2 text-xs text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prerequisiteConfirmed}
                    onChange={(e) => setPrerequisiteConfirmed(e.target.checked)}
                  />
                  <span>{t('prerequisiteAcknowledgeLabel')}</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('prerequisiteNotRequired')}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
              <span className="font-mono-tabular">
                {t('availableSeatsLabel')}: <strong>{availableSeats}</strong> / {selectedBatch.capacity}
              </span>
              {batchIsClosed && (
                <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('enrollmentClosedLabel')}
                </span>
              )}
            </div>

            {(exceedsCapacity || batchIsClosed) && (
              <div className="border border-red-200 bg-red-50/70 rounded-md p-3 space-y-2.5">
                <NotificationBanner
                  variant="warning"
                  message={`${t('capacityExceededTitle')}: ${t('capacityExceededHint')}`}
                />
                {isAuthorizedAdmin && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-red-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideCapacity}
                        onChange={(e) => setOverrideCapacity(e.target.checked)}
                      />
                      <span>{t('approveCapacityOverrideLabel')}</span>
                    </label>
                    {overrideCapacity && (
                      <FormField label={t('capacityOverrideReasonLabel')} required>
                        <TextInput
                          required
                          value={capacityOverrideReason}
                          onChange={(e) => setCapacityOverrideReason(e.target.value)}
                          placeholder={t('capacityOverrideReasonPlaceholder')}
                        />
                      </FormField>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmImmediately}
                  onChange={(e) => setConfirmImmediately(e.target.checked)}
                />
                <span>{t('confirmImmediatelyLabel')}</span>
              </label>

              <FormField label={t('enrollmentNotesLabel')}>
                <TextInput
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                />
              </FormField>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !selectedBatchId ||
              selectedCandidateIds.length === 0 ||
              (confirmImmediately && Boolean(selectedCourse?.prerequisites?.trim()) && !prerequisiteConfirmed) ||
              ((Boolean(exceedsCapacity) || batchIsClosed) &&
                (!isAuthorizedAdmin || !overrideCapacity || !capacityOverrideReason.trim()))
            }
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? t('loading') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
