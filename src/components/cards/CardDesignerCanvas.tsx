import React, { useRef, useState } from 'react';
import { Move, Trash2, Eye, EyeOff } from 'lucide-react';
import type {
  CardCanvasElement,
  CardElementType,
  CardFieldKey,
  CardLanguageMode,
  CardTemplateConfig,
} from '../../types/tcms';
import { ProtectedImage } from '../ui/ProtectedImage';
import { certificateBackgroundLibrary } from '../../branding/CertificateBackgroundLibrary';

export const CARD_FIELD_LABELS: Record<CardFieldKey, { en: string; ar: string; sampleEn: string; sampleAr: string }> = {
  centerName: {
    en: 'Training Center (EN)',
    ar: 'اسم المركز (EN)',
    sampleEn: 'National Safety Academy',
    sampleAr: 'National Safety Academy',
  },
  centerNameAr: {
    en: 'Training Center (AR)',
    ar: 'اسم المركز (AR)',
    sampleEn: 'أكاديمية السلامة الوطنية',
    sampleAr: 'أكاديمية السلامة الوطنية',
  },
  cardTitle: {
    en: 'Training Card Title',
    ar: 'عنوان البطاقة',
    sampleEn: 'TRAINING CARD',
    sampleAr: 'بطاقة تدريب',
  },
  candidateNameEn: {
    en: 'Candidate Name (EN)',
    ar: 'اسم المتدرب (EN)',
    sampleEn: 'Tariq Al-Mansoor',
    sampleAr: 'Tariq Al-Mansoor',
  },
  candidateNameAr: {
    en: 'Candidate Name (AR)',
    ar: 'اسم المتدرب (AR)',
    sampleEn: 'طارق المنصور',
    sampleAr: 'طارق المنصور',
  },
  candidateId: {
    en: 'Candidate ID',
    ar: 'رقم المتدرب',
    sampleEn: 'CND-2026-00001',
    sampleAr: 'CND-2026-00001',
  },
  iqamaMasked: {
    en: 'Masked Iqama',
    ar: 'الإقامة المخفاة',
    sampleEn: '******1234',
    sampleAr: '******1234',
  },
  courseTitleEn: {
    en: 'Course Name (EN)',
    ar: 'اسم الدورة (EN)',
    sampleEn: 'Industrial Fire Safety & Rescue',
    sampleAr: 'Industrial Fire Safety & Rescue',
  },
  courseTitleAr: {
    en: 'Course Name (AR)',
    ar: 'اسم الدورة (AR)',
    sampleEn: 'السلامة من الحرائق والإنقاذ',
    sampleAr: 'السلامة من الحرائق والإنقاذ',
  },
  courseCode: {
    en: 'Course Code',
    ar: 'رمز الدورة',
    sampleEn: 'FS-101',
    sampleAr: 'FS-101',
  },
  batchNumber: {
    en: 'Batch ID',
    ar: 'رقم الدفعة',
    sampleEn: 'BTH-2026-0001',
    sampleAr: 'BTH-2026-0001',
  },
  trainerName: {
    en: 'Trainer Name',
    ar: 'اسم المدرب',
    sampleEn: 'Eng. Faisal Al-Qahtani',
    sampleAr: 'م. فيصل القحطاني',
  },
  startDate: {
    en: 'Start Date',
    ar: 'تاريخ البدء',
    sampleEn: '2026-05-10',
    sampleAr: '2026-05-10',
  },
  endDate: {
    en: 'End Date',
    ar: 'تاريخ الانتهاء',
    sampleEn: '2026-05-14',
    sampleAr: '2026-05-14',
  },
  trainingDates: {
    en: 'Training Dates',
    ar: 'تواريخ التدريب',
    sampleEn: '2026-05-10 - 2026-05-14',
    sampleAr: '2026-05-10 - 2026-05-14',
  },
  venue: {
    en: 'Training Venue',
    ar: 'موقع التدريب',
    sampleEn: 'Riyadh Academy - Hall A',
    sampleAr: 'أكاديمية الرياض - قاعة أ',
  },
  cardSerialNumber: {
    en: 'Training Card Number',
    ar: 'رقم البطاقة',
    sampleEn: 'CARD-2026-0001',
    sampleAr: 'CARD-2026-0001',
  },
  customText: {
    en: 'Custom Static Text',
    ar: 'نص ثابت مخصص',
    sampleEn: 'Authorized Trainee ID Card',
    sampleAr: 'بطاقة تعريف متدرب معتمدة',
  },
};

export function buildDefaultCanvasElements(
  languageMode: CardLanguageMode = 'bilingual',
  headerColor = '#0f172a',
  accentColor = '#0284c7'
): CardCanvasElement[] {
  const isAr = languageMode === 'ar';
  const isEn = languageMode === 'en';
  const common: CardCanvasElement[] = [
    {
      id: 'el-logo',
      side: 'front',
      type: 'logo',
      label: 'Company Logo',
      xPct: isAr ? 84 : 3,
      yPct: 4,
      wPct: 12,
      hPct: 18,
      visible: true,
    },
    {
      id: 'el-center-name',
      side: 'front',
      type: 'text',
      fieldKey: isAr ? 'centerNameAr' : 'centerName',
      label: isAr ? 'Center Name (AR)' : 'Center Name (EN)',
      xPct: isAr ? 6 : 17,
      yPct: 4,
      wPct: 76,
      hPct: 10,
      fontSize: 7.5,
      fontWeight: 'bold',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: headerColor,
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-card-title',
      side: 'front',
      type: 'text',
      fieldKey: 'cardTitle',
      label: 'Card Title',
      xPct: isAr ? 6 : 17,
      yPct: 14,
      wPct: 76,
      hPct: 8,
      fontSize: 5.8,
      fontWeight: 'bold',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: accentColor,
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-photo',
      side: 'front',
      type: 'photo',
      label: 'Candidate Photo',
      xPct: isAr ? 76 : 4,
      yPct: 27,
      wPct: 19,
      hPct: 37,
      visible: true,
    },
    {
      id: 'el-cand-en',
      side: 'front',
      type: 'text',
      fieldKey: 'candidateNameEn',
      label: 'Candidate Name (EN)',
      xPct: isAr ? 5 : 26,
      yPct: 27,
      wPct: 68,
      hPct: 10,
      fontSize: 8,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: '#0f172a',
      align: 'left',
      visible: !isAr,
    },
    {
      id: 'el-cand-ar',
      side: 'front',
      type: 'text',
      fieldKey: 'candidateNameAr',
      label: 'Candidate Name (AR)',
      xPct: isAr ? 5 : 26,
      yPct: isAr ? 27 : 36,
      wPct: 68,
      hPct: 10,
      fontSize: 7.5,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: '#334155',
      align: 'right',
      visible: !isEn,
    },
    {
      id: 'el-cand-id',
      side: 'front',
      type: 'text',
      fieldKey: 'candidateId',
      label: 'Candidate ID',
      xPct: isAr ? 5 : 26,
      yPct: 46,
      wPct: 45,
      hPct: 8,
      fontSize: 6.2,
      fontWeight: 'bold',
      fontFamily: 'mono',
      color: '#475569',
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-course-en',
      side: 'front',
      type: 'text',
      fieldKey: isAr ? 'courseTitleAr' : 'courseTitleEn',
      label: isAr ? 'Course Name (AR)' : 'Course Name (EN)',
      xPct: isAr ? 5 : 26,
      yPct: 55,
      wPct: 68,
      hPct: 9,
      fontSize: 6.6,
      fontWeight: 'bold',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: accentColor,
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-trainer',
      side: 'front',
      type: 'text',
      fieldKey: 'trainerName',
      label: 'Trainer Name',
      xPct: 4,
      yPct: 67,
      wPct: 66,
      hPct: 8,
      fontSize: 5.6,
      fontWeight: 'normal',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: '#475569',
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-dates',
      side: 'front',
      type: 'text',
      fieldKey: 'trainingDates',
      label: 'Training Dates',
      xPct: 4,
      yPct: 76,
      wPct: 48,
      hPct: 8,
      fontSize: 5.6,
      fontWeight: 'normal',
      fontFamily: 'mono',
      color: '#475569',
      align: 'left',
      visible: true,
    },
    {
      id: 'el-serial',
      side: 'front',
      type: 'text',
      fieldKey: 'cardSerialNumber',
      label: 'Card Number',
      xPct: 4,
      yPct: 86,
      wPct: 48,
      hPct: 9,
      fontSize: 6,
      fontWeight: 'bold',
      fontFamily: 'mono',
      color: '#0f172a',
      align: 'left',
      visible: true,
    },
    {
      id: 'el-stamp',
      side: 'front',
      type: 'stamp',
      label: 'Company Stamp',
      xPct: 54,
      yPct: 72,
      wPct: 14,
      hPct: 22,
      visible: true,
    },
    {
      id: 'el-signature',
      side: 'front',
      type: 'signature',
      label: 'Authorized Signature',
      xPct: 69,
      yPct: 78,
      wPct: 14,
      hPct: 14,
      visible: true,
    },
    {
      id: 'el-qr-front',
      side: 'front',
      type: 'qr',
      label: 'QR Code',
      xPct: 84,
      yPct: 67,
      wPct: 13,
      hPct: 25,
      visible: true,
    },
    // BACK SIDE
    {
      id: 'el-back-qr',
      side: 'back',
      type: 'qr',
      label: 'QR Code (Back)',
      xPct: 5,
      yPct: 22,
      wPct: 26,
      hPct: 46,
      visible: true,
    },
    {
      id: 'el-back-course-en',
      side: 'back',
      type: 'text',
      fieldKey: 'courseTitleEn',
      label: 'Course Name (EN)',
      xPct: 35,
      yPct: 22,
      wPct: 60,
      hPct: 10,
      fontSize: 6.8,
      fontWeight: 'bold',
      fontFamily: 'sans',
      color: '#0f172a',
      align: 'left',
      visible: !isAr,
    },
    {
      id: 'el-back-course-ar',
      side: 'back',
      type: 'text',
      fieldKey: 'courseTitleAr',
      label: 'Course Name (AR)',
      xPct: 35,
      yPct: isAr ? 22 : 33,
      wPct: 60,
      hPct: 10,
      fontSize: 6.5,
      fontWeight: 'bold',
      fontFamily: 'arabic',
      color: '#334155',
      align: 'right',
      visible: !isEn,
    },
    {
      id: 'el-back-batch',
      side: 'back',
      type: 'text',
      fieldKey: 'batchNumber',
      label: 'Batch ID',
      xPct: 35,
      yPct: 46,
      wPct: 60,
      hPct: 9,
      fontSize: 5.8,
      fontWeight: 'normal',
      fontFamily: 'mono',
      color: '#475569',
      align: 'left',
      visible: true,
    },
    {
      id: 'el-back-venue',
      side: 'back',
      type: 'text',
      fieldKey: 'venue',
      label: 'Training Venue',
      xPct: 35,
      yPct: 57,
      wPct: 60,
      hPct: 9,
      fontSize: 5.8,
      fontWeight: 'normal',
      fontFamily: isAr ? 'arabic' : 'sans',
      color: '#475569',
      align: isAr ? 'right' : 'left',
      visible: true,
    },
    {
      id: 'el-back-serial',
      side: 'back',
      type: 'text',
      fieldKey: 'cardSerialNumber',
      label: 'Card Number',
      xPct: 5,
      yPct: 76,
      wPct: 50,
      hPct: 9,
      fontSize: 6,
      fontWeight: 'bold',
      fontFamily: 'mono',
      color: '#0f172a',
      align: 'left',
      visible: true,
    },
    {
      id: 'el-back-stamp',
      side: 'back',
      type: 'stamp',
      label: 'Stamp (Back)',
      xPct: 78,
      yPct: 66,
      wPct: 16,
      hPct: 26,
      visible: true,
    },
  ];
  return common;
}

interface Props {
  config: CardTemplateConfig;
  widthMm: number;
  heightMm: number;
  side: 'front' | 'back';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeElements: (next: CardCanvasElement[]) => void;
  logoUrl?: string | null;
  stampUrl?: string | null;
  signatureUrl?: string | null;
  centerNameEn?: string;
  centerNameAr?: string;
  lang: 'en' | 'ar';
}

export function CardDesignerCanvas({
  config,
  widthMm,
  heightMm,
  side,
  selectedId,
  onSelect,
  onChangeElements,
  logoUrl,
  stampUrl,
  signatureUrl,
  centerNameEn,
  centerNameAr,
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

  const elements = (config.elements || []).filter((el) => el.side === side);
  const langMode = config.languageMode || 'bilingual';

  const sampleText = (el: CardCanvasElement): string => {
    if (el.fieldKey === 'customText') return el.customText || 'Custom Text';
    if (el.fieldKey === 'centerName') return centerNameEn || CARD_FIELD_LABELS.centerName.sampleEn;
    if (el.fieldKey === 'centerNameAr') return centerNameAr || CARD_FIELD_LABELS.centerNameAr.sampleAr;
    if (el.fieldKey === 'cardTitle') {
      const en = config.cardTitleEn || 'TRAINING CARD';
      const ar = config.cardTitleAr || 'بطاقة تدريب';
      if (langMode === 'ar') return ar;
      if (langMode === 'en') return en;
      return `${en} · ${ar}`;
    }
    const meta = el.fieldKey ? CARD_FIELD_LABELS[el.fieldKey] : null;
    if (!meta) return el.label || 'Field';
    return langMode === 'ar' ? meta.sampleAr : meta.sampleEn;
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    el: CardCanvasElement,
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
      (config.elements || []).map((el) => {
        if (el.id !== dragState.id) return el;
        if (dragState.mode === 'move') {
          const nextX = Math.max(0, Math.min(100 - el.wPct, Number((dragState.origX + dxPct).toFixed(1))));
          const nextY = Math.max(0, Math.min(100 - el.hPct, Number((dragState.origY + dyPct).toFixed(1))));
          return { ...el, xPct: nextX, yPct: nextY };
        }
        const nextW = Math.max(6, Math.min(100 - el.xPct, Number((dragState.origW + dxPct).toFixed(1))));
        const nextH = Math.max(5, Math.min(100 - el.yPct, Number((dragState.origH + dyPct).toFixed(1))));
        return { ...el, wPct: nextW, hPct: nextH };
      })
    );
  };

  const handlePointerUp = () => {
    setDragState(null);
  };

  const toggleVisibility = (id: string) => {
    onChangeElements(
      (config.elements || []).map((el) => (el.id === id ? { ...el, visible: !el.visible } : el))
    );
  };

  const deleteElement = (id: string) => {
    onChangeElements((config.elements || []).filter((el) => el.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const aspect = Math.max(0.5, (widthMm || 85.6) / (heightMm || 53.98));
  const presetBgUri =
    !config.backgroundImageFileId && config.backgroundPresetId
      ? certificateBackgroundLibrary.getSvgDataUri(config.backgroundPresetId, {
          target: 'card',
          side,
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
        className="relative mx-auto w-full max-w-[460px] rounded-lg border border-slate-300 overflow-hidden shadow-sm select-none touch-none"
        style={{
          aspectRatio: String(aspect),
          backgroundColor:
            presetMeta && !config.backgroundImageFileId
              ? presetMeta.baseColor
              : side === 'front'
              ? config.backgroundColor || '#ffffff'
              : '#ffffff',
        }}
      >
        {presetBgUri && (
          <img
            src={presetBgUri}
            alt="Preset Card Background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}
        {side === 'front' && config.backgroundImageFileId && (
          <ProtectedImage
            fileId={config.backgroundImageFileId}
            alt="Template Background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}
        {side === 'back' && !presetBgUri && (
          <div
            className="absolute top-0 inset-x-0 h-[10%] pointer-events-none"
            style={{ backgroundColor: config.headerColor || '#0f172a' }}
          />
        )}

        {/* Subtle alignment grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.2) 1px, transparent 1px)',
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
                opacity: el.visible ? 1 : 0.3,
              }}
              className={`absolute cursor-move transition-shadow ${
                isSelected
                  ? 'ring-2 ring-sky-600 bg-sky-50/30 z-20'
                  : 'hover:ring-1 hover:ring-slate-400 z-10'
              }`}
            >
              {el.type === 'logo' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300/80 rounded bg-white/60 overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain pointer-events-none" />
                  ) : (
                    <span className="text-[8px] font-semibold text-slate-500">LOGO</span>
                  )}
                </div>
              ) : el.type === 'photo' ? (
                <div className="w-full h-full flex items-center justify-center border border-slate-300 rounded bg-slate-100/90 text-[8px] font-semibold text-slate-500">
                  PHOTO
                </div>
              ) : el.type === 'qr' ? (
                <div className="w-full h-full flex items-center justify-center border border-slate-400 rounded bg-white text-[8px] font-mono-tabular font-bold text-slate-700">
                  QR
                </div>
              ) : el.type === 'signature' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300 rounded bg-white/50 overflow-hidden">
                  {signatureUrl ? (
                    <img src={signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain pointer-events-none" />
                  ) : (
                    <span className="text-[7px] italic text-slate-500">Signature</span>
                  )}
                </div>
              ) : el.type === 'stamp' ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-300 rounded-full bg-white/50 overflow-hidden">
                  {stampUrl ? (
                    <img src={stampUrl} alt="Stamp" className="max-w-full max-h-full object-contain pointer-events-none" />
                  ) : (
                    <span className="text-[7px] font-semibold text-slate-500">STAMP</span>
                  )}
                </div>
              ) : (
                <div
                  dir={el.fontFamily === 'arabic' ? 'rtl' : 'ltr'}
                  className="w-full h-full overflow-hidden leading-tight flex items-center"
                  style={{
                    fontSize: `${Math.max(7, (el.fontSize || 7) * 1.45)}px`,
                    fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                    color: el.color || '#0f172a',
                    justifyContent:
                      el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
                    textAlign: el.align || 'left',
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
            {side === 'front'
              ? lang === 'ar'
                ? 'عناصر الوجه الأمامي'
                : 'Front Side Elements'
              : lang === 'ar'
              ? 'عناصر الوجه الخلفي'
              : 'Back Side Elements'}{' '}
            ({elements.length})
          </span>
          <span className="text-[10px] font-normal text-slate-400">
            {lang === 'ar' ? 'اسحب للتحريك أو تغيير الحجم' : 'Drag to move · Corner handle to resize'}
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
              <span className="max-w-[120px] truncate">
                {el.label || (el.fieldKey ? CARD_FIELD_LABELS[el.fieldKey]?.en : el.type)}
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
