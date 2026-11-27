import type { Request, Response, NextFunction } from 'express';
import {
  fsCreateDoc,
  fsGetDoc,
  fsQueryTenantDocs,
  fsSetDoc,
  verifyFirebaseIdToken,
} from './firestoreRest.ts';
import { randomId } from './crypto.ts';
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  isTenantOwnerRole,
  normalizePermissionMatrix,
} from '../src/lib/permissions.ts';
import {
  assertRecordTenant,
  DEFAULT_TENANT_ID,
  detectCrossTenantBodyConflict,
  resolveTenantAuthContext,
  TenantSecurityError,
} from './tenantService.ts';
import type {
  AssessmentRecord,
  AttendanceRecord,
  Batch,
  Candidate,
  CardTemplate,
  CertificateTemplate,
  CompanySettings,
  CompletionEligibility,
  Course,
  Enrollment,
  PermissionAction,
  PermissionDomain,
  RolePermissionMatrix,
  SaasTenant,
  SaasUser,
  TenantContextSummary,
  TenantMembership,
  UserProfile,
  UserRole,
} from '../src/types/tcms.ts';

export interface AuthedRequest extends Request {
  user?: UserProfile;
  idToken?: string;
  roleMatrix?: RolePermissionMatrix;
  tenantId?: string;
  tenant?: SaasTenant;
  saasUser?: SaasUser;
  tenantMembership?: TenantMembership;
  availableMemberships?: TenantMembership[];
  isPlatformSuperAdmin?: boolean;
  strictTenantQuery?: boolean;
  tenantContext?: TenantContextSummary;
}

export async function getRolePermissionMatrix(
  idToken: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<RolePermissionMatrix> {
  try {
    const scopedId = `${tenantId}_permissions`;
    const scoped = await fsGetDoc<{ config?: Partial<RolePermissionMatrix> }>(
      'systemSettings',
      scopedId,
      idToken
    );
    if (scoped?.config) {
      return normalizePermissionMatrix(scoped.config);
    }
    if (tenantId === DEFAULT_TENANT_ID) {
      const legacy = await fsGetDoc<{ config?: Partial<RolePermissionMatrix> }>(
        'systemSettings',
        'permissions',
        idToken
      );
      if (legacy?.config) {
        return normalizePermissionMatrix(legacy.config);
      }
    }
  } catch {
    // Fall back to default role matrix
  }
  return DEFAULT_ROLE_PERMISSIONS;
}

export async function syncOrganizationUserBinding(params: {
  tenantId?: string;
  organizationId?: string;
  userId: string;
  email: string;
  displayName?: string;
  status: 'active' | 'revoked';
  idToken: string;
}): Promise<void> {
  if (!params.organizationId) return;
  const tenantId = params.tenantId || DEFAULT_TENANT_ID;
  const rawDocId =
    tenantId === DEFAULT_TENANT_ID
      ? `${params.organizationId}_${params.userId}`
      : `${tenantId}_${params.organizationId}_${params.userId}`;
  const docId = rawDocId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  try {
    await fsSetDoc(
      'organizationUsers',
      docId,
      {
        tenantId,
        organizationId: params.organizationId,
        userId: params.userId,
        email: params.email,
        ...(params.displayName ? { displayName: params.displayName.slice(0, 160) } : {}),
        status: params.status,
      },
      params.idToken,
      ['createdAt']
    );
  } catch (err) {
    console.error('Failed to sync organizationUsers binding:', err);
  }
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }
    const idToken = header.slice(7).trim();
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified.emailVerified) {
      res.status(403).json({
        error: 'Verified email address is required before accessing the system.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    const rawHeaderTenant = req.headers['x-tenant-id'];
    const requestedTenantId =
      typeof rawHeaderTenant === 'string'
        ? rawHeaderTenant.trim()
        : Array.isArray(rawHeaderTenant)
          ? String(rawHeaderTenant[0] || '').trim()
          : undefined;

    const resolved = await resolveTenantAuthContext(verified, requestedTenantId || undefined);

    const isPlatformControlPlanePath =
      req.path === '/auth/me' ||
      req.path === '/auth/logout' ||
      req.path === '/auth/preferences' ||
      req.path === '/auth/audit-password-change' ||
      req.path === '/tenant/context' ||
      req.path === '/platform' ||
      (req.path.startsWith('/platform/') && !req.path.startsWith('/platform/migration/')) ||
      req.path === '/public' ||
      req.path.startsWith('/public/');

    if (resolved.isPlatformSuperAdmin && !isPlatformControlPlanePath) {
      res.status(403).json({
        error: 'Platform Super Admin accounts do not have access to tenant workspaces.',
        code: 'PLATFORM_SUPER_ADMIN_WORKSPACE_DENIED',
      });
      return;
    }

    if (!resolved.isPlatformSuperAdmin && !req.path.startsWith('/platform/')) {
      const conflictErr = detectCrossTenantBodyConflict(req, resolved.tenantId);
      if (conflictErr) {
        res.status(403).json({ error: conflictErr, code: 'TENANT_MISMATCH' });
        return;
      }
    }

    req.user = resolved.user;
    req.idToken = idToken;
    req.tenantId = resolved.tenantId;
    req.tenant = resolved.tenant;
    req.saasUser = resolved.saasUser;
    req.tenantMembership = resolved.tenantMembership;
    req.availableMemberships = resolved.availableMemberships;
    req.isPlatformSuperAdmin = resolved.isPlatformSuperAdmin;
    req.strictTenantQuery = resolved.strictTenantQuery;
    req.tenantContext = resolved.tenantContext;
    next();
  } catch (err) {
    if (err instanceof TenantSecurityError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Unauthorized',
    });
  }
}

export function expandTenantEquivalentRoles(roles: UserRole[]): Set<UserRole> {
  const expanded = new Set<UserRole>(roles);
  if (expanded.has('super_admin')) {
    expanded.add('tenant_owner');
  }
  if (expanded.has('tenant_owner')) {
    expanded.add('super_admin');
  }
  if (expanded.has('admin')) {
    expanded.add('tenant_admin');
  }
  if (expanded.has('tenant_admin')) {
    expanded.add('admin');
  }
  return expanded;
}

export function requireRole(roles: UserRole[]) {
  const allowed = expandTenantEquivalentRoles(roles);
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.isPlatformSuperAdmin) {
      res.status(403).json({
        error: 'Platform Super Admin accounts do not have access to tenant workspaces.',
        code: 'PLATFORM_SUPER_ADMIN_WORKSPACE_DENIED',
      });
      return;
    }
    if (!allowed.has(req.user.role)) {
      res.status(403).json({ error: `Forbidden: requires one of [${roles.join(', ')}]` });
      return;
    }
    next();
  };
}

export function requirePermission(domain: PermissionDomain, action: PermissionAction = 'view') {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || !req.idToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.isPlatformSuperAdmin) {
      res.status(403).json({
        error: 'Platform Super Admin accounts do not have access to tenant workspaces.',
        code: 'PLATFORM_SUPER_ADMIN_WORKSPACE_DENIED',
      });
      return;
    }
    if (isTenantOwnerRole(req.user.role)) {
      next();
      return;
    }
    const tenantId = req.tenantId || req.user.tenantId || DEFAULT_TENANT_ID;
    const matrix = req.roleMatrix || (await getRolePermissionMatrix(req.idToken, tenantId));
    req.roleMatrix = matrix;
    if (!hasPermission(req.user, domain, action, matrix)) {
      res.status(403).json({
        error: `Forbidden: missing permission '${domain}:${action}'`,
        code: 'PERMISSION_DENIED',
      });
      return;
    }
    next();
  };
}

export async function writeAuditLog(
  user: UserProfile,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  idToken: string,
  tenantId?: string
): Promise<void> {
  const resolvedTenantId = tenantId || user.tenantId || DEFAULT_TENANT_ID;
  try {
    await fsCreateDoc(
      'auditLogs',
      randomId('audit'),
      {
        tenantId: resolvedTenantId,
        actorUid: user.uid,
        actorEmail: user.email,
        actorRole: user.role,
        action: action.slice(0, 120),
        entityType: entityType.slice(0, 80),
        entityId: entityId.slice(0, 128),
        details: details.slice(0, 2000),
      },
      idToken,
      ['createdAt']
    );
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

export async function createNotification(
  params: {
    tenantId?: string;
    targetUserId?: string;
    targetRole?: UserRole;
    organizationId?: string;
    type: string;
    titleEn: string;
    titleAr: string;
    bodyEn: string;
    bodyAr: string;
  },
  idToken: string
): Promise<void> {
  try {
    const data: Record<string, unknown> = {
      tenantId: params.tenantId || DEFAULT_TENANT_ID,
      type: params.type,
      titleEn: params.titleEn.slice(0, 200),
      titleAr: params.titleAr.slice(0, 200),
      bodyEn: params.bodyEn.slice(0, 500),
      bodyAr: params.bodyAr.slice(0, 500),
      read: false,
    };
    if (params.targetUserId) data.targetUserId = params.targetUserId;
    if (params.targetRole) data.targetRole = params.targetRole;
    if (params.organizationId) data.organizationId = params.organizationId;
    await fsCreateDoc('notifications', randomId('notif'), data, idToken, ['createdAt']);
  } catch (err) {
    console.error('Notification write failed:', err);
  }
}

export async function getCompanyBranding(
  idToken?: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<CompanySettings> {
  if (idToken) {
    try {
      const scoped = await fsGetDoc<CompanySettings>('companySettings', tenantId, idToken);
      if (scoped) return scoped;
      if (tenantId === DEFAULT_TENANT_ID) {
        const legacy = await fsGetDoc<CompanySettings>('companySettings', 'default', idToken);
        if (legacy) return legacy;
      }
    } catch {
      // Fall back to default neutral branding
    }
  }
  return {
    tenantId,
    nameEn: '',
    nameAr: '',
    legalName: '',
    crNumber: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    primaryColor: '#0F172A',
    secondaryColor: '#0284C7',
    certificateFooter: '',
    cardFooter: '',
  };
}

export async function resolveCardTemplate(
  course: Course,
  idToken: string,
  preferredTemplateId?: string,
  tenantId = DEFAULT_TENANT_ID,
  strictTenant = false
): Promise<CardTemplate | null> {
  const effectiveTenantId = course.tenantId || tenantId || DEFAULT_TENANT_ID;
  const allowFallback = !strictTenant;
  if (preferredTemplateId) {
    const preferred = await fsGetDoc<CardTemplate>('cardTemplates', preferredTemplateId, idToken);
    if (
      preferred &&
      preferred.isActive !== false &&
      assertRecordTenant(preferred, effectiveTenantId, allowFallback)
    ) {
      return preferred;
    }
  }
  if (course.defaultCardTemplateId) {
    const explicit = await fsGetDoc<CardTemplate>('cardTemplates', course.defaultCardTemplateId, idToken);
    if (
      explicit &&
      explicit.isActive !== false &&
      assertRecordTenant(explicit, effectiveTenantId, allowFallback)
    ) {
      return explicit;
    }
  }
  const all = (
    await fsQueryTenantDocs<CardTemplate>('cardTemplates', effectiveTenantId, idToken, {
      strictTenantFilter: strictTenant,
    })
  ).filter((t) => t.isActive !== false);
  const courseMatches = all
    .filter((t) => t.scope === 'course' && t.courseId === course.id)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.version || 0) - (a.version || 0));
  if (courseMatches.length > 0) return courseMatches[0];

  const commonMatches = all
    .filter((t) => t.scope === 'common')
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.version || 0) - (a.version || 0));
  return commonMatches[0] || all.find((t) => t.isDefault) || all[0] || null;
}

export async function resolveCertificateTemplate(
  course: Course,
  idToken: string,
  preferredTemplateId?: string,
  tenantId = DEFAULT_TENANT_ID,
  strictTenant = false
): Promise<CertificateTemplate | null> {
  const effectiveTenantId = course.tenantId || tenantId || DEFAULT_TENANT_ID;
  const allowFallback = !strictTenant;
  if (preferredTemplateId) {
    const preferred = await fsGetDoc<CertificateTemplate>(
      'certificateTemplates',
      preferredTemplateId,
      idToken
    );
    if (
      preferred &&
      preferred.isActive !== false &&
      assertRecordTenant(preferred, effectiveTenantId, allowFallback)
    ) {
      return preferred;
    }
  }
  if (course.defaultCertificateTemplateId) {
    const explicit = await fsGetDoc<CertificateTemplate>(
      'certificateTemplates',
      course.defaultCertificateTemplateId,
      idToken
    );
    if (
      explicit &&
      explicit.isActive !== false &&
      assertRecordTenant(explicit, effectiveTenantId, allowFallback)
    ) {
      return explicit;
    }
  }
  const all = (
    await fsQueryTenantDocs<CertificateTemplate>('certificateTemplates', effectiveTenantId, idToken, {
      strictTenantFilter: strictTenant,
    })
  ).filter((t) => t.isActive !== false);
  const courseMatches = all
    .filter((t) => t.scope === 'course' && t.courseId === course.id)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.version || 0) - (a.version || 0));
  if (courseMatches.length > 0) return courseMatches[0];

  const commonMatches = all
    .filter((t) => t.scope === 'common')
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.version || 0) - (a.version || 0));
  return commonMatches[0] || all.find((t) => t.isDefault) || all[0] || null;
}

export async function evaluateCompletionEligibility(
  enrollment: Enrollment,
  idToken: string,
  trainerUid?: string,
  tenantId?: string,
  strictTenant = false
): Promise<CompletionEligibility> {
  const effectiveTenantId = enrollment.tenantId || tenantId || DEFAULT_TENANT_ID;
  const attFilters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [
    { field: 'enrollmentId', op: 'EQUAL', value: enrollment.id },
  ];
  const assessFilters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [
    { field: 'enrollmentId', op: 'EQUAL', value: enrollment.id },
  ];
  if (trainerUid) {
    attFilters.push({ field: 'trainerUserId', op: 'EQUAL', value: trainerUid });
    assessFilters.push({ field: 'trainerUserId', op: 'EQUAL', value: trainerUid });
  }
  const [course, batch, attendanceDocs, assessmentDocs] = await Promise.all([
    fsGetDoc<Course>('courses', enrollment.courseId, idToken),
    fsGetDoc<Batch>('batches', enrollment.batchId, idToken),
    fsQueryTenantDocs<AttendanceRecord>('attendance', effectiveTenantId, idToken, {
      filters: attFilters,
      strictTenantFilter: strictTenant,
    }),
    fsQueryTenantDocs<AssessmentRecord>('assessments', effectiveTenantId, idToken, {
      filters: assessFilters,
      strictTenantFilter: strictTenant,
    }),
  ]);

  const reasons: string[] = [];
  const enrollmentConfirmed = ['confirmed', 'in_progress', 'completed'].includes(enrollment.status);
  if (!enrollmentConfirmed) reasons.push('Enrollment is not confirmed');

  const trainingCompleted = batch?.status === 'completed' || enrollment.status === 'completed';
  if (!trainingCompleted) reasons.push('Batch/training is not marked completed');

  const totalSessions = attendanceDocs.length;
  const sessionsAttended = attendanceDocs.filter((a) =>
    ['present', 'late', 'excused'].includes(a.status)
  ).length;
  const sessionsMissed = totalSessions - sessionsAttended;
  const attendancePct = totalSessions > 0 ? Math.round((sessionsAttended / totalSessions) * 100) : 0;
  const minAttendancePct = course?.minAttendancePct ?? 80;
  const attendanceMet = minAttendancePct === 0 || (totalSessions > 0 && attendancePct >= minAttendancePct);
  if (!attendanceMet) {
    reasons.push(`Attendance ${attendancePct}% is below required ${minAttendancePct}%`);
  }

  const examRequired = course?.examRequired ?? true;
  const practicalRequired = course?.practicalRequired ?? false;
  const examDocs = assessmentDocs.filter((a) =>
    ['written', 'oral', 'pass_fail'].includes(a.assessmentType)
  );
  const examPassed = !examRequired || examDocs.some((a) => a.result === 'pass');
  if (!examPassed) reasons.push('Required examination not passed');

  const practicalList = assessmentDocs.filter((a) => a.assessmentType === 'practical');
  const practicalPassed = !practicalRequired || practicalList.some((a) => a.result === 'pass');
  if (!practicalPassed) reasons.push('Required practical assessment not passed');

  const trainerRecommended = Boolean(enrollment.trainerRecommended);
  if (!trainerRecommended) reasons.push('Trainer completion recommendation not submitted');

  const completionApproved = Boolean(enrollment.completionApproved);
  if (!completionApproved) reasons.push('Authorized completion approval not recorded');

  let assessmentStatusLabel: CompletionEligibility['assessmentStatusLabel'] = 'pending';
  if (!examRequired && !practicalRequired) {
    assessmentStatusLabel = 'not_required';
  } else if (examPassed && practicalPassed) {
    assessmentStatusLabel = 'passed';
  } else if (assessmentDocs.length > 0 && assessmentDocs.every((a) => a.result === 'fail')) {
    assessmentStatusLabel = 'failed';
  }

  const checks = [
    enrollmentConfirmed,
    attendanceMet,
    examPassed,
    practicalPassed,
    trainerRecommended,
    completionApproved,
  ];
  const overallProgressPct = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const eligible =
    enrollmentConfirmed &&
    trainingCompleted &&
    attendanceMet &&
    examPassed &&
    practicalPassed &&
    trainerRecommended &&
    completionApproved;

  return {
    eligible,
    enrollmentConfirmed,
    trainingCompleted,
    totalSessions,
    sessionsAttended,
    sessionsMissed,
    attendancePct,
    minAttendancePct,
    attendanceMet,
    examRequired,
    practicalRequired,
    examPassed,
    practicalPassed,
    assessmentStatusLabel,
    overallProgressPct,
    trainerRecommended,
    completionApproved,
    reasons,
  };
}

export function sanitizeCandidateForClient(
  cand: Candidate & { iqamaEncrypted?: string; passportEncrypted?: string; iqamaHash?: string; passportHash?: string },
  viewerRole?: UserRole
): Candidate {
  const { iqamaEncrypted: _ie, passportEncrypted: _pe, iqamaHash: _ih, passportHash: _ph, ...rest } = cand;
  if (viewerRole === 'trainer') {
    const {
      iqamaMasked: _im,
      passportMasked: _pm,
      iqamaExpiryDate: _iqExp,
      passportExpiryDate: _ppExp,
      dateOfBirth: _dob,
      address: _addr,
      emergencyContact: _emg,
      notes: _notes,
      photoFileId: _photo,
      ...trainerSafe
    } = rest;
    return trainerSafe;
  }
  return rest;
}
