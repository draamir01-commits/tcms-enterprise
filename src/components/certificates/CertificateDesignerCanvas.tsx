import React, { useRef, useState } from 'react';
import { Move, Trash2, Eye, EyeOff } from 'lucide-react';
import type {
  CertCanvasElement,
  CertFieldKey,
  CertLanguageMode,
  CertificateTemplateConfig,
} from '../../types/tcms';
import { ProtectedImage } from '../ui/ProtectedImage';
import { certificateBackgroundLibrary } from '../../branding/CertificateBackgroundLibrary';

export const CERT_FIELD_LABELS: Record<
  CertFieldKey,
  { en: string; ar: string; sampleEn: string; sampleAr: string }
> = {
  centerName: {
    en: 'Training Center (EN)',
    ar: 'اسم المركز (EN)',
    sampleEn: 'National Industrial Safety Academy',
    sampleAr: 'National Industrial Safety Academy',
  },
  centerNameAr: {
    en: 'Training Center (AR)',
    ar: 'اسم المركز (AR)',
    sampleEn: 'الأكاديمية الوطنية للسلامة الصناعية',
    sampleAr: 'الأكاديمية الوطنية للسلامة الصناعية',
  },
  certTitle: {
    en: 'Certificate Title (EN)',
    ar: 'عنوان الشهادة (EN)',
    sampleEn: 'CERTIFICATE OF COMPLETION',
    sampleAr: 'CERTIFICATE OF COMPLETION',
  },
  certTitleAr: {
    en: 'Certificate Title (AR)',
    ar: 'عنوان الشهادة (AR)',
    sampleEn: 'شهادة إتمام تدريب',
    sampleAr: 'شهادة إتمام تدريب',
  },
  subHeadingEn: {
    en: 'Sub-heading (EN)',
    ar: 'العنوان الفرعي (EN)',
    sampleEn: 'This is to certify that',
    sampleAr: 'This is to certify that',
  },
  subHeadingAr: {
    en: 'Sub-heading (AR)',
    ar: 'العنوان الفرعي (AR)',
    sampleEn: 'يشهد المركز بأن المتدرب',
    sampleAr: 'يشهد المركز بأن المتدرب',
  },
  candidateNameEn: {
    en: 'Candidate Name (EN)',
    ar: 'اسم المتدرب (EN)',
    sampleEn: 'Tariq Abdullah Al-Mansoor',
    sampleAr: 'Tariq Abdullah Al-Mansoor',
  },
  candidateNameAr: {
    en: 'Candidate Name (AR)',
    ar: 'اسم المتدرب (AR)',
    sampleEn: 'طارق عبدالله المنصور',
    sampleAr: 'طارق عبدالله المنصور',
  },
  candidateId: {
    en: 'Candidate ID',
    ar: 'رقم المتدرب',
    sampleEn: 'CND-2026-00001',
    sampleAr: 'CND-2026-00001',
  },
  courseTitleEn: {
    en: 'Course Name (EN)',
    ar: 'اسم الدورة (EN)',
    sampleEn: 'Occupational Health & Safety Level 2',
    sampleAr: 'Occupational Health & Safety Level 2',
  },
  courseTitleAr: {
    en: 'Course Name (AR)',
    ar: 'اسم الدورة (AR)',
    sampleEn: 'السلامة والصحة المهنية — المستوى الثاني',
    sampleAr: 'السلامة والصحة المهنية — المستوى الثاني',
  },
  courseCode: {
    en: 'Course Code',
    ar: 'رمز الدورة',
    sampleEn: 'OHS-201',
    sampleAr: 'OHS-201',
  },
  duration: {
    en: 'Training Duration',
    ar: 'مدة التدريب',
    sampleEn: '5 Days / ٥ أيام',
    sampleAr: '٥ أيام',
  },
  startDate: {
    en: 'Start Date',
    ar: 'تاريخ البدء',
    sampleEn: '2026-05-10',
    sampleAr: '2026-05-10',
  },
  completionDate: {
    en: 'Completion Date',
    ar: 'تاريخ الإتمام',
    sampleEn: '2026-05-14',
    sampleAr: '2026-05-14',
  },
  issueDate: {
    en: 'Issue Date',
    ar: 'تاريخ الإصدار',
    sampleEn: '2026-05-15',
    sampleAr: '2026-05-15',
  },
  expiryDate: {
    en: 'Expiry Date',
    ar: 'تاريخ الانتهاء',
    sampleEn: '2028-05-15',
    sampleAr: '2028-05-15',
  },
  trainerName: {
    en: 'Trainer Name',
    ar: 'اسم المدرب',
    sampleEn: 'Eng. Faisal Al-Qahtani',
    sampleAr: 'م. فيصل القحطاني',
  },
  signatoryName: {
    en: 'Authorized Signatory',
    ar: 'المخول بالتوقيع',
    sampleEn: 'Dr. Khalid Al-Harbi',
    sampleAr: 'د. خالد الحربي',
  },
  certificateNumber: {
    en: 'Certificate Number',
    ar: 'رقم الشهادة',
    sampleEn: 'CERT-2026-000001',
    sampleAr: 'CERT-2026-000001',
  },
  footerText: {
    en: 'Footer Verification Text',
    ar: 'نص التذييل والتحقق',
    sampleEn: 'Verified electronically via official QR verification portal.',
    sampleAr: 'تم التحقق إلكترونياً عبر بوابة التحقق الرسمية.',
  },
  customText: {
    en: 'Custom Static Text',
    ar: 'نص ثابت مخصص',
    sampleEn: 'Accredited Industrial Training Program',
    sampleAr: 'برنامج تدريب صناعي معتمد',
  },
};

export function buildDefaultCertCanvasElements(
  languageMode: CertLanguageMode = 'bilingual',
  borderColor = '#0f172a',
  accentColor = '#0284c7',
  showCandidatePhoto = false
): CertCanvasElement[] {
  const isAr = languageMode === 'ar';
  const isEn = languageMode === 'en';
  return [
    {
      id: 'cert-el-logo',
      type: 'logo',
      label: 'Training Center Logo',
      xPct: 45,
      yPct: 5,
      wPct: 10,
      hPct: 11,
      visible: true,
    },
    {
      id: 'cert-el-photo',
      type: 'photo',
      label: 'Candidate Photo',
      xPct: isAr ? 6 : 84,
      yPct: 7,
      wPct: 10,
      hPct: 16,
      visible: showCandidatePhoto,
    },
    {
      id: 'cert-el-center-en',
      type: 'text',
      fieldKey: 'centerName',
      label: 'Training Center (EN)',
      xPct: 15,
      yPct: 16,
      wPct: 70,
      hPct: 5,
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: accentColor,
      align: 'center',
      visible: !isAr,
    },
    {
      id: 'cert-el-center-ar',
      type: 'text',
      fieldKey: 'centerNameAr',
      label: 'Training Center (AR)',
      xPct: 15,
      yPct: isAr ? 16 : 21,
      wPct: 70,
      hPct: 5,
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: '#334155',
      align: 'center',
      visible: !isEn,
    },
    {
      id: 'cert-el-title-en',
      type: 'text',
      fieldKey: 'certTitle',
      label: 'Certificate Title (EN)',
      xPct: 12,
      yPct: 27,
      wPct: 76,
      hPct: 7,
      fontSize: 20,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: borderColor,
      align: 'center',
      visible: !isAr,
    },
    {
      id: 'cert-el-title-ar',
      type: 'text',
      fieldKey: 'certTitleAr',
      label: 'Certificate Title (AR)',
      xPct: 12,
      yPct: isAr ? 27 : 34,
      wPct: 76,
      hPct: 7,
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: accentColor,
      align: 'center',
      visible: !isEn,
    },
    {
      id: 'cert-el-sub-en',
      type: 'text',
      fieldKey: 'subHeadingEn',
      label: 'Sub-heading (EN)',
      xPct: 18,
      yPct: 42,
      wPct: 64,
      hPct: 4,
      fontSize: 10.5,
      fontWeight: 'normal',
      fontFamily: 'sans',
      color: '#475569',
      align: 'center',
      visible: !isAr,
    },
    {
      id: 'cert-el-sub-ar',
      type: 'text',
      fieldKey: 'subHeadingAr',
      label: 'Sub-heading (AR)',
      xPct: 18,
      yPct: isAr ? 41 : 46,
      wPct: 64,
      hPct: 4,
      fontSize: 10.5,
      fontWeight: 'normal',
      fontFamily: 'arabic',
      color: '#475569',
      align: 'center',
      visible: !isEn,
    },
    {
      id: 'cert-el-cand-en',
      type: 'text',
      fieldKey: 'candidateNameEn',
      label: 'Candidate Name (EN)',
      xPct: 12,
      yPct: 50,
      wPct: 76,
      hPct: 6.5,
      fontSize: 19,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: '#0f172a',
      align: 'center',
      visible: !isAr,
    },
    {
      id: 'cert-el-cand-ar',
      type: 'text',
      fieldKey: 'candidateNameAr',
      label: 'Candidate Name (AR)',
      xPct: 12,
      yPct: isAr ? 49 : 56,
      wPct: 76,
      hPct: 6.5,
      fontSize: 17,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: '#0f172a',
      align: 'center',
      visible: !isEn,
    },
    {
      id: 'cert-el-course-en',
      type: 'text',
      fieldKey: 'courseTitleEn',
      label: 'Course Name (EN)',
      xPct: 12,
      yPct: 63,
      wPct: 76,
      hPct: 5.5,
      fontSize: 14,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: accentColor,
      align: 'center',
      visible: !isAr,
    },
    {
      id: 'cert-el-course-ar',
      type: 'text',
      fieldKey: 'courseTitleAr',
      label: 'Course Name (AR)',
      xPct: 12,
      yPct: isAr ? 61 : 68,
      wPct: 76,
      hPct: 5.5,
      fontSize: 13.5,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: accentColor,
      align: 'center',
      visible: !isEn,
    },
    {
      id: 'cert-el-cert-no',
      type: 'text',
      fieldKey: 'certificateNumber',
      label: 'Certificate Number',
      xPct: 6,
      yPct: 76,
      wPct: 26,
      hPct: 4,
      fontSize: 9,
      fontWeight: 'bold',
      fontFamily: 'mono',
      color: '#0f172a',
      align: 'left',
      visible: true,
    },
    {
      id: 'cert-el-trainer',
      type: 'text',
      fieldKey: 'trainerName',
      label: 'Trainer Name',
      xPct: 6,
      yPct: 80,
      wPct: 26,
      hPct: 4,
      fontSize: 8.5,
      fontWeight: 'normal',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: '#475569',
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'cert-el-issue-date',
      type: 'text',
      fieldKey: 'issueDate',
      label: 'Issue Date',
      xPct: 6,
      yPct: 84,
      wPct: 26,
      hPct: 4,
      fontSize: 8.5,
      fontWeight: 'normal',
      fontFamily: 'mono',
      color: '#475569',
      align: 'left',
      visible: true,
    },
    {
      id: 'cert-el-stamp',
      type: 'stamp',
      label: 'Official Stamp',
      xPct: 39,
      yPct: 76,
      wPct: 10,
      hPct: 13,
      visible: true,
    },
    {
      id: 'cert-el-qr',
      type: 'qr',
      label: 'Verification QR',
      xPct: 51,
      yPct: 76,
      wPct: 10,
      hPct: 13,
      visible: true,
    },
    {
      id: 'cert-el-signature',
      type: 'signature',
      label: 'Authorized Signature',
      xPct: 71,
      yPct: 75,
      wPct: 18,
      hPct: 8,
      visible: true,
    },
    {
      id: 'cert-el-signatory',
      type: 'text',
      fieldKey: 'signatoryName',
      label: 'Authorized Signatory',
      xPct: 68,
      yPct: 84,
      wPct: 24,
      hPct: 4,
      fontSize: 9,
      fontWeight: 'bold',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: '#0f172a',
      align: 'center',
      visible: true,
    },
    {
      id: 'cert-el-footer',
      type: 'text',
      fieldKey: 'footerText',
      label: 'Footer Text',
      xPct: 12,
      yPct: 91,
      wPct: 76,
      hPct: 4,
      fontSize: 7.5,
      fontWeight: 'normal',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: '#64748b',
      align: 'center',
      visible: true,
    },
  ];
}

interface Props {
  config: CertificateTemplateConfig;
  orientation: 'landscape' | 'portrait';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeElements: (next: CertCanvasElement[]) => void;
  logoUrl?: string | null;
  stampUrl?: string | null;
  signatureUrl?: string | null;
  centerNameEn?: string;
  centerNameAr?: string;
  signatoryName?: string;
  lang: 'en' | 'ar';
}

export function CertificateDesignerCanvas({
  config,
  orientation,
  selectedId,
  onSelect,
  onChangeElements,
  logoUrl,
  stampUrl,
  signatureUrl,
  centerNameEn,
  centerNameAr,
  signatoryName,
  lang,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const elements = config.elements || [];
  const langMode = config.languageMode || 'bilingual';

  const sampleText = (el: CertCanvasElement): string => {
    switch (el.fieldKey) {
      case 'customText':
        return el.customText || 'Custom Text';
      case 'centerName':
        return centerNameEn || CERT_FIELD_LABELS.centerName.sampleEn;
      case 'centerNameAr':
        return centerNameAr || CERT_FIELD_LABELS.centerNameAr.sampleAr;
      case 'certTitle':
        return config.headingEn || CERT_FIELD_LABELS.certTitle.sampleEn;
      case 'certTitleAr':
        return config.headingAr || CERT_FIELD_LABELS.certTitleAr.sampleAr;
      case 'subHeadingEn':
        return config.subHeadingEn || CERT_FIELD_LABELS.subHeadingEn.sampleEn;
      case 'subHeadingAr':
        return config.subHeadingAr || CERT_FIELD_LABELS.subHeadingAr.sampleAr;
      case 'signatoryName':
        return signatoryName || CERT_FIELD_LABELS.signatoryName.sampleEn;
      case 'footerText':
        return config.footerText || CERT_FIELD_LABELS.footerText.sampleEn;
      default: {
        const meta = el.fieldKey ? CERT_FIELD_LABELS[el.fieldKey] : null;
        if (!meta) return el.label || 'Field';
        return langMode === 'ar' ? meta.sampleAr : meta.sampleEn;
      }
    }
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    el: CertCanvasElement,
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      id: el.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.xPct,
      origY: el.yPct,
      origW: el.wPct,
      origH: el.hPct,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - dragState.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragState.startY) / rect.height) * 100;

    onChangeElements(
      elements.map((el) => {
        if (el.id !== dragState.id) return el;
        if (dragState.mode === 'move') {
          const nextX = Math.max(
            0,
            Math.min(100 - el.wPct, Number((dragState.origX + dxPct).toFixed(1)))
          );
          const nextY = Math.max(
            0,
            Math.min(100 - el.hPct, Number((dragState.origY + dyPct).toFixed(1)))
          );
          return { ...el, xPct: nextX, yPct: nextY };
        }
        const nextW = Math.max(
          5,
          Math.min(100 - el.xPct, Number((dragState.origW + dxPct).toFixed(1)))
        );
        const nextH = Math.max(
          3.5,
          Math.min(100 - el.yPct, Number((dragState.origH + dyPct).toFixed(1)))
        );
        return { ...el, wPct: nextW, hPct: nextH };
      })
    );
  };

  const handlePointerUp = () => {
    setDragState(null);
  };

  const toggleVisibility = (id: string) => {
    onChangeElements(
      elements.map((el) => (el.id === id ? { ...el, visible: !el.visible } : el))
    );
  };

  const deleteElement = (id: string) => {
    onChangeElements(elements.filter((el) => el.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const aspect = orientation === 'portrait' ? 210 / 297 : 297 / 210;
  const presetBgUri =
    !config.backgroundImageFileId && config.backgroundPresetId
      ? certificateBackgroundLibrary.getSvgDataUri(config.backgroundPresetId, {
          target: 'certificate',
          orientation,
        })
      : null;
  const presetMeta = certificateBackgroundLibrary.getPresetById(config.backgroundPresetId);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        onClick={() => onSelect(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative mx-auto w-full rounded-md overflow-hidden shadow-sm select-none touch-none ${
          orientation === 'portrait' ? 'max-w-[380px]' : 'max-w-[600px]'
        }`}
        style={{
          aspectRatio: String(aspect),
          backgroundColor:
            presetMeta && !config.backgroundImageFileId
              ? presetMeta.baseColor
              : config.backgroundStyle === 'tinted'
              ? '#f8fafc'
              : '#ffffff',
          border: '1px solid #cbd5e1',
        }}
      >
        {presetBgUri && (
          <img
            src={presetBgUri}
            alt="Preset Certificate Background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}
        {config.backgroundImageFileId && (
          <ProtectedImage
            fileId={config.backgroundImageFileId}
            alt="Certificate Background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        {/* Frame preview matching PDFGenerator */}
        {config.borderStyle !== 'minimal' && (
          <div
            className="absolute inset-[2.4%] pointer-events-none"
            style={{
              border: `2px solid ${config.accentColor || '#0f172a'}`,
            }}
          >
            {(config.borderStyle === 'classic' || !config.borderStyle) && (
              <div
                className="absolute inset-[4px] pointer-events-none"
                style={{ border: `1px solid ${config.borderColor || '#b45309'}` }}
              />
            )}
          </div>
        )}

        {/* Subtle alignment grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)',
            backgroundSize: '10% 10%',
          }}
        />

        {elements.map((el) => {
          const isSelected = selectedId === el.id;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => handlePointerDown(e, el, 'move')}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(el.id);
              }}
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                width: `${el.wPct}%`,
                height: `${el.hPct}%`,
                opacity: el.visible ? 1 : 0.28,
              }}
              className={`absolute cursor-move transition-shadow ${
                isSelected
                  ? 'ring-2 ring-sky-600 bg-sky-50/35 z-20'
                  : 'hover:ring-1 hover:ring-slate-400 z-10'
              }`}
            >
              {el.type === 'logo' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300/80 rounded bg-white/60 overflow-hidden">
                  {config.customLogoFileId ? (
                    <ProtectedImage
                      fileId={config.customLogoFileId}
                      alt="Custom Logo"
                      fallbackText="LOGO"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                      fallbackClassName="text-[9px] font-semibold text-slate-500"
                    />
                  ) : logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <span className="text-[9px] font-semibold text-slate-500">LOGO</span>
                  )}
                </div>
              ) : el.type === 'photo' ? (
                <div className="w-full h-full flex items-center justify-center border border-slate-300 rounded bg-slate-100/90 text-[8px] font-semibold text-slate-500">
                  PHOTO
                </div>
              ) : el.type === 'qr' ? (
                <div className="w-full h-full flex items-center justify-center border border-slate-400 rounded bg-white text-[9px] font-mono-tabular font-bold text-slate-700">
                  QR
                </div>
              ) : el.type === 'signature' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300 rounded bg-white/50 overflow-hidden">
                  {config.customSignatureFileId ? (
                    <ProtectedImage
                      fileId={config.customSignatureFileId}
                      alt="Custom Signature"
                      fallbackText="SIGN"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                      fallbackClassName="text-[8px] italic text-slate-500"
                    />
                  ) : signatureUrl ? (
                    <img
                      src={signatureUrl}
                      alt="Signature"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <span className="text-[8px] italic text-slate-500">Signature</span>
                  )}
                </div>
              ) : el.type === 'stamp' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300 rounded-full bg-white/50 overflow-hidden">
                  {config.customStampFileId ? (
                    <ProtectedImage
                      fileId={config.customStampFileId}
                      alt="Custom Stamp"
                      fallbackText="STAMP"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                      fallbackClassName="text-[8px] font-semibold text-slate-500"
                    />
                  ) : stampUrl ? (
                    <img
                      src={stampUrl}
                      alt="Stamp"
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <span className="text-[8px] font-semibold text-slate-500">STAMP</span>
                  )}
                </div>
              ) : (
                <div
                  dir={el.fontFamily === 'arabic' ? 'rtl' : 'ltr'}
                  className="w-full h-full overflow-hidden leading-tight flex items-center"
                  style={{
                    fontSize: `${Math.max(6.5, (el.fontSize || 11) * 0.68)}px`,
                    fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                    color: el.color || '#0f172a',
                    justifyContent:
                      el.align === 'center'
                        ? 'center'
                        : el.align === 'right'
                        ? 'flex-end'
                        : 'flex-start',
                    textAlign: el.align || 'center',
                    fontFamily: el.fontFamily === 'mono' ? 'monospace' : 'inherit',
                  }}
                >
                  <span className="truncate w-full">{sampleText(el)}</span>
                </div>
              )}

              {isSelected && (
                <div
                  onPointerDown={(e) => handlePointerDown(e, el, 'resize')}
                  title="Drag to resize"
                  className="absolute -bottom-1.5 -end-1.5 w-3.5 h-3.5 bg-sky-600 border-2 border-white rounded-sm cursor-nwse-resize shadow"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Compact layer list under canvas */}
      <div className="bg-white border border-slate-200 rounded-md p-2 max-h-36 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
          <span>
            {lang === 'ar' ? 'عناصر الشهادة' : 'Certificate Canvas Elements'} ({elements.length})
          </span>
          <span className="text-[10px] font-normal text-slate-400">
            {lang === 'ar'
              ? 'اسحب للتحريك · المقبض لتغيير الحجم'
              : 'Drag to move · Corner handle to resize'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {elements.map((el) => (
            <div
              key={el.id}
              onClick={() => onSelect(el.id)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border cursor-pointer ${
                selectedId === el.id
                  ? 'border-sky-600 bg-sky-50 text-sky-900 font-medium'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Move className="w-3 h-3 text-slate-400" />
              <span className="max-w-[130px] truncate">
                {el.label || (el.fieldKey ? CERT_FIELD_LABELS[el.fieldKey]?.en : el.type)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(el.id);
                }}
                className="p-0.5 text-slate-500 hover:text-slate-900"
                title={el.visible ? 'Hide' : 'Show'}
              >
                {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElement(el.id);
                }}
                className="p-0.5 text-slate-400 hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
