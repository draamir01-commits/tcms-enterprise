import type { NextFunction, Request, Response } from 'express';
import {
  fsCommit,
  fsCreateDoc,
  fsGetDoc,
  fsQueryDocs,
  fsQueryTenantDocs,
  fsSetDoc,
  fsUpdateDoc,
  type CommitWriteOp,
  type VerifiedFirebaseToken,
} from './firestoreRest.ts';
import { hashEmailKey, hashTenantEmailKey, randomId } from './crypto.ts';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../src/lib/saasDefaults.ts';
import {
  DEFAULT_COURSE_CATEGORIES,
  type CompanySettings,
  type LanguageCode,
  type PendingTenantRegistration,
  type PlatformRole,
  type SaasTenant,
  type SaasUser,
  type SubscriptionPlan,
  type SubscriptionPlanLimits,
  type TenantContextSummary,
  type TenantMembership,
  type TenantRole,
  type TenantStatus,
  type UserInvite,
  type UserProfile,
  type UserRole,
} from '../src/types/tcms.ts';

export const DEFAULT_TENANT_ID = 'tenant_default';
export const DEFAULT_TENANT_CODE = 'TEN-0001';
export const BOOTSTRAPPED_PLATFORM_OWNER_EMAIL = 'dr.aamir01@gmail.com';

export function isTenantOwnerRole(role?: UserRole | TenantRole | string | null): boolean {
  return role === 'super_admin' || role === 'tenant_owner';
}

export function isTenantAdminOrOwnerRole(role?: UserRole | TenantRole | string | null): boolean {
  return role === 'super_admin' || role === 'tenant_owner' || role === 'admin' || role === 'tenant_admin';
}

export function isPlatformRole(role?: PlatformRole | string | null): role is PlatformRole {
  return (
    role === 'platform_super_admin' ||
    role === 'platform_admin' ||
    role === 'platform_support' ||
    role === 'platform_finance'
  );
}

export class TenantSecurityError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = 'TENANT_ACCESS_DENIED') {
    super(message);
    this.name = 'TenantSecurityError';
    this.status = status;
    this.code = code;
  }
}

export function makeMembershipDocId(tenantId: string, uid: string): string {
  return `${tenantId}__${uid}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 140);
}

export function tenantScopedDocId(tenantId: string, code: string): string {
  const cleanCode = code.replace(/[^a-zA-Z0-9_\-]/g, '_');
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return cleanCode;
  }
  return `${tenantId}_${cleanCode}`.slice(0, 140);
}

export function assertRecordTenant(
  record: { tenantId?: string } | null | undefined,
  activeTenantId: string,
  allowLegacyDefaultFallback = true
): boolean {
  if (!record) return false;
  if (record.tenantId) {
    return record.tenantId === activeTenantId;
  }
  return allowLegacyDefaultFallback && activeTenantId === DEFAULT_TENANT_ID;
}

export function detectCrossTenantBodyConflict(req: Request, activeTenantId: string): string | null {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const rawBodyTenant = (req.body as Record<string, unknown>).tenantId;
    if (typeof rawBodyTenant === 'string' && rawBodyTenant.trim() && rawBodyTenant.trim() !== activeTenantId) {
      return `Cross-tenant payload rejected: body tenantId '${rawBodyTenant.trim()}' does not match active tenant '${activeTenantId}'.`;
    }
  }
  if (req.query && typeof req.query.tenantId === 'string' && req.query.tenantId.trim() && req.query.tenantId.trim() !== activeTenantId) {
    return `Cross-tenant query rejected: query tenantId '${req.query.tenantId.trim()}' does not match active tenant '${activeTenantId}'.`;
  }
  return null;
}

export async function ensureDefaultLegacyTenant(idToken: string, actorUid?: string): Promise<SaasTenant> {
  const existing = await fsGetDoc<SaasTenant>('saasTenants', DEFAULT_TENANT_ID, idToken).catch(() => null);
  if (existing) return existing;

  const company = await fsGetDoc<CompanySettings>('companySettings', 'default', idToken).catch(() => null);
  const now = new Date().toISOString();
  const tenantPayload: Record<string, unknown> = {
    tenantId: DEFAULT_TENANT_ID,
    tenantCode: DEFAULT_TENANT_CODE,
    nameEn: company?.nameEn || 'Primary Training Center',
    nameAr: company?.nameAr || 'مركز التدريب الرئيسي',
    slug: 'primary-training-center',
    legalName: company?.legalName || company?.nameEn || 'Primary Training Center',
    contactEmail: company?.email || BOOTSTRAPPED_PLATFORM_OWNER_EMAIL,
    contactPhone: company?.phone || '',
    status: 'active',
    planCode: 'enterprise',
    isDefaultLegacyTenant: true,
    migrationCompleted: false,
    onboardingCompleted: true,
    defaultLanguage: 'en',
    timezone: 'Asia/Riyadh',
    createdBy: actorUid || 'system',
    activatedAt: now,
  };
  try {
    await fsCreateDoc('saasTenants', DEFAULT_TENANT_ID, tenantPayload, idToken, ['createdAt', 'updatedAt']);
  } catch {
    // Concurrent bootstrap race
  }
  return (
    (await fsGetDoc<SaasTenant>('saasTenants', DEFAULT_TENANT_ID, idToken).catch(() => null)) || {
      id: DEFAULT_TENANT_ID,
      tenantId: DEFAULT_TENANT_ID,
      tenantCode: DEFAULT_TENANT_CODE,
      nameEn: String(tenantPayload.nameEn),
      nameAr: String(tenantPayload.nameAr),
      slug: 'primary-training-center',
      status: 'active',
      planCode: 'enterprise',
      isDefaultLegacyTenant: true,
      migrationCompleted: false,
      onboardingCompleted: true,
    }
  );
}

export async function resolveTenantSubscriptionPlan(
  _planCode?: string | null,
  _idToken?: string
): Promise<{
  code: string;
  nameEn: string;
  nameAr: string;
  limits?: SubscriptionPlanLimits;
} | null> {
  const enterprisePlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.code === 'enterprise') || {
    code: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'الباقة المؤسسية',
    limits: {
      maxCandidates: 100000,
      maxUsers: 500,
      maxBatches: 5000,
      maxCertificates: 100000,
      maxCorporateClients: 2000,
    },
  };
  return {
    code: 'enterprise',
    nameEn: enterprisePlan.nameEn,
    nameAr: enterprisePlan.nameAr,
    limits: enterprisePlan.limits,
  };
}

export type PlanLimitMetric =
  | 'maxCandidates'
  | 'maxUsers'
  | 'maxBatches'
  | 'maxCertificates'
  | 'maxCorporateClients';

const PLAN_LIMIT_META: Record<
  PlanLimitMetric,
  { collection: string; labelEn: string }
> = {
  maxCandidates: { collection: 'candidates', labelEn: 'candidates' },
  maxUsers: { collection: 'users', labelEn: 'users' },
  maxBatches: { collection: 'batches', labelEn: 'batches' },
  maxCertificates: { collection: 'certificates', labelEn: 'certificates' },
  maxCorporateClients: { collection: 'organizations', labelEn: 'corporate clients' },
};

export async function assertTenantPlanLimit(params: {
  tenantId: string;
  tenant?: SaasTenant;
  idToken: string;
  strictTenantQuery?: boolean;
  metric: PlanLimitMetric;
  incrementBy?: number;
  currentCount?: number;
}): Promise<void> {
  const { tenantId, tenant, idToken, strictTenantQuery, metric, incrementBy = 1 } = params;
  if (!tenant) return;

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw new TenantSecurityError(
      `Tenant workspace '${tenant.nameEn}' is currently ${tenant.status}. Contact platform support.`,
      403,
      tenant.status === 'cancelled' ? 'TENANT_CANCELLED' : 'TENANT_SUSPENDED'
    );
  }

  const plan = await resolveTenantSubscriptionPlan(tenant.planCode, idToken);
  const rawLimit = plan?.limits?.[metric];
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit) || rawLimit <= 0) {
    return;
  }

  const meta = PLAN_LIMIT_META[metric];
  let currentCount = params.currentCount;
  if (currentCount === undefined) {
    const existingDocs = await fsQueryTenantDocs<Record<string, unknown>>(
      meta.collection,
      tenantId,
      idToken,
      { strictTenantFilter: strictTenantQuery }
    );
    currentCount = existingDocs.length;
  }

  if (currentCount + incrementBy > rawLimit) {
    throw new TenantSecurityError(
      `Subscription plan limit reached: your '${plan?.nameEn || tenant.planCode}' plan allows up to ${rawLimit} ${meta.labelEn} (currently ${currentCount}). Please upgrade your subscription plan.`,
      403,
      'PLAN_LIMIT_REACHED'
    );
  }
}

export interface ResolvedTenantAuthResult {
  user: UserProfile;
  saasUser: SaasUser;
  tenant: SaasTenant;
  tenantId: string;
  tenantMembership?: TenantMembership;
  availableMemberships: TenantMembership[];
  isPlatformSuperAdmin: boolean;
  strictTenantQuery: boolean;
  tenantContext: TenantContextSummary;
}

export async function resolveTenantAuthContext(
  verified: VerifiedFirebaseToken,
  requestedTenantId?: string
): Promise<ResolvedTenantAuthResult> {
  const { uid, email, name, authTime, authProvider, rawToken: idToken } = verified;
  const normalizedEmail = email.trim().toLowerCase();
  const displayName = name || normalizedEmail.split('@')[0];
  const isBootstrappedOwner = normalizedEmail === BOOTSTRAPPED_PLATFORM_OWNER_EMAIL;
  const cleanRequested = requestedTenantId ? requestedTenantId.trim() : '';

  const [existingLegacyUser, existingSaasUser, defaultTenant, initialMemberships] = await Promise.all([
    fsGetDoc<UserProfile>('users', uid, idToken).catch(() => null),
    fsGetDoc<SaasUser>('saasUsers', uid, idToken).catch(() => null),
    ensureDefaultLegacyTenant(idToken, uid),
    fsQueryDocs<TenantMembership>('tenantMemberships', idToken, {
      filters: [{ field: 'uid', op: 'EQUAL', value: uid }],
    }).catch(() => []),
  ]);

  let memberships = initialMemberships;
  const nonDefaultActiveMemberships = memberships.filter(
    (m) => m.tenantId !== DEFAULT_TENANT_ID && m.status === 'active'
  );
  const isDefaultBareCandidate =
    Boolean(existingLegacyUser) &&
    existingLegacyUser!.role === 'candidate' &&
    (!existingLegacyUser!.tenantId || existingLegacyUser!.tenantId === DEFAULT_TENANT_ID) &&
    !existingLegacyUser!.candidateId &&
    !existingLegacyUser!.organizationId &&
    !existingLegacyUser!.trainerId &&
    nonDefaultActiveMemberships.length === 0;

  let pendingInvite: (UserInvite & { tenantId?: string }) | null = null;
  let pendingInviteDocId: string | null = null;

  if (!isBootstrappedOwner) {
    try {
      const emailInvites = await fsQueryDocs<UserInvite & { tenantId?: string }>('userInvites', idToken, {
        filters: [{ field: 'email', op: 'EQUAL', value: normalizedEmail }],
      });
      const pendingList = emailInvites.filter((inv) => inv.status === 'pending');
      const preferredInvite =
        (cleanRequested
          ? pendingList.find((inv) => (inv.tenantId || DEFAULT_TENANT_ID) === cleanRequested)
          : undefined) ||
        pendingList.find(
          (inv) =>
            !memberships.some(
              (m) => m.tenantId === (inv.tenantId || DEFAULT_TENANT_ID) && m.status === 'active'
            )
        ) ||
        (isDefaultBareCandidate ? pendingList[0] : undefined);
      if (preferredInvite) {
        pendingInvite = preferredInvite;
        pendingInviteDocId = preferredInvite.id;
      }
    } catch {
      const candidateInviteIds: string[] = [];
      if (cleanRequested) {
        candidateInviteIds.push(hashTenantEmailKey(cleanRequested, normalizedEmail));
      }
      if (existingSaasUser?.defaultTenantId) {
        candidateInviteIds.push(hashTenantEmailKey(existingSaasUser.defaultTenantId, normalizedEmail));
      }
      candidateInviteIds.push(hashEmailKey(normalizedEmail));
      for (const invId of candidateInviteIds) {
        const invDoc = await fsGetDoc<UserInvite & { tenantId?: string }>('userInvites', invId, idToken).catch(
          () => null
        );
        if (invDoc && invDoc.status === 'pending') {
          pendingInvite = invDoc;
          pendingInviteDocId = invId;
          break;
        }
      }
    }
  }

  // Determine user's platform role
  let platformRole: PlatformRole | null = existingSaasUser?.platformRole || existingLegacyUser?.platformRole || null;
  if (isBootstrappedOwner && !platformRole) {
    platformRole = 'platform_super_admin';
  }
  const isPlatformSuperAdmin = platformRole === 'platform_super_admin';

  // Platform Super Admins operate strictly on the SaaS Platform Control Plane and never enter tenant workspaces.
  if (isPlatformSuperAdmin) {
    const nowIso = new Date().toISOString();
    const safeDisplayName = (
      (existingSaasUser?.displayName || existingLegacyUser?.displayName || displayName || '').trim() ||
      normalizedEmail.split('@')[0] ||
      'Platform Super Admin'
    ).slice(0, 160);
    const preferredLanguage: LanguageCode =
      existingSaasUser?.preferredLanguage === 'ar' || existingLegacyUser?.preferredLanguage === 'ar'
        ? 'ar'
        : 'en';
    const platformOps: CommitWriteOp[] = [];
    let saasUserRecord: SaasUser = existingSaasUser || {
      id: uid,
      uid,
      email: normalizedEmail,
      displayName: safeDisplayName,
      preferredLanguage,
      platformRole: 'platform_super_admin',
      status: existingLegacyUser?.status || 'active',
    };

    if (!existingSaasUser) {
      platformOps.push({
        type: 'create',
        collection: 'saasUsers',
        docId: uid,
        data: {
          uid,
          email: normalizedEmail,
          displayName: safeDisplayName,
          preferredLanguage,
          platformRole: 'platform_super_admin',
          status: saasUserRecord.status,
        },
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
    } else if (existingSaasUser.platformRole !== 'platform_super_admin') {
      platformOps.push({
        type: 'update',
        collection: 'saasUsers',
        docId: uid,
        data: { platformRole: 'platform_super_admin' },
        updateFields: ['platformRole'],
        serverTimestampFields: ['updatedAt'],
      });
      saasUserRecord = { ...existingSaasUser, platformRole: 'platform_super_admin' };
    }

    let userProfile: UserProfile | null = existingLegacyUser;
    if (!existingLegacyUser) {
      const newPlatformUser: Record<string, unknown> = {
        uid,
        email: normalizedEmail,
        displayName: safeDisplayName,
        role: 'super_admin',
        preferredLanguage,
        status: 'active',
        platformRole: 'platform_super_admin',
        lastLoginAt: nowIso,
        ...(authTime ? { lastAuthTime: authTime } : {}),
        ...(authProvider ? { authProvider: authProvider.slice(0, 40) } : {}),
      };
      platformOps.push({
        type: 'create',
        collection: 'users',
        docId: uid,
        data: newPlatformUser,
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
      userProfile = { ...newPlatformUser, id: uid } as UserProfile;
    } else {
      const userUpdates: Record<string, unknown> = {};
      const updateFields: string[] = [];
      if (existingLegacyUser.platformRole !== 'platform_super_admin') {
        userUpdates.platformRole = 'platform_super_admin';
        updateFields.push('platformRole');
      }
      if (existingLegacyUser.status === 'active' && authTime && existingLegacyUser.lastAuthTime !== authTime) {
        userUpdates.lastLoginAt = nowIso;
        userUpdates.lastAuthTime = authTime;
        updateFields.push('lastLoginAt', 'lastAuthTime');
        if (authProvider) {
          userUpdates.authProvider = authProvider.slice(0, 40);
          updateFields.push('authProvider');
        }
      }
      if (updateFields.length > 0) {
        platformOps.push({
          type: 'update',
          collection: 'users',
          docId: uid,
          data: userUpdates,
          updateFields,
          serverTimestampFields: ['updatedAt'],
        });
        userProfile = { ...existingLegacyUser, ...userUpdates } as UserProfile;
      }
    }

    if (platformOps.length > 0) {
      await fsCommit(platformOps, idToken).catch((err) => {
        console.error('Platform super admin auth sync commit warning:', err);
      });
    }

    const finalPlatformUser: UserProfile = {
      ...(userProfile as UserProfile),
      uid,
      email: normalizedEmail,
      displayName: userProfile?.displayName || safeDisplayName,
      role: 'super_admin',
      tenantId: '',
      platformRole: 'platform_super_admin',
      preferredLanguage,
      status: saasUserRecord.status || 'active',
    };

    if (finalPlatformUser.status !== 'active') {
      throw new TenantSecurityError(
        'Your platform administrator account has been deactivated.',
        403,
        'ACCOUNT_SUSPENDED'
      );
    }

    return {
      user: finalPlatformUser,
      saasUser: saasUserRecord,
      tenant: defaultTenant,
      tenantId: '',
      tenantMembership: undefined,
      availableMemberships: [],
      isPlatformSuperAdmin: true,
      strictTenantQuery: true,
      tenantContext: {
        tenantId: '',
        tenantCode: 'PLATFORM',
        nameEn: 'SaaS Platform Control Plane',
        nameAr: 'لوحة تحكم المنصة',
        status: 'active',
        planCode: 'platform',
        role: 'super_admin',
        platformRole: 'platform_super_admin',
        isDefaultLegacyTenant: false,
        migrationCompleted: true,
        availableTenants: [],
      },
    };
  }

  // If this verified user has a pending self-service tenant registration, claim and provision it first
  let claimedPendingTenant: SaasTenant | null = null;
  let claimedPendingReg: PendingTenantRegistration | null = null;
  if ((!existingLegacyUser || isDefaultBareCandidate) && !pendingInvite) {
    claimedPendingReg = await fsGetDoc<PendingTenantRegistration>(
      'pendingTenantRegistrations',
      uid,
      idToken
    ).catch(() => null);
    if (claimedPendingReg && claimedPendingReg.proposedTenantId) {
      claimedPendingTenant = await claimPendingTenantRegistration({
        uid,
        email: normalizedEmail,
        preferredLanguage: claimedPendingReg.defaultLanguage || 'en',
        idToken,
        pendingReg: claimedPendingReg,
      });
      // Reload memberships/profile synced by claimPendingTenantRegistration
      memberships = await fsQueryDocs<TenantMembership>('tenantMemberships', idToken, {
        filters: [{ field: 'uid', op: 'EQUAL', value: uid }],
      }).catch(() => memberships);
    }
  }

  // Reload profile if claimPendingTenantRegistration just created/updated it
  const resolvedLegacyUser = claimedPendingTenant
    ? await fsGetDoc<UserProfile>('users', uid, idToken).catch(() => existingLegacyUser)
    : existingLegacyUser;
  const resolvedSaasUser = claimedPendingTenant
    ? await fsGetDoc<SaasUser>('saasUsers', uid, idToken).catch(() => existingSaasUser)
    : existingSaasUser;

  // Resolve legacy/default tenant assignment when migrating seamlessly from single-tenant users
  const legacyTenantId =
    claimedPendingTenant?.tenantId ||
    pendingInvite?.tenantId ||
    resolvedLegacyUser?.tenantId ||
    resolvedSaasUser?.defaultTenantId ||
    DEFAULT_TENANT_ID;

  // Determine active tenantId
  let activeTenantId = legacyTenantId;

  if (cleanRequested) {
    const authorizedMembership = memberships.find(
      (m) => m.tenantId === cleanRequested && m.status === 'active'
    );
    const authorizedViaLegacy =
      resolvedLegacyUser &&
      (resolvedLegacyUser.tenantId || DEFAULT_TENANT_ID) === cleanRequested;
    const authorizedViaClaimed = claimedPendingTenant?.tenantId === cleanRequested;
    const authorizedViaInvite =
      Boolean(pendingInvite) && (pendingInvite!.tenantId || DEFAULT_TENANT_ID) === cleanRequested;
    if (!authorizedMembership && !authorizedViaLegacy && !authorizedViaClaimed && !authorizedViaInvite) {
      throw new TenantSecurityError(
        `Access denied for requested tenant workspace '${cleanRequested}'.`,
        403,
        'TENANT_ACCESS_DENIED'
      );
    }
    activeTenantId = cleanRequested;
  } else if (claimedPendingTenant) {
    activeTenantId = claimedPendingTenant.tenantId;
  } else if (pendingInvite) {
    activeTenantId = pendingInvite.tenantId || DEFAULT_TENANT_ID;
  } else if (memberships.length > 0) {
    const preferred =
      memberships.find((m) => m.tenantId === resolvedSaasUser?.defaultTenantId && m.status === 'active') ||
      memberships.find((m) => m.tenantId !== DEFAULT_TENANT_ID && m.status === 'active') ||
      memberships.find((m) => m.status === 'active');
    if (preferred) {
      activeTenantId = preferred.tenantId;
    }
  }

  // Load active tenant
  const activeTenant: SaasTenant | null =
    claimedPendingTenant && claimedPendingTenant.tenantId === activeTenantId
      ? claimedPendingTenant
      : activeTenantId === DEFAULT_TENANT_ID
        ? defaultTenant
        : await fsGetDoc<SaasTenant>('saasTenants', activeTenantId, idToken).catch(() => null);

  if (!activeTenant) {
    throw new TenantSecurityError(
      `Tenant workspace '${activeTenantId}' was not found.`,
      404,
      'TENANT_NOT_FOUND'
    );
  }

  if (activeTenant.status === 'suspended' || activeTenant.status === 'cancelled') {
    throw new TenantSecurityError(
      `Tenant workspace '${activeTenant.nameEn}' is currently ${activeTenant.status}. Contact platform support.`,
      403,
      activeTenant.status === 'cancelled' ? 'TENANT_CANCELLED' : 'TENANT_SUSPENDED'
    );
  }

  // Determine effective role inside the active tenant
  const activeMembership = memberships.find((m) => m.tenantId === activeTenantId);
  if (activeMembership && activeMembership.status === 'suspended') {
    throw new TenantSecurityError(
      'Your access to this tenant workspace has been suspended. Contact a Training Center Administrator.',
      403,
      'ACCOUNT_SUSPENDED'
    );
  }
  const claimingInviteForActiveTenant =
    Boolean(pendingInvite) && (pendingInvite!.tenantId || DEFAULT_TENANT_ID) === activeTenantId;
  const ownsActiveTenant = Boolean(activeTenant.ownerUserId && activeTenant.ownerUserId === uid);

  let effectiveRole: UserRole =
    (claimingInviteForActiveTenant && (!activeMembership || isDefaultBareCandidate)
      ? pendingInvite?.role
      : undefined) ||
    (ownsActiveTenant ? 'tenant_owner' : undefined) ||
    (activeMembership?.role as UserRole) ||
    resolvedLegacyUser?.role ||
    (claimedPendingTenant ? 'tenant_owner' : isBootstrappedOwner ? 'super_admin' : pendingInvite?.role || 'candidate');

  if (isBootstrappedOwner && !activeMembership && !resolvedLegacyUser) {
    effectiveRole = 'tenant_owner';
  }

  const organizationId =
    (claimingInviteForActiveTenant ? pendingInvite?.organizationId : undefined) ??
    activeMembership?.organizationId ??
    resolvedLegacyUser?.organizationId;
  const trainerId =
    (claimingInviteForActiveTenant ? pendingInvite?.trainerId : undefined) ??
    activeMembership?.trainerId ??
    resolvedLegacyUser?.trainerId;
  const candidateId =
    (claimingInviteForActiveTenant ? pendingInvite?.candidateId : undefined) ??
    activeMembership?.candidateId ??
    resolvedLegacyUser?.candidateId;

  const ops: CommitWriteOp[] = [];
  const nowIso = new Date().toISOString();
  let userProfile: UserProfile | null = resolvedLegacyUser;
  let criticalBootstrapWrite = Boolean(pendingInviteDocId);

  // Bootstrap or update users/{uid}
  if (!resolvedLegacyUser) {
    criticalBootstrapWrite = true;
    const safeDisplayName = (
      (claimedPendingReg?.ownerDisplayName || '').trim() ||
      (pendingInvite?.displayName || '').trim() ||
      (displayName || '').trim() ||
      normalizedEmail.split('@')[0] ||
      'User'
    ).slice(0, 160);
    const safePhone = claimedPendingReg?.ownerMobile
      ? claimedPendingReg.ownerMobile.trim().slice(0, 32)
      : '';
    const newProfile: Record<string, unknown> = {
      uid,
      email: normalizedEmail,
      displayName: safeDisplayName,
      ...(safePhone ? { phone: safePhone } : {}),
      role: effectiveRole,
      tenantId: activeTenantId,
      preferredLanguage: claimedPendingReg?.defaultLanguage || 'en',
      status: 'active',
      lastLoginAt: nowIso,
      ...(platformRole ? { platformRole } : {}),
      ...(authTime ? { lastAuthTime: authTime } : {}),
      ...(authProvider ? { authProvider: authProvider.slice(0, 40) } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(trainerId ? { trainerId } : {}),
      ...(candidateId ? { candidateId } : {}),
    };
    ops.push({
      type: 'create',
      collection: 'users',
      docId: uid,
      data: newProfile,
      serverTimestampFields: ['createdAt', 'updatedAt'],
    });
    userProfile = {
      ...newProfile,
      id: uid,
    } as UserProfile;
  } else if (isDefaultBareCandidate && claimingInviteForActiveTenant) {
    criticalBootstrapWrite = true;
    const upgradeData: Record<string, unknown> = {
      tenantId: activeTenantId,
      role: effectiveRole,
      lastLoginAt: nowIso,
      ...(authTime ? { lastAuthTime: authTime } : {}),
      ...(authProvider ? { authProvider } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(trainerId ? { trainerId } : {}),
      ...(candidateId ? { candidateId } : {}),
    };
    const upgradeFields = Object.keys(upgradeData);
    ops.push({
      type: 'update',
      collection: 'users',
      docId: uid,
      data: upgradeData,
      updateFields: upgradeFields,
      serverTimestampFields: ['updatedAt'],
    });
    userProfile = {
      ...resolvedLegacyUser,
      ...upgradeData,
    } as UserProfile;
  } else {
    const userUpdates: Record<string, unknown> = {};
    const updateFields: string[] = [];
    const membershipAllowsSync =
      (activeMembership && activeMembership.status === 'active' && activeMembership.role === effectiveRole) ||
      (ownsActiveTenant && effectiveRole === 'tenant_owner');

    if (!resolvedLegacyUser.tenantId || (membershipAllowsSync && resolvedLegacyUser.tenantId !== activeTenantId)) {
      userUpdates.tenantId = activeTenantId;
      updateFields.push('tenantId');
      criticalBootstrapWrite = true;
    }
    if (membershipAllowsSync && resolvedLegacyUser.role !== effectiveRole) {
      userUpdates.role = effectiveRole;
      updateFields.push('role');
      criticalBootstrapWrite = true;
    }
    if (platformRole && resolvedLegacyUser.platformRole !== platformRole) {
      userUpdates.platformRole = platformRole;
      updateFields.push('platformRole');
    }
    if (resolvedLegacyUser.status === 'active' && authTime && resolvedLegacyUser.lastAuthTime !== authTime) {
      userUpdates.lastLoginAt = nowIso;
      userUpdates.lastAuthTime = authTime;
      updateFields.push('lastLoginAt', 'lastAuthTime');
      if (authProvider) {
        userUpdates.authProvider = authProvider;
        updateFields.push('authProvider');
      }
    }
    if (updateFields.length > 0) {
      ops.push({
        type: 'update',
        collection: 'users',
        docId: uid,
        data: userUpdates,
        updateFields,
        serverTimestampFields: ['updatedAt'],
      });
      userProfile = {
        ...resolvedLegacyUser,
        ...userUpdates,
      } as UserProfile;
    }
  }

  // Bootstrap or sync saasUsers/{uid}
  const safeSaasDisplayName = (
    (userProfile?.displayName || '').trim() ||
    (displayName || '').trim() ||
    normalizedEmail.split('@')[0] ||
    'User'
  ).slice(0, 160);
  let saasUserRecord: SaasUser = resolvedSaasUser || {
    id: uid,
    uid,
    email: normalizedEmail,
    displayName: safeSaasDisplayName,
    platformRole,
    defaultTenantId: activeTenantId,
    status: userProfile?.status || 'active',
  };
  if (!resolvedSaasUser) {
    ops.push({
      type: 'create',
      collection: 'saasUsers',
      docId: uid,
      data: {
        uid,
        email: normalizedEmail,
        displayName: safeSaasDisplayName,
        ...(platformRole ? { platformRole } : {}),
        defaultTenantId: activeTenantId,
        status: saasUserRecord.status,
      },
      serverTimestampFields: ['createdAt', 'updatedAt'],
    });
  } else {
    const saasUpdates: Record<string, unknown> = {};
    const saasFields: string[] = [];
    if (platformRole && resolvedSaasUser.platformRole !== platformRole) {
      saasUpdates.platformRole = platformRole;
      saasFields.push('platformRole');
    }
    if (
      (claimingInviteForActiveTenant || claimedPendingTenant) &&
      resolvedSaasUser.defaultTenantId !== activeTenantId
    ) {
      saasUpdates.defaultTenantId = activeTenantId;
      saasFields.push('defaultTenantId');
    }
    if (saasFields.length > 0) {
      ops.push({
        type: 'update',
        collection: 'saasUsers',
        docId: uid,
        data: saasUpdates,
        updateFields: saasFields,
        serverTimestampFields: ['updatedAt'],
      });
      saasUserRecord = { ...resolvedSaasUser, ...saasUpdates };
    }
  }

  // Bootstrap membership for new/invited/legacy users or platform super admin inspection
  const membershipDocId = makeMembershipDocId(activeTenantId, uid);
  let resolvedMembership: TenantMembership | undefined =
    activeMembership ||
    (await fsGetDoc<TenantMembership>('tenantMemberships', membershipDocId, idToken).catch(() => null)) ||
    undefined;

  if (!resolvedMembership || (claimingInviteForActiveTenant && isDefaultBareCandidate && resolvedMembership.role !== effectiveRole)) {
    const membershipRole: UserRole = effectiveRole;
    const membershipData: Record<string, unknown> = {
      tenantId: activeTenantId,
      uid,
      email: normalizedEmail,
      displayName: safeSaasDisplayName,
      role: membershipRole,
      status: userProfile?.status === 'suspended' ? 'suspended' : 'active',
      ...(organizationId ? { organizationId } : {}),
      ...(trainerId ? { trainerId } : {}),
      ...(candidateId ? { candidateId } : {}),
    };
    if (!resolvedMembership) {
      ops.push({
        type: 'create',
        collection: 'tenantMemberships',
        docId: membershipDocId,
        data: membershipData,
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
      resolvedMembership = {
        id: membershipDocId,
        ...membershipData,
      } as TenantMembership;
      memberships = [...memberships, resolvedMembership];
    } else {
      ops.push({
        type: 'update',
        collection: 'tenantMemberships',
        docId: membershipDocId,
        data: {
          role: membershipRole,
          ...(organizationId ? { organizationId } : {}),
          ...(trainerId ? { trainerId } : {}),
          ...(candidateId ? { candidateId } : {}),
        },
        updateFields: [
          'role',
          ...(organizationId ? ['organizationId'] : []),
          ...(trainerId ? ['trainerId'] : []),
          ...(candidateId ? ['candidateId'] : []),
        ],
        serverTimestampFields: ['updatedAt'],
      });
      resolvedMembership = {
        ...resolvedMembership,
        role: membershipRole,
      };
      memberships = memberships.map((m) => (m.id === membershipDocId ? resolvedMembership! : m));
    }
  } else if (!activeMembership) {
    memberships = [...memberships, resolvedMembership];
  }

  // Mark pending invite as claimed LAST so users/tenantMemberships creation rules still see status == 'pending'
  if (pendingInviteDocId && claimingInviteForActiveTenant) {
    ops.push({
      type: 'update',
      collection: 'userInvites',
      docId: pendingInviteDocId,
      data: { status: 'claimed', tenantId: activeTenantId },
      updateFields: ['status', 'tenantId'],
      serverTimestampFields: ['updatedAt'],
    });
  }

  if (ops.length > 0) {
    const runOps = async () => {
      if (ops.length === 1) {
        await fsCommit(ops, idToken);
        return;
      }
      try {
        await fsCommit(ops, idToken);
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        if (!msg.includes('(403)')) {
          throw batchErr;
        }
        console.warn('Multi-op tenant bootstrap commit returned 403; retrying sequentially per op:', msg);
        for (const op of ops) {
          await fsCommit([op], idToken);
        }
      }
    };

    if (criticalBootstrapWrite) {
      await runOps();
    } else {
      await runOps().catch((err) => {
        console.error('Tenant auth context sync commit warning:', err);
      });
    }
  }

  const finalUser: UserProfile = {
    ...(userProfile as UserProfile),
    uid,
    email,
    displayName: userProfile?.displayName || displayName,
    role: effectiveRole,
    tenantId: activeTenantId,
    ...(platformRole ? { platformRole } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(trainerId ? { trainerId } : {}),
    ...(candidateId ? { candidateId } : {}),
  };

  if (finalUser.status !== 'active') {
    throw new TenantSecurityError(
      'Your account has been deactivated. Contact a Training Center Administrator.',
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  const strictTenantQuery = activeTenantId !== DEFAULT_TENANT_ID || Boolean(activeTenant.migrationCompleted);
  const resolvedPlan = await resolveTenantSubscriptionPlan(activeTenant.planCode, idToken).catch(() => null);

  const tenantContext: TenantContextSummary = {
    tenantId: activeTenant.tenantId,
    tenantCode: activeTenant.tenantCode,
    nameEn: activeTenant.nameEn,
    nameAr: activeTenant.nameAr,
    status: activeTenant.status,
    planCode: activeTenant.planCode,
    ...(resolvedPlan?.nameEn ? { planNameEn: resolvedPlan.nameEn } : {}),
    ...(resolvedPlan?.nameAr ? { planNameAr: resolvedPlan.nameAr } : {}),
    ...(activeTenant.trialEndsAt ? { trialEndsAt: activeTenant.trialEndsAt } : {}),
    ...(resolvedPlan?.limits ? { limits: resolvedPlan.limits } : {}),
    role: effectiveRole,
    platformRole,
    isDefaultLegacyTenant: Boolean(activeTenant.isDefaultLegacyTenant),
    migrationCompleted: Boolean(activeTenant.migrationCompleted),
    availableTenants: memberships
      .filter((m) => m.status === 'active')
      .map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
        nameEn: m.tenantId === activeTenant.tenantId ? activeTenant.nameEn : m.tenantId,
        nameAr: m.tenantId === activeTenant.tenantId ? activeTenant.nameAr : m.tenantId,
      })),
  };

  return {
    user: finalUser,
    saasUser: saasUserRecord,
    tenant: activeTenant,
    tenantId: activeTenantId,
    tenantMembership: resolvedMembership,
    availableMemberships: memberships,
    isPlatformSuperAdmin,
    strictTenantQuery,
    tenantContext,
  };
}

export function requirePlatformRole(allowed: PlatformRole[]) {
  return (req: Request & { isPlatformSuperAdmin?: boolean; saasUser?: SaasUser; user?: UserProfile }, res: Response, next: NextFunction): void => {
    const pRole = req.saasUser?.platformRole || req.user?.platformRole;
    if (!pRole || !allowed.includes(pRole)) {
      res.status(403).json({
        error: `Forbidden: requires platform role [${allowed.join(', ')}]`,
        code: 'PLATFORM_ROLE_REQUIRED',
      });
      return;
    }
    next();
  };
}

export function requirePlatformSuperAdmin() {
  return requirePlatformRole(['platform_super_admin']);
}

export async function writePlatformAuditLog(
  actor: Pick<UserProfile, 'uid' | 'email'>,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  idToken: string,
  tenantId?: string,
  platformRole: PlatformRole = 'platform_super_admin'
): Promise<void> {
  try {
    await fsCreateDoc(
      'platformAuditLogs',
      randomId('paudit'),
      {
        actorUid: actor.uid,
        actorEmail: actor.email,
        platformRole,
        action: action.slice(0, 120),
        entityType: entityType.slice(0, 80),
        entityId: entityId.slice(0, 128),
        details: details.slice(0, 2000),
        ...(tenantId ? { tenantId } : {}),
      },
      idToken,
      ['createdAt']
    );
  } catch (err) {
    console.error('Platform audit log write failed:', err);
  }
}

const VALID_TENANT_STATUSES: TenantStatus[] = [
  'trial',
  'active',
  'grace_period',
  'suspended',
  'cancelled',
];

export async function createSaasTenantWorkspace(params: {
  nameEn: string;
  nameAr?: string;
  slug?: string;
  legalName?: string;
  planCode?: string;
  status?: TenantStatus;
  defaultLanguage?: LanguageCode;
  timezone?: string;
  contactEmail?: string;
  contactPhone?: string;
  ownerEmail?: string;
  ownerDisplayName?: string;
  ownerUid?: string;
  country?: string;
  actor: UserProfile;
  idToken: string;
}): Promise<SaasTenant> {
  const existing = await fsQueryDocs<SaasTenant>('saasTenants', params.idToken).catch(() => []);
  const nextNumber = existing.length + 1;
  const tenantCode = `TEN-${String(nextNumber).padStart(4, '0')}`;
  const cleanSlug =
    (params.slug || params.nameEn)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `tenant-${nextNumber}`;
  const tenantId = `ten_${cleanSlug.replace(/[^a-z0-9]/g, '_').slice(0, 28)}_${randomId('').slice(0, 6)}`;
  const ownerEmail = (params.ownerEmail || params.contactEmail || params.actor.email)
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const status: TenantStatus =
    params.status && VALID_TENANT_STATUSES.includes(params.status) ? params.status : 'active';
  const planCode = (params.planCode || 'starter').trim().slice(0, 48) || 'starter';
  const defaultLanguage: LanguageCode = params.defaultLanguage === 'ar' ? 'ar' : 'en';
  const timezone = (params.timezone || 'Asia/Riyadh').trim().slice(0, 64) || 'Asia/Riyadh';

  const safeNameEn = params.nameEn.trim().slice(0, 200);
  const rawNameAr = (params.nameAr || '').trim();
  const safeNameAr = (rawNameAr.length >= 2 ? rawNameAr : safeNameEn).slice(0, 200);

  const payload: Record<string, unknown> = {
    tenantId,
    tenantCode,
    nameEn: safeNameEn,
    nameAr: safeNameAr,
    legalName: (params.legalName || safeNameEn).trim().slice(0, 240),
    slug: cleanSlug,
    contactEmail: (params.contactEmail || ownerEmail).trim().slice(0, 200),
    contactPhone: (params.contactPhone || '').trim().slice(0, 32),
    country: (params.country || 'SA').trim().slice(0, 80),
    status,
    planCode,
    isDefaultLegacyTenant: false,
    migrationCompleted: true,
    onboardingCompleted: false,
    defaultLanguage,
    timezone,
    ...(params.ownerUid ? { ownerUserId: params.ownerUid } : {}),
    createdBy: params.actor.uid,
    activatedAt: new Date().toISOString(),
  };

  await fsCreateDoc('saasTenants', tenantId, payload, params.idToken, ['createdAt', 'updatedAt']);

  // Seed initial tenant branding & general settings cleanly
  await fsCommit(
    [
      {
        type: 'create',
        collection: 'companySettings',
        docId: tenantId,
        data: {
          tenantId,
          nameEn: payload.nameEn,
          nameAr: payload.nameAr,
          legalName: payload.legalName,
          crNumber: '',
          address: '',
          phone: payload.contactPhone || '',
          email: payload.contactEmail || '',
          website: '',
          primaryColor: '#0F172A',
          secondaryColor: '#0284C7',
          certificateFooter: '',
          cardFooter: '',
          updatedBy: params.actor.uid,
        },
        serverTimestampFields: ['updatedAt'],
      },
      {
        type: 'create',
        collection: 'systemSettings',
        docId: `${tenantId}_general`,
        data: {
          tenantId,
          key: 'general',
          config: {
            courseCategories: DEFAULT_COURSE_CATEGORIES,
            retentionDays: 1825,
            pdplDisclosureMode: 'full_name',
          },
          updatedBy: params.actor.uid,
        },
        serverTimestampFields: ['updatedAt'],
      },
    ],
    params.idToken
  ).catch((err) => {
    console.error('Tenant initial settings seed warning:', err);
  });

  // Provision initial tenant_owner profile + membership (when ownerUid exists) or pending invite
  if (params.ownerUid) {
    const ownerName = (params.ownerDisplayName || ownerEmail.split('@')[0]).slice(0, 160);
    const memDocId = makeMembershipDocId(tenantId, params.ownerUid);
    await fsCommit(
      [
        {
          type: 'create',
          collection: 'users',
          docId: params.ownerUid,
          data: {
            uid: params.ownerUid,
            email: ownerEmail,
            displayName: ownerName,
            role: 'tenant_owner',
            tenantId,
            preferredLanguage: defaultLanguage,
            status: 'active',
            authProvider: 'password',
            createdBy: params.actor.uid,
          },
          serverTimestampFields: ['createdAt', 'updatedAt'],
        },
        {
          type: 'create',
          collection: 'saasUsers',
          docId: params.ownerUid,
          data: {
            uid: params.ownerUid,
            email: ownerEmail,
            displayName: ownerName,
            preferredLanguage: defaultLanguage,
            defaultTenantId: tenantId,
            status: 'active',
          },
          serverTimestampFields: ['createdAt', 'updatedAt'],
        },
        {
          type: 'create',
          collection: 'tenantMemberships',
          docId: memDocId,
          data: {
            tenantId,
            uid: params.ownerUid,
            email: ownerEmail,
            displayName: ownerName,
            role: 'tenant_owner',
            status: 'active',
            isDefault: true,
            createdBy: params.actor.uid,
          },
          serverTimestampFields: ['createdAt', 'updatedAt'],
        },
      ],
      params.idToken
    );
  } else if (ownerEmail) {
    const inviteDocId = hashTenantEmailKey(tenantId, ownerEmail);
    await fsCreateDoc(
      'userInvites',
      inviteDocId,
      {
        tenantId,
        email: ownerEmail,
        displayName: (params.ownerDisplayName || ownerEmail.split('@')[0]).slice(0, 160),
        role: 'tenant_owner',
        status: 'pending',
        createdBy: params.actor.uid,
      },
      params.idToken,
      ['createdAt', 'updatedAt']
    );
  }

  await writePlatformAuditLog(
    params.actor,
    'CREATE_SAAS_TENANT',
    'saasTenants',
    tenantId,
    `Created tenant workspace ${tenantCode} (${payload.nameEn}) on plan ${planCode} [${status}]`,
    params.idToken,
    tenantId
  );

  const created = await fsGetDoc<SaasTenant>('saasTenants', tenantId, params.idToken);
  return created || ({ id: tenantId, ...payload } as SaasTenant);
}

export async function claimPendingTenantRegistration(params: {
  uid: string;
  email: string;
  preferredLanguage?: LanguageCode;
  idToken: string;
  pendingReg: PendingTenantRegistration;
}): Promise<SaasTenant> {
  const tenantId = params.pendingReg.proposedTenantId;
  const existingTenant = await fsGetDoc<SaasTenant>('saasTenants', tenantId, params.idToken).catch(() => null);

  const cleanSlug =
    params.pendingReg.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || tenantId;
  const nowIso = new Date().toISOString();
  const trialEndsIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const tenantCode = `TEN-${randomId('').slice(0, 6).toUpperCase()}`;

  const safeNameEn = params.pendingReg.nameEn.trim().slice(0, 200);
  const rawNameAr = (params.pendingReg.nameAr || '').trim();
  const safeNameAr = (rawNameAr.length >= 2 ? rawNameAr : safeNameEn).slice(0, 200);
  const normalizedEmail = params.email.trim().toLowerCase();

  const tenantPayload: Record<string, unknown> = {
    tenantId,
    tenantCode,
    nameEn: safeNameEn,
    nameAr: safeNameAr,
    legalName: (params.pendingReg.legalName || safeNameEn).slice(0, 240),
    ...(params.pendingReg.crNumber ? { crNumber: params.pendingReg.crNumber.slice(0, 64) } : {}),
    ...(params.pendingReg.vatNumber ? { vatNumber: params.pendingReg.vatNumber.slice(0, 40) } : {}),
    slug: cleanSlug,
    contactEmail: (params.pendingReg.companyEmail || normalizedEmail).slice(0, 200),
    contactPhone: (params.pendingReg.companyPhone || params.pendingReg.ownerMobile || '').slice(0, 40),
    country: (params.pendingReg.country || 'Saudi Arabia').slice(0, 80),
    ...(params.pendingReg.city ? { city: params.pendingReg.city.slice(0, 120) } : {}),
    ...(params.pendingReg.address ? { address: params.pendingReg.address.slice(0, 400) } : {}),
    ...(params.pendingReg.website ? { website: params.pendingReg.website.slice(0, 200) } : {}),
    status: 'trial',
    planCode: (params.pendingReg.planCode || 'professional').slice(0, 48),
    billingCycle: params.pendingReg.billingCycle === 'annual' ? 'annual' : 'monthly',
    trialStartsAt: nowIso,
    trialEndsAt: trialEndsIso,
    isDefaultLegacyTenant: false,
    migrationCompleted: true,
    onboardingCompleted: false,
    defaultLanguage: params.pendingReg.defaultLanguage === 'ar' ? 'ar' : 'en',
    timezone: 'Asia/Riyadh',
    ownerUserId: params.uid,
    createdBy: params.uid,
    activatedAt: nowIso,
  };

  if (!existingTenant) {
    // Step 1: Create the tenant document first so Firestore rules see ownsActiveRegisteredTenant(tenantId)
    await fsCreateDoc('saasTenants', tenantId, tenantPayload, params.idToken, ['createdAt', 'updatedAt']);
  }

  const ownerDisplayName = (
    (params.pendingReg.ownerDisplayName || '').trim() ||
    normalizedEmail.split('@')[0] ||
    'Owner'
  ).slice(0, 160);
  const preferredLanguage: LanguageCode = params.pendingReg.defaultLanguage === 'ar' ? 'ar' : 'en';
  const membershipDocId = makeMembershipDocId(tenantId, params.uid);

  // Check Step 2 target documents so retries never issue blind set overwrites on existing docs
  const [
    existingCompanySettings,
    existingSystemSettings,
    existingMembership,
    existingUserDoc,
    existingSaasUserDoc,
  ] = await Promise.all([
    fsGetDoc<CompanySettings>('companySettings', tenantId, params.idToken).catch(() => null),
    fsGetDoc<Record<string, unknown>>('systemSettings', `${tenantId}_general`, params.idToken).catch(() => null),
    fsGetDoc<TenantMembership>('tenantMemberships', membershipDocId, params.idToken).catch(() => null),
    fsGetDoc<UserProfile>('users', params.uid, params.idToken).catch(() => null),
    fsGetDoc<SaasUser>('saasUsers', params.uid, params.idToken).catch(() => null),
  ]);

  const step2Ops: CommitWriteOp[] = [];

  if (!existingCompanySettings) {
    step2Ops.push({
      type: 'create',
      collection: 'companySettings',
      docId: tenantId,
      data: {
        tenantId,
        nameEn: tenantPayload.nameEn,
        nameAr: tenantPayload.nameAr,
        legalName: tenantPayload.legalName,
        crNumber: params.pendingReg.crNumber || '',
        address: [params.pendingReg.address, params.pendingReg.city, params.pendingReg.country]
          .filter(Boolean)
          .join(', ')
          .slice(0, 400),
        phone: tenantPayload.contactPhone || '',
        email: tenantPayload.contactEmail || '',
        website: params.pendingReg.website || '',
        primaryColor: '#0F172A',
        secondaryColor: '#0284C7',
        certificateFooter: '',
        cardFooter: '',
        updatedBy: params.uid,
      },
      serverTimestampFields: ['updatedAt'],
    });
  }

  if (!existingSystemSettings) {
    step2Ops.push({
      type: 'create',
      collection: 'systemSettings',
      docId: `${tenantId}_general`,
      data: {
        tenantId,
        key: 'general',
        config: {
          courseCategories: DEFAULT_COURSE_CATEGORIES,
          retentionDays: 1825,
          pdplDisclosureMode: 'full_name',
        },
        updatedBy: params.uid,
      },
      serverTimestampFields: ['updatedAt'],
    });
  }

  if (!existingMembership) {
    step2Ops.push({
      type: 'create',
      collection: 'tenantMemberships',
      docId: membershipDocId,
      data: {
        tenantId,
        uid: params.uid,
        email: normalizedEmail,
        displayName: ownerDisplayName,
        role: 'tenant_owner',
        status: 'active',
        isDefault: true,
        createdBy: params.uid,
      },
      serverTimestampFields: ['createdAt', 'updatedAt'],
    });
  }

  if (!existingUserDoc) {
    step2Ops.push({
      type: 'create',
      collection: 'users',
      docId: params.uid,
      data: {
        uid: params.uid,
        email: normalizedEmail,
        displayName: ownerDisplayName,
        ...(params.pendingReg.ownerMobile ? { phone: params.pendingReg.ownerMobile.slice(0, 32) } : {}),
        role: 'tenant_owner',
        tenantId,
        preferredLanguage,
        status: 'active',
        lastLoginAt: nowIso,
      },
      serverTimestampFields: ['createdAt', 'updatedAt'],
    });
  } else if (existingUserDoc.tenantId !== tenantId || existingUserDoc.role !== 'tenant_owner') {
    step2Ops.push({
      type: 'update',
      collection: 'users',
      docId: params.uid,
      data: {
        tenantId,
        role: 'tenant_owner',
        lastLoginAt: nowIso,
      },
      updateFields: ['tenantId', 'role', 'lastLoginAt'],
      serverTimestampFields: ['updatedAt'],
    });
  }

  if (!existingSaasUserDoc) {
    step2Ops.push({
      type: 'create',
      collection: 'saasUsers',
      docId: params.uid,
      data: {
        uid: params.uid,
        email: normalizedEmail,
        displayName: ownerDisplayName,
        preferredLanguage,
        defaultTenantId: tenantId,
        status: 'active',
      },
      serverTimestampFields: ['createdAt', 'updatedAt'],
    });
  } else if (existingSaasUserDoc.defaultTenantId !== tenantId) {
    step2Ops.push({
      type: 'update',
      collection: 'saasUsers',
      docId: params.uid,
      data: {
        defaultTenantId: tenantId,
      },
      updateFields: ['defaultTenantId'],
      serverTimestampFields: ['updatedAt'],
    });
  }

  step2Ops.push({
    type: 'delete',
    collection: 'pendingTenantRegistrations',
    docId: params.uid,
  });

  // Step 2: Provision owner profile, membership, settings, and delete pending registration
  if (step2Ops.length > 0) {
    try {
      await fsCommit(step2Ops, params.idToken);
    } catch (batchErr) {
      const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
      if (!msg.includes('(403)') || step2Ops.length === 1) {
        throw batchErr;
      }
      console.warn('Multi-op pending tenant claim commit returned 403; retrying sequentially per op:', msg);
      for (const op of step2Ops) {
        await fsCommit([op], params.idToken);
      }
    }
  }

  const saved = await fsGetDoc<SaasTenant>('saasTenants', tenantId, params.idToken).catch(() => null);
  return saved || existingTenant || ({ id: tenantId, ...tenantPayload } as SaasTenant);
}

