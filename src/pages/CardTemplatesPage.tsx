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
import { apiFetch, uploadProtectedFile } from '../lib/api';
import { auth } from '../firebase';
import { isSupportedBrandingImageFile, prepareBrandingImageFile } from '../lib/imageUpload';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useLanguage } from '../contexts/LanguageContext';
import { hasPermission, isTenantAdminRole } from '../lib/permissions';
import type {
  CardCanvasElement,
  CardElementType,
  CardFieldKey,
  CardLanguageMode,
  CardTemplate,
  CardTemplateConfig,
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
import {
  CARD_FIELD_LABELS,
  CardDesignerCanvas,
  buildDefaultCanvasElements,
} from '../components/cards/CardDesignerCanvas';
import {
  BackgroundGalleryPicker,
  BackgroundPreview,
  certificateBackgroundLibrary,
  type BackgroundPreset,
} from '../branding';

const DEFAULT_CARD_CONFIG: CardTemplateConfig = {
  headerColor: '#0f172a',
  accentColor: '#0284c7',
  backgroundColor: '#ffffff',
  logoPosition: 'top-left',
  photoPosition: 'left',
  qrPosition: 'front-bottom',
  showBackSide: true,
  showMaskedIqama: true,
  showDates: true,
  showTrainer: true,
  showVenue: true,
  showSignature: false,
  showStamp: false,
  footerText: 'Valid only during active course period.',
  languageMode: 'bilingual',
  cardTitleEn: 'TRAINING CARD',
  cardTitleAr: 'بطاقة تدريب',
  useCustomLayout: true,
  elements: buildDefaultCanvasElements('bilingual'),
};

export function CardTemplatesPage() {
  const { profile, roleMatrix } = useAuth();
  const { branding, logoUrl, stampUrl, signatureUrl } = useBranding();
  const { lang, t } = useLanguage();

  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'common' | 'course'>('common');
  const [courseId, setCourseId] = useState('');
  const [languageMode, setLanguageMode] = useState<CardLanguageMode>('bilingual');
  const [widthMm, setWidthMm] = useState(85.6);
  const [heightMm, setHeightMm] = useState(53.98);
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<CardTemplateConfig>(DEFAULT_CARD_CONFIG);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const [designerSide, setDesignerSide] = useState<'front' | 'back'>('front');
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [addFieldKey, setAddFieldKey] = useState<CardFieldKey>('candidateNameEn');
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [bgPreviewOpen, setBgPreviewOpen] = useState(false);

  const canDesign =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'settings', 'edit', roleMatrix) ||
    hasPermission(profile, 'training_cards', 'edit', roleMatrix);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, crsRes] = await Promise.all([
        apiFetch<{ templates: CardTemplate[] }>('/api/templates/cards'),
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
    const hdr = branding.primaryColor || '#0f172a';
    const acc = branding.secondaryColor || '#0284c7';
    setEditingId(undefined);
    setName(lang === 'ar' ? 'قالب بطاقة التدريب القياسي CR80' : 'Standard CR80 Training Card');
    setScope('common');
    setCourseId(courses[0]?.id || '');
    setLanguageMode('bilingual');
    setWidthMm(85.6);
    setHeightMm(53.98);
    setIsDefault(templates.length === 0);
    setIsActive(true);
    setDesignerSide('front');
    setSelectedElId(null);
    setConfig({
      ...DEFAULT_CARD_CONFIG,
      headerColor: hdr,
      accentColor: acc,
      footerText: branding.cardFooter || DEFAULT_CARD_CONFIG.footerText,
      elements: buildDefaultCanvasElements('bilingual', hdr, acc),
    });
    setFormOpen(true);
  };

  const openEdit = (tpl: CardTemplate) => {
    const mode = tpl.languageMode || tpl.config?.languageMode || 'bilingual';
    const hdr = tpl.config?.headerColor || branding.primaryColor || '#0f172a';
    const acc = tpl.config?.accentColor || branding.secondaryColor || '#0284c7';
    setEditingId(tpl.id);
    setName(tpl.name);
    setScope(tpl.scope);
    setCourseId(tpl.courseId || '');
    setLanguageMode(mode);
    setWidthMm(tpl.widthMm || 85.6);
    setHeightMm(tpl.heightMm || 53.98);
    setIsDefault(tpl.isDefault);
    setIsActive(tpl.isActive !== false);
    setDesignerSide('front');
    setSelectedElId(null);
    setConfig({
      ...DEFAULT_CARD_CONFIG,
      ...tpl.config,
      languageMode: mode,
      elements:
        Array.isArray(tpl.config?.elements) && tpl.config.elements.length > 0
          ? tpl.config.elements
          : buildDefaultCanvasElements(mode, hdr, acc),
    });
    setFormOpen(true);
  };

  const handleLanguageModeChange = (nextMode: CardLanguageMode) => {
    setLanguageMode(nextMode);
    setConfig((prev) => ({
      ...prev,
      languageMode: nextMode,
    }));
  };

  const handleResetCanvasLayout = (modeOverride?: CardLanguageMode) => {
    const mode = modeOverride || languageMode;
    setConfig((prev) => ({
      ...prev,
      useCustomLayout: true,
      elements: buildDefaultCanvasElements(mode, prev.headerColor, prev.accentColor),
    }));
    setSelectedElId(null);
  };

  const handleBackgroundUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!isSupportedBrandingImageFile(file)) {
      setError('Please select a valid image file (PNG, JPG, WEBP, SVG, GIF, BMP, TIFF, or AVIF).');
      return;
    }
    setUploadingBg(true);
    setError(null);
    try {
      const prepared = await prepareBrandingImageFile(file);
      const uploaded = await uploadProtectedFile(prepared, 'branding', {
        purpose: 'card_template',
      });
      setConfig((prev) => ({
        ...prev,
        backgroundImageFileId: uploaded.fileId,
        backgroundPresetId: undefined,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingBg(false);
    }
  };

  const handleSelectBackgroundPreset = (preset: BackgroundPreset, syncPalette: boolean) => {
    setConfig((prev) => {
      const nextElements = syncPalette
        ? (prev.elements || []).map((el) => {
            if (el.type !== 'text') return el;
            const isPrimaryField =
              el.fieldKey === 'candidateNameEn' ||
              el.fieldKey === 'centerName' ||
              el.fieldKey === 'cardSerialNumber';
            const isAccentField =
              el.fieldKey === 'cardTitle' ||
              el.fieldKey === 'courseTitleEn' ||
              el.fieldKey === 'courseTitleAr';
            return {
              ...el,
              color: isAccentField
                ? preset.recommendedAccentColor
                : isPrimaryField
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
              backgroundColor: preset.baseColor,
              headerColor: preset.recommendedHeaderColor,
              accentColor: preset.recommendedAccentColor,
              elements: nextElements,
            }
          : {}),
      };
    });
  };

  const addCanvasElement = (type: CardElementType, fieldKey?: CardFieldKey) => {
    const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isImage = type !== 'text';
    const isArField =
      fieldKey === 'candidateNameAr' ||
      fieldKey === 'courseTitleAr' ||
      fieldKey === 'centerNameAr';
    const nextEl: CardCanvasElement = {
      id: newId,
      side: designerSide,
      type,
      ...(type === 'text' ? { fieldKey: fieldKey || 'customText' } : {}),
      label:
        type === 'text'
          ? CARD_FIELD_LABELS[fieldKey || 'customText']?.en
          : type.toUpperCase(),
      ...(fieldKey === 'customText' ? { customText: 'Authorized Card' } : {}),
      xPct: 12,
      yPct: 40,
      wPct: isImage ? (type === 'qr' ? 16 : 18) : 45,
      hPct: isImage ? 28 : 9,
      fontSize: 6.8,
      fontWeight: 'normal',
      fontFamily: isArField ? 'arabic' : 'sans',
      color: '#0f172a',
      align: isArField ? 'right' : 'left',
      visible: true,
    };
    setConfig((prev) => ({
      ...prev,
      useCustomLayout: true,
      elements: [...(prev.elements || []), nextEl],
    }));
    setSelectedElId(newId);
  };

  const updateSelectedElement = (patch: Partial<CardCanvasElement>) => {
    if (!selectedElId) return;
    setConfig((prev) => ({
      ...prev,
      elements: (prev.elements || []).map((el) =>
        el.id === selectedElId ? { ...el, ...patch } : el
      ),
    }));
  };

  const handlePreviewPdf = async (tplOverride?: CardTemplate) => {
    setPreviewing(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const tplPayload: Partial<CardTemplate> = tplOverride || {
        name: name || 'Preview',
        scope,
        languageMode,
        widthMm,
        heightMm,
        config: { ...config, languageMode },
      };
      const res = await fetch('/api/templates/cards/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ template: tplPayload }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to render preview PDF');
      }
      const blob = await res.blob();
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
      await apiFetch('/api/templates/cards', {
        method: 'POST',
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name,
          scope,
          ...(scope === 'course' ? { courseId } : {}),
          languageMode,
          widthMm,
          heightMm,
          isDefault,
          isActive: isDefault ? true : isActive,
          config: { ...config, languageMode },
        }),
      });
      setFormOpen(false);
      setSuccessMsg(
        lang === 'ar'
          ? 'تم حفظ قالب بطاقة التدريب بنجاح.'
          : 'Training card template saved successfully.'
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (
    tpl: CardTemplate,
    payload: { isActive?: boolean; isDefault?: boolean }
  ) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/api/templates/cards/${encodeURIComponent(tpl.id)}/status`, {
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
        <p className="text-xs text-slate-500 max-w-2xl">{t('cardDesignerSubtitle')}</p>
        {canDesign && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('newCardTemplate')}</span>
          </button>
        )}
      </div>

      <div className="px-4 py-2.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
        {t('historicalTemplateNotice')}
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
          description={t('cardDesignerSubtitle')}
          actionLabel={canDesign ? t('newCardTemplate') : undefined}
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
                        ? `${t('course')}: ${courseMap.get(tpl.courseId || '')?.titleEn || tpl.courseId}`
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
                        title={t('editCardTemplate')}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span className="font-mono-tabular">
                    {tpl.widthMm} × {tpl.heightMm} mm · v{tpl.version}
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
                    target: 'card',
                    side: 'front',
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
                  {canDesign && (
                    <div className="flex items-center gap-1.5">
                      {!tpl.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(tpl, { isDefault: true, isActive: true })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                        >
                          <Star className="w-3 h-3" />
                          <span>{t('setDefaultTemplateBtn')}</span>
                        </button>
                      )}
                      {!tpl.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(tpl, { isActive: !activeFlag })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-slate-200 rounded hover:bg-slate-50 text-slate-700"
                        >
                          <Power className="w-3 h-3" />
                          <span>{activeFlag ? t('deactivateTemplateBtn') : t('activateTemplateBtn')}</span>
                        </button>
                      )}
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
        title={editingId ? t('editCardTemplate') : t('newCardTemplate')}
        maxWidth="max-w-6xl"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Settings & Properties Column */}
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
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                >
                  <option value="common">{t('scopeCommonDefault')}</option>
                  <option value="course">{t('scopeCourseSpecific')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('languageLayoutLabel')}
                </label>
                <select
                  value={languageMode}
                  onChange={(e) => handleLanguageModeChange(e.target.value as CardLanguageMode)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                >
                  <option value="bilingual">{t('langModeBilingual')}</option>
                  <option value="en">{t('langModeEnglish')}</option>
                  <option value="ar">{t('langModeArabic')}</option>
                </select>
              </div>

              {scope === 'course' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t('course')} *
                  </label>
                  <select
                    required
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
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
                  {t('designerModeLabel')}
                </label>
                <select
                  value={config.useCustomLayout !== false ? 'visual' : 'classic'}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      useCustomLayout: e.target.value === 'visual',
                      elements:
                        config.elements && config.elements.length > 0
                          ? config.elements
                          : buildDefaultCanvasElements(languageMode, config.headerColor, config.accentColor),
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                >
                  <option value="visual">{t('designerModeVisual')}</option>
                  <option value="classic">{t('designerModeClassic')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">W (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value))}
                    className="w-full px-2 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">H (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={heightMm}
                    onChange={(e) => setHeightMm(Number(e.target.value))}
                    className="w-full px-2 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('cardTitleEnLabel')}
                </label>
                <input
                  value={config.cardTitleEn || ''}
                  onChange={(e) => setConfig({ ...config, cardTitleEn: e.target.value })}
                  placeholder="TRAINING CARD"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('cardTitleArLabel')}
                </label>
                <input
                  dir="rtl"
                  value={config.cardTitleAr || ''}
                  onChange={(e) => setConfig({ ...config, cardTitleAr: e.target.value })}
                  placeholder="بطاقة تدريب"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Header</label>
                  <input
                    type="color"
                    value={config.headerColor}
                    onChange={(e) => setConfig({ ...config, headerColor: e.target.value })}
                    className="w-full h-8 p-0.5 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Accent</label>
                  <input
                    type="color"
                    value={config.accentColor}
                    onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                    className="w-full h-8 p-0.5 border border-slate-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Background</label>
                  <input
                    type="color"
                    value={config.backgroundColor}
                    onChange={(e) => setConfig({ ...config, backgroundColor: e.target.value })}
                    className="w-full h-8 p-0.5 border border-slate-200 rounded"
                  />
                </div>
              </div>

              {/* Graphic Background Library Picker */}
              <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBgPreviewOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-100 whitespace-nowrap"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>
                      {lang === 'ar' ? 'معاينة جميع الخلفيات على البطاقة' : 'Compare All on Card'}
                    </span>
                  </button>
                </div>
                <BackgroundGalleryPicker
                  target="card"
                  selectedPresetId={config.backgroundPresetId}
                  hasCustomImage={Boolean(config.backgroundImageFileId)}
                  onSelectPreset={handleSelectBackgroundPreset}
                  onClearPreset={() => setConfig((prev) => ({ ...prev, backgroundPresetId: undefined }))}
                  lang={lang}
                  columns={3}
                />
              </div>

              {/* Background Image Upload */}
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                <span className="text-xs font-medium text-slate-700">{t('backgroundImageLabel')}</span>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-slate-200 bg-white rounded cursor-pointer hover:bg-slate-100">
                    <Upload className="w-3 h-3" />
                    <span>{uploadingBg ? '...' : t('uploadBackgroundBtn')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => void handleBackgroundUpload(e.target.files?.[0])}
                    />
                  </label>
                  {config.backgroundImageFileId && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, backgroundImageFileId: undefined })}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-600 border border-red-200 bg-white rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('clearBackgroundBtn')}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Card Footer Note</label>
                <input
                  value={config.footerText}
                  onChange={(e) => setConfig({ ...config, footerText: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={config.showBackSide}
                  onChange={(e) => setConfig({ ...config, showBackSide: e.target.checked })}
                />
                <span>Generate Back Side</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={config.showMaskedIqama}
                  onChange={(e) => setConfig({ ...config, showMaskedIqama: e.target.checked })}
                />
                <span>Show Masked Iqama</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={config.showDates !== false}
                  onChange={(e) => setConfig({ ...config, showDates: e.target.checked })}
                />
                <span>Show Course Dates</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={config.showTrainer !== false}
                  onChange={(e) => setConfig({ ...config, showTrainer: e.target.checked })}
                />
                <span>Show Trainer Name</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={config.showVenue !== false}
                  onChange={(e) => setConfig({ ...config, showVenue: e.target.checked })}
                />
                <span>Show Venue</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(config.showSignature)}
                  onChange={(e) => setConfig({ ...config, showSignature: e.target.checked })}
                />
                <span>Show Signature</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(config.showStamp)}
                  onChange={(e) => setConfig({ ...config, showStamp: e.target.checked })}
                />
                <span>Show Company Stamp</span>
              </label>
              <label className="inline-flex items-center gap-2 font-medium text-slate-900">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Set as Default</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={isDefault ? true : isActive}
                  disabled={isDefault}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>{t('templateActiveLabel')}</span>
              </label>
            </div>

            {/* Selected Element Inspector */}
            {config.useCustomLayout !== false && (
              <div className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">{t('elementPropertiesLabel')}</div>
                {!selectedElement ? (
                  <p className="text-[11px] text-slate-500">{t('noElementSelectedHint')}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-500">X %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedElement.xPct}
                        onChange={(e) => updateSelectedElement({ xPct: Number(e.target.value) })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Y %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedElement.yPct}
                        onChange={(e) => updateSelectedElement({ yPct: Number(e.target.value) })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">W %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedElement.wPct}
                        onChange={(e) => updateSelectedElement({ wPct: Number(e.target.value) })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">H %</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedElement.hPct}
                        onChange={(e) => updateSelectedElement({ hPct: Number(e.target.value) })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono-tabular"
                      />
                    </div>

                    {selectedElement.type === 'text' && (
                      <>
                        <div>
                          <label className="block text-[10px] text-slate-500">Size (pt)</label>
                          <input
                            type="number"
                            step="0.5"
                            min={4}
                            max={24}
                            value={selectedElement.fontSize || 7}
                            onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono-tabular"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Weight</label>
                          <select
                            value={selectedElement.fontWeight || 'normal'}
                            onChange={(e) =>
                              updateSelectedElement({ fontWeight: e.target.value as 'normal' | 'bold' })
                            }
                            className="w-full px-1.5 py-1 text-xs bg-white border border-slate-200 rounded"
                          >
                            <option value="normal">Regular</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500">Align</label>
                          <select
                            value={selectedElement.align || 'left'}
                            onChange={(e) =>
                              updateSelectedElement({ align: e.target.value as 'left' | 'center' | 'right' })
                            }
                            className="w-full px-1.5 py-1 text-xs bg-white border border-slate-200 rounded"
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
                            className="w-full h-7 p-0.5 bg-white border border-slate-200 rounded"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-slate-500">Font Style</label>
                          <select
                            value={selectedElement.fontFamily || 'sans'}
                            onChange={(e) =>
                              updateSelectedElement({
                                fontFamily: e.target.value as 'sans' | 'arabic' | 'mono',
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                          >
                            <option value="sans">Standard Sans</option>
                            <option value="arabic">Arabic RTL</option>
                            <option value="mono">Monospace ID/Date</option>
                          </select>
                        </div>
                        {selectedElement.fieldKey === 'customText' && (
                          <div className="col-span-2">
                            <label className="block text-[10px] text-slate-500">Custom Text</label>
                            <input
                              value={selectedElement.customText || ''}
                              onChange={(e) => updateSelectedElement({ customText: e.target.value })}
                              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={previewing}
                onClick={() => void handlePreviewPdf()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{previewing ? '...' : t('previewSamplePdfBtn')}</span>
              </button>
              <div className="flex gap-2">
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
                  {saving ? '...' : t('save')}
                </button>
              </div>
            </div>
          </div>

          {/* Right Interactive Visual Canvas Column */}
          <div className="xl:col-span-7 bg-slate-100 p-4 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDesignerSide('front');
                    setSelectedElId(null);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    designerSide === 'front' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t('frontSideLabel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDesignerSide('back');
                    setSelectedElId(null);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    designerSide === 'back' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t('backSideLabel')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleResetCanvasLayout()}
                className="px-2.5 py-1 text-[11px] border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-50"
              >
                Reset Default Layout
              </button>
            </div>

            {config.useCustomLayout !== false ? (
              <>
                {/* Palette Controls */}
                <div className="bg-white border border-slate-200 rounded-md p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {t('addCanvasElementLabel')}:
                    </span>
                    <select
                      value={addFieldKey}
                      onChange={(e) => setAddFieldKey(e.target.value as CardFieldKey)}
                      className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                    >
                      {(Object.keys(CARD_FIELD_LABELS) as CardFieldKey[]).map((fk) => (
                        <option key={fk} value={fk}>
                          {lang === 'ar' ? CARD_FIELD_LABELS[fk].ar : CARD_FIELD_LABELS[fk].en}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addCanvasElement('text', addFieldKey)}
                      className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                    >
                      + Text
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['logo', 'photo', 'qr', 'signature', 'stamp'] as CardElementType[]).map((et) => (
                      <button
                        key={et}
                        type="button"
                        onClick={() => addCanvasElement(et)}
                        className="px-2 py-1 text-[11px] border border-slate-200 bg-slate-50 text-slate-700 rounded hover:bg-slate-100"
                      >
                        + {t(`elem_${et}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <CardDesignerCanvas
                  config={config}
                  widthMm={widthMm}
                  heightMm={heightMm}
                  side={designerSide}
                  selectedId={selectedElId}
                  onSelect={setSelectedElId}
                  onChangeElements={(next) => setConfig((prev) => ({ ...prev, elements: next }))}
                  logoUrl={logoUrl}
                  stampUrl={stampUrl}
                  signatureUrl={signatureUrl}
                  centerNameEn={branding.nameEn}
                  centerNameAr={branding.nameAr}
                  lang={lang}
                />
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Logo Position</label>
                    <select
                      value={config.logoPosition}
                      onChange={(e) =>
                        setConfig({ ...config, logoPosition: e.target.value as 'top-left' | 'top-right' | 'top-center' })
                      }
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded"
                    >
                      <option value="top-left">Left</option>
                      <option value="top-right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Photo Position</label>
                    <select
                      value={config.photoPosition}
                      onChange={(e) => setConfig({ ...config, photoPosition: e.target.value as 'left' | 'right' })}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded"
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">QR Placement</label>
                    <select
                      value={config.qrPosition}
                      onChange={(e) =>
                        setConfig({ ...config, qrPosition: e.target.value as 'front-bottom' | 'back-center' })
                      }
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded"
                    >
                      <option value="front-bottom">Front Bottom</option>
                      <option value="back-center">Back Center</option>
                    </select>
                  </div>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-md text-center space-y-2">
                  <p className="text-xs text-slate-600">
                    Structured preset layout uses fixed bilingual proportions with your selected header/accent colors, logo, photo, trainer, venue, stamp, and signature.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handlePreviewPdf()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('previewSamplePdfBtn')}</span>
                  </button>
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
            ? 'معاينة الخلفيات الرسومية على قالب البطاقة'
            : 'Background Preview on Training Card Template'
        }
        maxWidth="max-w-6xl"
      >
        <BackgroundPreview
          initialTarget="card"
          initialPresetId={config.backgroundPresetId}
          allowTargetSwitch={false}
          lang={lang}
          templateSample={{
            centerNameEn: branding.nameEn || undefined,
            centerNameAr: branding.nameAr || undefined,
            titleEn: config.cardTitleEn || 'TRAINING CARD',
            titleAr: config.cardTitleAr || 'بطاقة تدريب',
            footerText: config.footerText,
            languageMode,
            logoUrl,
            stampUrl,
            signatureUrl,
            signatoryName: branding.signatoryName || undefined,
            showLogo: true,
            showStamp: Boolean(config.showStamp),
            showSignature: Boolean(config.showSignature),
            showQr: true,
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
        fileId={null}
        blobUrlOverride={previewBlobUrl}
        title={name || 'Card Template Preview'}
        onClose={() => {
          if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
        }}
      />
    </div>
  );
}
