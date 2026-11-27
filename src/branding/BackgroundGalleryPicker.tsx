import React, { useMemo, useState } from 'react';
import { Check, Layers, Palette, X } from 'lucide-react';
import {
  BACKGROUND_CATEGORY_LABELS,
  certificateBackgroundLibrary,
  type BackgroundCategory,
  type BackgroundPreset,
  type BackgroundRenderTarget,
} from './CertificateBackgroundLibrary';

interface BackgroundGalleryPickerProps {
  target: BackgroundRenderTarget;
  orientation?: 'landscape' | 'portrait';
  selectedPresetId?: string;
  hasCustomImage?: boolean;
  onSelectPreset: (preset: BackgroundPreset, syncPalette: boolean) => void;
  onClearPreset?: () => void;
  lang: 'en' | 'ar';
  readOnly?: boolean;
  columns?: 2 | 3 | 4;
}

export function BackgroundGalleryPicker({
  target,
  orientation = 'landscape',
  selectedPresetId,
  hasCustomImage = false,
  onSelectPreset,
  onClearPreset,
  lang,
  readOnly = false,
  columns = 3,
}: BackgroundGalleryPickerProps) {
  const [category, setCategory] = useState<BackgroundCategory | 'all'>('all');
  const [syncPalette, setSyncPalette] = useState(true);

  const presets = useMemo(
    () => certificateBackgroundLibrary.getPresetsByCategory(category, target),
    [category, target]
  );

  const selectedPreset = useMemo(
    () => certificateBackgroundLibrary.getPresetById(selectedPresetId),
    [selectedPresetId]
  );

  const categories = certificateBackgroundLibrary.getCategories();

  const gridColsClass =
    columns === 4
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
      : columns === 2
      ? 'grid-cols-2'
      : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs font-semibold text-slate-800">
            {lang === 'ar' ? 'مكتبة الخلفيات الجاهزة' : 'Graphic Background Library'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono-tabular">
            ({certificateBackgroundLibrary.getAllPresets(target).length})
          </span>
        </div>

        {!readOnly && selectedPresetId && onClearPreset && (
          <button
            type="button"
            onClick={onClearPreset}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-600 border border-red-200 bg-white rounded hover:bg-red-50 whitespace-nowrap shrink-0"
          >
            <X className="w-3 h-3" />
            <span>{lang === 'ar' ? 'إزالة الخلفية' : 'Clear Preset'}</span>
          </button>
        )}
      </div>

      {/* Category filter bar */}
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

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={syncPalette}
              onChange={(e) => setSyncPalette(e.target.checked)}
            />
            <Palette className="w-3 h-3 text-slate-500" />
            <span>
              {lang === 'ar'
                ? 'تطبيق ألوان التصميم والتباين تلقائياً'
                : 'Sync matching palette & text contrast'}
            </span>
          </label>
          {hasCustomImage && (
            <span className="text-amber-700">
              {lang === 'ar'
                ? 'سيتم استبدال الصورة المرفوعة عند اختيار خلفية'
                : 'Selecting a design replaces custom image'}
            </span>
          )}
        </div>
      )}

      {/* Thumbnail grid */}
      <div className={`grid ${gridColsClass} gap-2.5 max-h-64 overflow-y-auto p-0.5`}>
        {presets.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          const svgUri = certificateBackgroundLibrary.getSvgDataUri(preset.id, {
            target,
            orientation,
            side: 'front',
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
              disabled={readOnly}
              onClick={() => !readOnly && onSelectPreset(preset, syncPalette)}
              title={lang === 'ar' ? preset.descriptionAr : preset.descriptionEn}
              className={`group text-start rounded-md border p-1.5 transition-all bg-white ${
                isSelected
                  ? 'border-slate-900 ring-2 ring-slate-900'
                  : 'border-slate-200 hover:border-slate-400'
              } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div
                className={`relative w-full ${aspectClass} rounded overflow-hidden border border-slate-200`}
                style={{ backgroundColor: preset.baseColor }}
              >
                {svgUri && (
                  <img
                    src={svgUri}
                    alt={lang === 'ar' ? preset.nameAr : preset.nameEn}
                    className="w-full h-full object-cover"
                  />
                )}
                {isSelected && (
                  <span className="absolute top-1 end-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <div className="mt-1.5 px-0.5">
                <div className="text-[11px] font-medium text-slate-900 truncate">
                  {lang === 'ar' ? preset.nameAr : preset.nameEn}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {lang === 'ar'
                    ? BACKGROUND_CATEGORY_LABELS[preset.category].ar
                    : BACKGROUND_CATEGORY_LABELS[preset.category].en}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedPreset && (
        <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span className="truncate">
            <span className="font-medium text-slate-800">
              {lang === 'ar' ? selectedPreset.nameAr : selectedPreset.nameEn}
            </span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span>
              {lang === 'ar' ? selectedPreset.descriptionAr : selectedPreset.descriptionEn}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
