import type {
  ModuleKey,
  PermissionAction,
  PermissionDomain,
  PermissionMatrix,
  RolePermissionMatrix,
  UserProfile,
  UserRole,
} from '../types/tcms.ts';

export const PERMISSION_DOMAINS: PermissionDomain[] = [
  'dashboard',
  'candidates',
  'corporate_clients',
  'courses',
  'trainers',
  'batches',
  'enrollments',
  'attendance',
  'assessments',
  'training_cards',
  'certificates',
  'verification',
  'reports',
  'settings',
  'user_management',
  'audit_logs',
];

export const PERMISSION_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'approve',
  'delete',
];

export const ALL_USER_ROLES: UserRole[] = [
  'tenant_owner',
  'tenant_admin',
  'super_admin',
  'admin',
  'certificate_officer',
  'trainer',
  'corporate_client',
  'candidate',
];

export function isTenantOwnerRole(role?: string | null): boolean {
  return role === 'super_admin' || role === 'tenant_owner';
}

export function isTenantAdminRole(role?: string | null): boolean {
  return role === 'super_admin' || role === 'tenant_owner' || role === 'admin' || role === 'tenant_admin';
}

const ALL_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'approve', 'delete'];

export const FULL_PERMISSION_MATRIX: PermissionMatrix = {
  dashboard: [...ALL_ACTIONS],
  candidates: [...ALL_ACTIONS],
  corporate_clients: [...ALL_ACTIONS],
  courses: [...ALL_ACTIONS],
  trainers: [...ALL_ACTIONS],
  batches: [...ALL_ACTIONS],
  enrollments: [...ALL_ACTIONS],
  attendance: [...ALL_ACTIONS],
  assessments: [...ALL_ACTIONS],
  training_cards: [...ALL_ACTIONS],
  certificates: [...ALL_ACTIONS],
  verification: [...ALL_ACTIONS],
  reports: [...ALL_ACTIONS],
  settings: [...ALL_ACTIONS],
  user_management: [...ALL_ACTIONS],
  audit_logs: [...ALL_ACTIONS],
};

const TENANT_ADMIN_DEFAULT_MATRIX: PermissionMatrix = {
  dashboard: ['view'],
  candidates: ['view', 'create', 'edit'],
  corporate_clients: ['view', 'create', 'edit'],
  courses: ['view', 'create', 'edit'],
  trainers: ['view', 'create', 'edit'],
  batches: ['view', 'create', 'edit'],
  enrollments: ['view', 'create', 'edit', 'approve'],
  attendance: ['view', 'create', 'edit', 'approve'],
  assessments: ['view', 'create', 'edit', 'approve'],
  training_cards: ['view', 'create', 'edit'],
  certificates: [],
  verification: ['view'],
  reports: ['view', 'approve'],
  settings: [],
  user_management: ['view', 'create', 'edit'],
  audit_logs: [],
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMatrix = {
  tenant_owner: FULL_PERMISSION_MATRIX,
  tenant_admin: TENANT_ADMIN_DEFAULT_MATRIX,
  super_admin: FULL_PERMISSION_MATRIX,
  admin: TENANT_ADMIN_DEFAULT_MATRIX,
  certificate_officer: {
    dashboard: ['view'],
    candidates: [],
    corporate_clients: [],
    courses: [],
    trainers: [],
    batches: [],
    enrollments: ['view', 'approve'],
    attendance: ['view'],
    assessments: ['view', 'create'],
    training_cards: [],
    certificates: ['view', 'create', 'edit', 'approve', 'delete'],
    verification: ['view'],
    reports: ['view', 'approve'],
    settings: [],
    user_management: [],
    audit_logs: [],
  },
  trainer: {
    dashboard: ['view'],
    candidates: ['view'],
    corporate_clients: [],
    courses: ['view'],
    trainers: ['view'],
    batches: ['view', 'edit'],
    enrollments: ['view', 'approve'],
    attendance: ['view', 'create', 'edit'],
    assessments: ['view', 'create'],
    training_cards: ['view'],
    certificates: [],
    verification: [],
    reports: [],
    settings: [],
    user_management: [],
    audit_logs: [],
  },
  corporate_client: {
    dashboard: ['view'],
    candidates: ['view', 'create', 'edit'],
    corporate_clients: ['view'],
    courses: ['view'],
    trainers: [],
    batches: ['view'],
    enrollments: ['view', 'create'],
    attendance: ['view'],
    assessments: ['view'],
    training_cards: ['view'],
    certificates: ['view'],
    verification: [],
    reports: ['view', 'approve'],
    settings: [],
    user_management: [],
    audit_logs: [],
  },
  candidate: {
    dashboard: ['view'],
    candidates: ['view'],
    corporate_clients: [],
    courses: [],
    trainers: [],
    batches: [],
    enrollments: ['view'],
    attendance: [],
    assessments: [],
    training_cards: ['view'],
    certificates: ['view'],
    verification: [],
    reports: [],
    settings: [],
    user_management: [],
    audit_logs: [],
  },
};

export function normalizePermissionMatrix(
  raw?: Partial<Record<UserRole, Partial<PermissionMatrix>>> | null
): RolePermissionMatrix {
  const result: RolePermissionMatrix = {
    tenant_owner: FULL_PERMISSION_MATRIX,
    tenant_admin: { ...DEFAULT_ROLE_PERMISSIONS.tenant_admin },
    super_admin: FULL_PERMISSION_MATRIX,
    admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
    certificate_officer: { ...DEFAULT_ROLE_PERMISSIONS.certificate_officer },
    trainer: { ...DEFAULT_ROLE_PERMISSIONS.trainer },
    corporate_client: { ...DEFAULT_ROLE_PERMISSIONS.corporate_client },
    candidate: { ...DEFAULT_ROLE_PERMISSIONS.candidate },
  };

  if (!raw || typeof raw !== 'object') return result;

  for (const role of ALL_USER_ROLES) {
    if (isTenantOwnerRole(role)) continue;
    const roleCfg = raw[role];
    if (!roleCfg || typeof roleCfg !== 'object') continue;
    const merged: PermissionMatrix = { ...DEFAULT_ROLE_PERMISSIONS[role] };
    for (const domain of PERMISSION_DOMAINS) {
      const actions = roleCfg[domain];
      if (Array.isArray(actions)) {
        merged[domain] = actions.filter((a): a is PermissionAction =>
          PERMISSION_ACTIONS.includes(a as PermissionAction)
        );
      }
    }
    result[role] = merged;
  }

  return result;
}

export function getEffectivePermissions(
  user: Pick<UserProfile, 'role' | 'permissions'> | null | undefined,
  matrix?: RolePermissionMatrix | null
): PermissionMatrix {
  if (!user) {
    return {
      dashboard: [],
      candidates: [],
      corporate_clients: [],
      courses: [],
      trainers: [],
      batches: [],
      enrollments: [],
      attendance: [],
      assessments: [],
      training_cards: [],
      certificates: [],
      verification: [],
      reports: [],
      settings: [],
      user_management: [],
      audit_logs: [],
    };
  }
  if (isTenantOwnerRole(user.role)) {
    return FULL_PERMISSION_MATRIX;
  }
  const normalized = matrix || DEFAULT_ROLE_PERMISSIONS;
  const base = normalized[user.role] || DEFAULT_ROLE_PERMISSIONS.candidate;
  const merged: PermissionMatrix = { ...base };
  if (user.permissions && typeof user.permissions === 'object') {
    for (const domain of PERMISSION_DOMAINS) {
      const override = user.permissions[domain];
      if (Array.isArray(override)) {
        merged[domain] = override.filter((a): a is PermissionAction =>
          PERMISSION_ACTIONS.includes(a as PermissionAction)
        );
      }
    }
  }
  return merged;
}

export function hasPermission(
  user: Pick<UserProfile, 'role' | 'permissions'> | null | undefined,
  domain: PermissionDomain,
  action: PermissionAction = 'view',
  matrix?: RolePermissionMatrix | null
): boolean {
  if (!user) return false;
  if (isTenantOwnerRole(user.role)) return true;
  const eff = getEffectivePermissions(user, matrix);
  return (eff[domain] || []).includes(action);
}

const ORDERED_MODULES: ModuleKey[] = [
  'dashboard',
  'candidates',
  'corporate_clients',
  'courses',
  'trainers',
  'batches',
  'enrollments',
  'attendance',
  'assessments',
  'training_cards',
  'certificates',
  'verification',
  'certificate_templates',
  'card_templates',
  'excel_import_export',
  'notifications',
  'reports',
  'user_management',
  'audit_logs',
  'company_settings',
];

export function canAccessModule(
  user: Pick<UserProfile, 'role' | 'permissions'> | null | undefined,
  mod: ModuleKey,
  matrix?: RolePermissionMatrix | null
): boolean {
  if (!user) return false;
  if (isTenantOwnerRole(user.role)) return true;

  const eff = getEffectivePermissions(user, matrix);
  switch (mod) {
    case 'dashboard':
      return eff.dashboard.includes('view');
    case 'candidates':
      return eff.candidates.includes('view');
    case 'corporate_clients':
      return eff.corporate_clients.includes('view');
    case 'courses':
      return eff.courses.includes('view');
    case 'trainers':
      return eff.trainers.includes('view');
    case 'batches':
      return eff.batches.includes('view');
    case 'enrollments':
      return eff.enrollments.includes('view');
    case 'attendance':
      return eff.attendance.includes('view');
    case 'assessments':
      return eff.assessments.includes('view');
    case 'training_cards':
      return eff.training_cards.includes('view');
    case 'certificates':
      return eff.certificates.includes('view');
    case 'verification':
      return eff.verification.includes('view');
    case 'certificate_templates':
    case 'company_settings':
      return eff.settings.includes('view');
    case 'card_templates':
      return (
        eff.settings.includes('view') ||
        eff.training_cards.includes('create') ||
        eff.training_cards.includes('edit')
      );
    case 'excel_import_export':
      return (
        eff.candidates.includes('create') ||
        eff.attendance.includes('create') ||
        eff.reports.includes('view') ||
        eff.settings.includes('edit')
      );
    case 'notifications':
      return eff.dashboard.includes('view');
    case 'reports':
      return eff.reports.includes('view');
    case 'user_management':
      return eff.user_management.includes('view');
    case 'audit_logs':
      return eff.audit_logs.includes('view');
    default:
      return false;
  }
}

export function getAllowedNavModules(
  user: Pick<UserProfile, 'role' | 'permissions'> | null | undefined,
  matrix?: RolePermissionMatrix | null
): ModuleKey[] {
  if (!user) return [];
  return ORDERED_MODULES.filter((mod) => canAccessModule(user, mod, matrix));
}
