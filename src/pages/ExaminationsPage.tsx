import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole, isTenantOwnerRole } from '../lib/permissions';
import type {
  AssessmentRecord,
  AttendanceRecord,
  Batch,
  Candidate,
  CompletionEligibility,
  Course,
  Enrollment,
} from '../types/tcms';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import { EmptyState, ErrorAlert, Modal, StatusText, TableSkeleton } from '../components/ui/UiKit';

export function ExaminationsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [batchFilter, setBatchFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scoreModalEnr, setScoreModalEnr] = useState<Enrollment | null>(null);
  const [scoreForm, setScoreForm] = useState({
    assessmentType: 'written' as AssessmentRecord['assessmentType'],
    maxMarks: 100,
    obtainedMarks: 80,
    passingScore: 60,
    result: 'pass' as 'pass' | 'fail',
    remarks: '',
    assessmentDate: new Date().toISOString().slice(0, 10),
  });

  const [corrReqModal, setCorrReqModal] = useState<{
    assessment: AssessmentRecord;
    correctedMarks: number;
    correctedResult: 'pass' | 'fail';
    correctionReason: string;
  } | null>(null);

  const [approveModal, setApproveModal] = useState<{
    assessment: AssessmentRecord;
    correctedMarks: number;
    correctedResult: 'pass' | 'fail';
    correctionReason: string;
  } | null>(null);

  const [eligModal, setEligModal] = useState<{
    enrollment: Enrollment;
    eligibility: CompletionEligibility;
  } | null>(null);

  const isAdmin = isTenantAdminRole(profile?.role);
  const canScore =
    isTenantAdminRole(profile?.role) ||
    ['trainer', 'certificate_officer'].includes(profile?.role || '');
  const canRequestCorrection = canScore;
  const canRecommend = isTenantOwnerRole(profile?.role) || profile?.role === 'trainer';
  const canApproveCompletion =
    isTenantAdminRole(profile?.role) || profile?.role === 'certificate_officer';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [enrRes, candRes, crsRes, bthRes, assRes, attRes] = await Promise.all([
        apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments'),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        apiFetch<{ assessments: AssessmentRecord[] }>('/api/assessments'),
        apiFetch<{ attendance: AttendanceRecord[] }>('/api/attendance').catch(() => ({
          attendance: [],
        })),
      ]);
      setEnrollments(enrRes.enrollments);
      setCandidates(candRes.candidates);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
      setAssessments(assRes.assessments);
      setAttendance(attRes.attendance);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const previewPercentage =
    scoreForm.assessmentType === 'pass_fail'
      ? scoreForm.result === 'pass'
        ? 100
        : 0
      : Math.round((scoreForm.obtainedMarks / Math.max(1, scoreForm.maxMarks)) * 10000) / 100;
  const previewOutcome: 'pass' | 'fail' =
    scoreForm.assessmentType === 'pass_fail'
      ? scoreForm.result
      : previewPercentage >= scoreForm.passingScore
        ? 'pass'
        : 'fail';

  const handleRecordAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreModalEnr) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/assessments', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: scoreModalEnr.id,
          ...scoreForm,
        }),
      });
      setScoreModalEnr(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrReqModal) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/assessments/${corrReqModal.assessment.id}/correction-request`, {
        method: 'PATCH',
        body: JSON.stringify({
          correctedMarks: corrReqModal.correctedMarks,
          correctedResult: corrReqModal.correctedResult,
          correctionReason: corrReqModal.correctionReason,
        }),
      });
      setCorrReqModal(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveModal) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/assessments/${approveModal.assessment.id}/approve-correction`, {
        method: 'PATCH',
        body: JSON.stringify({
          correctedMarks: approveModal.correctedMarks,
          correctedResult: approveModal.correctedResult,
          correctionReason: approveModal.correctionReason,
        }),
      });
      setApproveModal(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRecommend = async (enrId: string) => {
    try {
      await apiFetch(`/api/enrollments/${enrId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ trainerRecommended: true }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApproveCompletion = async (enrId: string) => {
    try {
      await apiFetch(`/api/enrollments/${enrId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ completionApproved: true }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openEligibility = async (enr: Enrollment) => {
    try {
      const res = await apiFetch<{ eligibility: CompletionEligibility }>(
        `/api/enrollments/${enr.id}/eligibility`
      );
      setEligModal({ enrollment: enr, eligibility: res.eligibility });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const visibleEnrollments = enrollments.filter(
    (e) =>
      ['confirmed', 'in_progress', 'completed'].includes(e.status) &&
      (batchFilter === 'all' || e.batchId === batchFilter)
  );

  const typeLabel = (type: AssessmentRecord['assessmentType']) => t(`assessmentType_${type}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md min-w-[220px]"
        >
          <option value="all">{t('filterAllBatches')}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNumber} ({b.startDate})
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Assessments track percentage, pass/fail outcomes, assessor audit trails, and score corrections alongside attendance thresholds and completion approvals.
        </p>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={5} cols={7} />
      ) : visibleEnrollments.length === 0 ? (
        <EmptyState
          title="No Active Enrollments"
          description="Confirmed enrollments appear here for written, practical, or oral examination scoring and candidate progress tracking."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start">{t('nav_candidates')}</th>
                <th className="py-2.5 px-4 text-start">{t('nav_courses')} / {t('nav_batches')}</th>
                <th className="py-2.5 px-4 text-start">{t('overallProgressCol')}</th>
                <th className="py-2.5 px-4 text-start">Assessments & Scores</th>
                <th className="py-2.5 px-4 text-start">Sign-Off</th>
                <th className="py-2.5 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleEnrollments.map((enr) => {
                const cand = candMap.get(enr.candidateDocId);
                const crs = courseMap.get(enr.courseId);
                const bth = batchMap.get(enr.batchId);
                const enrAssessments = assessments.filter((a) => a.enrollmentId === enr.id);
                const enrAtt = attendance.filter((a) => a.enrollmentId === enr.id);

                const totalSessions = enrAtt.length;
                const attended = enrAtt.filter((a) =>
                  ['present', 'late', 'excused'].includes(a.status)
                ).length;
                const missed = totalSessions - attended;
                const attPct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
                const minAttPct = crs?.minAttendancePct ?? 80;
                const attMet = minAttPct === 0 || (totalSessions > 0 && attPct >= minAttPct);

                const examReq = crs?.examRequired ?? true;
                const pracReq = crs?.practicalRequired ?? false;
                const examPassed =
                  !examReq ||
                  enrAssessments.some(
                    (a) =>
                      ['written', 'oral', 'pass_fail'].includes(a.assessmentType) &&
                      a.result === 'pass'
                  );
                const pracPassed =
                  !pracReq ||
                  enrAssessments.some(
                    (a) => a.assessmentType === 'practical' && a.result === 'pass'
                  );
                const assessmentLabelKey =
                  !examReq && !pracReq
                    ? 'assessmentStatus_not_required'
                    : examPassed && pracPassed
                      ? 'assessmentStatus_passed'
                      : enrAssessments.length > 0 && enrAssessments.every((a) => a.result === 'fail')
                        ? 'assessmentStatus_failed'
                        : 'assessmentStatus_pending';

                const progressChecks = [
                  ['confirmed', 'in_progress', 'completed'].includes(enr.status),
                  attMet,
                  examPassed,
                  pracPassed,
                  Boolean(enr.trainerRecommended),
                  Boolean(enr.completionApproved),
                ];
                const overallProgress = Math.round(
                  (progressChecks.filter(Boolean).length / progressChecks.length) * 100
                );

                return (
                  <tr key={enr.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <ProtectedImage
                          fileId={cand?.photoFileId}
                          alt={cand?.fullNameEn || enr.candidateId}
                          fallbackText={cand?.fullNameEn || enr.candidateId}
                        />
                        <div>
                          <div className="font-medium text-slate-900">
                            {lang === 'ar'
                              ? cand?.fullNameAr || cand?.fullNameEn || enr.candidateId
                              : cand?.fullNameEn || enr.candidateId}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular">
                            {enr.candidateId} · {enr.enrollmentNumber}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">
                        {lang === 'ar' ? crs?.titleAr || crs?.titleEn : crs?.titleEn || enr.courseId}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">
                        {bth?.batchNumber}
                      </div>
                      {!examReq && !pracReq && (
                        <div className="mt-1 text-[11px] text-slate-500 italic">
                          {t('noExamRequiredNotice')}
                        </div>
                      )}
                    </td>

                    {/* Candidate Progress */}
                    <td className="py-3 px-4 min-w-[180px] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                        <span className="text-slate-600">
                          {attended}/{totalSessions} ({missed} missed)
                        </span>
                        <span className={attMet ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {totalSessions > 0 ? `${attPct}%` : '—'}
                        </span>
                      </div>
                      {!attMet && totalSessions > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Min {minAttPct}%</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">{t(assessmentLabelKey)}</span>
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {overallProgress}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-900 transition-all"
                          style={{ width: `${overallProgress}%` }}
                        />
                      </div>
                    </td>

                    {/* Assessments */}
                    <td className="py-3 px-4 min-w-[260px]">
                      {enrAssessments.length === 0 ? (
                        <span className="text-slate-400">
                          {!examReq && !pracReq ? t('assessmentStatus_not_required') : 'No attempts recorded'}
                        </span>
                      ) : (
                        <div className="space-y-1.5">
                          {enrAssessments.map((a) => {
                            const pct =
                              a.percentage ??
                              (a.maxMarks > 0
                                ? Math.round((a.obtainedMarks / a.maxMarks) * 100)
                                : 0);
                            return (
                              <div
                                key={a.id}
                                className="p-2 rounded border border-slate-100 bg-slate-50/70 space-y-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <span className="font-mono-tabular font-semibold text-slate-800">
                                    {a.assessmentNumber || `#${a.attemptNumber}`} · {typeLabel(a.assessmentType)} #{a.attemptNumber}
                                  </span>
                                  <StatusText status={a.result} />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 font-mono-tabular">
                                  <span>
                                    {a.assessmentType === 'pass_fail'
                                      ? a.result.toUpperCase()
                                      : `${a.obtainedMarks}/${a.maxMarks} (${pct}%)`}
                                  </span>
                                  <span>{a.assessmentDate}</span>
                                </div>
                                {(a.assessorName || a.assessmentStatus) && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                                    <span>
                                      {t('assessorLabel')}: {a.assessorName || a.assessorId}
                                    </span>
                                    {a.assessmentStatus && (
                                      <span
                                        className={`font-medium ${
                                          a.assessmentStatus === 'pending_correction'
                                            ? 'text-amber-700'
                                            : a.assessmentStatus === 'approved'
                                              ? 'text-emerald-700'
                                              : 'text-slate-600'
                                        }`}
                                      >
                                        {t(`assessmentStatus_${a.assessmentStatus}`)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {a.correctionReason && (
                                  <div className="text-[10px] text-amber-800">
                                    {t('correctionHistoryLabel')}: {a.correctionReason}
                                    {a.assessmentStatus === 'pending_correction' && a.correctedMarks !== undefined
                                      ? ` (${a.correctedMarks}/${a.maxMarks})`
                                      : ''}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                  {canRequestCorrection && a.assessmentStatus !== 'pending_correction' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCorrReqModal({
                                          assessment: a,
                                          correctedMarks: a.obtainedMarks,
                                          correctedResult: a.result,
                                          correctionReason: '',
                                        })
                                      }
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 hover:underline"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      {t('requestCorrectionBtn')}
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setApproveModal({
                                          assessment: a,
                                          correctedMarks: a.correctedMarks ?? a.obtainedMarks,
                                          correctedResult: a.correctedResult ?? a.result,
                                          correctionReason: a.correctionReason || '',
                                        })
                                      }
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 hover:underline"
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      {t('approveCorrectionBtn')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Trainer Rec + Officer Approval */}
                    <td className="py-3 px-4 space-y-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Trainer Rec:</span>
                        {enr.trainerRecommended ? (
                          <StatusText status="pass" />
                        ) : canRecommend ? (
                          <button
                            type="button"
                            onClick={() => void handleRecommend(enr.id)}
                            className="text-sky-700 font-medium hover:underline"
                          >
                            Submit Rec
                          </button>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">Completion Approval:</span>
                        {enr.completionApproved ? (
                          <StatusText status="completed" />
                        ) : canApproveCompletion ? (
                          <button
                            type="button"
                            onClick={() => void handleApproveCompletion(enr.id)}
                            className="text-emerald-700 font-medium hover:underline"
                          >
                            Approve Completion
                          </button>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-end whitespace-nowrap space-y-1.5">
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openEligibility(enr)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          Eligibility
                        </button>
                        {canScore && (
                          <button
                            type="button"
                            onClick={() => {
                              const crsPassing = crs?.minExamScore ?? 60;
                              setScoreForm({
                                assessmentType: 'written',
                                maxMarks: 100,
                                obtainedMarks: crsPassing,
                                passingScore: crsPassing,
                                result: 'pass',
                                remarks: '',
                                assessmentDate: new Date().toISOString().slice(0, 10),
                              });
                              setScoreModalEnr(enr);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                          >
                            <Plus className="w-3 h-3" />
                            Record Score
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Assessment Result Modal */}
      <Modal
        open={Boolean(scoreModalEnr)}
        onClose={() => setScoreModalEnr(null)}
        title="Record Assessment Result"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRecordAssessment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assessment Type</label>
            <select
              value={scoreForm.assessmentType}
              onChange={(e) =>
                setScoreForm({
                  ...scoreForm,
                  assessmentType: e.target.value as AssessmentRecord['assessmentType'],
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
            >
              <option value="written">{t('assessmentType_written')}</option>
              <option value="practical">{t('assessmentType_practical')}</option>
              <option value="oral">{t('assessmentType_oral')}</option>
              <option value="trainer_eval">{t('assessmentType_trainer_eval')}</option>
              <option value="pass_fail">{t('assessmentType_pass_fail')}</option>
            </select>
          </div>
          {scoreForm.assessmentType === 'pass_fail' ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Result</label>
              <select
                value={scoreForm.result}
                onChange={(e) =>
                  setScoreForm({ ...scoreForm, result: e.target.value as 'pass' | 'fail' })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              >
                <option value="pass">{t('status_pass')}</option>
                <option value="fail">{t('status_fail')}</option>
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Marks</label>
                <input
                  type="number"
                  min={1}
                  value={scoreForm.maxMarks}
                  onChange={(e) => setScoreForm({ ...scoreForm, maxMarks: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Obtained</label>
                <input
                  type="number"
                  min={0}
                  max={scoreForm.maxMarks}
                  value={scoreForm.obtainedMarks}
                  onChange={(e) =>
                    setScoreForm({ ...scoreForm, obtainedMarks: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Pass %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreForm.passingScore}
                  onChange={(e) =>
                    setScoreForm({ ...scoreForm, passingScore: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
            </div>
          )}

          {/* Auto-Calculated Percentage & Outcome Preview */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs">
            <span className="text-slate-600">{t('calculatedPercentageLabel')}</span>
            <div className="flex items-center gap-3 font-mono-tabular font-semibold">
              <span>{previewPercentage}%</span>
              <StatusText status={previewOutcome} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assessment Date</label>
            <input
              type="date"
              value={scoreForm.assessmentDate}
              onChange={(e) => setScoreForm({ ...scoreForm, assessmentDate: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Trainer Remarks</label>
            <textarea
              rows={2}
              value={scoreForm.remarks}
              onChange={(e) => setScoreForm({ ...scoreForm, remarks: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setScoreModalEnr(null)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-md"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
            >
              {saving ? t('loading') : t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Request Correction Modal */}
      <Modal
        open={Boolean(corrReqModal)}
        onClose={() => setCorrReqModal(null)}
        title={t('requestScoreCorrectionTitle')}
        maxWidth="max-w-md"
      >
        {corrReqModal && (
          <form onSubmit={handleRequestCorrection} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div className="font-mono-tabular font-semibold">
                {corrReqModal.assessment.assessmentNumber || corrReqModal.assessment.id} ·{' '}
                {typeLabel(corrReqModal.assessment.assessmentType)}
              </div>
              <div className="text-slate-500">
                Current: {corrReqModal.assessment.obtainedMarks}/{corrReqModal.assessment.maxMarks}{' '}
                ({corrReqModal.assessment.result})
              </div>
            </div>
            {corrReqModal.assessment.assessmentType === 'pass_fail' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('proposedResultLabel')}
                </label>
                <select
                  value={corrReqModal.correctedResult}
                  onChange={(e) =>
                    setCorrReqModal({
                      ...corrReqModal,
                      correctedResult: e.target.value as 'pass' | 'fail',
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="pass">{t('status_pass')}</option>
                  <option value="fail">{t('status_fail')}</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('proposedMarksLabel')} (Max {corrReqModal.assessment.maxMarks})
                </label>
                <input
                  type="number"
                  min={0}
                  max={corrReqModal.assessment.maxMarks}
                  value={corrReqModal.correctedMarks}
                  onChange={(e) =>
                    setCorrReqModal({ ...corrReqModal, correctedMarks: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t('correctionReasonRequiredLabel')}
              </label>
              <textarea
                required
                rows={3}
                value={corrReqModal.correctionReason}
                onChange={(e) =>
                  setCorrReqModal({ ...corrReqModal, correctionReason: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrReqModal(null)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
              >
                {saving ? t('loading') : t('requestCorrectionBtn')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Admin Approve Correction Modal */}
      <Modal
        open={Boolean(approveModal)}
        onClose={() => setApproveModal(null)}
        title={t('approveScoreCorrectionTitle')}
        maxWidth="max-w-md"
      >
        {approveModal && (
          <form onSubmit={handleApproveCorrection} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
              <div className="font-mono-tabular font-semibold">
                {approveModal.assessment.assessmentNumber || approveModal.assessment.id} ·{' '}
                {typeLabel(approveModal.assessment.assessmentType)}
              </div>
              <div className="text-slate-600">
                Original: {approveModal.assessment.obtainedMarks}/{approveModal.assessment.maxMarks}{' '}
                ({approveModal.assessment.result})
              </div>
            </div>
            {approveModal.assessment.assessmentType === 'pass_fail' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('proposedResultLabel')}
                </label>
                <select
                  value={approveModal.correctedResult}
                  onChange={(e) =>
                    setApproveModal({
                      ...approveModal,
                      correctedResult: e.target.value as 'pass' | 'fail',
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="pass">{t('status_pass')}</option>
                  <option value="fail">{t('status_fail')}</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('proposedMarksLabel')} (Max {approveModal.assessment.maxMarks})
                </label>
                <input
                  type="number"
                  min={0}
                  max={approveModal.assessment.maxMarks}
                  value={approveModal.correctedMarks}
                  onChange={(e) =>
                    setApproveModal({ ...approveModal, correctedMarks: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t('correctionReasonRequiredLabel')}
              </label>
              <textarea
                required
                rows={3}
                value={approveModal.correctionReason}
                onChange={(e) =>
                  setApproveModal({ ...approveModal, correctionReason: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApproveModal(null)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? t('loading') : t('approveCorrectionBtn')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Completion Eligibility & Candidate Progress Modal */}
      <Modal
        open={Boolean(eligModal)}
        onClose={() => setEligModal(null)}
        title={eligModal ? `Completion Eligibility — ${eligModal.enrollment.enrollmentNumber}` : ''}
        maxWidth="max-w-lg"
      >
        {eligModal && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md text-center">
              <div>
                <div className="text-[10px] text-slate-500">{t('totalSessionsLabel')}</div>
                <div className="font-mono-tabular font-semibold text-sm">
                  {eligModal.eligibility.totalSessions}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">{t('sessionsAttendedLabel')}</div>
                <div className="font-mono-tabular font-semibold text-sm text-emerald-700">
                  {eligModal.eligibility.sessionsAttended}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">{t('sessionsMissedLabel')}</div>
                <div className="font-mono-tabular font-semibold text-sm text-amber-700">
                  {eligModal.eligibility.sessionsMissed}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {[
                ['Enrollment Confirmed', eligModal.eligibility.enrollmentConfirmed, true],
                ['Training / Batch Completed', eligModal.eligibility.trainingCompleted, true],
                [
                  `Minimum Attendance (${eligModal.eligibility.attendancePct}% / ${eligModal.eligibility.minAttendancePct}%)`,
                  eligModal.eligibility.attendanceMet,
                  true,
                ],
                [
                  eligModal.eligibility.examRequired
                    ? 'Required Examination Passed'
                    : 'Examination (Not Required)',
                  eligModal.eligibility.examPassed,
                  eligModal.eligibility.examRequired,
                ],
                [
                  eligModal.eligibility.practicalRequired
                    ? 'Required Practical Assessment Passed'
                    : 'Practical Assessment (Not Required)',
                  eligModal.eligibility.practicalPassed,
                  eligModal.eligibility.practicalRequired,
                ],
                ['Trainer Recommendation Submitted', eligModal.eligibility.trainerRecommended, true],
                ['Authorized Completion Approval', eligModal.eligibility.completionApproved, true],
              ].map(([label, ok, req]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100"
                >
                  <span className="text-slate-700">{label}</span>
                  {!req ? (
                    <span className="text-[11px] font-medium text-slate-500">
                      {t('assessmentStatus_not_required')}
                    </span>
                  ) : (
                    <StatusText status={ok ? 'pass' : 'fail'} />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-1 flex items-center justify-between font-semibold">
              <span>
                {t('overallProgressCol')}:{' '}
                <span className="font-mono-tabular">{eligModal.eligibility.overallProgressPct}%</span>
              </span>
              <span
                className={
                  eligModal.eligibility.eligible
                    ? 'text-emerald-700 flex items-center gap-1'
                    : 'text-red-700'
                }
              >
                {eligModal.eligibility.eligible && <CheckCircle2 className="w-4 h-4" />}
                {eligModal.eligibility.eligible ? 'ELIGIBLE FOR CERTIFICATE' : 'NOT ELIGIBLE'}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
