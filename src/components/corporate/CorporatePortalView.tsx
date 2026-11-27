import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  ClipboardList,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type {
  AssessmentRecord,
  AttendanceRecord,
  Batch,
  Candidate,
  Certificate,
  Course,
  Enrollment,
  EnrollmentRequest,
  ModuleKey,
  NotificationItem,
  Organization,
  TrainingCard,
} from '../../types/tcms';
import {
  CardSkeleton,
  DataTable,
  EmptyState,
  ErrorAlert,
  Modal,
  NotificationBanner,
  PdfPreviewModal,
  SearchFilterBar,
  SelectInput,
  StatusText,
  SuccessAlert,
  TableSkeleton,
} from '../ui/UiKit';
import { CandidateFormModal } from '../candidates/CandidateFormModal';
import { CandidateProfileView } from '../candidates/CandidateProfileView';
import { ExcelImportExportPage } from '../../pages/ExcelImportExportPage';
import { EnrollmentRequestModal } from './EnrollmentRequestModal';

interface CorporatePortalViewProps {
  organizationId?: string;
  onBack?: () => void;
  onNavigate?: (m: ModuleKey) => void;
}

interface CorporateDashboardResponse {
  organization: Organization | null;
  permissions: {
    canViewAttendance: boolean;
    canViewAssessments: boolean;
    canViewCards: boolean;
    canViewCertificates: boolean;
    canViewReports: boolean;
  };
  kpis: {
    totalRegisteredEmployees: number;
    activeEnrollments: number;
    upcomingTrainingBatches: number;
    completedCourses: number;
    pendingExaminations: number;
    issuedCertificates: number;
    expiringCertificates: number;
    pendingRequests: number;
  };
  upcomingBatches: Array<Batch & { orgEnrolledCount: number }>;
  expiringCertificatesList: Certificate[];
}

type PortalTab =
  | 'overview'
  | 'profile'
  | 'employees'
  | 'courses'
  | 'requests'
  | 'attendance_results'
  | 'cards_certs'
  | 'reports_notifs';

export function CorporatePortalView({
  organizationId,
  onBack,
}: CorporatePortalViewProps) {
  const { profile } = useAuth();
  const { lang, dir, t, formatDate, formatNumber } = useLanguage();

  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<CorporateDashboardResponse | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [cards, setCards] = useState<TrainingCard[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Employee management state
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [empFormOpen, setEmpFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Candidate | null>(null);
  const [viewingCandidateId, setViewingCandidateId] = useState<string | null>(null);
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  // Enrollment Request modal state
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<EnrollmentRequest | null>(null);
  const [prefillCourseId, setPrefillCourseId] = useState('');
  const [prefillBatchId, setPrefillBatchId] = useState('');

  // PDF Preview state
  const [previewPdf, setPreviewPdf] = useState<{ fileId: string; title: string } | null>(null);

  // Organization Reports state
  const [reportType, setReportType] = useState<string>('employee_training_history');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportHeaders, setReportHeaders] = useState<string[]>([]);
  const [reportRows, setReportRows] = useState<string[][]>([]);

  const effectiveOrgId = organizationId || profile?.organizationId || '';
  const isCorporateUser = profile?.role === 'corporate_client';

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgQuery = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
      const dash = await apiFetch<CorporateDashboardResponse>(`/api/corporate/dashboard${orgQuery}`);
      setDashboard(dash);

      const resolvedOrgId = dash.organization?.id || effectiveOrgId;
      if (!resolvedOrgId) {
        setLoading(false);
        return;
      }

      const [
        candRes,
        courseRes,
        batchRes,
        reqRes,
        enrRes,
        cardRes,
        certRes,
        notifRes,
      ] = await Promise.all([
        apiFetch<{ candidates: Candidate[] }>(`/api/candidates?organizationId=${encodeURIComponent(resolvedOrgId)}`),
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ batches: Batch[] }>('/api/batches'),
        apiFetch<{ requests: EnrollmentRequest[] }>(
          `/api/enrollment-requests?organizationId=${encodeURIComponent(resolvedOrgId)}`
        ),
        apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments'),
        dash.permissions.canViewCards
          ? apiFetch<{ trainingCards: TrainingCard[] }>('/api/training-cards').catch(() => ({ trainingCards: [] }))
          : Promise.resolve({ trainingCards: [] }),
        dash.permissions.canViewCertificates
          ? apiFetch<{ certificates: Certificate[] }>('/api/certificates').catch(() => ({ certificates: [] }))
          : Promise.resolve({ certificates: [] }),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications').catch(() => ({ notifications: [] })),
      ]);

      setCandidates(candRes.candidates.filter((c) => c.organizationId === resolvedOrgId));
      setCourses(courseRes.courses);
      setBatches(batchRes.batches);
      setRequests(reqRes.requests.filter((r) => r.organizationId === resolvedOrgId));
      setEnrollments(enrRes.enrollments.filter((e) => e.organizationId === resolvedOrgId));
      setCards(cardRes.trainingCards.filter((c) => c.organizationId === resolvedOrgId));
      setCertificates(certRes.certificates.filter((c) => c.organizationId === resolvedOrgId));
      setNotifications(
        notifRes.notifications.filter(
          (n) => !n.organizationId || n.organizationId === resolvedOrgId
        )
      );

      // Permission-gated endpoints (only query when authorized)
      if (dash.permissions.canViewAttendance) {
        const attRes = await apiFetch<{ attendance: AttendanceRecord[] }>('/api/attendance').catch(() => ({
          attendance: [],
        }));
        setAttendance(attRes.attendance.filter((a) => a.organizationId === resolvedOrgId));
      } else {
        setAttendance([]);
      }

      if (dash.permissions.canViewAssessments) {
        const assRes = await apiFetch<{ assessments: AssessmentRecord[] }>('/api/assessments').catch(() => ({
          assessments: [],
        }));
        setAssessments(assRes.assessments.filter((a) => a.organizationId === resolvedOrgId));
      } else {
        setAssessments([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId, effectiveOrgId]);

  useEffect(() => {
    void loadPortalData();
  }, [loadPortalData]);

  const availableOrgReports = useMemo(() => {
    const perms = dashboard?.permissions;
    const list = [
      { key: 'employee_training_history', label: lang === 'ar' ? 'سجل تدريب الموظفين' : 'Employee Training History Report', allowed: true },
      { key: 'upcoming_training_requirements', label: lang === 'ar' ? 'متطلبات التدريب والتجديد القادمة' : 'Upcoming Training Requirements Report', allowed: true },
      { key: 'enrollment', label: lang === 'ar' ? 'تقرير تسجيل الدورات' : 'Course Participation & Enrollment Report', allowed: true },
      { key: 'attendance', label: lang === 'ar' ? 'تقرير الحضور' : 'Attendance Report', allowed: Boolean(perms?.canViewAttendance) },
      { key: 'examination', label: lang === 'ar' ? 'تقرير نتائج الاختبارات' : 'Examination Results Report', allowed: Boolean(perms?.canViewAssessments) },
      { key: 'certificate_issuance', label: lang === 'ar' ? 'تقرير الشهادات الصادرة' : 'Certificate Issuance Report', allowed: Boolean(perms?.canViewCertificates) },
      { key: 'certificate_expiry', label: lang === 'ar' ? 'تقرير الشهادات القريبة من الانتهاء' : 'Certificate Expiry Report', allowed: Boolean(perms?.canViewCertificates) },
    ];
    return list.filter((r) => r.allowed);
  }, [dashboard?.permissions, lang]);

  const loadOrgReport = useCallback(async () => {
    if (!dashboard?.organization?.id || !dashboard.permissions.canViewReports) return;
    setReportLoading(true);
    try {
      const qs = new URLSearchParams({
        format: 'json',
        organizationId: dashboard.organization.id,
      });
      const res = await apiFetch<{ title: string; headers: string[]; rows: string[][] }>(
        `/api/reports/${reportType}?${qs.toString()}`
      );
      setReportTitle(res.title);
      setReportHeaders(res.headers);
      setReportRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }, [dashboard?.organization?.id, dashboard?.permissions.canViewReports, reportType]);

  useEffect(() => {
    if (activeTab === 'reports_notifs') {
      void loadOrgReport();
    }
  }, [activeTab, loadOrgReport]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.candidateId.toLowerCase().includes(q) ||
        c.fullNameEn.toLowerCase().includes(q) ||
        c.fullNameAr.toLowerCase().includes(q) ||
        (c.employeeId || '').toLowerCase().includes(q) ||
        (c.jobTitle || '').toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q)
    );
  }, [candidates, employeeSearch]);

  const infoRequestedList = useMemo(
    () => requests.filter((r) => r.status === 'info_requested'),
    [requests]
  );

  const singleOrgList = useMemo(
    () => (dashboard?.organization ? [dashboard.organization] : []),
    [dashboard?.organization]
  );

  const openRequestModal = (courseId = '', batchId = '', editReq: EnrollmentRequest | null = null) => {
    setEditingRequest(editReq);
    setPrefillCourseId(courseId);
    setPrefillBatchId(batchId);
    setReqModalOpen(true);
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="space-y-6">
        <CardSkeleton count={4} />
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  const org = dashboard?.organization;

  if (!org) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {dir === 'rtl' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{t('backToOrganizations')}</span>
          </button>
        )}
        <EmptyState
          title={t('noOrganizationAssignedTitle')}
          description={t('noOrganizationAssignedDesc')}
        />
      </div>
    );
  }

  const kpis = dashboard.kpis;
  const kpiCards = [
    { label: t('corpKpiTotalEmployees'), value: kpis.totalRegisteredEmployees },
    { label: t('corpKpiActiveEnrollments'), value: kpis.activeEnrollments },
    { label: t('corpKpiUpcomingBatches'), value: kpis.upcomingTrainingBatches },
    { label: t('corpKpiCompletedCourses'), value: kpis.completedCourses },
    { label: t('corpKpiPendingExams'), value: kpis.pendingExaminations },
    { label: t('corpKpiIssuedCerts'), value: kpis.issuedCertificates },
    { label: t('corpKpiExpiringCerts'), value: kpis.expiringCertificates, warn: kpis.expiringCertificates > 0 },
  ];

  const tabs: Array<{ key: PortalTab; label: string }> = [
    { key: 'overview', label: t('corpTabOverview') },
    { key: 'profile', label: t('corpTabProfile') },
    { key: 'employees', label: t('corpTabEmployees') },
    { key: 'courses', label: t('corpTabCoursesBatches') },
    { key: 'requests', label: t('corpTabRequestsTracking') },
    { key: 'attendance_results', label: t('corpTabAttendanceResults') },
    { key: 'cards_certs', label: t('corpTabCardsCerts') },
    { key: 'reports_notifs', label: t('corpTabReportsNotifs') },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {dir === 'rtl' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
          <span>{t('backToOrganizations')}</span>
        </button>
      )}

      {/* Portal Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('corporateClientPortal')}
            </span>
            <span className="text-xs font-mono-tabular font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
              {org.organizationId}
            </span>
            <StatusText status={org.status} />
          </div>
          <h2 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{lang === 'ar' ? `${org.nameAr} — ${org.nameEn}` : `${org.nameEn} (${org.nameAr})`}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {org.crNumber && <span className="font-mono-tabular">CR: {org.crNumber}</span>}
            {org.vatNumber && <span className="font-mono-tabular">VAT: {org.vatNumber}</span>}
            {org.city && <span>{org.city}</span>}
            <span>{org.contactPerson}{org.contactDesignation ? ` (${org.contactDesignation})` : ''}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingEmployee(null);
              setEmpFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('registerEmployee')}</span>
          </button>

          <button
            type="button"
            onClick={() => setExcelModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('excelBulkUpload')}</span>
          </button>

          <button
            type="button"
            onClick={() => openRequestModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>{t('requestEnrollment')}</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      <SuccessAlert message={successMsg} onDismiss={() => setSuccessMsg(null)} />

      {/* Actionable Alert for Missing Info Requests */}
      {infoRequestedList.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{t('missingInfoActionAlert')}</p>
              <p className="text-amber-900 mt-0.5">
                {infoRequestedList[0].requestNumber}: {infoRequestedList[0].missingInfoNotes}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openRequestModal('', '', infoRequestedList[0])}
            className="px-3 py-1.5 text-xs font-medium bg-amber-700 text-white rounded-md hover:bg-amber-800 shrink-0"
          >
            {t('respondAction')}
          </button>
        </div>
      )}

      {/* 7 Prompt-3 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpiCards.map((k, idx) => (
          <div
            key={idx}
            className={`bg-white border rounded-lg p-4 ${
              k.warn ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
            }`}
          >
            <p className="text-[11px] text-slate-500 leading-snug">{k.label}</p>
            <p className="mt-1.5 text-2xl font-bold font-mono-tabular text-slate-900">
              {formatNumber(k.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Portal Tabs */}
      <div className="border-b border-slate-200 flex overflow-x-auto gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Training Batches */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">{t('upcomingBatches')}</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('courses')}
                  className="text-[11px] text-slate-600 hover:text-slate-900 underline"
                >
                  {t('view')}
                </button>
              </div>
              {dashboard.upcomingBatches.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">{t('noRecords')}</div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {dashboard.upcomingBatches.slice(0, 6).map((b) => {
                    const crs = courseMap.get(b.courseId);
                    const openSeats = Math.max(0, b.capacity - b.enrollmentCount);
                    return (
                      <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                            {b.batchNumber} · {b.startDate} → {b.endDate} · {t('enrolledFromOrg')}: {b.orgEnrolledCount}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRequestModal(b.courseId, b.id)}
                          className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50 shrink-0"
                        >
                          {openSeats} {t('openSeats')} · +
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Enrollment Requests */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">{t('enrollmentRequestsQueue')}</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('requests')}
                  className="text-[11px] text-slate-600 hover:text-slate-900 underline"
                >
                  {t('view')}
                </button>
              </div>
              {requests.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">{t('noRecords')}</div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {requests.slice(0, 6).map((r) => {
                    const crs = courseMap.get(r.courseId);
                    return (
                      <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tabular font-semibold text-slate-900">{r.requestNumber}</span>
                            <StatusText status={r.status} />
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : r.courseId} · {r.candidateDocIds.length}{' '}
                            {t('employeesCount')}
                          </div>
                        </div>
                        {r.status === 'info_requested' && (
                          <button
                            type="button"
                            onClick={() => openRequestModal('', '', r)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-amber-600 text-white rounded hover:bg-amber-700 shrink-0"
                          >
                            {t('respondAction')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Expiring Certificates Alert Table */}
          {dashboard.permissions.canViewCertificates && dashboard.expiringCertificatesList.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-200 bg-amber-50/50">
                <h3 className="text-xs font-semibold text-amber-950">{t('corpKpiExpiringCerts')}</h3>
              </div>
              <DataTable
                rows={dashboard.expiringCertificatesList}
                rowKey={(c) => c.id}
                columns={[
                  {
                    key: 'number',
                    header: t('nav_certificates'),
                    render: (c) => <span className="font-mono-tabular font-semibold">{c.certificateNumber}</span>,
                  },
                  {
                    key: 'employee',
                    header: t('employeesCount'),
                    render: (c) =>
                      lang === 'ar' ? c.snapshot.candidateNameAr || c.snapshot.candidateNameEn : c.snapshot.candidateNameEn,
                  },
                  {
                    key: 'course',
                    header: t('targetCourse'),
                    render: (c) =>
                      lang === 'ar' ? c.snapshot.courseTitleAr || c.snapshot.courseTitleEn : c.snapshot.courseTitleEn,
                  },
                  {
                    key: 'expiry',
                    header: t('toDate'),
                    render: (c) => <span className="font-mono-tabular text-amber-800 font-semibold">{c.expiryDate || '—'}</span>,
                  },
                  {
                    key: 'action',
                    header: t('actions'),
                    align: 'end',
                    render: (c) => (
                      <button
                        type="button"
                        onClick={() => openRequestModal(c.courseId)}
                        className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                      >
                        {t('requestEnrollment')}
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Organization Profile */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
            <div>
              <span className="text-slate-500">{t('organizationId')}</span>
              <p className="mt-1 font-mono-tabular font-semibold text-slate-900">{org.organizationId}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('companyNameEn')}</span>
              <p className="mt-1 font-medium text-slate-900">{org.nameEn}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('companyNameAr')}</span>
              <p className="mt-1 font-medium text-slate-900" dir="rtl">{org.nameAr}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('crNumber')}</span>
              <p className="mt-1 font-mono-tabular text-slate-800">{org.crNumber || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('vatNumber')}</span>
              <p className="mt-1 font-mono-tabular text-slate-800">{org.vatNumber || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('status')}</span>
              <div className="mt-1"><StatusText status={org.status} /></div>
            </div>
            <div>
              <span className="text-slate-500">{t('contactPerson')}</span>
              <p className="mt-1 font-medium text-slate-900">{org.contactPerson}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('contactDesignation')}</span>
              <p className="mt-1 text-slate-800">{org.contactDesignation || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('mobileNumber')}</span>
              <p className="mt-1 font-mono-tabular text-slate-800">{org.mobile}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('emailAddress')}</span>
              <p className="mt-1 text-slate-800">{org.email}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('city')}</span>
              <p className="mt-1 text-slate-800">{org.city || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">{t('address')}</span>
              <p className="mt-1 text-slate-800">{org.address || '—'}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500">{t('billingInfo')}</span>
                <p className="mt-1 text-slate-800 whitespace-pre-line">{org.billingInfo || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">{t('notes')}</span>
                <p className="mt-1 text-slate-800 whitespace-pre-line">{org.notes || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Employees */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <SearchFilterBar
            searchValue={employeeSearch}
            onSearchChange={setEmployeeSearch}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setExcelModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{t('excelBulkUpload')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEmployee(null);
                    setEmpFormOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('registerEmployee')}</span>
                </button>
              </>
            }
          />

          <DataTable
            rows={filteredEmployees}
            rowKey={(c) => c.id}
            emptyActionLabel={t('registerEmployee')}
            onEmptyAction={() => {
              setEditingEmployee(null);
              setEmpFormOpen(true);
            }}
            columns={[
              {
                key: 'candidateId',
                header: t('candidateId'),
                render: (c) => <span className="font-mono-tabular font-semibold text-slate-900">{c.candidateId}</span>,
              },
              {
                key: 'name',
                header: t('fullNameEn'),
                render: (c) => (
                  <div>
                    <div className="font-medium text-slate-900">{c.fullNameEn}</div>
                    <div className="text-[11px] text-slate-500">{c.fullNameAr}</div>
                  </div>
                ),
              },
              {
                key: 'employeeId',
                header: t('employeeId'),
                render: (c) => <span className="font-mono-tabular">{c.employeeId || '—'}</span>,
              },
              {
                key: 'jobTitle',
                header: t('jobTitle'),
                render: (c) => (
                  <div>
                    <div>{c.jobTitle || '—'}</div>
                    {c.department && <div className="text-[11px] text-slate-500">{c.department}</div>}
                  </div>
                ),
              },
              {
                key: 'iqama',
                header: t('iqamaNumber'),
                render: (c) => <span className="font-mono-tabular">{c.iqamaMasked || c.passportMasked || '—'}</span>,
              },
              {
                key: 'mobile',
                header: t('mobileNumber'),
                render: (c) => <span className="font-mono-tabular">{c.mobile}</span>,
              },
              {
                key: 'status',
                header: t('status'),
                render: (c) => <StatusText status={c.status} />,
              },
              {
                key: 'actions',
                header: t('actions'),
                align: 'end',
                render: (c) => (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingCandidateId(c.id)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      title={t('view')}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmployee(c);
                        setEmpFormOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      title={t('edit')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Tab 4: Courses & Upcoming Batches */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('availableCourses')}
            </h3>
            <DataTable
              rows={courses.filter((c) => c.status === 'active')}
              rowKey={(c) => c.id}
              columns={[
                {
                  key: 'code',
                  header: t('targetCourse'),
                  render: (c) => <span className="font-mono-tabular font-semibold">{c.courseCode}</span>,
                },
                {
                  key: 'title',
                  header: t('fullNameEn'),
                  render: (c) => (
                    <div>
                      <div className="font-medium text-slate-900">{c.titleEn}</div>
                      <div className="text-[11px] text-slate-500">{c.titleAr}</div>
                    </div>
                  ),
                },
                {
                  key: 'category',
                  header: t('nav_courses'),
                  render: (c) => c.category,
                },
                {
                  key: 'duration',
                  header: t('filterCourse'),
                  render: (c) => (
                    <span className="font-mono-tabular">
                      {c.duration} {c.durationUnit}
                    </span>
                  ),
                },
                {
                  key: 'rules',
                  header: t('nav_assessments'),
                  render: (c) => (
                    <span className="text-[11px] font-mono-tabular text-slate-600">
                      Att ≥ {c.minAttendancePct}%{c.examRequired ? ` · Exam ≥ ${c.minExamScore}%` : ''}
                    </span>
                  ),
                },
                {
                  key: 'action',
                  header: t('actions'),
                  align: 'end',
                  render: (c) => (
                    <button
                      type="button"
                      onClick={() => openRequestModal(c.id)}
                      className="px-3 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                    >
                      {t('requestEnrollment')}
                    </button>
                  ),
                },
              ]}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('upcomingBatches')}
            </h3>
            <DataTable
              rows={dashboard.upcomingBatches}
              rowKey={(b) => b.id}
              columns={[
                {
                  key: 'batch',
                  header: t('nav_batches'),
                  render: (b) => <span className="font-mono-tabular font-semibold">{b.batchNumber}</span>,
                },
                {
                  key: 'course',
                  header: t('targetCourse'),
                  render: (b) => {
                    const crs = courseMap.get(b.courseId);
                    return crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : b.courseId;
                  },
                },
                {
                  key: 'dates',
                  header: t('fromDate'),
                  render: (b) => (
                    <span className="font-mono-tabular">
                      {b.startDate} → {b.endDate}
                    </span>
                  ),
                },
                {
                  key: 'venue',
                  header: t('address'),
                  render: (b) => b.venue,
                },
                {
                  key: 'seats',
                  header: t('openSeats'),
                  render: (b) => (
                    <span className="font-mono-tabular">
                      {Math.max(0, b.capacity - b.enrollmentCount)} / {b.capacity}
                    </span>
                  ),
                },
                {
                  key: 'orgCount',
                  header: t('enrolledFromOrg'),
                  render: (b) => <span className="font-mono-tabular font-semibold">{b.orgEnrolledCount}</span>,
                },
                {
                  key: 'action',
                  header: t('actions'),
                  align: 'end',
                  render: (b) => (
                    <button
                      type="button"
                      onClick={() => openRequestModal(b.courseId, b.id)}
                      className="px-3 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                    >
                      {t('requestEnrollment')}
                    </button>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Tab 5: Enrollment Requests & Live Employee Tracking */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('enrollmentRequestsQueue')}
            </h3>
            <button
              type="button"
              onClick={() => openRequestModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('requestEnrollment')}</span>
            </button>
          </div>

          <DataTable
            rows={requests}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'number',
                header: t('requestNumber'),
                render: (r) => <span className="font-mono-tabular font-semibold">{r.requestNumber}</span>,
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
                key: 'reviewer',
                header: t('reviewedBy'),
                render: (r) => (
                  <div className="text-[11px]">
                    <div>{r.reviewedByName || '—'}</div>
                    {r.decisionDate && <div className="font-mono-tabular text-slate-500">{formatDate(r.decisionDate)}</div>}
                  </div>
                ),
              },
              {
                key: 'remarks',
                header: t('decisionReason'),
                render: (r) => (
                  <span className="text-[11px] text-slate-600">
                    {r.status === 'info_requested'
                      ? r.missingInfoNotes
                      : r.decisionReason || r.requestNotes || '—'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: t('actions'),
                align: 'end',
                render: (r) =>
                  r.status === 'info_requested' ? (
                    <button
                      type="button"
                      onClick={() => openRequestModal('', '', r)}
                      className="px-2.5 py-1 text-[11px] font-medium bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      {t('respondAction')}
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  ),
              },
            ]}
          />

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('nav_enrollments')}
            </h3>
            <DataTable
              rows={enrollments}
              rowKey={(e) => e.id}
              columns={[
                {
                  key: 'enr',
                  header: t('nav_enrollments'),
                  render: (e) => <span className="font-mono-tabular font-semibold">{e.enrollmentNumber}</span>,
                },
                {
                  key: 'emp',
                  header: t('employeesCount'),
                  render: (e) => {
                    const c = candMap.get(e.candidateDocId);
                    return (
                      <div>
                        <div className="font-medium text-slate-900">
                          {c ? (lang === 'ar' ? c.fullNameAr || c.fullNameEn : c.fullNameEn) : e.candidateId}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">{e.candidateId}</div>
                      </div>
                    );
                  },
                },
                {
                  key: 'course',
                  header: t('targetCourse'),
                  render: (e) => {
                    const crs = courseMap.get(e.courseId);
                    return crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : e.courseId;
                  },
                },
                {
                  key: 'batch',
                  header: t('nav_batches'),
                  render: (e) => (
                    <span className="font-mono-tabular">{batchMap.get(e.batchId)?.batchNumber || e.batchId}</span>
                  ),
                },
                {
                  key: 'status',
                  header: t('status'),
                  render: (e) => <StatusText status={e.status} />,
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Tab 6: Permission-Gated Attendance & Exam Results */}
      {activeTab === 'attendance_results' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('nav_attendance')}
            </h3>
            {!dashboard.permissions.canViewAttendance ? (
              <div className="flex items-center gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{t('attendanceRestrictedNotice')}</span>
              </div>
            ) : (
              <DataTable
                rows={attendance}
                rowKey={(a) => a.id}
                columns={[
                  {
                    key: 'date',
                    header: t('fromDate'),
                    render: (a) => <span className="font-mono-tabular">{a.date}</span>,
                  },
                  {
                    key: 'emp',
                    header: t('employeesCount'),
                    render: (a) => {
                      const c = candMap.get(a.candidateDocId);
                      return c ? `${c.candidateId} — ${lang === 'ar' ? c.fullNameAr : c.fullNameEn}` : a.candidateDocId;
                    },
                  },
                  {
                    key: 'batch',
                    header: t('nav_batches'),
                    render: (a) => (
                      <span className="font-mono-tabular">{batchMap.get(a.batchId)?.batchNumber || a.batchId}</span>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('status'),
                    render: (a) => <StatusText status={a.status} />,
                  },
                  {
                    key: 'remarks',
                    header: t('notes'),
                    render: (a) => a.remarks || '—',
                  },
                ]}
              />
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('nav_assessments')}
            </h3>
            {!dashboard.permissions.canViewAssessments ? (
              <div className="flex items-center gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{t('assessmentsRestrictedNotice')}</span>
              </div>
            ) : (
              <DataTable
                rows={assessments}
                rowKey={(a) => a.id}
                columns={[
                  {
                    key: 'date',
                    header: t('fromDate'),
                    render: (a) => <span className="font-mono-tabular">{a.assessmentDate}</span>,
                  },
                  {
                    key: 'emp',
                    header: t('employeesCount'),
                    render: (a) => {
                      const c = candMap.get(a.candidateDocId);
                      return c ? `${c.candidateId} — ${lang === 'ar' ? c.fullNameAr : c.fullNameEn}` : a.candidateDocId;
                    },
                  },
                  {
                    key: 'course',
                    header: t('targetCourse'),
                    render: (a) => {
                      const crs = courseMap.get(a.courseId);
                      return crs ? (lang === 'ar' ? crs.titleAr : crs.titleEn) : a.courseId;
                    },
                  },
                  {
                    key: 'type',
                    header: t('nav_assessments'),
                    render: (a) => a.assessmentType,
                  },
                  {
                    key: 'score',
                    header: 'Score',
                    render: (a) => (
                      <span className="font-mono-tabular">
                        {a.obtainedMarks} / {a.maxMarks}
                      </span>
                    ),
                  },
                  {
                    key: 'result',
                    header: t('status'),
                    render: (a) => <StatusText status={a.result} />,
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Approved Training Cards & Certificates */}
      {activeTab === 'cards_certs' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('nav_training_cards')}
            </h3>
            <DataTable
              rows={cards}
              rowKey={(c) => c.id}
              columns={[
                {
                  key: 'serial',
                  header: t('nav_training_cards'),
                  render: (c) => <span className="font-mono-tabular font-semibold">{c.cardSerialNumber}</span>,
                },
                {
                  key: 'emp',
                  header: t('employeesCount'),
                  render: (c) =>
                    lang === 'ar' ? c.snapshot.candidateNameAr || c.snapshot.candidateNameEn : c.snapshot.candidateNameEn,
                },
                {
                  key: 'course',
                  header: t('targetCourse'),
                  render: (c) =>
                    lang === 'ar' ? c.snapshot.courseTitleAr || c.snapshot.courseTitleEn : c.snapshot.courseTitleEn,
                },
                {
                  key: 'batch',
                  header: t('nav_batches'),
                  render: (c) => <span className="font-mono-tabular">{c.snapshot.batchNumber}</span>,
                },
                {
                  key: 'status',
                  header: t('status'),
                  render: (c) => <StatusText status={c.status} />,
                },
                {
                  key: 'actions',
                  header: t('actions'),
                  align: 'end',
                  render: (c) => (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPdf({
                            fileId: c.pdfFileId,
                            title: `${c.cardSerialNumber} - ${c.snapshot.candidateNameEn}`,
                          })
                        }
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('previewFile')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(
                            `/api/files/${encodeURIComponent(c.pdfFileId)}`,
                            `${c.cardSerialNumber}.pdf`
                          )
                        }
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('downloadPdf')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              {t('nav_certificates')}
            </h3>
            <DataTable
              rows={certificates}
              rowKey={(c) => c.id}
              columns={[
                {
                  key: 'num',
                  header: t('nav_certificates'),
                  render: (c) => <span className="font-mono-tabular font-semibold">{c.certificateNumber}</span>,
                },
                {
                  key: 'emp',
                  header: t('employeesCount'),
                  render: (c) =>
                    lang === 'ar' ? c.snapshot.candidateNameAr || c.snapshot.candidateNameEn : c.snapshot.candidateNameEn,
                },
                {
                  key: 'course',
                  header: t('targetCourse'),
                  render: (c) =>
                    lang === 'ar' ? c.snapshot.courseTitleAr || c.snapshot.courseTitleEn : c.snapshot.courseTitleEn,
                },
                {
                  key: 'dates',
                  header: t('fromDate'),
                  render: (c) => {
                    const isExpiring =
                      c.status === 'valid' && Boolean(c.expiryDate && c.expiryDate >= today && c.expiryDate <= in60Days);
                    return (
                      <div className="font-mono-tabular text-[11px]">
                        <div>{c.issueDate}</div>
                        {c.expiryDate && (
                          <div className={isExpiring ? 'text-amber-700 font-semibold' : 'text-slate-500'}>
                            Exp: {c.expiryDate}
                          </div>
                        )}
                      </div>
                    );
                  },
                },
                {
                  key: 'status',
                  header: t('status'),
                  render: (c) => <StatusText status={c.status} />,
                },
                {
                  key: 'actions',
                  header: t('actions'),
                  align: 'end',
                  render: (c) => (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPdf({
                            fileId: c.pdfFileId,
                            title: `${c.certificateNumber} - ${c.snapshot.candidateNameEn}`,
                          })
                        }
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('previewFile')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(
                            `/api/files/${encodeURIComponent(c.pdfFileId)}`,
                            `${c.certificateNumber}.pdf`
                          )
                        }
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('downloadPdf')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Tab 8: Organization Reports & Notifications */}
      {activeTab === 'reports_notifs' && (
        <div className="space-y-6">
          {dashboard.permissions.canViewReports ? (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t('orgReportsTitle')}
                  </label>
                  <SelectInput
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                  >
                    {availableOrgReports.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </SelectInput>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadOrgReport()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('reset')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadProtectedFile(
                        `/api/reports/${reportType}?format=pdf&organizationId=${encodeURIComponent(org.id)}`,
                        `${org.organizationId}_${reportType}.pdf`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('exportPdf')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadProtectedFile(
                        `/api/reports/${reportType}?format=xlsx&organizationId=${encodeURIComponent(org.id)}`,
                        `${org.organizationId}_${reportType}.xlsx`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('exportExcel')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadProtectedFile(
                        `/api/reports/${reportType}?format=csv&organizationId=${encodeURIComponent(org.id)}`,
                        `${org.organizationId}_${reportType}.csv`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('exportCsv')}</span>
                  </button>
                </div>
              </div>

              {reportLoading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : reportRows.length === 0 ? (
                <EmptyState title={t('noRecords')} description={reportTitle || t('orgReportsTitle')} />
              ) : (
                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        {reportHeaders.map((h, i) => (
                          <th key={i} className="py-2 px-3 text-start whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {reportRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/70">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="py-2 px-3 text-slate-700 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <NotificationBanner variant="info" message={t('accessDeniedDesc')} />
          )}

          {/* Organization Notifications Feed */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-900">{t('orgNotifications')}</h3>
            </div>
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">{t('noRecords')}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 flex items-start justify-between gap-4 text-xs ${
                      n.read ? 'bg-white' : 'bg-sky-50/40'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900">{lang === 'ar' ? n.titleAr : n.titleEn}</p>
                      <p className="text-slate-600">{lang === 'ar' ? n.bodyAr : n.bodyEn}</p>
                      {n.createdAt && (
                        <p className="text-[11px] font-mono-tabular text-slate-400">{formatDate(n.createdAt)}</p>
                      )}
                    </div>
                    {!n.read && isCorporateUser && (
                      <button
                        type="button"
                        onClick={() => void handleMarkNotificationRead(n.id)}
                        className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50 shrink-0"
                      >
                        {t('markAsRead')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Employee Register / Edit Modal */}
      <CandidateFormModal
        open={empFormOpen}
        editing={editingEmployee}
        organizations={singleOrgList}
        defaultOrganizationId={org.id}
        onClose={() => {
          setEmpFormOpen(false);
          setEditingEmployee(null);
        }}
        onSaved={async () => {
          setSuccessMsg(t('save'));
          await loadPortalData();
        }}
        onResolveViewCandidate={(cand) => {
          setEmpFormOpen(false);
          setViewingCandidateId(cand.id);
        }}
        onResolveEditCandidate={(cand) => {
          setEditingEmployee(cand);
        }}
      />

      {/* Employee Full Profile Modal */}
      <Modal
        open={Boolean(viewingCandidateId)}
        onClose={() => setViewingCandidateId(null)}
        title={t('nav_candidates')}
        maxWidth="max-w-5xl"
      >
        {viewingCandidateId && (
          <CandidateProfileView
            candidateDocId={viewingCandidateId}
            courses={courses}
            batches={batches}
            onBack={() => setViewingCandidateId(null)}
            onEdit={(cand) => {
              setViewingCandidateId(null);
              setEditingEmployee(cand);
              setEmpFormOpen(true);
            }}
            onCandidateChanged={loadPortalData}
          />
        )}
      </Modal>

      {/* Excel Bulk Employee Upload Modal */}
      <Modal
        open={excelModalOpen}
        onClose={() => {
          setExcelModalOpen(false);
          void loadPortalData();
        }}
        title={t('excelBulkUpload')}
        maxWidth="max-w-5xl"
      >
        <ExcelImportExportPage
          defaultOrganizationId={effectiveOrgId}
          defaultImportType="corporate_employees"
          onDataChanged={loadPortalData}
        />
      </Modal>

      {/* Enrollment Request / Respond Modal */}
      <EnrollmentRequestModal
        open={reqModalOpen}
        editingRequest={editingRequest}
        courses={courses}
        batches={batches}
        candidates={candidates}
        initialCourseId={prefillCourseId}
        initialBatchId={prefillBatchId}
        onClose={() => {
          setReqModalOpen(false);
          setEditingRequest(null);
        }}
        onSaved={async (saved) => {
          setSuccessMsg(`${saved.requestNumber} — ${t('status_pending_review')}`);
          await loadPortalData();
        }}
      />

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        fileId={previewPdf?.fileId || null}
        title={previewPdf?.title || ''}
        onClose={() => setPreviewPdf(null)}
      />
    </div>
  );
}
