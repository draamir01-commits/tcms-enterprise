import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole, isTenantOwnerRole } from '../lib/permissions';
import type {
  Candidate,
  Certificate,
  DeliveryLogItem,
  DeliveryStatus,
  Enrollment,
  MessageTemplate,
  NotificationCategory,
  NotificationChannel,
  NotificationItem,
  TrainingCard,
} from '../types/tcms';
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  Modal,
  NotificationBanner,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';

const ALL_CATEGORIES: NotificationCategory[] = [
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

const PLACEHOLDER_CHIPS = [
  '{{candidateNameEn}}',
  '{{candidateNameAr}}',
  '{{candidateId}}',
  '{{courseNameEn}}',
  '{{courseNameAr}}',
  '{{courseCode}}',
  '{{batchNumber}}',
  '{{batchDate}}',
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

function buildWhatsappManualLink(phone: string, text: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email: string, subject: string, body: string): string {
  const target = email && email.includes('@') ? encodeURIComponent(email) : '';
  return `mailto:${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function NotificationsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();

  const role = profile?.role || 'candidate';
  const canDispatch = isTenantAdminRole(role) || role === 'certificate_officer';
  const canManageTemplates = isTenantAdminRole(role);
  const canManualShare =
    isTenantAdminRole(role) || role === 'certificate_officer' || role === 'corporate_client';

  const [tab, setTab] = useState<'center' | 'compose' | 'templates'>('center');

  // Notification Center & Delivery Logs state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLogItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ variant: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Filters
  const [viewScope, setViewScope] = useState<'all' | 'logs' | 'in_app'>('all');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Busy actions
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [runningExpiry, setRunningExpiry] = useState(false);

  // Manual fallback modal
  const [manualLog, setManualLog] = useState<DeliveryLogItem | null>(null);
  const [manualNotes, setManualNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [submittingManual, setSubmittingManual] = useState(false);

  // Compose & Dispatch state
  const [entitiesLoaded, setEntitiesLoaded] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [trainingCards, setTrainingCards] = useState<TrainingCard[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const [dispCategory, setDispCategory] = useState<NotificationCategory>('enrollment_confirmation');
  const [dispChannel, setDispChannel] = useState<NotificationChannel>('email');
  const [dispLanguage, setDispLanguage] = useState<'bilingual' | 'en' | 'ar'>('bilingual');
  const [dispTemplateId, setDispTemplateId] = useState<string>('');
  const [dispCandidateDocId, setDispCandidateDocId] = useState<string>('');
  const [dispEnrollmentId, setDispEnrollmentId] = useState<string>('');
  const [dispCardId, setDispCardId] = useState<string>('');
  const [dispCertId, setDispCertId] = useState<string>('');
  const [dispRecipient, setDispRecipient] = useState<string>('');
  const [dispSubjectEn, setDispSubjectEn] = useState<string>('');
  const [dispSubjectAr, setDispSubjectAr] = useState<string>('');
  const [dispBodyEn, setDispBodyEn] = useState<string>('');
  const [dispBodyAr, setDispBodyAr] = useState<string>('');
  const [dispIncludeAttachment, setDispIncludeAttachment] = useState<boolean>(true);
  const [dispUseMetaTemplate, setDispUseMetaTemplate] = useState<boolean>(false);
  const [dispPreview, setDispPreview] = useState<{
    subjectEn: string;
    subjectAr: string;
    bodyEn: string;
    bodyAr: string;
    combinedText: string;
    attachmentFileId?: string;
  } | null>(null);
  const [dispatching, setDispatching] = useState(false);

  // Template Manager modal state
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<MessageTemplate | null>(null);
  const [tplForm, setTplForm] = useState({
    code: '',
    category: 'enrollment_confirmation' as NotificationCategory,
    nameEn: '',
    nameAr: '',
    subjectEn: '',
    subjectAr: '',
    bodyEn: '',
    bodyAr: '',
    whatsappTemplateName: '',
    whatsappLanguageEn: 'en_US',
    whatsappLanguageAr: 'ar',
    useApprovedMetaTemplate: false,
    isActive: true,
  });
  const [activeBodyField, setActiveBodyField] = useState<'bodyEn' | 'bodyAr'>('bodyEn');
  const [tplPreview, setTplPreview] = useState<{
    subjectEn: string;
    subjectAr: string;
    bodyEn: string;
    bodyAr: string;
  } | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [deleteTplTarget, setDeleteTplTarget] = useState<MessageTemplate | null>(null);

  const getCategoryLabel = useCallback(
    (cat?: string) => {
      if (!cat) return '—';
      const key = `notifCat_${cat}`;
      const res = t(key);
      return res !== key ? res : cat.replace(/_/g, ' ');
    },
    [t]
  );

  const getChannelLabel = useCallback(
    (ch?: string) => {
      if (!ch) return '—';
      const key = `notifChannel_${ch}`;
      const res = t(key);
      return res !== key ? res : ch.replace(/_/g, ' ');
    },
    [t]
  );

  const loadCenterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests: Array<Promise<unknown>> = [
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<{ logs: DeliveryLogItem[] }>('/api/notifications/logs').catch(() => ({ logs: [] })),
      ];
      if (canDispatch) {
        requests.push(
          apiFetch<{ templates: MessageTemplate[] }>('/api/templates/messages').catch(() => ({
            templates: [],
          }))
        );
      }
      const results = await Promise.all(requests);
      const notifRes = results[0] as { notifications: NotificationItem[] };
      const logsRes = results[1] as { logs: DeliveryLogItem[] };
      setNotifications(notifRes.notifications || []);
      setDeliveryLogs(logsRes.logs || []);
      if (canDispatch && results[2]) {
        const tplRes = results[2] as { templates: MessageTemplate[] };
        setTemplates(tplRes.templates || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [canDispatch]);

  useEffect(() => {
    void loadCenterData();
  }, [loadCenterData]);

  // Lazy-load relational context entities when opening Compose tab
  useEffect(() => {
    if (tab !== 'compose' || !canDispatch || entitiesLoaded) return;
    let active = true;
    (async () => {
      try {
        const [candRes, certRes, cardRes, enrRes] = await Promise.all([
          apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
          apiFetch<{ certificates: Certificate[] }>('/api/certificates').catch(() => ({
            certificates: [],
          })),
          apiFetch<{ cards: TrainingCard[] }>('/api/training-cards').catch(() => ({ cards: [] })),
          apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments').catch(() => ({
            enrollments: [],
          })),
        ]);
        if (!active) return;
        setCandidates(candRes.candidates || []);
        setCertificates(certRes.certificates || []);
        setTrainingCards(cardRes.cards || []);
        setEnrollments(enrRes.enrollments || []);
        setEntitiesLoaded(true);
      } catch {
        // Ignore non-fatal selector prefill errors
      }
    })();
    return () => {
      active = false;
    };
  }, [tab, canDispatch, entitiesLoaded]);

  // Sync default template fields in Compose when category or template selection changes
  useEffect(() => {
    if (templates.length === 0) return;
    const match =
      (dispTemplateId && templates.find((tpl) => tpl.id === dispTemplateId)) ||
      templates.find((tpl) => tpl.category === dispCategory && tpl.isActive) ||
      templates.find((tpl) => tpl.category === dispCategory);

    if (match) {
      if (!dispTemplateId) setDispTemplateId(match.id);
      setDispSubjectEn(match.subjectEn);
      setDispSubjectAr(match.subjectAr);
      setDispBodyEn(match.bodyEn);
      setDispBodyAr(match.bodyAr);
      setDispUseMetaTemplate(Boolean(match.useApprovedMetaTemplate));
    }
  }, [dispCategory, dispTemplateId, templates]);

  // Auto-fill recipient when candidate or channel changes in Compose
  useEffect(() => {
    if (!dispCandidateDocId) return;
    const cand = candidates.find((c) => c.id === dispCandidateDocId);
    if (!cand) return;
    if (dispChannel === 'email') {
      setDispRecipient(cand.email || '');
    } else if (dispChannel === 'whatsapp' || dispChannel === 'whatsapp_manual') {
      setDispRecipient(cand.mobile || '');
    } else {
      setDispRecipient(cand.fullNameEn || cand.candidateId);
    }
  }, [dispCandidateDocId, dispChannel, candidates]);

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setBanner({
        variant: 'success',
        text: lang === 'ar' ? 'تم تحديد كافة التنبيهات كمقروءة.' : 'All notifications marked as read.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRunExpiryReminders = async () => {
    setRunningExpiry(true);
    setError(null);
    setBanner(null);
    try {
      const res = await apiFetch<{ ok: boolean; checked: number; reminded: number; horizon: string }>(
        '/api/notifications/expiry-reminders/run',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setBanner({
        variant: 'info',
        text:
          lang === 'ar'
            ? `تم فحص ${res.checked} شهادة وإرسال ${res.reminded} تذكير حتى تاريخ ${res.horizon}.`
            : `Scanned ${res.checked} certificate(s) up to ${res.horizon}; triggered ${res.reminded} expiry reminder(s).`,
      });
      await loadCenterData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningExpiry(false);
    }
  };

  const handleRetryLog = async (log: DeliveryLogItem) => {
    setRetryingId(log.id);
    setError(null);
    setBanner(null);
    try {
      const res = await apiFetch<{ ok: boolean; log: DeliveryLogItem; manualUrl?: string; error?: string }>(
        `/api/notifications/logs/${encodeURIComponent(log.id)}/retry`,
        { method: 'POST' }
      );
      setDeliveryLogs((prev) => prev.map((l) => (l.id === log.id ? res.log : l)));
      if (res.ok) {
        setBanner({
          variant: 'success',
          text:
            lang === 'ar'
              ? `تمت إعادة إرسال الرسالة إلى ${log.recipient} (الحالة: ${res.log.deliveryStatus}).`
              : `Retry accepted for ${log.recipient} (status: ${res.log.deliveryStatus}).`,
        });
      } else {
        setBanner({
          variant: 'warning',
          text: res.error || (lang === 'ar' ? 'تعذر الإرسال التلقائي. يمكنك استخدام المشاركة اليدوية.' : 'Automated retry did not succeed. Manual fallback is available.'),
        });
        if (res.manualUrl || res.log.deliveryStatus === 'manual_initiated' || res.log.deliveryStatus === 'failed') {
          setManualNotes('');
          setManualLog(res.log);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  };

  const openManualFallback = (log: DeliveryLogItem) => {
    setManualNotes('');
    setManualLog(log);
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  };

  const handleRecordManualShare = async (channel: 'whatsapp_manual' | 'email') => {
    if (!manualLog) return;
    setSubmittingManual(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; log: DeliveryLogItem }>(
        `/api/notifications/logs/${encodeURIComponent(manualLog.id)}/manual-share`,
        {
          method: 'POST',
          body: JSON.stringify({
            channel,
            notes: manualNotes.trim() || undefined,
          }),
        }
      );
      if (res.log) {
        setDeliveryLogs((prev) => prev.map((l) => (l.id === manualLog.id ? res.log : l)));
      }
      setManualLog(null);
      setBanner({
        variant: 'success',
        text:
          lang === 'ar'
            ? 'تم توثيق التسليم اليدوي في سجل التدقيق وسجل التسليم.'
            : 'Manual document share recorded in delivery logs and audit trail.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingManual(false);
    }
  };

  const handlePreviewCompose = async () => {
    setError(null);
    try {
      const res = await apiFetch<{
        rendered: {
          subjectEn: string;
          subjectAr: string;
          bodyEn: string;
          bodyAr: string;
          combinedText?: string;
        };
        attachmentFileId?: string;
      }>('/api/templates/messages/preview', {
        method: 'POST',
        body: JSON.stringify({
          candidateDocId: dispCandidateDocId || undefined,
          enrollmentId: dispEnrollmentId || undefined,
          trainingCardId: dispCardId || undefined,
          certificateId: dispCertId || undefined,
          template: {
            subjectEn: dispSubjectEn,
            subjectAr: dispSubjectAr,
            bodyEn: dispBodyEn,
            bodyAr: dispBodyAr,
          },
        }),
      });
      setDispPreview({
        ...res.rendered,
        combinedText:
          res.rendered.combinedText ||
          [res.rendered.bodyEn, res.rendered.bodyAr].filter(Boolean).join('\n\n'),
        attachmentFileId: res.attachmentFileId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatching(true);
    setError(null);
    setBanner(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        logId: string;
        deliveryStatus: DeliveryStatus;
        providerMessageId?: string;
        manualUrl?: string;
        error?: string;
      }>('/api/notifications/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          category: dispCategory,
          channel: dispChannel,
          language: dispLanguage,
          templateId: dispTemplateId || undefined,
          candidateDocId: dispCandidateDocId || undefined,
          enrollmentId: dispEnrollmentId || undefined,
          trainingCardId: dispCardId || undefined,
          certificateId: dispCertId || undefined,
          recipient: dispRecipient.trim(),
          subjectEn: dispSubjectEn,
          subjectAr: dispSubjectAr,
          bodyEn: dispBodyEn,
          bodyAr: dispBodyAr,
          includeAttachment: dispIncludeAttachment,
          useApprovedMetaTemplate: dispUseMetaTemplate,
        }),
      });

      await loadCenterData();

      if (res.ok) {
        setBanner({
          variant: 'success',
          text:
            lang === 'ar'
              ? `تم الإرسال بنجاح (الحالة: ${res.deliveryStatus}). رقم التتبع: ${res.logId}`
              : `Notification dispatched (status: ${res.deliveryStatus}). Tracking ID: ${res.logId}`,
        });
        setTab('center');
      } else {
        setBanner({
          variant: 'warning',
          text:
            res.error ||
            (lang === 'ar'
              ? `لم يكتمل الإرسال التلقائي (${res.deliveryStatus}). يمكنك استكمال المشاركة يدوياً.`
              : `Automated delivery reported '${res.deliveryStatus}'. Use manual fallback or retry from Notification Center.`),
        });
        if (res.manualUrl) {
          setManualLog({
            id: res.logId,
            channel: 'whatsapp_manual',
            recipient: dispRecipient.trim(),
            messageType: dispCategory,
            category: dispCategory,
            titleEn: dispSubjectEn,
            titleAr: dispSubjectAr,
            messagePreview: dispPreview?.combinedText || [dispBodyEn, dispBodyAr].filter(Boolean).join('\n\n'),
            deliveryStatus: res.deliveryStatus,
            manualUrl: res.manualUrl,
            attachmentFileId: dispPreview?.attachmentFileId,
            sentBy: profile?.uid || '',
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatching(false);
    }
  };

  // Template CRUD Handlers
  const openCreateTemplate = () => {
    setEditingTpl(null);
    setTplPreview(null);
    setTplForm({
      code: '',
      category: 'enrollment_confirmation',
      nameEn: '',
      nameAr: '',
      subjectEn: '',
      subjectAr: '',
      bodyEn: '',
      bodyAr: '',
      whatsappTemplateName: '',
      whatsappLanguageEn: 'en_US',
      whatsappLanguageAr: 'ar',
      useApprovedMetaTemplate: false,
      isActive: true,
    });
    setTplModalOpen(true);
  };

  const openEditTemplate = (tpl: MessageTemplate) => {
    setEditingTpl(tpl);
    setTplPreview(null);
    setTplForm({
      code: tpl.code,
      category: tpl.category,
      nameEn: tpl.nameEn,
      nameAr: tpl.nameAr,
      subjectEn: tpl.subjectEn,
      subjectAr: tpl.subjectAr,
      bodyEn: tpl.bodyEn,
      bodyAr: tpl.bodyAr,
      whatsappTemplateName: tpl.whatsappTemplateName || '',
      whatsappLanguageEn: tpl.whatsappLanguageEn || 'en_US',
      whatsappLanguageAr: tpl.whatsappLanguageAr || 'ar',
      useApprovedMetaTemplate: Boolean(tpl.useApprovedMetaTemplate),
      isActive: tpl.isActive !== false,
    });
    setTplModalOpen(true);
  };

  const handleInsertPlaceholder = (chip: string) => {
    setTplForm((prev) => ({
      ...prev,
      [activeBodyField]: prev[activeBodyField]
        ? `${prev[activeBodyField]} ${chip}`
        : chip,
    }));
  };

  const handlePreviewTemplateModal = async () => {
    setError(null);
    try {
      const res = await apiFetch<{
        rendered: { subjectEn: string; subjectAr: string; bodyEn: string; bodyAr: string };
      }>('/api/templates/messages/preview', {
        method: 'POST',
        body: JSON.stringify({ template: tplForm }),
      });
      setTplPreview(res.rendered);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTpl(true);
    setError(null);
    try {
      if (editingTpl) {
        await apiFetch(`/api/templates/messages/${encodeURIComponent(editingTpl.id)}`, {
          method: 'PUT',
          body: JSON.stringify(tplForm),
        });
        setBanner({
          variant: 'success',
          text: lang === 'ar' ? 'تم تحديث قالب الرسالة بنجاح.' : 'Message template updated.',
        });
      } else {
        await apiFetch('/api/templates/messages', {
          method: 'POST',
          body: JSON.stringify(tplForm),
        });
        setBanner({
          variant: 'success',
          text: lang === 'ar' ? 'تم إنشاء قالب الرسالة بنجاح.' : 'Message template created.',
        });
      }
      setTplModalOpen(false);
      await loadCenterData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTpl(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTplTarget) return;
    try {
      await apiFetch(`/api/templates/messages/${encodeURIComponent(deleteTplTarget.id)}`, {
        method: 'DELETE',
      });
      setDeleteTplTarget(null);
      setBanner({
        variant: 'success',
        text: lang === 'ar' ? 'تم حذف القالب.' : 'Template deleted.',
      });
      await loadCenterData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Filtered views & metrics
  const unreadInAppCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const metrics = useMemo(() => {
    let sent = 0;
    let delivered = 0;
    let attention = 0;
    for (const log of deliveryLogs) {
      if (log.deliveryStatus === 'sent') sent += 1;
      if (log.deliveryStatus === 'delivered') delivered += 1;
      if (log.deliveryStatus === 'failed' || log.deliveryStatus === 'retry_required') attention += 1;
    }
    return { unreadInAppCount, sent, delivered, attention };
  }, [notifications, deliveryLogs, unreadInAppCount]);

  const filteredInApp = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (onlyUnread && n.read) return false;
      if (categoryFilter !== 'all' && n.category !== categoryFilter && n.type !== categoryFilter) {
        return false;
      }
      if (channelFilter !== 'all' && (n.channel || 'in_app') !== channelFilter) return false;
      if (statusFilter !== 'all' && (n.deliveryStatus || 'sent') !== statusFilter) return false;
      if (q) {
        const hay = [n.titleEn, n.titleAr, n.bodyEn, n.bodyAr, n.candidateId, n.type, n.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notifications, onlyUnread, categoryFilter, channelFilter, statusFilter, search]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveryLogs.filter((l) => {
      if (channelFilter !== 'all' && l.channel !== channelFilter) return false;
      if (statusFilter !== 'all' && l.deliveryStatus !== statusFilter) return false;
      if (
        categoryFilter !== 'all' &&
        l.category !== categoryFilter &&
        l.messageType !== categoryFilter
      ) {
        return false;
      }
      if (q) {
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
          l.category,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deliveryLogs, channelFilter, statusFilter, categoryFilter, search]);

  return (
    <div className="space-y-5">
      {/* Top Tabs & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('center')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'center'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{t('notifTabCenter')}</span>
          </button>
          {canDispatch && (
            <button
              type="button"
              onClick={() => setTab('compose')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md ${
                tab === 'compose'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t('notifTabCompose')}</span>
            </button>
          )}
          {canManageTemplates && (
            <button
              type="button"
              onClick={() => setTab('templates')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md ${
                tab === 'templates'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {t('notifTabTemplates')} ({templates.length})
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'center' && unreadInAppCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('notifMarkAllRead')}</span>
            </button>
          )}
          {tab === 'center' && canDispatch && (
            <button
              type="button"
              disabled={runningExpiry}
              onClick={() => void handleRunExpiryReminders()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningExpiry ? 'animate-spin' : ''}`} />
              <span>{t('notifRunExpiryReminders')}</span>
            </button>
          )}
          {tab === 'templates' && canManageTemplates && (
            <button
              type="button"
              onClick={openCreateTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('notifNewTemplate')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadCenterData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {banner && (
        <NotificationBanner
          variant={banner.variant}
          message={banner.text}
          onDismiss={() => setBanner(null)}
        />
      )}

      {/* =====================================================================
          TAB 1: NOTIFICATION CENTER & DELIVERY TRACKING
      ===================================================================== */}
      {tab === 'center' && (
        <div className="space-y-4">
          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium text-slate-500">{t('notifUnreadCount')}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono-tabular">
                {metrics.unreadInAppCount}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium text-slate-500">{t('notifSentCount')}</div>
              <div className="mt-1 text-2xl font-semibold text-sky-700 font-mono-tabular">
                {metrics.sent}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium text-slate-500">{t('notifDeliveredCount')}</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono-tabular">
                {metrics.delivered}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-[11px] font-medium text-slate-500">{t('notifFailedCount')}</div>
              <div className="mt-1 text-2xl font-semibold text-red-700 font-mono-tabular">
                {metrics.attention}
              </div>
            </div>
          </div>

          <div className="px-4 py-2.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
            {t('notifDeliveryStrictNotice')}
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center gap-2.5">
            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setViewScope('all')}
                className={`px-3 py-1.5 font-medium ${
                  viewScope === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('notifViewAll')}
              </button>
              <button
                type="button"
                onClick={() => setViewScope('logs')}
                className={`px-3 py-1.5 font-medium border-s border-slate-200 ${
                  viewScope === 'logs' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('notifViewLogsOnly')} ({deliveryLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setViewScope('in_app')}
                className={`px-3 py-1.5 font-medium border-s border-slate-200 ${
                  viewScope === 'in_app' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('notifViewInAppOnly')} ({notifications.length})
              </button>
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'بحث بالمستلم، رقم المتدرب، رقم الشهادة، الرسالة...'
                  : 'Search recipient, candidate ID, cert #, card #, message...'
              }
              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            />

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{lang === 'ar' ? 'كافة القنوات' : 'All Channels'}</option>
              <option value="email">{t('notifChannel_email')}</option>
              <option value="whatsapp">{t('notifChannel_whatsapp')}</option>
              <option value="whatsapp_manual">{t('notifChannel_whatsapp_manual')}</option>
              <option value="in_app">{t('notifChannel_in_app')}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('filterByStatus')}</option>
              <option value="pending">{t('status_pending')}</option>
              <option value="queued">{t('status_queued')}</option>
              <option value="sent">{t('status_sent')}</option>
              <option value="delivered">{t('status_delivered')}</option>
              <option value="failed">{t('status_failed')}</option>
              <option value="retry_required">{t('status_retry_required')}</option>
              <option value="manual_initiated">{t('status_manual_initiated')}</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md max-w-[210px]"
            >
              <option value="all">{lang === 'ar' ? 'كافة التصنيفات' : 'All Categories'}</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {getCategoryLabel(cat)}
                </option>
              ))}
            </select>

            {viewScope !== 'logs' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnread}
                  onChange={(e) => setOnlyUnread(e.target.checked)}
                />
                <span>{lang === 'ar' ? 'غير المقروءة فقط' : 'Unread only'}</span>
              </label>
            )}
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <div className="space-y-5">
              {/* Delivery Logs Table */}
              {viewScope !== 'in_app' && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900">
                      {lang === 'ar'
                        ? `سجل إرسال البريد الإلكتروني والواتساب (${filteredLogs.length})`
                        : `Channel Delivery & Dispatch Tracking (${filteredLogs.length})`}
                    </h3>
                  </div>

                  {filteredLogs.length === 0 ? (
                    <div className="p-8">
                      <EmptyState
                        title={t('noRecords')}
                        description={
                          lang === 'ar'
                            ? 'تظهر هنا كافة محاولات إرسال البريد والواتساب وحالات تسليمها وتفاصيل الارتباط.'
                            : 'Email, WhatsApp Cloud API, In-App, and Manual Delivery records appear here with recipient and relational tracking.'
                        }
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-start border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                            <th className="py-2.5 px-4 text-start">Date & Channel</th>
                            <th className="py-2.5 px-4 text-start">Notification & Message</th>
                            <th className="py-2.5 px-4 text-start">Recipient</th>
                            <th className="py-2.5 px-4 text-start">Related Record</th>
                            <th className="py-2.5 px-4 text-start">Delivery Status</th>
                            <th className="py-2.5 px-4 text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredLogs.map((log) => {
                            const title =
                              lang === 'ar'
                                ? log.titleAr || log.titleEn || getCategoryLabel(log.category || log.messageType)
                                : log.titleEn || log.titleAr || getCategoryLabel(log.category || log.messageType);
                            const canRetry =
                              canDispatch &&
                              ['failed', 'retry_required', 'pending', 'queued', 'manual_initiated'].includes(
                                log.deliveryStatus
                              ) &&
                              log.channel !== 'in_app';

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                  <div className="font-mono-tabular text-slate-600">
                                    {(log.createdAt || '').slice(0, 19).replace('T', ' ')}
                                  </div>
                                  <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                                    {log.channel === 'email' ? (
                                      <Mail className="w-3 h-3 text-sky-700" />
                                    ) : log.channel === 'in_app' ? (
                                      <Bell className="w-3 h-3 text-slate-600" />
                                    ) : (
                                      <MessageCircle className="w-3 h-3 text-emerald-700" />
                                    )}
                                    <span>{getChannelLabel(log.channel)}</span>
                                  </div>
                                </td>

                                <td className="py-2.5 px-4 max-w-sm">
                                  <div className="font-semibold text-slate-900">{title}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {getCategoryLabel(log.category || log.messageType)}
                                  </div>
                                  {log.messagePreview && (
                                    <p
                                      className="text-[11px] text-slate-600 mt-1 line-clamp-2"
                                      title={log.messagePreview}
                                    >
                                      {log.messagePreview}
                                    </p>
                                  )}
                                  {log.failureReason && (
                                    <div className="text-[11px] text-red-600 mt-1">
                                      {log.failureReason}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-4">
                                  {log.recipientName && (
                                    <div className="font-medium text-slate-900">{log.recipientName}</div>
                                  )}
                                  <div className="font-mono-tabular text-slate-700">{log.recipient}</div>
                                  {log.providerMessageId && (
                                    <div className="text-[10px] text-slate-400 font-mono-tabular mt-0.5 truncate max-w-[160px]" title={log.providerMessageId}>
                                      ID: {log.providerMessageId}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-4 font-mono-tabular text-[11px] text-slate-600 whitespace-nowrap">
                                  {log.entityId && <div className="font-semibold text-slate-800">{log.entityId}</div>}
                                  {log.candidateId && <div>{log.candidateId}</div>}
                                  {log.enrollmentId && <div className="text-slate-400">{log.enrollmentId}</div>}
                                </td>

                                <td className="py-2.5 px-4 whitespace-nowrap">
                                  <StatusText status={log.deliveryStatus} />
                                  {typeof log.retryCount === 'number' && log.retryCount > 0 && (
                                    <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5">
                                      Retries: {log.retryCount}
                                    </div>
                                  )}
                                  {log.deliveredAt && (
                                    <div className="text-[10px] text-emerald-700 font-mono-tabular mt-0.5">
                                      {(log.deliveredAt || '').slice(0, 19).replace('T', ' ')}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-4 text-end whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    {log.attachmentFileId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void downloadProtectedFile(
                                            `/api/files/${encodeURIComponent(log.attachmentFileId!)}`,
                                            `${log.entityId || 'document'}.pdf`
                                          )
                                        }
                                        title={t('downloadPdf')}
                                        className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded hover:bg-slate-50"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {canRetry && (
                                      <button
                                        type="button"
                                        disabled={retryingId === log.id}
                                        onClick={() => void handleRetryLog(log)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        <RotateCcw className={`w-3 h-3 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                                        <span>{t('notifRetry')}</span>
                                      </button>
                                    )}
                                    {canManualShare && log.channel !== 'in_app' && (
                                      <button
                                        type="button"
                                        onClick={() => openManualFallback(log)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-50"
                                      >
                                        <Share2 className="w-3 h-3" />
                                        <span>{t('notifManualFallback')}</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* In-App Notifications Feed */}
              {viewScope !== 'logs' && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                    <h3 className="text-xs font-semibold text-slate-900">
                      {lang === 'ar'
                        ? `التنبيهات الداخلية داخل النظام (${filteredInApp.length})`
                        : `In-App Notifications Feed (${filteredInApp.length})`}
                    </h3>
                  </div>

                  {filteredInApp.length === 0 ? (
                    <div className="p-8">
                      <EmptyState
                        title={t('noRecords')}
                        description="Operational notifications for candidate registrations, enrollments, training cards, attendance alerts, exam results, and certificates appear here."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredInApp.map((n) => (
                        <div
                          key={n.id}
                          className={`p-4 flex items-start justify-between gap-4 ${
                            n.read ? 'bg-white' : 'bg-sky-50/40'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Bell
                              className={`w-4 h-4 mt-0.5 shrink-0 ${
                                n.read ? 'text-slate-400' : 'text-sky-700'
                              }`}
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-slate-900">
                                  {lang === 'ar' ? n.titleAr || n.titleEn : n.titleEn}
                                </span>
                                {(n.category || n.type) && (
                                  <span className="text-[10px] font-medium text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50">
                                    {getCategoryLabel(n.category || n.type)}
                                  </span>
                                )}
                                {n.deliveryStatus && <StatusText status={n.deliveryStatus} />}
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                {lang === 'ar' ? n.bodyAr || n.bodyEn : n.bodyEn}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono-tabular mt-1.5">
                                <span>{(n.createdAt || '').slice(0, 19).replace('T', ' ')}</span>
                                {n.candidateId && <span>Candidate: {n.candidateId}</span>}
                                {n.recipient && <span>To: {n.recipient}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {n.attachmentFileId && (
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadProtectedFile(
                                    `/api/files/${encodeURIComponent(n.attachmentFileId!)}`,
                                    `${n.candidateId || 'document'}.pdf`
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF</span>
                              </button>
                            )}
                            {!n.read && (
                              <button
                                type="button"
                                onClick={() => void markRead(n.id)}
                                className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                              >
                                {t('notifMarkRead')}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: COMPOSE & DISPATCH
      ===================================================================== */}
      {tab === 'compose' && canDispatch && (
        <form
          onSubmit={handleDispatch}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {lang === 'ar' ? 'فئة الإشعار' : 'Notification Category'} *
              </label>
              <select
                value={dispCategory}
                onChange={(e) => {
                  setDispCategory(e.target.value as NotificationCategory);
                  setDispTemplateId('');
                  setDispPreview(null);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {lang === 'ar' ? 'قناة الإرسال' : 'Delivery Channel'} *
              </label>
              <select
                value={dispChannel}
                onChange={(e) => setDispChannel(e.target.value as NotificationChannel)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="email">{t('notifChannel_email')}</option>
                <option value="whatsapp">{t('notifChannel_whatsapp')}</option>
                <option value="whatsapp_manual">{t('notifChannel_whatsapp_manual')}</option>
                <option value="in_app">{t('notifChannel_in_app')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {lang === 'ar' ? 'لغة الرسالة' : 'Message Language'}
              </label>
              <select
                value={dispLanguage}
                onChange={(e) => setDispLanguage(e.target.value as 'bilingual' | 'en' | 'ar')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="bilingual">{t('langModeBilingual')}</option>
                <option value="en">{t('langModeEnglish')}</option>
                <option value="ar">{t('langModeArabic')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {lang === 'ar' ? 'القالب المعتمد' : 'Message Template'}
              </label>
              <select
                value={dispTemplateId}
                onChange={(e) => {
                  setDispTemplateId(e.target.value);
                  setDispPreview(null);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="">Auto-match by Category</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.code} — {lang === 'ar' ? tpl.nameAr : tpl.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Context Entity Selectors */}
          <div className="p-4 border border-slate-200 rounded-md bg-slate-50/70 space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              {lang === 'ar'
                ? 'ربط السجل (اختياري — يعوض المتغيرات والمرفق تلقائياً بدون كشف بيانات الهوية الحساسة)'
                : 'Relational Record Context (Optional — auto-fills contact, placeholders & PDF attachment without PII)'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Candidate</label>
                <select
                  value={dispCandidateDocId}
                  onChange={(e) => setDispCandidateDocId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="">Select Candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.candidateId} — {c.fullNameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Enrollment</label>
                <select
                  value={dispEnrollmentId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDispEnrollmentId(id);
                    const enr = enrollments.find((x) => x.id === id);
                    if (enr) setDispCandidateDocId(enr.candidateDocId);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="">Select Enrollment...</option>
                  {enrollments.map((enr) => (
                    <option key={enr.id} value={enr.id}>
                      {enr.enrollmentNumber} ({enr.candidateId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Training Card</label>
                <select
                  value={dispCardId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDispCardId(id);
                    const card = trainingCards.find((x) => x.id === id);
                    if (card) {
                      setDispCandidateDocId(card.candidateDocId);
                      setDispEnrollmentId(card.enrollmentId);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="">Select Training Card...</option>
                  {trainingCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cardSerialNumber} — {c.snapshot.candidateNameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Certificate</label>
                <select
                  value={dispCertId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDispCertId(id);
                    const cert = certificates.find((x) => x.id === id);
                    if (cert) {
                      setDispCandidateDocId(cert.candidateDocId);
                      setDispEnrollmentId(cert.enrollmentId);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="">Select Certificate...</option>
                  {certificates.map((cert) => (
                    <option key={cert.id} value={cert.id}>
                      {cert.certificateNumber} — {cert.snapshot.candidateNameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {dispChannel === 'email'
                  ? 'Recipient Email *'
                  : dispChannel === 'whatsapp' || dispChannel === 'whatsapp_manual'
                    ? 'Recipient Mobile Number (with country code) *'
                    : 'Recipient Name / Target'}
              </label>
              <input
                required={dispChannel === 'email' || dispChannel === 'whatsapp'}
                value={dispRecipient}
                onChange={(e) => setDispRecipient(e.target.value)}
                placeholder={dispChannel === 'email' ? 'candidate@company.com' : '+9665XXXXXXXX'}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-5 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dispIncludeAttachment}
                  onChange={(e) => setDispIncludeAttachment(e.target.checked)}
                />
                <span>{t('notifAttachPdf')}</span>
              </label>
              {(dispChannel === 'whatsapp' || dispChannel === 'whatsapp_manual') && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dispUseMetaTemplate}
                    onChange={(e) => setDispUseMetaTemplate(e.target.checked)}
                  />
                  <span>{t('notifUseMetaTemplate')}</span>
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Subject / Title (English)
              </label>
              <input
                value={dispSubjectEn}
                onChange={(e) => setDispSubjectEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Subject / Title (Arabic)
              </label>
              <input
                dir="rtl"
                value={dispSubjectAr}
                onChange={(e) => setDispSubjectAr(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Message Body (English)
              </label>
              <textarea
                rows={4}
                value={dispBodyEn}
                onChange={(e) => setDispBodyEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Message Body (Arabic)
              </label>
              <textarea
                dir="rtl"
                rows={4}
                value={dispBodyAr}
                onChange={(e) => setDispBodyAr(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          {dispPreview && (
            <div className="p-4 border border-sky-200 bg-sky-50/50 rounded-md space-y-2 text-xs">
              <div className="font-semibold text-sky-900">
                {lang === 'ar' ? 'معاينة الرسالة النهائية:' : 'Rendered Message Preview:'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded">
                  <div className="font-semibold text-slate-900">{dispPreview.subjectEn}</div>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{dispPreview.bodyEn}</p>
                </div>
                <div dir="rtl" className="p-3 bg-white border border-slate-200 rounded">
                  <div className="font-semibold text-slate-900">{dispPreview.subjectAr}</div>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{dispPreview.bodyAr}</p>
                </div>
              </div>
              {dispPreview.attachmentFileId && (
                <div className="text-[11px] text-emerald-700 font-medium">
                  PDF Document linked ({dispPreview.attachmentFileId})
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handlePreviewCompose()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t('notifLivePreview')}</span>
            </button>

            <button
              type="submit"
              disabled={dispatching}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{dispatching ? t('loading') : t('notifSendDispatch')}</span>
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          TAB 3: BILINGUAL MESSAGE TEMPLATES MANAGER
      ===================================================================== */}
      {tab === 'templates' && canManageTemplates && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {templates.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={t('noRecords')}
                description="Bilingual English and Arabic WhatsApp/Email templates appear here."
                actionLabel={t('notifNewTemplate')}
                onAction={openCreateTemplate}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-4 text-start">Code</th>
                    <th className="py-2.5 px-4 text-start">Category</th>
                    <th className="py-2.5 px-4 text-start">Template Name (EN / AR)</th>
                    <th className="py-2.5 px-4 text-start">Meta WhatsApp</th>
                    <th className="py-2.5 px-4 text-start">Status</th>
                    <th className="py-2.5 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">
                        {tpl.code}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{getCategoryLabel(tpl.category)}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{tpl.nameEn}</div>
                        <div className="text-[11px] text-slate-500">{tpl.nameAr}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-[11px]">
                        {tpl.useApprovedMetaTemplate && tpl.whatsappTemplateName ? (
                          <span className="text-emerald-700 font-medium">
                            {tpl.whatsappTemplateName}
                          </span>
                        ) : (
                          <span className="text-slate-400">Text / Session</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText status={tpl.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="py-2.5 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditTemplate(tpl)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                            title={t('edit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {isTenantOwnerRole(role) && (
                            <button
                              type="button"
                              onClick={() => setDeleteTplTarget(tpl)}
                              className="p-1.5 text-slate-600 hover:text-red-700 rounded hover:bg-red-50"
                              title={t('delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MANUAL DOCUMENT & MESSAGE FALLBACK MODAL
      ===================================================================== */}
      <Modal
        open={Boolean(manualLog)}
        onClose={() => setManualLog(null)}
        title={t('notifManualFallbackTitle')}
        maxWidth="max-w-lg"
      >
        {manualLog && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">{t('notifManualFallbackDesc')}</p>

            <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Recipient:</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {manualLog.recipient}
                </span>
              </div>
              {manualLog.entityId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Related Entity:</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {manualLog.entityId}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Current Status:</span>
                <StatusText status={manualLog.deliveryStatus} />
              </div>
            </div>

            {manualLog.messagePreview && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">Rendered Message</label>
                  <button
                    type="button"
                    onClick={() => void handleCopyText('manual_msg', manualLog.messagePreview || '')}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedId === 'manual_msg' ? t('notifCopied') : t('notifCopyMessage')}</span>
                  </button>
                </div>
                <div className="p-3 border border-slate-200 rounded-md bg-white text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {manualLog.messagePreview}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {manualLog.attachmentFileId && (
                <button
                  type="button"
                  onClick={() =>
                    void downloadProtectedFile(
                      `/api/files/${encodeURIComponent(manualLog.attachmentFileId!)}`,
                      `${manualLog.entityId || 'document'}.pdf`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-800 rounded-md font-medium hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('downloadPdf')}</span>
                </button>
              )}

              <a
                href={
                  manualLog.manualUrl ||
                  buildWhatsappManualLink(
                    manualLog.recipient,
                    manualLog.messagePreview || manualLog.titleEn || ''
                  )
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white rounded-md font-medium hover:bg-emerald-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('notifOpenWhatsappWeb')}</span>
              </a>

              {manualLog.recipient.includes('@') && (
                <a
                  href={buildMailtoLink(
                    manualLog.recipient,
                    manualLog.titleEn || 'Training Center Notification',
                    manualLog.messagePreview || ''
                  )}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-800 rounded-md font-medium hover:bg-slate-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{t('notifOpenMailClient')}</span>
                </a>
              )}
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {t('notifManualNotesLabel')}
              </label>
              <input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="e.g. Sent PDF via official WhatsApp Desktop to candidate..."
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setManualLog(null)}
                className="px-4 py-2 border border-slate-200 rounded-md text-slate-700"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={submittingManual}
                onClick={() =>
                  void handleRecordManualShare(
                    manualLog.channel === 'email' ? 'email' : 'whatsapp_manual'
                  )
                }
                className="px-4 py-2 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {submittingManual ? t('loading') : t('notifConfirmManualShare')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =====================================================================
          CREATE / EDIT BILINGUAL TEMPLATE MODAL
      ===================================================================== */}
      <Modal
        open={tplModalOpen}
        onClose={() => setTplModalOpen(false)}
        title={editingTpl ? t('notifEditTemplate') : t('notifNewTemplate')}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Template Code *</label>
              <input
                required
                value={tplForm.code}
                onChange={(e) => setTplForm({ ...tplForm, code: e.target.value })}
                placeholder="TPL-CUSTOM-01"
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={tplForm.category}
                onChange={(e) =>
                  setTplForm({ ...tplForm, category: e.target.value as NotificationCategory })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={tplForm.isActive}
                  onChange={(e) => setTplForm({ ...tplForm, isActive: e.target.checked })}
                />
                <span>Active Template</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Template Name (EN) *</label>
              <input
                required
                value={tplForm.nameEn}
                onChange={(e) => setTplForm({ ...tplForm, nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Template Name (AR)</label>
              <input
                dir="rtl"
                value={tplForm.nameAr}
                onChange={(e) => setTplForm({ ...tplForm, nameAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Email Subject / Title (EN)</label>
              <input
                value={tplForm.subjectEn}
                onChange={(e) => setTplForm({ ...tplForm, subjectEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Email Subject / Title (AR)</label>
              <input
                dir="rtl"
                value={tplForm.subjectAr}
                onChange={(e) => setTplForm({ ...tplForm, subjectAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-600">
                {t('notifPlaceholdersHint')}
              </span>
              <span className="text-[11px] font-mono-tabular text-slate-700">
                Target: {activeBodyField === 'bodyEn' ? 'Body (EN)' : 'Body (AR)'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleInsertPlaceholder(chip)}
                  className="px-2 py-0.5 text-[11px] font-mono-tabular border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-100"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Message Body (EN) *</label>
              <textarea
                required
                rows={4}
                onFocus={() => setActiveBodyField('bodyEn')}
                value={tplForm.bodyEn}
                onChange={(e) => setTplForm({ ...tplForm, bodyEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Message Body (AR)</label>
              <textarea
                dir="rtl"
                rows={4}
                onFocus={() => setActiveBodyField('bodyAr')}
                value={tplForm.bodyAr}
                onChange={(e) => setTplForm({ ...tplForm, bodyAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="p-3 border border-slate-200 rounded-md space-y-3">
            <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={tplForm.useApprovedMetaTemplate}
                onChange={(e) =>
                  setTplForm({ ...tplForm, useApprovedMetaTemplate: e.target.checked })
                }
              />
              <span>{t('notifUseMetaTemplate')}</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t('notifMetaTemplateName')}
                </label>
                <input
                  value={tplForm.whatsappTemplateName}
                  onChange={(e) =>
                    setTplForm({ ...tplForm, whatsappTemplateName: e.target.value })
                  }
                  placeholder="tcms_certificate_issued"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Meta Language Code (EN)
                </label>
                <input
                  value={tplForm.whatsappLanguageEn}
                  onChange={(e) =>
                    setTplForm({ ...tplForm, whatsappLanguageEn: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Meta Language Code (AR)
                </label>
                <input
                  value={tplForm.whatsappLanguageAr}
                  onChange={(e) =>
                    setTplForm({ ...tplForm, whatsappLanguageAr: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded font-mono-tabular"
                />
              </div>
            </div>
          </div>

          {tplPreview && (
            <div className="p-3 border border-sky-200 bg-sky-50/50 rounded-md grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <div className="font-semibold text-slate-900">{tplPreview.subjectEn}</div>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap">{tplPreview.bodyEn}</p>
              </div>
              <div dir="rtl" className="bg-white p-2.5 rounded border border-slate-200">
                <div className="font-semibold text-slate-900">{tplPreview.subjectAr}</div>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap">{tplPreview.bodyAr}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handlePreviewTemplateModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t('notifLivePreview')}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTplModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={savingTpl}
                className="px-4 py-2 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {savingTpl ? t('loading') : t('save')}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTplTarget)}
        title={t('delete')}
        message={
          deleteTplTarget
            ? `Delete message template ${deleteTplTarget.code} (${deleteTplTarget.nameEn})?`
            : ''
        }
        danger
        onConfirm={() => void handleDeleteTemplate()}
        onCancel={() => setDeleteTplTarget(null)}
      />
    </div>
  );
}
