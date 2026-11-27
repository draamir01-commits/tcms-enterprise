import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Edit2,
  KeyRound,
  UserCheck,
  UserX,
  Mail,
  Shield,
  Users,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  getPermissionActionLabel,
  getPermissionDomainLabel,
  getRoleLabel,
} from '../i18n/translations';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import {
  ALL_USER_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  isTenantAdminRole,
  isTenantOwnerRole,
  normalizePermissionMatrix,
  PERMISSION_ACTIONS,
  PERMISSION_DOMAINS,
} from '../lib/permissions';
import type {
  Batch,
  Candidate,
  Course,
  LanguageCode,
  Organization,
  PermissionAction,
  PermissionDomain,
  PermissionMatrix,
  RolePermissionMatrix,
  Trainer,
  UserInvite,
  UserProfile,
  UserRole,
} from '../types/tcms';
import {
  ConfirmDialog,
  DataTable,
  ErrorAlert,
  FormField,
  Modal,
  NotificationBanner,
  SearchFilterBar,
  SelectInput,
  StatusText,
  TextInput,
  type DataTableColumn,
} from '../components/ui/UiKit';
import { PasswordStrengthMeter } from '../components/auth/AccountSecurityModal';

export function UserManagementPage() {
  const { profile, refreshProfile } = useAuth();
  const { lang, t } = useLanguage();

  const isSuperAdmin = isTenantOwnerRole(profile?.role);
  const assignableRoles: UserRole[] = isSuperAdmin
    ? ALL_USER_ROLES
    : ['certificate_officer', 'trainer', 'corporate_client', 'candidate'];

  const [activeTab, setActiveTab] = useState<'users' | 'matrix'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<RolePermissionMatrix>(DEFAULT_ROLE_PERMISSIONS);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create Email+Password User Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [createForm, setCreateForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    password: '',
    role: 'certificate_officer' as UserRole,
    preferredLanguage: 'en' as LanguageCode,
    status: 'active' as 'active' | 'suspended',
    organizationId: '',
    trainerId: '',
    candidateId: '',
    assignedCourseIds: [] as string[],
    assignedBatchIds: [] as string[],
    sendResetEmail: false,
  });

  // Google Pre-Provision Invite Modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    displayName: '',
    role: 'certificate_officer' as UserRole,
    organizationId: '',
    trainerId: '',
    candidateId: '',
  });

  // Edit User Modal
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: '',
    phone: '',
    preferredLanguage: 'en' as LanguageCode,
    role: 'candidate' as UserRole,
    status: 'active' as 'active' | 'suspended',
    organizationId: '',
    trainerId: '',
    candidateId: '',
    assignedCourseIds: [] as string[],
    assignedBatchIds: [] as string[],
    useCustomPermissions: false,
    permissions: {} as Partial<PermissionMatrix>,
  });

  // Confirmation dialogs
  const [confirmToggleUser, setConfirmToggleUser] = useState<UserProfile | null>(null);
  const [confirmResetUser, setConfirmResetUser] = useState<UserProfile | null>(null);

  // Matrix Editor Tab
  const [matrixRole, setMatrixRole] = useState<UserRole>('tenant_admin');
  const [matrixDraft, setMatrixDraft] = useState<RolePermissionMatrix>(DEFAULT_ROLE_PERMISSIONS);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, orgRes, trnRes, candRes, crsRes, bthRes] = await Promise.all([
        apiFetch<{
          users: UserProfile[];
          invites: UserInvite[];
          roleMatrix?: RolePermissionMatrix;
        }>('/api/users'),
        apiFetch<{ organizations: Organization[] }>('/api/organizations').catch(() => ({
          organizations: [],
        })),
        apiFetch<{ trainers: Trainer[] }>('/api/trainers').catch(() => ({ trainers: [] })),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
      ]);
      setUsers(uRes.users);
      setInvites(uRes.invites);
      const normalized = normalizePermissionMatrix(uRes.roleMatrix);
      setRoleMatrix(normalized);
      setMatrixDraft(normalized);
      setOrganizations(orgRes.organizations);
      setTrainers(trnRes.trainers);
      setCandidates(candRes.candidates);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const orgMap = useMemo(() => new Map(organizations.map((o) => [o.id, o])), [organizations]);
  const trainerMap = useMemo(() => new Map(trainers.map((tr) => [tr.id, tr])), [trainers]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!q) return true;
      const orgName = u.organizationId ? orgMap.get(u.organizationId)?.nameEn || '' : '';
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        orgName.toLowerCase().includes(q) ||
        (u.trainerId || '').toLowerCase().includes(q) ||
        (u.candidateId || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter, statusFilter, orgMap]);

  const kpis = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.status === 'active').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      pendingInvites: invites.filter((i) => i.status === 'pending').length,
    }),
    [users, invites]
  );

  const canManageTarget = (target: UserProfile) => {
    if (isSuperAdmin) return true;
    return !isTenantAdminRole(target.role);
  };

  const toggleIdInList = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const pwCheck = validatePasswordStrength(createForm.password);
    if (!pwCheck.valid) {
      setError(t('authErrorWeakPassword'));
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{
        user: UserProfile;
        verificationEmailSent?: boolean;
      }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setCreateOpen(false);
      setCreateForm({
        displayName: '',
        email: '',
        phone: '',
        password: '',
        role: 'certificate_officer',
        preferredLanguage: 'en',
        status: 'active',
        organizationId: '',
        trainerId: '',
        candidateId: '',
        assignedCourseIds: [],
        assignedBatchIds: [],
        sendResetEmail: false,
      });
      setSuccessMsg(
        `Created ${res.user.email} (${getRoleLabel(res.user.role, lang)})${
          res.verificationEmailSent
            ? ' — verification email dispatched.'
            : ' — account created; user can sign in with Google or request verification email on login.'
        }`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      await apiFetch('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      setSuccessMsg(`Pre-provisioned Google role assignment saved for ${inviteForm.email}.`);
      setInviteOpen(false);
      setInviteForm({
        email: '',
        displayName: '',
        role: 'certificate_officer',
        organizationId: '',
        trainerId: '',
        candidateId: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const openEditUser = (u: UserProfile) => {
    const tr = u.trainerId ? trainerMap.get(u.trainerId) : undefined;
    const trBatches = batches
      .filter((b) => b.trainerUserId === u.uid || (u.trainerId && b.trainerId === u.trainerId))
      .map((b) => b.id);
    const hasCustomPerms = Boolean(u.permissions && Object.keys(u.permissions).length > 0);
    setEditUser(u);
    setEditForm({
      displayName: u.displayName || '',
      phone: u.phone || '',
      preferredLanguage: u.preferredLanguage || 'en',
      role: u.role,
      status: u.status,
      organizationId: u.organizationId || '',
      trainerId: u.trainerId || '',
      candidateId: u.candidateId || '',
      assignedCourseIds: tr?.assignedCourseIds || [],
      assignedBatchIds: trBatches,
      useCustomPermissions: hasCustomPerms,
      permissions: u.permissions ? { ...u.permissions } : { ...roleMatrix[u.role] },
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName: editForm.displayName,
        phone: editForm.phone,
        preferredLanguage: editForm.preferredLanguage,
        organizationId: editForm.organizationId,
        trainerId: editForm.trainerId,
        candidateId: editForm.candidateId,
      };
      if (editUser.uid !== profile?.uid) {
        payload.role = editForm.role;
        payload.status = editForm.status;
        if (isSuperAdmin) {
          payload.permissions = editForm.useCustomPermissions ? editForm.permissions : null;
        }
      }
      if (editForm.role === 'trainer' && editForm.trainerId) {
        payload.assignedCourseIds = editForm.assignedCourseIds;
        payload.assignedBatchIds = editForm.assignedBatchIds;
      }

      await apiFetch(`/api/users/${encodeURIComponent(editUser.uid)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditUser(null);
      setSuccessMsg(`Updated user ${editUser.email}.`);
      await loadData();
      if (editUser.uid === profile?.uid) {
        await refreshProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!confirmToggleUser) return;
    const nextStatus = confirmToggleUser.status === 'active' ? 'suspended' : 'active';
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      await apiFetch(`/api/users/${encodeURIComponent(confirmToggleUser.uid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(
        `${nextStatus === 'active' ? t('activateAccount') : t('deactivateAccount')}: ${confirmToggleUser.email}`
      );
      setConfirmToggleUser(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmToggleUser(null);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!confirmResetUser) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      await apiFetch(`/api/users/${encodeURIComponent(confirmResetUser.uid)}/reset-password`, {
        method: 'POST',
      });
      setSuccessMsg(`Password reset email sent to ${confirmResetUser.email}.`);
      setConfirmResetUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmResetUser(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleMatrixCell = (role: UserRole, domain: PermissionDomain, action: PermissionAction) => {
    if (!isSuperAdmin || isTenantOwnerRole(role)) return;
    setMatrixDraft((prev) => {
      const roleCfg = { ...prev[role] };
      const current = roleCfg[domain] || [];
      roleCfg[domain] = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return { ...prev, [role]: roleCfg };
    });
  };

  const toggleEditUserPermCell = (domain: PermissionDomain, action: PermissionAction) => {
    setEditForm((prev) => {
      const current = prev.permissions[domain] || roleMatrix[prev.role][domain] || [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [domain]: next,
        },
      };
    });
  };

  const handleSaveMatrix = async () => {
    if (!isSuperAdmin) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ matrix: RolePermissionMatrix }>('/api/permissions/matrix', {
        method: 'PUT',
        body: JSON.stringify({ matrix: matrixDraft }),
      });
      const normalized = normalizePermissionMatrix(res.matrix);
      setRoleMatrix(normalized);
      setMatrixDraft(normalized);
      setSuccessMsg(t('matrixSavedSuccess'));
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const userColumns: Array<DataTableColumn<UserProfile>> = [
    {
      key: 'user',
      header: t('displayNameLabel'),
      render: (u) => (
        <div>
          <p className="font-medium text-slate-900">{u.displayName}</p>
          {u.phone && <p className="font-mono-tabular text-[11px] text-slate-500">{u.phone}</p>}
        </div>
      ),
    },
    {
      key: 'email',
      header: t('emailAddress'),
      render: (u) => (
        <div>
          <p className="font-mono-tabular text-slate-700">{u.email}</p>
          <p className="text-[11px] text-slate-400">
            {u.authProvider === 'password' ? 'Email/Password' : u.authProvider || 'Firebase'}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <div>
          <span className="font-medium text-slate-800">{getRoleLabel(u.role, lang)}</span>
          {u.permissions && Object.keys(u.permissions).length > 0 && (
            <p className="text-[11px] text-sky-700">Custom Overrides</p>
          )}
        </div>
      ),
    },
    {
      key: 'binding',
      header: t('assignedScopeLabel'),
      render: (u) => {
        if (u.organizationId) {
          const org = orgMap.get(u.organizationId);
          return <span className="text-slate-700">Org: {org ? org.nameEn : u.organizationId}</span>;
        }
        if (u.trainerId) {
          const tr = trainerMap.get(u.trainerId);
          const courseCount = tr?.assignedCourseIds?.length || 0;
          const batchCount = batches.filter(
            (b) => b.trainerUserId === u.uid || b.trainerId === u.trainerId
          ).length;
          return (
            <div className="text-slate-700">
              <span>Trainer: {u.trainerId}</span>
              <p className="font-mono-tabular text-[11px] text-slate-500">
                {courseCount} courses · {batchCount} batches
              </p>
            </div>
          );
        }
        if (u.candidateId) {
          return <span className="text-slate-700">Candidate: {u.candidateId}</span>;
        }
        return <span className="text-slate-500">Global</span>;
      },
    },
    {
      key: 'lastLogin',
      header: t('lastLoginLabel'),
      render: (u) => (
        <span className="font-mono-tabular text-slate-600">
          {u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : t('neverSignedIn')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (u) => <StatusText status={u.status} />,
    },
    {
      key: 'actions',
      header: t('actions'),
      align: 'end',
      render: (u) => {
        const isSelf = u.uid === profile?.uid;
        const manageable = canManageTarget(u);
        return (
          <div className="inline-flex items-center justify-end gap-1">
            <button
              type="button"
              disabled={!manageable}
              title={t('edit')}
              onClick={() => openEditUser(u)}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!manageable || isSelf}
              title={u.status === 'active' ? t('deactivateAccount') : t('activateAccount')}
              onClick={() => setConfirmToggleUser(u)}
              className={`p-1.5 rounded disabled:opacity-35 disabled:pointer-events-none ${
                u.status === 'active'
                  ? 'text-slate-600 hover:text-red-700 hover:bg-red-50'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {u.status === 'active' ? (
                <UserX className="w-3.5 h-3.5" />
              ) : (
                <UserCheck className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              disabled={!manageable}
              title={t('sendPasswordResetAction')}
              onClick={() => setConfirmResetUser(u)}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
  ];

  const inviteColumns: Array<DataTableColumn<UserInvite>> = [
    {
      key: 'email',
      header: t('emailAddress'),
      render: (inv) => <span className="font-mono-tabular text-slate-800">{inv.email}</span>,
    },
    {
      key: 'displayName',
      header: t('displayNameLabel'),
      render: (inv) => <span>{inv.displayName || '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (inv) => <span>{getRoleLabel(inv.role, lang)}</span>,
    },
    {
      key: 'status',
      header: t('status'),
      render: (inv) => <StatusText status={inv.status} />,
    },
  ];

  const createPwCheck = validatePasswordStrength(createForm.password);

  return (
    <div className="space-y-6">
      {/* Header Tabs + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors ${
              activeTab === 'users'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('tabUsersAndInvites')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors ${
              activeTab === 'matrix'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{t('tabPermissionMatrix')}</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{t('inviteGoogleUserButton')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t('createUserButton')}</span>
            </button>
          </div>
        )}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      <NotificationBanner
        variant="success"
        message={successMsg}
        onDismiss={() => setSuccessMsg(null)}
      />

      {activeTab === 'users' ? (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-medium text-slate-500">Total Users</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-slate-900">{kpis.total}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-medium text-slate-500">{t('status_active')}</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-emerald-700">
                {kpis.active}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-medium text-slate-500">{t('status_suspended')}</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-red-700">
                {kpis.suspended}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-[11px] font-medium text-slate-500">{t('status_pending')}</p>
              <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700">
                {kpis.pendingInvites}
              </p>
            </div>
          </div>

          <SearchFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('searchPlaceholder')}
            filters={
              <>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                >
                  <option value="all">{t('filterByRole')}</option>
                  {ALL_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {getRoleLabel(r, lang)}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                >
                  <option value="all">{t('filterByStatus')}</option>
                  <option value="active">{t('status_active')}</option>
                  <option value="suspended">{t('status_suspended')}</option>
                </select>
              </>
            }
            onReset={() => {
              setSearchQuery('');
              setRoleFilter('all');
              setStatusFilter('all');
            }}
          />

          <DataTable
            columns={userColumns}
            rows={filteredUsers}
            rowKey={(u) => u.uid}
            loading={loading}
            emptyTitle={t('noRecords')}
            emptyDescription="Adjust your search or create a new TCMS account."
          />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900">
              {t('inviteGoogleUserButton')} ({invites.length})
            </h3>
            <DataTable
              columns={inviteColumns}
              rows={invites}
              rowKey={(i) => i.id}
              loading={loading}
              emptyTitle="No pending Google pre-provisions"
              emptyDescription="Use Pre-Provision Google Invite to assign a role before a Google user signs in."
            />
          </div>
        </>
      ) : (
        /* Permission Matrix Tab */
        <div className="space-y-4">
          {!isSuperAdmin && (
            <NotificationBanner variant="info" message={t('matrixReadOnlyHint')} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_USER_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setMatrixRole(r)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    matrixRole === r
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {getRoleLabel(r, lang)}
                </button>
              ))}
            </div>

            {isSuperAdmin && !isTenantOwnerRole(matrixRole) && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setMatrixDraft((prev) => ({
                      ...prev,
                      [matrixRole]: { ...DEFAULT_ROLE_PERMISSIONS[matrixRole] },
                    }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('resetMatrixDefaults')}</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveMatrix()}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
                >
                  {t('saveMatrixButton')}
                </button>
              </div>
            )}
          </div>

          {isTenantOwnerRole(matrixRole) && (
            <NotificationBanner variant="info" message={t('superAdminFullAccessLock')} />
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-start">Module / Domain</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} className="py-2.5 px-4 text-center">
                      {getPermissionActionLabel(action, lang)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {PERMISSION_DOMAINS.map((domain) => {
                  const granted = matrixDraft[matrixRole]?.[domain] || [];
                  const locked = !isSuperAdmin || isTenantOwnerRole(matrixRole);
                  return (
                    <tr key={domain} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {getPermissionDomainLabel(domain, lang)}
                      </td>
                      {PERMISSION_ACTIONS.map((action) => {
                        const checked =
                          isTenantOwnerRole(matrixRole) || granted.includes(action);
                        return (
                          <td key={action} className="py-2.5 px-4 text-center">
                            <input
                              type="checkbox"
                              disabled={locked}
                              checked={checked}
                              onChange={() => toggleMatrixCell(matrixRole, domain, action)}
                              className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-0 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal (Email + Password) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('createUserTitle')}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <p className="text-xs text-slate-600">{t('authMethodPasswordHint')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={t('displayNameLabel')} required>
              <TextInput
                required
                value={createForm.displayName}
                onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              />
            </FormField>
            <FormField label={t('emailLabel')} required>
              <TextInput
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="user@company.sa"
              />
            </FormField>
            <FormField label={t('phoneNumberLabel')}>
              <TextInput
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="+966 5X XXX XXXX"
              />
            </FormField>
            <FormField label="Role" required>
              <SelectInput
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    role: e.target.value as UserRole,
                    organizationId: '',
                    trainerId: '',
                    candidateId: '',
                  })
                }
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {getRoleLabel(r, lang)}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label={t('preferredLanguageLabel')}>
              <SelectInput
                value={createForm.preferredLanguage}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    preferredLanguage: e.target.value === 'ar' ? 'ar' : 'en',
                  })
                }
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </SelectInput>
            </FormField>
            <FormField label={t('status')}>
              <SelectInput
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    status: e.target.value === 'suspended' ? 'suspended' : 'active',
                  })
                }
              >
                <option value="active">{t('status_active')}</option>
                <option value="suspended">{t('status_suspended')}</option>
              </SelectInput>
            </FormField>
          </div>

          <FormField label={t('passwordLabel')} required>
            <div className="relative">
              <TextInput
                type={showCreatePw ? 'text' : 'password'}
                required
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowCreatePw((v) => !v)}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showCreatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={createForm.password} />
          </FormField>

          {createForm.role === 'corporate_client' && (
            <FormField label={t('companyEmployer')} required>
              <SelectInput
                required
                value={createForm.organizationId}
                onChange={(e) =>
                  setCreateForm({ ...createForm, organizationId: e.target.value })
                }
              >
                <option value="">Select Organization...</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.organizationId} — {o.nameEn}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          )}

          {createForm.role === 'trainer' && (
            <div className="space-y-3 border border-slate-200 rounded-md p-3.5 bg-slate-50/50">
              <FormField label="Bind Trainer Record">
                <SelectInput
                  value={createForm.trainerId}
                  onChange={(e) => setCreateForm({ ...createForm, trainerId: e.target.value })}
                >
                  <option value="">Select Trainer...</option>
                  {trainers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.trainerId} — {tr.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              {createForm.trainerId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700 mb-1.5">
                      {t('trainerCourseAssignments')}
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-white border border-slate-200 rounded p-2">
                      {courses.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={createForm.assignedCourseIds.includes(c.id)}
                            onChange={() =>
                              setCreateForm((prev) => ({
                                ...prev,
                                assignedCourseIds: toggleIdInList(prev.assignedCourseIds, c.id),
                              }))
                            }
                            className="rounded border-slate-300"
                          />
                          <span className="truncate">
                            {c.courseCode} — {c.titleEn}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700 mb-1.5">
                      {t('trainerBatchAssignments')}
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-white border border-slate-200 rounded p-2">
                      {batches.map((b) => (
                        <label
                          key={b.id}
                          className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={createForm.assignedBatchIds.includes(b.id)}
                            onChange={() =>
                              setCreateForm((prev) => ({
                                ...prev,
                                assignedBatchIds: toggleIdInList(prev.assignedBatchIds, b.id),
                              }))
                            }
                            className="rounded border-slate-300"
                          />
                          <span className="truncate font-mono-tabular">
                            {b.batchNumber} ({b.startDate})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {createForm.role === 'candidate' && (
            <FormField label="Bind Candidate Record">
              <SelectInput
                value={createForm.candidateId}
                onChange={(e) => setCreateForm({ ...createForm, candidateId: e.target.value })}
              >
                <option value="">Select Candidate...</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.candidateId} — {c.fullNameEn}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={createForm.sendResetEmail}
              onChange={(e) =>
                setCreateForm({ ...createForm, sendResetEmail: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            <span>{t('sendResetOnCreate')}</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-md"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !createPwCheck.valid}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {t('createUserButton')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pre-Provision Google Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('inviteGoogleUserButton')}
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Google Email" required>
              <TextInput
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="user@company.sa"
              />
            </FormField>
            <FormField label={t('displayNameLabel')}>
              <TextInput
                value={inviteForm.displayName}
                onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })}
              />
            </FormField>
            <FormField label="Role" required>
              <SelectInput
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {getRoleLabel(r, lang)}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            {inviteForm.role === 'corporate_client' && (
              <FormField label={t('companyEmployer')}>
                <SelectInput
                  value={inviteForm.organizationId}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, organizationId: e.target.value })
                  }
                >
                  <option value="">Select Organization...</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            )}

            {inviteForm.role === 'trainer' && (
              <FormField label="Bind Trainer Record">
                <SelectInput
                  value={inviteForm.trainerId}
                  onChange={(e) => setInviteForm({ ...inviteForm, trainerId: e.target.value })}
                >
                  <option value="">Select Trainer...</option>
                  {trainers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.trainerId} — {tr.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            )}

            {inviteForm.role === 'candidate' && (
              <FormField label="Bind Candidate Record">
                <SelectInput
                  value={inviteForm.candidateId}
                  onChange={(e) => setInviteForm({ ...inviteForm, candidateId: e.target.value })}
                >
                  <option value="">Select Candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.candidateId} — {c.fullNameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-md"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title={editUser ? `${t('editUserTitle')} — ${editUser.email}` : ''}
        maxWidth="max-w-3xl"
      >
        {editUser && (
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label={t('displayNameLabel')} required>
                <TextInput
                  required
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                />
              </FormField>
              <FormField label={t('phoneNumberLabel')}>
                <TextInput
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </FormField>
              <FormField label={t('preferredLanguageLabel')}>
                <SelectInput
                  value={editForm.preferredLanguage}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      preferredLanguage: e.target.value === 'ar' ? 'ar' : 'en',
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </SelectInput>
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Role">
                <SelectInput
                  disabled={editUser.uid === profile?.uid}
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                >
                  {(editUser.uid === profile?.uid ? ALL_USER_ROLES : assignableRoles).map((r) => (
                    <option key={r} value={r}>
                      {getRoleLabel(r, lang)}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label={t('status')}>
                <SelectInput
                  disabled={editUser.uid === profile?.uid}
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value === 'suspended' ? 'suspended' : 'active',
                    })
                  }
                >
                  <option value="active">{t('status_active')}</option>
                  <option value="suspended">{t('status_suspended')}</option>
                </SelectInput>
              </FormField>
              <FormField label={t('companyEmployer')}>
                <SelectInput
                  value={editForm.organizationId}
                  onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value })}
                >
                  <option value="">None</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.organizationId} — {o.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Trainer ID">
                <SelectInput
                  value={editForm.trainerId}
                  onChange={(e) => {
                    const nextTrId = e.target.value;
                    const tr = trainerMap.get(nextTrId);
                    setEditForm({
                      ...editForm,
                      trainerId: nextTrId,
                      assignedCourseIds: tr?.assignedCourseIds || [],
                    });
                  }}
                >
                  <option value="">None</option>
                  {trainers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.trainerId} — {tr.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Candidate ID">
                <SelectInput
                  value={editForm.candidateId}
                  onChange={(e) => setEditForm({ ...editForm, candidateId: e.target.value })}
                >
                  <option value="">None</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.candidateId} — {c.fullNameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            </div>

            {editForm.role === 'trainer' && editForm.trainerId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 border border-slate-200 rounded-md bg-slate-50/50">
                <div>
                  <p className="text-[11px] font-semibold text-slate-700 mb-1.5">
                    {t('trainerCourseAssignments')}
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1 bg-white border border-slate-200 rounded p-2">
                    {courses.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editForm.assignedCourseIds.includes(c.id)}
                          onChange={() =>
                            setEditForm((prev) => ({
                              ...prev,
                              assignedCourseIds: toggleIdInList(prev.assignedCourseIds, c.id),
                            }))
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="truncate">
                          {c.courseCode} — {c.titleEn}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-700 mb-1.5">
                    {t('trainerBatchAssignments')}
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-1 bg-white border border-slate-200 rounded p-2">
                    {batches.map((b) => (
                      <label
                        key={b.id}
                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editForm.assignedBatchIds.includes(b.id)}
                          onChange={() =>
                            setEditForm((prev) => ({
                              ...prev,
                              assignedBatchIds: toggleIdInList(prev.assignedBatchIds, b.id),
                            }))
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="truncate font-mono-tabular">
                          {b.batchNumber} ({b.startDate})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isSuperAdmin && editUser.uid !== profile?.uid && !isTenantOwnerRole(editForm.role) && (
              <div className="border border-slate-200 rounded-md p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {t('customUserPermissions')}
                    </p>
                    <p className="text-[11px] text-slate-500">{t('customUserPermissionsHint')}</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.useCustomPermissions}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          useCustomPermissions: e.target.checked,
                          permissions: e.target.checked
                            ? prev.permissions && Object.keys(prev.permissions).length > 0
                              ? prev.permissions
                              : { ...roleMatrix[prev.role] }
                            : {},
                        }))
                      }
                      className="rounded border-slate-300"
                    />
                    <span>Enable Override</span>
                  </label>
                </div>

                {editForm.useCustomPermissions && (
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded">
                    <table className="w-full text-start border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                          <th className="py-1.5 px-3 text-start">Domain</th>
                          {PERMISSION_ACTIONS.map((a) => (
                            <th key={a} className="py-1.5 px-2 text-center">
                              {getPermissionActionLabel(a, lang)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {PERMISSION_DOMAINS.map((domain) => {
                          const cur =
                            editForm.permissions[domain] ?? roleMatrix[editForm.role]?.[domain] ?? [];
                          return (
                            <tr key={domain}>
                              <td className="py-1.5 px-3 font-medium text-slate-800">
                                {getPermissionDomainLabel(domain, lang)}
                              </td>
                              {PERMISSION_ACTIONS.map((a) => (
                                <td key={a} className="py-1.5 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={cur.includes(a)}
                                    onChange={() => toggleEditUserPermCell(domain, a)}
                                    className="rounded border-slate-300"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
              >
                {t('save')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Activate / Deactivate Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmToggleUser)}
        title={
          confirmToggleUser?.status === 'active'
            ? t('confirmDeactivateTitle')
            : t('confirmActivateTitle')
        }
        message={`${
          confirmToggleUser?.status === 'active'
            ? t('confirmDeactivateMsg')
            : t('confirmActivateMsg')
        } (${confirmToggleUser?.email || ''})`}
        confirmLabel={
          confirmToggleUser?.status === 'active'
            ? t('deactivateAccount')
            : t('activateAccount')
        }
        danger={confirmToggleUser?.status === 'active'}
        onConfirm={() => void handleConfirmToggleStatus()}
        onCancel={() => setConfirmToggleUser(null)}
      />

      {/* Send Password Reset Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmResetUser)}
        title={t('confirmResetTitle')}
        message={`${t('confirmResetMsg')} (${confirmResetUser?.email || ''})`}
        confirmLabel={t('sendPasswordResetAction')}
        onConfirm={() => void handleConfirmPasswordReset()}
        onCancel={() => setConfirmResetUser(null)}
      />
    </div>
  );
}
