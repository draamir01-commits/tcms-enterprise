import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { decryptSensitive } from './crypto.ts';
import { readPrivateFileAsync } from './fileVault.ts';
import { fsCreateDoc, fsGetDoc, fsQueryDocs, fsQueryTenantDocs, fsUpdateDoc } from './firestoreRest.ts';
import { DEFAULT_TENANT_ID } from './tenantService.ts';
import type {
  CompanySettings,
  DeliveryLogItem,
  DeliveryStatus,
  MessageTemplate,
  NotificationCategory,
  NotificationChannel,
  NotificationPreferences,
  UserProfile,
} from '../src/types/tcms.ts';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'candidate_registration',
  'enrollment_confirmation',
  'training_schedule',
  'training_reminder',
  'training_card_delivery',
  'attendance_notification',
  'examination_schedule',
  'examination_result',
  'certificate_issuance',
  'certificate_pdf_delivery',
  'certificate_expiry_reminder',
];

export const DYNAMIC_PLACEHOLDERS = [
  '{{candidateName}}',
  '{{candidateNameEn}}',
  '{{candidateNameAr}}',
  '{{candidateId}}',
  '{{courseName}}',
  '{{courseNameEn}}',
  '{{courseNameAr}}',
  '{{courseCode}}',
  '{{batchNumber}}',
  '{{batchDate}}',
  '{{startDate}}',
  '{{endDate}}',
  '{{trainingTime}}',
  '{{venue}}',
  '{{enrollmentNumber}}',
  '{{cardNumber}}',
  '{{certificateNumber}}',
  '{{expiryDate}}',
  '{{attendancePct}}',
  '{{examDate}}',
  '{{examScore}}',
  '{{examResult}}',
  '{{trainingCenterName}}',
  '{{trainingCenterContact}}',
  '{{documentLink}}',
];

export function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildDefaultNotificationPreferences(): NotificationPreferences {
  const autoCategories = {} as NotificationPreferences['autoCategories'];
  for (const cat of NOTIFICATION_CATEGORIES) {
    autoCategories[cat] = {
      inApp: true,
      email: true,
      whatsapp: cat !== 'attendance_notification',
    };
  }
  return {
    enableAutoEmail: false,
    enableAutoWhatsapp: false,
    enableInApp: true,
    defaultRetryLimit: 3,
    expiryReminderDaysBefore: 30,
    autoCategories,
  };
}

export function normalizeNotificationPreferences(
  raw?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  const defaults = buildDefaultNotificationPreferences();
  const mergedCategories = { ...defaults.autoCategories };
  if (raw?.autoCategories && typeof raw.autoCategories === 'object') {
    for (const cat of NOTIFICATION_CATEGORIES) {
      const entry = raw.autoCategories[cat];
      if (entry && typeof entry === 'object') {
        mergedCategories[cat] = {
          inApp: entry.inApp !== undefined ? Boolean(entry.inApp) : defaults.autoCategories[cat].inApp,
          email: entry.email !== undefined ? Boolean(entry.email) : defaults.autoCategories[cat].email,
          whatsapp:
            entry.whatsapp !== undefined ? Boolean(entry.whatsapp) : defaults.autoCategories[cat].whatsapp,
        };
      }
    }
  }
  return {
    enableAutoEmail: Boolean(raw?.enableAutoEmail ?? defaults.enableAutoEmail),
    enableAutoWhatsapp: Boolean(raw?.enableAutoWhatsapp ?? defaults.enableAutoWhatsapp),
    enableInApp: raw?.enableInApp !== undefined ? Boolean(raw.enableInApp) : defaults.enableInApp,
    defaultRetryLimit: Math.min(10, Math.max(1, Number(raw?.defaultRetryLimit || defaults.defaultRetryLimit))),
    expiryReminderDaysBefore: Math.min(
      180,
      Math.max(1, Number(raw?.expiryReminderDaysBefore || defaults.expiryReminderDaysBefore))
    ),
    autoCategories: mergedCategories,
  };
}

export interface IntegrationConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassEncrypted?: string;
  smtpFrom?: string;
  smtpSenderName?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAccessTokenEncrypted?: string;
  whatsappWebhookVerifyTokenEncrypted?: string;
  whatsappAppSecretEncrypted?: string;
  whatsappApiVersion?: string;
  notificationPreferences?: NotificationPreferences;
}

export const DEFAULT_MESSAGE_TEMPLATES: Array<
  Omit<MessageTemplate, 'updatedBy' | 'createdAt' | 'updatedAt'>
> = [
  {
    id: 'tpl_candidate_registration',
    code: 'TPL-REG-01',
    category: 'candidate_registration',
    nameEn: 'Candidate Registration Confirmation',
    nameAr: 'تأكيد تسجيل متدرب جديد',
    subjectEn: 'Registration Confirmed – {{candidateId}} | {{trainingCenterName}}',
    subjectAr: 'تأكيد التسجيل – {{candidateId}} | {{trainingCenterName}}',
    bodyEn:
      'Dear {{candidateNameEn}}, your trainee profile ({{candidateId}}) has been registered at {{trainingCenterName}}. For support, contact {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، تم تسجيل ملفكم التدريبي بنجاح برقم ({{candidateId}}) لدى {{trainingCenterName}}. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_candidate_registration',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'candidateId', 'trainingCenterName', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_enrollment_confirmation',
    code: 'TPL-ENR-02',
    category: 'enrollment_confirmation',
    nameEn: 'Enrollment Confirmation',
    nameAr: 'تأكيد التسجيل في الدورة',
    subjectEn: 'Enrollment Confirmed: {{courseNameEn}} ({{enrollmentNumber}})',
    subjectAr: 'تم تأكيد التسجيل: {{courseNameAr}} ({{enrollmentNumber}})',
    bodyEn:
      'Dear {{candidateNameEn}}, your enrollment {{enrollmentNumber}} for {{courseNameEn}} (Batch {{batchNumber}}, {{batchDate}}) at {{venue}} is confirmed. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، تم تأكيد تسجيلكم رقم {{enrollmentNumber}} في دورة {{courseNameAr}} (الدفعة {{batchNumber}}، التاريخ: {{batchDate}}) في {{venue}}. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_enrollment_confirmation',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'enrollmentNumber', 'courseNameEn', 'courseNameAr', 'batchNumber', 'batchDate', 'venue', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_training_schedule',
    code: 'TPL-SCH-03',
    category: 'training_schedule',
    nameEn: 'Training Schedule Notification',
    nameAr: 'إشعار جدول التدريب',
    subjectEn: 'Training Schedule: {{courseNameEn}} – Batch {{batchNumber}}',
    subjectAr: 'جدول التدريب: {{courseNameAr}} – الدفعة {{batchNumber}}',
    bodyEn:
      'Dear {{candidateNameEn}}, your training schedule for {{courseNameEn}} (Batch {{batchNumber}}) runs {{batchDate}} ({{trainingTime}}) at {{venue}}. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، موعد دورة {{courseNameAr}} (الدفعة {{batchNumber}}) من {{batchDate}} ({{trainingTime}}) في {{venue}}. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_training_schedule',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'courseNameEn', 'courseNameAr', 'batchNumber', 'batchDate', 'trainingTime', 'venue', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_training_reminder',
    code: 'TPL-REM-04',
    category: 'training_reminder',
    nameEn: 'Upcoming Training Reminder',
    nameAr: 'تذكير بموعد الدورة التدريبية',
    subjectEn: 'Reminder: {{courseNameEn}} starts {{startDate}}',
    subjectAr: 'تذكير: تبدأ دورة {{courseNameAr}} بتاريخ {{startDate}}',
    bodyEn:
      'Reminder for {{candidateNameEn}}: {{courseNameEn}} (Batch {{batchNumber}}) starts on {{startDate}} ({{trainingTime}}) at {{venue}}. Please arrive 15 minutes early. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'تذكير للمتدرب {{candidateNameAr}}: تبدأ دورة {{courseNameAr}} (الدفعة {{batchNumber}}) بتاريخ {{startDate}} ({{trainingTime}}) في {{venue}}. يرجى الحضور قبل الموعد بـ 15 دقيقة. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_training_reminder',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'courseNameEn', 'courseNameAr', 'batchNumber', 'startDate', 'trainingTime', 'venue', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_training_card_delivery',
    code: 'TPL-CRD-05',
    category: 'training_card_delivery',
    nameEn: 'Training Card Delivery',
    nameAr: 'تسليم بطاقة التدريب',
    subjectEn: 'Training Card Issued: {{cardNumber}} – {{courseNameEn}}',
    subjectAr: 'إصدار بطاقة التدريب: {{cardNumber}} – {{courseNameAr}}',
    bodyEn:
      'Dear {{candidateNameEn}}, your Training Card {{cardNumber}} for {{courseNameEn}} (Batch {{batchNumber}}, {{batchDate}}) is ready. Access link: {{documentLink}} | Support: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، بطاقة التدريب الخاصة بكم رقم {{cardNumber}} لدورة {{courseNameAr}} (الدفعة {{batchNumber}}، {{batchDate}}) جاهزة. رابط المستند: {{documentLink}} | للدعم: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_training_card_delivery',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'cardNumber', 'courseNameEn', 'courseNameAr', 'batchNumber', 'batchDate', 'documentLink', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_attendance_notification',
    code: 'TPL-ATT-06',
    category: 'attendance_notification',
    nameEn: 'Attendance Notice & Threshold Warning',
    nameAr: 'إشعار الحضور والالتزام بنسبة الحضور',
    subjectEn: 'Attendance Update: {{courseNameEn}} ({{attendancePct}}%)',
    subjectAr: 'تحديث الحضور: {{courseNameAr}} ({{attendancePct}}%)',
    bodyEn:
      'Dear {{candidateNameEn}}, your recorded attendance for {{courseNameEn}} (Batch {{batchNumber}}) is currently {{attendancePct}}%. Please maintain the required attendance threshold. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، نسبة حضوركم المسجلة في دورة {{courseNameAr}} (الدفعة {{batchNumber}}) هي {{attendancePct}}% حالياً. يرجى الالتزام بالحد الأدنى المطلوب للحضور. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_attendance_notice',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'courseNameEn', 'courseNameAr', 'batchNumber', 'attendancePct', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_examination_schedule',
    code: 'TPL-EXS-07',
    category: 'examination_schedule',
    nameEn: 'Examination Schedule Notification',
    nameAr: 'إشعار موعد الاختبار والتقييم',
    subjectEn: 'Examination Scheduled: {{courseNameEn}} on {{examDate}}',
    subjectAr: 'موعد الاختبار: {{courseNameAr}} بتاريخ {{examDate}}',
    bodyEn:
      'Dear {{candidateNameEn}}, your assessment for {{courseNameEn}} (Batch {{batchNumber}}) is scheduled on {{examDate}} at {{venue}}. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، تم تحديد موعد الاختبار لدورة {{courseNameAr}} (الدفعة {{batchNumber}}) بتاريخ {{examDate}} في {{venue}}. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_examination_schedule',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'courseNameEn', 'courseNameAr', 'batchNumber', 'examDate', 'venue', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_examination_result',
    code: 'TPL-EXR-08',
    category: 'examination_result',
    nameEn: 'Authorized Examination Result Notice',
    nameAr: 'إشعار نتيجة التقييم المعتمدة',
    subjectEn: 'Assessment Result: {{courseNameEn}} – {{examResult}}',
    subjectAr: 'نتيجة التقييم: {{courseNameAr}} – {{examResult}}',
    bodyEn:
      'Dear {{candidateNameEn}}, your authorized assessment result for {{courseNameEn}} (Batch {{batchNumber}}) is {{examResult}} ({{examScore}}). Inquiries: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، تم اعتماد نتيجة تقييمكم لدورة {{courseNameAr}} (الدفعة {{batchNumber}}): {{examResult}} ({{examScore}}). للاستفسار: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_examination_result',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'courseNameEn', 'courseNameAr', 'batchNumber', 'examResult', 'examScore', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_certificate_issuance',
    code: 'TPL-CRI-09',
    category: 'certificate_issuance',
    nameEn: 'Certificate Issuance Notification',
    nameAr: 'إشعار إصدار الشهادة التدريبية',
    subjectEn: 'Certificate Issued: {{certificateNumber}} – {{courseNameEn}}',
    subjectAr: 'تم إصدار الشهادة: {{certificateNumber}} – {{courseNameAr}}',
    bodyEn:
      'Congratulations {{candidateNameEn}}! Certificate {{certificateNumber}} for {{courseNameEn}} has been issued by {{trainingCenterName}}. Verify online: {{documentLink}} | Support: {{trainingCenterContact}}.',
    bodyAr:
      'تهانينا {{candidateNameAr}}! تم إصدار الشهادة رقم {{certificateNumber}} لدورة {{courseNameAr}} من {{trainingCenterName}}. رابط التحقق: {{documentLink}} | للدعم: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_certificate_issuance',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'certificateNumber', 'courseNameEn', 'courseNameAr', 'trainingCenterName', 'documentLink', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_certificate_pdf_delivery',
    code: 'TPL-CRP-10',
    category: 'certificate_pdf_delivery',
    nameEn: 'Certificate PDF Delivery',
    nameAr: 'تسليم ملف الشهادة PDF',
    subjectEn: 'Your Training Certificate PDF ({{certificateNumber}}) – {{courseNameEn}}',
    subjectAr: 'نسخة PDF من الشهادة التدريبية ({{certificateNumber}}) – {{courseNameAr}}',
    bodyEn:
      'Dear {{candidateNameEn}}, please find your official certificate {{certificateNumber}} for {{courseNameEn}} attached or accessible via verification link: {{documentLink}}. Contact: {{trainingCenterContact}}.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، مرفق لكم الشهادة الرسمية رقم {{certificateNumber}} لدورة {{courseNameAr}}، ويمكن التحقق منها عبر الرابط: {{documentLink}}. للتواصل: {{trainingCenterContact}}.',
    whatsappTemplateName: 'tcms_certificate_pdf_delivery',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'certificateNumber', 'courseNameEn', 'courseNameAr', 'documentLink', 'trainingCenterContact'],
    isActive: true,
  },
  {
    id: 'tpl_certificate_expiry_reminder',
    code: 'TPL-EXP-11',
    category: 'certificate_expiry_reminder',
    nameEn: 'Certificate Expiry Reminder',
    nameAr: 'تذكير بانتهاء صلاحية الشهادة',
    subjectEn: 'Certificate Renewal Reminder: {{certificateNumber}} expires {{expiryDate}}',
    subjectAr: 'تذكير بتجديد الشهادة: {{certificateNumber}} تنتهي في {{expiryDate}}',
    bodyEn:
      'Dear {{candidateNameEn}}, certificate {{certificateNumber}} for {{courseNameEn}} is due for renewal on {{expiryDate}}. Please contact {{trainingCenterName}} at {{trainingCenterContact}} to schedule refresher training.',
    bodyAr:
      'عزيزي {{candidateNameAr}}، صلاحية الشهادة رقم {{certificateNumber}} لدورة {{courseNameAr}} تنتهي بتاريخ {{expiryDate}}. يرجى التواصل مع {{trainingCenterName}} على {{trainingCenterContact}} لحجز دورة التجديد.',
    whatsappTemplateName: 'tcms_certificate_expiry_reminder',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    placeholders: ['candidateNameEn', 'candidateNameAr', 'certificateNumber', 'courseNameEn', 'courseNameAr', 'expiryDate', 'trainingCenterName', 'trainingCenterContact'],
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Privacy & Placeholder Rendering Helpers
// ---------------------------------------------------------------------------
const FORBIDDEN_PII_KEY_PATTERN = /iqama|passport|dateOfBirth|\bdob\b|nationalId|ssn/i;

export function sanitizeTemplateVariables(
  raw: Record<string, string | number | undefined | null>
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (FORBIDDEN_PII_KEY_PATTERN.test(k)) continue;
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    if (!str) continue;
    safe[k] = str;
  }
  return safe;
}

export function renderTemplateString(
  templateText: string,
  variables: Record<string, string | number | undefined | null>
): string {
  const safe = sanitizeTemplateVariables(variables);
  return String(templateText || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (FORBIDDEN_PII_KEY_PATTERN.test(key)) return '[REDACTED]';
    if (safe[key] !== undefined) return safe[key];
    if (key === 'candidateName') return safe.candidateNameEn || safe.candidateNameAr || '';
    if (key === 'courseName') return safe.courseNameEn || safe.courseNameAr || '';
    return '';
  });
}

export function renderBilingualTemplate(params: {
  template: Pick<MessageTemplate, 'subjectEn' | 'subjectAr' | 'bodyEn' | 'bodyAr'>;
  variables: Record<string, string | number | undefined | null>;
}): {
  subjectEn: string;
  subjectAr: string;
  bodyEn: string;
  bodyAr: string;
} {
  const safe = sanitizeTemplateVariables(params.variables);
  return {
    subjectEn: renderTemplateString(params.template.subjectEn, safe),
    subjectAr: renderTemplateString(params.template.subjectAr, safe),
    bodyEn: renderTemplateString(params.template.bodyEn, safe),
    bodyAr: renderTemplateString(params.template.bodyAr, safe),
  };
}

export function buildCenterContactString(company?: Partial<CompanySettings> | null): {
  centerName: string;
  centerContact: string;
} {
  const centerName = company?.nameEn || company?.nameAr || 'Training Center';
  const contactParts = [company?.phone, company?.email, company?.website]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return {
    centerName,
    centerContact: contactParts.join(' | ') || 'Training Center Administration',
  };
}

// ---------------------------------------------------------------------------
// Integration Config & Template Resolution
// ---------------------------------------------------------------------------
export async function getIntegrationConfig(
  idToken?: string,
  tenantId = DEFAULT_TENANT_ID
): Promise<IntegrationConfig> {
  let stored: IntegrationConfig = {};
  if (idToken) {
    try {
      const scopedDoc = await fsGetDoc<{ config: IntegrationConfig }>(
        'systemSettings',
        `${tenantId}_integrations`,
        idToken
      );
      if (scopedDoc?.config) {
        stored = scopedDoc.config;
      } else if (tenantId === DEFAULT_TENANT_ID) {
        const legacyDoc = await fsGetDoc<{ config: IntegrationConfig }>(
          'systemSettings',
          'integrations',
          idToken
        );
        if (legacyDoc?.config) stored = legacyDoc.config;
      }
    } catch {
      // Non-admin callers or unconfigured settings fall back to env variables
    }
  }
  return {
    smtpHost: stored.smtpHost || process.env.SMTP_HOST || '',
    smtpPort: stored.smtpPort || Number(process.env.SMTP_PORT || 587),
    smtpSecure: stored.smtpSecure ?? false,
    smtpUser: stored.smtpUser || process.env.SMTP_USER || '',
    smtpPassEncrypted: stored.smtpPassEncrypted || '',
    smtpFrom: stored.smtpFrom || process.env.SMTP_FROM || '',
    smtpSenderName: stored.smtpSenderName || '',
    whatsappPhoneNumberId: stored.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappBusinessAccountId: stored.whatsappBusinessAccountId || '',
    whatsappAccessTokenEncrypted: stored.whatsappAccessTokenEncrypted || '',
    whatsappWebhookVerifyTokenEncrypted: stored.whatsappWebhookVerifyTokenEncrypted || '',
    whatsappAppSecretEncrypted: stored.whatsappAppSecretEncrypted || '',
    whatsappApiVersion: stored.whatsappApiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0',
    notificationPreferences: normalizeNotificationPreferences(stored.notificationPreferences),
  };
}

export async function ensureDefaultMessageTemplates(
  idToken: string,
  actorUid = 'system',
  tenantId = DEFAULT_TENANT_ID,
  strictTenant = false
): Promise<MessageTemplate[]> {
  let existing = await fsQueryTenantDocs<MessageTemplate>('messageTemplates', tenantId, idToken, {
    strictTenantFilter: strictTenant,
  }).catch(() => []);
  const existingCategories = new Set(existing.map((t) => t.category));
  const missing = DEFAULT_MESSAGE_TEMPLATES.filter((d) => !existingCategories.has(d.category));
  if (missing.length > 0) {
    for (const def of missing) {
      const docId = tenantId === DEFAULT_TENANT_ID ? def.id : `${tenantId}_${def.id}`;
      try {
        await fsCreateDoc(
          'messageTemplates',
          docId,
          {
            tenantId,
            code: def.code,
            category: def.category,
            nameEn: def.nameEn,
            nameAr: def.nameAr,
            subjectEn: def.subjectEn,
            subjectAr: def.subjectAr,
            bodyEn: def.bodyEn,
            bodyAr: def.bodyAr,
            whatsappTemplateName: def.whatsappTemplateName || '',
            whatsappLanguageEn: def.whatsappLanguageEn || 'en_US',
            whatsappLanguageAr: def.whatsappLanguageAr || 'ar',
            useApprovedMetaTemplate: Boolean(def.useApprovedMetaTemplate),
            placeholders: def.placeholders || [],
            isActive: true,
            updatedBy: actorUid,
          },
          idToken,
          ['createdAt', 'updatedAt']
        );
      } catch {
        // Ignore race condition if already seeded concurrently
      }
    }
    existing = await fsQueryTenantDocs<MessageTemplate>('messageTemplates', tenantId, idToken, {
      strictTenantFilter: strictTenant,
    }).catch(() => []);
  }
  return existing.sort((a, b) => a.code.localeCompare(b.code));
}

export async function resolveTemplateForCategory(params: {
  category: NotificationCategory;
  templateId?: string;
  idToken?: string;
  tenantId?: string;
  strictTenant?: boolean;
}): Promise<MessageTemplate> {
  const tenantId = params.tenantId || DEFAULT_TENANT_ID;
  if (params.idToken) {
    if (params.templateId) {
      const explicit = await fsGetDoc<MessageTemplate & { tenantId?: string }>(
        'messageTemplates',
        params.templateId,
        params.idToken
      ).catch(() => null);
      if (
        explicit &&
        (!explicit.tenantId ? tenantId === DEFAULT_TENANT_ID : explicit.tenantId === tenantId)
      ) {
        return explicit;
      }
    }
    const all = await fsQueryTenantDocs<MessageTemplate>('messageTemplates', tenantId, params.idToken, {
      filters: [{ field: 'category', op: 'EQUAL', value: params.category }],
      strictTenantFilter: params.strictTenant,
    }).catch(() => []);
    const active = all.find((t) => t.isActive) || all[0];
    if (active) return active;
  }

  const fallback =
    DEFAULT_MESSAGE_TEMPLATES.find((t) => t.category === params.category) ||
    DEFAULT_MESSAGE_TEMPLATES[0];
  return {
    ...fallback,
    updatedBy: 'system',
  };
}

// ---------------------------------------------------------------------------
// Email & WhatsApp Cloud API Adapters (Never Fake 'delivered' on Send)
// ---------------------------------------------------------------------------
function isTransientError(messageOrCode: string): boolean {
  const lower = messageOrCode.toLowerCase();
  return (
    lower.includes('etimedout') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('esocket') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('(429)') ||
    lower.includes('(500)') ||
    lower.includes('(502)') ||
    lower.includes('(503)') ||
    lower.includes('(504)') ||
    lower.includes('try again') ||
    lower.includes('timeout')
  );
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachment?: { filename: string; content: Buffer; contentType: string };
  idToken?: string;
  tenantId?: string;
}): Promise<{
  ok: boolean;
  deliveryStatus: DeliveryStatus;
  messageId?: string;
  error?: string;
  providerStatusDetails?: string;
}> {
  if (!params.to || !params.to.includes('@')) {
    return {
      ok: false,
      deliveryStatus: 'failed',
      error: 'A valid recipient email address is required.',
    };
  }

  const cfg = await getIntegrationConfig(params.idToken, params.tenantId || DEFAULT_TENANT_ID);
  const smtpPass = cfg.smtpPassEncrypted
    ? decryptSensitive(cfg.smtpPassEncrypted)
    : process.env.SMTP_PASS || '';

  if (!cfg.smtpHost || !cfg.smtpUser || !smtpPass) {
    return {
      ok: false,
      deliveryStatus: 'failed',
      error:
        'SMTP email provider is not configured. Configure SMTP credentials in Company & Integration Settings or use Manual Share.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort || 587,
      secure: Boolean(cfg.smtpSecure),
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      auth: {
        user: cfg.smtpUser,
        pass: smtpPass,
      },
    });

    const fromHeader =
      cfg.smtpSenderName && (cfg.smtpFrom || cfg.smtpUser)
        ? `"${cfg.smtpSenderName.replace(/"/g, '')}" <${cfg.smtpFrom || cfg.smtpUser}>`
        : cfg.smtpFrom || cfg.smtpUser;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachment
        ? [
            {
              filename: params.attachment.filename,
              content: params.attachment.content,
              contentType: params.attachment.contentType,
            },
          ]
        : undefined,
    });

    if (!info.messageId) {
      return {
        ok: false,
        deliveryStatus: 'retry_required',
        error: 'SMTP provider did not return a message acceptance ID.',
      };
    }

    // SMTP sendMail() confirms provider acceptance ONLY ('sent'), not inbox delivery ('delivered').
    return {
      ok: true,
      deliveryStatus: 'sent',
      messageId: info.messageId,
      providerStatusDetails: info.response ? String(info.response).slice(0, 400) : 'SMTP accepted',
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      deliveryStatus: isTransientError(errMsg) ? 'retry_required' : 'failed',
      error: errMsg,
    };
  }
}

export async function sendWhatsappCloudMessage(params: {
  toPhone: string;
  templateName?: string;
  languageCode?: string;
  bodyText: string;
  parameters?: string[];
  useApprovedMetaTemplate?: boolean;
  idToken?: string;
  tenantId?: string;
}): Promise<{
  ok: boolean;
  mode: 'cloud_api' | 'manual_fallback';
  deliveryStatus: DeliveryStatus;
  messageId?: string;
  manualUrl?: string;
  error?: string;
  providerStatusDetails?: string;
}> {
  const cleanPhone = params.toPhone.replace(/[^\d]/g, '');
  const manualUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(params.bodyText)}`
    : undefined;

  if (!cleanPhone || cleanPhone.length < 7) {
    return {
      ok: false,
      mode: 'manual_fallback',
      deliveryStatus: 'failed',
      manualUrl,
      error: 'A valid recipient WhatsApp mobile number is required.',
    };
  }

  const cfg = await getIntegrationConfig(params.idToken, params.tenantId || DEFAULT_TENANT_ID);
  const token = cfg.whatsappAccessTokenEncrypted
    ? decryptSensitive(cfg.whatsappAccessTokenEncrypted)
    : process.env.WHATSAPP_ACCESS_TOKEN || '';

  if (!cfg.whatsappPhoneNumberId || !token) {
    return {
      ok: false,
      mode: 'manual_fallback',
      deliveryStatus: 'manual_initiated',
      manualUrl,
      error:
        'WhatsApp Business Cloud API credentials are not configured; use the manual WhatsApp share link and document download.',
    };
  }

  try {
    const apiVer = cfg.whatsappApiVersion || 'v21.0';
    const endpoint = `https://graph.facebook.com/${apiVer}/${cfg.whatsappPhoneNumberId}/messages`;

    const useTemplate = Boolean(params.templateName && params.useApprovedMetaTemplate !== false);
    const payload = useTemplate
      ? {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.languageCode || 'en_US' },
            components:
              params.parameters && params.parameters.length > 0
                ? [
                    {
                      type: 'body',
                      parameters: params.parameters.map((text) => ({ type: 'text', text: text.slice(0, 1024) })),
                    },
                  ]
                : undefined,
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: true, body: params.bodyText },
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      messages?: Array<{ id: string; message_status?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || !json.messages?.[0]?.id) {
      const apiErr = json.error?.message || `WhatsApp Cloud API error (${res.status})`;
      const retryable = res.status === 429 || res.status >= 500 || isTransientError(apiErr);
      return {
        ok: false,
        mode: 'cloud_api',
        deliveryStatus: retryable ? 'retry_required' : 'failed',
        manualUrl,
        error: apiErr,
        providerStatusDetails: `HTTP ${res.status}`,
      };
    }

    // Meta Cloud API POST /messages confirms submission ('sent') only.
    // Final 'delivered' state arrives exclusively via Meta Delivery Status Webhook.
    return {
      ok: true,
      mode: 'cloud_api',
      deliveryStatus: 'sent',
      messageId: json.messages[0].id,
      providerStatusDetails: `Meta API accepted (${json.messages[0].message_status || 'accepted'})`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode: 'cloud_api',
      deliveryStatus: isTransientError(errMsg) ? 'retry_required' : 'failed',
      manualUrl,
      error: errMsg,
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook Receipts Store & Reconciliation (Delivered / Failed from Provider)
// ---------------------------------------------------------------------------
const RECEIPT_DIR = path.resolve(process.cwd(), '.data');
const RECEIPT_FILE = path.join(RECEIPT_DIR, 'webhook_receipts.json');

export interface PendingProviderReceipt {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  errorDetails?: string;
}

function loadPendingReceipts(): PendingProviderReceipt[] {
  try {
    if (!fs.existsSync(RECEIPT_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(RECEIPT_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingReceipts(receipts: PendingProviderReceipt[]): void {
  if (!fs.existsSync(RECEIPT_DIR)) {
    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  }
  fs.writeFileSync(RECEIPT_FILE, JSON.stringify(receipts, null, 2));
}

export function enqueueProviderReceipts(incoming: PendingProviderReceipt[]): number {
  if (incoming.length === 0) return 0;
  const current = loadPendingReceipts();
  const byKey = new Map<string, PendingProviderReceipt>();
  for (const r of current) {
    byKey.set(`${r.providerMessageId}:${r.status}`, r);
  }
  for (const r of incoming) {
    if (!r.providerMessageId) continue;
    byKey.set(`${r.providerMessageId}:${r.status}`, r);
  }
  const merged = Array.from(byKey.values()).slice(-500);
  savePendingReceipts(merged);
  return incoming.length;
}

export function verifyMetaSignatureHeader(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!appSecret) return true;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function applyProviderStatusUpdate(params: {
  providerMessageId: string;
  providerStatus: 'sent' | 'delivered' | 'read' | 'failed';
  timestampIso?: string;
  errorDetails?: string;
  idToken: string;
}): Promise<{ matched: number; updatedIds: string[] }> {
  const logs = await fsQueryDocs<DeliveryLogItem>('deliveryLogs', params.idToken, {
    filters: [{ field: 'providerMessageId', op: 'EQUAL', value: params.providerMessageId }],
  }).catch(() => []);

  const updatedIds: string[] = [];
  const nextStatus: DeliveryStatus =
    params.providerStatus === 'delivered' || params.providerStatus === 'read'
      ? 'delivered'
      : params.providerStatus === 'failed'
        ? 'failed'
        : 'sent';

  for (const log of logs) {
    const updateData: Record<string, unknown> = {
      deliveryStatus: nextStatus,
      providerStatusDetails: `Provider webhook: ${params.providerStatus}${params.errorDetails ? ` — ${params.errorDetails}` : ''}`.slice(0, 480),
    };
    if (nextStatus === 'delivered') {
      updateData.deliveredAt = (params.timestampIso || new Date().toISOString()).slice(0, 40);
      updateData.failureReason = '';
    } else if (nextStatus === 'failed' && params.errorDetails) {
      updateData.failureReason = params.errorDetails.slice(0, 500);
    }
    await fsUpdateDoc('deliveryLogs', log.id, updateData, params.idToken, ['updatedAt']).catch(
      () => {}
    );
    updatedIds.push(log.id);
  }
  return { matched: updatedIds.length, updatedIds };
}

export async function reconcilePendingWebhookReceipts(idToken: string): Promise<number> {
  const pending = loadPendingReceipts();
  if (pending.length === 0) return 0;

  let reconciledCount = 0;
  const remaining: PendingProviderReceipt[] = [];

  for (const item of pending) {
    try {
      const res = await applyProviderStatusUpdate({
        providerMessageId: item.providerMessageId,
        providerStatus: item.status,
        timestampIso: item.timestamp,
        errorDetails: item.errorDetails,
        idToken,
      });
      if (res.matched > 0) {
        reconciledCount += res.matched;
      } else {
        // Keep up to 7 days in case logs index hadn't settled yet
        const ageMs = Date.now() - Date.parse(item.timestamp || '');
        if (Number.isNaN(ageMs) || ageMs < 7 * 86400_000) {
          remaining.push(item);
        }
      }
    } catch {
      remaining.push(item);
    }
  }

  savePendingReceipts(remaining);
  return reconciledCount;
}

// ---------------------------------------------------------------------------
// Unified Notification & Document Dispatch Pipeline
// ---------------------------------------------------------------------------
export interface DispatchNotificationInput {
  tenantId?: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  recipient: string;
  recipientName?: string;
  language?: 'en' | 'ar' | 'bilingual';
  templateId?: string;
  customSubjectEn?: string;
  customSubjectAr?: string;
  customBodyEn?: string;
  customBodyAr?: string;
  variables?: Record<string, string | number | undefined | null>;
  targetUserId?: string;
  targetRole?: string;
  organizationId?: string;
  candidateDocId?: string;
  candidateId?: string;
  enrollmentId?: string;
  trainingCardId?: string;
  certificateId?: string;
  attachmentFileId?: string;
  attachmentFilename?: string;
  entityId?: string;
  useApprovedMetaTemplate?: boolean;
  actor: Pick<UserProfile, 'uid' | 'email' | 'role'> & { tenantId?: string };
  idToken: string;
}

export interface DispatchNotificationResult {
  ok: boolean;
  deliveryStatus: DeliveryStatus;
  logId: string;
  providerMessageId?: string;
  manualUrl?: string;
  attachmentFileId?: string;
  renderedTitleEn: string;
  renderedTitleAr: string;
  renderedBodyEn: string;
  renderedBodyAr: string;
  error?: string;
}

export async function dispatchNotificationPipeline(
  input: DispatchNotificationInput
): Promise<DispatchNotificationResult> {
  const tenantId = input.tenantId || input.actor?.tenantId || DEFAULT_TENANT_ID;
  const scopedCompany = await fsGetDoc<CompanySettings>('companySettings', tenantId, input.idToken).catch(
    () => null
  );
  const company =
    scopedCompany ||
    (tenantId === DEFAULT_TENANT_ID
      ? await fsGetDoc<CompanySettings>('companySettings', 'default', input.idToken).catch(() => null)
      : null);

  const { centerName, centerContact } = buildCenterContactString(company);
  const vars = sanitizeTemplateVariables({
    trainingCenterName: centerName,
    trainingCenterContact: centerContact,
    ...(input.variables || {}),
  });

  const tpl = await resolveTemplateForCategory({
    category: input.category,
    templateId: input.templateId,
    idToken: input.idToken,
    tenantId,
  });

  const renderedFromTpl = renderBilingualTemplate({ template: tpl, variables: vars });
  const renderedTitleEn = (
    input.customSubjectEn
      ? renderTemplateString(input.customSubjectEn, vars)
      : renderedFromTpl.subjectEn
  ).slice(0, 200);
  const renderedTitleAr = (
    input.customSubjectAr
      ? renderTemplateString(input.customSubjectAr, vars)
      : renderedFromTpl.subjectAr || renderedTitleEn
  ).slice(0, 200);
  const renderedBodyEn = (
    input.customBodyEn ? renderTemplateString(input.customBodyEn, vars) : renderedFromTpl.bodyEn
  ).slice(0, 1500);
  const renderedBodyAr = (
    input.customBodyAr
      ? renderTemplateString(input.customBodyAr, vars)
      : renderedFromTpl.bodyAr || renderedBodyEn
  ).slice(0, 1500);

  const lang = input.language || 'bilingual';
  const combinedSubject =
    lang === 'ar'
      ? renderedTitleAr
      : lang === 'en'
        ? renderedTitleEn
        : `${renderedTitleEn} | ${renderedTitleAr}`;
  const combinedText =
    lang === 'ar'
      ? renderedBodyAr
      : lang === 'en'
        ? renderedBodyEn
        : `${renderedBodyEn}\n\n---\n\n${renderedBodyAr}`;
  const safeBodyEnHtml = escapeHtml(renderedBodyEn).replace(/\n/g, '<br/>');
  const safeBodyArHtml = escapeHtml(renderedBodyAr).replace(/\n/g, '<br/>');
  const combinedHtml =
    lang === 'ar'
      ? `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;color:#0f172a;">${safeBodyArHtml}</div>`
      : lang === 'en'
        ? `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">${safeBodyEnHtml}</div>`
        : `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
             <p>${safeBodyEnHtml}</p>
             <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
             <p dir="rtl" style="font-family:Tahoma,Arial,sans-serif;">${safeBodyArHtml}</p>
           </div>`;

  const logId = `deliv_${crypto.randomBytes(8).toString('hex')}`;
  const initialChannel: NotificationChannel = input.channel;

  // Create initial 'queued' log before invoking external provider
  const initialLogPayload: Record<string, unknown> = {
    tenantId,
    channel: initialChannel,
    recipient: String(input.recipient || 'in_app').slice(0, 200),
    messageType: input.category,
    category: input.category,
    templateId: tpl.id,
    language: lang,
    titleEn: renderedTitleEn.slice(0, 240),
    titleAr: renderedTitleAr.slice(0, 240),
    messagePreview: combinedText.slice(0, 1800),
    deliveryStatus: input.channel === 'in_app' ? 'sent' : 'queued',
    retryCount: 0,
    sentBy: input.actor.uid,
  };
  if (input.recipientName) initialLogPayload.recipientName = input.recipientName.slice(0, 200);
  if (input.entityId) initialLogPayload.entityId = input.entityId.slice(0, 128);
  if (input.candidateDocId) initialLogPayload.candidateDocId = input.candidateDocId.slice(0, 128);
  if (input.candidateId) initialLogPayload.candidateId = input.candidateId.slice(0, 64);
  if (input.enrollmentId) initialLogPayload.enrollmentId = input.enrollmentId.slice(0, 128);
  if (input.trainingCardId) initialLogPayload.trainingCardId = input.trainingCardId.slice(0, 128);
  if (input.certificateId) initialLogPayload.certificateId = input.certificateId.slice(0, 128);
  if (input.organizationId) initialLogPayload.organizationId = input.organizationId.slice(0, 128);
  if (input.attachmentFileId) initialLogPayload.attachmentFileId = input.attachmentFileId.slice(0, 256);

  await fsCreateDoc('deliveryLogs', logId, initialLogPayload, input.idToken, ['createdAt']).catch(
    (err) => {
      console.error('Failed to initialize deliveryLog:', err);
    }
  );

  let ok = true;
  let finalChannel: NotificationChannel = initialChannel;
  let finalStatus: DeliveryStatus = input.channel === 'in_app' ? 'sent' : 'queued';
  let providerMessageId: string | undefined;
  let manualUrl: string | undefined;
  let errorMsg: string | undefined;
  let providerStatusDetails: string | undefined;

  if (input.channel === 'email') {
    let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
    if (input.attachmentFileId) {
      const stored = await readPrivateFileAsync(input.attachmentFileId, input.idToken, tenantId).catch(() => null);
      if (stored?.buffer) {
        attachment = {
          filename: input.attachmentFilename || `${input.entityId || 'document'}.pdf`,
          content: stored.buffer,
          contentType: stored.meta?.mimeType || 'application/pdf',
        };
      }
    }
    const mailRes = await sendTransactionalEmail({
      to: input.recipient,
      subject: combinedSubject,
      text: combinedText,
      html: combinedHtml,
      attachment,
      idToken: input.idToken,
      tenantId,
    });
    ok = mailRes.ok;
    finalStatus = mailRes.deliveryStatus;
    providerMessageId = mailRes.messageId;
    errorMsg = mailRes.error;
    providerStatusDetails = mailRes.providerStatusDetails;
    if (!ok) {
      manualUrl = `mailto:${encodeURIComponent(input.recipient)}?subject=${encodeURIComponent(
        combinedSubject
      )}&body=${encodeURIComponent(combinedText)}`;
    }
  } else if (input.channel === 'whatsapp' || input.channel === 'whatsapp_manual') {
    if (input.channel === 'whatsapp_manual') {
      const cleanPhone = String(input.recipient || '').replace(/[^\d]/g, '');
      manualUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(combinedText)}`;
      ok = true;
      finalStatus = 'manual_initiated';
    } else {
      const metaParams = Object.values(vars).slice(0, 5);
      const waRes = await sendWhatsappCloudMessage({
        toPhone: input.recipient,
        templateName: tpl.whatsappTemplateName,
        languageCode: lang === 'ar' ? tpl.whatsappLanguageAr || 'ar' : tpl.whatsappLanguageEn || 'en_US',
        bodyText: combinedText,
        parameters: metaParams,
        useApprovedMetaTemplate: input.useApprovedMetaTemplate ?? tpl.useApprovedMetaTemplate,
        idToken: input.idToken,
        tenantId,
      });
      ok = waRes.ok;
      finalChannel = waRes.mode === 'manual_fallback' ? 'whatsapp_manual' : 'whatsapp';
      finalStatus = waRes.deliveryStatus;
      providerMessageId = waRes.messageId;
      manualUrl = waRes.manualUrl;
      errorMsg = waRes.error;
      providerStatusDetails = waRes.providerStatusDetails;
    }
  }

  // Update delivery log with final state ('sent' | 'failed' | 'retry_required' | 'manual_initiated')
  const logUpdate: Record<string, unknown> = {
    channel: finalChannel,
    deliveryStatus: finalStatus,
  };
  if (providerMessageId) logUpdate.providerMessageId = providerMessageId.slice(0, 200);
  if (errorMsg) logUpdate.failureReason = errorMsg.slice(0, 500);
  if (providerStatusDetails) logUpdate.providerStatusDetails = providerStatusDetails.slice(0, 500);
  if (manualUrl) logUpdate.manualUrl = manualUrl.slice(0, 2000);

  await fsUpdateDoc('deliveryLogs', logId, logUpdate, input.idToken, ['updatedAt']).catch(() => {});

  // Also persist In-App Notification record in `notifications`
  const notifData: Record<string, unknown> = {
    tenantId,
    type: input.category,
    category: input.category,
    channel: finalChannel,
    deliveryStatus: finalStatus,
    recipient: String(input.recipient || '').slice(0, 200),
    titleEn: renderedTitleEn.slice(0, 200),
    titleAr: renderedTitleAr.slice(0, 200),
    bodyEn: renderedBodyEn.slice(0, 1000),
    bodyAr: renderedBodyAr.slice(0, 1000),
    read: false,
  };
  if (input.targetUserId) notifData.targetUserId = input.targetUserId;
  if (input.targetRole) notifData.targetRole = input.targetRole;
  if (input.organizationId) notifData.organizationId = input.organizationId;
  if (input.candidateDocId) notifData.candidateDocId = input.candidateDocId;
  if (input.candidateId) notifData.candidateId = input.candidateId;
  if (input.enrollmentId) notifData.enrollmentId = input.enrollmentId;
  if (input.trainingCardId) notifData.trainingCardId = input.trainingCardId;
  if (input.certificateId) notifData.certificateId = input.certificateId;
  if (input.attachmentFileId) notifData.attachmentFileId = input.attachmentFileId;

  await fsCreateDoc(
    'notifications',
    `notif_${crypto.randomBytes(8).toString('hex')}`,
    notifData,
    input.idToken,
    ['createdAt']
  ).catch(() => {});

  return {
    ok,
    deliveryStatus: finalStatus,
    logId,
    providerMessageId,
    manualUrl,
    attachmentFileId: input.attachmentFileId,
    renderedTitleEn,
    renderedTitleAr,
    renderedBodyEn,
    renderedBodyAr,
    error: errorMsg,
  };
}

export async function dispatchAutomatedCategoryNotifications(params: {
  tenantId?: string;
  category: NotificationCategory;
  candidate?: {
    id: string;
    candidateId: string;
    userId?: string;
    fullNameEn: string;
    fullNameAr: string;
    email?: string;
    mobile?: string;
    organizationId?: string;
    tenantId?: string;
  };
  organizationId?: string;
  enrollmentId?: string;
  trainingCardId?: string;
  certificateId?: string;
  attachmentFileId?: string;
  attachmentFilename?: string;
  entityId?: string;
  variables?: Record<string, string | number | undefined | null>;
  targetRole?: string;
  actor: Pick<UserProfile, 'uid' | 'email' | 'role'> & { tenantId?: string };
  idToken: string;
}): Promise<void> {
  try {
    const tenantId =
      params.tenantId || params.candidate?.tenantId || params.actor?.tenantId || DEFAULT_TENANT_ID;
    const cfg = await getIntegrationConfig(params.idToken, tenantId);
    const prefs = normalizeNotificationPreferences(cfg.notificationPreferences);
    const catPref = prefs.autoCategories[params.category];
    const orgId = params.organizationId || params.candidate?.organizationId;
    const baseInput = {
      tenantId,
      category: params.category,
      recipientName: params.candidate?.fullNameEn,
      language: 'bilingual' as const,
      variables: {
        candidateNameEn: params.candidate?.fullNameEn,
        candidateNameAr: params.candidate?.fullNameAr,
        candidateId: params.candidate?.candidateId,
        ...(params.variables || {}),
      },
      targetUserId: params.candidate?.userId,
      targetRole: params.targetRole,
      organizationId: orgId,
      candidateDocId: params.candidate?.id,
      candidateId: params.candidate?.candidateId,
      enrollmentId: params.enrollmentId,
      trainingCardId: params.trainingCardId,
      certificateId: params.certificateId,
      attachmentFileId: params.attachmentFileId,
      attachmentFilename: params.attachmentFilename,
      entityId: params.entityId,
      actor: params.actor,
      idToken: params.idToken,
    };

    const jobs: Array<Promise<unknown>> = [];
    let dispatchedExternal = false;

    if (prefs.enableAutoEmail && catPref?.email && params.candidate?.email) {
      dispatchedExternal = true;
      jobs.push(
        dispatchNotificationPipeline({
          ...baseInput,
          channel: 'email',
          recipient: params.candidate.email,
        })
      );
    }

    if (prefs.enableAutoWhatsapp && catPref?.whatsapp && params.candidate?.mobile) {
      dispatchedExternal = true;
      jobs.push(
        dispatchNotificationPipeline({
          ...baseInput,
          channel: 'whatsapp',
          recipient: params.candidate.mobile,
        })
      );
    }

    if (!dispatchedExternal && prefs.enableInApp && catPref?.inApp) {
      jobs.push(
        dispatchNotificationPipeline({
          ...baseInput,
          channel: 'in_app',
          recipient: params.candidate?.email || params.candidate?.mobile || params.candidate?.fullNameEn || 'system',
        })
      );
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    console.error(`Auto notification dispatch error (${params.category}):`, err);
  }
}
