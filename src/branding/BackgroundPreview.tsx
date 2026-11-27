import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Palette,
  RotateCcw,
} from 'lucide-react';
import {
  BACKGROUND_CATEGORY_LABELS,
  certificateBackgroundLibrary,
  type BackgroundCategory,
  type BackgroundPreset,
  type BackgroundRenderTarget,
} from './CertificateBackgroundLibrary';

export interface BackgroundPreviewTemplateSample {
  centerNameEn?: string;
  centerNameAr?: string;
  titleEn?: string;
  titleAr?: string;
  subHeadingEn?: string;
  subHeadingAr?: string;
  candidateNameEn?: string;
  candidateNameAr?: string;
  courseTitleEn?: string;
  courseTitleAr?: string;
  courseCode?: string;
  footerText?: string;
  languageMode?: 'bilingual' | 'en' | 'ar';
  logoUrl?: string | null;
  stampUrl?: string | null;
  signatureUrl?: string | null;
  signatoryName?: string;
  showLogo?: boolean;
  showStamp?: boolean;
  showSignature?: boolean;
  showQr?: boolean;
  showCandidatePhoto?: boolean;
}

export interface BackgroundPreviewProps {
  initialTarget?: BackgroundRenderTarget;
  initialOrientation?: 'landscape' | 'portrait';
  initialPresetId?: string;
  allowTargetSwitch?: boolean;
  templateSample?: BackgroundPreviewTemplateSample;
  onSelectPreset?: (preset: BackgroundPreset, syncPalette: boolean) => void;
  onApplyPreset?: (preset: BackgroundPreset, syncPalette: boolean) => void;
  onClearPreset?: () => void;
  lang: 'en' | 'ar';
}

export function BackgroundPreview({
  initialTarget = 'certificate',
  initialOrientation = 'landscape',
  initialPresetId,
  allowTargetSwitch = true,
  templateSample,
  onSelectPreset,
  onApplyPreset,
  onClearPreset,
  lang,
}: BackgroundPreviewProps) {
  const allPresets = useMemo(
    () => certificateBackgroundLibrary.getAllPresets(),
    []
  );

  const [target, setTarget] = useState<BackgroundRenderTarget>(initialTarget);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(
    initialOrientation
  );
  const [cardSide, setCardSide] = useState<'front' | 'back'>('front');
  const [category, setCategory] = useState<BackgroundCategory | 'all'>('all');
  const [activePresetId, setActivePresetId] = useState<string>(
    initialPresetId || allPresets[0]?.id || 'royal-gold-guilloche'
  );
  const [showTemplateOverlay, setShowTemplateOverlay] = useState(true);
  const [syncPalette, setSyncPalette] = useState(true);

  const filteredPresets = useMemo(
    () => certificateBackgroundLibrary.getPresetsByCategory(category, target),
    [category, target]
  );

  const activePreset = useMemo(
    () =>
      certificateBackgroundLibrary.getPresetById(activePresetId) ||
      allPresets[0],
    [activePresetId, allPresets]
  );

  const categories = certificateBackgroundLibrary.getCategories();

  const sample = useMemo(
    () => ({
      centerNameEn:
        templateSample?.centerNameEn || 'National Industrial Safety Academy',
      centerNameAr:
        templateSample?.centerNameAr || 'الأكاديمية الوطنية للسلامة الصناعية',
      titleEn:
        templateSample?.titleEn ||
        (target === 'card' ? 'TRAINING CARD' : 'CERTIFICATE OF COMPLETION'),
      titleAr:
        templateSample?.titleAr ||
        (target === 'card' ? 'بطاقة تدريب' : 'شهادة إتمام دورة تدريبية'),
      subHeadingEn: templateSample?.subHeadingEn || 'This is to certify that',
      subHeadingAr: templateSample?.subHeadingAr || 'يشهد المركز بأن المتدرب',
      candidateNameEn:
        templateSample?.candidateNameEn || 'Tariq Abdullah Al-Mansoor',
      candidateNameAr: templateSample?.candidateNameAr || 'طارق عبدالله المنصور',
      courseTitleEn:
        templateSample?.courseTitleEn ||
        'Occupational Health & Industrial Safety Level 3',
      courseTitleAr:
        templateSample?.courseTitleAr ||
        'السلامة والصحة المهنية — المستوى الثالث',
      courseCode: templateSample?.courseCode || 'OHS-301',
      footerText:
        templateSample?.footerText ||
        'Verified electronically via official QR verification portal.',
      languageMode: templateSample?.languageMode || 'bilingual',
      logoUrl: templateSample?.logoUrl || null,
      stampUrl: templateSample?.stampUrl || null,
      signatureUrl: templateSample?.signatureUrl || null,
      signatoryName: templateSample?.signatoryName || 'Dr. Khaled Al-Otaibi',
      showLogo: templateSample?.showLogo !== false,
      showStamp: templateSample?.showStamp !== false,
      showSignature: templateSample?.showSignature !== false,
      showQr: templateSample?.showQr !== false,
      showCandidatePhoto: Boolean(templateSample?.showCandidatePhoto),
    }),
    [templateSample, target]
  );

  const handleTogglePreset = (preset: BackgroundPreset) => {
    setActivePresetId(preset.id);
    onSelectPreset?.(preset, syncPalette);
  };

  const handleStep = (dir: -1 | 1) => {
    const pool = filteredPresets.length > 0 ? filteredPresets : allPresets;
    const idx = pool.findIndex((p) => p.id === activePreset?.id);
    const nextIdx =
      idx === -1 ? 0 : (idx + dir + pool.length) % pool.length;
    const next = pool[nextIdx];
    if (next) handleTogglePreset(next);
  };

  const activeSvgUri = activePreset
    ? certificateBackgroundLibrary.getSvgDataUri(activePreset.id, {
        target,
        orientation,
        side: cardSide,
      })
    : null;

  const isAr = sample.languageMode === 'ar';
  const isEn = sample.languageMode === 'en';
  const textPrimary = activePreset?.recommendedTextColor || '#0F172A';
  const textSecondary =
    activePreset?.recommendedSecondaryTextColor || '#475569';
  const textAccent = activePreset?.recommendedAccentColor || '#0284C7';
  const headerBarColor = activePreset?.recommendedHeaderColor || '#0F172A';

  return (
    <div className="space-y-5">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          {allowTargetSwitch && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => {
                  setTarget('certificate');
                  setOrientation('landscape');
                }}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                  target === 'certificate' && orientation === 'landscape'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'شهادة (أفقي A4)' : 'Certificate (A4 Landscape)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTarget('certificate');
                  setOrientation('portrait');
                }}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                  target === 'certificate' && orientation === 'portrait'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'شهادة (عمودي A4)' : 'Certificate (A4 Portrait)'}
              </button>
              <button
                type="button"
                onClick={() => setTarget('card')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                  target === 'card'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'بطاقة تدريب (CR80)' : 'Training Card (CR80)'}
              </button>
            </div>
          )}

          {target === 'card' && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setCardSide('front')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                  cardSide === 'front'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'الوجه الأمامي' : 'Front Side'}
              </button>
              <button
                type="button"
                onClick={() => setCardSide('back')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                  cardSide === 'back'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'ar' ? 'الوجه الخلفي' : 'Back Side'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplateOverlay((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {showTemplateOverlay
                ? lang === 'ar'
                  ? 'معاينة مع بيانات القالب'
                  : 'With Template Content'
                : lang === 'ar'
                ? 'معاينة الخلفية فقط'
                : 'Background Artwork Only'}
            </span>
          </button>

          {(onSelectPreset || onApplyPreset) && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer px-2 py-1">
              <input
                type="checkbox"
                checked={syncPalette}
                onChange={(e) => setSyncPalette(e.target.checked)}
              />
              <Palette className="w-3.5 h-3.5 text-slate-500" />
              <span className="whitespace-nowrap">
                {lang === 'ar' ? 'مزامنة الألوان والتباين' : 'Sync contrast & palette'}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Live Template Preview Stage */}
      {activePreset && (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {lang === 'ar' ? activePreset.nameAr : activePreset.nameEn}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>
                  {lang === 'ar'
                    ? BACKGROUND_CATEGORY_LABELS[activePreset.category].ar
                    : BACKGROUND_CATEGORY_LABELS[activePreset.category].en}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {activePreset.isDarkSurface
                    ? lang === 'ar'
                      ? 'خلفية داكنة'
                      : 'Dark Surface'
                    : lang === 'ar'
                    ? 'خلفية فاتحة'
                    : 'Light Surface'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  {lang === 'ar'
                    ? activePreset.descriptionAr
                    : activePreset.descriptionEn}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStep(-1)}
                title={lang === 'ar' ? 'السابق' : 'Previous'}
                className="p-2 border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStep(1)}
                title={lang === 'ar' ? 'التالي' : 'Next'}
                className="p-2 border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {onClearPreset && (
                <button
                  type="button"
                  onClick={onClearPreset}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إعادة ضبط' : 'Clear'}</span>
                </button>
              )}
              {onApplyPreset && (
                <button
                  type="button"
                  onClick={() => onApplyPreset(activePreset, syncPalette)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ar' ? 'اعتماد الخلفية للقالب' : 'Apply to Template'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Scaled Live Template Canvas */}
          <div className="flex justify-center">
            {target === 'certificate' ? (
              <div
                className={`relative w-full rounded-md overflow-hidden shadow-sm border border-slate-300 ${
                  orientation === 'portrait'
                    ? 'max-w-[340px] aspect-[1/1.414]'
                    : 'max-w-[620px] aspect-[1.414/1]'
                }`}
                style={{ backgroundColor: activePreset.baseColor }}
              >
                {activeSvgUri && (
                  <img
                    src={activeSvgUri}
                    alt={lang === 'ar' ? activePreset.nameAr : activePreset.nameEn}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}

                {showTemplateOverlay && (
                  <div className="relative z-10 h-full w-full p-7 sm:p-9 flex flex-col justify-between text-center">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-10 flex items-center justify-start">
                        {sample.showLogo &&
                          (sample.logoUrl ? (
                            <img
                              src={sample.logoUrl}
                              alt="Logo"
                              className="max-h-9 max-w-full object-contain"
                            />
                          ) : (
                            <div
                              className="px-2 py-1 border border-dashed rounded text-[9px] font-semibold"
                              style={{
                                color: textSecondary,
                                borderColor: textSecondary,
                              }}
                            >
                              LOGO
                            </div>
                          ))}
                      </div>
                      <div className="flex-1 text-center space-y-0.5">
                        {!isAr && (
                          <div
                            className="text-xs sm:text-sm font-bold tracking-tight"
                            style={{ color: textAccent }}
                          >
                            {sample.centerNameEn}
                          </div>
                        )}
                        {!isEn && (
                          <div
                            dir="rtl"
                            className="text-xs sm:text-sm font-bold"
                            style={{ color: textSecondary }}
                          >
                            {sample.centerNameAr}
                          </div>
                        )}
                      </div>
                      <div className="w-12 flex justify-end">
                        {sample.showCandidatePhoto && (
                          <div
                            className="w-9 h-11 rounded border border-dashed flex items-center justify-center text-[8px] font-semibold"
                            style={{
                              color: textSecondary,
                              borderColor: textSecondary,
                            }}
                          >
                            PHOTO
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5 sm:space-y-2 my-auto py-2">
                      {!isAr && (
                        <div
                          className="text-base sm:text-xl font-bold tracking-tight"
                          style={{ color: textPrimary }}
                        >
                          {sample.titleEn}
                        </div>
                      )}
                      {!isEn && (
                        <div
                          dir="rtl"
                          className="text-sm sm:text-lg font-bold"
                          style={{ color: textAccent }}
                        >
                          {sample.titleAr}
                        </div>
                      )}
                      {!isAr && (
                        <div
                          className="text-[11px]"
                          style={{ color: textSecondary }}
                        >
                          {sample.subHeadingEn}
                        </div>
                      )}
                      {!isEn && (
                        <div
                          dir="rtl"
                          className="text-[11px]"
                          style={{ color: textSecondary }}
                        >
                          {sample.subHeadingAr}
                        </div>
                      )}

                      <div className="pt-1 space-y-0.5">
                        {!isAr && (
                          <div
                            className="text-sm sm:text-lg font-bold"
                            style={{ color: textPrimary }}
                          >
                            {sample.candidateNameEn}
                          </div>
                        )}
                        {!isEn && (
                          <div
                            dir="rtl"
                            className="text-sm sm:text-base font-bold"
                            style={{ color: textPrimary }}
                          >
                            {sample.candidateNameAr}
                          </div>
                        )}
                      </div>

                      <div className="pt-1 space-y-0.5">
                        {!isAr && (
                          <div
                            className="text-xs sm:text-sm font-semibold"
                            style={{ color: textAccent }}
                          >
                            {sample.courseTitleEn} ({sample.courseCode})
                          </div>
                        )}
                        {!isEn && (
                          <div
                            dir="rtl"
                            className="text-xs sm:text-sm font-semibold"
                            style={{ color: textAccent }}
                          >
                            {sample.courseTitleAr}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="space-y-2">
                      <div className="flex items-end justify-between gap-4 text-[10px]">
                        <div
                          className="text-start font-mono-tabular space-y-0.5"
                          style={{ color: textSecondary }}
                        >
                          <div
                            className="font-semibold"
                            style={{ color: textPrimary }}
                          >
                            CERT-2026-000001
                          </div>
                          <div>Issue: 2026-05-15</div>
                        </div>

                        <div className="flex items-center gap-3">
                          {sample.showStamp && (
                            <div
                              className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center text-[8px] font-semibold"
                              style={{
                                color: textSecondary,
                                borderColor: textSecondary,
                              }}
                            >
                              {sample.stampUrl ? (
                                <img
                                  src={sample.stampUrl}
                                  alt="Stamp"
                                  className="max-w-full max-h-full object-contain"
                                />
                              ) : (
                                'STAMP'
                              )}
                            </div>
                          )}
                          {sample.showQr && (
                            <div className="w-10 h-10 rounded border border-slate-300 bg-white flex items-center justify-center text-[8px] font-mono-tabular font-bold text-slate-800">
                              QR
                            </div>
                          )}
                        </div>

                        <div className="text-center min-w-[100px]">
                          {sample.showSignature && sample.signatureUrl && (
                            <img
                              src={sample.signatureUrl}
                              alt="Signature"
                              className="h-6 mx-auto object-contain"
                            />
                          )}
                          <div
                            className="border-t pt-0.5 font-semibold"
                            style={{
                              color: textPrimary,
                              borderColor: textSecondary,
                            }}
                          >
                            {sample.signatoryName}
                          </div>
                          <div
                            className="text-[9px]"
                            style={{ color: textSecondary }}
                          >
                            Authorized Signatory
                          </div>
                        </div>
                      </div>
                      <div
                        className="text-[9px] truncate"
                        style={{ color: textSecondary }}
                      >
                        {sample.footerText}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Training Card CR80 Live Stage */
              <div
                className="relative w-full max-w-[440px] aspect-[85.6/53.98] rounded-lg overflow-hidden shadow-sm border border-slate-300"
                style={{ backgroundColor: activePreset.baseColor }}
              >
                {activeSvgUri && (
                  <img
                    src={activeSvgUri}
                    alt={lang === 'ar' ? activePreset.nameAr : activePreset.nameEn}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}

                {showTemplateOverlay && cardSide === 'front' && (
                  <div className="relative z-10 h-full w-full p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {sample.showLogo && (
                          <div className="w-9 h-9 rounded bg-white/80 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                            {sample.logoUrl ? (
                              <img
                                src={sample.logoUrl}
                                alt="Logo"
                                className="max-w-full max-h-full object-contain"
                              />
                            ) : (
                              <span className="text-[8px] font-bold text-slate-600">
                                LOGO
                              </span>
                            )}
                          </div>
                        )}
                        <div className="min-w-0">
                          {!isAr && (
                            <div
                              className="text-[11px] font-bold truncate"
                              style={{ color: textPrimary }}
                            >
                              {sample.centerNameEn}
                            </div>
                          )}
                          {!isEn && (
                            <div
                              dir="rtl"
                              className="text-[10px] font-semibold truncate"
                              style={{ color: textSecondary }}
                            >
                              {sample.centerNameAr}
                            </div>
                          )}
                          <div
                            className="text-[9px] font-bold uppercase tracking-wide"
                            style={{ color: textAccent }}
                          >
                            {isAr ? sample.titleAr : sample.titleEn}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-[9px] font-mono-tabular font-semibold shrink-0"
                        style={{ color: textSecondary }}
                      >
                        CARD-2026-0001
                      </span>
                    </div>

                    <div className="flex items-center gap-3 my-auto">
                      <div
                        className="w-14 h-[70px] rounded border flex items-center justify-center text-[8px] font-semibold shrink-0"
                        style={{
                          borderColor: textSecondary,
                          color: textSecondary,
                          backgroundColor: activePreset.isDarkSurface
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(241,245,249,0.85)',
                        }}
                      >
                        PHOTO
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {!isAr && (
                          <div
                            className="text-xs font-bold truncate"
                            style={{ color: textPrimary }}
                          >
                            {sample.candidateNameEn}
                          </div>
                        )}
                        {!isEn && (
                          <div
                            dir="rtl"
                            className="text-[11px] font-bold truncate"
                            style={{ color: textSecondary }}
                          >
                            {sample.candidateNameAr}
                          </div>
                        )}
                        <div
                          className="text-[10px] font-mono-tabular"
                          style={{ color: textSecondary }}
                        >
                          CND-2026-00001 · ******1234
                        </div>
                        <div
                          className="text-[11px] font-semibold truncate"
                          style={{ color: textAccent }}
                        >
                          {isAr ? sample.courseTitleAr : sample.courseTitleEn}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div
                        className="text-[9px] font-mono-tabular"
                        style={{ color: textSecondary }}
                      >
                        BTH-2026-0001 · 2026-05-10 – 2026-05-14
                      </div>
                      <div className="flex items-center gap-1.5">
                        {sample.showQr && (
                          <div className="w-8 h-8 rounded border border-slate-300 bg-white flex items-center justify-center text-[8px] font-mono-tabular font-bold text-slate-800">
                            QR
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {showTemplateOverlay && cardSide === 'back' && (
                  <div className="relative z-10 h-full w-full p-4 flex flex-col justify-between">
                    <div
                      className="text-[9px] font-bold tracking-wide"
                      style={{
                        color: '#FFFFFF',
                        backgroundColor: headerBarColor,
                        margin: '-16px -16px 0 -16px',
                        padding: '6px 16px',
                      }}
                    >
                      VERIFICATION & COURSE DETAILS
                    </div>
                    <div className="flex items-center gap-3 my-auto">
                      <div className="w-16 h-16 rounded border border-slate-300 bg-white flex items-center justify-center text-[9px] font-mono-tabular font-bold text-slate-800 shrink-0">
                        QR
                      </div>
                      <div className="min-w-0 space-y-1 text-[10px]">
                        <div
                          className="font-bold truncate"
                          style={{ color: textPrimary }}
                        >
                          {sample.courseTitleEn}
                        </div>
                        {!isEn && (
                          <div
                            dir="rtl"
                            className="font-semibold truncate"
                            style={{ color: textSecondary }}
                          >
                            {sample.courseTitleAr}
                          </div>
                        )}
                        <div
                          className="font-mono-tabular"
                          style={{ color: textSecondary }}
                        >
                          Serial: CARD-2026-0001 · Batch: BTH-2026-0001
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-[8.5px] truncate"
                      style={{ color: textSecondary }}
                    >
                      {sample.footerText}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span>
            {lang === 'ar'
              ? 'اختر تصميماً لمعاينته مباشرة على القالب'
              : 'Click any design below to preview it on the template'}
          </span>
          <span className="text-[11px] font-normal text-slate-500 font-mono-tabular">
            ({filteredPresets.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              category === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {lang === 'ar' ? 'الكل' : 'All'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                category === cat.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'ar' ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Grid of All Backgrounds with Applied Mini Template Preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {filteredPresets.map((preset) => {
          const isSelected = activePreset?.id === preset.id;
          const svgUri = certificateBackgroundLibrary.getSvgDataUri(preset.id, {
            target,
            orientation,
            side: cardSide,
          });
          const aspectClass =
            target === 'card'
              ? 'aspect-[85.6/53.98]'
              : orientation === 'portrait'
              ? 'aspect-[1/1.414]'
              : 'aspect-[1.414/1]';

          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleTogglePreset(preset)}
              className={`group text-start rounded-lg border p-2.5 transition-all bg-white ${
                isSelected
                  ? 'border-slate-900 ring-2 ring-slate-900'
                  : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <div
                className={`relative w-full ${aspectClass} rounded overflow-hidden border border-slate-200`}
                style={{ backgroundColor: preset.baseColor }}
              >
                {svgUri && (
                  <img
                    src={svgUri}
                    alt={lang === 'ar' ? preset.nameAr : preset.nameEn}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {showTemplateOverlay && (
                  <div className="relative z-10 h-full w-full p-2.5 flex flex-col justify-between text-center pointer-events-none">
                    <div
                      className="text-[7px] font-bold tracking-wide truncate"
                      style={{ color: preset.recommendedAccentColor }}
                    >
                      {target === 'card'
                        ? sample.centerNameEn
                        : sample.titleEn}
                    </div>
                    <div className="space-y-0.5 my-auto">
                      <div
                        className="text-[8.5px] font-bold truncate"
                        style={{ color: preset.recommendedTextColor }}
                      >
                        {sample.candidateNameEn}
                      </div>
                      <div
                        className="text-[7px] font-medium truncate"
                        style={{ color: preset.recommendedSecondaryTextColor }}
                      >
                        {sample.courseCode}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[6.5px] font-mono-tabular">
                      <span
                        style={{ color: preset.recommendedSecondaryTextColor }}
                      >
                        {target === 'card' ? 'CR80' : 'A4'}
                      </span>
                      <span className="px-1 py-0.5 bg-white/90 text-slate-800 border border-slate-300 rounded-[2px] font-bold">
                        QR
                      </span>
                    </div>
                  </div>
                )}

                {isSelected && (
                  <span className="absolute top-1.5 end-1.5 z-20 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {lang === 'ar' ? preset.nameAr : preset.nameEn}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                  <span>
                    {lang === 'ar'
                      ? BACKGROUND_CATEGORY_LABELS[preset.category].ar
                      : BACKGROUND_CATEGORY_LABELS[preset.category].en}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {preset.isDarkSurface
                      ? lang === 'ar'
                        ? 'داكن'
                        : 'Dark'
                      : lang === 'ar'
                      ? 'فاتح'
                      : 'Light'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
