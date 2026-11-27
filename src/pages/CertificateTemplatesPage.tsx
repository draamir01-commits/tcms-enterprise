import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Edit2,
  CheckCircle2,
  Upload,
  Trash2,
  Eye,
  Power,
  Star,
  LayoutGrid,
} from 'lucide-react';
import { apiFetch, fetchBinaryPost, uploadProtectedFile } from '../lib/api';
import { auth } from '../firebase';
import { isSupportedBrandingImageFile, prepareBrandingImageFile } from '../lib/imageUpload';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useLanguage } from '../contexts/LanguageContext';
import { hasPermission, isTenantAdminRole } from '../lib/permissions';
import type {
  CertCanvasElement,
  CertElementType,
  CertFieldKey,
  CertLanguageMode,
  CertificateTemplate,
  CertificateTemplateConfig,
  Course,
} from '../types/tcms';
import {
  EmptyState,
  ErrorAlert,
  Modal,
  PdfPreviewModal,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import {
  CERT_FIELD_LABELS,
  CertificateDesignerCanvas,
  buildDefaultCertCanvasElements,
} from '../components/certificates/CertificateDesignerCanvas';
import {
  BackgroundGalleryPicker,
  BackgroundPreview,
  certificateBackgroundLibrary,
  type BackgroundPreset,
} from '../branding';

const DEFAULT_CERT_CONFIG: CertificateTemplateConfig = {
  headingEn: 'CERTIFICATE OF COMPLETION',
  headingAr: 'شهادة إتمام تدريب',
  subHeadingEn: 'This is to certify that',
  subHeadingAr: 'تشهد إدارة المركز بأن المتدرب',
  accentColor: '#0284c7',
  borderColor: '#0f172a',
  borderStyle: 'classic',
  showLogo: true,
  showStamp: true,
  showSignature: true,
  showQr: true,
  showArabic: true,
  showEnglish: true,
  showCandidatePhoto: false,
  footerText: 'Verified electronically via official QR portal.',
  backgroundStyle: 'framed',
  languageMode: 'bilingual',
  useCustomLayout: true,
  elements: buildDefaultCertCanvasElements('bilingual'),
};

type AssetUploadTarget =
  | 'backgroundImageFileId'
  | 'customLogoFileId'
  | 'customSignatureFileId'
  | 'customStampFileId';

export function CertificateTemplatesPage() {
  const { profile, roleMatrix } = useAuth();
  const { branding, logoUrl, stampUrl, signatureUrl } = useBranding();
  const { lang, t } = useLanguage();

  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'common' | 'course'>('common');
  const [courseId, setCourseId] = useState('');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [languageMode, setLanguageMode] = useState<CertLanguageMode>('bilingual');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<CertificateTemplateConfig>(DEFAULT_CERT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<AssetUploadTarget | null>(null);

  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [addFieldKey, setAddFieldKey] = useState<CertFieldKey>('candidateNameEn');
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [bgPreviewOpen, setBgPreviewOpen] = useState(false);

  const canDesign =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'settings', 'edit', roleMatrix) ||
    hasPermission(profile, 'certificates', 'edit', roleMatrix);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, crsRes] = await Promise.all([
        apiFetch<{ templates: CertificateTemplate[] }>('/api/templates/certificates'),
        apiFetch<{ courses: Course[] }>('/api/courses'),
      ]);
      setTemplates(tplRes.templates);
      setCourses(crsRes.courses);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const openNew = () => {
    const borderCol = branding.primaryColor || '#0f172a';
    const accCol = branding.secondaryColor || '#0284c7';
    setEditingId(undefined);
    setName(lang === 'ar' ? 'قالب الشهادة الرسمي ثنائي اللغة' : 'Standard Bilingual Certificate');
    setScope('common');
    setCourseId(courses[0]?.id || '');
    setOrientation('landscape');
    setLanguageMode('bilingual');
    setIsDefault(templates.length === 0);
    setIsActive(true);
    setSelectedElId(null);
    setConfig({
      ...DEFAULT_CERT_CONFIG,
      accentColor: accCol,
      borderColor: borderCol,
      footerText: branding.certificateFooter || DEFAULT_CERT_CONFIG.footerText,
      elements: buildDefaultCertCanvasElements('bilingual', borderCol, accCol, false),
    });
    setFormOpen(true);
  };

  const openEdit = (tpl: CertificateTemplate) => {
    const mode = tpl.languageMode || tpl.config?.languageMode || 'bilingual';
    const borderCol = tpl.config?.borderColor || branding.primaryColor || '#0f172a';
    const accCol = tpl.config?.accentColor || branding.secondaryColor || '#0284c7';
    setEditingId(tpl.id);
    setName(tpl.name);
    setScope(tpl.scope);
    setCourseId(tpl.courseId || '');
    setOrientation(tpl.orientation);
    setLanguageMode(mode);
    setIsDefault(tpl.isDefault);
    setIsActive(tpl.isActive !== false);
    setSelectedElId(null);
    setConfig({
      ...DEFAULT_CERT_CONFIG,
      ...tpl.config,
      languageMode: mode,
      elements:
        Array.isArray(tpl.config?.elements) && tpl.config.elements.length > 0
          ? tpl.config.elements
          : buildDefaultCertCanvasElements(
              mode,
              borderCol,
              accCol,
              Boolean(tpl.config?.showCandidatePhoto)
            ),
    });
    setFormOpen(true);
  };

  const handleLanguageModeChange = (nextMode: CertLanguageMode) => {
    setLanguageMode(nextMode);
    setConfig((prev) => ({
      ...prev,
      languageMode: nextMode,
      showEnglish: nextMode !== 'ar',
      showArabic: nextMode !== 'en',
    }));
  };

  const handleResetCanvasLayout = () => {
    setConfig((prev) => ({
      ...prev,
      useCustomLayout: true,
      elements: buildDefaultCertCanvasElements(
        languageMode,
        prev.borderColor,
        prev.accentColor,
        Boolean(prev.showCandidatePhoto)
      ),
    }));
    setSelectedElId(null);
  };

  const handleAssetUpload = async (target: AssetUploadTarget, file: File | undefined) => {
    if (!file) return;
    if (!isSupportedBrandingImageFile(file)) {
      setError('Please select a valid image file (PNG, JPG, WEBP, SVG, GIF, BMP, TIFF, or AVIF).');
      return;
    }
    setUploadingAsset(target);
    setError(null);
    try {
      const prepared = await prepareBrandingImageFile(file);
      const uploaded = await uploadProtectedFile(prepared, 'branding', {
        purpose: `cert_${target}`,
      });
      setConfig((prev) => ({
        ...prev,
        [target]: uploaded.fileId,
        ...(target === 'backgroundImageFileId' ? { backgroundPresetId: undefined } : {}),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleSelectBackgroundPreset = (preset: BackgroundPreset, syncPalette: boolean) => {
    setConfig((prev) => {
      const nextElements = syncPalette
        ? (prev.elements || []).map((el) => {
            if (el.type !== 'text') return el;
            const isPrimary =
              el.fieldKey === 'candidateNameEn' ||
              el.fieldKey === 'candidateNameAr' ||
              el.fieldKey === 'certTitle' ||
              el.fieldKey === 'signatoryName' ||
              el.fieldKey === 'certificateNumber';
            const isAccent =
              el.fieldKey === 'centerName' ||
              el.fieldKey === 'certTitleAr' ||
              el.fieldKey === 'courseTitleEn' ||
              el.fieldKey === 'courseTitleAr';
            return {
              ...el,
              color: isAccent
                ? preset.recommendedAccentColor
                : isPrimary
                ? preset.recommendedTextColor
                : preset.recommendedSecondaryTextColor,
            };
          })
        : prev.elements;

      return {
        ...prev,
        backgroundPresetId: preset.id,
        backgroundImageFileId: undefined,
        ...(syncPalette
          ? {
              borderStyle: 'minimal',
              accentColor: preset.recommendedAccentColor,
              borderColor: preset.recommendedBorderColor,
              elements: nextElements,
            }
          : {}),
      };
    });
  };

  const addCanvasElement = (type: CertElementType, fieldKey?: CertFieldKey) => {
    const newId = `cert-el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isImage = type !== 'text';
    const isArField =
      fieldKey === 'candidateNameAr' ||
      fieldKey === 'courseTitleAr' ||
      fieldKey === 'centerNameAr' ||
      fieldKey === 'certTitleAr' ||
      fieldKey === 'subHeadingAr';
    const nextEl: CertCanvasElement = {
      id: newId,
      type,
      ...(type === 'text' ? { fieldKey: fieldKey || 'customText' } : {}),
      label:
        type === 'text'
          ? CERT_FIELD_LABELS[fieldKey || 'customText']?.en
          : type.toUpperCase(),
      ...(fieldKey === 'customText' ? { customText: 'Accredited Certificate' } : {}),
      xPct: 20,
      yPct: 45,
      wPct: isImage ? 12 : 60,
      hPct: isImage ? 14 : 6,
      fontSize: 12,
      fontWeight: 'normal',
      fontFamily: isArField ? 'arabic' : 'sans',
      color: '#0f172a',
      align: 'center',
      visible: true,
    };
    setConfig((prev) => ({
      ...prev,
      useCustomLayout: true,
      elements: [...(prev.elements || []), nextEl],
    }));
    setSelectedElId(newId);
  };

  const updateSelectedElement = (patch: Partial<CertCanvasElement>) => {
    if (!selectedElId) return;
    setConfig((prev) => ({
      ...prev,
      elements: (prev.elements || []).map((el) =>
        el.id === selectedElId ? { ...el, ...patch } : el
      ),
    }));
  };

  const handlePreviewPdf = async (tplOverride?: CertificateTemplate) => {
    setPreviewing(true);
    setError(null);
    try {
      const tplPayload: Partial<CertificateTemplate> = tplOverride || {
        name: name || 'Preview Certificate',
        scope,
        orientation,
        languageMode,
        config: { ...config, languageMode },
      };
      const blob = await fetchBinaryPost('/api/templates/certificates/preview', { template: tplPayload });
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/templates/certificates', {
        method: 'POST',
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name,
          scope,
          ...(scope === 'course' ? { courseId } : {}),
          orientation,
          languageMode,
          isDefault,
          isActive: isDefault ? true : isActive,
          config: { ...config, languageMode },
        }),
      });
      setFormOpen(false);
      setSuccessMsg(
        lang === 'ar'
          ? 'تم حفظ قالب الشهادة بنجاح.'
          : 'Certificate template saved successfully.'
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (
    tpl: CertificateTemplate,
    payload: { isActive?: boolean; isDefault?: boolean }
  ) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/api/templates/certificates/${encodeURIComponent(tpl.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const selectedElement = (config.elements || []).find((el) => el.id === selectedElId) || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-slate-500 max-w-2xl">{t('certDesignerSubtitle')}</p>
        {canDesign && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('newCertTemplate')}</span>
          </button>
        )}
      </div>

      <div className="px-4 py-2.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
        {t('certHistoricalNotice')}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {successMsg && (
        <div className="px-4 py-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {successMsg}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : templates.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description={t('certDesignerSubtitle')}
          actionLabel={canDesign ? t('newCertTemplate') : undefined}
          onAction={canDesign ? openNew : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const activeFlag = tpl.isActive !== false;
            const tplLang = tpl.languageMode || tpl.config?.languageMode || 'bilingual';
            return (
              <div key={tpl.id} className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{tpl.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {tpl.scope === 'course'
                        ? `Course: ${courseMap.get(tpl.courseId || '')?.titleEn || tpl.courseId}`
                        : t('scopeCommonDefault')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handlePreviewPdf(tpl)}
                      title={t('previewSamplePdfBtn')}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canDesign && (
                      <button
                        type="button"
                        onClick={() => openEdit(tpl)}
                        title={t('editCertTemplate')}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span className="capitalize font-mono-tabular">
                    A4 {tpl.orientation} · v{tpl.version}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {tplLang === 'ar'
                      ? t('langModeArabic')
                      : tplLang === 'en'
                      ? t('langModeEnglish')
                      : t('langModeBilingual')}
                  </span>
                </div>

                {tpl.config?.backgroundPresetId && (() => {
                  const preset = certificateBackgroundLibrary.getPresetById(tpl.config.backgroundPresetId);
                  const thumb = certificateBackgroundLibrary.getSvgDataUri(tpl.config.backgroundPresetId, {
                    target: 'certificate',
                    orientation: tpl.orientation,
                  });
                  if (!preset) return null;
                  return (
                    <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                      {thumb && (
                        <img
                          src={thumb}
                          alt={lang === 'ar' ? preset.nameAr : preset.nameEn}
                          className="w-12 h-8 rounded border border-slate-200 object-cover shrink-0"
                        />
                      )}
                      <span className="text-[11px] text-slate-600 truncate">
                        {lang === 'ar' ? preset.nameAr : preset.nameEn}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <StatusText status={activeFlag ? 'active' : 'inactive'} />
                    {tpl.isDefault && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Default
                      </span>
                    )}
                  </div>
                  {canDesign && !tpl.isDefault && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate(tpl, { isDefault: true, isActive: true })}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                      >
                        <Star className="w-3 h-3" />
                        <span>{t('setDefaultTemplateBtn')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate(tpl, { isActive: !activeFlag })}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                      >
                        <Power className="w-3 h-3" />
                        <span>{activeFlag ? t('deactivateTemplateBtn') : t('activateTemplateBtn')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? t('editCertTemplate') : t('newCertTemplate')}
        maxWidth="max-w-7xl"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Settings Column */}
          <div className="xl:col-span-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('templateNameLabel')} *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('templateScopeLabel')}
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'common' | 'course')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="common">{t('scopeCommonDefault')}</option>
                  <option value="course">{t('scopeCourseSpecific')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('orientationLabel')}
                </label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="landscape">{t('orientationLandscape')}</option>
                  <option value="portrait">{t('orientationPortrait')}</option>
                </select>
              </div>

              {scope === 'course' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t('targetCourse')} *
                  </label>
                  <select
                    required
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  >
                    <option value="">Select Course...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.courseCode} — {c.titleEn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('languageLayoutLabel')}
                </label>
                <select
                  value={languageMode}
                  onChange={(e) => handleLanguageModeChange(e.target.value as CertLanguageMode)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="bilingual">{t('langModeBilingual')}</option>
                  <option value="en">{t('langModeEnglish')}</option>
                  <option value="ar">{t('langModeArabic')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('designerModeLabel')}
                </label>
                <select
                  value={config.useCustomLayout ? 'visual' : 'classic'}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      useCustomLayout: e.target.value === 'visual',
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="visual">{t('designerModeVisual')}</option>
                  <option value="classic">{t('designerModeClassic')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('certHeadingEnLabel')}
                </label>
                <input
                  value={config.headingEn}
                  onChange={(e) => setConfig({ ...config, headingEn: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('certHeadingArLabel')}
                </label>
                <input
                  dir="rtl"
                  value={config.headingAr}
                  onChange={(e) => setConfig({ ...config, headingAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('certSubHeadingEnLabel')}
                </label>
                <input
                  value={config.subHeadingEn}
                  onChange={(e) => setConfig({ ...config, subHeadingEn: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('certSubHeadingArLabel')}
                </label>
                <input
                  dir="rtl"
                  value={config.subHeadingAr}
                  onChange={(e) => setConfig({ ...config, subHeadingAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Border Style</label>
                <select
                  value={config.borderStyle}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      borderStyle: e.target.value as CertificateTemplateConfig['borderStyle'],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="classic">Classic Double Frame</option>
                  <option value="modern">Modern Single Frame</option>
                  <option value="minimal">Borderless / Full Bleed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Background Style</label>
                <select
                  value={config.backgroundStyle}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      backgroundStyle: e.target.value as CertificateTemplateConfig['backgroundStyle'],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                >
                  <option value="framed">White</option>
                  <option value="tinted">Subtle Tint</option>
                  <option value="clean">Clean</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Border Color</label>
                <input
                  type="color"
                  value={config.borderColor}
                  onChange={(e) => setConfig({ ...config, borderColor: e.target.value })}
                  className="w-full h-9 p-1 border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Accent Color</label>
                <input
                  type="color"
                  value={config.accentColor}
                  onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                  className="w-full h-9 p-1 border border-slate-200 rounded-md"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('certFooterLabel')}
                </label>
                <input
                  value={config.footerText}
                  onChange={(e) => setConfig({ ...config, footerText: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
            </div>

            {/* Graphic Background Library */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setBgPreviewOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-100 whitespace-nowrap"
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>
                    {lang === 'ar' ? 'معاينة جميع الخلفيات على القالب' : 'Compare All on Template'}
                  </span>
                </button>
              </div>
              <BackgroundGalleryPicker
                target="certificate"
                orientation={orientation}
                selectedPresetId={config.backgroundPresetId}
                hasCustomImage={Boolean(config.backgroundImageFileId)}
                onSelectPreset={handleSelectBackgroundPreset}
                onClearPreset={() => setConfig((prev) => ({ ...prev, backgroundPresetId: undefined }))}
                lang={lang}
                columns={3}
              />
            </div>

            {/* Template Asset Uploads (Background, Logo, Signature, Stamp) */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-700">
                {lang === 'ar' ? 'الأصول والخلفيات المخصصة للقالب' : 'Template Assets & Overrides'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {(
                  [
                    ['backgroundImageFileId', t('certBackgroundLabel')],
                    ['customLogoFileId', t('customLogoLabel')],
                    ['customSignatureFileId', t('customSignatureLabel')],
                    ['customStampFileId', t('customStampLabel')],
                  ] as Array<[AssetUploadTarget, string]>
                ).map(([field, label]) => {
                  const hasFile = Boolean(config[field]);
                  return (
                    <div
                      key={field}
                      className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2.5 py-1.5"
                    >
                      <span className="text-[11px] text-slate-700 truncate">{label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <label className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>{uploadingAsset === field ? '...' : t('uploadAssetBtn')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => void handleAssetUpload(field, e.target.files?.[0])}
                          />
                        </label>
                        {hasFile && (
                          <button
                            type="button"
                            title={t('resetAssetBtn')}
                            onClick={() => setConfig((prev) => ({ ...prev, [field]: undefined }))}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visibility Toggles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
              {(
                [
                  ['showLogo', t('elem_logo')],
                  ['showStamp', t('elem_stamp')],
                  ['showSignature', t('elem_signature')],
                  ['showQr', t('elem_qr')],
                  ['showCandidatePhoto', t('showCandidatePhotoLabel')],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              ))}
              <label className="inline-flex items-center gap-2 font-medium text-slate-900">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>{t('setDefaultTemplateBtn')}</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={previewing}
                onClick={() => void handlePreviewPdf()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{previewing ? t('loading') : t('previewSamplePdfBtn')}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-xs border border-slate-200 rounded-md"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
                >
                  {saving ? 'Saving...' : t('save')}
                </button>
              </div>
            </div>
          </div>

          {/* Right Visual Designer / Preview Column */}
          <div className="xl:col-span-7 bg-slate-100 p-4 rounded-lg space-y-3">
            {config.useCustomLayout ? (
              <>
                {/* Element Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-md p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={addFieldKey}
                      onChange={(e) => setAddFieldKey(e.target.value as CertFieldKey)}
                      className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                    >
                      {(Object.keys(CERT_FIELD_LABELS) as CertFieldKey[]).map((fk) => (
                        <option key={fk} value={fk}>
                          {t(`certField_${fk}`) || CERT_FIELD_LABELS[fk][lang]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('text', addFieldKey)}
                      className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                    >
                      + {t('add')}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('logo')}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                    >
                      + {t('elem_logo')}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('photo')}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                    >
                      + {t('elem_photo')}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('qr')}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                    >
                      + {t('elem_qr')}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('signature')}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                    >
                      + {t('elem_signature')}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('stamp')}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50"
                    >
                      + {t('elem_stamp')}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetCanvasLayout}
                    className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                  >
                    {t('resetCanvasLayoutBtn')}
                  </button>
                </div>

                <CertificateDesignerCanvas
                  config={config}
                  orientation={orientation}
                  selectedId={selectedElId}
                  onSelect={setSelectedElId}
                  onChangeElements={(next) => setConfig((prev) => ({ ...prev, elements: next }))}
                  logoUrl={logoUrl}
                  stampUrl={stampUrl}
                  signatureUrl={signatureUrl}
                  centerNameEn={branding.nameEn}
                  centerNameAr={branding.nameAr}
                  signatoryName={branding.signatoryName}
                  lang={lang}
                />

                {/* Selected Element Inspector */}
                {selectedElement ? (
                  <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span>
                        {t('elementPropertiesLabel')}: {selectedElement.label || selectedElement.type}
                      </span>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-normal text-slate-600">
                        <input
                          type="checkbox"
                          checked={selectedElement.visible}
                          onChange={(e) => updateSelectedElement({ visible: e.target.checked })}
                        />
                        <span>Visible</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] text-slate-500">X (%)</label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={95}
                          value={selectedElement.xPct}
                          onChange={(e) => updateSelectedElement({ xPct: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-200 rounded font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Y (%)</label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={95}
                          value={selectedElement.yPct}
                          onChange={(e) => updateSelectedElement({ yPct: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-200 rounded font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">W (%)</label>
                        <input
                          type="number"
                          step="0.5"
                          min={5}
                          max={100}
                          value={selectedElement.wPct}
                          onChange={(e) => updateSelectedElement({ wPct: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-200 rounded font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">H (%)</label>
                        <input
                          type="number"
                          step="0.5"
                          min={3.5}
                          max={100}
                          value={selectedElement.hPct}
                          onChange={(e) => updateSelectedElement({ hPct: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-slate-200 rounded font-mono-tabular"
                        />
                      </div>
                    </div>

                    {selectedElement.type === 'text' && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] text-slate-500">Font Family</label>
                          <select
                            value={selectedElement.fontFamily || 'sans'}
                            onChange={(e) =>
                              updateSelectedElement({
                                fontFamily: e.target.value as 'sans' | 'arabic' | 'mono',
                              })
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded"
                          >
                            <option value="sans">Sans-Serif</option>
                            <option value="arabic">Arabic (Amiri)</option>
                            <option value="mono">Monospace</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Font Size (pt)</label>
                          <input
                            type="number"
                            step="0.5"
                            min={6}
                            max={36}
                            value={selectedElement.fontSize || 12}
                            onChange={(e) =>
                              updateSelectedElement({ fontSize: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded font-mono-tabular"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Weight</label>
                          <select
                            value={selectedElement.fontWeight || 'normal'}
                            onChange={(e) =>
                              updateSelectedElement({
                                fontWeight: e.target.value as 'normal' | 'bold',
                              })
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded"
                          >
                            <option value="normal">Regular</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Align</label>
                          <select
                            value={selectedElement.align || 'center'}
                            onChange={(e) =>
                              updateSelectedElement({
                                align: e.target.value as 'left' | 'center' | 'right',
                              })
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Color</label>
                          <input
                            type="color"
                            value={selectedElement.color || '#0f172a'}
                            onChange={(e) => updateSelectedElement({ color: e.target.value })}
                            className="w-full h-7 p-0.5 border border-slate-200 rounded"
                          />
                        </div>

                        {selectedElement.fieldKey === 'customText' && (
                          <div className="col-span-2 sm:col-span-5">
                            <label className="block text-[10px] text-slate-500">Custom Text Value</label>
                            <input
                              value={selectedElement.customText || ''}
                              onChange={(e) => updateSelectedElement({ customText: e.target.value })}
                              className="w-full px-2 py-1 border border-slate-200 rounded"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-3 py-2">
                    {t('noElementSelectedHint')}
                  </div>
                )}
              </>
            ) : (
              /* Structured Preset Preview */
              <div className="flex flex-col justify-center">
                <div className="text-[11px] font-semibold text-slate-500 mb-2">
                  Structured A4 Preview ({orientation})
                </div>
                <div
                  className={`relative bg-white mx-auto w-full p-6 shadow-sm flex flex-col justify-between overflow-hidden ${
                    orientation === 'landscape'
                      ? 'aspect-[1.414/1]'
                      : 'aspect-[1/1.414] max-w-[360px]'
                  }`}
                  style={{
                    border:
                      config.borderStyle === 'minimal'
                        ? '1px solid #cbd5e1'
                        : `4px ${config.borderStyle === 'classic' ? 'double' : 'solid'} ${config.borderColor}`,
                    backgroundColor:
                      !config.backgroundImageFileId && config.backgroundPresetId
                        ? certificateBackgroundLibrary.getPresetById(config.backgroundPresetId)?.baseColor || '#ffffff'
                        : config.backgroundStyle === 'tinted'
                        ? '#f8fafc'
                        : '#ffffff',
                  }}
                >
                  {!config.backgroundImageFileId && config.backgroundPresetId && (() => {
                    const uri = certificateBackgroundLibrary.getSvgDataUri(config.backgroundPresetId, {
                      target: 'certificate',
                      orientation,
                    });
                    return uri ? (
                      <img
                        src={uri}
                        alt="Preset Background"
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      />
                    ) : null;
                  })()}
                  {config.backgroundImageFileId && (
                    <ProtectedImage
                      fileId={config.backgroundImageFileId}
                      alt="Background"
                      className="absolute inset-0 w-full h-full object-cover opacity-90 pointer-events-none"
                    />
                  )}
                  <div className="relative z-10 flex items-start justify-between gap-2">
                    {config.showLogo ? (
                      config.customLogoFileId ? (
                        <ProtectedImage
                          fileId={config.customLogoFileId}
                          alt="Logo"
                          fallbackText="LOGO"
                          className="h-9 object-contain"
                        />
                      ) : logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-9 object-contain" />
                      ) : (
                        <div className="text-[10px] font-bold text-slate-700">
                          {branding.nameEn || 'COMPANY LOGO'}
                        </div>
                      )
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-2">
                      {config.showCandidatePhoto && (
                        <div className="w-10 h-12 rounded border border-slate-300 bg-slate-100 flex items-center justify-center text-[7px] font-semibold text-slate-500">
                          PHOTO
                        </div>
                      )}
                      <div className="text-end text-[10px] font-mono-tabular text-slate-500">
                        CERT-2026-000001
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 text-center space-y-1.5 my-2">
                    {languageMode !== 'ar' && (
                      <div
                        className="font-display font-bold text-sm"
                        style={{ color: config.borderColor }}
                      >
                        {config.headingEn}
                      </div>
                    )}
                    {languageMode !== 'en' && (
                      <div
                        className="font-bold text-sm"
                        dir="rtl"
                        style={{ color: config.accentColor }}
                      >
                        {config.headingAr}
                      </div>
                    )}
                    {languageMode !== 'ar' && (
                      <div className="text-[10px] text-slate-500">{config.subHeadingEn}</div>
                    )}
                    {languageMode !== 'en' && (
                      <div className="text-[10px] text-slate-500" dir="rtl">
                        {config.subHeadingAr}
                      </div>
                    )}
                    <div className="text-xs font-bold text-slate-900 pt-1">
                      {languageMode === 'ar'
                        ? 'طارق عبدالله المنصور'
                        : languageMode === 'en'
                        ? 'Tariq Abdullah Al-Mansoor'
                        : 'Tariq Abdullah Al-Mansoor / طارق عبدالله المنصور'}
                    </div>
                    <div
                      className="text-[11px] font-medium"
                      style={{ color: config.accentColor }}
                    >
                      Occupational Health & Safety Level 2
                    </div>
                  </div>

                  <div className="relative z-10 flex items-end justify-between gap-3 pt-2 border-t border-slate-100 text-[9px] text-slate-500">
                    <div className="flex items-center gap-2">
                      {config.showSignature && (
                        <div className="text-center">
                          {config.customSignatureFileId ? (
                            <ProtectedImage
                              fileId={config.customSignatureFileId}
                              alt="Signature"
                              fallbackText="SIGN"
                              className="h-6 object-contain mx-auto"
                            />
                          ) : (
                            signatureUrl && (
                              <img
                                src={signatureUrl}
                                alt="Sign"
                                className="h-6 object-contain mx-auto"
                              />
                            )
                          )}
                          <div className="border-t border-slate-300 px-2 pt-0.5">
                            {branding.signatoryName || 'Authorized Signatory'}
                          </div>
                        </div>
                      )}
                      {config.showStamp && (
                        <div>
                          {config.customStampFileId ? (
                            <ProtectedImage
                              fileId={config.customStampFileId}
                              alt="Stamp"
                              fallbackText="STAMP"
                              className="h-8 object-contain"
                            />
                          ) : stampUrl ? (
                            <img src={stampUrl} alt="Stamp" className="h-8 object-contain" />
                          ) : (
                            <div className="w-8 h-8 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-[7px]">
                              STAMP
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {config.showQr && (
                      <div className="w-9 h-9 border border-slate-300 bg-white flex items-center justify-center text-[8px] font-mono-tabular">
                        QR
                      </div>
                    )}
                  </div>

                  {config.footerText && (
                    <div className="relative z-10 text-center text-[8px] text-slate-400 mt-1 truncate">
                      {config.footerText}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={bgPreviewOpen}
        onClose={() => setBgPreviewOpen(false)}
        title={
          lang === 'ar'
            ? 'معاينة الخلفيات الرسومية على قالب الشهادة'
            : 'Background Preview on Certificate Template'
        }
        maxWidth="max-w-6xl"
      >
        <BackgroundPreview
          initialTarget="certificate"
          initialOrientation={orientation}
          initialPresetId={config.backgroundPresetId}
          allowTargetSwitch={false}
          lang={lang}
          templateSample={{
            centerNameEn: branding.nameEn || undefined,
            centerNameAr: branding.nameAr || undefined,
            titleEn: config.headingEn,
            titleAr: config.headingAr,
            subHeadingEn: config.subHeadingEn,
            subHeadingAr: config.subHeadingAr,
            footerText: config.footerText,
            languageMode,
            logoUrl,
            stampUrl,
            signatureUrl,
            signatoryName: branding.signatoryName || undefined,
            showLogo: config.showLogo,
            showStamp: config.showStamp,
            showSignature: config.showSignature,
            showQr: config.showQr,
            showCandidatePhoto: config.showCandidatePhoto,
          }}
          onApplyPreset={(preset, sync) => {
            handleSelectBackgroundPreset(preset, sync);
            setBgPreviewOpen(false);
          }}
          onClearPreset={() => {
            setConfig((prev) => ({ ...prev, backgroundPresetId: undefined }));
            setBgPreviewOpen(false);
          }}
        />
      </Modal>

      <PdfPreviewModal
        blobUrlOverride={previewBlobUrl}
        fileId={null}
        title={`${name || 'Certificate Template'} — Real A4 PDF Preview`}
        onClose={() => {
          if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
        }}
      />
    </div>
  );
}
