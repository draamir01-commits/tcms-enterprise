import { Router } from 'express';
import {
  firebaseCreateEmailPasswordUser,
  firebaseSendOobEmail,
  fsCreateDoc,
  fsDeleteDoc,
  fsGetDoc,
  fsQueryDocs,
  fsSetDoc,
  fsUpdateDoc,
  verifyFirebaseIdToken,
} from './firestoreRest.ts';
import { randomId } from './crypto.ts';
import { requireAuth, type AuthedRequest } from './helpers.ts';
import {
  claimPendingTenantRegistration,
  requirePlatformSuperAdmin,
  writePlatformAuditLog,
} from './tenantService.ts';
import { validatePasswordStrength } from '../src/lib/passwordPolicy.ts';
import {
  DEFAULT_PLATFORM_CONFIG,
  DEFAULT_SUBSCRIPTION_PLANS,
} from '../src/lib/saasDefaults.ts';
import type {
  BillingCycle,
  PendingTenantRegistration,
  PlatformLead,
  PlatformPublicConfig,
  SubscriptionPlan,
  TenantStatus,
} from '../src/types/tcms.ts';

function sanitizePlatformConfig(raw: Record<string, unknown> | undefined): PlatformPublicConfig {
  const src = raw || {};
  const socialRaw =
    src.socialLinks && typeof src.socialLinks === 'object'
      ? (src.socialLinks as Record<string, unknown>)
      : {};
  return {
    platformNameEn: String(src.platformNameEn || DEFAULT_PLATFORM_CONFIG.platformNameEn).slice(0, 120),
    platformNameAr: String(src.platformNameAr || DEFAULT_PLATFORM_CONFIG.platformNameAr).slice(0, 120),
    subtitleEn: String(src.subtitleEn || DEFAULT_PLATFORM_CONFIG.subtitleEn).slice(0, 200),
    subtitleAr: String(src.subtitleAr || DEFAULT_PLATFORM_CONFIG.subtitleAr).slice(0, 200),
    logoDataUrl: String(src.logoDataUrl || '').slice(0, 120000),
    faviconUrl: String(src.faviconUrl || DEFAULT_PLATFORM_CONFIG.faviconUrl).slice(0, 500),
    primaryColor: String(src.primaryColor || DEFAULT_PLATFORM_CONFIG.primaryColor).slice(0, 16),
    secondaryColor: String(src.secondaryColor || DEFAULT_PLATFORM_CONFIG.secondaryColor).slice(0, 16),
    accentVioletColor: String(
      src.accentVioletColor || DEFAULT_PLATFORM_CONFIG.accentVioletColor
    ).slice(0, 16),
    heroHeadlineEn: String(src.heroHeadlineEn || DEFAULT_PLATFORM_CONFIG.heroHeadlineEn).slice(0, 240),
    heroHeadlineAr: String(src.heroHeadlineAr || DEFAULT_PLATFORM_CONFIG.heroHeadlineAr).slice(0, 240),
    heroSubheadlineEn: String(
      src.heroSubheadlineEn || DEFAULT_PLATFORM_CONFIG.heroSubheadlineEn
    ).slice(0, 500),
    heroSubheadlineAr: String(
      src.heroSubheadlineAr || DEFAULT_PLATFORM_CONFIG.heroSubheadlineAr
    ).slice(0, 500),
    recommendedPlanCode: String(
      src.recommendedPlanCode || DEFAULT_PLATFORM_CONFIG.recommendedPlanCode
    ).slice(0, 48),
    contactEmail: String(src.contactEmail || '').slice(0, 200),
    contactPhone: String(src.contactPhone || '').slice(0, 40),
    addressEn: String(src.addressEn || '').slice(0, 300),
    addressAr: String(src.addressAr || '').slice(0, 300),
    copyrightEn: String(src.copyrightEn || DEFAULT_PLATFORM_CONFIG.copyrightEn).slice(0, 200),
    copyrightAr: String(src.copyrightAr || DEFAULT_PLATFORM_CONFIG.copyrightAr).slice(0, 200),
    socialLinks: {
      linkedin: String(socialRaw.linkedin || '').slice(0, 300),
      x: String(socialRaw.x || '').slice(0, 300),
      youtube: String(socialRaw.youtube || '').slice(0, 300),
      website: String(socialRaw.website || '').slice(0, 300),
    },
    privacyContentEn: String(
      src.privacyContentEn || DEFAULT_PLATFORM_CONFIG.privacyContentEn
    ).slice(0, 2500),
    privacyContentAr: String(
      src.privacyContentAr || DEFAULT_PLATFORM_CONFIG.privacyContentAr
    ).slice(0, 2500),
    termsContentEn: String(src.termsContentEn || DEFAULT_PLATFORM_CONFIG.termsContentEn).slice(0, 2500),
    termsContentAr: String(src.termsContentAr || DEFAULT_PLATFORM_CONFIG.termsContentAr).slice(0, 2500),
    cookiesContentEn: String(
      src.cookiesContentEn || DEFAULT_PLATFORM_CONFIG.cookiesContentEn
    ).slice(0, 2500),
    cookiesContentAr: String(
      src.cookiesContentAr || DEFAULT_PLATFORM_CONFIG.cookiesContentAr
    ).slice(0, 2500),
    dataProtectionContentEn: String(
      src.dataProtectionContentEn || DEFAULT_PLATFORM_CONFIG.dataProtectionContentEn
    ).slice(0, 2500),
    dataProtectionContentAr: String(
      src.dataProtectionContentAr || DEFAULT_PLATFORM_CONFIG.dataProtectionContentAr
    ).slice(0, 2500),
  };
}

function normalizePlanInput(body: Record<string, unknown>, existing?: SubscriptionPlan): Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'> {
  const code = String(body.code || existing?.code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '_')
    .slice(0, 48);
  const rawLimits =
    body.limits && typeof body.limits === 'object'
      ? (body.limits as Record<string, unknown>)
      : {};
  return {
    code: code || 'custom',
    nameEn: String(body.nameEn ?? existing?.nameEn ?? '').trim().slice(0, 120),
    nameAr: String(body.nameAr ?? existing?.nameAr ?? '').trim().slice(0, 120),
    taglineEn: String(body.taglineEn ?? existing?.taglineEn ?? '').trim().slice(0, 240),
    taglineAr: String(body.taglineAr ?? existing?.taglineAr ?? '').trim().slice(0, 240),
    priceMonthly: Math.max(0, Number(body.priceMonthly ?? existing?.priceMonthly ?? 0)),
    priceAnnual: Math.max(0, Number(body.priceAnnual ?? existing?.priceAnnual ?? 0)),
    currency: String(body.currency ?? existing?.currency ?? 'SAR').trim().toUpperCase().slice(0, 8),
    recommended: Boolean(body.recommended ?? existing?.recommended ?? false),
    isActive: body.isActive === undefined ? (existing?.isActive ?? true) : Boolean(body.isActive),
    displayOrder: Number(body.displayOrder ?? existing?.displayOrder ?? 1),
    featuresEn: Array.isArray(body.featuresEn)
      ? body.featuresEn.map((f) => String(f).trim().slice(0, 180)).filter(Boolean).slice(0, 20)
      : existing?.featuresEn || [],
    featuresAr: Array.isArray(body.featuresAr)
      ? body.featuresAr.map((f) => String(f).trim().slice(0, 180)).filter(Boolean).slice(0, 20)
      : existing?.featuresAr || [],
    limits: {
      maxCandidates: Math.max(1, Number(rawLimits.maxCandidates ?? existing?.limits?.maxCandidates ?? 500)),
      maxUsers: Math.max(1, Number(rawLimits.maxUsers ?? existing?.limits?.maxUsers ?? 10)),
      maxBatches: Math.max(1, Number(rawLimits.maxBatches ?? existing?.limits?.maxBatches ?? 50)),
      maxCertificates: Math.max(1, Number(rawLimits.maxCertificates ?? existing?.limits?.maxCertificates ?? 500)),
      maxCorporateClients: Math.max(
        1,
        Number(rawLimits.maxCorporateClients ?? existing?.limits?.maxCorporateClients ?? 25)
      ),
    },
  };
}

export function createPlatformRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Public SaaS Landing Configuration & Dynamic Subscription Plans
  // ---------------------------------------------------------------------------
  router.get('/public/saas-config', async (_req, res) => {
    try {
      const [configDoc, planDocs] = await Promise.all([
        fsGetDoc<{ config?: Record<string, unknown> }>('platformSettings', 'public_config').catch(() => null),
        fsQueryDocs<SubscriptionPlan>('subscriptionPlans', undefined, {
          filters: [{ field: 'isActive', op: 'EQUAL', value: true }],
        }).catch(() => []),
      ]);

      const platformConfig = sanitizePlatformConfig(configDoc?.config);
      const usingDefaultPlans = planDocs.length === 0;
      const plans = (usingDefaultPlans ? DEFAULT_SUBSCRIPTION_PLANS : planDocs)
        .slice()
        .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
        .map((p) => ({
          ...p,
          recommended: p.code === platformConfig.recommendedPlanCode ? true : Boolean(p.recommended),
        }));

      res.json({
        platformConfig,
        subscriptionPlans: plans,
        usingDefaultPlans,
        usingDefaultConfig: !configDoc,
      });
    } catch {
      res.json({
        platformConfig: DEFAULT_PLATFORM_CONFIG,
        subscriptionPlans: DEFAULT_SUBSCRIPTION_PLANS,
        usingDefaultPlans: true,
        usingDefaultConfig: true,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Public Contact / Sales / Support Inquiry Submission
  // ---------------------------------------------------------------------------
  router.post('/public/contact', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 160);
      const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
      const phone = String(req.body?.phone || '').trim().slice(0, 40);
      const companyName = String(req.body?.companyName || '').trim().slice(0, 200);
      const subject = String(req.body?.subject || '').trim().slice(0, 200);
      const message = String(req.body?.message || '').trim().slice(0, 3000);
      const preferredLanguage = req.body?.preferredLanguage === 'ar' ? 'ar' : 'en';

      if (name.length < 2) {
        res.status(400).json({ error: 'Name is required (at least 2 characters).' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'A valid email address is required.' });
        return;
      }
      if (message.length < 10) {
        res.status(400).json({ error: 'Message must be at least 10 characters.' });
        return;
      }

      const leadId = randomId('lead');
      await fsCreateDoc('platformLeads', leadId, {
        name,
        email,
        ...(phone ? { phone } : {}),
        ...(companyName ? { companyName } : {}),
        subject: subject || 'Platform Inquiry',
        message,
        preferredLanguage,
        status: 'new',
      });

      res.status(201).json({
        ok: true,
        leadId,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to submit inquiry right now.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Public Self-Service Tenant Registration ("Register Your Training Center")
  // ---------------------------------------------------------------------------
  router.post('/public/register-tenant', async (req, res) => {
    try {
      const nameEn = String(req.body?.nameEn || '').trim().slice(0, 200);
      const rawNameAr = String(req.body?.nameAr || '').trim();
      const nameAr = (rawNameAr.length >= 2 ? rawNameAr : nameEn).slice(0, 200);
      const legalName = String(req.body?.legalName || nameEn).trim().slice(0, 240);
      const crNumber = String(req.body?.crNumber || '').trim().slice(0, 64);
      const vatNumber = String(req.body?.vatNumber || '').trim().slice(0, 40);
      const country = String(req.body?.country || 'Saudi Arabia').trim().slice(0, 80);
      const city = String(req.body?.city || '').trim().slice(0, 120);
      const address = String(req.body?.address || '').trim().slice(0, 400);
      const website = String(req.body?.website || '').trim().slice(0, 200);
      const companyEmail = String(req.body?.companyEmail || '').trim().toLowerCase().slice(0, 200);
      const companyPhone = String(req.body?.companyPhone || '').trim().slice(0, 40);
      const ownerDisplayName = String(req.body?.ownerDisplayName || '').trim().slice(0, 160);
      const ownerMobile = String(req.body?.ownerMobile || companyPhone).trim().slice(0, 32);
      const ownerEmailInput = String(req.body?.ownerEmail || '').trim().toLowerCase().slice(0, 200);
      const password = String(req.body?.password || '');
      const planCode = String(req.body?.planCode || 'professional')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-]/g, '_')
        .slice(0, 48);
      const billingCycle: BillingCycle = req.body?.billingCycle === 'annual' ? 'annual' : 'monthly';
      const defaultLanguage = req.body?.defaultLanguage === 'ar' ? 'ar' : 'en';

      if (nameEn.length < 2) {
        res.status(400).json({ error: 'Training center English name is required (min 2 characters).' });
        return;
      }
      if (ownerDisplayName.length < 2) {
        res.status(400).json({ error: 'Owner / Administrator full name is required.' });
        return;
      }

      const slugBase =
        nameEn
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 28) || 'center';
      const proposedTenantId = `ten_${slugBase}_${randomId('').slice(0, 6)}`;

      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        // Already authenticated Google/Firebase user provisioning a new training center
        const idToken = authHeader.slice(7).trim();
        const verified = await verifyFirebaseIdToken(idToken);
        const [existingUserDoc, existingMemberships] = await Promise.all([
          fsGetDoc<{
            role?: string;
            tenantId?: string;
            candidateId?: string;
            organizationId?: string;
            trainerId?: string;
          }>('users', verified.uid, idToken).catch(() => null),
          fsQueryDocs<{ tenantId?: string; status?: string }>('tenantMemberships', idToken, {
            filters: [{ field: 'uid', op: 'EQUAL', value: verified.uid }],
          }).catch(() => []),
        ]);
        const hasRealWorkspaceAccount =
          Boolean(existingUserDoc) &&
          !(
            existingUserDoc!.role === 'candidate' &&
            (!existingUserDoc!.tenantId || existingUserDoc!.tenantId === 'tenant_default') &&
            !existingUserDoc!.candidateId &&
            !existingUserDoc!.organizationId &&
            !existingUserDoc!.trainerId &&
            !existingMemberships.some((m) => m.tenantId && m.tenantId !== 'tenant_default' && m.status === 'active')
          );
        if (hasRealWorkspaceAccount) {
          res.status(409).json({
            error: 'This account is already registered to a training center workspace. Please sign in or use a dedicated owner email.',
          });
          return;
        }

        const pendingData: PendingTenantRegistration = {
          ownerUid: verified.uid,
          ownerEmail: verified.email,
          ownerDisplayName,
          ownerMobile: ownerMobile || '+966000000000',
          proposedTenantId,
          nameEn,
          nameAr,
          ...(legalName ? { legalName } : {}),
          ...(crNumber ? { crNumber } : {}),
          ...(vatNumber ? { vatNumber } : {}),
          country,
          ...(city ? { city } : {}),
          ...(address ? { address } : {}),
          ...(website ? { website } : {}),
          companyEmail: companyEmail || verified.email,
          companyPhone: companyPhone || ownerMobile || '',
          planCode: planCode || 'professional',
          billingCycle,
          defaultLanguage,
        };

        const existingPending = await fsGetDoc<PendingTenantRegistration>(
          'pendingTenantRegistrations',
          verified.uid,
          idToken
        ).catch(() => null);
        if (existingPending) {
          await fsUpdateDoc(
            'pendingTenantRegistrations',
            verified.uid,
            pendingData as unknown as Record<string, unknown>,
            idToken,
            ['updatedAt']
          );
        } else {
          await fsCreateDoc(
            'pendingTenantRegistrations',
            verified.uid,
            pendingData as unknown as Record<string, unknown>,
            idToken,
            ['createdAt', 'updatedAt']
          );
        }

        if (verified.emailVerified) {
          const tenant = await claimPendingTenantRegistration({
            uid: verified.uid,
            email: verified.email,
            preferredLanguage: defaultLanguage,
            idToken,
            pendingReg: pendingData,
          });
          res.status(201).json({
            status: 'provisioned',
            tenantId: tenant.tenantId,
            tenantNameEn: tenant.nameEn,
            planCode: tenant.planCode,
            email: verified.email,
          });
          return;
        }

        await firebaseSendOobEmail({ requestType: 'VERIFY_EMAIL', idToken }).catch(() => {});
        res.status(201).json({
          status: 'verification_required',
          proposedTenantId,
          tenantNameEn: nameEn,
          planCode,
          email: verified.email,
        });
        return;
      }

      // Brand-new Email & Password registration
      if (!ownerEmailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmailInput)) {
        res.status(400).json({ error: 'Valid owner email address is required.' });
        return;
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        res.status(400).json({
          error:
            'Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character.',
        });
        return;
      }

      const createdAuth = await firebaseCreateEmailPasswordUser({
        email: ownerEmailInput,
        password,
        displayName: ownerDisplayName,
      });

      const pendingData: PendingTenantRegistration = {
        ownerUid: createdAuth.uid,
        ownerEmail: createdAuth.email,
        ownerDisplayName,
        ownerMobile: ownerMobile || '+966000000000',
        proposedTenantId,
        nameEn,
        nameAr,
        ...(legalName ? { legalName } : {}),
        ...(crNumber ? { crNumber } : {}),
        ...(vatNumber ? { vatNumber } : {}),
        country,
        ...(city ? { city } : {}),
        ...(address ? { address } : {}),
        ...(website ? { website } : {}),
        companyEmail: companyEmail || createdAuth.email,
        companyPhone: companyPhone || ownerMobile || '',
        planCode: planCode || 'professional',
        billingCycle,
        defaultLanguage,
      };

      await fsCreateDoc(
        'pendingTenantRegistrations',
        createdAuth.uid,
        pendingData as unknown as Record<string, unknown>,
        createdAuth.idToken,
        ['createdAt', 'updatedAt']
      );

      await firebaseSendOobEmail({
        requestType: 'VERIFY_EMAIL',
        idToken: createdAuth.idToken,
      }).catch((err) => {
        console.error('Verification email send warning:', err);
      });

      res.status(201).json({
        status: 'verification_required',
        proposedTenantId,
        tenantNameEn: nameEn,
        planCode,
        email: createdAuth.email,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to register training center.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Protected Platform Super Admin Console Routes
  // ---------------------------------------------------------------------------
  router.get(
    '/platform/branding',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const doc = await fsGetDoc<{ config?: Record<string, unknown> }>(
          'platformSettings',
          'public_config',
          req.idToken!
        ).catch(() => null);
        res.json({
          config: sanitizePlatformConfig(doc?.config),
          usingDefault: !doc,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.put(
    '/platform/branding',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const cleaned = sanitizePlatformConfig(req.body as Record<string, unknown>);
        await fsSetDoc(
          'platformSettings',
          'public_config',
          {
            key: 'public_config',
            config: cleaned,
            updatedBy: req.user!.uid,
          },
          req.idToken!,
          ['updatedAt']
        );
        await writePlatformAuditLog(
          req.user!,
          'UPDATE_PLATFORM_BRANDING',
          'platformSettings',
          'public_config',
          `Updated public SaaS platform branding (${cleaned.platformNameEn})`,
          req.idToken!
        );
        res.json({ config: cleaned });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/platform/plans',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const plans = await fsQueryDocs<SubscriptionPlan>('subscriptionPlans', req.idToken!);
        plans.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        res.json({ plans });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/platform/plans/seed-defaults',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
          const existing = await fsGetDoc<SubscriptionPlan>('subscriptionPlans', plan.id, req.idToken!).catch(() => null);
          const payload = {
            code: plan.code,
            nameEn: plan.nameEn,
            nameAr: plan.nameAr,
            taglineEn: plan.taglineEn,
            taglineAr: plan.taglineAr,
            priceMonthly: plan.priceMonthly,
            priceAnnual: plan.priceAnnual,
            currency: plan.currency,
            recommended: plan.recommended,
            isActive: plan.isActive,
            displayOrder: plan.displayOrder,
            featuresEn: plan.featuresEn,
            featuresAr: plan.featuresAr,
            limits: plan.limits,
            updatedBy: req.user!.uid,
          };
          if (existing) {
            await fsSetDoc(
              'subscriptionPlans',
              plan.id,
              { ...payload, createdAt: existing.createdAt || new Date() },
              req.idToken!,
              ['updatedAt']
            );
          } else {
            await fsCreateDoc('subscriptionPlans', plan.id, payload, req.idToken!, [
              'createdAt',
              'updatedAt',
            ]);
          }
        }
        await writePlatformAuditLog(
          req.user!,
          'SEED_SUBSCRIPTION_PLANS',
          'subscriptionPlans',
          'defaults',
          'Seeded default 4 SaaS subscription plans into Firestore',
          req.idToken!
        );
        const plans = await fsQueryDocs<SubscriptionPlan>('subscriptionPlans', req.idToken!);
        plans.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
        res.json({ plans });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/platform/plans',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const normalized = normalizePlanInput(req.body as Record<string, unknown>);
        if (!normalized.nameEn || !normalized.nameAr) {
          res.status(400).json({ error: 'English and Arabic plan names are required.' });
          return;
        }
        const planId = normalized.code || randomId('plan');
        await fsCreateDoc(
          'subscriptionPlans',
          planId,
          { ...normalized, updatedBy: req.user!.uid },
          req.idToken!,
          ['createdAt', 'updatedAt']
        );
        await writePlatformAuditLog(
          req.user!,
          'CREATE_SUBSCRIPTION_PLAN',
          'subscriptionPlans',
          planId,
          `Created plan ${normalized.nameEn} (${normalized.priceMonthly}/${normalized.priceAnnual} ${normalized.currency})`,
          req.idToken!
        );
        const saved = await fsGetDoc<SubscriptionPlan>('subscriptionPlans', planId, req.idToken!);
        res.status(201).json({ plan: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.put(
    '/platform/plans/:planId',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const planId = String(req.params.planId);
        const existing = await fsGetDoc<SubscriptionPlan>('subscriptionPlans', planId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Subscription plan not found.' });
          return;
        }
        const normalized = normalizePlanInput(req.body as Record<string, unknown>, existing);
        await fsUpdateDoc(
          'subscriptionPlans',
          planId,
          { ...normalized, updatedBy: req.user!.uid },
          req.idToken!,
          ['updatedAt']
        );
        await writePlatformAuditLog(
          req.user!,
          'UPDATE_SUBSCRIPTION_PLAN',
          'subscriptionPlans',
          planId,
          `Updated plan ${normalized.nameEn} (${normalized.priceMonthly}/${normalized.priceAnnual} ${normalized.currency})`,
          req.idToken!
        );
        const saved = await fsGetDoc<SubscriptionPlan>('subscriptionPlans', planId, req.idToken!);
        res.json({ plan: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.delete(
    '/platform/plans/:planId',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const planId = String(req.params.planId);
        await fsDeleteDoc('subscriptionPlans', planId, req.idToken!);
        await writePlatformAuditLog(
          req.user!,
          'DELETE_SUBSCRIPTION_PLAN',
          'subscriptionPlans',
          planId,
          `Deleted subscription plan ${planId}`,
          req.idToken!
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/platform/tenants/:tenantId',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = String(req.params.tenantId);
        const validStatuses: TenantStatus[] = ['trial', 'active', 'grace_period', 'suspended', 'cancelled'];
        const updates: Record<string, unknown> = {};
        if (typeof req.body?.status === 'string' && validStatuses.includes(req.body.status as TenantStatus)) {
          updates.status = req.body.status;
        }
        if (typeof req.body?.planCode === 'string' && req.body.planCode.trim()) {
          updates.planCode = req.body.planCode.trim().slice(0, 48);
        }
        if (typeof req.body?.nameEn === 'string' && req.body.nameEn.trim().length >= 2) {
          updates.nameEn = req.body.nameEn.trim().slice(0, 200);
        }
        if (typeof req.body?.nameAr === 'string' && req.body.nameAr.trim().length >= 2) {
          updates.nameAr = req.body.nameAr.trim().slice(0, 200);
        }
        if (Object.keys(updates).length === 0) {
          res.status(400).json({ error: 'No valid update fields supplied.' });
          return;
        }
        await fsUpdateDoc('saasTenants', tenantId, updates, req.idToken!, ['updatedAt']);
        await writePlatformAuditLog(
          req.user!,
          'UPDATE_SAAS_TENANT',
          'saasTenants',
          tenantId,
          `Updated tenant workspace (${JSON.stringify(updates)})`,
          req.idToken!,
          tenantId
        );
        const saved = await fsGetDoc('saasTenants', tenantId, req.idToken!);
        res.json({ tenant: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/platform/leads',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const leads = await fsQueryDocs<PlatformLead>('platformLeads', req.idToken!);
        leads.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json({ leads });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/platform/leads/:leadId',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const leadId = String(req.params.leadId);
        const status = req.body?.status;
        if (!['new', 'reviewed', 'resolved'].includes(status)) {
          res.status(400).json({ error: 'Invalid lead status' });
          return;
        }
        await fsUpdateDoc('platformLeads', leadId, { status }, req.idToken!, ['updatedAt']);
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/platform/pending-registrations',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const pending = await fsQueryDocs<PendingTenantRegistration>(
          'pendingTenantRegistrations',
          req.idToken!
        );
        pending.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json({ pending });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  return router;
}
