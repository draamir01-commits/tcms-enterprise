import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Plus, X, Save, Send, Copy, Check, Trash2 } from 'lucide-react';
import { apiFetch, uploadProtectedFile } from '../lib/api';
import { isSupportedBrandingImageFile, prepareBrandingImageFile } from '../lib/imageUpload';
import { useBranding } from '../contexts/BrandingContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  DEFAULT_COURSE_CATEGORIES,
  type CompanySettings,
  type NotificationCategory,
  type NotificationPreferences,
} from '../types/tcms';
import { ErrorAlert } from '../components/ui/UiKit';
import { BackgroundPreview } from '../branding';

const ALL_NOTIF_CATEGORIES: NotificationCategory[] = [
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

function createDefaultNotificationPrefs(): NotificationPreferences {
  const autoCategories = {} as NotificationPreferences['autoCategories'];
  for (const cat of ALL_NOTIF_CATEGORIES) {
    autoCategories[cat] = {
      email: ['enrollment_confirmation', 'certificate_pdf_delivery', 'certificate_expiry_reminder'].includes(cat),
      whatsapp: ['enrollment_confirmation', 'training_card_delivery', 'certificate_pdf_delivery', 'certificate_expiry_reminder'].includes(cat),
      inApp: true,
    };
  }
  return {
    enableAutoEmail: true,
    enableAutoWhatsapp: true,
    enableInApp: true,
    defaultRetryLimit: 3,
    expiryReminderDaysBefore: 30,
    autoCategories,
  };
}

export function CompanySettingsPage() {
  const { branding, logoUrl, stampUrl, signatureUrl, refreshBranding } = useBranding();
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<'branding' | 'integrations' | 'general'>('branding');
  const [form, setForm] = useState<CompanySettings>(branding);
  const [integrations, setIntegrations] = useState({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpFrom: '',
    smtpSenderName: '',
    smtpPass: '',
    hasSmtpPass: false,
    whatsappPhoneNumberId: '',
    whatsappBusinessAccountId: '',
    whatsappApiVersion: 'v21.0',
    whatsappAccessToken: '',
    hasWhatsappToken: false,
    whatsappWebhookVerifyToken: '',
    hasWebhookVerifyToken: false,
    whatsappAppSecret: '',
    hasWhatsappAppSecret: false,
    notificationPreferences: createDefaultNotificationPrefs(),
  });
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testWhatsappPhone, setTestWhatsappPhone] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [categories, setCategories] = useState<string[]>(DEFAULT_COURSE_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  const [retentionDays, setRetentionDays] = useState(1825);
  const [pdplDisclosureMode, setPdplDisclosureMode] = useState('full_name');

  const [saving, setSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<{
    logoFileId: string | null;
    stampFileId: string | null;
    signatureFileId: string | null;
  }>({
    logoFileId: null,
    stampFileId: null,
    signatureFileId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const formRef = useRef<CompanySettings>(branding);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    setForm(branding);
    formRef.current = branding;
  }, [branding]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(localPreviews)) {
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
      }
    };
  }, [localPreviews]);

  const loadSystemSettings = useCallback(async () => {
    try {
      const res = await apiFetch<{
        integrations: Partial<typeof integrations>;
        general: { courseCategories?: string[]; retentionDays?: number; pdplDisclosureMode?: string };
      }>('/api/system-settings');
      setIntegrations((prev) => ({
        ...prev,
        ...res.integrations,
        smtpPass: '',
        whatsappAccessToken: '',
        whatsappWebhookVerifyToken: '',
        whatsappAppSecret: '',
        notificationPreferences:
          res.integrations?.notificationPreferences || createDefaultNotificationPrefs(),
      }));
      if (res.general?.courseCategories) setCategories(res.general.courseCategories);
      if (res.general?.retentionDays) setRetentionDays(res.general.retentionDays);
      if (res.general?.pdplDisclosureMode) setPdplDisclosureMode(res.general.pdplDisclosureMode);
    } catch {
      // Defaults kept
    }
  }, []);

  useEffect(() => {
    void loadSystemSettings();
  }, [loadSystemSettings]);

  const ASSET_LABELS: Record<'logoFileId' | 'stampFileId' | 'signatureFileId', string> = {
    logoFileId: 'Company logo',
    stampFileId: 'Official company stamp',
    signatureFileId: 'Authorized signature',
  };

  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadStatusText, setUploadStatusText] = useState<Record<string, string>>({});
  const [uploadComplete, setUploadComplete] = useState<Record<string, boolean>>({});

  const handleAssetUpload = async (
    field: 'logoFileId' | 'stampFileId' | 'signatureFileId',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAsset(field);
    setUploadProgress((prev) => ({ ...prev, [field]: 25 }));
    setUploadStatusText((prev) => ({ ...prev, [field]: 'Preparing and optimizing image (any format/size)...' }));
    setUploadComplete((prev) => ({ ...prev, [field]: false }));
    setError(null);
    setSuccessMsg(null);
    let tempUrl: string | null = null;

    try {
      const preparedFile = await prepareBrandingImageFile(file);
      setUploadProgress((prev) => ({ ...prev, [field]: 60 }));
      setUploadStatusText((prev) => ({ ...prev, [field]: 'Encoding asset...' }));

      tempUrl = URL.createObjectURL(preparedFile);
      setLocalPreviews((prev) => {
        if (prev[field] && prev[field]!.startsWith('blob:')) URL.revokeObjectURL(prev[field]!);
        return { ...prev, [field]: tempUrl };
      });

      setUploadProgress((prev) => ({ ...prev, [field]: 85 }));
      setUploadStatusText((prev) => ({ ...prev, [field]: 'Uploading to secure vault...' }));

      const uploaded = await uploadProtectedFile(preparedFile, 'branding');
      const nextForm: CompanySettings = {
        ...formRef.current,
        [field]: uploaded.fileId,
      };
      formRef.current = nextForm;
      setForm(nextForm);

      await apiFetch('/api/company-settings', {
        method: 'PUT',
        body: JSON.stringify(nextForm),
      });
      await refreshBranding();

      setUploadProgress((prev) => ({ ...prev, [field]: 100 }));
      setUploadStatusText((prev) => ({ ...prev, [field]: 'Upload complete! Saved successfully.' }));
      setUploadComplete((prev) => ({ ...prev, [field]: true }));

      setLocalPreviews((prev) => {
        if (prev[field] && prev[field]!.startsWith('blob:')) URL.revokeObjectURL(prev[field]!);
        return { ...prev, [field]: null };
      });
      setSuccessMsg(`${ASSET_LABELS[field]} uploaded, saved, and synced to templates preview.`);
    } catch (err) {
      setUploadProgress((prev) => ({ ...prev, [field]: 0 }));
      setUploadStatusText((prev) => ({ ...prev, [field]: 'Upload failed.' }));
      setUploadComplete((prev) => ({ ...prev, [field]: false }));
      setLocalPreviews((prev) => {
        if (prev[field] && prev[field]!.startsWith('blob:')) URL.revokeObjectURL(prev[field]!);
        return { ...prev, [field]: null };
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleAssetRemove = async (field: 'logoFileId' | 'stampFileId' | 'signatureFileId') => {
    setUploadingAsset(field);
    setError(null);
    setSuccessMsg(null);
    try {
      const nextForm: CompanySettings = {
        ...formRef.current,
        [field]: '',
      };
      formRef.current = nextForm;
      setForm(nextForm);
      await apiFetch('/api/company-settings', {
        method: 'PUT',
        body: JSON.stringify(nextForm),
      });
      await refreshBranding();
      setLocalPreviews((prev) => ({ ...prev, [field]: null }));
      setSuccessMsg(`${ASSET_LABELS[field]} removed and saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/company-settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await refreshBranding();
      setSuccessMsg('Company branding and official assets saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/system-settings/integrations', {
        method: 'PUT',
        body: JSON.stringify(integrations),
      });
      setSuccessMsg('Email SMTP, WhatsApp Business Cloud API, and Notification Preferences saved securely.');
      await loadSystemSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; deliveryStatus: string; messageId?: string; error?: string }>(
        '/api/integrations/test-email',
        { method: 'POST', body: JSON.stringify({ to: testEmailTo.trim() || undefined }) }
      );
      if (res.ok) {
        setSuccessMsg(
          `SMTP test dispatched (status: ${res.deliveryStatus}${res.messageId ? `, ID: ${res.messageId}` : ''}).`
        );
      } else {
        setError(res.error || `SMTP test returned ${res.deliveryStatus}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestWhatsapp = async () => {
    if (!testWhatsappPhone.trim()) {
      setError('Enter a test recipient WhatsApp number with country code first.');
      return;
    }
    setTestingWhatsapp(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        mode: string;
        deliveryStatus: string;
        messageId?: string;
        error?: string;
      }>('/api/integrations/test-whatsapp', {
        method: 'POST',
        body: JSON.stringify({ toPhone: testWhatsappPhone.trim() }),
      });
      if (res.ok) {
        setSuccessMsg(
          `WhatsApp Cloud API test dispatched (status: ${res.deliveryStatus}${res.messageId ? `, ID: ${res.messageId}` : ''}).`
        );
      } else {
        setError(
          res.error ||
            `WhatsApp Cloud API test reported '${res.deliveryStatus}'. Manual share fallback logged.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const updatePrefGlobal = (
    field: 'enableAutoEmail' | 'enableAutoWhatsapp' | 'enableInApp' | 'defaultRetryLimit' | 'expiryReminderDaysBefore',
    value: boolean | number
  ) => {
    setIntegrations((prev) => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [field]: value,
      },
    }));
  };

  const updateCategoryPref = (
    cat: NotificationCategory,
    channel: 'inApp' | 'email' | 'whatsapp',
    checked: boolean
  ) => {
    setIntegrations((prev) => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        autoCategories: {
          ...prev.notificationPreferences.autoCategories,
          [cat]: {
            ...prev.notificationPreferences.autoCategories[cat],
            [channel]: checked,
          },
        },
      },
    }));
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/system-settings/general', {
        method: 'PUT',
        body: JSON.stringify({
          courseCategories: categories,
          retentionDays,
          pdplDisclosureMode,
        }),
      });
      setSuccessMsg('Course categories and PDPL retention settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setTab('branding')}
          className={`px-3.5 py-2 text-xs font-medium rounded-md ${
            tab === 'branding' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          Company Branding & Official Assets
        </button>
        <button
          type="button"
          onClick={() => setTab('integrations')}
          className={`px-3.5 py-2 text-xs font-medium rounded-md ${
            tab === 'integrations' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          Email SMTP & WhatsApp API
        </button>
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`px-3.5 py-2 text-xs font-medium rounded-md ${
            tab === 'general' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          Course Categories & PDPL Policy
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {successMsg && (
        <div className="px-4 py-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {successMsg}
        </div>
      )}

      {tab === 'branding' && (
        <form onSubmit={handleSaveBranding} className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Name (English)</label>
              <input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                placeholder="Enter registered training center name"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Name (Arabic)</label>
              <input
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                placeholder="اسم مركز التدريب بالعربية"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Legal Company Name</label>
              <input
                value={form.legalName || ''}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CR Number</label>
              <input
                value={form.crNumber || ''}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Training Center Address</label>
              <input
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number</label>
              <input
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Official Email</label>
              <input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Website</label>
              <input
                value={form.website || ''}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Authorized Signatory Name</label>
              <input
                value={form.signatoryName || ''}
                onChange={(e) => setForm({ ...form, signatoryName: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Primary Brand Color</label>
              <input
                type="color"
                value={form.primaryColor || '#0f172a'}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="w-full h-9 p-1 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Secondary Brand Color</label>
              <input
                type="color"
                value={form.secondaryColor || '#0284c7'}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="w-full h-9 p-1 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Certificate Footer Text</label>
              <input
                value={form.certificateFooter || ''}
                onChange={(e) => setForm({ ...form, certificateFooter: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Training Card Footer Text</label>
              <input
                value={form.cardFooter || ''}
                onChange={(e) => setForm({ ...form, cardFooter: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          {/* Official Image Uploads */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="text-xs text-slate-500">
              Upload official images of any file size or resolution (PNG, JPG, WEBP, SVG, GIF, BMP, TIFF, AVIF). Assets save automatically and appear immediately on training cards and certificates.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  { title: 'Company Logo', field: 'logoFileId', currentUrl: logoUrl },
                  { title: 'Official Company Stamp', field: 'stampFileId', currentUrl: stampUrl },
                  { title: 'Authorized Signature', field: 'signatureFileId', currentUrl: signatureUrl },
                ] as const
              ).map(({ title, field, currentUrl }) => {
                const isUploading = uploadingAsset === field;
                const progress = uploadProgress[field] || 0;
                const statusText = uploadStatusText[field] || '';
                const isComplete = uploadComplete[field] || Boolean(form[field]);
                const preview = localPreviews[field] || currentUrl;

                return (
                  <div key={field} className="border border-slate-200 rounded-md p-4 space-y-3 bg-white shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{title}</span>
                      {isComplete && !isUploading && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Upload Complete
                        </span>
                      )}
                    </div>

                    {preview && (
                      <div className="relative bg-slate-50 border border-slate-100 rounded p-2 flex items-center justify-center h-20">
                        <img
                          src={preview}
                          alt={title}
                          className="h-16 max-w-full object-contain"
                        />
                      </div>
                    )}

                    {isUploading && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                          <span>{statusText || 'Uploading...'}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-sky-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded cursor-pointer hover:bg-slate-50 transition-colors">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span>{isUploading ? 'Processing...' : `Upload ${title} (Any Format/Size)`}</span>
                        <input
                          type="file"
                          accept="*/*"
                          disabled={isUploading}
                          onChange={(e) => void handleAssetUpload(field, e)}
                          className="hidden"
                        />
                      </label>
                      {form[field] && !isUploading && (
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => void handleAssetRemove(field)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {lang === 'ar'
                  ? 'معاينة الخلفيات الرسومية على الشهادات والبطاقات'
                  : 'Interactive Background Preview Studio'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'ar'
                  ? 'استعرض 12 تصميماً احترافياً من مكتبة الخلفيات المركزية وبدّل بينها لمعاينة ظهورها مباشرة مع شعار المركز وبيانات القالب.'
                  : 'Toggle between all 12 designs from CertificateBackgroundLibrary to inspect how each background looks applied to your certificate and training card templates.'}
              </p>
            </div>
            <BackgroundPreview
              initialTarget="certificate"
              initialOrientation="landscape"
              allowTargetSwitch
              lang={lang}
              templateSample={{
                centerNameEn: form.nameEn || undefined,
                centerNameAr: form.nameAr || undefined,
                logoUrl: localPreviews.logoFileId || logoUrl,
                stampUrl: localPreviews.stampFileId || stampUrl,
                signatureUrl: localPreviews.signatureFileId || signatureUrl,
                signatoryName: form.signatoryName || undefined,
                footerText: form.certificateFooter || undefined,
              }}
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Company Branding'}</span>
            </button>
          </div>
        </form>
      )}

      {tab === 'integrations' && (
        <form onSubmit={handleSaveIntegrations} className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          {/* SMTP Configuration */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Transactional Email (SMTP)</h3>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="test-recipient@domain.com"
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md w-48"
                />
                <button
                  type="button"
                  disabled={testingEmail}
                  onClick={() => void handleTestEmail()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{testingEmail ? 'Testing...' : 'Test Email'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SMTP Host</label>
                <input
                  value={integrations.smtpHost}
                  onChange={(e) => setIntegrations({ ...integrations, smtpHost: e.target.value })}
                  placeholder="smtp.office365.com"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={integrations.smtpPort}
                  onChange={(e) => setIntegrations({ ...integrations, smtpPort: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sender Display Name</label>
                <input
                  value={integrations.smtpSenderName}
                  onChange={(e) => setIntegrations({ ...integrations, smtpSenderName: e.target.value })}
                  placeholder={form.nameEn || 'Training Center'}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">From Address</label>
                <input
                  value={integrations.smtpFrom}
                  onChange={(e) => setIntegrations({ ...integrations, smtpFrom: e.target.value })}
                  placeholder="training@company.sa"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SMTP Username</label>
                <input
                  value={integrations.smtpUser}
                  onChange={(e) => setIntegrations({ ...integrations, smtpUser: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  SMTP Password {integrations.hasSmtpPass ? '(Configured — leave blank to keep)' : ''}
                </label>
                <input
                  type="password"
                  value={integrations.smtpPass}
                  onChange={(e) => setIntegrations({ ...integrations, smtpPass: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex items-center pt-1 md:col-span-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={integrations.smtpSecure}
                    onChange={(e) => setIntegrations({ ...integrations, smtpSecure: e.target.checked })}
                  />
                  <span>Use TLS/SSL (Port 465)</span>
                </label>
              </div>
            </div>
          </div>

          {/* WhatsApp Business Cloud API Configuration */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Official WhatsApp Business Cloud API</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={testWhatsappPhone}
                  onChange={(e) => setTestWhatsappPhone(e.target.value)}
                  placeholder="+9665XXXXXXXX"
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular w-40"
                />
                <button
                  type="button"
                  disabled={testingWhatsapp}
                  onClick={() => void handleTestWhatsapp()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{testingWhatsapp ? 'Testing...' : 'Test WhatsApp'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number ID</label>
                <input
                  value={integrations.whatsappPhoneNumberId}
                  onChange={(e) => setIntegrations({ ...integrations, whatsappPhoneNumberId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business Account ID (WABA)</label>
                <input
                  value={integrations.whatsappBusinessAccountId}
                  onChange={(e) => setIntegrations({ ...integrations, whatsappBusinessAccountId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Graph API Version</label>
                <input
                  value={integrations.whatsappApiVersion}
                  onChange={(e) => setIntegrations({ ...integrations, whatsappApiVersion: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Access Token {integrations.hasWhatsappToken ? '(Configured — leave blank to keep)' : ''}
                </label>
                <input
                  type="password"
                  value={integrations.whatsappAccessToken}
                  onChange={(e) => setIntegrations({ ...integrations, whatsappAccessToken: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Webhook Verify Token {integrations.hasWebhookVerifyToken ? '(Configured)' : ''}
                </label>
                <input
                  type="password"
                  value={integrations.whatsappWebhookVerifyToken}
                  onChange={(e) =>
                    setIntegrations({ ...integrations, whatsappWebhookVerifyToken: e.target.value })
                  }
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meta App Secret (HMAC) {integrations.hasWhatsappAppSecret ? '(Configured)' : ''}
                </label>
                <input
                  type="password"
                  value={integrations.whatsappAppSecret}
                  onChange={(e) => setIntegrations({ ...integrations, whatsappAppSecret: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
            </div>

            <div className="p-3 border border-slate-200 bg-slate-50 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-medium text-slate-700">Meta Webhook Callback URL: </span>
                <span className="font-mono-tabular text-slate-900">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/api/webhooks/whatsapp`;
                  void navigator.clipboard.writeText(url);
                  setCopiedWebhook(true);
                  setTimeout(() => setCopiedWebhook(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white rounded text-slate-700 hover:bg-slate-100"
              >
                {copiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWebhook ? 'Copied' : 'Copy Callback URL'}</span>
              </button>
            </div>
          </div>

          {/* Notification Preferences Matrix */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Automated Notification & Document Delivery Preferences
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure which events trigger automated Email, WhatsApp Cloud API, and In-App notifications. Delivery status updates to Delivered strictly upon verified provider receipt confirmation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border border-slate-200 rounded-md bg-slate-50/70 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={integrations.notificationPreferences.enableInApp}
                  onChange={(e) => updatePrefGlobal('enableInApp', e.target.checked)}
                />
                <span>Enable In-App Alerts</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={integrations.notificationPreferences.enableAutoEmail}
                  onChange={(e) => updatePrefGlobal('enableAutoEmail', e.target.checked)}
                />
                <span>Enable Auto Email</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={integrations.notificationPreferences.enableAutoWhatsapp}
                  onChange={(e) => updatePrefGlobal('enableAutoWhatsapp', e.target.checked)}
                />
                <span>Enable Auto WhatsApp</span>
              </label>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Default Retry Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={integrations.notificationPreferences.defaultRetryLimit}
                  onChange={(e) => updatePrefGlobal('defaultRetryLimit', Number(e.target.value))}
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Cert Expiry Lead (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={integrations.notificationPreferences.expiryReminderDaysBefore}
                  onChange={(e) =>
                    updatePrefGlobal('expiryReminderDaysBefore', Number(e.target.value))
                  }
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded font-mono-tabular"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2 px-4 text-start">Notification Category</th>
                    <th className="py-2 px-4 text-center">In-App</th>
                    <th className="py-2 px-4 text-center">Email (SMTP)</th>
                    <th className="py-2 px-4 text-center">WhatsApp Cloud API</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ALL_NOTIF_CATEGORIES.map((cat) => {
                    const pref = integrations.notificationPreferences.autoCategories?.[cat] || {
                      inApp: true,
                      email: false,
                      whatsapp: false,
                    };
                    const catLabel = t(`notifCat_${cat}`);
                    return (
                      <tr key={cat} className="hover:bg-slate-50/70">
                        <td className="py-2 px-4 font-medium text-slate-800">
                          {catLabel !== `notifCat_${cat}` ? catLabel : cat.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.inApp}
                            onChange={(e) => updateCategoryPref(cat, 'inApp', e.target.checked)}
                          />
                        </td>
                        <td className="py-2 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.email}
                            onChange={(e) => updateCategoryPref(cat, 'email', e.target.checked)}
                          />
                        </td>
                        <td className="py-2 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.whatsapp}
                            onChange={(e) => updateCategoryPref(cat, 'whatsapp', e.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Integration & Notification Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {tab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Configurable Course Categories</h3>
            <div className="flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Add new course category..."
                className="flex-1 max-w-sm px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = newCategory.trim();
                  if (trimmed && !categories.includes(trimmed)) {
                    setCategories([...categories, trimmed]);
                    setNewCategory('');
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('add')}</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {categories.map((cat) => (
                <div
                  key={cat}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 rounded bg-slate-50 text-slate-800"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => setCategories(categories.filter((c) => c !== cat))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PDPL Data Retention Period (Days)</label>
              <input
                type="number"
                min={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Public Verification Name Disclosure</label>
              <select
                value={pdplDisclosureMode}
                onChange={(e) => setPdplDisclosureMode(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              >
                <option value="full_name">Full Candidate Name (Zero-PII Verification Standard)</option>
                <option value="initials">Initials Only</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Policy & Categories'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
