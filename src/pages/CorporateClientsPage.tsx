import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ClipboardCheck, Edit2, Eye, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { hasPermission, isTenantAdminRole } from '../lib/permissions';
import type {
  Batch,
  Candidate,
  Course,
  EnrollmentRequest,
  ModuleKey,
  Organization,
} from '../types/tcms';
import {
  DataTable,
  ErrorAlert,
  SearchFilterBar,
  SelectInput,
  StatusText,
  SuccessAlert,
} from '../components/ui/UiKit';
import { OrganizationFormModal } from '../components/corporate/OrganizationFormModal';
import { CorporatePortalView } from '../components/corporate/CorporatePortalView';
import { EnrollmentRequestReviewModal } from '../components/corporate/EnrollmentRequestReviewModal';

type StaffTab = 'organizations' | 'requests';

export function CorporateClientsPage({ onNavigate }: { onNavigate?: (m: ModuleKey) => void }) {
  const { profile, roleMatrix } = useAuth();
  const { lang, t, formatDate } = useLanguage();

  const isCorporateUser = profile?.role === 'corporate_client';
  const canCreateOrg =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'corporate_clients', 'create', roleMatrix);
  const canEditOrg =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'corporate_clients', 'edit', roleMatrix);
  const canReviewRequests =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'enrollments', 'approve', roleMatrix);

  const [staffTab, setStaffTab] = useState<StaffTab>('organizations');
  const [selectedOrgPortalId, setSelectedOrgPortalId] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('');

  // Modals
  const [orgFormOpen, setOrgFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<EnrollmentRequest | null>(null);

  const loadData = useCallback(async () => {
    if (isCorporateUser) return;
    setLoading(true);
    setError(null);
    try {
      const [orgRes, candRes, crsRes, bthRes, reqRes] = await Promise.all([
        apiFetch<{ organizations: Organization[] }>('/api/organizations'),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
        apiFetch<{ requests: EnrollmentRequest[] }>('/api/enrollment-requests').catch(() => ({
          requests: [],
        })),
      ]);
      setOrgs(orgRes.organizations);
      setCandidates(candRes.candidates);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
      setRequests(reqRes.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [isCorporateUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.organizationId.toLowerCase().includes(q) ||
        o.nameEn.toLowerCase().includes(q) ||
        o.nameAr.toLowerCase().includes(q) ||
        (o.crNumber || '').toLowerCase().includes(q) ||
        (o.vatNumber || '').toLowerCase().includes(q) ||
        (o.city || '').toLowerCase().includes(q) ||
        o.contactPerson.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q)
      );
    });
  }, [orgs, search, statusFilter]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (reqStatusFilter && r.status !== reqStatusFilter) return false;
      if (!q) return true;
      return (
        r.requestNumber.toLowerCase().includes(q) ||
        (r.organizationNameEn || '').toLowerCase().includes(q) ||
        (r.organizationNameAr || '').toLowerCase().includes(q) ||
        (r.requestedByName || '').toLowerCase().includes(q)
      );
    });
  }, [requests, search, reqStatusFilter]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const employeeCountByOrg = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      if (c.organizationId) {
        counts.set(c.organizationId, (counts.get(c.organizationId) || 0) + 1);
      }
    }
    return counts;
  }, [candidates]);

  const pendingReqCount = useMemo(
    () => requests.filter((r) => r.status === 'pending_review' || r.status === 'info_requested').length,
    [requests]
  );

  // Render full dedicated Corporate Portal directly for corporate_client accounts
  if (isCorporateUser) {
    return <CorporatePortalView onNavigate={onNavigate} />;
  }

  // Allow Training Center staff to inspect any organization's portal
  if (selectedOrgPortalId) {
    return (
      <CorporatePortalView
        organizationId={selectedOrgPortalId}
        onBack={() => {
          setSelectedOrgPortalId(null);
          void loadData();
        }}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Staff Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStaffTab('organizations')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              staffTab === 'organizations'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('tabOrganizationsList')} ({orgs.length})
          </button>
          <button
            type="button"
            onClick={() => setStaffTab('requests')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              staffTab === 'requests'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('tabEnrollmentRequestsQueue')} ({pendingReqCount})
          </button>
        </div>

        {canCreateOrg && staffTab === 'organizations' && (
          <button
            type="button"
            onClick={() => {
              setEditingOrg(null);
              setOrgFormOpen(true);
            }}
            className="mb-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('addCorporateClient')}</span>
          </button>
        )}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      <SuccessAlert message={successMsg} onDismiss={() => setSuccessMsg(null)} />

      {staffTab === 'organizations' ? (
        <>
          <SearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            filters={
              <SelectInput
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="!w-40"
              >
                <option value="">{t('all')} — {t('status')}</option>
                <option value="active">{t('status_active')}</option>
                <option value="inactive">{t('status_inactive')}</option>
                <option value="suspended">{t('status_suspended')}</option>
              </SelectInput>
            }
            onReset={() => {
              setSearch('');
              setStatusFilter('');
            }}
          />

          <DataTable
            loading={loading}
            rows={filteredOrgs}
            rowKey={(o) => o.id}
            emptyActionLabel={canCreateOrg ? t('addCorporateClient') : undefined}
            onEmptyAction={
              canCreateOrg
                ? () => {
                    setEditingOrg(null);
                    setOrgFormOpen(true);
                  }
                : undefined
            }
            columns={[
              {
                key: 'orgId',
                header: t('organizationId'),
                render: (o) => <span className="font-mono-tabular font-semibold text-slate-900">{o.organizationId}</span>,
              },
              {
                key: 'company',
                header: t('companyNameEn'),
                render: (o) => (
                  <div>
                    <div className="font-medium text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{o.nameEn}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{o.nameAr}</div>
                  </div>
                ),
              },
              {
                key: 'crVat',
                header: `${t('crNumber')} / ${t('vatNumber')}`,
                render: (o) => (
                  <div className="font-mono-tabular text-[11px]">
                    <div>CR: {o.crNumber || '—'}</div>
                    {o.vatNumber && <div className="text-slate-500">VAT: {o.vatNumber}</div>}
                  </div>
                ),
              },
              {
                key: 'city',
                header: t('city'),
                render: (o) => o.city || '—',
              },
              {
                key: 'contact',
                header: t('contactPerson'),
                render: (o) => (
                  <div>
                    <div className="font-medium text-slate-900">{o.contactPerson}</div>
                    {o.contactDesignation && <div className="text-[11px] text-slate-500">{o.contactDesignation}</div>}
                    <div className="text-[11px] font-mono-tabular text-slate-500">{o.mobile}</div>
                  </div>
                ),
              },
              {
                key: 'employees',
                header: t('employeesCount'),
                render: (o) => (
                  <span className="font-mono-tabular font-semibold">{employeeCountByOrg.get(o.id) || 0}</span>
                ),
              },
              {
                key: 'status',
                header: t('status'),
                render: (o) => <StatusText status={o.status} />,
              },
              {
                key: 'actions',
                header: t('actions'),
                align: 'end',
                render: (o) => (
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedOrgPortalId(o.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                      title={t('openCorporatePortal')}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{t('openCorporatePortal')}</span>
                    </button>
                    {canEditOrg && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrg(o);
                          setOrgFormOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title={t('edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </>
      ) : (
        <>
          <SearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            filters={
              <SelectInput
                value={reqStatusFilter}
                onChange={(e) => setReqStatusFilter(e.target.value)}
                className="!w-44"
              >
                <option value="">{t('all')} — {t('status')}</option>
                <option value="pending_review">{t('status_pending_review')}</option>
                <option value="info_requested">{t('status_info_requested')}</option>
                <option value="approved">{t('status_approved')}</option>
                <option value="rejected">{t('status_rejected')}</option>
              </SelectInput>
            }
            onReset={() => {
              setSearch('');
              setReqStatusFilter('');
            }}
          />

          <DataTable
            loading={loading}
            rows={filteredRequests}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'number',
                header: t('requestNumber'),
                render: (r) => <span className="font-mono-tabular font-semibold">{r.requestNumber}</span>,
              },
              {
                key: 'org',
                header: t('corporateOrganization'),
                render: (r) => (
                  <div>
                    <div className="font-medium text-slate-900">
                      {lang === 'ar'
                        ? r.organizationNameAr || r.organizationNameEn || r.organizationId
                        : r.organizationNameEn || r.organizationId}
                    </div>
                    <div className="text-[11px] text-slate-500">{r.requestedByName || '—'}</div>
                  </div>
                ),
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
                key: 'decision',
                header: t('decisionDate'),
                render: (r) => (
                  <div className="text-[11px]">
                    <div>{r.reviewedByName || '—'}</div>
                    <div className="font-mono-tabular text-slate-500">
                      {r.decisionDate ? formatDate(r.decisionDate) : formatDate(r.createdAt)}
                    </div>
                  </div>
                ),
              },
              {
                key: 'actions',
                header: t('actions'),
                align: 'end',
                render: (r) =>
                  canReviewRequests ? (
                    <button
                      type="button"
                      onClick={() => setReviewingRequest(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      <span>{r.status === 'approved' || r.status === 'rejected' ? t('view') : t('reviewAction')}</span>
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  ),
              },
            ]}
          />
        </>
      )}

      <OrganizationFormModal
        open={orgFormOpen}
        editing={editingOrg}
        onClose={() => {
          setOrgFormOpen(false);
          setEditingOrg(null);
        }}
        onSaved={async (saved) => {
          setSuccessMsg(`${saved.organizationId} — ${saved.nameEn}`);
          await loadData();
        }}
      />

      <EnrollmentRequestReviewModal
        open={Boolean(reviewingRequest)}
        request={reviewingRequest}
        courses={courses}
        batches={batches}
        candidates={candidates}
        onClose={() => setReviewingRequest(null)}
        onReviewed={async (updated) => {
          setSuccessMsg(`${updated.requestNumber} — ${t(`status_${updated.status}`)}`);
          await loadData();
        }}
      />
    </div>
  );
}
