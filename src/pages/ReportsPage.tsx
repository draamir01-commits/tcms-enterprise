import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole, isTenantOwnerRole } from '../lib/permissions';
import type { Batch, Course, Organization, Trainer, UserRole } from '../types/tcms';
import { EmptyState, ErrorAlert, TableSkeleton } from '../components/ui/UiKit';

type ReportCategoryKey =
  | 'candidate'
  | 'training'
  | 'attendance'
  | 'assessment'
  | 'certificate'
  | 'corporate'
  | 'system';

interface ReportDefinition {
  key: string;
  category: ReportCategoryKey;
  label: string;
  roles: UserRole[];
}

const REPORT_CATALOG: ReportDefinition[] = [
  // Candidate Reports
  {
    key: 'candidate_registration',
    category: 'candidate',
    label: 'Candidate Register',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'candidate_training_history',
    category: 'candidate',
    label: 'Candidate Training History',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'candidate_enrollment_history',
    category: 'candidate',
    label: 'Candidate Enrollment History',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  // Training Reports
  {
    key: 'course_enrollment',
    category: 'training',
    label: 'Course-Wise Enrollment Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'batch_enrollment',
    category: 'training',
    label: 'Batch-Wise Enrollment Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'trainer_workload',
    category: 'training',
    label: 'Trainer Workload & Activity',
    roles: ['super_admin', 'admin', 'trainer'],
  },
  {
    key: 'course_completion',
    category: 'training',
    label: 'Training Completion Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'course',
    category: 'training',
    label: 'Course Catalogue Summary',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  // Attendance Reports
  {
    key: 'daily_attendance',
    category: 'attendance',
    label: 'Daily Attendance Register',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'batch_attendance',
    category: 'attendance',
    label: 'Batch Attendance Summary',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'candidate_attendance_pct',
    category: 'attendance',
    label: 'Candidate Attendance Percentage',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  // Assessment Reports
  {
    key: 'examination_results',
    category: 'assessment',
    label: 'Examination Results Register',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'pass_fail_analysis',
    category: 'assessment',
    label: 'Pass / Fail Analysis',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  {
    key: 'assessment_completion',
    category: 'assessment',
    label: 'Assessment Completion Tracking',
    roles: ['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client'],
  },
  // Certificate Reports
  {
    key: 'certificate_issuance',
    category: 'certificate',
    label: 'Issued Certificate Register',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'valid_certificates',
    category: 'certificate',
    label: 'Valid Certificates Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'expired_certificates',
    category: 'certificate',
    label: 'Expired Certificates Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'certificate_revocation',
    category: 'certificate',
    label: 'Revoked Certificates Report',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'pending_certificates',
    category: 'certificate',
    label: 'Pending Certificate Issuance Queue',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  {
    key: 'certificate_expiry',
    category: 'certificate',
    label: 'Certificate Expiry Tracking (<= 90d)',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  // Corporate Reports
  {
    key: 'org_employees',
    category: 'corporate',
    label: 'Organization-Wise Employees',
    roles: ['super_admin', 'admin', 'corporate_client'],
  },
  {
    key: 'org_training',
    category: 'corporate',
    label: 'Organization-Wise Training Summary',
    roles: ['super_admin', 'admin', 'corporate_client'],
  },
  {
    key: 'corporate_enrollment_history',
    category: 'corporate',
    label: 'Corporate Enrollment History',
    roles: ['super_admin', 'admin', 'corporate_client'],
  },
  {
    key: 'upcoming_training_requirements',
    category: 'corporate',
    label: 'Upcoming Training Requirements',
    roles: ['super_admin', 'admin', 'certificate_officer', 'corporate_client'],
  },
  // Cards & Audit
  {
    key: 'training_card',
    category: 'system',
    label: 'Training Card Issuance Register',
    roles: ['super_admin', 'admin', 'trainer', 'corporate_client'],
  },
  {
    key: 'user_activity',
    category: 'system',
    label: 'User Activity Audit Report',
    roles: ['super_admin'],
  },
];

const CATEGORIES: ReportCategoryKey[] = [
  'candidate',
  'training',
  'attendance',
  'assessment',
  'certificate',
  'corporate',
  'system',
];

interface ReportApiResponse {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary?: Array<{ label: string; value: string | number }>;
}

export function ReportsPage() {
  const { profile } = useAuth();
  const { t, formatNumber } = useLanguage();
  const role = profile?.role || 'tenant_admin';

  const availableReports = useMemo(
    () =>
      REPORT_CATALOG.filter((r) => {
        if (isTenantOwnerRole(role)) {
          return r.roles.includes('super_admin') || r.roles.includes('tenant_owner');
        }
        if (isTenantAdminRole(role)) {
          return r.roles.includes('admin') || r.roles.includes('tenant_admin');
        }
        return r.roles.includes(role);
      }),
    [role]
  );

  const availableCategories = useMemo(
    () => CATEGORIES.filter((cat) => availableReports.some((r) => r.category === cat)),
    [availableReports]
  );

  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey>(
    availableCategories[0] || 'candidate'
  );
  const categoryReports = useMemo(
    () => availableReports.filter((r) => r.category === selectedCategory),
    [availableReports, selectedCategory]
  );

  const [reportType, setReportType] = useState<string>(availableReports[0]?.key || 'candidate_registration');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [courseId, setCourseId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [candidateStatus, setCandidateStatus] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState('');
  const [certStatus, setCertStatus] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [reportData, setReportData] = useState<ReportApiResponse>({
    title: '',
    headers: [],
    rows: [],
    totalRows: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    summary: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
      apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
      role !== 'corporate_client'
        ? apiFetch<{ trainers: Trainer[] }>('/api/trainers').catch(() => ({ trainers: [] }))
        : Promise.resolve({ trainers: [] }),
      role !== 'corporate_client' && role !== 'trainer'
        ? apiFetch<{ organizations: Organization[] }>('/api/organizations').catch(() => ({ organizations: [] }))
        : Promise.resolve({ organizations: [] }),
    ]).then(([c, b, tr, o]) => {
      setCourses(c.courses);
      setBatches(b.batches);
      setTrainers(tr.trainers);
      setOrganizations(o.organizations);
    });
  }, [role]);

  // Keep reportType synced when category changes
  const handleSelectCategory = (cat: ReportCategoryKey) => {
    setSelectedCategory(cat);
    const first = availableReports.find((r) => r.category === cat);
    if (first) {
      setReportType(first.key);
      setPage(1);
    }
  };

  const resetFilters = () => {
    setFrom('');
    setTo('');
    setCourseId('');
    setBatchId('');
    setTrainerId('');
    setOrganizationId('');
    setCandidateStatus('');
    setEnrollmentStatus('');
    setCertStatus('');
    setPage(1);
  };

  const buildQueryString = useCallback(
    (format: 'json' | 'pdf' | 'xlsx' | 'csv') => {
      const qs = new URLSearchParams({ format });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (courseId) qs.set('courseId', courseId);
      if (batchId) qs.set('batchId', batchId);
      if (trainerId) qs.set('trainerId', trainerId);
      if (organizationId) qs.set('organizationId', organizationId);
      if (candidateStatus) qs.set('candidateStatus', candidateStatus);
      if (enrollmentStatus) qs.set('enrollmentStatus', enrollmentStatus);
      if (certStatus) qs.set('status', certStatus);
      if (format === 'json') {
        qs.set('page', String(page));
        qs.set('pageSize', String(pageSize));
      }
      return qs.toString();
    },
    [
      from,
      to,
      courseId,
      batchId,
      trainerId,
      organizationId,
      candidateStatus,
      enrollmentStatus,
      certStatus,
      page,
      pageSize,
    ]
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ReportApiResponse>(
        `/api/reports/${reportType}?${buildQueryString('json')}`
      );
      setReportData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [reportType, buildQueryString]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const startRow = reportData.totalRows === 0 ? 0 : (reportData.page - 1) * reportData.pageSize + 1;
  const endRow = Math.min(reportData.totalRows, reportData.page * reportData.pageSize);

  return (
    <div className="space-y-5">
      {/* Category Selector + Actions + 8 Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-100">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelectCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t(`repCat_${cat}`)}
            </button>
          ))}
        </div>

        {/* Report Selector & Export Controls */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('repSelectReport')}
            </label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-medium"
            >
              {categoryReports.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('clearFilters')}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadReport()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{t('reset') === 'Reset' ? 'Refresh' : 'تحديث'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadProtectedFile(
                  `/api/reports/${reportType}?${buildQueryString('pdf')}`,
                  `${reportType}_report.pdf`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('exportPdf')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadProtectedFile(
                  `/api/reports/${reportType}?${buildQueryString('xlsx')}`,
                  `${reportType}_report.xlsx`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('exportExcel')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadProtectedFile(
                  `/api/reports/${reportType}?${buildQueryString('csv')}`,
                  `${reportType}_report.csv`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('exportCsv')}</span>
            </button>
          </div>
        </div>

        {/* 8 Granular Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('fromDate')}</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('toDate')}</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterCourse')}</label>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">{t('all')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} · {c.titleEn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterBatch')}</label>
            <select
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">{t('all')}</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber}
                </option>
              ))}
            </select>
          </div>
          {role !== 'corporate_client' && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterTrainer')}</label>
              <select
                value={trainerId}
                onChange={(e) => {
                  setTrainerId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              >
                <option value="">{t('all')}</option>
                {trainers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.nameEn}
                  </option>
                ))}
              </select>
            </div>
          )}
          {role !== 'corporate_client' && role !== 'trainer' && (
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterOrganization')}</label>
              <select
                value={organizationId}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              >
                <option value="">{t('all')}</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nameEn}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterCandidateStatus')}</label>
            <select
              value={candidateStatus}
              onChange={(e) => {
                setCandidateStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">{t('all')}</option>
              <option value="active">{t('status_active')}</option>
              <option value="inactive">{t('status_inactive')}</option>
              <option value="archived">{t('status_archived')}</option>
              <option value="suspended">{t('status_suspended')}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterEnrollmentStatus')}</label>
            <select
              value={enrollmentStatus}
              onChange={(e) => {
                setEnrollmentStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">{t('all')}</option>
              <option value="pending">{t('status_pending')}</option>
              <option value="confirmed">{t('status_confirmed')}</option>
              <option value="in_progress">{t('status_in_progress')}</option>
              <option value="completed">{t('status_completed')}</option>
              <option value="failed">{t('status_failed')}</option>
              <option value="cancelled">{t('status_cancelled')}</option>
              <option value="withdrawn">{t('status_withdrawn')}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t('repFilterCertStatus')}</label>
            <select
              value={certStatus}
              onChange={(e) => {
                setCertStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            >
              <option value="">{t('all')}</option>
              <option value="valid">{t('status_valid')}</option>
              <option value="expired">{t('status_expired')}</option>
              <option value="revoked">{t('status_revoked')}</option>
              <option value="superseded">{t('status_superseded')}</option>
            </select>
          </div>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : reportData.rows.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description="Adjust the report filters or add training records to generate report data."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Table Header & Summary Metrics */}
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{reportData.title}</h3>
              {reportData.subtitle && (
                <p className="text-[11px] text-slate-500 mt-0.5">{reportData.subtitle}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {reportData.summary?.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="text-slate-500">{s.label}:</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  {reportData.headers.map((h, i) => (
                    <th key={i} className="py-2.5 px-4 text-start whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {reportData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2 px-4 text-slate-700 whitespace-nowrap font-mono-tabular">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Footer */}
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-600 font-mono-tabular">
              {t('repShowingRows')} {formatNumber(startRow)}–{formatNumber(endRow)} {t('repOf')}{' '}
              {formatNumber(reportData.totalRows)}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t('repPageSize')}:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 text-xs border border-slate-200 rounded bg-white font-mono-tabular"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={reportData.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t('repPrevPage')}</span>
                </button>
                <span className="px-2 font-mono-tabular text-slate-700">
                  {reportData.page} / {reportData.totalPages}
                </span>
                <button
                  type="button"
                  disabled={reportData.page >= reportData.totalPages}
                  onClick={() => setPage((p) => Math.min(reportData.totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <span>{t('repNextPage')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
