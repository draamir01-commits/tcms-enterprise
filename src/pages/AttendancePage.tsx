import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Lock,
  PencilLine,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Batch,
  Candidate,
  Course,
  Enrollment,
} from '../types/tcms';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import { EmptyState, ErrorAlert, Modal, StatusText, TableSkeleton } from '../components/ui/UiKit';

export function AttendancePage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [batchId, setBatchId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeTab, setActiveTab] = useState<'sheet' | 'history'>('sheet');
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; remarks: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Admin correction modal for submitted/locked records
  const [correctionModal, setCorrectionModal] = useState<{
    enrollment: Enrollment;
    candidate?: Candidate;
    status: AttendanceStatus;
    remarks: string;
    correctionReason: string;
  } | null>(null);

  const isAdmin = isTenantAdminRole(profile?.role);
  const canMark = isTenantAdminRole(profile?.role) || profile?.role === 'trainer';

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [bthRes, crsRes, enrRes, candRes] = await Promise.all([
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments'),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
      ]);
      const visibleBatches =
        profile?.role === 'trainer'
          ? bthRes.batches.filter(
              (b) =>
                b.trainerUserId === profile.uid ||
                Boolean(profile.trainerId && b.trainerId === profile.trainerId)
            )
          : bthRes.batches;
      setBatches(visibleBatches);
      setCourses(crsRes.courses);
      setEnrollments(enrRes.enrollments);
      setCandidates(candRes.candidates);
      if (visibleBatches[0] && !batchId) {
        setBatchId(visibleBatches[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile?.role, profile?.uid, profile?.trainerId, batchId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const loadAttendance = useCallback(async () => {
    if (!batchId) return;
    try {
      const res = await apiFetch<{ attendance: AttendanceRecord[] }>(
        `/api/attendance?batchId=${encodeURIComponent(batchId)}`
      );
      setRecords(res.attendance);
      const nextDraft: Record<string, { status: AttendanceStatus; remarks: string }> = {};
      for (const r of res.attendance.filter((a) => a.date === date)) {
        nextDraft[r.enrollmentId] = { status: r.status, remarks: r.remarks || '' };
      }
      setDraft(nextDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [batchId, date]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  const selectedBatch = batches.find((b) => b.id === batchId);
  const selectedCourse = courses.find((c) => c.id === selectedBatch?.courseId);
  const minRequiredPct = selectedCourse?.minAttendancePct ?? 80;

  const batchEnrollments = useMemo(
    () =>
      enrollments.filter(
        (e) => e.batchId === batchId && ['confirmed', 'in_progress', 'completed'].includes(e.status)
      ),
    [enrollments, batchId]
  );
  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const dateRecords = useMemo(() => records.filter((r) => r.date === date), [records, date]);
  const isDateLocked = dateRecords.some((r) => r.submissionStatus === 'submitted');
  const isSheetEditable = canMark && (!isDateLocked || isAdmin);

  const enrollmentMetrics = useMemo(() => {
    const map = new Map<
      string,
      { total: number; attended: number; missed: number; pct: number | null; belowThreshold: boolean }
    >();
    for (const enr of batchEnrollments) {
      const enrRecs = records.filter((r) => r.enrollmentId === enr.id);
      if (enrRecs.length === 0) {
        map.set(enr.id, { total: 0, attended: 0, missed: 0, pct: null, belowThreshold: false });
      } else {
        const attended = enrRecs.filter((r) => ['present', 'late', 'excused'].includes(r.status)).length;
        const pct = Math.round((attended / enrRecs.length) * 100);
        map.set(enr.id, {
          total: enrRecs.length,
          attended,
          missed: enrRecs.length - attended,
          pct,
          belowThreshold: minRequiredPct > 0 && pct < minRequiredPct,
        });
      }
    }
    return map;
  }, [batchEnrollments, records, minRequiredPct]);

  const sessionHistory = useMemo(() => {
    const grouped = new Map<
      string,
      {
        date: string;
        present: number;
        late: number;
        excused: number;
        absent: number;
        total: number;
        locked: boolean;
      }
    >();
    for (const r of records) {
      const cur = grouped.get(r.date) || {
        date: r.date,
        present: 0,
        late: 0,
        excused: 0,
        absent: 0,
        total: 0,
        locked: false,
      };
      cur[r.status] += 1;
      cur.total += 1;
      if (r.submissionStatus === 'submitted') cur.locked = true;
      grouped.set(r.date, cur);
    }
    return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  const batchSummary = useMemo(() => {
    const pcts: number[] = [];
    let belowCount = 0;
    for (const enr of batchEnrollments) {
      const m = enrollmentMetrics.get(enr.id);
      if (m && m.pct !== null) {
        pcts.push(m.pct);
        if (m.belowThreshold) belowCount += 1;
      }
    }
    const avgPct = pcts.length > 0 ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;
    return {
      avgPct,
      sessionsCount: sessionHistory.length,
      belowCount,
    };
  }, [batchEnrollments, enrollmentMetrics, sessionHistory.length]);

  const markAllPresent = () => {
    if (!isSheetEditable || isDateLocked) return;
    const next = { ...draft };
    for (const enr of batchEnrollments) {
      next[enr.id] = { status: 'present', remarks: next[enr.id]?.remarks || '' };
    }
    setDraft(next);
  };

  const handleSave = async (submissionMode: 'draft' | 'submit') => {
    if (!batchId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const entries = batchEnrollments.map((enr) => ({
        enrollmentId: enr.id,
        status: draft[enr.id]?.status || 'present',
        remarks: draft[enr.id]?.remarks || '',
      }));
      await apiFetch('/api/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({ batchId, date, submissionMode, entries }),
      });
      setSavedMsg(
        submissionMode === 'submit'
          ? `${t('submittedLockedLabel')} (${date})`
          : `${t('draftStatusLabel')} — ${date}`
      );
      await loadAttendance();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAdminCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionModal || !batchId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await apiFetch('/api/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({
          batchId,
          date,
          submissionMode: 'submit',
          correctionReason: correctionModal.correctionReason,
          entries: [
            {
              enrollmentId: correctionModal.enrollment.id,
              status: correctionModal.status,
              remarks: correctionModal.remarks,
              correctionReason: correctionModal.correctionReason,
            },
          ],
        }),
      });
      setSavedMsg(
        `Corrected submitted attendance for ${correctionModal.enrollment.candidateId} (${date})`
      );
      setCorrectionModal(null);
      await loadAttendance();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const dateRecordMap = useMemo(
    () => new Map(dateRecords.map((r) => [r.enrollmentId, r])),
    [dateRecords]
  );

  const correctionRecords = useMemo(
    () => records.filter((r) => Boolean(r.correctionReason)).sort((a, b) => b.date.localeCompare(a.date)),
    [records]
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-md min-w-[260px]"
          >
            <option value="">Select Training Batch...</option>
            {batches.map((b) => {
              const c = courses.find((crs) => crs.id === b.courseId);
              return (
                <option key={b.id} value={b.id}>
                  {b.batchNumber} — {lang === 'ar' ? c?.titleAr || c?.titleEn : c?.titleEn} ({b.startDate} → {b.endDate})
                </option>
              );
            })}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
          />

          <div className="inline-flex border border-slate-200 rounded-md overflow-hidden bg-slate-50">
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'sheet' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              {t('attendanceTabSheet')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'history' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{t('attendanceTabHistory')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {batchId && (
            <>
              <button
                type="button"
                onClick={() =>
                  void downloadProtectedFile(
                    `/api/attendance/pdf?batchId=${encodeURIComponent(batchId)}&date=${encodeURIComponent(date)}`,
                    `attendance_${selectedBatch?.batchNumber || batchId}_${date}.pdf`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('pdfSheetBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadProtectedFile(
                    `/api/attendance/export?batchId=${encodeURIComponent(batchId)}${activeTab === 'sheet' ? `&date=${encodeURIComponent(date)}` : ''}`,
                    `attendance_${selectedBatch?.batchNumber || batchId}_${activeTab === 'sheet' ? date : 'history'}.csv`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{t('exportCsvSheetBtn')}</span>
              </button>
            </>
          )}
          {activeTab === 'sheet' && canMark && !isDateLocked && batchEnrollments.length > 0 && (
            <>
              <button
                type="button"
                onClick={markAllPresent}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('markAllPresentBtn')}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave('draft')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('saveDraftBtn')}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave('submit')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{saving ? t('loading') : t('submitAndLockBtn')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Batch Summary Strip */}
      {selectedBatch && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-[11px] text-slate-500 font-medium">{t('batchAvgAttendanceLabel')}</div>
            <div className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
              {batchSummary.avgPct === null ? '—' : `${batchSummary.avgPct}%`}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-[11px] text-slate-500 font-medium">{t('totalSessionsRecordedLabel')}</div>
            <div className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
              {batchSummary.sessionsCount}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-[11px] text-slate-500 font-medium">{t('minRequiredAttendanceLabel')}</div>
            <div className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
              {minRequiredPct}%
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="text-[11px] text-slate-500 font-medium">{t('belowThresholdCountLabel')}</div>
            <div
              className={`mt-1 text-lg font-semibold font-mono-tabular ${
                batchSummary.belowCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {batchSummary.belowCount}
            </div>
          </div>
        </div>
      )}

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {savedMsg && (
        <div className="px-4 py-2.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {savedMsg}
        </div>
      )}

      {activeTab === 'sheet' && isDateLocked && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs bg-slate-100 border border-slate-300 rounded-md text-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <Lock className="w-4 h-4 text-slate-700 shrink-0" />
            <span>
              {isAdmin ? t('correctAttendanceHint') : t('lockedAttendanceTrainerNotice')}
            </span>
          </div>
          <span className="font-mono-tabular font-semibold text-[11px] uppercase tracking-wide text-slate-700">
            {t('submittedLockedLabel')}
          </span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : batchEnrollments.length === 0 ? (
        <EmptyState
          title="No Enrolled Candidates"
          description="Select a batch with confirmed enrollments to record or review attendance."
        />
      ) : activeTab === 'sheet' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start">{t('nav_candidates')}</th>
                <th className="py-2.5 px-4 text-start">{t('enrollmentIdCol')}</th>
                <th className="py-2.5 px-4 text-start">{t('sessionsProgressCol')}</th>
                <th className="py-2.5 px-4 text-start">{t('attendancePctCol')}</th>
                <th className="py-2.5 px-4 text-start">
                  {t('status')} ({date})
                </th>
                <th className="py-2.5 px-4 text-start">Remarks / {t('correctionHistoryLabel')}</th>
                {isAdmin && isDateLocked && <th className="py-2.5 px-4 text-end">{t('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {batchEnrollments.map((enr) => {
                const cand = candMap.get(enr.candidateDocId);
                const cur = draft[enr.id] || { status: 'present', remarks: '' };
                const existingRec = dateRecordMap.get(enr.id);
                const m = enrollmentMetrics.get(enr.id);
                const rowLocked = isDateLocked;

                return (
                  <tr key={enr.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
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
                            {enr.candidateId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-800">
                      {enr.enrollmentNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-700">
                      {m && m.total > 0 ? `${m.attended} / ${m.total}` : '0 / 0'}
                    </td>
                    <td className="py-2.5 px-4">
                      {m && m.pct !== null ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono-tabular font-semibold ${
                              m.belowThreshold ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {m.pct}%
                          </span>
                          {m.belowThreshold && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"
                              title={`${m.pct}% < ${minRequiredPct}%`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>{t('belowThresholdWarning')}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono-tabular">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {rowLocked ? (
                        <div className="flex items-center gap-2">
                          <StatusText status={existingRec?.status || cur.status} />
                          <Lock className="w-3 h-3 text-slate-400" />
                        </div>
                      ) : (
                        <select
                          disabled={!canMark}
                          value={cur.status}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [enr.id]: { ...cur, status: e.target.value as AttendanceStatus },
                            }))
                          }
                          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white"
                        >
                          <option value="present">{t('status_present')}</option>
                          <option value="absent">{t('status_absent')}</option>
                          <option value="late">{t('status_late')}</option>
                          <option value="excused">{t('status_excused')}</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {rowLocked ? (
                        <div className="space-y-0.5 text-[11px] text-slate-600">
                          <div>{existingRec?.remarks || '—'}</div>
                          {existingRec?.correctionReason && (
                            <div className="text-amber-800 font-medium">
                              {t('correctionHistoryLabel')}: {existingRec.correctionReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          disabled={!canMark}
                          value={cur.remarks}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [enr.id]: { ...cur, remarks: e.target.value },
                            }))
                          }
                          placeholder="Optional session remarks"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded"
                        />
                      )}
                    </td>
                    {isAdmin && isDateLocked && (
                      <td className="py-2.5 px-4 text-end">
                        <button
                          type="button"
                          onClick={() =>
                            setCorrectionModal({
                              enrollment: enr,
                              candidate: cand,
                              status: existingRec?.status || cur.status,
                              remarks: existingRec?.remarks || '',
                              correctionReason: '',
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-300 rounded hover:bg-slate-50"
                        >
                          <PencilLine className="w-3 h-3" />
                          <span>{t('correctSubmittedBtn')}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Attendance History View */
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            {sessionHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">{t('noSessionHistoryHint')}</div>
            ) : (
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4 text-start">Session Date</th>
                    <th className="py-2.5 px-4 text-start">{t('status_present')}</th>
                    <th className="py-2.5 px-4 text-start">{t('status_late')}</th>
                    <th className="py-2.5 px-4 text-start">{t('status_excused')}</th>
                    <th className="py-2.5 px-4 text-start">{t('status_absent')}</th>
                    <th className="py-2.5 px-4 text-start">State</th>
                    <th className="py-2.5 px-4 text-end">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {sessionHistory.map((s) => (
                    <tr key={s.date} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">
                        {s.date}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-emerald-700 font-medium">{s.present}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-amber-700 font-medium">{s.late}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-sky-700 font-medium">{s.excused}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-red-700 font-medium">{s.absent}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                          {s.locked && <Lock className="w-3 h-3 text-slate-500" />}
                          {s.locked ? t('submittedLockedLabel') : t('draftStatusLabel')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-end whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDate(s.date);
                            setActiveTab('sheet');
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                        >
                          {t('view')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadProtectedFile(
                              `/api/attendance/pdf?batchId=${encodeURIComponent(batchId)}&date=${encodeURIComponent(s.date)}`,
                              `attendance_${selectedBatch?.batchNumber || batchId}_${s.date}.pdf`
                            )
                          }
                          className="px-2.5 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {correctionRecords.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                {t('correctionHistoryLabel')}
              </div>
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-2 px-4 text-start">Date</th>
                    <th className="py-2 px-4 text-start">{t('candidateId')}</th>
                    <th className="py-2 px-4 text-start">{t('status')}</th>
                    <th className="py-2 px-4 text-start">{t('correctionReasonRequiredLabel')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {correctionRecords.map((cr) => {
                    const c = candMap.get(cr.candidateDocId);
                    return (
                      <tr key={cr.id}>
                        <td className="py-2 px-4 font-mono-tabular">{cr.date}</td>
                        <td className="py-2 px-4">
                          <span className="font-mono-tabular font-medium">{c?.candidateId || cr.candidateDocId}</span>
                          {c?.fullNameEn ? ` — ${c.fullNameEn}` : ''}
                        </td>
                        <td className="py-2 px-4">
                          <StatusText status={cr.status} />
                        </td>
                        <td className="py-2 px-4 text-slate-700">{cr.correctionReason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Admin Correction Modal */}
      <Modal
        open={Boolean(correctionModal)}
        onClose={() => setCorrectionModal(null)}
        title={t('correctAttendanceTitle')}
        maxWidth="max-w-md"
      >
        {correctionModal && (
          <form onSubmit={handleAdminCorrection} className="space-y-4">
            <p className="text-xs text-slate-600">{t('correctAttendanceHint')}</p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
              <div className="font-semibold text-slate-900">
                {correctionModal.candidate?.fullNameEn || correctionModal.enrollment.candidateId}
              </div>
              <div className="text-slate-500 font-mono-tabular">
                {correctionModal.enrollment.enrollmentNumber} · {date}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t('status')}</label>
              <select
                value={correctionModal.status}
                onChange={(e) =>
                  setCorrectionModal({
                    ...correctionModal,
                    status: e.target.value as AttendanceStatus,
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              >
                <option value="present">{t('status_present')}</option>
                <option value="absent">{t('status_absent')}</option>
                <option value="late">{t('status_late')}</option>
                <option value="excused">{t('status_excused')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
              <input
                value={correctionModal.remarks}
                onChange={(e) =>
                  setCorrectionModal({ ...correctionModal, remarks: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t('correctionReasonRequiredLabel')}
              </label>
              <textarea
                required
                rows={3}
                value={correctionModal.correctionReason}
                onChange={(e) =>
                  setCorrectionModal({ ...correctionModal, correctionReason: e.target.value })
                }
                placeholder={t('correctionReasonPlaceholder')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrectionModal(null)}
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
        )}
      </Modal>
    </div>
  );
}
