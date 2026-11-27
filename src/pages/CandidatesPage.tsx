import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Edit2, Eye, Plus, RotateCcw } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { hasPermission, isTenantAdminRole } from '../lib/permissions';
import type { Batch, Candidate, Course, Organization } from '../types/tcms';
import {
  ConfirmDialog,
  DataTable,
  ErrorAlert,
  SearchFilterBar,
  SelectInput,
  StatusText,
  type DataTableColumn,
} from '../components/ui/UiKit';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import { CandidateFormModal } from '../components/candidates/CandidateFormModal';
import { CandidateProfileView } from '../components/candidates/CandidateProfileView';

export function CandidatesPage() {
  const { profile, roleMatrix } = useAuth();
  const { lang, t, formatDate, formatNumber } = useLanguage();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [knownNationalities, setKnownNationalities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');

  // Form modal & Profile workspace state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [confirmArchiveTarget, setConfirmArchiveTarget] = useState<Candidate | null>(null);

  const isTrainer = profile?.role === 'trainer';
  const isCandidateRole = profile?.role === 'candidate';
  const isCorporate = profile?.role === 'corporate_client';

  const canCreate =
    hasPermission(profile, 'candidates', 'create', roleMatrix) && !isCandidateRole && !isTrainer;
  const canEdit =
    hasPermission(profile, 'candidates', 'edit', roleMatrix) && !isCandidateRole && !isTrainer;
  const canArchive =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'candidates', 'delete', roleMatrix);
  const canExport =
    hasPermission(profile, 'candidates', 'view', roleMatrix) && !isTrainer && !isCandidateRole;

  const buildFilterQuery = useCallback(() => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('q', search.trim());
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (nationalityFilter !== 'all') qs.set('nationality', nationalityFilter);
    if (orgFilter !== 'all') qs.set('organizationId', orgFilter);
    if (courseFilter !== 'all') qs.set('courseId', courseFilter);
    return qs;
  }, [search, statusFilter, nationalityFilter, orgFilter, courseFilter]);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildFilterQuery();
      const candRes = await apiFetch<{ candidates: Candidate[] }>(`/api/candidates?${qs.toString()}`);
      setCandidates(candRes.candidates);

      if (
        !search.trim() &&
        statusFilter === 'all' &&
        nationalityFilter === 'all' &&
        orgFilter === 'all' &&
        courseFilter === 'all'
      ) {
        const uniq = Array.from(
          new Set(candRes.candidates.map((c) => c.nationality).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b));
        setKnownNationalities(uniq);
      } else {
        setKnownNationalities((prev) => {
          const merged = new Set(prev);
          for (const c of candRes.candidates) {
            if (c.nationality) merged.add(c.nationality);
          }
          return Array.from(merged).sort((a, b) => a.localeCompare(b));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [buildFilterQuery, search, statusFilter, nationalityFilter, orgFilter, courseFilter]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const canLoadOrgs =
        isTenantAdminRole(profile?.role) ||
        ['certificate_officer', 'corporate_client'].includes(profile?.role || '') ||
        hasPermission(profile, 'corporate_clients', 'view', roleMatrix);
      const [orgRes, courseRes, batchRes] = await Promise.all([
        canLoadOrgs
          ? apiFetch<{ organizations: Organization[] }>('/api/organizations').catch(() => ({ organizations: [] }))
          : Promise.resolve({ organizations: [] }),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
      ]);
      if (!mounted) return;
      setOrgs(orgRes.organizations);
      setCourses(courseRes.courses);
      setBatches(batchRes.batches);
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.role, profile, roleMatrix]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditing(c);
    setFormOpen(true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setNationalityFilter('all');
    setOrgFilter('all');
    setCourseFilter('all');
  };

  const handleExportExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      const qs = buildFilterQuery();
      const dateTag = new Date().toISOString().slice(0, 10);
      await downloadProtectedFile(
        `/api/candidates/export?${qs.toString()}`,
        `candidates_export_${dateTag}.xlsx`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!confirmArchiveTarget) return;
    const nextStatus = confirmArchiveTarget.status === 'archived' ? 'active' : 'archived';
    try {
      await apiFetch(`/api/candidates/${confirmArchiveTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setConfirmArchiveTarget(null);
      await loadCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmArchiveTarget(null);
    }
  };

  if (selectedCandidateId) {
    return (
      <>
        <CandidateProfileView
          candidateDocId={selectedCandidateId}
          courses={courses}
          batches={batches}
          onBack={() => setSelectedCandidateId(null)}
          onEdit={(cand) => openEdit(cand)}
          onCandidateChanged={loadCandidates}
        />
        <CandidateFormModal
          open={formOpen}
          editing={editing}
          organizations={orgs}
          onClose={() => setFormOpen(false)}
          onSaved={async (saved) => {
            await loadCandidates();
            setSelectedCandidateId(saved.id);
          }}
          onResolveViewCandidate={(cand) => {
            setFormOpen(false);
            setSelectedCandidateId(cand.id);
          }}
          onResolveEditCandidate={(cand) => {
            setEditing(cand);
            setFormOpen(true);
          }}
        />
      </>
    );
  }

  const activeCount = candidates.filter((c) => c.status === 'active').length;
  const enrolledCount = candidates.reduce((acc, c) => acc + (c.enrolledCoursesCount || 0), 0);
  const certsCount = candidates.reduce((acc, c) => acc + (c.issuedCertificatesCount || 0), 0);

  const columns: Array<DataTableColumn<Candidate>> = [
    {
      key: 'photo',
      header: t('photograph'),
      render: (c) => (
        <ProtectedImage
          fileId={isTrainer ? undefined : c.photoFileId}
          alt={c.fullNameEn}
          fallbackText={c.fullNameEn}
          className="w-8 h-8 rounded-full object-cover border border-slate-200"
          fallbackClassName="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-semibold shrink-0"
        />
      ),
    },
    {
      key: 'candidateId',
      header: t('candidateId'),
      render: (c) => (
        <button
          type="button"
          onClick={() => setSelectedCandidateId(c.id)}
          className="font-mono-tabular font-semibold text-slate-900 hover:text-sky-700 hover:underline whitespace-nowrap"
        >
          {c.candidateId}
        </button>
      ),
    },
    {
      key: 'name',
      header: lang === 'ar' ? 'الاسم' : 'Candidate Name',
      render: (c) => (
        <div>
          <button
            type="button"
            onClick={() => setSelectedCandidateId(c.id)}
            className="font-medium text-slate-900 hover:text-sky-700 text-start"
          >
            {c.fullNameEn}
          </button>
          {c.fullNameAr && <div className="text-[11px] text-slate-500">{c.fullNameAr}</div>}
        </div>
      ),
    },
    {
      key: 'nationality',
      header: t('nationality'),
      render: (c) => <span className="text-slate-700 whitespace-nowrap">{c.nationality}</span>,
    },
    ...(!isTrainer
      ? [
          {
            key: 'identity',
            header: t('iqamaNumber'),
            render: (c: Candidate) => (
              <span className="font-mono-tabular text-slate-700 whitespace-nowrap">
                {c.iqamaMasked || c.passportMasked || '—'}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'company',
      header: t('companyEmployer'),
      render: (c) => (
        <span className="text-slate-700">{c.companyName || t('individualUnassigned')}</span>
      ),
    },
    {
      key: 'mobile',
      header: t('mobileNumber'),
      render: (c) => (
        <span className="font-mono-tabular text-slate-700 whitespace-nowrap">{c.mobile}</span>
      ),
    },
    {
      key: 'regDate',
      header: t('registrationDate'),
      render: (c) => (
        <span className="font-mono-tabular text-slate-600 whitespace-nowrap">
          {formatDate(c.registrationDate)}
        </span>
      ),
    },
    {
      key: 'courses',
      header: t('enrolledCoursesCount'),
      align: 'end',
      render: (c) => (
        <span className="font-mono-tabular font-medium text-slate-900">
          {formatNumber(c.enrolledCoursesCount ?? 0)}
        </span>
      ),
    },
    ...(!isTrainer
      ? [
          {
            key: 'certificates',
            header: t('issuedCertificatesCount'),
            align: 'end' as const,
            render: (c: Candidate) => (
              <span className="font-mono-tabular font-medium text-slate-900">
                {formatNumber(c.issuedCertificatesCount ?? 0)}
              </span>
            ),
          },
        ]
      : []),
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
        <div className="inline-flex items-center gap-1 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setSelectedCandidateId(c.id)}
            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
            title={t('view')}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => openEdit(c)}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
              title={t('edit')}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              onClick={() => setConfirmArchiveTarget(c)}
              className="p-1.5 text-slate-600 hover:text-amber-700 rounded hover:bg-amber-50"
              title={c.status === 'archived' ? t('restore') : t('archive')}
            >
              {c.status === 'archived' ? (
                <RotateCcw className="w-3.5 h-3.5" />
              ) : (
                <Archive className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <div className={`grid grid-cols-2 ${isTrainer ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-3`}>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">{t('kpi_totalCandidates')}</p>
          <p className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
            {formatNumber(candidates.length)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">{t('kpi_activeCandidates')}</p>
          <p className="mt-1 text-lg font-semibold font-mono-tabular text-emerald-700">
            {formatNumber(activeCount)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-medium text-slate-500">{t('kpi_currentEnrollments')}</p>
          <p className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
            {formatNumber(enrolledCount)}
          </p>
        </div>
        {!isTrainer && (
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">{t('kpi_certificatesIssued')}</p>
            <p className="mt-1 text-lg font-semibold font-mono-tabular text-slate-900">
              {formatNumber(certsCount)}
            </p>
          </div>
        )}
      </div>

      {/* Search, Advanced Filters & Actions */}
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={
          lang === 'ar'
            ? 'ابحث بالاسم، رقم المتدرب، الجوال، أو الإقامة...'
            : 'Search by name, Candidate ID, mobile, or authorized Iqama...'
        }
        filters={
          <>
            <div className="w-36">
              <SelectInput
                value={nationalityFilter}
                onChange={(e) => setNationalityFilter(e.target.value)}
                aria-label={t('nationality')}
              >
                <option value="all">{t('filterNationality')}</option>
                {knownNationalities.map((nat) => (
                  <option key={nat} value={nat}>
                    {nat}
                  </option>
                ))}
              </SelectInput>
            </div>

            {!isCorporate && !isCandidateRole && orgs.length > 0 && (
              <div className="w-44">
                <SelectInput
                  value={orgFilter}
                  onChange={(e) => setOrgFilter(e.target.value)}
                  aria-label={t('companyEmployer')}
                >
                  <option value="all">{t('filterCompany')}</option>
                  <option value="__individual__">{t('individualUnassigned')}</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {lang === 'ar' && o.nameAr ? o.nameAr : o.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}

            {courses.length > 0 && (
              <div className="w-44">
                <SelectInput
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  aria-label={t('perm_domain_courses')}
                >
                  <option value="all">{t('filterCourse')}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {lang === 'ar' ? course.titleAr : course.titleEn}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}

            <div className="w-32">
              <SelectInput
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label={t('status')}
              >
                <option value="all">{t('filterByStatus')}</option>
                <option value="active">{t('status_active')}</option>
                <option value="inactive">{t('status_inactive')}</option>
                <option value="suspended">{t('status_suspended')}</option>
                <option value="archived">{t('status_archived')}</option>
              </SelectInput>
            </div>
          </>
        }
        onReset={handleResetFilters}
        actions={
          <>
            {canExport && (
              <button
                type="button"
                disabled={exporting || candidates.length === 0}
                onClick={() => void handleExportExcel()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exporting ? t('loading') : t('exportExcel')}</span>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('candidateRegistration')}</span>
              </button>
            )}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      <DataTable
        columns={columns}
        rows={candidates}
        rowKey={(c) => c.id}
        loading={loading}
        emptyTitle={t('noRecords')}
        emptyDescription={
          lang === 'ar'
            ? 'لم يتم العثور على متدربين مطابقين لمعايير البحث والتصفية.'
            : 'No registered candidates match the current search and filter criteria.'
        }
        emptyActionLabel={canCreate ? t('candidateRegistration') : undefined}
        onEmptyAction={canCreate ? openCreate : undefined}
      />

      <CandidateFormModal
        open={formOpen}
        editing={editing}
        organizations={orgs}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          await loadCandidates();
        }}
        onResolveViewCandidate={(cand) => {
          setFormOpen(false);
          setSelectedCandidateId(cand.id);
        }}
        onResolveEditCandidate={(cand) => {
          setEditing(cand);
          setFormOpen(true);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmArchiveTarget)}
        title={
          confirmArchiveTarget?.status === 'archived'
            ? t('confirmRestoreTitle')
            : t('confirmArchiveTitle')
        }
        message={
          confirmArchiveTarget?.status === 'archived'
            ? t('confirmRestoreMsg')
            : t('confirmArchiveMsg')
        }
        confirmLabel={
          confirmArchiveTarget?.status === 'archived' ? t('restore') : t('archive')
        }
        danger={confirmArchiveTarget?.status !== 'archived'}
        onConfirm={() => void handleConfirmArchive()}
        onCancel={() => setConfirmArchiveTarget(null)}
      />
    </div>
  );
}
