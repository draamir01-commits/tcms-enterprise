import { sanitizeCandidateForClient } from './helpers.ts';
import type {
  AssessmentRecord,
  AttendanceRecord,
  AuditLogItem,
  Batch,
  Candidate,
  Certificate,
  Course,
  DeliveryLogItem,
  Enrollment,
  EnrollmentRequest,
  Organization,
  Trainer,
  TrainingCard,
  UserRole,
} from '../src/types/tcms.ts';

export interface ChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface DashboardDatasetInput {
  role: UserRole;
  userId: string;
  organizationId?: string;
  trainerId?: string;
  from?: string;
  to?: string;
  today?: string;
  permissions: {
    canViewAttendance: boolean;
    canViewAssessments: boolean;
    canViewCertificates: boolean;
    canViewAuditLogs: boolean;
  };
  candidates: Candidate[];
  organizations: Organization[];
  courses: Course[];
  trainers: Trainer[];
  batches: Batch[];
  enrollments: Enrollment[];
  attendance: AttendanceRecord[];
  assessments: AssessmentRecord[];
  certificates: Certificate[];
  enrollmentRequests: EnrollmentRequest[];
  deliveryLogs: DeliveryLogItem[];
  auditLogs: AuditLogItem[];
}

export function inDateRange(dateStr: string | undefined, from?: string, to?: string): boolean {
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function computeEnrollmentEligibilitySummary(
  enrollment: Enrollment,
  course: Course | undefined,
  batch: Batch | undefined,
  enrAttendance: AttendanceRecord[],
  enrAssessments: AssessmentRecord[]
): {
  eligible: boolean;
  attendancePct: number;
  minAttendancePct: number;
  attendanceMet: boolean;
  examPassed: boolean;
  practicalPassed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const enrollmentConfirmed = ['confirmed', 'in_progress', 'completed'].includes(enrollment.status);
  if (!enrollmentConfirmed) reasons.push('Enrollment not confirmed');

  const trainingCompleted = batch?.status === 'completed' || enrollment.status === 'completed';
  if (!trainingCompleted) reasons.push('Training not completed');

  const totalSessions = enrAttendance.length;
  const attended = enrAttendance.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
  const attendancePct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0;
  const minAttendancePct = course?.minAttendancePct ?? 80;
  const attendanceMet = minAttendancePct === 0 || (totalSessions > 0 && attendancePct >= minAttendancePct);
  if (!attendanceMet) reasons.push(`Attendance ${attendancePct}% < ${minAttendancePct}%`);

  const examRequired = course?.examRequired ?? true;
  const practicalRequired = course?.practicalRequired ?? false;
  const examDocs = enrAssessments.filter((a) => ['written', 'oral', 'pass_fail'].includes(a.assessmentType));
  const examPassed = !examRequired || examDocs.some((a) => a.result === 'pass');
  if (!examPassed) reasons.push('Exam not passed');

  const practicalDocs = enrAssessments.filter((a) => a.assessmentType === 'practical');
  const practicalPassed = !practicalRequired || practicalDocs.some((a) => a.result === 'pass');
  if (!practicalPassed) reasons.push('Practical not passed');

  if (!enrollment.trainerRecommended) reasons.push('Trainer recommendation pending');
  if (!enrollment.completionApproved) reasons.push('Completion approval pending');

  const eligible =
    enrollmentConfirmed &&
    trainingCompleted &&
    attendanceMet &&
    examPassed &&
    practicalPassed &&
    Boolean(enrollment.trainerRecommended) &&
    Boolean(enrollment.completionApproved);

  return {
    eligible,
    attendancePct,
    minAttendancePct,
    attendanceMet,
    examPassed,
    practicalPassed,
    reasons,
  };
}

export function buildDashboardPayload(input: DashboardDatasetInput) {
  const {
    role,
    userId,
    organizationId,
    trainerId,
    from,
    to,
    permissions,
  } = input;

  const today = input.today || new Date().toISOString().slice(0, 10);
  const in60Days = new Date(new Date(`${today}T00:00:00Z`).getTime() + 60 * 86400000)
    .toISOString()
    .slice(0, 10);

  // Role scoping safeguards
  const enrollments =
    role === 'candidate'
      ? input.enrollments.filter((e) => e.candidateUserId === userId)
      : role === 'corporate_client'
        ? input.enrollments.filter((e) => e.organizationId === organizationId)
        : role === 'trainer'
          ? input.enrollments.filter(
              (e) => e.trainerUserId === userId || (trainerId && e.trainerId === trainerId)
            )
          : input.enrollments;

  const enrolledCandidateIds = new Set(enrollments.map((e) => e.candidateDocId));
  const enrolledBatchIds = new Set(enrollments.map((e) => e.batchId));

  const candidates =
    role === 'candidate'
      ? input.candidates.filter((c) => c.userId === userId)
      : role === 'corporate_client'
        ? input.candidates.filter((c) => c.organizationId === organizationId)
        : role === 'trainer'
          ? input.candidates.filter((c) => enrolledCandidateIds.has(c.id))
          : input.candidates;

  const trainers =
    role === 'trainer'
      ? input.trainers.filter((t) => t.userId === userId || (trainerId && t.id === trainerId))
      : input.trainers;

  const batches =
    role === 'trainer'
      ? input.batches.filter((b) => b.trainerUserId === userId || (trainerId && b.trainerId === trainerId))
      : role === 'candidate' || role === 'corporate_client'
        ? input.batches.filter((b) => enrolledBatchIds.has(b.id))
        : input.batches;

  const organizations =
    role === 'corporate_client'
      ? input.organizations.filter((o) => o.id === organizationId)
      : role === 'trainer' || role === 'candidate'
        ? []
        : input.organizations;

  const certificates =
    role === 'candidate'
      ? input.certificates.filter((c) => c.candidateUserId === userId)
      : role === 'corporate_client'
        ? input.certificates.filter((c) => c.organizationId === organizationId)
        : ['super_admin', 'tenant_owner', 'admin', 'tenant_admin', 'certificate_officer'].includes(role)
          ? input.certificates
          : [];

  const assessments =
    role === 'candidate'
      ? []
      : role === 'corporate_client'
        ? input.assessments.filter((a) => a.organizationId === organizationId)
        : role === 'trainer'
          ? input.assessments.filter((a) => a.trainerUserId === userId || enrolledBatchIds.has(a.batchId))
          : input.assessments;

  const attendance =
    role === 'candidate'
      ? []
      : role === 'corporate_client'
        ? input.attendance.filter((a) => a.organizationId === organizationId)
        : role === 'trainer'
          ? input.attendance.filter((a) => a.trainerUserId === userId || enrolledBatchIds.has(a.batchId))
          : input.attendance;

  const courses = input.courses;
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const candMap = new Map(candidates.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const orgMap = new Map(organizations.map((o) => [o.id, o]));

  // Date-filtered slices
  const filteredCandidates = candidates.filter((c) => inDateRange(c.registrationDate || c.createdAt, from, to));
  const filteredEnrollments = enrollments.filter((e) => inDateRange(e.createdAt, from, to));
  const filteredCertificates = certificates.filter((c) => inDateRange(c.issueDate || c.createdAt, from, to));
  const filteredAttendance = attendance.filter((a) => inDateRange(a.date, from, to));
  const filteredAssessments = assessments.filter((a) => inDateRange(a.assessmentDate || a.createdAt, from, to));

  // Pre-group attendance & assessments by enrollmentId
  const attByEnrollment = new Map<string, AttendanceRecord[]>();
  for (const a of attendance) {
    const arr = attByEnrollment.get(a.enrollmentId) || [];
    arr.push(a);
    attByEnrollment.set(a.enrollmentId, arr);
  }
  const assessByEnrollment = new Map<string, AssessmentRecord[]>();
  for (const a of assessments) {
    const arr = assessByEnrollment.get(a.enrollmentId) || [];
    arr.push(a);
    assessByEnrollment.set(a.enrollmentId, arr);
  }
  const activeCertByEnrollment = new Set(
    certificates.filter((c) => c.status === 'valid' || c.status === 'expired').map((c) => c.enrollmentId)
  );

  // Batch classifications (active vs upcoming)
  const activeBatchesList = batches.filter(
    (b) =>
      b.status === 'in_progress' ||
      (b.status === 'scheduled' && b.startDate <= today && b.endDate >= today)
  );
  const upcomingBatchesList = batches
    .filter((b) => b.status === 'scheduled' && b.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Candidates awaiting examinations
  const awaitingExamEnrollments = filteredEnrollments.filter((e) => {
    if (!['confirmed', 'in_progress'].includes(e.status)) return false;
    const crs = courseMap.get(e.courseId);
    const needsAssessment = crs ? crs.examRequired || crs.practicalRequired : true;
    if (!needsAssessment) return false;
    const enrAssess = assessByEnrollment.get(e.id) || [];
    return enrAssess.length === 0 || !enrAssess.some((a) => a.result === 'pass');
  });

  // Eligible certificates pending issuance + trainer-recommended pending approval
  const eligiblePendingItems: Array<{
    enrollmentId: string;
    enrollmentNumber: string;
    candidateName: string;
    courseTitle: string;
    batchNumber: string;
    eligible: boolean;
    completionApproved: boolean;
    attendancePct: number;
  }> = [];

  for (const enr of enrollments) {
    if (enr.certificateId || activeCertByEnrollment.has(enr.id)) continue;
    if (!['confirmed', 'in_progress', 'completed'].includes(enr.status)) continue;
    const crs = courseMap.get(enr.courseId);
    const bth = batchMap.get(enr.batchId);
    const summary = computeEnrollmentEligibilitySummary(
      enr,
      crs,
      bth,
      attByEnrollment.get(enr.id) || [],
      assessByEnrollment.get(enr.id) || []
    );
    if (summary.eligible || enr.trainerRecommended || enr.completionApproved) {
      eligiblePendingItems.push({
        enrollmentId: enr.id,
        enrollmentNumber: enr.enrollmentNumber,
        candidateName: candMap.get(enr.candidateDocId)?.fullNameEn || enr.candidateId,
        courseTitle: crs?.titleEn || enr.courseId,
        batchNumber: bth?.batchNumber || enr.batchId,
        eligible: summary.eligible,
        completionApproved: Boolean(enr.completionApproved),
        attendancePct: summary.attendancePct,
      });
    }
  }

  const eligibleReadyCount = eligiblePendingItems.filter((item) => item.eligible).length;
  const activeEnrollmentsCount = filteredEnrollments.filter((e) =>
    ['pending', 'confirmed', 'in_progress'].includes(e.status)
  ).length;
  const completedEnrollmentsCount = filteredEnrollments.filter((e) => e.status === 'completed').length;
  const expiringCertsCount = certificates.filter(
    (c) => c.status === 'valid' && c.expiryDate && c.expiryDate >= today && c.expiryDate <= in60Days
  ).length;

  const kpis = {
    totalCandidates: filteredCandidates.length,
    activeCandidates: filteredCandidates.filter((c) => c.status === 'active').length,
    totalCorporateClients: organizations.filter((o) => o.status === 'active').length || organizations.length,
    totalCourses: courses.filter((c) => c.status === 'active').length,
    activeTrainers: trainers.filter((t) => t.status === 'active').length,
    totalTrainers: trainers.filter((t) => t.status === 'active').length,
    activeBatches: activeBatchesList.length,
    upcomingBatches: upcomingBatchesList.length,
    activeEnrollments: activeEnrollmentsCount,
    currentEnrollments: activeEnrollmentsCount,
    currentlyTraining: filteredEnrollments.filter((e) => e.status === 'confirmed' || e.status === 'in_progress')
      .length,
    completedEnrollments: completedEnrollmentsCount,
    completedCourses: completedEnrollmentsCount,
    candidatesAwaitingExam: awaitingExamEnrollments.length,
    pendingAssessments: awaitingExamEnrollments.length,
    eligibleCertificatesPending: eligibleReadyCount,
    totalCertificatesIssued: filteredCertificates.length,
    certificatesIssued: filteredCertificates.length,
    expiringCertificates: expiringCertsCount,
  };

  // Helper to aggregate YYYY-MM series cleanly
  const groupByMonth = (dates: Array<string | undefined>): ChartPoint[] => {
    const map = new Map<string, number>();
    for (const dt of dates) {
      if (!dt) continue;
      const m = dt.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) {
        map.set(m, (map.get(m) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([label, value]) => ({ label, value }));
  };

  // Chart 3: Course popularity
  const courseCounts = new Map<string, number>();
  for (const e of filteredEnrollments) {
    const crs = courseMap.get(e.courseId);
    const name = crs ? `${crs.courseCode} · ${crs.titleEn}` : e.courseId;
    courseCounts.set(name, (courseCounts.get(name) || 0) + 1);
  }

  // Chart 4: Training completion rate & breakdown
  const completionStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'failed'];
  const completionStats: ChartPoint[] = completionStatuses.map((st) => ({
    label: st,
    value: filteredEnrollments.filter((e) => e.status === st).length,
  }));
  const nonCancelledEnrollments = filteredEnrollments.filter(
    (e) => !['cancelled', 'withdrawn'].includes(e.status)
  ).length;
  const completionRatePct =
    nonCancelledEnrollments > 0 ? Math.round((completedEnrollmentsCount / nonCancelledEnrollments) * 100) : 0;

  // Chart 5: Attendance performance
  const attStatuses = ['present', 'late', 'excused', 'absent'] as const;
  const attendancePerformance: ChartPoint[] = permissions.canViewAttendance
    ? attStatuses.map((st) => ({
        label: st,
        value: filteredAttendance.filter((a) => a.status === st).length,
      }))
    : [];
  const totalAttRecords = filteredAttendance.length;
  const attendedRecords = filteredAttendance.filter((a) =>
    ['present', 'late', 'excused'].includes(a.status)
  ).length;
  const attendanceRatePct =
    permissions.canViewAttendance && totalAttRecords > 0
      ? Math.round((attendedRecords / totalAttRecords) * 100)
      : 0;

  // Chart 6: Examination pass rate
  const passCount = filteredAssessments.filter((a) => a.result === 'pass').length;
  const failCount = filteredAssessments.filter((a) => a.result === 'fail').length;
  const examPassRate: ChartPoint[] = permissions.canViewAssessments
    ? [
        { label: 'pass', value: passCount },
        { label: 'fail', value: failCount },
        { label: 'pending', value: awaitingExamEnrollments.length },
      ]
    : [];
  const decidedExams = passCount + failCount;
  const examPassRatePct =
    permissions.canViewAssessments && decidedExams > 0 ? Math.round((passCount / decidedExams) * 100) : 0;

  // Chart 8: Corporate client participation (or Department breakdown for Corporate Client)
  const orgCounts = new Map<string, number>();
  if (role === 'corporate_client') {
    for (const e of filteredEnrollments) {
      const dept = candMap.get(e.candidateDocId)?.department || 'General Staff';
      orgCounts.set(dept, (orgCounts.get(dept) || 0) + 1);
    }
  } else {
    for (const e of filteredEnrollments) {
      if (!e.organizationId) continue;
      const name = orgMap.get(e.organizationId)?.nameEn || e.organizationId;
      orgCounts.set(name, (orgCounts.get(name) || 0) + 1);
    }
  }

  // Secondary: Trainer performance
  const trainerCounts = new Map<string, number>();
  for (const b of batches) {
    const name = trainerMap.get(b.trainerId)?.nameEn || b.trainerId;
    trainerCounts.set(name, (trainerCounts.get(name) || 0) + (b.enrollmentCount || 0));
  }

  // -------------------------------------------------------------------------
  // Operational Dashboard Panels
  // -------------------------------------------------------------------------
  const todaysSessions = batches
    .filter(
      (b) =>
        b.status !== 'cancelled' &&
        b.startDate <= today &&
        b.endDate >= today
    )
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    .slice(0, 10)
    .map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      courseCode: courseMap.get(b.courseId)?.courseCode || '',
      courseTitle: courseMap.get(b.courseId)?.titleEn || b.courseId,
      trainerName: trainerMap.get(b.trainerId)?.nameEn || '-',
      venue: b.venue,
      trainingMode: b.trainingMode || 'classroom',
      startTime: b.startTime || '08:00',
      endTime: b.endTime || '16:00',
      enrollmentCount: b.enrollmentCount,
      capacity: b.capacity,
      status: b.status,
    }));

  const upcomingSessions = upcomingBatchesList.slice(0, 10).map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    courseCode: courseMap.get(b.courseId)?.courseCode || '',
    courseTitle: courseMap.get(b.courseId)?.titleEn || b.courseId,
    trainerName: trainerMap.get(b.trainerId)?.nameEn || '-',
    venue: b.venue,
    startDate: b.startDate,
    endDate: b.endDate,
    enrollmentCount: b.enrollmentCount,
    capacity: b.capacity,
    status: b.status,
  }));

  const todaysAttRecords = attendance.filter((a) => a.date === today);
  const todaysAttendance = permissions.canViewAttendance
    ? {
        date: today,
        totalMarked: todaysAttRecords.length,
        present: todaysAttRecords.filter((a) => a.status === 'present').length,
        absent: todaysAttRecords.filter((a) => a.status === 'absent').length,
        late: todaysAttRecords.filter((a) => a.status === 'late').length,
        excused: todaysAttRecords.filter((a) => a.status === 'excused').length,
        batchesMarked: new Set(todaysAttRecords.map((a) => a.batchId)).size,
        activeBatchesCount: todaysSessions.length,
      }
    : null;

  const pendingEnrList = enrollments
    .filter((e) => e.status === 'pending')
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      ref: e.enrollmentNumber,
      kind: 'enrollment' as const,
      title: candMap.get(e.candidateDocId)?.fullNameEn || e.candidateId,
      subtitle: courseMap.get(e.courseId)?.titleEn || e.courseId,
      date: (e.createdAt || '').slice(0, 10),
      status: e.status,
    }));

  const pendingReqList = input.enrollmentRequests
    .filter((r) => r.status === 'pending_review' || r.status === 'info_requested')
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      ref: r.requestNumber,
      kind: 'corporate_request' as const,
      title: r.organizationNameEn || orgMap.get(r.organizationId)?.nameEn || r.organizationId,
      subtitle: `${courseMap.get(r.courseId)?.titleEn || r.courseId} (${r.candidateDocIds.length})`,
      date: (r.createdAt || '').slice(0, 10),
      status: r.status,
    }));

  const pendingAssessCorrections = assessments.filter((a) => a.assessmentStatus === 'pending_correction');
  const pendingAssessmentItems = [
    ...pendingAssessCorrections.slice(0, 5).map((a) => ({
      id: a.id,
      ref: a.assessmentNumber || a.id,
      candidateName: candMap.get(a.candidateDocId)?.fullNameEn || a.candidateDocId,
      courseTitle: courseMap.get(a.courseId)?.titleEn || a.courseId,
      batchNumber: batchMap.get(a.batchId)?.batchNumber || a.batchId,
      status: 'pending_correction',
    })),
    ...awaitingExamEnrollments.slice(0, 8).map((e) => ({
      id: e.id,
      ref: e.enrollmentNumber,
      candidateName: candMap.get(e.candidateDocId)?.fullNameEn || e.candidateId,
      courseTitle: courseMap.get(e.courseId)?.titleEn || e.courseId,
      batchNumber: batchMap.get(e.batchId)?.batchNumber || e.batchId,
      status: 'awaiting_exam',
    })),
  ].slice(0, 10);

  const failedNotifList = input.deliveryLogs
    .filter((d) => d.deliveryStatus === 'failed' || d.deliveryStatus === 'retry_required')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const recentActivity = (permissions.canViewAuditLogs ? input.auditLogs : [])
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 12)
    .map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorEmail: l.actorEmail || l.actorUid,
      actorRole: l.actorRole,
      details: l.details || '',
      createdAt: l.createdAt,
    }));

  return {
    role,
    dateRange: { from: from || null, to: to || null },
    kpis,
    metrics: {
      completionRatePct,
      attendanceRatePct,
      examPassRatePct,
    },
    charts: {
      registrationsByMonth: groupByMonth(filteredCandidates.map((c) => c.registrationDate || c.createdAt)),
      enrollmentsByMonth: groupByMonth(filteredEnrollments.map((e) => e.createdAt)),
      courseEnrollments: Array.from(courseCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value })),
      completionStats,
      attendancePerformance,
      examPassRate,
      certificatesByMonth: groupByMonth(filteredCertificates.map((c) => c.issueDate || c.createdAt)),
      corporateActivity: Array.from(orgCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value })),
      trainerPerformance: Array.from(trainerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value })),
    },
    operational: {
      todaysSessions,
      upcomingSessions,
      todaysAttendance,
      pendingEnrollmentApprovals: {
        count:
          enrollments.filter((e) => e.status === 'pending').length +
          input.enrollmentRequests.filter((r) => r.status === 'pending_review' || r.status === 'info_requested').length,
        items: [...pendingReqList, ...pendingEnrList].slice(0, 10),
      },
      pendingAssessments: {
        count: awaitingExamEnrollments.length + pendingAssessCorrections.length,
        items: pendingAssessmentItems,
      },
      pendingCertificateApprovals: {
        count: eligiblePendingItems.length,
        readyCount: eligibleReadyCount,
        items: eligiblePendingItems.slice(0, 10),
      },
      failedNotifications: {
        count: failedNotifList.length,
        items: failedNotifList.slice(0, 8).map((n) => ({
          id: n.id,
          channel: n.channel,
          recipient: n.recipient,
          category: n.category,
          deliveryStatus: n.deliveryStatus,
          failureReason: n.failureReason || 'Delivery error',
          createdAt: n.createdAt,
        })),
      },
      recentActivity,
    },
  };
}

export interface ReportFilterOptions {
  reportType: string;
  role: UserRole;
  from?: string;
  to?: string;
  courseId?: string;
  batchId?: string;
  trainerId?: string;
  organizationId?: string;
  candidateStatus?: string;
  enrollmentStatus?: string;
  certStatus?: string;
  page?: number;
  pageSize?: number;
  today?: string;
  permissions: {
    canViewAttendance: boolean;
    canViewAssessments: boolean;
    canViewCertificates: boolean;
  };
  candidates: Candidate[];
  organizations: Organization[];
  courses: Course[];
  trainers: Trainer[];
  batches: Batch[];
  enrollments: Enrollment[];
  attendance: AttendanceRecord[];
  assessments: AssessmentRecord[];
  cards: TrainingCard[];
  certificates: Certificate[];
  auditLogs: AuditLogItem[];
}

export interface GeneratedReportResult {
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  allRows: string[][];
  summary: Array<{ label: string; value: string | number }>;
}

export function buildReportPayload(opts: ReportFilterOptions): GeneratedReportResult {
  const {
    reportType,
    role,
    from,
    to,
    courseId,
    batchId,
    trainerId,
    organizationId,
    candidateStatus,
    enrollmentStatus,
    certStatus,
    permissions,
    candidates,
    organizations,
    courses,
    trainers,
    batches,
    enrollments,
    attendance,
    assessments,
    cards,
    certificates,
    auditLogs,
  } = opts;

  const today = opts.today || new Date().toISOString().slice(0, 10);
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const candMap = new Map(candidates.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const orgMap = new Map(organizations.map((o) => [o.id, o]));

  // Trainer-filtered batch IDs (when trainerId filter is provided)
  const matchingTrainerBatchIds = trainerId
    ? new Set(batches.filter((b) => b.trainerId === trainerId).map((b) => b.id))
    : null;

  // Common filtered collections honoring all 8 filters
  const filteredCandidates = candidates.filter(
    (c) =>
      (!organizationId || c.organizationId === organizationId) &&
      (!candidateStatus || c.status === candidateStatus)
  );
  const validCandidateIds = new Set(filteredCandidates.map((c) => c.id));

  const filteredBatches = batches.filter(
    (b) =>
      (!courseId || b.courseId === courseId) &&
      (!batchId || b.id === batchId) &&
      (!trainerId || b.trainerId === trainerId)
  );

  const filteredEnrollments = enrollments.filter((e) => {
    if (organizationId && e.organizationId !== organizationId) return false;
    if (courseId && e.courseId !== courseId) return false;
    if (batchId && e.batchId !== batchId) return false;
    if (trainerId && e.trainerId !== trainerId && !matchingTrainerBatchIds?.has(e.batchId)) return false;
    if (enrollmentStatus && e.status !== enrollmentStatus) return false;
    if (candidateStatus && !validCandidateIds.has(e.candidateDocId)) return false;
    return true;
  });
  const validEnrollmentIds = new Set(filteredEnrollments.map((e) => e.id));

  const filteredAttendance = attendance.filter((a) => {
    if (organizationId && a.organizationId !== organizationId) return false;
    if (batchId && a.batchId !== batchId) return false;
    if (courseId && batchMap.get(a.batchId)?.courseId !== courseId) return false;
    if (trainerId && !matchingTrainerBatchIds?.has(a.batchId)) return false;
    if ((enrollmentStatus || candidateStatus) && !validEnrollmentIds.has(a.enrollmentId)) return false;
    return true;
  });

  const filteredAssessments = assessments.filter((a) => {
    if (organizationId && a.organizationId !== organizationId) return false;
    if (courseId && a.courseId !== courseId) return false;
    if (batchId && a.batchId !== batchId) return false;
    if (trainerId && !matchingTrainerBatchIds?.has(a.batchId)) return false;
    if ((enrollmentStatus || candidateStatus) && !validEnrollmentIds.has(a.enrollmentId)) return false;
    return true;
  });

  const filteredCertificates = certificates.filter((c) => {
    if (organizationId && c.organizationId !== organizationId) return false;
    if (courseId && c.courseId !== courseId) return false;
    if (batchId && c.batchId !== batchId) return false;
    if (trainerId && !matchingTrainerBatchIds?.has(c.batchId)) return false;
    if (certStatus && c.status !== certStatus) return false;
    if ((enrollmentStatus || candidateStatus) && !validEnrollmentIds.has(c.enrollmentId)) return false;
    return true;
  });

  const attByEnrollment = new Map<string, AttendanceRecord[]>();
  for (const a of attendance) {
    const arr = attByEnrollment.get(a.enrollmentId) || [];
    arr.push(a);
    attByEnrollment.set(a.enrollmentId, arr);
  }
  const assessByEnrollment = new Map<string, AssessmentRecord[]>();
  for (const a of assessments) {
    const arr = assessByEnrollment.get(a.enrollmentId) || [];
    arr.push(a);
    assessByEnrollment.set(a.enrollmentId, arr);
  }
  const certByEnrollment = new Map(certificates.map((c) => [c.enrollmentId, c]));

  let title = 'Operational Report';
  let headers: string[] = [];
  let allRows: string[][] = [];
  let summary: Array<{ label: string; value: string | number }> = [];

  switch (reportType) {
    // -----------------------------------------------------------------------
    // 1. CANDIDATE REPORTS
    // -----------------------------------------------------------------------
    case 'candidate_registration': {
      title = 'Candidate Register Report';
      headers = [
        'Candidate ID',
        'Name (EN)',
        'Name (AR)',
        'Nationality',
        'Masked Identity',
        'Mobile',
        'Company',
        'Reg Date',
        'Status',
      ];
      allRows = filteredCandidates
        .filter((c) => inDateRange(c.registrationDate || c.createdAt, from, to))
        .map((c) => sanitizeCandidateForClient(c, role))
        .map((c) => [
          c.candidateId,
          c.fullNameEn,
          c.fullNameAr,
          c.nationality,
          c.iqamaMasked || c.passportMasked || '-',
          c.mobile || '-',
          c.companyName || orgMap.get(c.organizationId || '')?.nameEn || 'Individual',
          c.registrationDate,
          c.status,
        ]);
      summary = [
        { label: 'Total Candidates', value: allRows.length },
        { label: 'Active', value: allRows.filter((r) => r[8] === 'active').length },
      ];
      break;
    }

    case 'candidate_training_history':
    case 'employee_training_history': {
      title = 'Candidate & Employee Training History Report';
      headers = [
        'Candidate ID',
        'Candidate Name',
        'Organization / Dept',
        'Course',
        'Batch #',
        'Start Date',
        'Attendance %',
        'Exam Result',
        'Status',
        'Certificate #',
      ];
      allRows = filteredEnrollments
        .filter((e) => inDateRange(e.createdAt, from, to))
        .map((e) => {
          const cand = candMap.get(e.candidateDocId);
          const crs = courseMap.get(e.courseId);
          const bth = batchMap.get(e.batchId);
          const cert =
            (e.certificateId && certificates.find((c) => c.id === e.certificateId)) ||
            certByEnrollment.get(e.id);

          const enrAtt = permissions.canViewAttendance ? attByEnrollment.get(e.id) || [] : [];
          const attLabel = !permissions.canViewAttendance
            ? 'Restricted'
            : enrAtt.length === 0
              ? '0%'
              : `${Math.round(
                  (enrAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length /
                    enrAtt.length) *
                    100
                )}%`;

          const enrAssess = permissions.canViewAssessments
            ? (assessByEnrollment.get(e.id) || []).slice().sort((a, b) => b.attemptNumber - a.attemptNumber)
            : [];
          const latestAssess = enrAssess[0];
          const examLabel = !permissions.canViewAssessments
            ? 'Restricted'
            : latestAssess
              ? `${latestAssess.obtainedMarks}/${latestAssess.maxMarks} (${latestAssess.result.toUpperCase()})`
              : 'Pending';

          const orgName = (e.organizationId && orgMap.get(e.organizationId)?.nameEn) || cand?.companyName || 'Individual';
          const deptStr = cand?.department ? `${orgName} / ${cand.department}` : orgName;

          return [
            e.candidateId,
            cand?.fullNameEn || e.candidateId,
            deptStr,
            crs ? `${crs.courseCode} · ${crs.titleEn}` : e.courseId,
            bth?.batchNumber || e.batchId,
            bth?.startDate || '-',
            attLabel,
            examLabel,
            e.status,
            cert?.certificateNumber || '-',
          ];
        });
      summary = [
        { label: 'Training Records', value: allRows.length },
        { label: 'Completed', value: allRows.filter((r) => r[8] === 'completed').length },
      ];
      break;
    }

    case 'candidate_enrollment_history':
    case 'enrollment': {
      title = 'Candidate Enrollment History Report';
      headers = [
        'Enrollment #',
        'Candidate ID',
        'Candidate Name',
        'Course',
        'Batch #',
        'Trainer',
        'Organization',
        'Status',
        'Enrolled Date',
      ];
      allRows = filteredEnrollments
        .filter((e) => inDateRange(e.createdAt, from, to))
        .map((e) => {
          const bth = batchMap.get(e.batchId);
          return [
            e.enrollmentNumber,
            e.candidateId,
            candMap.get(e.candidateDocId)?.fullNameEn || e.candidateId,
            courseMap.get(e.courseId)?.titleEn || e.courseId,
            bth?.batchNumber || e.batchId,
            (e.trainerId && trainerMap.get(e.trainerId)?.nameEn) ||
              (bth?.trainerId && trainerMap.get(bth.trainerId)?.nameEn) ||
              '-',
            (e.organizationId && orgMap.get(e.organizationId)?.nameEn) || 'Individual',
            e.status,
            (e.createdAt || '').slice(0, 10),
          ];
        });
      summary = [{ label: 'Total Enrollments', value: allRows.length }];
      break;
    }

    // -----------------------------------------------------------------------
    // 2. TRAINING REPORTS
    // -----------------------------------------------------------------------
    case 'course_enrollment': {
      title = 'Course-Wise Enrollment Report';
      headers = [
        'Course Code',
        'Course Title (EN)',
        'Category',
        'Batches',
        'Total Enrolled',
        'Active / Confirmed',
        'Completed',
        'Failed',
        'Completion Rate',
      ];
      allRows = courses
        .filter((c) => !courseId || c.id === courseId)
        .map((c) => {
          const cEnr = filteredEnrollments.filter(
            (e) => e.courseId === c.id && inDateRange(e.createdAt, from, to)
          );
          const cBatches = filteredBatches.filter((b) => b.courseId === c.id);
          const active = cEnr.filter((e) => ['pending', 'confirmed', 'in_progress'].includes(e.status)).length;
          const completed = cEnr.filter((e) => e.status === 'completed').length;
          const failed = cEnr.filter((e) => e.status === 'failed').length;
          const denom = cEnr.filter((e) => !['cancelled', 'withdrawn'].includes(e.status)).length;
          const rate = denom > 0 ? `${Math.round((completed / denom) * 100)}%` : '0%';
          return [
            c.courseCode,
            c.titleEn,
            c.category,
            String(cBatches.length),
            String(cEnr.length),
            String(active),
            String(completed),
            String(failed),
            rate,
          ];
        });
      summary = [{ label: 'Courses Listed', value: allRows.length }];
      break;
    }

    case 'course': {
      title = 'Course Catalog Report';
      headers = [
        'Code',
        'Title (EN)',
        'Category',
        'Duration',
        'Min Attendance %',
        'Min Exam %',
        'Validity (Mo)',
        'Enrollments',
        'Status',
      ];
      allRows = courses
        .filter((c) => !courseId || c.id === courseId)
        .map((c) => [
          c.courseCode,
          c.titleEn,
          c.category,
          `${c.duration} ${c.durationUnit}`,
          String(c.minAttendancePct),
          String(c.minExamScore),
          String(c.validityMonths || 0),
          String(filteredEnrollments.filter((e) => e.courseId === c.id).length),
          c.status,
        ]);
      break;
    }

    case 'batch_enrollment':
    case 'batch': {
      title = 'Batch-Wise Enrollment Report';
      headers = [
        'Batch #',
        'Course',
        'Trainer',
        'Venue',
        'Start Date',
        'End Date',
        'Enrolled / Cap',
        'Confirmed',
        'Completed',
        'Status',
      ];
      allRows = filteredBatches
        .filter((b) => inDateRange(b.startDate, from, to))
        .map((b) => {
          const bEnr = filteredEnrollments.filter((e) => e.batchId === b.id);
          return [
            b.batchNumber,
            courseMap.get(b.courseId)?.titleEn || b.courseId,
            trainerMap.get(b.trainerId)?.nameEn || b.trainerId,
            b.venue,
            b.startDate,
            b.endDate,
            `${bEnr.length}/${b.capacity}`,
            String(bEnr.filter((e) => ['confirmed', 'in_progress'].includes(e.status)).length),
            String(bEnr.filter((e) => e.status === 'completed').length),
            b.status,
          ];
        });
      summary = [{ label: 'Batches Listed', value: allRows.length }];
      break;
    }

    case 'trainer_workload':
    case 'trainer': {
      title = 'Trainer Workload Report';
      headers = [
        'Trainer ID',
        'Name (EN)',
        'Specialization',
        'Total Batches',
        'Active Batches',
        'Completed Batches',
        'Total Trainees',
        'Assessments Recorded',
        'Status',
      ];
      allRows = trainers
        .filter((t) => !trainerId || t.id === trainerId)
        .map((t) => {
          const tBatches = batches.filter(
            (b) => b.trainerId === t.id && (!courseId || b.courseId === courseId) && inDateRange(b.startDate, from, to)
          );
          const tBatchIds = new Set(tBatches.map((b) => b.id));
          const trainees = enrollments.filter((e) => tBatchIds.has(e.batchId) && !['cancelled', 'withdrawn'].includes(e.status)).length;
          const tAssess = assessments.filter((a) => tBatchIds.has(a.batchId)).length;
          return [
            t.trainerId,
            t.nameEn,
            t.specialization,
            String(tBatches.length),
            String(tBatches.filter((b) => b.status === 'scheduled' || b.status === 'in_progress').length),
            String(tBatches.filter((b) => b.status === 'completed').length),
            String(trainees),
            String(tAssess),
            t.status,
          ];
        });
      summary = [{ label: 'Trainers Listed', value: allRows.length }];
      break;
    }

    case 'course_completion': {
      title = 'Training Completion Report';
      headers = ['Enrollment #', 'Candidate', 'Course', 'Batch #', 'Trainer Rec', 'Approved', 'Status'];
      allRows = filteredEnrollments
        .filter((e) => (e.status === 'completed' || e.completionApproved) && inDateRange(e.updatedAt || e.createdAt, from, to))
        .map((e) => [
          e.enrollmentNumber,
          candMap.get(e.candidateDocId)?.fullNameEn || e.candidateId,
          courseMap.get(e.courseId)?.titleEn || e.courseId,
          batchMap.get(e.batchId)?.batchNumber || e.batchId,
          e.trainerRecommended ? 'Yes' : 'No',
          e.completionApproved ? 'Yes' : 'No',
          e.status,
        ]);
      summary = [{ label: 'Completed Enrollments', value: allRows.length }];
      break;
    }

    // -----------------------------------------------------------------------
    // 3. ATTENDANCE REPORTS
    // -----------------------------------------------------------------------
    case 'daily_attendance':
    case 'attendance': {
      title = 'Daily Attendance Report';
      headers = ['Date', 'Batch #', 'Course', 'Candidate ID', 'Candidate Name', 'Status', 'Submission', 'Remarks'];
      allRows = filteredAttendance
        .filter((a) => inDateRange(a.date, from, to))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => {
          const bth = batchMap.get(a.batchId);
          const cand = candMap.get(a.candidateDocId);
          return [
            a.date,
            bth?.batchNumber || a.batchId,
            (bth && courseMap.get(bth.courseId)?.titleEn) || '-',
            cand?.candidateId || a.candidateDocId,
            cand?.fullNameEn || a.candidateDocId,
            a.status,
            a.submissionStatus || 'draft',
            a.remarks || '-',
          ];
        });
      summary = [
        { label: 'Records', value: allRows.length },
        { label: 'Present', value: allRows.filter((r) => r[5] === 'present').length },
        { label: 'Absent', value: allRows.filter((r) => r[5] === 'absent').length },
      ];
      break;
    }

    case 'batch_attendance': {
      title = 'Batch Attendance Summary Report';
      headers = [
        'Batch #',
        'Course',
        'Trainer',
        'Total Marks',
        'Present',
        'Late',
        'Excused',
        'Absent',
        'Attendance %',
      ];
      allRows = filteredBatches
        .filter((b) => inDateRange(b.startDate, from, to))
        .map((b) => {
          const bAtt = filteredAttendance.filter((a) => a.batchId === b.id && inDateRange(a.date, from, to));
          const present = bAtt.filter((a) => a.status === 'present').length;
          const late = bAtt.filter((a) => a.status === 'late').length;
          const excused = bAtt.filter((a) => a.status === 'excused').length;
          const absent = bAtt.filter((a) => a.status === 'absent').length;
          const rate = bAtt.length > 0 ? `${Math.round(((present + late + excused) / bAtt.length) * 100)}%` : '0%';
          return [
            b.batchNumber,
            courseMap.get(b.courseId)?.titleEn || b.courseId,
            trainerMap.get(b.trainerId)?.nameEn || b.trainerId,
            String(bAtt.length),
            String(present),
            String(late),
            String(excused),
            String(absent),
            rate,
          ];
        });
      summary = [{ label: 'Batches Evaluated', value: allRows.length }];
      break;
    }

    case 'candidate_attendance_pct': {
      title = 'Candidate Attendance Percentage Report';
      headers = [
        'Enrollment #',
        'Candidate ID',
        'Candidate Name',
        'Course',
        'Batch #',
        'Attended / Total',
        'Attendance %',
        'Required Min %',
        'Compliance',
      ];
      allRows = filteredEnrollments
        .filter((e) => !['cancelled', 'withdrawn'].includes(e.status) && inDateRange(e.createdAt, from, to))
        .map((e) => {
          const crs = courseMap.get(e.courseId);
          const bth = batchMap.get(e.batchId);
          const cand = candMap.get(e.candidateDocId);
          const enrAtt = (attByEnrollment.get(e.id) || []).filter((a) => inDateRange(a.date, from, to));
          const total = enrAtt.length;
          const attended = enrAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
          const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
          const minPct = crs?.minAttendancePct ?? 80;
          const compliance =
            total === 0 ? 'No Records' : pct >= minPct ? 'Compliant' : 'Below Threshold';
          return [
            e.enrollmentNumber,
            e.candidateId,
            cand?.fullNameEn || e.candidateId,
            crs?.titleEn || e.courseId,
            bth?.batchNumber || e.batchId,
            `${attended}/${total}`,
            `${pct}%`,
            `${minPct}%`,
            compliance,
          ];
        });
      summary = [
        { label: 'Total Enrollments', value: allRows.length },
        { label: 'Compliant', value: allRows.filter((r) => r[8] === 'Compliant').length },
        { label: 'Below Threshold', value: allRows.filter((r) => r[8] === 'Below Threshold').length },
      ];
      break;
    }

    // -----------------------------------------------------------------------
    // 4. ASSESSMENT REPORTS
    // -----------------------------------------------------------------------
    case 'examination_results':
    case 'examination': {
      title = 'Examination Results Report';
      headers = ['Date', 'Candidate ID', 'Candidate', 'Course', 'Batch #', 'Type', 'Attempt', 'Score', 'Percentage', 'Result'];
      allRows = filteredAssessments
        .filter((a) => inDateRange(a.assessmentDate, from, to))
        .map((a) => {
          const cand = candMap.get(a.candidateDocId);
          const pct = a.maxMarks > 0 ? Math.round((a.obtainedMarks / a.maxMarks) * 100) : 0;
          return [
            a.assessmentDate,
            cand?.candidateId || a.candidateDocId,
            cand?.fullNameEn || a.candidateDocId,
            courseMap.get(a.courseId)?.titleEn || a.courseId,
            batchMap.get(a.batchId)?.batchNumber || a.batchId,
            a.assessmentType,
            String(a.attemptNumber),
            `${a.obtainedMarks}/${a.maxMarks}`,
            `${pct}%`,
            a.result.toUpperCase(),
          ];
        });
      const passRows = allRows.filter((r) => r[9] === 'PASS').length;
      summary = [
        { label: 'Total Assessments', value: allRows.length },
        { label: 'Passed', value: passRows },
        { label: 'Failed', value: allRows.length - passRows },
      ];
      break;
    }

    case 'pass_fail_analysis': {
      title = 'Pass / Fail Analysis Report';
      headers = [
        'Course Code',
        'Course Title',
        'Batch #',
        'Total Assessed',
        'Passed',
        'Failed',
        'Pass Rate %',
        'Avg Score %',
      ];
      allRows = filteredBatches
        .filter((b) => inDateRange(b.startDate, from, to))
        .map((b) => {
          const bAssess = filteredAssessments.filter(
            (a) => a.batchId === b.id && inDateRange(a.assessmentDate, from, to)
          );
          const passed = bAssess.filter((a) => a.result === 'pass').length;
          const failed = bAssess.filter((a) => a.result === 'fail').length;
          const passRate = bAssess.length > 0 ? `${Math.round((passed / bAssess.length) * 100)}%` : '0%';
          const avgScore =
            bAssess.length > 0
              ? `${Math.round(
                  bAssess.reduce(
                    (acc, item) => acc + (item.maxMarks > 0 ? (item.obtainedMarks / item.maxMarks) * 100 : 0),
                    0
                  ) / bAssess.length
                )}%`
              : '0%';
          const crs = courseMap.get(b.courseId);
          return [
            crs?.courseCode || b.courseId,
            crs?.titleEn || b.courseId,
            b.batchNumber,
            String(bAssess.length),
            String(passed),
            String(failed),
            passRate,
            avgScore,
          ];
        });
      summary = [{ label: 'Batches Analyzed', value: allRows.length }];
      break;
    }

    case 'assessment_completion': {
      title = 'Assessment Completion Report';
      headers = [
        'Batch #',
        'Course',
        'Trainer',
        'Active / Completed Enrollments',
        'Assessed Enrollments',
        'Pending Assessment',
        'Completion %',
      ];
      allRows = filteredBatches
        .filter((b) => inDateRange(b.startDate, from, to))
        .map((b) => {
          const bEnr = filteredEnrollments.filter(
            (e) => e.batchId === b.id && ['confirmed', 'in_progress', 'completed'].includes(e.status)
          );
          const assessedCount = bEnr.filter((e) => (assessByEnrollment.get(e.id) || []).length > 0).length;
          const pendingCount = Math.max(0, bEnr.length - assessedCount);
          const pct = bEnr.length > 0 ? `${Math.round((assessedCount / bEnr.length) * 100)}%` : '0%';
          return [
            b.batchNumber,
            courseMap.get(b.courseId)?.titleEn || b.courseId,
            trainerMap.get(b.trainerId)?.nameEn || b.trainerId,
            String(bEnr.length),
            String(assessedCount),
            String(pendingCount),
            pct,
          ];
        });
      summary = [{ label: 'Batches Tracked', value: allRows.length }];
      break;
    }

    // -----------------------------------------------------------------------
    // 5. CERTIFICATE REPORTS
    // -----------------------------------------------------------------------
    case 'certificate_issuance': {
      title = 'Issued Certificate Register Report';
      headers = ['Cert #', 'Candidate ID', 'Candidate', 'Course', 'Completion', 'Issue Date', 'Expiry Date', 'Status'];
      allRows = filteredCertificates
        .filter((c) => inDateRange(c.issueDate, from, to))
        .map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.completionDate,
          c.issueDate,
          c.expiryDate || 'No Expiry',
          c.status,
        ]);
      summary = [{ label: 'Certificates Issued', value: allRows.length }];
      break;
    }

    case 'valid_certificates': {
      title = 'Valid Certificates Report';
      headers = ['Cert #', 'Candidate ID', 'Candidate', 'Course', 'Issue Date', 'Expiry Date', 'Status'];
      allRows = filteredCertificates
        .filter(
          (c) =>
            c.status === 'valid' &&
            (!c.expiryDate || c.expiryDate >= today) &&
            inDateRange(c.issueDate, from, to)
        )
        .map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.issueDate,
          c.expiryDate || 'No Expiry',
          'valid',
        ]);
      summary = [{ label: 'Valid Certificates', value: allRows.length }];
      break;
    }

    case 'expired_certificates': {
      title = 'Expired Certificates Report';
      headers = ['Cert #', 'Candidate ID', 'Candidate', 'Course', 'Issue Date', 'Expiry Date', 'Status'];
      allRows = filteredCertificates
        .filter(
          (c) =>
            (c.status === 'expired' || (c.status === 'valid' && c.expiryDate && c.expiryDate < today)) &&
            inDateRange(c.expiryDate || c.issueDate, from, to)
        )
        .map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.issueDate,
          c.expiryDate || '-',
          'expired',
        ]);
      summary = [{ label: 'Expired Certificates', value: allRows.length }];
      break;
    }

    case 'certificate_revocation':
    case 'revoked_certificates': {
      title = 'Revoked Certificates Report';
      headers = ['Cert #', 'Candidate ID', 'Candidate', 'Course', 'Issue Date', 'Revocation Reason', 'Status'];
      allRows = filteredCertificates
        .filter((c) => c.status === 'revoked' && inDateRange(c.issueDate, from, to))
        .map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.issueDate,
          c.revocationReason || '-',
          c.status,
        ]);
      summary = [{ label: 'Revoked Certificates', value: allRows.length }];
      break;
    }

    case 'pending_certificates': {
      title = 'Pending Certificate Issuance Report';
      headers = [
        'Enrollment #',
        'Candidate ID',
        'Candidate',
        'Course',
        'Batch #',
        'Attendance %',
        'Exam / Practical',
        'Trainer Rec',
        'Approval',
        'Eligibility Status',
      ];
      allRows = filteredEnrollments
        .filter(
          (e) =>
            !e.certificateId &&
            !certByEnrollment.has(e.id) &&
            ['confirmed', 'in_progress', 'completed'].includes(e.status) &&
            inDateRange(e.createdAt, from, to)
        )
        .map((e) => {
          const crs = courseMap.get(e.courseId);
          const bth = batchMap.get(e.batchId);
          const cand = candMap.get(e.candidateDocId);
          const elig = computeEnrollmentEligibilitySummary(
            e,
            crs,
            bth,
            attByEnrollment.get(e.id) || [],
            assessByEnrollment.get(e.id) || []
          );
          const examState = elig.examPassed && elig.practicalPassed ? 'Passed' : 'Pending';
          return [
            e.enrollmentNumber,
            e.candidateId,
            cand?.fullNameEn || e.candidateId,
            crs?.titleEn || e.courseId,
            bth?.batchNumber || e.batchId,
            `${elig.attendancePct}% (min ${elig.minAttendancePct}%)`,
            examState,
            e.trainerRecommended ? 'Yes' : 'No',
            e.completionApproved ? 'Yes' : 'No',
            elig.eligible ? 'Eligible — Ready' : elig.reasons[0] || 'Incomplete',
          ];
        });
      summary = [
        { label: 'Pending Issuance Queue', value: allRows.length },
        { label: 'Eligible Now', value: allRows.filter((r) => r[9] === 'Eligible — Ready').length },
      ];
      break;
    }

    case 'certificate_expiry': {
      title = 'Certificate Expiry Tracking Report';
      const horizon = new Date(new Date(`${today}T00:00:00Z`).getTime() + 90 * 86400000)
        .toISOString()
        .slice(0, 10);
      headers = ['Cert #', 'Candidate ID', 'Candidate', 'Course', 'Issue Date', 'Expiry Date', 'Status'];
      allRows = filteredCertificates
        .filter(
          (c) =>
            c.expiryDate &&
            c.expiryDate <= horizon &&
            c.status !== 'revoked' &&
            c.status !== 'superseded' &&
            inDateRange(c.expiryDate, from, to)
        )
        .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''))
        .map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.issueDate,
          c.expiryDate || '-',
          c.expiryDate && c.expiryDate < today ? 'expired' : c.status,
        ]);
      summary = [{ label: 'Expiring / Expired', value: allRows.length }];
      break;
    }

    // -----------------------------------------------------------------------
    // 6. CORPORATE REPORTS
    // -----------------------------------------------------------------------
    case 'org_employees':
    case 'corporate_client': {
      title = 'Organization-Wise Employees Report';
      headers = [
        'Org ID',
        'Company (EN)',
        'CR Number',
        'Contact Person',
        'Mobile',
        'Total Employees',
        'Active Employees',
        'Enrolled',
        'Valid Certificates',
        'Status',
      ];
      allRows = organizations
        .filter((o) => !organizationId || o.id === organizationId)
        .map((o) => {
          const oCands = filteredCandidates.filter((c) => c.organizationId === o.id);
          const oEnr = filteredEnrollments.filter((e) => e.organizationId === o.id);
          const oCerts = filteredCertificates.filter((c) => c.organizationId === o.id && c.status === 'valid');
          return [
            o.organizationId,
            o.nameEn,
            o.crNumber || '-',
            o.contactPerson,
            o.mobile,
            String(oCands.length),
            String(oCands.filter((c) => c.status === 'active').length),
            String(oEnr.length),
            String(oCerts.length),
            o.status,
          ];
        });
      summary = [{ label: 'Organizations', value: allRows.length }];
      break;
    }

    case 'org_training': {
      title = 'Organization-Wise Training Summary Report';
      headers = [
        'Org ID',
        'Company (EN)',
        'Total Enrollments',
        'Active Training',
        'Completed',
        'Failed',
        'Certificates Issued',
        'Expiring <= 60d',
      ];
      const in60 = new Date(new Date(`${today}T00:00:00Z`).getTime() + 60 * 86400000)
        .toISOString()
        .slice(0, 10);
      allRows = organizations
        .filter((o) => !organizationId || o.id === organizationId)
        .map((o) => {
          const oEnr = filteredEnrollments.filter(
            (e) => e.organizationId === o.id && inDateRange(e.createdAt, from, to)
          );
          const oCerts = filteredCertificates.filter(
            (c) => c.organizationId === o.id && inDateRange(c.issueDate, from, to)
          );
          const expCount = certificates.filter(
            (c) =>
              c.organizationId === o.id &&
              c.status === 'valid' &&
              c.expiryDate &&
              c.expiryDate >= today &&
              c.expiryDate <= in60
          ).length;
          return [
            o.organizationId,
            o.nameEn,
            String(oEnr.length),
            String(oEnr.filter((e) => ['pending', 'confirmed', 'in_progress'].includes(e.status)).length),
            String(oEnr.filter((e) => e.status === 'completed').length),
            String(oEnr.filter((e) => e.status === 'failed').length),
            String(oCerts.length),
            String(expCount),
          ];
        });
      summary = [{ label: 'Organizations', value: allRows.length }];
      break;
    }

    case 'corporate_enrollment_history': {
      title = 'Corporate Enrollment History Report';
      headers = [
        'Enrollment #',
        'Organization',
        'Employee ID',
        'Candidate ID',
        'Employee Name',
        'Course',
        'Batch #',
        'Status',
        'Enrolled Date',
      ];
      allRows = filteredEnrollments
        .filter((e) => Boolean(e.organizationId) && inDateRange(e.createdAt, from, to))
        .map((e) => {
          const cand = candMap.get(e.candidateDocId);
          return [
            e.enrollmentNumber,
            (e.organizationId && orgMap.get(e.organizationId)?.nameEn) || e.organizationId || '-',
            cand?.employeeId || '-',
            e.candidateId,
            cand?.fullNameEn || e.candidateId,
            courseMap.get(e.courseId)?.titleEn || e.courseId,
            batchMap.get(e.batchId)?.batchNumber || e.batchId,
            e.status,
            (e.createdAt || '').slice(0, 10),
          ];
        });
      summary = [{ label: 'Corporate Enrollments', value: allRows.length }];
      break;
    }

    case 'upcoming_training_requirements': {
      title = 'Upcoming Training Requirements Report';
      headers = [
        'Candidate ID',
        'Employee Name',
        'Organization / Dept',
        'Requirement Type',
        'Course / Certificate',
        'Due / Expiry Date',
        'Priority / Status',
      ];
      const in90Days = new Date(new Date(`${today}T00:00:00Z`).getTime() + 90 * 86400000)
        .toISOString()
        .slice(0, 10);
      const reqRows: string[][] = [];

      for (const cert of filteredCertificates) {
        if (!cert.expiryDate) continue;
        if (cert.status === 'revoked' || cert.status === 'superseded') continue;
        if (cert.expiryDate <= in90Days) {
          const cand = candMap.get(cert.candidateDocId);
          const isExpired = cert.expiryDate < today;
          reqRows.push([
            cert.candidateId,
            cand?.fullNameEn || cert.snapshot.candidateNameEn,
            cand?.department || cand?.companyName || '-',
            isExpired ? 'Expired Certificate Renewal' : 'Certificate Expiring Soon',
            `${cert.snapshot.courseTitleEn} (${cert.certificateNumber})`,
            cert.expiryDate,
            isExpired ? 'Overdue Renewal' : 'Expiring <= 90d',
          ]);
        }
      }

      for (const enr of filteredEnrollments) {
        if (!['pending', 'confirmed', 'in_progress'].includes(enr.status)) continue;
        const cand = candMap.get(enr.candidateDocId);
        const crs = courseMap.get(enr.courseId);
        const bth = batchMap.get(enr.batchId);
        reqRows.push([
          enr.candidateId,
          cand?.fullNameEn || enr.candidateId,
          cand?.department || cand?.companyName || '-',
          enr.status === 'pending' ? 'Pending Enrollment Confirmation' : 'Scheduled / Active Training',
          crs?.titleEn || enr.courseId,
          bth?.endDate || bth?.startDate || '-',
          enr.status,
        ]);
      }

      const candidatesWithEnrollments = new Set(enrollments.map((e) => e.candidateDocId));
      for (const cand of filteredCandidates) {
        if (cand.status !== 'active') continue;
        if (!candidatesWithEnrollments.has(cand.id)) {
          reqRows.push([
            cand.candidateId,
            cand.fullNameEn,
            cand.department || cand.companyName || '-',
            'Initial Training Assignment Needed',
            'No course enrollment yet',
            cand.registrationDate,
            'Unassigned',
          ]);
        }
      }

      allRows = reqRows;
      summary = [{ label: 'Action Items', value: allRows.length }];
      break;
    }

    // -----------------------------------------------------------------------
    // 7. TRAINING CARDS & SYSTEM AUDIT
    // -----------------------------------------------------------------------
    case 'training_card': {
      title = 'Training Card Issuance Report';
      headers = ['Card Serial', 'Candidate ID', 'Candidate Name', 'Course', 'Batch #', 'Version', 'Status'];
      allRows = cards
        .filter(
          (c) =>
            (!organizationId || c.organizationId === organizationId) &&
            (!courseId || c.courseId === courseId) &&
            (!batchId || c.batchId === batchId) &&
            (!trainerId || matchingTrainerBatchIds?.has(c.batchId)) &&
            inDateRange(c.createdAt, from, to)
        )
        .map((c) => [
          c.cardSerialNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.courseTitleEn,
          c.snapshot.batchNumber,
          `v${c.version}`,
          c.status,
        ]);
      summary = [{ label: 'Cards Listed', value: allRows.length }];
      break;
    }

    case 'user_activity':
    default: {
      title = 'User Activity Audit Report';
      headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Details'];
      allRows = auditLogs
        .filter((l) => inDateRange(l.createdAt, from, to))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 1000)
        .map((l) => [
          (l.createdAt || '').slice(0, 19).replace('T', ' '),
          l.actorEmail || l.actorUid,
          l.actorRole,
          l.action,
          `${l.entityType}:${l.entityId}`,
          l.details || '',
        ]);
      summary = [{ label: 'Audit Events', value: allRows.length }];
      break;
    }
  }

  // Pagination calculation
  const pageSize = Math.min(200, Math.max(10, Number(opts.pageSize || 50)));
  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(opts.page || 1)));
  const startIdx = (page - 1) * pageSize;
  const rows = allRows.slice(startIdx, startIdx + pageSize);

  const filterTags = [
    from || to ? `Date: ${from || '...'} to ${to || '...'}` : '',
    courseId ? `Course: ${courseMap.get(courseId)?.courseCode || courseId}` : '',
    batchId ? `Batch: ${batchMap.get(batchId)?.batchNumber || batchId}` : '',
    trainerId ? `Trainer: ${trainerMap.get(trainerId)?.nameEn || trainerId}` : '',
    organizationId ? `Org: ${orgMap.get(organizationId)?.nameEn || organizationId}` : '',
    candidateStatus ? `Candidate: ${candidateStatus}` : '',
    enrollmentStatus ? `Enrollment: ${enrollmentStatus}` : '',
    certStatus ? `Certificate: ${certStatus}` : '',
  ].filter(Boolean);

  return {
    title,
    subtitle: filterTags.length > 0 ? filterTags.join(' | ') : 'All authorized records',
    headers,
    rows,
    totalRows,
    page,
    pageSize,
    totalPages,
    allRows,
    summary,
  };
}
