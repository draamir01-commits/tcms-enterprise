import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import {
  applyProviderStatusUpdate,
  buildCenterContactString,
  DEFAULT_MESSAGE_TEMPLATES,
  dispatchAutomatedCategoryNotifications,
  dispatchNotificationPipeline,
  DYNAMIC_PLACEHOLDERS,
  enqueueProviderReceipts,
  ensureDefaultMessageTemplates,
  escapeHtml,
  getIntegrationConfig,
  NOTIFICATION_CATEGORIES,
  reconcilePendingWebhookReceipts,
  renderBilingualTemplate,
  renderTemplateString,
  sendTransactionalEmail,
  sendWhatsappCloudMessage,
  verifyMetaSignatureHeader,
} from './messagingService.ts';
import { decryptSensitive } from './crypto.ts';
import { fsCreateDoc, fsDeleteDoc, fsGetDoc, fsQueryTenantDocs, fsUpdateDoc } from './firestoreRest.ts';
import {
  getCompanyBranding,
  requireAuth,
  requireRole,
  writeAuditLog,
  type AuthedRequest,
} from './helpers.ts';
import {
  assertRecordTenant,
  DEFAULT_TENANT_ID,
  isTenantAdminOrOwnerRole,
  tenantScopedDocId,
} from './tenantService.ts';
import type {
  Batch,
  Candidate,
  Certificate,
  Course,
  DeliveryLogItem,
  Enrollment,
  MessageTemplate,
  NotificationCategory,
  NotificationChannel,
  NotificationItem,
  TrainingCard,
} from '../src/types/tcms.ts';

function getAppBaseUrl(req: Request): string {
  const host = req.get('host');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

async function resolveContextEntities(params: {
  tenantId: string;
  strictTenant?: boolean;
  candidateDocId?: string;
  enrollmentId?: string;
  trainingCardId?: string;
  certificateId?: string;
  entityId?: string;
  baseUrl: string;
  idToken: string;
}) {
  const allowLegacyFallback = !params.strictTenant;
  let candidate: Candidate | null = null;
  let enrollment: Enrollment | null = null;
  let card: TrainingCard | null = null;
  let certificate: Certificate | null = null;
  let course: Course | null = null;
  let batch: Batch | null = null;

  if (params.certificateId) {
    certificate = await fsGetDoc<Certificate>('certificates', params.certificateId, params.idToken).catch(() => null);
    if (certificate && !assertRecordTenant(certificate, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: certificate belongs to another tenant');
    }
  }
  if (params.trainingCardId) {
    card = await fsGetDoc<TrainingCard>('trainingCards', params.trainingCardId, params.idToken).catch(() => null);
    if (card && !assertRecordTenant(card, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: training card belongs to another tenant');
    }
  }
  const enrId = params.enrollmentId || certificate?.enrollmentId || card?.enrollmentId;
  if (enrId) {
    enrollment = await fsGetDoc<Enrollment>('enrollments', enrId, params.idToken).catch(() => null);
    if (enrollment && !assertRecordTenant(enrollment, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: enrollment belongs to another tenant');
    }
  }
  const candDocId =
    params.candidateDocId ||
    certificate?.candidateDocId ||
    card?.candidateDocId ||
    enrollment?.candidateDocId;
  if (candDocId) {
    candidate = await fsGetDoc<Candidate>('candidates', candDocId, params.idToken).catch(() => null);
    if (candidate && !assertRecordTenant(candidate, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: candidate belongs to another tenant');
    }
  }

  const courseId = certificate?.courseId || card?.courseId || enrollment?.courseId;
  const batchId = certificate?.batchId || card?.batchId || enrollment?.batchId;
  if (courseId) {
    course = await fsGetDoc<Course>('courses', courseId, params.idToken).catch(() => null);
    if (course && !assertRecordTenant(course, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: course belongs to another tenant');
    }
  }
  if (batchId) {
    batch = await fsGetDoc<Batch>('batches', batchId, params.idToken).catch(() => null);
    if (batch && !assertRecordTenant(batch, params.tenantId, allowLegacyFallback)) {
      throw new Error('Forbidden: batch belongs to another tenant');
    }
  }

  const vars: Record<string, string | number | undefined> = {};
  if (candidate) {
    vars.candidateNameEn = candidate.fullNameEn;
    vars.candidateNameAr = candidate.fullNameAr;
    vars.candidateId = candidate.candidateId;
  }
  if (course) {
    vars.courseNameEn = course.titleEn;
    vars.courseNameAr = course.titleAr;
    vars.courseCode = course.courseCode;
  }
  if (batch) {
    vars.batchNumber = batch.batchNumber;
    vars.startDate = batch.startDate;
    vars.endDate = batch.endDate;
    vars.batchDate = `${batch.startDate} – ${batch.endDate}`;
    vars.trainingTime =
      batch.startTime && batch.endTime ? `${batch.startTime} – ${batch.endTime}` : '';
    vars.venue = batch.venue;
  }
  if (enrollment) {
    vars.enrollmentNumber = enrollment.enrollmentNumber;
  }
  if (card) {
    vars.cardNumber = card.cardSerialNumber;
    if (!vars.courseNameEn) vars.courseNameEn = card.snapshot.courseTitleEn;
    if (!vars.courseNameAr) vars.courseNameAr = card.snapshot.courseTitleAr;
    if (!vars.candidateNameEn) vars.candidateNameEn = card.snapshot.candidateNameEn;
    if (!vars.candidateNameAr) vars.candidateNameAr = card.snapshot.candidateNameAr;
    if (params.baseUrl) {
      vars.documentLink = `${params.baseUrl}/?card=${encodeURIComponent(card.cardSerialNumber)}`;
    }
  }
  if (certificate) {
    vars.certificateNumber = certificate.certificateNumber;
    vars.expiryDate = certificate.expiryDate || 'Lifetime';
    if (!vars.courseNameEn) vars.courseNameEn = certificate.snapshot.courseTitleEn;
    if (!vars.courseNameAr) vars.courseNameAr = certificate.snapshot.courseTitleAr;
    if (!vars.candidateNameEn) vars.candidateNameEn = certificate.snapshot.candidateNameEn;
    if (!vars.candidateNameAr) vars.candidateNameAr = certificate.snapshot.candidateNameAr;
    if (params.baseUrl) {
      vars.documentLink = `${params.baseUrl}/?cert=${encodeURIComponent(
        certificate.certificateNumber
      )}`;
    }
  }

  return {
    candidate,
    enrollment,
    card,
    certificate,
    course,
    batch,
    vars,
    resolvedAttachmentFileId: certificate?.pdfFileId || card?.pdfFileId,
    resolvedEntityId:
      params.entityId ||
      certificate?.certificateNumber ||
      card?.cardSerialNumber ||
      enrollment?.enrollmentNumber ||
      candidate?.candidateId,
    resolvedOrganizationId:
      certificate?.organizationId ||
      card?.organizationId ||
      enrollment?.organizationId ||
      candidate?.organizationId,
  };
}

export function createNotificationsRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // In-App Notifications Feed & Read Controls
  // ---------------------------------------------------------------------------
  router.get('/notifications', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId || DEFAULT_TENANT_ID;
      const all = await fsQueryTenantDocs<NotificationItem>('notifications', tenantId, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      });
      const role = req.user!.role;
      const filtered = all
        .filter(
          (n) =>
            isTenantAdminOrOwnerRole(role) ||
            n.targetUserId === req.user!.uid ||
            n.targetRole === role ||
            (req.user!.organizationId && n.organizationId === req.user!.organizationId)
        )
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.json({ notifications: filtered });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch('/notifications/read-all', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId || DEFAULT_TENANT_ID;
      const all = await fsQueryTenantDocs<NotificationItem>('notifications', tenantId, req.idToken!, {
        strictTenantFilter: req.strictTenantQuery,
      });
      const role = req.user!.role;
      const unread = all.filter(
        (n) =>
          !n.read &&
          (isTenantAdminOrOwnerRole(role) ||
            n.targetUserId === req.user!.uid ||
            n.targetRole === role ||
            (req.user!.organizationId && n.organizationId === req.user!.organizationId))
      );
      await Promise.all(
        unread.map((n) => fsUpdateDoc('notifications', n.id, { read: true }, req.idToken!, []).catch(() => {}))
      );
      res.json({ ok: true, count: unread.length });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.patch('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId || DEFAULT_TENANT_ID;
      const notifId = String(req.params.id || '').trim();
      const existing = await fsGetDoc<NotificationItem>('notifications', notifId, req.idToken!);
      if (!existing) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      if (!assertRecordTenant(existing, tenantId, !req.strictTenantQuery)) {
        res.status(403).json({ error: 'Forbidden: notification belongs to another tenant' });
        return;
      }
      const role = req.user!.role;
      const isAuthorized =
        isTenantAdminOrOwnerRole(role) ||
        existing.targetUserId === req.user!.uid ||
        existing.targetRole === role ||
        Boolean(req.user!.organizationId && existing.organizationId === req.user!.organizationId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Forbidden: cannot modify notification outside your scope' });
        return;
      }
      await fsUpdateDoc('notifications', notifId, { read: true }, req.idToken!, []);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Delivery Logs & Notification Center Combined View + Webhook Reconciliation
  // ---------------------------------------------------------------------------
  async function handleListDeliveryLogs(req: AuthedRequest) {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    if (isTenantAdminOrOwnerRole(req.user!.role) || req.user!.role === 'certificate_officer') {
      await reconcilePendingWebhookReceipts(req.idToken!).catch(() => 0);
    }

    const logs = await fsQueryTenantDocs<DeliveryLogItem>('deliveryLogs', tenantId, req.idToken!, {
      strictTenantFilter: req.strictTenantQuery,
    }).catch(() => []);
    const role = req.user!.role;
    const channelFilter = req.query.channel ? String(req.query.channel) : '';
    const statusFilter = req.query.status ? String(req.query.status) : '';
    const categoryFilter = req.query.category ? String(req.query.category) : '';
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    return logs
      .filter((l) => {
        if (role === 'corporate_client') {
          if (!req.user!.organizationId || l.organizationId !== req.user!.organizationId) return false;
        } else if (role === 'trainer') {
          if (l.sentBy !== req.user!.uid) return false;
        } else if (role === 'candidate') {
          if (!req.user!.candidateId || l.candidateDocId !== req.user!.candidateId) return false;
        } else if (!isTenantAdminOrOwnerRole(role) && role !== 'certificate_officer') {
          return false;
        }

        if (channelFilter && l.channel !== channelFilter) return false;
        if (statusFilter && l.deliveryStatus !== statusFilter) return false;
        if (categoryFilter && l.category !== categoryFilter && l.messageType !== categoryFilter) {
          return false;
        }
        if (search) {
          const hay = [
            l.recipient,
            l.recipientName,
            l.titleEn,
            l.titleAr,
            l.messagePreview,
            l.entityId,
            l.candidateId,
            l.enrollmentId,
            l.certificateId,
            l.trainingCardId,
            l.messageType,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  router.get('/notifications/logs', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const logs = await handleListDeliveryLogs(req);
      res.json({ logs });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get(
    '/communications/logs',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const logs = await handleListDeliveryLogs(req);
        res.json({ logs });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Dispatch Unified Notifications (Email, WhatsApp Cloud API, In-App, Manual)
  // ---------------------------------------------------------------------------
  router.post(
    '/notifications/dispatch',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const category = String(req.body.category || 'enrollment_confirmation') as NotificationCategory;
        if (!NOTIFICATION_CATEGORIES.includes(category)) {
          res.status(400).json({ error: `Unsupported notification category: ${category}` });
          return;
        }
        const channel = String(req.body.channel || 'email') as NotificationChannel;
        if (!['in_app', 'email', 'whatsapp', 'whatsapp_manual'].includes(channel)) {
          res.status(400).json({ error: `Unsupported notification channel: ${channel}` });
          return;
        }

        const language = (['en', 'ar', 'bilingual'].includes(String(req.body.language))
          ? String(req.body.language)
          : 'bilingual') as 'en' | 'ar' | 'bilingual';

        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const ctx = await resolveContextEntities({
          tenantId,
          strictTenant: req.strictTenantQuery,
          candidateDocId: req.body.candidateDocId ? String(req.body.candidateDocId) : undefined,
          enrollmentId: req.body.enrollmentId ? String(req.body.enrollmentId) : undefined,
          trainingCardId: req.body.trainingCardId ? String(req.body.trainingCardId) : undefined,
          certificateId: req.body.certificateId ? String(req.body.certificateId) : undefined,
          entityId: req.body.entityId ? String(req.body.entityId) : undefined,
          baseUrl: getAppBaseUrl(req),
          idToken: req.idToken!,
        });

        const recipient =
          String(req.body.recipient || '').trim() ||
          (channel === 'email'
            ? ctx.candidate?.email || ''
            : channel === 'whatsapp' || channel === 'whatsapp_manual'
              ? ctx.candidate?.mobile || ''
              : ctx.candidate?.fullNameEn || 'Staff / Trainee');

        if ((channel === 'email' || channel === 'whatsapp') && !recipient) {
          res.status(400).json({ error: `Recipient ${channel === 'email' ? 'email' : 'phone number'} is required.` });
          return;
        }

        const attachmentFileId =
          req.body.attachmentFileId
            ? String(req.body.attachmentFileId)
            : req.body.includeAttachment !== false
              ? ctx.resolvedAttachmentFileId
              : undefined;

        const result = await dispatchNotificationPipeline({
          tenantId,
          category,
          channel,
          recipient,
          recipientName: req.body.recipientName
            ? String(req.body.recipientName)
            : ctx.candidate?.fullNameEn,
          language,
          templateId: req.body.templateId ? String(req.body.templateId) : undefined,
          customSubjectEn: req.body.subjectEn ? String(req.body.subjectEn) : undefined,
          customSubjectAr: req.body.subjectAr ? String(req.body.subjectAr) : undefined,
          customBodyEn: req.body.bodyEn ? String(req.body.bodyEn) : undefined,
          customBodyAr: req.body.bodyAr ? String(req.body.bodyAr) : undefined,
          variables: {
            ...ctx.vars,
            ...(typeof req.body.variables === 'object' && req.body.variables ? req.body.variables : {}),
          },
          targetUserId: ctx.candidate?.userId,
          organizationId: ctx.resolvedOrganizationId,
          candidateDocId: ctx.candidate?.id,
          candidateId: ctx.candidate?.candidateId,
          enrollmentId: ctx.enrollment?.id,
          trainingCardId: ctx.card?.id,
          certificateId: ctx.certificate?.id,
          attachmentFileId,
          attachmentFilename: `${ctx.resolvedEntityId || category}.pdf`,
          entityId: ctx.resolvedEntityId,
          useApprovedMetaTemplate:
            req.body.useApprovedMetaTemplate !== undefined
              ? Boolean(req.body.useApprovedMetaTemplate)
              : undefined,
          actor: req.user!,
          idToken: req.idToken!,
        });

        await writeAuditLog(
          req.user!,
          'DISPATCH_NOTIFICATION',
          'deliveryLogs',
          result.logId,
          `Dispatched ${category} via ${channel} to ${recipient} -> ${result.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        res.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(msg.startsWith('Forbidden:') ? 403 : 400).json({ error: msg });
      }
    }
  );

  // Backwards-compatible Email & WhatsApp Endpoints (now powered by unified pipeline)
  router.post(
    '/communications/send-email',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const to = String(req.body.to || '').trim();
        const subject = String(req.body.subject || 'Training Center Notification');
        const message = String(req.body.message || '');
        const messageType = String(req.body.messageType || 'notification');
        const category: NotificationCategory = NOTIFICATION_CATEGORIES.includes(
          messageType as NotificationCategory
        )
          ? (messageType as NotificationCategory)
          : messageType === 'certificate'
            ? 'certificate_pdf_delivery'
            : messageType === 'training_card'
              ? 'training_card_delivery'
              : 'enrollment_confirmation';

        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const result = await dispatchNotificationPipeline({
          tenantId,
          category,
          channel: 'email',
          recipient: to,
          language: 'en',
          customSubjectEn: subject,
          customSubjectAr: subject,
          customBodyEn: message,
          customBodyAr: message,
          candidateDocId: req.body.candidateDocId ? String(req.body.candidateDocId) : undefined,
          candidateId: req.body.candidateId ? String(req.body.candidateId) : undefined,
          enrollmentId: req.body.enrollmentId ? String(req.body.enrollmentId) : undefined,
          trainingCardId: req.body.trainingCardId ? String(req.body.trainingCardId) : undefined,
          certificateId: req.body.certificateId ? String(req.body.certificateId) : undefined,
          organizationId: req.body.organizationId ? String(req.body.organizationId) : undefined,
          entityId: req.body.entityId ? String(req.body.entityId) : undefined,
          attachmentFileId: req.body.attachmentFileId ? String(req.body.attachmentFileId) : undefined,
          actor: req.user!,
          idToken: req.idToken!,
        });

        await writeAuditLog(
          req.user!,
          'SEND_EMAIL_NOTIFICATION',
          'deliveryLogs',
          result.logId,
          `Sent email (${category}) to ${to} -> ${result.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        res.json({
          ok: result.ok,
          deliveryStatus: result.deliveryStatus,
          messageId: result.providerMessageId,
          logId: result.logId,
          manualUrl: result.manualUrl,
          error: result.error,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/communications/send-whatsapp',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const toPhone = String(req.body.toPhone || '').trim();
        const message = String(req.body.message || '');
        const messageType = String(req.body.messageType || 'notification');
        const category: NotificationCategory = NOTIFICATION_CATEGORIES.includes(
          messageType as NotificationCategory
        )
          ? (messageType as NotificationCategory)
          : messageType === 'certificate'
            ? 'certificate_pdf_delivery'
            : messageType === 'training_card'
              ? 'training_card_delivery'
              : 'enrollment_confirmation';

        const result = await dispatchNotificationPipeline({
          tenantId,
          category,
          channel: 'whatsapp',
          recipient: toPhone,
          language: 'en',
          customBodyEn: message,
          customBodyAr: message,
          candidateDocId: req.body.candidateDocId ? String(req.body.candidateDocId) : undefined,
          candidateId: req.body.candidateId ? String(req.body.candidateId) : undefined,
          enrollmentId: req.body.enrollmentId ? String(req.body.enrollmentId) : undefined,
          trainingCardId: req.body.trainingCardId ? String(req.body.trainingCardId) : undefined,
          certificateId: req.body.certificateId ? String(req.body.certificateId) : undefined,
          organizationId: req.body.organizationId ? String(req.body.organizationId) : undefined,
          entityId: req.body.entityId ? String(req.body.entityId) : undefined,
          attachmentFileId: req.body.attachmentFileId ? String(req.body.attachmentFileId) : undefined,
          useApprovedMetaTemplate: Boolean(req.body.templateName),
          actor: req.user!,
          idToken: req.idToken!,
        });

        await writeAuditLog(
          req.user!,
          'SEND_WHATSAPP_NOTIFICATION',
          'deliveryLogs',
          result.logId,
          `Sent WhatsApp (${category}) to ${toPhone} -> ${result.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        res.json({
          ok: result.ok,
          mode: result.deliveryStatus === 'manual_initiated' ? 'manual_fallback' : 'cloud_api',
          deliveryStatus: result.deliveryStatus,
          messageId: result.providerMessageId,
          manualUrl: result.manualUrl,
          logId: result.logId,
          error: result.error,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Retry Failed Delivery & Manual Fallback Share Tracking
  // ---------------------------------------------------------------------------
  router.post(
    '/notifications/logs/:id/retry',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const logId = String(req.params.id);
        const log = await fsGetDoc<DeliveryLogItem>('deliveryLogs', logId, req.idToken!);
        if (!log) {
          res.status(404).json({ error: 'Delivery log not found' });
          return;
        }
        if (!assertRecordTenant(log, tenantId, !req.strictTenantQuery)) {
          res.status(403).json({ error: 'Forbidden: delivery log belongs to another tenant' });
          return;
        }
        if (!['failed', 'retry_required', 'pending', 'queued', 'manual_initiated'].includes(log.deliveryStatus)) {
          res.status(400).json({ error: `Cannot retry log with status '${log.deliveryStatus}'` });
          return;
        }

        const nextRetryCount = (log.retryCount || 0) + 1;
        const retryAt = new Date().toISOString();
        const subject = log.titleEn || log.titleAr || 'Training Center Notification';
        const body = log.messagePreview || subject;

        if (log.channel === 'email') {
          let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
          if (log.attachmentFileId) {
            const { readPrivateFileAsync } = await import('./fileVault.ts');
            const stored = await readPrivateFileAsync(log.attachmentFileId, req.idToken, tenantId).catch(() => null);
            if (stored?.buffer) {
              attachment = {
                filename: `${log.entityId || 'document'}.pdf`,
                content: stored.buffer,
                contentType: stored.meta?.mimeType || 'application/pdf',
              };
            }
          }
          const mailRes = await sendTransactionalEmail({
            to: log.recipient,
            subject,
            text: body,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;">${escapeHtml(body).replace(/\n/g, '<br/>')}</div>`,
            attachment,
            idToken: req.idToken!,
            tenantId,
          });

          await fsUpdateDoc(
            'deliveryLogs',
            logId,
            {
              deliveryStatus: mailRes.deliveryStatus,
              retryCount: nextRetryCount,
              lastRetryAt: retryAt,
              ...(mailRes.messageId ? { providerMessageId: mailRes.messageId } : {}),
              failureReason: mailRes.error ? mailRes.error.slice(0, 500) : '',
              ...(mailRes.providerStatusDetails
                ? { providerStatusDetails: mailRes.providerStatusDetails.slice(0, 480) }
                : {}),
            },
            req.idToken!,
            ['updatedAt']
          );

          await writeAuditLog(
            req.user!,
            'RETRY_NOTIFICATION_DELIVERY',
            'deliveryLogs',
            logId,
            `Retried email #${nextRetryCount} to ${log.recipient} -> ${mailRes.deliveryStatus}`,
            req.idToken!,
            tenantId
          );

          const updated = await fsGetDoc<DeliveryLogItem>('deliveryLogs', logId, req.idToken!);
          res.json({ ok: mailRes.ok, log: updated, error: mailRes.error });
          return;
        }

        const waRes = await sendWhatsappCloudMessage({
          toPhone: log.recipient,
          bodyText: body,
          idToken: req.idToken!,
          tenantId,
        });

        await fsUpdateDoc(
          'deliveryLogs',
          logId,
          {
            channel: waRes.mode === 'manual_fallback' ? 'whatsapp_manual' : 'whatsapp',
            deliveryStatus: waRes.deliveryStatus,
            retryCount: nextRetryCount,
            lastRetryAt: retryAt,
            ...(waRes.messageId ? { providerMessageId: waRes.messageId } : {}),
            ...(waRes.manualUrl ? { manualUrl: waRes.manualUrl.slice(0, 2000) } : {}),
            failureReason: waRes.error ? waRes.error.slice(0, 500) : '',
          },
          req.idToken!,
          ['updatedAt']
        );

        await writeAuditLog(
          req.user!,
          'RETRY_NOTIFICATION_DELIVERY',
          'deliveryLogs',
          logId,
          `Retried WhatsApp #${nextRetryCount} to ${log.recipient} -> ${waRes.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        const updated = await fsGetDoc<DeliveryLogItem>('deliveryLogs', logId, req.idToken!);
        res.json({ ok: waRes.ok, log: updated, manualUrl: waRes.manualUrl, error: waRes.error });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/notifications/logs/:id/manual-share',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'corporate_client']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const logId = String(req.params.id);
        const log = await fsGetDoc<DeliveryLogItem>('deliveryLogs', logId, req.idToken!);
        if (!log) {
          res.status(404).json({ error: 'Delivery log not found' });
          return;
        }
        if (!assertRecordTenant(log, tenantId, !req.strictTenantQuery)) {
          res.status(403).json({ error: 'Forbidden: delivery log belongs to another tenant' });
          return;
        }
        if (
          req.user!.role === 'corporate_client' &&
          log.organizationId !== req.user!.organizationId
        ) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        const shareChannel = String(req.body?.channel || 'whatsapp_manual');
        const notes = String(req.body?.notes || 'Authorized manual document download & share').slice(0, 480);

        if (isTenantAdminOrOwnerRole(req.user!.role) || req.user!.role === 'certificate_officer') {
          await fsUpdateDoc(
            'deliveryLogs',
            logId,
            {
              channel: shareChannel === 'email' ? 'email' : 'whatsapp_manual',
              deliveryStatus: 'manual_initiated',
              providerStatusDetails: notes,
              lastRetryAt: new Date().toISOString(),
            },
            req.idToken!,
            ['updatedAt']
          );
        }

        await writeAuditLog(
          req.user!,
          'MANUAL_DOCUMENT_SHARE',
          'deliveryLogs',
          logId,
          `Manual document share recorded (${shareChannel}) for ${log.entityId || log.recipient}: ${notes}`,
          req.idToken!,
          tenantId
        );

        const updated = await fsGetDoc<DeliveryLogItem>('deliveryLogs', logId, req.idToken!);
        res.json({ ok: true, log: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Authenticated webhook/receipt simulation or explicit provider delivery receipt check
  router.post(
    '/notifications/provider-receipt',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const providerMessageId = String(req.body.providerMessageId || '').trim();
        const providerStatus = String(req.body.status || '') as 'sent' | 'delivered' | 'read' | 'failed';
        if (!providerMessageId || !['sent', 'delivered', 'read', 'failed'].includes(providerStatus)) {
          res.status(400).json({ error: 'providerMessageId and valid status (sent|delivered|read|failed) are required' });
          return;
        }

        const result = await applyProviderStatusUpdate({
          providerMessageId,
          providerStatus,
          timestampIso: req.body.timestamp ? String(req.body.timestamp) : new Date().toISOString(),
          errorDetails: req.body.errorDetails ? String(req.body.errorDetails) : undefined,
          idToken: req.idToken!,
        });

        await writeAuditLog(
          req.user!,
          'PROVIDER_DELIVERY_RECEIPT',
          'deliveryLogs',
          result.updatedIds[0] || providerMessageId,
          `Applied provider status '${providerStatus}' to ${result.matched} log(s)`,
          req.idToken!,
          tenantId
        );

        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Certificate Expiry Reminder Scanner & Dispatcher
  // ---------------------------------------------------------------------------
  router.post(
    '/notifications/expiry-reminders/run',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const cfg = await getIntegrationConfig(req.idToken!, tenantId);
        const daysBefore = Math.max(
          1,
          Math.min(180, Number(req.body?.daysBefore || cfg.notificationPreferences?.expiryReminderDaysBefore || 30))
        );
        const today = new Date().toISOString().slice(0, 10);
        const horizon = new Date(Date.now() + daysBefore * 86400_000).toISOString().slice(0, 10);

        const [certificates, candidates, existingLogs] = await Promise.all([
          fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
          fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }),
          fsQueryTenantDocs<DeliveryLogItem>('deliveryLogs', tenantId, req.idToken!, {
            strictTenantFilter: req.strictTenantQuery,
          }).catch(() => []),
        ]);

        const candMap = new Map(candidates.map((c) => [c.id, c]));
        const recentCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
        const recentlyRemindedCerts = new Set(
          existingLogs
            .filter(
              (l) =>
                (l.category === 'certificate_expiry_reminder' ||
                  l.messageType === 'certificate_expiry_reminder') &&
                (l.createdAt || '') >= recentCutoff &&
                l.certificateId
            )
            .map((l) => l.certificateId!)
        );

        const expiring = certificates.filter(
          (c) =>
            c.status === 'valid' &&
            Boolean(c.expiryDate) &&
            c.expiryDate! >= today &&
            c.expiryDate! <= horizon &&
            !recentlyRemindedCerts.has(c.id)
        );

        let sentCount = 0;
        const baseUrl = getAppBaseUrl(req);
        for (const cert of expiring) {
          const cand = candMap.get(cert.candidateDocId);
          await dispatchAutomatedCategoryNotifications({
            tenantId,
            category: 'certificate_expiry_reminder',
            candidate: cand
              ? {
                  id: cand.id,
                  candidateId: cand.candidateId,
                  userId: cand.userId,
                  fullNameEn: cand.fullNameEn,
                  fullNameAr: cand.fullNameAr,
                  email: cand.email,
                  mobile: cand.mobile,
                  organizationId: cand.organizationId,
                }
              : {
                  id: cert.candidateDocId,
                  candidateId: cert.candidateId,
                  userId: cert.candidateUserId,
                  fullNameEn: cert.snapshot.candidateNameEn,
                  fullNameAr: cert.snapshot.candidateNameAr,
                  organizationId: cert.organizationId,
                },
            certificateId: cert.id,
            enrollmentId: cert.enrollmentId,
            attachmentFileId: cert.pdfFileId,
            attachmentFilename: `${cert.certificateNumber}.pdf`,
            entityId: cert.certificateNumber,
            targetRole: 'certificate_officer',
            variables: {
              certificateNumber: cert.certificateNumber,
              courseNameEn: cert.snapshot.courseTitleEn,
              courseNameAr: cert.snapshot.courseTitleAr,
              expiryDate: cert.expiryDate,
              documentLink: baseUrl
                ? `${baseUrl}/?cert=${encodeURIComponent(cert.certificateNumber)}`
                : cert.certificateNumber,
            },
            actor: req.user!,
            idToken: req.idToken!,
          });
          sentCount += 1;
        }

        await writeAuditLog(
          req.user!,
          'RUN_CERTIFICATE_EXPIRY_REMINDERS',
          'certificates',
          'expiry_scan',
          `Triggered ${sentCount} expiry reminder(s) within ${daysBefore} days`,
          req.idToken!,
          tenantId
        );

        res.json({ ok: true, checked: certificates.length, reminded: sentCount, horizon });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Message Templates CRUD + Bilingual Live Preview
  // ---------------------------------------------------------------------------
  router.get(
    '/templates/messages',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'trainer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const templates = await ensureDefaultMessageTemplates(
          req.idToken!,
          req.user!.uid,
          tenantId,
          req.strictTenantQuery
        );
        res.json({
          templates,
          categories: NOTIFICATION_CATEGORIES,
          placeholders: DYNAMIC_PLACEHOLDERS,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/templates/messages',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const category = String(req.body.category || '') as NotificationCategory;
        if (!NOTIFICATION_CATEGORIES.includes(category)) {
          res.status(400).json({ error: `Invalid template category: ${category}` });
          return;
        }
        const nameEn = String(req.body.nameEn || '').trim().slice(0, 200);
        const nameAr = String(req.body.nameAr || nameEn).trim().slice(0, 200);
        const subjectEn = String(req.body.subjectEn || '').trim().slice(0, 240);
        const subjectAr = String(req.body.subjectAr || subjectEn).trim().slice(0, 240);
        const bodyEn = String(req.body.bodyEn || '').trim().slice(0, 3000);
        const bodyAr = String(req.body.bodyAr || bodyEn).trim().slice(0, 3000);
        const code = String(req.body.code || `TPL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`).trim().slice(0, 80);

        if (nameEn.length < 2 || !bodyEn) {
          res.status(400).json({ error: 'Template name and body are required' });
          return;
        }

        const docId = tenantScopedDocId(tenantId, `tpl_${crypto.randomBytes(8).toString('hex')}`);
        const payload: Record<string, unknown> = {
          tenantId,
          code,
          category,
          nameEn,
          nameAr,
          subjectEn,
          subjectAr,
          bodyEn,
          bodyAr,
          whatsappTemplateName: String(req.body.whatsappTemplateName || '').trim().slice(0, 160),
          whatsappLanguageEn: String(req.body.whatsappLanguageEn || 'en_US').trim().slice(0, 24),
          whatsappLanguageAr: String(req.body.whatsappLanguageAr || 'ar').trim().slice(0, 24),
          useApprovedMetaTemplate: Boolean(req.body.useApprovedMetaTemplate),
          placeholders: Array.isArray(req.body.placeholders)
            ? req.body.placeholders.map(String).slice(0, 30)
            : [],
          isActive: req.body.isActive !== false,
          updatedBy: req.user!.uid,
        };

        await fsCreateDoc('messageTemplates', docId, payload, req.idToken!, ['createdAt', 'updatedAt']);
        await writeAuditLog(
          req.user!,
          'CREATE_MESSAGE_TEMPLATE',
          'messageTemplates',
          docId,
          `Created bilingual message template ${code} (${category})`,
          req.idToken!,
          tenantId
        );

        const created = await fsGetDoc<MessageTemplate>('messageTemplates', docId, req.idToken!);
        res.json({ template: created });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.put(
    '/templates/messages/:id',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const docId = String(req.params.id);
        const existing = await fsGetDoc<MessageTemplate>('messageTemplates', docId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Message template not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !req.strictTenantQuery)) {
          res.status(403).json({ error: 'Forbidden: message template belongs to another tenant' });
          return;
        }

        const category = String(req.body.category || existing.category) as NotificationCategory;
        if (!NOTIFICATION_CATEGORIES.includes(category)) {
          res.status(400).json({ error: `Invalid template category: ${category}` });
          return;
        }

        const updates: Record<string, unknown> = {
          code: String(req.body.code ?? existing.code).trim().slice(0, 80),
          category,
          nameEn: String(req.body.nameEn ?? existing.nameEn).trim().slice(0, 200),
          nameAr: String(req.body.nameAr ?? existing.nameAr).trim().slice(0, 200),
          subjectEn: String(req.body.subjectEn ?? existing.subjectEn).trim().slice(0, 240),
          subjectAr: String(req.body.subjectAr ?? existing.subjectAr).trim().slice(0, 240),
          bodyEn: String(req.body.bodyEn ?? existing.bodyEn).trim().slice(0, 3000),
          bodyAr: String(req.body.bodyAr ?? existing.bodyAr).trim().slice(0, 3000),
          whatsappTemplateName: String(
            req.body.whatsappTemplateName ?? existing.whatsappTemplateName ?? ''
          )
            .trim()
            .slice(0, 160),
          whatsappLanguageEn: String(
            req.body.whatsappLanguageEn ?? existing.whatsappLanguageEn ?? 'en_US'
          )
            .trim()
            .slice(0, 24),
          whatsappLanguageAr: String(
            req.body.whatsappLanguageAr ?? existing.whatsappLanguageAr ?? 'ar'
          )
            .trim()
            .slice(0, 24),
          useApprovedMetaTemplate:
            req.body.useApprovedMetaTemplate !== undefined
              ? Boolean(req.body.useApprovedMetaTemplate)
              : Boolean(existing.useApprovedMetaTemplate),
          isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive,
          updatedBy: req.user!.uid,
        };

        await fsUpdateDoc('messageTemplates', docId, updates, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'UPDATE_MESSAGE_TEMPLATE',
          'messageTemplates',
          docId,
          `Updated message template ${updates.code} (${category})`,
          req.idToken!,
          tenantId
        );

        const updated = await fsGetDoc<MessageTemplate>('messageTemplates', docId, req.idToken!);
        res.json({ template: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.delete(
    '/templates/messages/:id',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const docId = String(req.params.id);
        const existing = await fsGetDoc<MessageTemplate>('messageTemplates', docId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Message template not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !req.strictTenantQuery)) {
          res.status(403).json({ error: 'Forbidden: message template belongs to another tenant' });
          return;
        }
        await fsDeleteDoc('messageTemplates', docId, req.idToken!);
        await writeAuditLog(
          req.user!,
          'DELETE_MESSAGE_TEMPLATE',
          'messageTemplates',
          docId,
          `Deleted message template ${docId}`,
          req.idToken!,
          tenantId
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/templates/messages/preview',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const company = await getCompanyBranding(req.idToken, tenantId);
        const { centerName, centerContact } = buildCenterContactString(company);
        const baseUrl = getAppBaseUrl(req);
        const ctx = await resolveContextEntities({
          tenantId,
          strictTenant: req.strictTenantQuery,
          candidateDocId: req.body.candidateDocId ? String(req.body.candidateDocId) : undefined,
          enrollmentId: req.body.enrollmentId ? String(req.body.enrollmentId) : undefined,
          trainingCardId: req.body.trainingCardId ? String(req.body.trainingCardId) : undefined,
          certificateId: req.body.certificateId ? String(req.body.certificateId) : undefined,
          baseUrl,
          idToken: req.idToken!,
        });

        const sampleFallback = {
          candidateNameEn: 'Tariq Al-Mansoor',
          candidateNameAr: 'طارق المنصور',
          candidateId: 'CND-2026-0001',
          courseNameEn: 'Industrial Safety & Scaffolding Level 2',
          courseNameAr: 'السلامة الصناعية والسقالات – المستوى الثاني',
          courseCode: 'SAF-202',
          batchNumber: 'BATCH-2026-004',
          startDate: '2026-06-01',
          endDate: '2026-06-05',
          batchDate: '2026-06-01 – 2026-06-05',
          trainingTime: '08:30 – 15:30',
          venue: 'Riyadh Safety Hall A',
          enrollmentNumber: 'ENR-2026-0012',
          cardNumber: 'CARD-2026-0012',
          certificateNumber: 'CERT-2026-000012',
          expiryDate: '2028-06-05',
          attendancePct: '96',
          examDate: '2026-06-05',
          examScore: '92 / 100',
          examResult: 'PASS',
          trainingCenterName: centerName,
          trainingCenterContact: centerContact,
          documentLink: baseUrl ? `${baseUrl}/?cert=CERT-2026-000012` : 'https://verify.example/CERT-2026-000012',
        };

        const vars = {
          ...sampleFallback,
          ...ctx.vars,
          ...(typeof req.body.variables === 'object' && req.body.variables ? req.body.variables : {}),
          trainingCenterName: centerName,
          trainingCenterContact: centerContact,
        };

        const tpl = req.body.template
          ? (req.body.template as MessageTemplate)
          : DEFAULT_MESSAGE_TEMPLATES[0];

        const rendered = renderBilingualTemplate({ template: tpl, variables: vars });
        res.json({
          rendered,
          recipientEmail: ctx.candidate?.email || '',
          recipientMobile: ctx.candidate?.mobile || '',
          attachmentFileId: ctx.resolvedAttachmentFileId || '',
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Integration Connection Testing (Super Admin Only)
  // ---------------------------------------------------------------------------
  router.post(
    '/integrations/test-email',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const to = String(req.body?.to || req.user!.email || '').trim();
        const company = await getCompanyBranding(req.idToken, tenantId);
        const { centerName } = buildCenterContactString(company);
        const result = await sendTransactionalEmail({
          to,
          subject: `${centerName} — SMTP Integration Verification`,
          text: `This is an automated test message confirming SMTP configuration for ${centerName}.`,
          html: `<p>This is an automated test message confirming SMTP configuration for <strong>${escapeHtml(centerName)}</strong>.</p>`,
          idToken: req.idToken!,
          tenantId,
        });

        const logId = `deliv_${crypto.randomBytes(8).toString('hex')}`;
        await fsCreateDoc(
          'deliveryLogs',
          logId,
          {
            tenantId,
            channel: 'email',
            recipient: to,
            messageType: 'integration_test',
            titleEn: `${centerName} — SMTP Integration Verification`,
            deliveryStatus: result.deliveryStatus,
            ...(result.messageId ? { providerMessageId: result.messageId } : {}),
            ...(result.error ? { failureReason: result.error.slice(0, 500) } : {}),
            ...(result.providerStatusDetails
              ? { providerStatusDetails: result.providerStatusDetails.slice(0, 480) }
              : {}),
            sentBy: req.user!.uid,
          },
          req.idToken!,
          ['createdAt']
        ).catch(() => {});

        await writeAuditLog(
          req.user!,
          'TEST_EMAIL_INTEGRATION',
          'systemSettings',
          'integrations',
          `Tested SMTP email to ${to} -> ${result.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        res.json({ ...result, logId });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/integrations/test-whatsapp',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const toPhone = String(req.body?.toPhone || '').trim();
        if (!toPhone) {
          res.status(400).json({ error: 'Test recipient mobile number is required' });
          return;
        }
        const company = await getCompanyBranding(req.idToken, tenantId);
        const { centerName } = buildCenterContactString(company);
        const result = await sendWhatsappCloudMessage({
          toPhone,
          bodyText: `${centerName}: Official WhatsApp Business Cloud API test message.`,
          useApprovedMetaTemplate: false,
          idToken: req.idToken!,
          tenantId,
        });

        const logId = `deliv_${crypto.randomBytes(8).toString('hex')}`;
        await fsCreateDoc(
          'deliveryLogs',
          logId,
          {
            tenantId,
            channel: result.mode === 'manual_fallback' ? 'whatsapp_manual' : 'whatsapp',
            recipient: toPhone,
            messageType: 'integration_test',
            titleEn: `${centerName} — WhatsApp Cloud API Test`,
            deliveryStatus: result.deliveryStatus,
            ...(result.messageId ? { providerMessageId: result.messageId } : {}),
            ...(result.manualUrl ? { manualUrl: result.manualUrl.slice(0, 2000) } : {}),
            ...(result.error ? { failureReason: result.error.slice(0, 500) } : {}),
            sentBy: req.user!.uid,
          },
          req.idToken!,
          ['createdAt']
        ).catch(() => {});

        await writeAuditLog(
          req.user!,
          'TEST_WHATSAPP_INTEGRATION',
          'systemSettings',
          'integrations',
          `Tested WhatsApp Cloud API to ${toPhone} -> ${result.deliveryStatus}`,
          req.idToken!,
          tenantId
        );

        res.json({ ...result, logId });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Meta WhatsApp Business Cloud API Webhook (Challenge & Delivery Receipts)
  // ---------------------------------------------------------------------------
  router.get('/webhooks/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const envVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';

    if (mode === 'subscribe' && envVerifyToken && token === envVerifyToken) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Verification failed');
  });

  router.post('/webhooks/whatsapp', (req: Request & { rawBody?: Buffer }, res) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';
    if (!appSecret && process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Webhook signature verification secret is not configured' });
      return;
    }
    if (appSecret) {
      const sig = req.header('x-hub-signature-256');
      const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      if (!verifyMetaSignatureHeader(raw, sig, appSecret)) {
        res.status(401).json({ error: 'Invalid Meta webhook signature' });
        return;
      }
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const receipts: Array<{
      providerMessageId: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      timestamp: string;
      errorDetails?: string;
    }> = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const statuses = Array.isArray(ch?.value?.statuses) ? ch.value.statuses : [];
        for (const st of statuses) {
          const msgId = String(st?.id || '');
          const status = String(st?.status || '');
          if (!msgId || !['sent', 'delivered', 'read', 'failed'].includes(status)) continue;
          const tsNum = Number(st?.timestamp || 0);
          const timestamp =
            tsNum > 0 ? new Date(tsNum * 1000).toISOString() : new Date().toISOString();
          const errList = Array.isArray(st?.errors) ? st.errors : [];
          const errorDetails = errList
            .map((e: { title?: string; message?: string; code?: number }) =>
              [e.code ? `#${e.code}` : '', e.title || e.message || ''].filter(Boolean).join(' ')
            )
            .filter(Boolean)
            .join('; ');
          receipts.push({
            providerMessageId: msgId,
            status: status as 'sent' | 'delivered' | 'read' | 'failed',
            timestamp,
            errorDetails: errorDetails || undefined,
          });
        }
      }
    }

    const queued = enqueueProviderReceipts(receipts);
    res.status(200).json({ ok: true, queued });
  });

  return router;
}
