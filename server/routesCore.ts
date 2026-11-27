import { Router } from 'express';
import multer from 'multer';
import {
  firebaseCreateEmailPasswordUser,
  firebaseSendOobEmail,
  fsCreateDoc,
  fsGetDoc,
  fsQueryDocs,
  fsQueryTenantDocs,
  fsSetDoc,
  fsUpdateDoc,
  nextSequenceCode,
} from './firestoreRest.ts';
import { encryptSensitive, hashTenantEmailKey, randomId } from './crypto.ts';
import { normalizeBrandingImageMime, readPrivateFileAsync, savePrivateFile, type StoredFileMeta } from './fileVault.ts';
import {
  createNotification,
  getCompanyBranding,
  getRolePermissionMatrix,
  requireAuth,
  requirePermission,
  requireRole,
  syncOrganizationUserBinding,
  writeAuditLog,
  type AuthedRequest,
} from './helpers.ts';
import {
  assertRecordTenant,
  assertTenantPlanLimit,
  createSaasTenantWorkspace,
  DEFAULT_TENANT_ID,
  isTenantAdminOrOwnerRole,
  isTenantOwnerRole,
  makeMembershipDocId,
  requirePlatformSuperAdmin,
  tenantScopedDocId,
  TenantSecurityError,
  writePlatformAuditLog,
} from './tenantService.ts';
import { validatePasswordStrength } from '../src/lib/passwordPolicy.ts';
import {
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  hasPermission,
  normalizePermissionMatrix,
  PERMISSION_ACTIONS,
  PERMISSION_DOMAINS,
} from '../src/lib/permissions.ts';
import {
  DEFAULT_COURSE_CATEGORIES,
  type AssessmentRecord,
  type AttendanceRecord,
  type AuditLogItem,
  type Batch,
  type Candidate,
  type Certificate,
  type CompanySettings,
  type Course,
  type Enrollment,
  type Organization,
  type PermissionAction,
  type PermissionMatrix,
  type Trainer,
  type TrainingCard,
  type TrainingMode,
  type UserInvite,
  type UserProfile,
  type UserRole,
} from '../src/types/tcms.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

const handleSingleFileUpload: import('express').RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed' });
      return;
    }
    next();
  });
};

export function createCoreRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Auth Bootstrap, Tenant Context, Platform Super Admin & Permission Matrix
  // ---------------------------------------------------------------------------
  router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    if (req.isPlatformSuperAdmin) {
      res.json({
        user: req.user,
        effectivePermissions: getEffectivePermissions(req.user!, DEFAULT_ROLE_PERMISSIONS),
        roleMatrix: DEFAULT_ROLE_PERMISSIONS,
        tenantContext: null,
      });
      return;
    }
    const roleMatrix = await getRolePermissionMatrix(req.idToken!, req.tenantId!);
    const effectivePermissions = getEffectivePermissions(req.user!, roleMatrix);
    res.json({
      user: req.user,
      effectivePermissions,
      roleMatrix,
      tenantContext: req.tenantContext || null,
    });
  });

  router.get('/tenant/context', requireAuth, async (req: AuthedRequest, res) => {
    if (req.isPlatformSuperAdmin) {
      res.json({
        tenantId: null,
        tenantContext: null,
        tenant: null,
        platformRole: req.user?.platformRole || null,
      });
      return;
    }
    res.json({
      tenantId: req.tenantId,
      tenantContext: req.tenantContext || null,
      tenant: req.tenant || null,
      platformRole: req.user?.platformRole || null,
    });
  });

  router.get(
    '/platform/tenants',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const tenants = await fsQueryDocs<Record<string, unknown>>('saasTenants', req.idToken!);
        tenants.sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        );
        res.json({ tenants });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/platform/tenants',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (req: AuthedRequest, res) => {
      try {
        const nameEn = String(req.body.nameEn || '').trim().slice(0, 200);
        const ownerEmail = String(req.body.ownerEmail || '').trim().toLowerCase();
        const ownerPassword = String(req.body.ownerPassword || '');
        const ownerDisplayName = req.body.ownerDisplayName
          ? String(req.body.ownerDisplayName).trim().slice(0, 160)
          : undefined;
        let ownerUid = req.body.ownerUid ? String(req.body.ownerUid).trim() : undefined;

        if (!nameEn || nameEn.length < 2) {
          res.status(400).json({ error: 'Training company English name is required (min 2 chars)' });
          return;
        }
        if (!ownerEmail || !ownerEmail.includes('@')) {
          res.status(400).json({ error: 'Valid ownerEmail is required' });
          return;
        }

        let ownerAuthCreated = false;
        let verificationEmailSent = false;
        if (ownerPassword && !ownerUid) {
          const pwCheck = validatePasswordStrength(ownerPassword);
          if (!pwCheck.valid) {
            res.status(400).json({
              error: `Owner password does not meet security requirements: ${pwCheck.failedRules.join(', ')}`,
            });
            return;
          }
          const createdAuth = await firebaseCreateEmailPasswordUser({
            email: ownerEmail,
            password: ownerPassword,
            displayName: ownerDisplayName || ownerEmail.split('@')[0],
          });
          ownerUid = createdAuth.uid;
          ownerAuthCreated = true;
          try {
            await firebaseSendOobEmail({
              requestType: 'VERIFY_EMAIL',
              idToken: createdAuth.idToken,
            });
            verificationEmailSent = true;
          } catch (err) {
            console.error('Owner verification email send warning:', err);
          }
        }

        const created = await createSaasTenantWorkspace({
          actor: req.user!,
          idToken: req.idToken!,
          nameEn,
          nameAr: req.body.nameAr ? String(req.body.nameAr).trim().slice(0, 200) : undefined,
          slug: req.body.slug ? String(req.body.slug).trim().slice(0, 120) : undefined,
          legalName: req.body.legalName ? String(req.body.legalName).trim().slice(0, 240) : undefined,
          contactEmail: ownerEmail,
          contactPhone: req.body.contactPhone ? String(req.body.contactPhone).trim().slice(0, 40) : undefined,
          ownerEmail,
          ownerDisplayName,
          ownerUid,
          planCode: req.body.planCode ? String(req.body.planCode) : undefined,
          status: req.body.status,
          defaultLanguage: req.body.defaultLanguage === 'ar' ? 'ar' : 'en',
          timezone: req.body.timezone ? String(req.body.timezone).trim().slice(0, 64) : undefined,
        });
        res.json({
          ...created,
          tenant: created,
          ownerAuthCreated,
          verificationEmailSent,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/platform/migration/preview',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (_req: AuthedRequest, res) => {
      res.status(403).json({
        error: 'Platform Super Admin accounts do not have access to tenant workspace records.',
        code: 'PLATFORM_SUPER_ADMIN_WORKSPACE_DENIED',
      });
    }
  );

  router.post(
    '/platform/migration/execute',
    requireAuth,
    requirePlatformSuperAdmin(),
    async (_req: AuthedRequest, res) => {
      res.status(403).json({
        error: 'Platform Super Admin accounts do not have access to tenant workspace records.',
        code: 'PLATFORM_SUPER_ADMIN_WORKSPACE_DENIED',
      });
    }
  );

  router.post('/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
    if (req.isPlatformSuperAdmin) {
      await writePlatformAuditLog(
        req.user!,
        'PLATFORM_LOGOUT',
        'saasUsers',
        req.user!.uid,
        'Platform Super Admin signed out of active session',
        req.idToken!
      );
    } else {
      await writeAuditLog(
        req.user!,
        'USER_LOGOUT',
        'users',
        req.user!.uid,
        'User signed out of active session',
        req.idToken!,
        req.tenantId!
      );
    }
    res.json({ ok: true });
  });

  router.post('/auth/audit-password-change', requireAuth, async (req: AuthedRequest, res) => {
    if (req.isPlatformSuperAdmin) {
      await writePlatformAuditLog(
        req.user!,
        'CHANGE_PASSWORD',
        'saasUsers',
        req.user!.uid,
        'Platform Super Admin changed own account password via Firebase Authentication',
        req.idToken!
      );
    } else {
      await writeAuditLog(
        req.user!,
        'CHANGE_PASSWORD',
        'users',
        req.user!.uid,
        'User changed own account password via Firebase Authentication',
        req.idToken!,
        req.tenantId!
      );
    }
    res.json({ ok: true });
  });

  router.patch('/auth/preferences', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const lang = req.body.preferredLanguage === 'ar' ? 'ar' : 'en';
      const displayName =
        typeof req.body.displayName === 'string' && req.body.displayName.trim()
          ? req.body.displayName.trim().slice(0, 160)
          : req.user!.displayName;
      const updates: Record<string, unknown> = { preferredLanguage: lang, displayName };
      if (typeof req.body.phone === 'string') {
        updates.phone = req.body.phone.trim().slice(0, 32);
      }
      await fsUpdateDoc(
        'users',
        req.user!.uid,
        updates,
        req.idToken!,
        ['updatedAt']
      );
      await fsUpdateDoc('saasUsers', req.user!.uid, updates, req.idToken!, ['updatedAt']).catch(() => {});
      const updated = await fsGetDoc<UserProfile>('users', req.user!.uid, req.idToken!);
      res.json({ user: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/permissions/matrix', requireAuth, async (req: AuthedRequest, res) => {
    const matrix = await getRolePermissionMatrix(req.idToken!, req.tenantId!);
    res.json({ matrix });
  });

  router.put(
    '/permissions/matrix',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const normalized = normalizePermissionMatrix(req.body?.matrix);
        const scopedPermDocId = `${req.tenantId!}_permissions`;
        await fsSetDoc(
          'systemSettings',
          scopedPermDocId,
          {
            tenantId: req.tenantId!,
            key: 'permissions',
            config: normalized,
            updatedBy: req.user!.uid,
          },
          req.idToken!,
          ['updatedAt']
        );
        await writeAuditLog(
          req.user!,
          'UPDATE_PERMISSION_MATRIX',
          'systemSettings',
          scopedPermDocId,
          'Updated granular role permission matrix',
          req.idToken!,
          req.tenantId!
        );
        res.json({ matrix: normalized });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Private File Vault Upload & Authorized Download / Metadata
  // ---------------------------------------------------------------------------
  async function canReadPrivateFile(req: AuthedRequest, meta: StoredFileMeta): Promise<boolean> {
    const fileTenantId = meta.tenantId || DEFAULT_TENANT_ID;
    if (fileTenantId !== req.tenantId) {
      return false;
    }
    const role = req.user!.role;
    if (meta.isPublicBranding) return true;
    if (isTenantAdminOrOwnerRole(role) || role === 'certificate_officer') return true;
    if (meta.category === 'course_doc') return true;
    if (role === 'trainer') {
      if (meta.category === 'training_card' || meta.uploadedBy === req.user!.uid) {
        return true;
      }
      if (meta.category === 'trainer_doc') {
        const trainers = await fsQueryTenantDocs<Trainer>('trainers', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        }).catch(() => []);
        const ownTrainers = trainers.filter(
          (t) => t.userId === req.user!.uid || (req.user!.trainerId && t.id === req.user!.trainerId)
        );
        return ownTrainers.some(
          (t) =>
            t.photoFileId === meta.fileId ||
            (Array.isArray(t.credentialFileIds) && t.credentialFileIds.includes(meta.fileId))
        );
      }
      return false;
    }
    if (role === 'corporate_client') {
      return Boolean(meta.organizationId && meta.organizationId === req.user!.organizationId);
    }
    if (role === 'candidate') {
      return (
        (meta.candidateUserId === req.user!.uid ||
          meta.uploadedBy === req.user!.uid ||
          Boolean(req.user!.candidateId && meta.candidateDocId === req.user!.candidateId)) &&
        (meta.category === 'training_card' ||
          meta.category === 'certificate' ||
          meta.category === 'candidate_doc')
      );
    }
    return false;
  }

  router.post('/files/upload', requireAuth, handleSingleFileUpload, async (req: AuthedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const category = (req.body.category || 'candidate_doc') as StoredFileMeta['category'];
      const allowedCategories: StoredFileMeta['category'][] = [
        'branding',
        'candidate_doc',
        'course_doc',
        'trainer_doc',
        'training_card',
        'certificate',
        'report',
      ];
      if (!allowedCategories.includes(category)) {
        res.status(400).json({ error: `Invalid file category: ${category}` });
        return;
      }

      if (category === 'branding') {
        const purpose = String(req.body.purpose || '');
        const isTemplateUpload =
          isTenantAdminOrOwnerRole(req.user!.role) &&
          (purpose === 'card_template' || purpose.startsWith('cert_'));
        if (!isTenantOwnerRole(req.user!.role) && !isTemplateUpload) {
          res.status(403).json({ error: 'Only authorized administrators can upload branding assets' });
          return;
        }
        if (!normalizeBrandingImageMime(req.file.mimetype, req.file.originalname)) {
          res.status(400).json({ error: 'Branding asset must be a valid image file' });
          return;
        }
      }

      if (category === 'course_doc' || category === 'trainer_doc') {
        const roleMatrix = await getRolePermissionMatrix(req.idToken!, req.tenantId!);
        const domain = category === 'course_doc' ? 'courses' : 'trainers';
        const allowed =
          hasPermission(req.user, domain, 'create', roleMatrix) ||
          hasPermission(req.user, domain, 'edit', roleMatrix);
        if (!allowed) {
          res.status(403).json({ error: `Permission denied for uploading ${category}` });
          return;
        }
      }

      const orgId =
        req.user!.role === 'corporate_client'
          ? req.user!.organizationId
          : (req.body.organizationId as string | undefined);

      const meta = await savePrivateFile(
        req.file.buffer,
        {
          tenantId: req.tenantId!,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          category,
          organizationId: orgId,
          candidateDocId: req.body.candidateDocId,
          candidateUserId: req.body.candidateUserId,
          isPublicBranding: category === 'branding',
          uploadedBy: req.user!.uid,
        },
        req.idToken
      );

      res.json({ file: meta });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/files/meta-batch', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const rawIds: unknown[] = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
      const fileIds = Array.from(
        new Set<string>(rawIds.map((v) => String(v || '').trim()).filter(Boolean))
      ).slice(0, 25);

      const files: Array<{
        fileId: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
        category: string;
        createdAt: string;
      }> = [];

      for (const fileId of fileIds) {
        const found = await readPrivateFileAsync(fileId, req.idToken, req.tenantId!);
        if (!found) continue;
        const ok = await canReadPrivateFile(req, found.meta);
        if (!ok) continue;
        files.push({
          fileId: found.meta.fileId,
          fileName: found.meta.fileName,
          mimeType: found.meta.mimeType,
          fileSize: found.meta.fileSize,
          category: found.meta.category,
          createdAt: found.meta.createdAt,
        });
      }

      res.json({ files });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/files/:fileId/meta', requireAuth, async (req: AuthedRequest, res) => {
    const fileId = String(req.params.fileId);
    const found = await readPrivateFileAsync(fileId, req.idToken, req.tenantId!);
    if (!found) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const authorized = await canReadPrivateFile(req, found.meta);
    if (!authorized) {
      res.status(403).json({ error: 'Access denied to private file' });
      return;
    }
    const { meta } = found;
    res.json({
      file: {
        fileId: meta.fileId,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        fileSize: meta.fileSize,
        category: meta.category,
        createdAt: meta.createdAt,
      },
    });
  });

  router.get('/files/:fileId', requireAuth, async (req: AuthedRequest, res) => {
    const fileId = String(req.params.fileId);
    const found = await readPrivateFileAsync(fileId, req.idToken, req.tenantId!);
    if (!found) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const { meta, buffer } = found;
    const authorized = await canReadPrivateFile(req, meta);

    if (!authorized) {
      res.status(403).json({ error: 'Access denied to private file' });
      return;
    }

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  });

  // ---------------------------------------------------------------------------
  // Company Branding Settings
  // ---------------------------------------------------------------------------
  router.get('/company-settings', requireAuth, async (req: AuthedRequest, res) => {
    const branding = await getCompanyBranding(req.idToken, req.tenantId!);
    res.json({ settings: branding });
  });

  router.put(
    '/company-settings',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const body = (req.body || {}) as Partial<CompanySettings>;
        const existing = await getCompanyBranding(req.idToken, req.tenantId!);
        const pick = (key: keyof CompanySettings, fallback = '', max = 256): string => {
          const val = Object.prototype.hasOwnProperty.call(body, key)
            ? body[key]
            : existing[key];
          return String(val ?? fallback).slice(0, max);
        };
        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          nameEn: pick('nameEn', '', 200),
          nameAr: pick('nameAr', '', 200),
          legalName: pick('legalName', '', 240),
          crNumber: pick('crNumber', '', 64),
          address: pick('address', '', 400),
          phone: pick('phone', '', 40),
          email: pick('email', '', 200),
          website: pick('website', '', 200),
          logoFileId: pick('logoFileId', '', 256),
          stampFileId: pick('stampFileId', '', 256),
          signatoryName: pick('signatoryName', '', 160),
          signatureFileId: pick('signatureFileId', '', 256),
          primaryColor: pick('primaryColor', '#0F172A', 16) || '#0F172A',
          secondaryColor: pick('secondaryColor', '#0284C7', 16) || '#0284C7',
          certificateFooter: pick('certificateFooter', '', 400),
          cardFooter: pick('cardFooter', '', 400),
          updatedBy: req.user!.uid,
        };
        await fsSetDoc('companySettings', req.tenantId!, payload, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'UPDATE_COMPANY_SETTINGS',
          'companySettings',
          req.tenantId!,
          `Updated company branding (${payload.nameEn})`,
          req.idToken!,
          req.tenantId!
        );
        const saved = await getCompanyBranding(req.idToken, req.tenantId!);
        res.json({ settings: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // System & Integration Settings (SMTP, WhatsApp, Categories, Retention)
  // ---------------------------------------------------------------------------
  router.get(
    '/system-settings',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tId = req.tenantId!;
        const [scopedInt, scopedGen] = await Promise.all([
          fsGetDoc<{ config: Record<string, unknown> }>('systemSettings', `${tId}_integrations`, req.idToken!).catch(() => null),
          fsGetDoc<{ config: Record<string, unknown> }>('systemSettings', `${tId}_general`, req.idToken!).catch(() => null),
        ]);
        const integrations =
          scopedInt ||
          (tId === DEFAULT_TENANT_ID
            ? await fsGetDoc<{ config: Record<string, unknown> }>('systemSettings', 'integrations', req.idToken!).catch(() => null)
            : null);
        const general =
          scopedGen ||
          (tId === DEFAULT_TENANT_ID
            ? await fsGetDoc<{ config: Record<string, unknown> }>('systemSettings', 'general', req.idToken!).catch(() => null)
            : null);

        const intCfg = integrations?.config || {};
        const { normalizeNotificationPreferences } = await import('./messagingService.ts');
        // Never return decrypted secrets to frontend
        const safeIntegrations = {
          smtpHost: intCfg.smtpHost || '',
          smtpPort: intCfg.smtpPort || 587,
          smtpSecure: Boolean(intCfg.smtpSecure),
          smtpUser: intCfg.smtpUser || '',
          smtpFrom: intCfg.smtpFrom || '',
          smtpSenderName: intCfg.smtpSenderName || '',
          hasSmtpPass: Boolean(intCfg.smtpPassEncrypted),
          whatsappPhoneNumberId: intCfg.whatsappPhoneNumberId || '',
          whatsappBusinessAccountId: intCfg.whatsappBusinessAccountId || '',
          whatsappApiVersion: intCfg.whatsappApiVersion || 'v21.0',
          hasWhatsappToken: Boolean(intCfg.whatsappAccessTokenEncrypted),
          hasWebhookVerifyToken: Boolean(intCfg.whatsappWebhookVerifyTokenEncrypted),
          hasWhatsappAppSecret: Boolean(intCfg.whatsappAppSecretEncrypted),
          notificationPreferences: normalizeNotificationPreferences(
            intCfg.notificationPreferences as Record<string, unknown> | undefined
          ),
        };

        const genCfg = general?.config || {
          courseCategories: DEFAULT_COURSE_CATEGORIES,
          retentionDays: 1825,
          pdplDisclosureMode: 'full_name',
        };

        res.json({ integrations: safeIntegrations, general: genCfg });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.put(
    '/system-settings/integrations',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const scopedIntDocId = `${req.tenantId!}_integrations`;
        const scopedExisting = await fsGetDoc<{ config: Record<string, unknown> }>(
          'systemSettings',
          scopedIntDocId,
          req.idToken!
        ).catch(() => null);
        const existing =
          scopedExisting ||
          (req.tenantId === DEFAULT_TENANT_ID
            ? await fsGetDoc<{ config: Record<string, unknown> }>(
                'systemSettings',
                'integrations',
                req.idToken!
              ).catch(() => null)
            : null);
        const prev = existing?.config || {};
        const body = req.body as Record<string, unknown>;
        const { normalizeNotificationPreferences } = await import('./messagingService.ts');

        const nextConfig: Record<string, unknown> = {
          smtpHost: String(body.smtpHost ?? prev.smtpHost ?? ''),
          smtpPort: Number(body.smtpPort ?? prev.smtpPort ?? 587),
          smtpSecure: Boolean(body.smtpSecure ?? prev.smtpSecure ?? false),
          smtpUser: String(body.smtpUser ?? prev.smtpUser ?? ''),
          smtpFrom: String(body.smtpFrom ?? prev.smtpFrom ?? ''),
          smtpSenderName: String(body.smtpSenderName ?? prev.smtpSenderName ?? ''),
          smtpPassEncrypted:
            typeof body.smtpPass === 'string' && body.smtpPass.trim()
              ? encryptSensitive(body.smtpPass.trim())
              : prev.smtpPassEncrypted || '',
          whatsappPhoneNumberId: String(
            body.whatsappPhoneNumberId ?? prev.whatsappPhoneNumberId ?? ''
          ),
          whatsappBusinessAccountId: String(
            body.whatsappBusinessAccountId ?? prev.whatsappBusinessAccountId ?? ''
          ),
          whatsappApiVersion: String(body.whatsappApiVersion ?? prev.whatsappApiVersion ?? 'v21.0'),
          whatsappAccessTokenEncrypted:
            typeof body.whatsappAccessToken === 'string' && body.whatsappAccessToken.trim()
              ? encryptSensitive(body.whatsappAccessToken.trim())
              : prev.whatsappAccessTokenEncrypted || '',
          whatsappWebhookVerifyTokenEncrypted:
            typeof body.whatsappWebhookVerifyToken === 'string' &&
            body.whatsappWebhookVerifyToken.trim()
              ? encryptSensitive(body.whatsappWebhookVerifyToken.trim())
              : prev.whatsappWebhookVerifyTokenEncrypted || '',
          whatsappAppSecretEncrypted:
            typeof body.whatsappAppSecret === 'string' && body.whatsappAppSecret.trim()
              ? encryptSensitive(body.whatsappAppSecret.trim())
              : prev.whatsappAppSecretEncrypted || '',
          notificationPreferences: normalizeNotificationPreferences(
            (body.notificationPreferences ?? prev.notificationPreferences) as
              | Record<string, unknown>
              | undefined
          ),
        };

        await fsSetDoc(
          'systemSettings',
          scopedIntDocId,
          { tenantId: req.tenantId!, key: 'integrations', config: nextConfig, updatedBy: req.user!.uid },
          req.idToken!,
          ['updatedAt']
        );
        await writeAuditLog(
          req.user!,
          'UPDATE_INTEGRATIONS',
          'systemSettings',
          scopedIntDocId,
          'Updated email/WhatsApp integration & notification preference configuration',
          req.idToken!,
          req.tenantId!
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.put(
    '/system-settings/general',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const scopedGenDocId = `${req.tenantId!}_general`;
        await fsSetDoc(
          'systemSettings',
          scopedGenDocId,
          {
            tenantId: req.tenantId!,
            key: 'general',
            config: {
              courseCategories: Array.isArray(body.courseCategories)
                ? body.courseCategories
                : DEFAULT_COURSE_CATEGORIES,
              retentionDays: Number(body.retentionDays || 1825),
              pdplDisclosureMode: String(body.pdplDisclosureMode || 'full_name'),
            },
            updatedBy: req.user!.uid,
          },
          req.idToken!,
          ['updatedAt']
        );
        await writeAuditLog(
          req.user!,
          'UPDATE_SYSTEM_SETTINGS',
          'systemSettings',
          scopedGenDocId,
          'Updated general system settings & course categories',
          req.idToken!,
          req.tenantId!
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Public categories read for authenticated users
  router.get('/categories', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const scoped = await fsGetDoc<{ config: { courseCategories?: string[] } }>(
        'systemSettings',
        `${req.tenantId!}_general`,
        req.idToken!
      );
      const general =
        scoped ||
        (req.tenantId === DEFAULT_TENANT_ID
          ? await fsGetDoc<{ config: { courseCategories?: string[] } }>(
              'systemSettings',
              'general',
              req.idToken!
            )
          : null);
      res.json({ categories: general?.config?.courseCategories || DEFAULT_COURSE_CATEGORIES });
    } catch {
      res.json({ categories: DEFAULT_COURSE_CATEGORIES });
    }
  });

  // ---------------------------------------------------------------------------
  // User Management, Role Assignment & Trainer/Org Scopes
  // ---------------------------------------------------------------------------
  router.get(
    '/users',
    requireAuth,
    requirePermission('user_management', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const [users, invites, roleMatrix] = await Promise.all([
          fsQueryTenantDocs<UserProfile>('users', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
          fsQueryTenantDocs<UserInvite>('userInvites', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }).catch(() => []),
          getRolePermissionMatrix(req.idToken!, req.tenantId!),
        ]);
        res.json({ users, invites, roleMatrix });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/users',
    requireAuth,
    requirePermission('user_management', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const displayName = String(req.body.displayName || '').trim().slice(0, 160);
        const password = String(req.body.password || '');
        const phone = String(req.body.phone || '').trim().slice(0, 32);
        const role = String(req.body.role || 'candidate') as UserRole;
        const preferredLanguage = req.body.preferredLanguage === 'ar' ? 'ar' : 'en';
        const status = req.body.status === 'suspended' ? 'suspended' : 'active';
        const organizationId = req.body.organizationId ? String(req.body.organizationId).trim() : '';
        const trainerId = req.body.trainerId ? String(req.body.trainerId).trim() : '';
        const candidateId = req.body.candidateId ? String(req.body.candidateId).trim() : '';
        const assignedCourseIds = Array.isArray(req.body.assignedCourseIds)
          ? req.body.assignedCourseIds.map(String)
          : undefined;
        const assignedBatchIds = Array.isArray(req.body.assignedBatchIds)
          ? req.body.assignedBatchIds.map(String)
          : undefined;

        if (!email || !email.includes('@')) {
          res.status(400).json({ error: 'A valid email address is required' });
          return;
        }
        if (!displayName) {
          res.status(400).json({ error: 'Display name is required' });
          return;
        }
        if (
          !isTenantOwnerRole(req.user!.role) &&
          isTenantAdminOrOwnerRole(role)
        ) {
          res.status(403).json({
            error: 'Only Tenant Owner / Super Admin can create Owner or Administrator accounts',
          });
          return;
        }
        if (!isTenantOwnerRole(req.user!.role) && req.body.permissions) {
          res.status(403).json({ error: 'Only Tenant Owner / Super Admin can assign custom user permissions' });
          return;
        }
        if (role === 'corporate_client' && !organizationId) {
          res.status(400).json({ error: 'Corporate Client users must be bound to an organization' });
          return;
        }
        if (organizationId) {
          const orgCheck = await fsGetDoc<Organization>('organizations', organizationId, req.idToken!).catch(() => null);
          if (!orgCheck || !assertRecordTenant(orgCheck, req.tenantId!, !req.strictTenantQuery)) {
            res.status(403).json({ error: 'Referenced organization does not belong to the active tenant' });
            return;
          }
        }

        const pwCheck = validatePasswordStrength(password);
        if (!pwCheck.valid) {
          res.status(400).json({
            error: `Password does not meet security requirements: ${pwCheck.failedRules.join(', ')}`,
          });
          return;
        }

        await assertTenantPlanLimit({
          tenantId: req.tenantId!,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: req.strictTenantQuery,
          metric: 'maxUsers',
        });

        const authCreated = await firebaseCreateEmailPasswordUser({
          email,
          password,
          displayName,
        });

        let verificationEmailSent = false;
        let resetEmailSent = false;
        try {
          await firebaseSendOobEmail({ requestType: 'VERIFY_EMAIL', idToken: authCreated.idToken });
          verificationEmailSent = true;
        } catch {
          // Non-fatal if OOB throttle occurs
        }
        if (req.body.sendResetEmail) {
          try {
            await firebaseSendOobEmail({ requestType: 'PASSWORD_RESET', email });
            resetEmailSent = true;
          } catch {
            // Non-fatal
          }
        }

        const profileData: Record<string, unknown> = {
          uid: authCreated.uid,
          email: authCreated.email,
          displayName,
          role,
          tenantId: req.tenantId!,
          preferredLanguage,
          status,
          authProvider: 'password',
          createdBy: req.user!.uid,
        };
        if (phone) profileData.phone = phone;
        if (organizationId) profileData.organizationId = organizationId;
        if (trainerId) profileData.trainerId = trainerId;
        if (candidateId) profileData.candidateId = candidateId;

        await fsCreateDoc('users', authCreated.uid, profileData, req.idToken!, ['createdAt', 'updatedAt']);

        const membershipWrite = fsSetDoc(
          'tenantMemberships',
          makeMembershipDocId(req.tenantId!, authCreated.uid),
          {
            tenantId: req.tenantId!,
            uid: authCreated.uid,
            email: authCreated.email,
            displayName,
            role,
            status,
            createdBy: req.user!.uid,
            ...(organizationId ? { organizationId } : {}),
            ...(trainerId ? { trainerId } : {}),
            ...(candidateId ? { candidateId } : {}),
          },
          req.idToken!,
          ['createdAt', 'updatedAt']
        );

        if (req.isPlatformSuperAdmin) {
          await Promise.all([
            membershipWrite,
            fsSetDoc(
              'saasUsers',
              authCreated.uid,
              {
                uid: authCreated.uid,
                email: authCreated.email,
                displayName,
                ...(phone ? { phone } : {}),
                preferredLanguage,
                defaultTenantId: req.tenantId!,
                status,
              },
              req.idToken!,
              ['createdAt', 'updatedAt']
            ).catch(() => {}),
          ]);
        } else {
          await membershipWrite;
        }

        if (role === 'corporate_client' && organizationId) {
          await syncOrganizationUserBinding({
            tenantId: req.tenantId!,
            organizationId,
            userId: authCreated.uid,
            email: authCreated.email,
            displayName,
            status: status === 'active' ? 'active' : 'revoked',
            idToken: req.idToken!,
          });
        }

        if (role === 'trainer' && trainerId) {
          const trainerDoc = await fsGetDoc<Trainer>('trainers', trainerId, req.idToken!).catch(() => null);
          if (trainerDoc && assertRecordTenant(trainerDoc, req.tenantId!, !req.strictTenantQuery)) {
            const trainerUpdates: Record<string, unknown> = { userId: authCreated.uid };
            if (assignedCourseIds) trainerUpdates.assignedCourseIds = assignedCourseIds;
            await fsUpdateDoc('trainers', trainerId, trainerUpdates, req.idToken!, ['updatedAt']).catch(() => {});
            if (assignedBatchIds && assignedBatchIds.length > 0) {
              for (const bId of assignedBatchIds) {
                const batchDoc = await fsGetDoc<Batch>('batches', bId, req.idToken!).catch(() => null);
                if (batchDoc && assertRecordTenant(batchDoc, req.tenantId!, !req.strictTenantQuery)) {
                  await fsUpdateDoc(
                    'batches',
                    bId,
                    { trainerId, trainerUserId: authCreated.uid },
                    req.idToken!,
                    ['updatedAt']
                  ).catch(() => {});
                }
              }
            }
          }
        }

        if (role === 'candidate' && candidateId) {
          const candDoc = await fsGetDoc<Candidate>('candidates', candidateId, req.idToken!).catch(() => null);
          if (candDoc && assertRecordTenant(candDoc, req.tenantId!, !req.strictTenantQuery)) {
            await fsUpdateDoc('candidates', candidateId, { userId: authCreated.uid }, req.idToken!, ['updatedAt']).catch(() => {});
          }
        }

        await writeAuditLog(
          req.user!,
          'CREATE_USER',
          'users',
          authCreated.uid,
          `Created user ${authCreated.email} with role ${role}`,
          req.idToken!,
          req.tenantId!
        );

        const created = await fsGetDoc<UserProfile>('users', authCreated.uid, req.idToken!);
        res.json({
          user: created,
          verificationEmailSent,
          resetEmailSent,
        });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/users/invite',
    requireAuth,
    requirePermission('user_management', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          res.status(400).json({ error: 'Valid email is required' });
          return;
        }
        const role = String(req.body.role || 'candidate') as UserRole;
        if (
          !isTenantOwnerRole(req.user!.role) &&
          isTenantAdminOrOwnerRole(role)
        ) {
          res.status(403).json({
            error: 'Only Tenant Owner / Super Admin can assign Owner or Administrator roles',
          });
          return;
        }
        const inviteId = hashTenantEmailKey(req.tenantId!, email);
        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          email,
          displayName: String(req.body.displayName || email.split('@')[0]).slice(0, 160),
          role,
          status: 'pending',
          createdBy: req.user!.uid,
        };
        if (req.body.organizationId) payload.organizationId = String(req.body.organizationId);
        if (req.body.trainerId) payload.trainerId = String(req.body.trainerId);
        if (req.body.candidateId) payload.candidateId = String(req.body.candidateId);

        const existingInvite = await fsGetDoc<UserInvite>('userInvites', inviteId, req.idToken!).catch(() => null);
        if (!existingInvite) {
          await assertTenantPlanLimit({
            tenantId: req.tenantId!,
            tenant: req.tenant,
            idToken: req.idToken!,
            strictTenantQuery: req.strictTenantQuery,
            metric: 'maxUsers',
          });
        }
        if (existingInvite) {
          await fsUpdateDoc('userInvites', inviteId, payload, req.idToken!, ['updatedAt']);
        } else {
          await fsCreateDoc('userInvites', inviteId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        }

        // Also update an already-signed-up user within this tenant if present (never self!)
        const matchedUsers = await fsQueryTenantDocs<UserProfile>('users', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'email', op: 'EQUAL', value: email }],
        });
        for (const u of matchedUsers) {
          if (u.uid === req.user!.uid) continue;
          if (!isTenantOwnerRole(req.user!.role) && isTenantAdminOrOwnerRole(u.role)) {
            continue;
          }
          const updates: Record<string, unknown> = { role: payload.role };
          if (payload.organizationId) updates.organizationId = payload.organizationId;
          if (payload.trainerId) updates.trainerId = payload.trainerId;
          if (payload.candidateId) updates.candidateId = payload.candidateId;
          await fsUpdateDoc('users', u.id!, updates, req.idToken!, ['updatedAt']);
          await fsUpdateDoc(
            'tenantMemberships',
            makeMembershipDocId(req.tenantId!, u.uid),
            updates,
            req.idToken!,
            ['updatedAt']
          ).catch(() => {});
        }

        await writeAuditLog(
          req.user!,
          'INVITE_OR_ASSIGN_USER',
          'userInvites',
          inviteId,
          `Assigned role ${payload.role} to ${email}`,
          req.idToken!,
          req.tenantId!
        );
        res.json({ ok: true, inviteId });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/users/:uid',
    requireAuth,
    requirePermission('user_management', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const uid = String(req.params.uid);
        const existingUser = await fsGetDoc<UserProfile>('users', uid, req.idToken!);
        if (!existingUser || !assertRecordTenant(existingUser, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existingUser ? 403 : 404).json({
            error: existingUser ? 'Forbidden: user belongs to another tenant' : 'User not found',
          });
          return;
        }

        const isSelf = uid === req.user!.uid;
        if (isSelf) {
          if (
            (req.body.role !== undefined && req.body.role !== existingUser.role) ||
            (req.body.status !== undefined && req.body.status !== existingUser.status) ||
            req.body.permissions !== undefined
          ) {
            res.status(403).json({
              error: 'Security policy forbids modifying your own role, permissions, or account status',
            });
            return;
          }
        }

        if (!isTenantOwnerRole(req.user!.role)) {
          if (isTenantAdminOrOwnerRole(existingUser.role)) {
            res.status(403).json({
              error: 'Only Tenant Owner / Super Admin can modify Owner or Administrator accounts',
            });
            return;
          }
          if (isTenantAdminOrOwnerRole(req.body.role)) {
            res.status(403).json({
              error: 'Only Tenant Owner / Super Admin can assign Owner or Administrator roles',
            });
            return;
          }
          if (req.body.permissions !== undefined) {
            res.status(403).json({ error: 'Only Tenant Owner / Super Admin can customize user permissions' });
            return;
          }
        }

        const updates: Record<string, unknown> = {};
        if (typeof req.body.displayName === 'string' && req.body.displayName.trim()) {
          updates.displayName = req.body.displayName.trim().slice(0, 160);
        }
        if (req.body.phone !== undefined) updates.phone = String(req.body.phone || '').trim().slice(0, 32);
        if (req.body.preferredLanguage === 'en' || req.body.preferredLanguage === 'ar') {
          updates.preferredLanguage = req.body.preferredLanguage;
        }
        if (req.body.role && !isSelf) updates.role = String(req.body.role);
        if (req.body.status && !isSelf) updates.status = req.body.status === 'suspended' ? 'suspended' : 'active';
        if (req.body.organizationId !== undefined) updates.organizationId = String(req.body.organizationId || '');
        if (req.body.trainerId !== undefined) updates.trainerId = String(req.body.trainerId || '');
        if (req.body.candidateId !== undefined) updates.candidateId = String(req.body.candidateId || '');

        let permissionsUpdated = false;
        if (req.body.permissions !== undefined && isTenantOwnerRole(req.user!.role) && !isSelf) {
          if (req.body.permissions === null) {
            updates.permissions = {};
          } else if (typeof req.body.permissions === 'object') {
            const cleanPerms: Partial<PermissionMatrix> = {};
            for (const domain of PERMISSION_DOMAINS) {
              const actions = (req.body.permissions as Record<string, unknown>)[domain];
              if (Array.isArray(actions)) {
                cleanPerms[domain] = actions.filter((a): a is PermissionAction =>
                  PERMISSION_ACTIONS.includes(a as PermissionAction)
                );
              }
            }
            updates.permissions = cleanPerms;
          }
          permissionsUpdated = true;
        }

        if (Object.keys(updates).length > 0) {
          await fsUpdateDoc('users', uid, updates, req.idToken!, ['updatedAt']);
          const membershipUpdates: Record<string, unknown> = {};
          if (updates.role !== undefined) membershipUpdates.role = updates.role;
          if (updates.status !== undefined) membershipUpdates.status = updates.status;
          if (updates.organizationId !== undefined) membershipUpdates.organizationId = updates.organizationId;
          if (updates.trainerId !== undefined) membershipUpdates.trainerId = updates.trainerId;
          if (updates.candidateId !== undefined) membershipUpdates.candidateId = updates.candidateId;
          if (updates.permissions !== undefined) membershipUpdates.permissions = updates.permissions;
          if (Object.keys(membershipUpdates).length > 0) {
            await fsUpdateDoc(
              'tenantMemberships',
              makeMembershipDocId(req.tenantId!, uid),
              membershipUpdates,
              req.idToken!,
              ['updatedAt']
            ).catch(() => {});
          }
        }

        const nextRole = (updates.role as UserRole | undefined) || existingUser.role;
        const nextStatus = (updates.status as 'active' | 'suspended' | undefined) || existingUser.status;
        const nextOrgId =
          updates.organizationId !== undefined ? String(updates.organizationId) : existingUser.organizationId;
        const nextTrainerId =
          updates.trainerId !== undefined ? String(updates.trainerId) : existingUser.trainerId;
        const nextCandidateId =
          updates.candidateId !== undefined ? String(updates.candidateId) : existingUser.candidateId;

        if (nextRole === 'corporate_client' && nextOrgId) {
          await syncOrganizationUserBinding({
            tenantId: req.tenantId!,
            organizationId: nextOrgId,
            userId: uid,
            email: existingUser.email,
            displayName: (updates.displayName as string) || existingUser.displayName,
            status: nextStatus === 'active' ? 'active' : 'revoked',
            idToken: req.idToken!,
          });
        }

        if (nextRole === 'trainer' && nextTrainerId) {
          const trCheck = await fsGetDoc<Trainer>('trainers', nextTrainerId, req.idToken!).catch(() => null);
          if (trCheck && assertRecordTenant(trCheck, req.tenantId!, !req.strictTenantQuery)) {
            const trainerUpdates: Record<string, unknown> = { userId: uid };
            if (Array.isArray(req.body.assignedCourseIds)) {
              trainerUpdates.assignedCourseIds = req.body.assignedCourseIds.map(String);
            }
            await fsUpdateDoc('trainers', nextTrainerId, trainerUpdates, req.idToken!, ['updatedAt']).catch(() => {});

            if (Array.isArray(req.body.assignedBatchIds)) {
              const targetBatchSet = new Set(req.body.assignedBatchIds.map(String));
              const allBatches = await fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
              }).catch(() => []);
              for (const b of allBatches) {
                if (targetBatchSet.has(b.id) && (b.trainerId !== nextTrainerId || b.trainerUserId !== uid)) {
                  await fsUpdateDoc(
                    'batches',
                    b.id,
                    { trainerId: nextTrainerId, trainerUserId: uid },
                    req.idToken!,
                    ['updatedAt']
                  ).catch(() => {});
                }
              }
            }
          }
        }

        if (nextRole === 'candidate' && nextCandidateId) {
          const candCheck = await fsGetDoc<Candidate>('candidates', nextCandidateId, req.idToken!).catch(() => null);
          if (candCheck && assertRecordTenant(candCheck, req.tenantId!, !req.strictTenantQuery)) {
            await fsUpdateDoc('candidates', nextCandidateId, { userId: uid }, req.idToken!, ['updatedAt']).catch(() => {});
            const [enrs, cards, certs] = await Promise.all([
              fsQueryTenantDocs<Enrollment>('enrollments', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
                filters: [{ field: 'candidateDocId', op: 'EQUAL', value: nextCandidateId }],
              }).catch(() => []),
              fsQueryTenantDocs<TrainingCard>('trainingCards', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
                filters: [{ field: 'candidateDocId', op: 'EQUAL', value: nextCandidateId }],
              }).catch(() => []),
              fsQueryTenantDocs<Certificate>('certificates', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
                filters: [{ field: 'candidateDocId', op: 'EQUAL', value: nextCandidateId }],
              }).catch(() => []),
            ]);
            for (const e of enrs) {
              if (e.candidateUserId !== uid) {
                await fsUpdateDoc('enrollments', e.id, { candidateUserId: uid }, req.idToken!, ['updatedAt']).catch(() => {});
              }
            }
            for (const c of cards) {
              if (c.candidateUserId !== uid) {
                await fsUpdateDoc('trainingCards', c.id, { candidateUserId: uid }, req.idToken!, []).catch(() => {});
              }
            }
            for (const cert of certs) {
              if (cert.candidateUserId !== uid) {
                await fsUpdateDoc('certificates', cert.id, { candidateUserId: uid }, req.idToken!, ['updatedAt']).catch(() => {});
              }
            }
          }
        }

        // Write granular audit events
        if (updates.status && updates.status !== existingUser.status) {
          await writeAuditLog(
            req.user!,
            updates.status === 'active' ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
            'users',
            uid,
            `${updates.status === 'active' ? 'Activated' : 'Deactivated'} user ${existingUser.email}`,
            req.idToken!,
            req.tenantId!
          );
        }
        if (updates.role && updates.role !== existingUser.role) {
          await writeAuditLog(
            req.user!,
            'UPDATE_USER_ROLE',
            'users',
            uid,
            `Changed role for ${existingUser.email} from ${existingUser.role} to ${updates.role}`,
            req.idToken!,
            req.tenantId!
          );
        }
        if (permissionsUpdated) {
          await writeAuditLog(
            req.user!,
            'UPDATE_USER_PERMISSIONS',
            'users',
            uid,
            `Updated custom permission overrides for ${existingUser.email}`,
            req.idToken!,
            req.tenantId!
          );
        }
        if (
          !updates.status &&
          !updates.role &&
          !permissionsUpdated
        ) {
          await writeAuditLog(
            req.user!,
            'UPDATE_USER_PROFILE',
            'users',
            uid,
            `Updated profile/assignments for ${existingUser.email}`,
            req.idToken!,
            req.tenantId!
          );
        }

        const updated = await fsGetDoc<UserProfile>('users', uid, req.idToken!);
        res.json({ user: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/users/:uid/reset-password',
    requireAuth,
    requirePermission('user_management', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const uid = String(req.params.uid);
        const target = await fsGetDoc<UserProfile>('users', uid, req.idToken!);
        if (!target || !assertRecordTenant(target, req.tenantId!, !req.strictTenantQuery)) {
          res.status(target ? 403 : 404).json({
            error: target ? 'Forbidden: user belongs to another tenant' : 'User not found',
          });
          return;
        }
        if (
          !isTenantOwnerRole(req.user!.role) &&
          isTenantAdminOrOwnerRole(target.role)
        ) {
          res.status(403).json({
            error: 'Only Tenant Owner / Super Admin can trigger password reset for administrator accounts',
          });
          return;
        }
        await firebaseSendOobEmail({
          requestType: 'PASSWORD_RESET',
          email: target.email,
        });
        await writeAuditLog(
          req.user!,
          'SEND_PASSWORD_RESET',
          'users',
          uid,
          `Dispatched Firebase password reset email to ${target.email}`,
          req.idToken!,
          req.tenantId!
        );
        res.json({ ok: true, email: target.email });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Corporate Clients (Organizations)
  // ---------------------------------------------------------------------------
  router.get('/organizations', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const role = req.user!.role;
      if (role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ organizations: [] });
          return;
        }
        const org = await fsGetDoc<Organization>('organizations', req.user!.organizationId, req.idToken!);
        if (!org || !assertRecordTenant(org, req.tenantId!, !req.strictTenantQuery)) {
          res.json({ organizations: [] });
          return;
        }
        res.json({ organizations: [org] });
        return;
      }
      if (!isTenantAdminOrOwnerRole(role) && !['certificate_officer', 'trainer'].includes(role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const organizations = await fsQueryTenantDocs<Organization>('organizations', req.tenantId!, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      });
      res.json({ organizations });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/organizations',
    requireAuth,
    requirePermission('corporate_clients', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const nameEn = String(req.body.nameEn || '').trim().slice(0, 200);
        const nameAr = String(req.body.nameAr || nameEn).trim().slice(0, 200);
        const contactPerson = String(req.body.contactPerson || '').trim().slice(0, 160);
        const mobile = String(req.body.mobile || '').trim().slice(0, 32);
        const email = String(req.body.email || '').trim().slice(0, 200);

        if (nameEn.length < 2 || nameAr.length < 2) {
          res.status(400).json({ error: 'Company name in English and Arabic is required (min 2 characters)' });
          return;
        }
        if (!contactPerson || !mobile || !email) {
          res.status(400).json({ error: 'Contact person, mobile, and email are required' });
          return;
        }

        await assertTenantPlanLimit({
          tenantId: req.tenantId!,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: req.strictTenantQuery,
          metric: 'maxCorporateClients',
        });

        const organizationId = await nextSequenceCode('ORG', 'ORG', false, req.idToken!, 4, req.tenantId!);
        const docId = tenantScopedDocId(req.tenantId!, organizationId);
        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          organizationId,
          nameEn,
          nameAr,
          contactPerson,
          mobile,
          email,
          status: ['active', 'inactive', 'suspended'].includes(String(req.body.status))
            ? String(req.body.status)
            : 'active',
          createdBy: req.user!.uid,
        };

        const optionalFields: Array<[string, number]> = [
          ['crNumber', 64],
          ['vatNumber', 40],
          ['contactDesignation', 120],
          ['address', 400],
          ['city', 120],
          ['billingInfo', 600],
          ['notes', 1500],
        ];
        for (const [field, maxLen] of optionalFields) {
          if (req.body[field] !== undefined && String(req.body[field]).trim() !== '') {
            payload[field] = String(req.body[field]).trim().slice(0, maxLen);
          }
        }

        await fsCreateDoc('organizations', docId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        await writeAuditLog(
          req.user!,
          'CREATE_ORGANIZATION',
          'organizations',
          docId,
          `Created organization ${organizationId} (${nameEn})`,
          req.idToken!,
          req.tenantId!
        );
        const created = await fsGetDoc<Organization>('organizations', docId, req.idToken!);
        res.json({ organization: created });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/organizations/:id',
    requireAuth,
    requirePermission('corporate_clients', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        if (req.user!.role === 'corporate_client') {
          res.status(403).json({ error: 'Only Training Center Administrators can modify organization records' });
          return;
        }
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Organization>('organizations', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: organization belongs to another tenant' : 'Organization not found',
          });
          return;
        }
        const updates: Record<string, unknown> = {};
        const boundedFields: Array<[string, number]> = [
          ['nameEn', 200],
          ['nameAr', 200],
          ['crNumber', 64],
          ['vatNumber', 40],
          ['contactPerson', 160],
          ['contactDesignation', 120],
          ['mobile', 32],
          ['email', 200],
          ['address', 400],
          ['city', 120],
          ['billingInfo', 600],
          ['notes', 1500],
        ];
        for (const [f, maxLen] of boundedFields) {
          if (req.body[f] !== undefined) {
            updates[f] = String(req.body[f]).trim().slice(0, maxLen);
          }
        }
        if (req.body.status !== undefined) {
          const st = String(req.body.status);
          if (!['active', 'inactive', 'suspended'].includes(st)) {
            res.status(400).json({ error: 'Invalid organization status' });
            return;
          }
          updates.status = st;
        }
        await fsUpdateDoc('organizations', docId, updates, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'UPDATE_ORGANIZATION',
          'organizations',
          docId,
          JSON.stringify(updates),
          req.idToken!,
          req.tenantId!
        );
        const updated = await fsGetDoc<Organization>('organizations', docId, req.idToken!);
        res.json({ organization: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Courses Catalog
  // ---------------------------------------------------------------------------
  const COURSE_TYPES = ['theoretical', 'practical', 'blended', 'certification', 'refresher'] as const;
  const COURSE_STATUSES = ['active', 'inactive', 'archived'] as const;
  const TRAINER_EMPLOYMENT_STATUSES = ['full_time', 'part_time', 'contract', 'freelance'] as const;
  const TRAINER_STATUSES = ['active', 'inactive', 'archived'] as const;

  function toTimeMinutes(val: string | undefined, fallbackMinutes: number): number {
    if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fallbackMinutes;
    const [h, m] = val.trim().split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes;
    return h * 60 + m;
  }

  function computeBatchScheduledHours(b: Batch): number {
    const start = Date.parse(b.startDate);
    const end = Date.parse(b.endDate);
    const days =
      !Number.isNaN(start) && !Number.isNaN(end) && end >= start
        ? Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1
        : 1;
    const sMin = toTimeMinutes(b.startTime, 8 * 60);
    const eMin = toTimeMinutes(b.endTime, 16 * 60);
    const hoursPerDay = eMin > sMin ? (eMin - sMin) / 60 : 8;
    return Math.round(days * hoursPerDay * 10) / 10;
  }

  function findTrainerBatchConflict(
    trainerId: string,
    startDate: string,
    endDate: string,
    startTime: string,
    endTime: string,
    allBatches: Batch[],
    excludeBatchId?: string
  ): Batch | undefined {
    const sMin = toTimeMinutes(startTime, 8 * 60);
    const eMin = toTimeMinutes(endTime, 16 * 60);

    return allBatches.find((b) => {
      if (excludeBatchId && b.id === excludeBatchId) return false;
      if (b.trainerId !== trainerId) return false;
      if (b.status !== 'scheduled' && b.status !== 'in_progress') return false;
      const datesOverlap = startDate <= b.endDate && endDate >= b.startDate;
      if (!datesOverlap) return false;
      const bSMin = toTimeMinutes(b.startTime, 8 * 60);
      const bEMin = toTimeMinutes(b.endTime, 16 * 60);
      return sMin < bEMin && eMin > bSMin;
    });
  }

  async function getTrainerAssignedCourseSet(req: AuthedRequest): Promise<Set<string>> {
    const [trainers, batches] = await Promise.all([
      fsQueryTenantDocs<Trainer>('trainers', req.tenantId!, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      }).catch(() => []),
      fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      }).catch(() => []),
    ]);
    const ownTrainers = trainers.filter(
      (t) => t.userId === req.user!.uid || (req.user!.trainerId && t.id === req.user!.trainerId)
    );
    const ownTrainerIds = new Set<string>(ownTrainers.map((t) => t.id));
    if (req.user!.trainerId) ownTrainerIds.add(req.user!.trainerId);

    const allowedCourseIds = new Set<string>();
    for (const tr of ownTrainers) {
      for (const cid of tr.assignedCourseIds || []) {
        allowedCourseIds.add(cid);
      }
    }
    for (const b of batches) {
      if (b.trainerUserId === req.user!.uid || ownTrainerIds.has(b.trainerId)) {
        allowedCourseIds.add(b.courseId);
      }
    }
    return allowedCourseIds;
  }

  router.get('/courses', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const courses = await fsQueryTenantDocs<Course>('courses', req.tenantId!, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      });
      if (req.user!.role === 'trainer') {
        const assignedIds = await getTrainerAssignedCourseSet(req);
        res.json({ courses: courses.filter((c) => assignedIds.has(c.id)) });
        return;
      }
      res.json({ courses });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/courses',
    requireAuth,
    requirePermission('courses', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const titleEn = String(req.body.titleEn || '').trim().slice(0, 220);
        if (!titleEn) {
          res.status(400).json({ error: 'Course English title is required' });
          return;
        }
        const courseId = await nextSequenceCode('CRS', 'CRS', false, req.idToken!, 4, req.tenantId!);
        const courseDocId = tenantScopedDocId(req.tenantId!, courseId);
        const courseType = COURSE_TYPES.includes(req.body.courseType) ? req.body.courseType : 'blended';
        const status = COURSE_STATUSES.includes(req.body.status) ? req.body.status : 'active';
        const supportingDocIds = Array.isArray(req.body.supportingDocIds)
          ? Array.from(
              new Set<string>(req.body.supportingDocIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
            ).slice(0, 20)
          : [];

        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          courseId,
          courseCode: String(req.body.courseCode || courseId).trim().toUpperCase().slice(0, 40),
          titleEn,
          titleAr: String(req.body.titleAr || titleEn).trim().slice(0, 220),
          descriptionEn: String(req.body.descriptionEn || '').slice(0, 2000),
          descriptionAr: String(req.body.descriptionAr || '').slice(0, 2000),
          category: String(req.body.category || 'Industrial Safety').slice(0, 120),
          courseType,
          duration: Math.max(0.5, Number(req.body.duration || 1)),
          durationUnit: ['hours', 'days', 'weeks'].includes(req.body.durationUnit)
            ? req.body.durationUnit
            : 'days',
          theoryHours: Math.max(0, Number(req.body.theoryHours ?? 0)),
          practicalHours: Math.max(0, Number(req.body.practicalHours ?? 0)),
          fee: Math.max(0, Number(req.body.fee || 0)),
          minAttendancePct: Math.min(100, Math.max(0, Number(req.body.minAttendancePct ?? 80))),
          minExamScore: Math.min(100, Math.max(0, Number(req.body.minExamScore ?? 60))),
          examRequired: req.body.examRequired !== false,
          practicalRequired: Boolean(req.body.practicalRequired),
          validityMonths: Math.max(0, Number(req.body.validityMonths ?? 24)),
          prerequisites: String(req.body.prerequisites || '').trim().slice(0, 1000),
          supportingDocIds,
          status,
          createdBy: req.user!.uid,
        };
        if (req.body.imageFileId) {
          payload.imageFileId = String(req.body.imageFileId).trim().slice(0, 160);
        }
        if (req.body.defaultCertificateTemplateId) {
          payload.defaultCertificateTemplateId = String(req.body.defaultCertificateTemplateId);
        }
        if (req.body.defaultCardTemplateId) {
          payload.defaultCardTemplateId = String(req.body.defaultCardTemplateId);
        }

        await fsCreateDoc('courses', courseDocId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        await writeAuditLog(
          req.user!,
          'CREATE_COURSE',
          'courses',
          courseDocId,
          `Created course ${payload.courseCode} - ${payload.titleEn}`,
          req.idToken!,
          req.tenantId!
        );
        const created = await fsGetDoc<Course>('courses', courseDocId, req.idToken!);
        res.json({ course: created });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/courses/:id',
    requireAuth,
    requirePermission('courses', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Course>('courses', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: course belongs to another tenant' : 'Course not found',
          });
          return;
        }

        const updates: Record<string, unknown> = {};
        if (req.body.courseCode !== undefined) {
          updates.courseCode = String(req.body.courseCode).trim().toUpperCase().slice(0, 40);
        }
        if (req.body.titleEn !== undefined) updates.titleEn = String(req.body.titleEn).trim().slice(0, 220);
        if (req.body.titleAr !== undefined) updates.titleAr = String(req.body.titleAr).trim().slice(0, 220);
        if (req.body.descriptionEn !== undefined) updates.descriptionEn = String(req.body.descriptionEn).slice(0, 2000);
        if (req.body.descriptionAr !== undefined) updates.descriptionAr = String(req.body.descriptionAr).slice(0, 2000);
        if (req.body.category !== undefined) updates.category = String(req.body.category).slice(0, 120);
        if (req.body.courseType !== undefined && COURSE_TYPES.includes(req.body.courseType)) {
          updates.courseType = req.body.courseType;
        }
        if (req.body.durationUnit !== undefined && ['hours', 'days', 'weeks'].includes(req.body.durationUnit)) {
          updates.durationUnit = req.body.durationUnit;
        }
        if (req.body.prerequisites !== undefined) {
          updates.prerequisites = String(req.body.prerequisites).trim().slice(0, 1000);
        }
        if (req.body.imageFileId !== undefined) {
          updates.imageFileId = String(req.body.imageFileId || '').trim().slice(0, 160);
        }
        if (Array.isArray(req.body.supportingDocIds)) {
          updates.supportingDocIds = Array.from(
            new Set<string>(req.body.supportingDocIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
          ).slice(0, 20);
        }
        if (req.body.defaultCertificateTemplateId !== undefined) {
          updates.defaultCertificateTemplateId = String(req.body.defaultCertificateTemplateId);
        }
        if (req.body.defaultCardTemplateId !== undefined) {
          updates.defaultCardTemplateId = String(req.body.defaultCardTemplateId);
        }
        if (req.body.status !== undefined && COURSE_STATUSES.includes(req.body.status)) {
          updates.status = req.body.status;
        }

        const numFields = [
          'duration',
          'theoryHours',
          'practicalHours',
          'fee',
          'minAttendancePct',
          'minExamScore',
          'validityMonths',
        ];
        for (const f of numFields) {
          if (req.body[f] !== undefined) updates[f] = Math.max(0, Number(req.body[f]));
        }
        if (req.body.examRequired !== undefined) updates.examRequired = Boolean(req.body.examRequired);
        if (req.body.practicalRequired !== undefined) {
          updates.practicalRequired = Boolean(req.body.practicalRequired);
        }

        await fsUpdateDoc('courses', docId, updates, req.idToken!, ['updatedAt']);

        if (updates.status !== undefined && updates.status !== existing.status) {
          await writeAuditLog(
            req.user!,
            'COURSE_STATUS_CHANGE',
            'courses',
            docId,
            `Course ${existing.courseCode} status changed from ${existing.status} to ${updates.status}`,
            req.idToken!,
            req.tenantId!
          );
        }
        const otherKeys = Object.keys(updates).filter((k) => k !== 'status');
        if (otherKeys.length > 0 || updates.status === existing.status) {
          await writeAuditLog(
            req.user!,
            'UPDATE_COURSE',
            'courses',
            docId,
            `Updated ${existing.courseCode}: ${otherKeys.join(', ') || 'metadata'}`,
            req.idToken!,
            req.tenantId!
          );
        }

        const updated = await fsGetDoc<Course>('courses', docId, req.idToken!);
        res.json({ course: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/courses/:id/history',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'trainer']),
    async (req: AuthedRequest, res) => {
      try {
        const courseId = String(req.params.id);
        const course = await fsGetDoc<Course>('courses', courseId, req.idToken!);
        if (!course || !assertRecordTenant(course, req.tenantId!, !req.strictTenantQuery)) {
          res.status(course ? 403 : 404).json({
            error: course ? 'Forbidden: course belongs to another tenant' : 'Course not found',
          });
          return;
        }
        if (req.user!.role === 'trainer') {
          const assignedSet = await getTrainerAssignedCourseSet(req);
          if (!assignedSet.has(courseId)) {
            res.status(403).json({ error: 'Trainers can only view history of assigned courses' });
            return;
          }
        }

        const isAdminOrOfficer =
          isTenantAdminOrOwnerRole(req.user!.role) || req.user!.role === 'certificate_officer';

        const [logs, batches, trainers] = await Promise.all([
          fsQueryTenantDocs<AuditLogItem>('auditLogs', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
            filters: [
              { field: 'entityType', op: 'EQUAL', value: 'courses' },
              { field: 'entityId', op: 'EQUAL', value: courseId },
            ],
          }).catch(() => []),
          fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
            filters: [{ field: 'courseId', op: 'EQUAL', value: courseId }],
          }).catch(() => []),
          isAdminOrOfficer
            ? fsQueryTenantDocs<Trainer>('trainers', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
              }).catch(() => [])
            : Promise.resolve([] as Trainer[]),
        ]);

        const sortedLogs = [...logs].sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        );
        const assignedTrainers = trainers.filter(
          (tr) => Array.isArray(tr.assignedCourseIds) && tr.assignedCourseIds.includes(courseId)
        );
        const sortedBatches = [...batches].sort((a, b) => b.startDate.localeCompare(a.startDate));

        res.json({
          course,
          logs: sortedLogs,
          batches: sortedBatches,
          assignedTrainers,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Trainers Registry, Workload & Schedule
  // ---------------------------------------------------------------------------
  router.get(
    '/trainers',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'trainer', 'corporate_client']),
    async (req: AuthedRequest, res) => {
      try {
        const trainers = await fsQueryTenantDocs<Trainer>('trainers', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        });
        if (req.user!.role === 'trainer') {
          const own = trainers.filter(
            (t) => t.userId === req.user!.uid || (req.user!.trainerId && t.id === req.user!.trainerId)
          );
          res.json({ trainers: own });
          return;
        }
        res.json({ trainers });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/trainers/workload',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'trainer']),
    async (req: AuthedRequest, res) => {
      try {
        const [allTrainers, courses, batches] = await Promise.all([
          fsQueryTenantDocs<Trainer>('trainers', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
          fsQueryTenantDocs<Course>('courses', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
          fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
        ]);

        const trainers =
          req.user!.role === 'trainer'
            ? allTrainers.filter(
                (t) => t.userId === req.user!.uid || (req.user!.trainerId && t.id === req.user!.trainerId)
              )
            : allTrainers;

        const courseMap = new Map(courses.map((c) => [c.id, c]));

        const workloads = trainers.map((tr) => {
          const trBatches = batches
            .filter((b) => b.trainerId === tr.id || (tr.userId && b.trainerUserId === tr.userId))
            .sort((a, b) => a.startDate.localeCompare(b.startDate));

          const upcomingBatches = trBatches.filter((b) => b.status === 'scheduled').length;
          const activeBatches = trBatches.filter((b) => b.status === 'in_progress').length;
          const completedBatches = trBatches.filter((b) => b.status === 'completed').length;
          const totalEnrolledTrainees = trBatches
            .filter((b) => b.status !== 'cancelled')
            .reduce((sum, b) => sum + (b.enrollmentCount || 0), 0);
          const scheduledHours =
            Math.round(
              trBatches
                .filter((b) => b.status === 'scheduled' || b.status === 'in_progress')
                .reduce((sum, b) => sum + computeBatchScheduledHours(b), 0) * 10
            ) / 10;

          return {
            trainerId: tr.id,
            trainerCode: tr.trainerId,
            assignedCoursesCount: (tr.assignedCourseIds || []).length,
            totalBatches: trBatches.length,
            upcomingBatches,
            activeBatches,
            completedBatches,
            totalEnrolledTrainees,
            scheduledHours,
            schedule: trBatches.map((b) => {
              const crs = courseMap.get(b.courseId);
              return {
                ...b,
                courseCode: crs?.courseCode || '',
                courseTitleEn: crs?.titleEn || b.courseId,
                courseTitleAr: crs?.titleAr || b.courseId,
              };
            }),
          };
        });

        res.json({ workloads });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/trainers',
    requireAuth,
    requirePermission('trainers', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const nameEn = String(req.body.nameEn || '').trim().slice(0, 200);
        if (!nameEn) {
          res.status(400).json({ error: 'Trainer English name is required' });
          return;
        }
        const trainerId = await nextSequenceCode('TRN', 'TRN', false, req.idToken!, 4, req.tenantId!);
        const trainerDocId = tenantScopedDocId(req.tenantId!, trainerId);
        const employmentStatus = TRAINER_EMPLOYMENT_STATUSES.includes(req.body.employmentStatus)
          ? req.body.employmentStatus
          : 'full_time';
        const status = TRAINER_STATUSES.includes(req.body.status) ? req.body.status : 'active';

        const assignedCourseIds = Array.isArray(req.body.assignedCourseIds)
          ? Array.from(
              new Set<string>(req.body.assignedCourseIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
            ).slice(0, 100)
          : [];
        const credentialFileIds = Array.isArray(req.body.credentialFileIds)
          ? Array.from(
              new Set<string>(req.body.credentialFileIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
            ).slice(0, 20)
          : [];

        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          trainerId,
          nameEn,
          nameAr: String(req.body.nameAr || nameEn).trim().slice(0, 200),
          mobile: String(req.body.mobile || '').trim().slice(0, 32),
          email: String(req.body.email || '').trim().slice(0, 200),
          nationality: String(req.body.nationality || '').trim().slice(0, 120),
          qualifications: String(req.body.qualifications || '').slice(0, 500),
          certifications: String(req.body.certifications || '').slice(0, 500),
          specialization: String(req.body.specialization || '').slice(0, 200),
          experienceYears: Math.max(0, Number(req.body.experienceYears || 0)),
          employmentStatus,
          assignedCourseIds,
          credentialFileIds,
          status,
          createdBy: req.user!.uid,
        };
        if (req.body.userId) payload.userId = String(req.body.userId).trim();
        if (req.body.photoFileId) payload.photoFileId = String(req.body.photoFileId).trim();

        await fsCreateDoc('trainers', trainerDocId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        await writeAuditLog(
          req.user!,
          'CREATE_TRAINER',
          'trainers',
          trainerDocId,
          `Created trainer ${payload.nameEn} (${employmentStatus})`,
          req.idToken!,
          req.tenantId!
        );
        const created = await fsGetDoc<Trainer>('trainers', trainerDocId, req.idToken!);
        res.json({ trainer: created });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/trainers/:id',
    requireAuth,
    requirePermission('trainers', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Trainer>('trainers', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: trainer belongs to another tenant' : 'Trainer not found',
          });
          return;
        }

        const updates: Record<string, unknown> = {};
        if (req.body.userId !== undefined) updates.userId = String(req.body.userId || '').trim();
        if (req.body.nameEn !== undefined) updates.nameEn = String(req.body.nameEn).trim().slice(0, 200);
        if (req.body.nameAr !== undefined) updates.nameAr = String(req.body.nameAr).trim().slice(0, 200);
        if (req.body.mobile !== undefined) updates.mobile = String(req.body.mobile).trim().slice(0, 32);
        if (req.body.email !== undefined) updates.email = String(req.body.email).trim().slice(0, 200);
        if (req.body.nationality !== undefined) updates.nationality = String(req.body.nationality).trim().slice(0, 120);
        if (req.body.qualifications !== undefined) updates.qualifications = String(req.body.qualifications).slice(0, 500);
        if (req.body.certifications !== undefined) updates.certifications = String(req.body.certifications).slice(0, 500);
        if (req.body.specialization !== undefined) updates.specialization = String(req.body.specialization).slice(0, 200);
        if (req.body.photoFileId !== undefined) updates.photoFileId = String(req.body.photoFileId || '').trim();
        if (req.body.employmentStatus !== undefined && TRAINER_EMPLOYMENT_STATUSES.includes(req.body.employmentStatus)) {
          updates.employmentStatus = req.body.employmentStatus;
        }
        if (req.body.status !== undefined && TRAINER_STATUSES.includes(req.body.status)) {
          updates.status = req.body.status;
        }
        if (req.body.experienceYears !== undefined) {
          updates.experienceYears = Math.max(0, Number(req.body.experienceYears));
        }
        if (Array.isArray(req.body.assignedCourseIds)) {
          updates.assignedCourseIds = Array.from(
            new Set<string>(req.body.assignedCourseIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
          ).slice(0, 100);
        }
        if (Array.isArray(req.body.credentialFileIds)) {
          updates.credentialFileIds = Array.from(
            new Set<string>(req.body.credentialFileIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
          ).slice(0, 20);
        }

        await fsUpdateDoc('trainers', docId, updates, req.idToken!, ['updatedAt']);

        if (updates.status !== undefined && updates.status !== existing.status) {
          await writeAuditLog(
            req.user!,
            'TRAINER_STATUS_CHANGE',
            'trainers',
            docId,
            `Trainer ${existing.trainerId} status changed from ${existing.status} to ${updates.status}`,
            req.idToken!,
            req.tenantId!
          );
        }

        const prevCourseKey = [...(existing.assignedCourseIds || [])].sort().join(',');
        const nextCourseKey = Array.isArray(updates.assignedCourseIds)
          ? [...(updates.assignedCourseIds as string[])].sort().join(',')
          : prevCourseKey;
        if (Array.isArray(updates.assignedCourseIds) && nextCourseKey !== prevCourseKey) {
          await writeAuditLog(
            req.user!,
            'ASSIGN_TRAINER_COURSES',
            'trainers',
            docId,
            `Updated assigned courses (${(updates.assignedCourseIds as string[]).length}): ${(updates.assignedCourseIds as string[]).join(', ') || 'none'}`,
            req.idToken!,
            req.tenantId!
          );
        }

        const generalFields = Object.keys(updates).filter(
          (k) => k !== 'status' && k !== 'assignedCourseIds'
        );
        if (generalFields.length > 0) {
          await writeAuditLog(
            req.user!,
            'UPDATE_TRAINER',
            'trainers',
            docId,
            `Updated ${existing.trainerId}: ${generalFields.join(', ')}`,
            req.idToken!,
            req.tenantId!
          );
        }

        const updated = await fsGetDoc<Trainer>('trainers', docId, req.idToken!);
        res.json({ trainer: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/trainers/:id/assign-courses',
    requireAuth,
    requirePermission('trainers', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Trainer>('trainers', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: trainer belongs to another tenant' : 'Trainer not found',
          });
          return;
        }
        const requestedIds = Array.isArray(req.body?.courseIds)
          ? Array.from(
              new Set<string>(req.body.courseIds.map((v: unknown) => String(v || '').trim()).filter(Boolean))
            ).slice(0, 100)
          : [];

        const allCourses = await fsQueryTenantDocs<Course>('courses', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        });
        const courseMap = new Map(allCourses.map((c) => [c.id, c]));
        const validIds = requestedIds.filter((cid) => courseMap.has(cid));
        const courseSummary = validIds.map((cid) => courseMap.get(cid)?.courseCode || cid).join(', ');

        await fsUpdateDoc('trainers', docId, { assignedCourseIds: validIds }, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'ASSIGN_TRAINER_COURSES',
          'trainers',
          docId,
          `Assigned ${validIds.length} course(s) to ${existing.trainerId} (${existing.nameEn}): ${courseSummary || 'none'}`,
          req.idToken!,
          req.tenantId!
        );
        const updated = await fsGetDoc<Trainer>('trainers', docId, req.idToken!);
        res.json({ trainer: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/trainers/:id/history',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'trainer']),
    async (req: AuthedRequest, res) => {
      try {
        const trainerDocId = String(req.params.id);
        const trainer = await fsGetDoc<Trainer>('trainers', trainerDocId, req.idToken!);
        if (!trainer || !assertRecordTenant(trainer, req.tenantId!, !req.strictTenantQuery)) {
          res.status(trainer ? 403 : 404).json({
            error: trainer ? 'Forbidden: trainer belongs to another tenant' : 'Trainer not found',
          });
          return;
        }
        if (
          req.user!.role === 'trainer' &&
          trainer.userId !== req.user!.uid &&
          req.user!.trainerId !== trainer.id
        ) {
          res.status(403).json({ error: 'Trainers can only view their own history' });
          return;
        }

        const isAdminOrOfficer =
          isTenantAdminOrOwnerRole(req.user!.role) || req.user!.role === 'certificate_officer';

        const [trainerLogs, batches, batchLogs] = await Promise.all([
          fsQueryTenantDocs<AuditLogItem>('auditLogs', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
            filters: [
              { field: 'entityType', op: 'EQUAL', value: 'trainers' },
              { field: 'entityId', op: 'EQUAL', value: trainerDocId },
            ],
          }).catch(() => []),
          fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
            filters: [{ field: 'trainerId', op: 'EQUAL', value: trainerDocId }],
          }).catch(() => []),
          isAdminOrOfficer
            ? fsQueryTenantDocs<AuditLogItem>('auditLogs', req.tenantId!, req.idToken!, {
                strictTenantFilter: req.strictTenantQuery,
                filters: [{ field: 'entityType', op: 'EQUAL', value: 'batches' }],
              }).catch(() => [])
            : Promise.resolve([] as AuditLogItem[]),
        ]);

        const ownBatchIds = new Set<string>(batches.map((b) => b.id));
        const relatedBatchLogs = batchLogs.filter((l) => {
          const details = l.details || '';
          return (
            ownBatchIds.has(l.entityId) ||
            details.includes(trainer.id) ||
            details.includes(trainer.trainerId) ||
            details.includes(trainer.nameEn)
          );
        });

        const mergedLogs = [...trainerLogs, ...relatedBatchLogs].sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        );
        const sortedBatches = [...batches].sort((a, b) => b.startDate.localeCompare(a.startDate));

        res.json({
          trainer,
          logs: mergedLogs,
          batches: sortedBatches,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Training Batches (with Trainer Schedule Conflict Prevention & Dashboard)
  // ---------------------------------------------------------------------------
  const TRAINING_MODES: TrainingMode[] = ['classroom', 'practical', 'online', 'hybrid'];

  router.get('/batches', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const batches = await fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      });
      if (req.user!.role === 'trainer') {
        const filtered = batches.filter(
          (b) =>
            b.trainerUserId === req.user!.uid ||
            (req.user!.trainerId && b.trainerId === req.user!.trainerId)
        );
        res.json({ batches: filtered });
        return;
      }
      if (req.user!.role === 'candidate') {
        const myEnrollments = await fsQueryTenantDocs<Enrollment>('enrollments', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
        });
        const myBatchIds = new Set(myEnrollments.map((e) => e.batchId));
        res.json({ batches: batches.filter((b) => myBatchIds.has(b.id)) });
        return;
      }
      res.json({ batches });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/batches/:id/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const batchId = String(req.params.id);
      const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
      if (!batch || !assertRecordTenant(batch, req.tenantId!, !req.strictTenantQuery)) {
        res.status(batch ? 403 : 404).json({
          error: batch ? 'Forbidden: batch belongs to another tenant' : 'Batch not found',
        });
        return;
      }

      if (
        req.user!.role === 'trainer' &&
        batch.trainerUserId !== req.user!.uid &&
        req.user!.trainerId !== batch.trainerId
      ) {
        res.status(403).json({ error: 'Forbidden: trainer can only view own assigned batch dashboards' });
        return;
      }

      const [
        course,
        trainer,
        allBatches,
        enrollments,
        attendance,
        assessments,
        trainingCards,
        certificates,
        candidates,
        organizations,
      ] = await Promise.all([
        fsGetDoc<Course>('courses', batch.courseId, req.idToken!),
        fsGetDoc<Trainer>('trainers', batch.trainerId, req.idToken!),
        fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        }).catch(() => []),
        fsQueryTenantDocs<Enrollment>('enrollments', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
        }).catch(() => []),
        fsQueryTenantDocs<AttendanceRecord>('attendance', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
        }).catch(() => []),
        fsQueryTenantDocs<AssessmentRecord>('assessments', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
        }).catch(() => []),
        fsQueryTenantDocs<TrainingCard>('trainingCards', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
        }).catch(() => []),
        fsQueryTenantDocs<Certificate>('certificates', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
        }).catch(() => []),
        fsQueryTenantDocs<Candidate>('candidates', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        }).catch(() => []),
        fsQueryTenantDocs<Organization>('organizations', req.tenantId!, req.idToken!, {
          strictTenantFilter: req.strictTenantQuery,
        }).catch(() => []),
      ]);

      if (req.user!.role === 'candidate') {
        const isEnrolled = enrollments.some(
          (e) =>
            e.candidateUserId === req.user!.uid ||
            (req.user!.candidateId && e.candidateDocId === req.user!.candidateId)
        );
        if (!isEnrolled) {
          res.status(403).json({ error: 'Forbidden: not enrolled in this batch' });
          return;
        }
      }

      const candMap = new Map(candidates.map((c) => [c.id, c]));
      const orgMap = new Map(organizations.map((o) => [o.id, o]));
      const cardByEnr = new Map<string, TrainingCard>();
      for (const card of trainingCards) {
        if (!cardByEnr.has(card.enrollmentId) || card.status === 'active') {
          cardByEnr.set(card.enrollmentId, card);
        }
      }
      const certByEnr = new Map<string, Certificate>();
      for (const cert of certificates) {
        if (!certByEnr.has(cert.enrollmentId) || cert.status === 'valid') {
          certByEnr.set(cert.enrollmentId, cert);
        }
      }

      const conflictingBatches = allBatches.filter((other) => {
        if (other.id === batch.id) return false;
        if (other.trainerId !== batch.trainerId) return false;
        if (other.status !== 'scheduled' && other.status !== 'in_progress') return false;
        if (batch.status !== 'scheduled' && batch.status !== 'in_progress') return false;
        if (!(batch.startDate <= other.endDate && batch.endDate >= other.startDate)) return false;
        const sMin = toTimeMinutes(batch.startTime, 8 * 60);
        const eMin = toTimeMinutes(batch.endTime, 16 * 60);
        const oSMin = toTimeMinutes(other.startTime, 8 * 60);
        const oEMin = toTimeMinutes(other.endTime, 16 * 60);
        return sMin < oEMin && eMin > oSMin;
      });

      const scopedEnrollments = enrollments.filter((e) => {
        if (req.user!.role === 'corporate_client') {
          return Boolean(req.user!.organizationId && e.organizationId === req.user!.organizationId);
        }
        if (req.user!.role === 'candidate') {
          return (
            e.candidateUserId === req.user!.uid ||
            (req.user!.candidateId && e.candidateDocId === req.user!.candidateId)
          );
        }
        return true;
      });

      const participating = enrollments.filter((e) => !['cancelled', 'withdrawn'].includes(e.status));
      const participatingIds = new Set(participating.map((e) => e.id));
      const uniqueDates = new Set(attendance.map((a) => a.date));
      const participatingAttendance = attendance.filter((a) => participatingIds.has(a.enrollmentId));
      const totalAttendanceMarks = participatingAttendance.length;
      const presentOrLateMarks = participatingAttendance.filter(
        (a) => a.status === 'present' || a.status === 'late'
      ).length;
      const attendanceRatePct =
        totalAttendanceMarks > 0 ? Math.round((presentOrLateMarks / totalAttendanceMarks) * 100) : 0;

      const latestAssessByEnr = new Map<string, AssessmentRecord>();
      for (const a of assessments) {
        const prev = latestAssessByEnr.get(a.enrollmentId);
        if (!prev || a.attemptNumber > prev.attemptNumber) {
          latestAssessByEnr.set(a.enrollmentId, a);
        }
      }
      const assessedCount = participating.filter((e) => latestAssessByEnr.has(e.id)).length;
      const assessmentPassCount = participating.filter(
        (e) => latestAssessByEnr.get(e.id)?.result === 'pass'
      ).length;
      const assessmentFailCount = participating.filter(
        (e) => latestAssessByEnr.get(e.id)?.result === 'fail'
      ).length;

      const activeSeatsUsed = batch.enrollmentCount ?? participating.filter((e) => e.status !== 'pending').length;
      const availableSeats = Math.max(0, batch.capacity - activeSeatsUsed);

      const roster = scopedEnrollments.map((enr) => {
        const cand = candMap.get(enr.candidateDocId);
        const org = enr.organizationId ? orgMap.get(enr.organizationId) : undefined;
        const enrAtt = attendance.filter((a) => a.enrollmentId === enr.id);
        const presentCount = enrAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
        const absentCount = enrAtt.filter((a) => a.status === 'absent').length;
        const enrAttPct = enrAtt.length > 0 ? Math.round((presentCount / enrAtt.length) * 100) : 0;
        const latestAssess = latestAssessByEnr.get(enr.id);
        const card = cardByEnr.get(enr.id);
        const cert = certByEnr.get(enr.id);

        return {
          enrollment: enr,
          candidate: cand
            ? {
                id: cand.id,
                candidateId: cand.candidateId,
                fullNameEn: cand.fullNameEn,
                fullNameAr: cand.fullNameAr,
                organizationId: cand.organizationId,
                companyName: org ? org.nameEn : cand.companyName,
                companyNameAr: org ? org.nameAr : cand.companyName,
              }
            : null,
          attendance: {
            total: enrAtt.length,
            present: presentCount,
            absent: absentCount,
            pct: enrAttPct,
          },
          latestAssessment: latestAssess
            ? {
                assessmentType: latestAssess.assessmentType,
                obtainedMarks: latestAssess.obtainedMarks,
                maxMarks: latestAssess.maxMarks,
                result: latestAssess.result,
              }
            : null,
          trainingCard: card
            ? { id: card.id, cardSerialNumber: card.cardSerialNumber, status: card.status }
            : null,
          certificate: cert
            ? { id: cert.id, certificateNumber: cert.certificateNumber, status: cert.status }
            : null,
        };
      });

      res.json({
        batch,
        course,
        trainer,
        conflictingBatches,
        summary: {
          capacity: batch.capacity,
          minParticipants: batch.minParticipants ?? 0,
          enrolledCount: activeSeatsUsed,
          availableSeats,
          pendingCount: enrollments.filter((e) => e.status === 'pending').length,
          confirmedCount: enrollments.filter((e) => e.status === 'confirmed').length,
          inProgressCount: enrollments.filter((e) => e.status === 'in_progress').length,
          completedCount: enrollments.filter((e) => e.status === 'completed').length,
          failedCount: enrollments.filter((e) => e.status === 'failed').length,
          cancelledOrWithdrawnCount: enrollments.filter(
            (e) => e.status === 'cancelled' || e.status === 'withdrawn'
          ).length,
          enrollmentClosed: Boolean(batch.enrollmentClosed),
          uniqueAttendanceDates: uniqueDates.size,
          attendanceRatePct,
          assessedCount,
          assessmentPassCount,
          assessmentFailCount,
          trainerRecommendedCount: participating.filter((e) => e.trainerRecommended).length,
          completionApprovedCount: participating.filter((e) => e.completionApproved).length,
          trainingCardsCount: trainingCards.filter((c) => c.status === 'active').length,
          certificatesCount: certificates.filter((c) => c.status === 'valid').length,
        },
        roster,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/batches',
    requireAuth,
    requirePermission('batches', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const startDate = String(req.body.startDate || '').trim();
        const endDate = String(req.body.endDate || '').trim();
        const startTime = String(req.body.startTime || '08:00').trim();
        const endTime = String(req.body.endTime || '16:00').trim();
        const trainerId = String(req.body.trainerId || '').trim();
        const courseId = String(req.body.courseId || '').trim();
        const venue = String(req.body.venue || '').trim().slice(0, 200);

        if (!courseId || !trainerId || !startDate || !endDate || !venue) {
          res.status(400).json({ error: 'Course, trainer, venue, start date, and end date are required' });
          return;
        }
        if (endDate < startDate) {
          res.status(400).json({ error: 'End date cannot be earlier than start date' });
          return;
        }

        const [course, trainer, allBatches] = await Promise.all([
          fsGetDoc<Course>('courses', courseId, req.idToken!),
          fsGetDoc<Trainer>('trainers', trainerId, req.idToken!),
          fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
        ]);

        if (!course || !assertRecordTenant(course, req.tenantId!, !req.strictTenantQuery)) {
          res.status(course ? 403 : 404).json({
            error: course ? 'Forbidden: course belongs to another tenant' : 'Selected course not found',
          });
          return;
        }
        if (!trainer || !assertRecordTenant(trainer, req.tenantId!, !req.strictTenantQuery)) {
          res.status(trainer ? 403 : 404).json({
            error: trainer ? 'Forbidden: trainer belongs to another tenant' : 'Selected trainer not found',
          });
          return;
        }
        if (trainer.status !== 'active') {
          res.status(400).json({
            error: `Trainer ${trainer.trainerId} (${trainer.nameEn}) is currently ${trainer.status} and cannot be assigned to a new batch.`,
          });
          return;
        }

        const conflict = findTrainerBatchConflict(
          trainerId,
          startDate,
          endDate,
          startTime,
          endTime,
          allBatches
        );
        if (conflict) {
          res.status(409).json({
            error: `Trainer schedule conflict: ${trainer.nameEn} is already assigned to batch ${conflict.batchNumber} (${conflict.startDate} to ${conflict.endDate}, ${conflict.startTime || '08:00'}–${conflict.endTime || '16:00'}).`,
            code: 'TRAINER_SCHEDULE_CONFLICT',
            conflictBatch: conflict,
          });
          return;
        }

        await assertTenantPlanLimit({
          tenantId: req.tenantId!,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: req.strictTenantQuery,
          metric: 'maxBatches',
          currentCount: allBatches.length,
        });

        const batchId = await nextSequenceCode('BTH', 'BTH', true, req.idToken!, 4, req.tenantId!);
        const batchDocId = tenantScopedDocId(req.tenantId!, batchId);
        const capacity = Math.min(500, Math.max(1, Number(req.body.capacity || 20)));
        const minParticipants = Math.min(capacity, Math.max(0, Number(req.body.minParticipants ?? 1)));
        const trainingMode = TRAINING_MODES.includes(req.body.trainingMode)
          ? (req.body.trainingMode as TrainingMode)
          : 'classroom';
        const batchNumber = String(req.body.batchNumber || batchId).trim().slice(0, 64) || batchId;
        const batchName =
          String(req.body.batchName || '').trim().slice(0, 200) ||
          `${course.courseCode} — ${batchNumber}`;
        const notes = String(req.body.notes || '').trim().slice(0, 1000);

        const payload: Record<string, unknown> = {
          tenantId: req.tenantId!,
          batchId,
          batchNumber,
          batchName,
          courseId,
          trainerId,
          venue,
          trainingMode,
          startDate,
          endDate,
          startTime,
          endTime,
          capacity,
          minParticipants,
          enrollmentCount: 0,
          enrollmentClosed: Boolean(req.body.enrollmentClosed),
          status: 'scheduled',
          createdBy: req.user!.uid,
        };
        if (trainer.userId) payload.trainerUserId = trainer.userId;
        if (notes) payload.notes = notes;

        await fsCreateDoc('batches', batchDocId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        await Promise.all([
          writeAuditLog(
            req.user!,
            'CREATE_BATCH',
            'batches',
            batchDocId,
            `Scheduled batch ${payload.batchNumber} (${batchName}, ${trainingMode}, ${startDate} to ${endDate})`,
            req.idToken!,
            req.tenantId!
          ),
          writeAuditLog(
            req.user!,
            'ASSIGN_TRAINER_BATCH',
            'batches',
            batchDocId,
            `Assigned trainer ${trainer.trainerId} (${trainer.nameEn}) to batch ${payload.batchNumber}`,
            req.idToken!,
            req.tenantId!
          ),
        ]);

        const created = await fsGetDoc<Batch>('batches', batchDocId, req.idToken!);
        res.json({ batch: created });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/batches/:id',
    requireAuth,
    requirePermission('batches', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: batch belongs to another tenant' : 'Batch not found',
          });
          return;
        }
        if (
          req.user!.role === 'trainer' &&
          existing.trainerUserId !== req.user!.uid &&
          req.user!.trainerId !== existing.trainerId
        ) {
          res.status(403).json({ error: 'Trainer can only update own assigned batches' });
          return;
        }
        const updates: Record<string, unknown> = {};
        let assignedTrainer: Trainer | null = null;

        if (req.user!.role === 'trainer') {
          if (req.body.status) updates.status = String(req.body.status);
        } else {
          const strFields = [
            'batchNumber',
            'batchName',
            'courseId',
            'trainerId',
            'venue',
            'startDate',
            'endDate',
            'startTime',
            'endTime',
            'status',
            'notes',
            'cancellationReason',
          ];
          for (const f of strFields) {
            if (req.body[f] !== undefined) {
              const limit = f === 'notes' ? 1000 : f === 'cancellationReason' ? 500 : 200;
              updates[f] = String(req.body[f]).trim().slice(0, limit);
            }
          }
          if (updates.courseId && updates.courseId !== existing.courseId) {
            const newCourse = await fsGetDoc<Course>('courses', String(updates.courseId), req.idToken!);
            if (!newCourse || !assertRecordTenant(newCourse, req.tenantId!, !req.strictTenantQuery)) {
              res.status(403).json({ error: 'Selected course does not belong to this tenant' });
              return;
            }
          }
          if (req.body.trainingMode !== undefined && TRAINING_MODES.includes(req.body.trainingMode)) {
            updates.trainingMode = req.body.trainingMode;
          }
          if (req.body.enrollmentClosed !== undefined) {
            updates.enrollmentClosed = Boolean(req.body.enrollmentClosed);
          }

          let nextCapacity = existing.capacity;
          if (req.body.capacity !== undefined) {
            const cap = Math.min(500, Math.max(1, Number(req.body.capacity)));
            if (cap < existing.enrollmentCount) {
              res.status(400).json({ error: 'Capacity cannot be lower than current enrollment count' });
              return;
            }
            updates.capacity = cap;
            nextCapacity = cap;
          }
          if (req.body.minParticipants !== undefined) {
            updates.minParticipants = Math.min(nextCapacity, Math.max(0, Number(req.body.minParticipants)));
          }

          const nextTrainerId = String(updates.trainerId ?? existing.trainerId);
          const nextStartDate = String(updates.startDate ?? existing.startDate);
          const nextEndDate = String(updates.endDate ?? existing.endDate);
          const nextStartTime = String(updates.startTime ?? existing.startTime ?? '08:00');
          const nextEndTime = String(updates.endTime ?? existing.endTime ?? '16:00');
          const nextStatus = String(updates.status ?? existing.status);

          if (nextEndDate < nextStartDate) {
            res.status(400).json({ error: 'End date cannot be earlier than start date' });
            return;
          }

          const scheduleOrTrainerChanged =
            nextTrainerId !== existing.trainerId ||
            nextStartDate !== existing.startDate ||
            nextEndDate !== existing.endDate ||
            nextStartTime !== (existing.startTime || '08:00') ||
            nextEndTime !== (existing.endTime || '16:00') ||
            (nextStatus !== existing.status && (nextStatus === 'scheduled' || nextStatus === 'in_progress'));

          if (nextTrainerId) {
            assignedTrainer = await fsGetDoc<Trainer>('trainers', nextTrainerId, req.idToken!);
            if (!assignedTrainer || !assertRecordTenant(assignedTrainer, req.tenantId!, !req.strictTenantQuery)) {
              res.status(assignedTrainer ? 403 : 404).json({
                error: assignedTrainer ? 'Forbidden: trainer belongs to another tenant' : 'Selected trainer not found',
              });
              return;
            }
            if (nextTrainerId !== existing.trainerId && assignedTrainer.status !== 'active') {
              res.status(400).json({
                error: `Trainer ${assignedTrainer.trainerId} (${assignedTrainer.nameEn}) is ${assignedTrainer.status} and cannot be assigned.`,
              });
              return;
            }
            if (assignedTrainer.userId) {
              updates.trainerUserId = assignedTrainer.userId;
            }
          }

          if (scheduleOrTrainerChanged && (nextStatus === 'scheduled' || nextStatus === 'in_progress')) {
            const allBatches = await fsQueryTenantDocs<Batch>('batches', req.tenantId!, req.idToken!, {
              strictTenantFilter: req.strictTenantQuery,
            });
            const conflict = findTrainerBatchConflict(
              nextTrainerId,
              nextStartDate,
              nextEndDate,
              nextStartTime,
              nextEndTime,
              allBatches,
              docId
            );
            if (conflict) {
              res.status(409).json({
                error: `Trainer schedule conflict: ${assignedTrainer?.nameEn || nextTrainerId} is already assigned to batch ${conflict.batchNumber} (${conflict.startDate} to ${conflict.endDate}, ${conflict.startTime || '08:00'}–${conflict.endTime || '16:00'}).`,
                code: 'TRAINER_SCHEDULE_CONFLICT',
                conflictBatch: conflict,
              });
              return;
            }
          }
        }

        await fsUpdateDoc('batches', docId, updates, req.idToken!, ['updatedAt']);

        if (updates.trainerId && updates.trainerId !== existing.trainerId) {
          await writeAuditLog(
            req.user!,
            'ASSIGN_TRAINER_BATCH',
            'batches',
            docId,
            `Reassigned batch ${existing.batchNumber} trainer from ${existing.trainerId} to ${updates.trainerId} (${assignedTrainer?.nameEn || updates.trainerId})`,
            req.idToken!,
            req.tenantId!
          );
        }
        const datesChanged =
          (updates.startDate && updates.startDate !== existing.startDate) ||
          (updates.endDate && updates.endDate !== existing.endDate) ||
          (updates.startTime && updates.startTime !== existing.startTime) ||
          (updates.endTime && updates.endTime !== existing.endTime);
        if (datesChanged) {
          await writeAuditLog(
            req.user!,
            'RESCHEDULE_BATCH',
            'batches',
            docId,
            `Rescheduled batch ${existing.batchNumber} to ${updates.startDate ?? existing.startDate} → ${updates.endDate ?? existing.endDate}`,
            req.idToken!,
            req.tenantId!
          );
        }
        await writeAuditLog(
          req.user!,
          'UPDATE_BATCH',
          'batches',
          docId,
          JSON.stringify(updates),
          req.idToken!,
          req.tenantId!
        );

        const updated = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        res.json({ batch: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/batches/:id/toggle-enrollment',
    requireAuth,
    requirePermission('batches', 'edit'),
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: batch belongs to another tenant' : 'Batch not found',
          });
          return;
        }
        const nextClosed =
          typeof req.body?.closed === 'boolean' ? req.body.closed : !Boolean(existing.enrollmentClosed);

        await fsUpdateDoc('batches', docId, { enrollmentClosed: nextClosed }, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          nextClosed ? 'CLOSE_BATCH_ENROLLMENT' : 'REOPEN_BATCH_ENROLLMENT',
          'batches',
          docId,
          `${nextClosed ? 'Closed' : 'Reopened'} enrollment for batch ${existing.batchNumber}`,
          req.idToken!,
          req.tenantId!
        );

        const updated = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        res.json({ batch: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/batches/:id/cancel',
    requireAuth,
    requirePermission('batches', 'edit'),
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const docId = String(req.params.id);
        const existing = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        if (!existing || !assertRecordTenant(existing, req.tenantId!, !req.strictTenantQuery)) {
          res.status(existing ? 403 : 404).json({
            error: existing ? 'Forbidden: batch belongs to another tenant' : 'Batch not found',
          });
          return;
        }
        if (existing.status === 'completed') {
          res.status(400).json({ error: 'Completed batches cannot be cancelled' });
          return;
        }
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (!reason) {
          res.status(400).json({ error: 'Cancellation reason is required' });
          return;
        }

        await fsUpdateDoc(
          'batches',
          docId,
          {
            status: 'cancelled',
            enrollmentClosed: true,
            cancellationReason: reason,
          },
          req.idToken!,
          ['updatedAt']
        );

        if (existing.trainerUserId) {
          await createNotification(
            {
              tenantId: req.tenantId!,
              targetUserId: existing.trainerUserId,
              type: 'batch_cancelled',
              titleEn: `Batch Cancelled (${existing.batchNumber})`,
              titleAr: `تم إلغاء الدفعة (${existing.batchNumber})`,
              bodyEn: `Batch ${existing.batchNumber} was cancelled. Reason: ${reason}`,
              bodyAr: `تم إلغاء الدفعة ${existing.batchNumber}. السبب: ${reason}`,
            },
            req.idToken!
          ).catch(() => {});
        }

        await writeAuditLog(
          req.user!,
          'CANCEL_BATCH',
          'batches',
          docId,
          `Cancelled batch ${existing.batchNumber}. Reason: ${reason}`,
          req.idToken!,
          req.tenantId!
        );

        const updated = await fsGetDoc<Batch>('batches', docId, req.idToken!);
        res.json({ batch: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  return router;
}
