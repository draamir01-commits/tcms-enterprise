import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type {
  Course,
  ExcelExportDatasetKey,
  ExcelTemplateType,
  ImportJob,
  ImportPreviewRow,
  ImportValidationSummary,
  Organization,
} from '../types/tcms';
import {
  DataTable,
  ErrorAlert,
  NotificationBanner,
  SearchFilterBar,
  SelectInput,
  StatusText,
  TextInput,
} from '../components/ui/UiKit';

interface CommitSummary {
  jobId: string;
  status: string;
  totalRows: number;
  importedCount: number;
  updatedCount?: number;
  duplicateCount: number;
  invalidCount: number;
  skippedCount: number;
  failedCount: number;
  failedRows: Array<{
    rowNumber: number;
    status: string;
    missingFields?: string[];
    formatErrors?: string[];
    duplicateDetails?: Array<{ existingDetails?: string; candidateId?: string; idType?: string }>;
    errors: string[];
    data: Record<string, string>;
  }>;
}

interface ExportCatalogEntry {
  key: ExcelExportDatasetKey;
  allowed: boolean;
  supportsSensitiveUnmask: boolean;
}

export interface ExcelImportExportPageProps {
  defaultOrganizationId?: string;
  defaultImportType?: ExcelTemplateType;
  onDataChanged?: () => void | Promise<void>;
}

const TEMPLATE_GUIDANCE: Record<
  ExcelTemplateType,
  { requiredCols: string[]; optionalCols: string[] }
> = {
  candidates: {
    requiredCols: ['Full Name English', 'Nationality', 'Mobile', 'Iqama OR Passport Number'],
    optionalCols: ['Full Name Arabic', 'Gender', 'Expiry Dates', 'DOB', 'Email', 'Company', 'Employee ID', 'Job Title', 'Department'],
  },
  corporate_employees: {
    requiredCols: ['Full Name English', 'Nationality', 'Mobile', 'Iqama OR Passport Number'],
    optionalCols: ['Full Name Arabic', 'Gender', 'Expiry Dates', 'DOB', 'Email', 'Employee ID', 'Job Title', 'Department', 'Work Location'],
  },
  enrollment_requests: {
    requiredCols: ['Candidate ID (or Iqama/Passport)', 'Course Code'],
    optionalCols: ['Preferred Batch Number', 'Request Notes'],
  },
  enrollments: {
    requiredCols: ['Candidate ID', 'Course Code', 'Batch Number'],
    optionalCols: ['Status (confirmed/pending)', 'Notes'],
  },
  attendance: {
    requiredCols: ['Batch Number', 'Enrollment ID or Candidate ID', 'Attendance Date (YYYY-MM-DD)', 'Attendance Status'],
    optionalCols: ['Remarks', 'Submission Mode (draft/submitted)', 'Correction Reason'],
  },
  courses: {
    requiredCols: ['Course Code', 'Title English', 'Category', 'Duration', 'Duration Unit'],
    optionalCols: ['Title Arabic', 'Course Type', 'Min Attendance %', 'Min Exam Score', 'Fee', 'Validity Months'],
  },
  trainers: {
    requiredCols: ['Name English', 'Mobile', 'Email', 'Specialization'],
    optionalCols: ['Name Arabic', 'Nationality', 'Qualifications', 'Certifications', 'Experience Years', 'Employment Status'],
  },
};

export function ExcelImportExportPage({
  defaultOrganizationId,
  defaultImportType,
  onDataChanged,
}: ExcelImportExportPageProps = {}) {
  const { profile } = useAuth();
  const { t } = useLanguage();

  const role = profile?.role || 'candidate';
  const isCorporate = role === 'corporate_client';
  const isTrainer = role === 'trainer';
  const canImportAny = role !== 'certificate_officer' && role !== 'candidate';

  const availableTypes = useMemo<Array<{ value: ExcelTemplateType; label: string }>>(() => {
    const all: Array<{ value: ExcelTemplateType; label: string }> = [
      { value: 'candidates', label: t('excelTemplate_candidates') },
      { value: 'corporate_employees', label: t('excelTemplate_corporate_employees') },
      { value: 'enrollment_requests', label: t('excelTemplate_enrollment_requests') },
      { value: 'enrollments', label: t('excelTemplate_enrollments') },
      { value: 'attendance', label: t('excelTemplate_attendance') },
      { value: 'courses', label: t('excelTemplate_courses') },
      { value: 'trainers', label: t('excelTemplate_trainers') },
    ];
    if (isCorporate) {
      return all.filter((x) => x.value === 'corporate_employees' || x.value === 'enrollment_requests');
    }
    if (isTrainer) {
      return all.filter((x) => x.value === 'attendance');
    }
    if (role === 'certificate_officer' || role === 'candidate') {
      return [];
    }
    return all;
  }, [isCorporate, isTrainer, role, t]);

  const initialImportType: ExcelTemplateType =
    defaultImportType && availableTypes.some((x) => x.value === defaultImportType)
      ? defaultImportType
      : availableTypes[0]?.value || 'candidates';

  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'history'>(
    canImportAny ? 'import' : 'export'
  );

  // Import state
  const [importType, setImportType] = useState<ExcelTemplateType>(initialImportType);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [organizationId, setOrganizationId] = useState(
    defaultOrganizationId || profile?.organizationId || ''
  );
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [stats, setStats] = useState<ImportValidationSummary | null>(null);
  const [rowFilter, setRowFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid' | 'skipped'>('all');
  const [dirtyEdits, setDirtyEdits] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Export state
  const [exportCatalog, setExportCatalog] = useState<ExportCatalogEntry[]>([]);
  const [canIncludeSensitive, setCanIncludeSensitive] = useState(false);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [exportOrgId, setExportOrgId] = useState(defaultOrganizationId || '');
  const [exportCourseId, setExportCourseId] = useState('');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  // History state
  const [historyJobs, setHistoryJobs] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');

  const loadMetadata = useCallback(async () => {
    try {
      const [orgRes, courseRes, catRes] = await Promise.all([
        role !== 'trainer'
          ? apiFetch<{ organizations: Organization[] }>('/api/organizations').catch(() => ({ organizations: [] }))
          : Promise.resolve({ organizations: [] }),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ datasets: ExportCatalogEntry[]; canIncludeSensitive: boolean }>('/api/excel/exports/catalog').catch(
          () => ({ datasets: [], canIncludeSensitive: false })
        ),
      ]);
      setOrganizations(orgRes.organizations);
      setCourses(courseRes.courses);
      setExportCatalog(catRes.datasets);
      setCanIncludeSensitive(Boolean(catRes.canIncludeSensitive));
    } catch {
      // Handled gracefully
    }
  }, [role]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch<{ jobs: ImportJob[] }>('/api/excel/history');
      setHistoryJobs(res.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetadata();
    void loadHistory();
  }, [loadMetadata, loadHistory]);

  const computeClientStats = useCallback((list: ImportPreviewRow[]): ImportValidationSummary => {
    return {
      totalRows: list.length,
      validRows: list.filter((r) => r.status === 'valid' && !r.skip).length,
      invalidRows: list.filter((r) => r.status === 'invalid').length,
      duplicateRows: list.filter((r) => r.status === 'duplicate').length,
      missingRequiredRows: list.filter((r) => r.missingFields.length > 0).length,
      formatErrorRows: list.filter((r) => r.formatErrors.length > 0).length,
      skippedRows: list.filter((r) => Boolean(r.skip)).length,
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError(null);
    setSummary(null);
    setDirtyEdits(false);
    setRowFilter('all');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('importType', importType);
      const effectiveOrg = isCorporate ? profile?.organizationId || '' : organizationId;
      if (effectiveOrg) fd.append('organizationId', effectiveOrg);

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/excel/parse', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = (await res.json()) as {
        fileName?: string;
        rows?: ImportPreviewRow[];
        stats?: ImportValidationSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Failed to parse spreadsheet');
      const nextRows = data.rows || [];
      setFileName(data.fileName || file.name);
      setRows(nextRows);
      setStats(data.stats || computeClientStats(nextRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const updateRowField = (rowNumber: number, key: string, value: string) => {
    setDirtyEdits(true);
    setRows((prev) =>
      prev.map((r) =>
        r.rowNumber === rowNumber ? { ...r, mapped: { ...r.mapped, [key]: value } } : r
      )
    );
  };

  const toggleRowSkip = (rowNumber: number, skip: boolean) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.rowNumber === rowNumber ? { ...r, skip } : r));
      setStats(computeClientStats(next));
      return next;
    });
  };

  const setDuplicatePolicy = (
    rowNumber: number,
    duplicateAction: 'skip' | 'update',
    explicitUpdateConfirmed: boolean
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rowNumber === rowNumber
          ? {
              ...r,
              duplicateAction,
              explicitUpdateConfirmed: duplicateAction === 'update' ? explicitUpdateConfirmed : false,
            }
          : r
      )
    );
  };

  const handleSkipAllInvalid = () => {
    setRows((prev) => {
      const next = prev.map((r) => (r.status === 'invalid' ? { ...r, skip: true } : r));
      setStats(computeClientStats(next));
      return next;
    });
  };

  const handleRevalidate = async () => {
    if (rows.length === 0) return;
    setRevalidating(true);
    setError(null);
    try {
      const res = await apiFetch<{ rows: ImportPreviewRow[]; stats: ImportValidationSummary }>(
        '/api/excel/revalidate',
        {
          method: 'POST',
          body: JSON.stringify({
            importType,
            organizationId: isCorporate ? profile?.organizationId : organizationId,
            rows,
          }),
        }
      );
      setRows(res.rows);
      setStats(res.stats);
      setDirtyEdits(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevalidating(false);
    }
  };

  const handleCommit = async () => {
    if (rows.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ summary: CommitSummary }>('/api/excel/commit', {
        method: 'POST',
        body: JSON.stringify({
          importType,
          fileName,
          organizationId: isCorporate ? profile?.organizationId : organizationId,
          skipInvalid: true,
          rows,
        }),
      });
      setSummary(res.summary);
      setRows([]);
      setStats(null);
      setDirtyEdits(false);
      await loadHistory();
      if (onDataChanged) await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  };

  const handleCancelImport = async () => {
    if (rows.length === 0) return;
    try {
      await apiFetch('/api/excel/cancel', {
        method: 'POST',
        body: JSON.stringify({
          importType,
          fileName,
          organizationId: isCorporate ? profile?.organizationId : organizationId,
          totalRows: rows.length,
        }),
      });
      await loadHistory();
    } catch {
      // Non-blocking audit record
    } finally {
      setRows([]);
      setStats(null);
      setFileName('');
      setDirtyEdits(false);
    }
  };

  const handleDownloadErrors = async (sourceRows: CommitSummary['failedRows'] | ImportPreviewRow[]) => {
    const payloadRows = sourceRows
      .filter((r) => ('errors' in r ? r.errors.length > 0 || r.status !== 'valid' : true))
      .map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        missingFields: r.missingFields || [],
        formatErrors: r.formatErrors || [],
        duplicateDetails: r.duplicateDetails || [],
        errors: r.errors || [],
        data: 'data' in r ? r.data : r.mapped,
      }));
    if (payloadRows.length === 0) return;
    try {
      await downloadProtectedFile('/api/excel/error-report', 'import_errors_report.xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failedRows: payloadRows }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const triggerExportDownload = async (dataset: ExcelExportDatasetKey, format: 'xlsx' | 'csv') => {
    setError(null);
    try {
      const qs = new URLSearchParams({ format });
      if (exportOrgId && !isCorporate) qs.set('organizationId', exportOrgId);
      if (exportCourseId) qs.set('courseId', exportCourseId);
      if (exportFrom) qs.set('from', exportFrom);
      if (exportTo) qs.set('to', exportTo);
      if (includeSensitive && canIncludeSensitive) qs.set('includeSensitive', 'true');
      await downloadProtectedFile(
        `/api/excel/export/${dataset}?${qs.toString()}`,
        `tcms_${dataset}_${new Date().toISOString().slice(0, 10)}.${format}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const authorizedUpdateCount = rows.filter(
    (r) =>
      !r.skip &&
      r.status === 'duplicate' &&
      r.duplicateAction === 'update' &&
      r.explicitUpdateConfirmed &&
      r.duplicateDetails.some((d) => d.canUpdate)
  ).length;
  const actionableCount = (stats?.validRows || 0) + authorizedUpdateCount;
  const previewProblemRows = rows.filter((r) => r.status === 'invalid' || r.status === 'duplicate');

  const filteredPreviewRows = useMemo(() => {
    if (rowFilter === 'all') return rows;
    if (rowFilter === 'skipped') return rows.filter((r) => Boolean(r.skip));
    if (rowFilter === 'valid') return rows.filter((r) => r.status === 'valid' && !r.skip);
    return rows.filter((r) => r.status === rowFilter);
  }, [rows, rowFilter]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return historyJobs.filter((j) => {
      if (historyTypeFilter && j.importType !== historyTypeFilter) return false;
      if (historyStatusFilter && j.status !== historyStatusFilter) return false;
      if (q) {
        const hay = `${j.jobId} ${j.fileName} ${j.uploadedByName || ''} ${j.uploadedByEmail || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [historyJobs, historySearch, historyTypeFilter, historyStatusFilter]);

  const guidance = TEMPLATE_GUIDANCE[importType];

  return (
    <div className="space-y-6">
      {/* Top Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-md border border-slate-200">
          {canImportAny && (
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'import'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('excelTabBulkImport')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'export'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('excelTabExportCenter')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              void loadHistory();
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t('excelTabImportHistory')}</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500">{t('excelNoSilentDiscardNotice')}</p>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* TAB 1: BULK IMPORT */}
      {activeTab === 'import' && canImportAny && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('excelEntityTypeLabel')}
                </label>
                <SelectInput
                  value={importType}
                  onChange={(e) => {
                    setImportType(e.target.value as ExcelTemplateType);
                    setRows([]);
                    setStats(null);
                    setSummary(null);
                    setDirtyEdits(false);
                  }}
                >
                  {availableTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </SelectInput>
              </div>

              {!isCorporate &&
                ['candidates', 'corporate_employees', 'enrollment_requests'].includes(importType) && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t('corporateOrganization')}
                    </label>
                    <SelectInput
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                    >
                      <option value="">{t('individualUnassigned')}</option>
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nameEn} ({o.organizationId})
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                )}
            </div>

            {/* Template Guidance Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div>
                <span className="font-semibold text-slate-800 block mb-1">
                  {t('requiredField')} Columns
                </span>
                <p className="text-slate-600">{guidance.requiredCols.join(' · ')}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-800 block mb-1">
                  Supported Optional Columns
                </span>
                <p className="text-slate-600">{guidance.optionalCols.join(' · ')}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void downloadProtectedFile(
                    `/api/excel/template/${importType}`,
                    `tcms_${importType}_template.xlsx`
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('excelDownloadTemplateBtn')}</span>
              </button>

              <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{parsing ? t('excelParsingFile') : t('excelUploadFileBtn')}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={parsing}
                  onChange={(e) => void handleFileUpload(e)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Post-Commit Summary */}
          {summary && (
            <div className="bg-white border border-emerald-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {t('excelImportJobId')}: <span className="font-mono-tabular">{summary.jobId}</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <StatusText status={summary.status} />
                </div>
                {summary.failedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleDownloadErrors(summary.failedRows)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-md hover:bg-red-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('excelDownloadErrorReportBtn')}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-7 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="text-slate-500 block">{t('excelTotalRows')}</span>
                  <span className="font-mono-tabular text-base font-bold text-slate-900">{summary.totalRows}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                  <span className="text-emerald-700 block">Created</span>
                  <span className="font-mono-tabular text-base font-bold text-emerald-900">{summary.importedCount}</span>
                </div>
                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded">
                  <span className="text-sky-700 block">{t('excelUpdatedRows')}</span>
                  <span className="font-mono-tabular text-base font-bold text-sky-900">{summary.updatedCount || 0}</span>
                </div>
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                  <span className="text-amber-700 block">{t('excelDuplicateRows')}</span>
                  <span className="font-mono-tabular text-base font-bold text-amber-900">{summary.duplicateCount}</span>
                </div>
                <div className="p-2.5 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-700 block">{t('excelInvalidRows')}</span>
                  <span className="font-mono-tabular text-base font-bold text-red-900">{summary.invalidCount}</span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="text-slate-600 block">{t('excelSkippedRows')}</span>
                  <span className="font-mono-tabular text-base font-bold text-slate-900">{summary.skippedCount}</span>
                </div>
                <div className="p-2.5 bg-red-50 border border-red-200 rounded">
                  <span className="text-red-700 block">{t('excelFailedCount')}</span>
                  <span className="font-mono-tabular text-base font-bold text-red-900">{summary.failedCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Import Validation Preview & Controls */}
          {rows.length > 0 && stats && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
              {/* 6-metric Validation Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="text-slate-500 block">{t('excelTotalRows')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-slate-900">{stats.totalRows}</span>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-md">
                  <span className="text-emerald-700 block">{t('excelValidRows')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-emerald-900">{stats.validRows}</span>
                </div>
                <div className="p-3 bg-red-50/70 border border-red-200 rounded-md">
                  <span className="text-red-700 block">{t('excelInvalidRows')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-red-900">{stats.invalidRows}</span>
                </div>
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md">
                  <span className="text-amber-700 block">{t('excelDuplicateRows')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-amber-900">{stats.duplicateRows}</span>
                </div>
                <div className="p-3 bg-red-50/40 border border-red-200 rounded-md">
                  <span className="text-red-700 block">{t('excelMissingRequired')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-red-900">{stats.missingRequiredRows}</span>
                </div>
                <div className="p-3 bg-red-50/40 border border-red-200 rounded-md">
                  <span className="text-red-700 block">{t('excelFormatErrors')}</span>
                  <span className="font-mono-tabular text-lg font-bold text-red-900">{stats.formatErrorRows}</span>
                </div>
              </div>

              {/* Filter & Control Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 me-2">{fileName}</span>
                  <div className="inline-flex bg-slate-100 p-0.5 rounded border border-slate-200 text-xs">
                    {(
                      [
                        { k: 'all', label: `${t('excelFilterAll')} (${rows.length})` },
                        { k: 'valid', label: `${t('excelFilterValid')} (${stats.validRows})` },
                        { k: 'duplicate', label: `${t('excelFilterDuplicates')} (${stats.duplicateRows})` },
                        { k: 'invalid', label: `${t('excelFilterInvalid')} (${stats.invalidRows})` },
                        { k: 'skipped', label: `${t('excelFilterSkipped')} (${stats.skippedRows})` },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.k}
                        type="button"
                        onClick={() => setRowFilter(item.k)}
                        className={`px-2.5 py-1 rounded font-medium font-mono-tabular ${
                          rowFilter === item.k
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {dirtyEdits && (
                    <button
                      type="button"
                      disabled={revalidating}
                      onClick={() => void handleRevalidate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-sky-300 bg-sky-50 text-sky-800 rounded-md hover:bg-sky-100"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin' : ''}`} />
                      <span>{t('excelRevalidateBtn')}</span>
                    </button>
                  )}

                  {stats.invalidRows > 0 && (
                    <button
                      type="button"
                      onClick={handleSkipAllInvalid}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
                    >
                      {t('excelSkipAllInvalid')}
                    </button>
                  )}

                  {previewProblemRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleDownloadErrors(previewProblemRows)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-md hover:bg-red-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('excelDownloadErrorReportBtn')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleCancelImport()}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
                  >
                    {t('excelCancelImportBtn')}
                  </button>

                  <button
                    type="button"
                    disabled={committing || dirtyEdits || actionableCount === 0}
                    onClick={() => void handleCommit()}
                    className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {committing
                      ? t('loading')
                      : `${t('excelCommitImportBtn')} (${actionableCount})`}
                  </button>
                </div>
              </div>

              {dirtyEdits && (
                <NotificationBanner
                  variant="info"
                  message="Inline row edits detected. Click 'Re-validate Edits' before importing so server validation & duplicate checks update."
                />
              )}

              {/* Preview Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Row</th>
                      <th className="py-2.5 px-3">{t('excelSkipRow')}</th>
                      <th className="py-2.5 px-3">{t('status')}</th>
                      <th className="py-2.5 px-3 min-w-[320px]">Row Fields (Inline Editable)</th>
                      <th className="py-2.5 px-3 min-w-[260px]">Validation Errors & Duplicate Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPreviewRows.map((r) => {
                      const updatableDup = r.status === 'duplicate' && r.duplicateDetails.some((d) => d.canUpdate);
                      return (
                        <tr
                          key={r.rowNumber}
                          className={
                            r.skip
                              ? 'bg-slate-50/70 opacity-70'
                              : r.status === 'valid'
                                ? 'bg-white'
                                : r.status === 'duplicate'
                                  ? 'bg-amber-50/30'
                                  : 'bg-red-50/30'
                          }
                        >
                          <td className="py-2.5 px-3 font-mono-tabular align-top">{r.rowNumber}</td>
                          <td className="py-2.5 px-3 align-top">
                            <input
                              type="checkbox"
                              checked={Boolean(r.skip)}
                              onChange={(e) => toggleRowSkip(r.rowNumber, e.target.checked)}
                            />
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <StatusText status={r.skip ? 'skipped' : r.status} />
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(r.mapped)
                                .filter(([k]) => !k.startsWith('_'))
                                .map(([k, v]) => (
                                  <label
                                    key={k}
                                    className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-0.5"
                                  >
                                    <span className="text-[10px] text-slate-500">{k}:</span>
                                    <input
                                      value={v}
                                      onChange={(e) => updateRowField(r.rowNumber, k, e.target.value)}
                                      className="w-28 bg-transparent text-[11px] text-slate-900 focus:outline-none"
                                    />
                                  </label>
                                ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 align-top space-y-2">
                            {r.missingFields.length > 0 && (
                              <div className="text-red-700 text-[11px]">
                                <span className="font-semibold">{t('excelMissingRequired')}: </span>
                                {r.missingFields.join(', ')}
                              </div>
                            )}
                            {r.formatErrors.length > 0 && (
                              <div className="text-red-700 text-[11px] flex items-start gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{r.formatErrors.join('; ')}</span>
                              </div>
                            )}
                            {r.status === 'duplicate' && (
                              <div className="p-2 border border-amber-200 bg-amber-50/60 rounded space-y-1.5 text-[11px]">
                                {r.duplicateDetails.map((d, idx) => (
                                  <div key={idx} className="text-amber-900">
                                    <span className="font-medium">{d.existingDetails || 'Duplicate detected'}</span>
                                    {d.iqamaMasked && (
                                      <span className="block text-[10px] text-slate-600 font-mono-tabular">
                                        Iqama: {d.iqamaMasked}
                                      </span>
                                    )}
                                  </div>
                                ))}

                                {updatableDup ? (
                                  <div className="pt-1 border-t border-amber-200/80 space-y-1">
                                    <select
                                      value={r.duplicateAction || 'skip'}
                                      onChange={(e) =>
                                        setDuplicatePolicy(
                                          r.rowNumber,
                                          e.target.value as 'skip' | 'update',
                                          false
                                        )
                                      }
                                      className="w-full px-2 py-1 text-[11px] bg-white border border-amber-300 rounded"
                                    >
                                      <option value="skip">{t('excelDupSkip')}</option>
                                      <option value="update">{t('excelDupUpdate')}</option>
                                    </select>
                                    {r.duplicateAction === 'update' && (
                                      <label className="flex items-center gap-1.5 text-amber-950 font-medium cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(r.explicitUpdateConfirmed)}
                                          onChange={(e) =>
                                            setDuplicatePolicy(r.rowNumber, 'update', e.target.checked)
                                          }
                                        />
                                        <span>{t('excelDupConfirmUpdateLabel')}</span>
                                      </label>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-amber-800">{t('excelDupProtectedNotice')}</p>
                                )}
                              </div>
                            )}
                            {r.missingFields.length === 0 &&
                              r.formatErrors.length === 0 &&
                              r.duplicateDetails.length === 0 && <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EXCEL EXPORT CENTER */}
      {activeTab === 'export' && (
        <div className="space-y-5">
          {/* Export Filters & Sensitive Data Control */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('excelExportFromDate')}
                </label>
                <TextInput type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('excelExportToDate')}
                </label>
                <TextInput type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
              </div>
              {!isCorporate && !isTrainer && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    {t('excelExportFilterOrg')}
                  </label>
                  <SelectInput value={exportOrgId} onChange={(e) => setExportOrgId(e.target.value)}>
                    <option value="">{t('all')}</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nameEn}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('excelExportFilterCourse')}
                </label>
                <SelectInput value={exportCourseId} onChange={(e) => setExportCourseId(e.target.value)}>
                  <option value="">{t('all')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode} — {c.titleEn}
                    </option>
                  ))}
                </SelectInput>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{t('excelExportMaskedNotice')}</span>
              </div>

              {canIncludeSensitive && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSensitive}
                    onChange={(e) => setIncludeSensitive(e.target.checked)}
                  />
                  <span>{t('excelExportIncludeSensitive')}</span>
                </label>
              )}
            </div>
          </div>

          {/* Dataset Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exportCatalog.map((item) => (
              <div
                key={item.key}
                className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                      {t(`excelDataset_${item.key}`)}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {item.supportsSensitiveUnmask && includeSensitive
                      ? 'Unmasked identity export enabled (audit logged)'
                      : 'Role-scoped & identity-masked workbook'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void triggerExportDownload(item.key, 'xlsx')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 font-mono-tabular"
                  >
                    XLSX
                  </button>
                  <button
                    type="button"
                    onClick={() => void triggerExportDownload(item.key, 'csv')}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 font-mono-tabular"
                  >
                    CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: IMPORT HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <SearchFilterBar
            searchValue={historySearch}
            onSearchChange={setHistorySearch}
            searchPlaceholder="Search Job ID, file name, or uploader..."
            filters={
              <>
                <SelectInput
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value)}
                  className="w-44"
                >
                  <option value="">{t('all')}</option>
                  {(['candidates', 'corporate_employees', 'enrollment_requests', 'enrollments', 'attendance', 'courses', 'trainers'] as ExcelTemplateType[]).map(
                    (tp) => (
                      <option key={tp} value={tp}>
                        {t(`excelTemplate_${tp}`)}
                      </option>
                    )
                  )}
                </SelectInput>
                <SelectInput
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                  className="w-44"
                >
                  <option value="">{t('filterByStatus')}</option>
                  <option value="completed">{t('status_completed')}</option>
                  <option value="completed_with_errors">{t('excelStatus_completed_with_errors')}</option>
                  <option value="failed">{t('status_failed')}</option>
                  <option value="cancelled">{t('status_cancelled')}</option>
                </SelectInput>
              </>
            }
            onReset={() => {
              setHistorySearch('');
              setHistoryTypeFilter('');
              setHistoryStatusFilter('');
            }}
            actions={
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            }
          />

          <DataTable
            loading={historyLoading}
            rows={filteredHistory}
            rowKey={(j) => j.id}
            emptyTitle="No Excel import jobs recorded"
            emptyDescription="Uploaded spreadsheets and cancelled import previews will appear here with full counts and audit timestamps."
            columns={[
              {
                key: 'jobId',
                header: t('excelImportJobId'),
                render: (j) => <span className="font-mono-tabular font-semibold text-slate-900">{j.jobId || j.id}</span>,
              },
              {
                key: 'importType',
                header: 'Entity Type',
                render: (j) => <span>{t(`excelTemplate_${j.importType}`)}</span>,
              },
              {
                key: 'fileName',
                header: t('excelFileName'),
                render: (j) => <span className="text-slate-700">{j.fileName}</span>,
              },
              {
                key: 'uploadedBy',
                header: t('excelUploadedBy'),
                render: (j) => (
                  <div>
                    <span className="block text-slate-900">{j.uploadedByName || j.createdBy}</span>
                    {j.uploadedByEmail && <span className="text-[11px] text-slate-500">{j.uploadedByEmail}</span>}
                  </div>
                ),
              },
              {
                key: 'createdAt',
                header: t('excelUploadDate'),
                render: (j) => (
                  <span className="font-mono-tabular text-slate-600">
                    {(j.createdAt || '').slice(0, 19).replace('T', ' ') || '—'}
                  </span>
                ),
              },
              {
                key: 'totalRows',
                header: t('excelTotalRows'),
                align: 'end',
                render: (j) => <span className="font-mono-tabular">{j.totalRows}</span>,
              },
              {
                key: 'successful',
                header: t('excelSuccessfulCount'),
                align: 'end',
                render: (j) => (
                  <span className="font-mono-tabular font-semibold text-emerald-700">
                    {(j.importedCount || 0) + (j.updatedCount || 0)}
                  </span>
                ),
              },
              {
                key: 'failed',
                header: t('excelFailedCount'),
                align: 'end',
                render: (j) => (
                  <span className="font-mono-tabular text-red-700">
                    {(j.invalidCount || 0) + (j.failedCount || 0) + (j.duplicateCount || 0)}
                  </span>
                ),
              },
              {
                key: 'skipped',
                header: t('excelSkippedRows'),
                align: 'end',
                render: (j) => <span className="font-mono-tabular text-slate-600">{j.skippedCount || 0}</span>,
              },
              {
                key: 'status',
                header: t('status'),
                render: (j) => (
                  <StatusText status={j.status === 'completed_with_errors' ? 'completed_with_errors' : j.status} />
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
