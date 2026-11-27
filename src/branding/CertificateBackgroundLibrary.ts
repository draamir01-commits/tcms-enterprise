export type BackgroundCategory =
  | 'executive'
  | 'heritage'
  | 'industrial'
  | 'modern'
  | 'geometric';

export type BackgroundRenderTarget = 'certificate' | 'card';

export interface BackgroundSvgOptions {
  target: BackgroundRenderTarget;
  orientation?: 'landscape' | 'portrait';
  side?: 'front' | 'back';
  accentColorOverride?: string;
}

export interface BackgroundPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: BackgroundCategory;
  supportedTargets: 'both' | BackgroundRenderTarget;
  baseColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  isDarkSurface: boolean;
  recommendedTextColor: string;
  recommendedSecondaryTextColor: string;
  recommendedHeaderColor: string;
  recommendedAccentColor: string;
  recommendedBorderColor: string;
  isCustom?: boolean;
  renderSvgInner: (w: number, h: number, opts: BackgroundSvgOptions) => string;
}

export const BACKGROUND_CATEGORY_LABELS: Record<
  BackgroundCategory,
  { en: string; ar: string }
> = {
  executive: { en: 'Executive', ar: 'تنفيذي' },
  heritage: { en: 'Saudi Heritage', ar: 'تراثي سعودي' },
  industrial: { en: 'Industrial & HSE', ar: 'صناعي وسلامة' },
  modern: { en: 'Modern', ar: 'حديث' },
  geometric: { en: 'Technical & Grid', ar: 'هندسي وتقني' },
};

function cornerFiligree(
  x: number,
  y: number,
  sx: number,
  sy: number,
  color: string,
  secondary: string,
  scale = 1
): string {
  return `<g transform="translate(${x},${y}) scale(${sx * scale},${sy * scale})">
    <path d="M 0,0 L 68,0 L 68,5 L 5,5 L 5,68 L 0,68 Z" fill="${color}" opacity="0.88"/>
    <path d="M 12,12 L 54,12 L 54,14.5 L 14.5,14.5 L 14.5,54 L 12,54 Z" fill="${secondary}" opacity="0.72"/>
    <circle cx="14" cy="14" r="4.5" fill="none" stroke="${color}" stroke-width="1.6"/>
    <path d="M 24,24 L 44,24 M 24,24 L 24,44" stroke="${color}" stroke-width="1.2" opacity="0.55"/>
    <polygon points="14,7 16,12 21,14 16,16 14,21 12,16 7,14 12,12" fill="${color}" opacity="0.9"/>
  </g>`;
}

function guillocheRosette(cx: number, cy: number, radius: number, stroke: string, opacity = 0.08): string {
  const rings: string[] = [];
  for (let i = 0; i < 18; i++) {
    const angle = (i * 10 * Math.PI) / 180;
    const rx = radius * 0.92;
    const ry = radius * 0.42;
    rings.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${(
        (angle * 180) /
        Math.PI
      ).toFixed(1)} ${cx} ${cy})" fill="none" stroke="${stroke}" stroke-width="0.9" opacity="${opacity}"/>`
    );
  }
  rings.push(
    `<circle cx="${cx}" cy="${cy}" r="${(radius * 0.62).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.2" opacity="${opacity * 1.4}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(radius * 0.96).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 4" opacity="${opacity * 1.3}"/>`
  );
  return rings.join('');
}

function eightPointStar(cx: number, cy: number, r: number, stroke: string, fill: string, opacity = 0.14): string {
  const s = r * 0.707;
  return `<g transform="translate(${cx},${cy})" opacity="${opacity}">
    <rect x="${-s}" y="${-s}" width="${s * 2}" height="${s * 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>
    <rect x="${-s}" y="${-s}" width="${s * 2}" height="${s * 2}" transform="rotate(45)" fill="none" stroke="${stroke}" stroke-width="1.1"/>
    <circle cx="0" cy="0" r="${(r * 0.34).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1"/>
  </g>`;
}

const BUILT_IN_PRESETS: BackgroundPreset[] = [
  {
    id: 'royal-gold-guilloche',
    nameEn: 'Royal Gold Guilloché',
    nameAr: 'الإطار الذهبي الملكي',
    descriptionEn: 'Warm ivory surface with double gold hairline border, corner rosettes, and central guilloché medallion.',
    descriptionAr: 'خلفية عاجية دافئة بإطار ذهبي مزدوج وزخارف زوايا وختم هندسي دقيق.',
    category: 'executive',
    supportedTargets: 'both',
    baseColor: '#FCFBF7',
    primaryColor: '#0F172A',
    secondaryColor: '#B45309',
    accentColor: '#D97706',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#0F172A',
    recommendedAccentColor: '#B45309',
    recommendedBorderColor: '#92400E',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 18 : 26;
      const scale = opts.target === 'card' ? 0.62 : 1.05;
      const r = opts.target === 'card' ? 115 : 195;
      if (opts.target === 'card' && opts.side === 'back') {
        return `
          <rect x="0" y="0" width="${w}" height="${h}" fill="#FCFBF7"/>
          <rect x="0" y="0" width="${w}" height="${h * 0.11}" fill="#0F172A"/>
          <rect x="0" y="${h * 0.11}" width="${w}" height="3" fill="#B45309"/>
          <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#D97706" stroke-width="1" opacity="0.45"/>
        `;
      }
      return `
        <defs>
          <radialGradient id="rg-ivory" cx="50%" cy="48%" r="68%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="100%" stop-color="#F6F1E3"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#rg-ivory)"/>
        ${guillocheRosette(w / 2, h / 2, r, '#B45309', 0.08)}
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#B45309" stroke-width="${opts.target === 'card' ? 2 : 2.5}"/>
        <rect x="${m + 7}" y="${m + 7}" width="${w - (m + 7) * 2}" height="${h - (m + 7) * 2}" fill="none" stroke="#0F172A" stroke-width="0.9" opacity="0.55"/>
        ${cornerFiligree(m, m, 1, 1, '#B45309', '#0F172A', scale)}
        ${cornerFiligree(w - m, m, -1, 1, '#B45309', '#0F172A', scale)}
        ${cornerFiligree(m, h - m, 1, -1, '#B45309', '#0F172A', scale)}
        ${cornerFiligree(w - m, h - m, -1, -1, '#B45309', '#0F172A', scale)}
      `;
    },
  },
  {
    id: 'najdi-geometric-emerald',
    nameEn: 'Najdi Heritage Emerald',
    nameAr: 'الزخرفة النجدية الزمردية',
    descriptionEn: 'Saudi emerald and gold 8-point Najdi star tessellation frame with crisp alabaster field.',
    descriptionAr: 'زخرفة هندسية نجدية مستوحاة من التراث السعودي باللون الأخضر الزمردي والذهبي.',
    category: 'heritage',
    supportedTargets: 'both',
    baseColor: '#F9FBF9',
    primaryColor: '#065F46',
    secondaryColor: '#B45309',
    accentColor: '#059669',
    isDarkSurface: false,
    recommendedTextColor: '#064E3B',
    recommendedSecondaryTextColor: '#334155',
    recommendedHeaderColor: '#065F46',
    recommendedAccentColor: '#059669',
    recommendedBorderColor: '#065F46',
    renderSvgInner: (w, h, opts) => {
      const band = opts.target === 'card' ? 14 : 22;
      const step = opts.target === 'card' ? 38 : 48;
      const diamonds: string[] = [];
      for (let x = band + step / 2; x < w - band; x += step) {
        diamonds.push(`<polygon points="${x},${band / 2 - 4} ${x + 5},${band / 2} ${x},${band / 2 + 4} ${x - 5},${band / 2}" fill="#D97706" opacity="0.85"/>`);
        diamonds.push(`<polygon points="${x},${h - band / 2 - 4} ${x + 5},${h - band / 2} ${x},${h - band / 2 + 4} ${x - 5},${h - band / 2}" fill="#D97706" opacity="0.85"/>`);
      }
      if (opts.target === 'card' && opts.side === 'back') {
        return `
          <rect x="0" y="0" width="${w}" height="${h}" fill="#F9FBF9"/>
          <rect x="0" y="0" width="${w}" height="${h * 0.12}" fill="#065F46"/>
          <rect x="0" y="${h * 0.12}" width="${w}" height="3" fill="#D97706"/>
          ${eightPointStar(w - 72, h / 2 + 12, 42, '#065F46', '#10B981', 0.08)}
        `;
      }
      return `
        <rect x="0" y="0" width="${w}" height="${h}" fill="#F9FBF9"/>
        <rect x="0" y="0" width="${w}" height="${band}" fill="#065F46"/>
        <rect x="0" y="${h - band}" width="${w}" height="${band}" fill="#065F46"/>
        <rect x="0" y="0" width="${band * 0.55}" height="${h}" fill="#065F46" opacity="0.9"/>
        <rect x="${w - band * 0.55}" y="0" width="${band * 0.55}" height="${h}" fill="#065F46" opacity="0.9"/>
        ${diamonds.join('')}
        <rect x="${band * 0.85}" y="${band + 6}" width="${w - band * 1.7}" height="${h - (band + 6) * 2}" fill="none" stroke="#B45309" stroke-width="1.3"/>
        ${eightPointStar(w / 2, h / 2, opts.target === 'card' ? 92 : 165, '#065F46', '#059669', 0.055)}
        ${eightPointStar(band + 26, band + 28, opts.target === 'card' ? 12 : 18, '#065F46', '#D97706', 0.3)}
        ${eightPointStar(w - band - 26, band + 28, opts.target === 'card' ? 12 : 18, '#065F46', '#D97706', 0.3)}
        ${eightPointStar(band + 26, h - band - 28, opts.target === 'card' ? 12 : 18, '#065F46', '#D97706', 0.3)}
        ${eightPointStar(w - band - 26, h - band - 28, opts.target === 'card' ? 12 : 18, '#065F46', '#D97706', 0.3)}
      `;
    },
  },
  {
    id: 'executive-navy-ribbon',
    nameEn: 'Executive Navy Ribbon',
    nameAr: 'الشريط الكحلي التنفيذي',
    descriptionEn: 'Clean white canvas framed by architectural midnight-navy corner sashes and brushed gold accents.',
    descriptionAr: 'تصميم تنفيذي أبيض بأشرطة زوايا كحلية وخطوط ذهبية متناسقة.',
    category: 'executive',
    supportedTargets: 'both',
    baseColor: '#FFFFFF',
    primaryColor: '#0F172A',
    secondaryColor: '#1D4ED8',
    accentColor: '#CA8A04',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#334155',
    recommendedHeaderColor: '#0F172A',
    recommendedAccentColor: '#1D4ED8',
    recommendedBorderColor: '#0F172A',
    renderSvgInner: (w, h, opts) => {
      const corner = opts.target === 'card' ? 105 : 175;
      if (opts.target === 'card' && opts.side === 'back') {
        return `
          <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
          <rect x="0" y="0" width="${w}" height="${h * 0.12}" fill="#0F172A"/>
          <polygon points="${w - 85},${h} ${w},${h - 85} ${w},${h}" fill="#0F172A" opacity="0.9"/>
          <polygon points="${w - 98},${h} ${w},${h - 98} ${w},${h - 90} ${w - 90},${h}" fill="#CA8A04"/>
        `;
      }
      return `
        <defs>
          <linearGradient id="navy-sash" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#1E3A8A"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
        <polygon points="0,0 ${corner},0 0,${corner}" fill="url(#navy-sash)"/>
        <polygon points="${corner + 8},0 ${corner + 20},0 0,${corner + 20} 0,${corner + 8}" fill="#CA8A04"/>
        <polygon points="${w},${h} ${w - corner},${h} ${w},${h - corner}" fill="url(#navy-sash)"/>
        <polygon points="${w - corner - 8},${h} ${w - corner - 20},${h} ${w},${h - corner - 20} ${w},${h - corner - 8}" fill="#CA8A04"/>
        <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="#CBD5E1" stroke-width="1"/>
        <rect x="26" y="26" width="${w - 52}" height="${h - 52}" fill="none" stroke="#0F172A" stroke-width="0.8" opacity="0.35"/>
      `;
    },
  },
  {
    id: 'industrial-slate-chevron',
    nameEn: 'Industrial Safety Chevron',
    nameAr: 'تصميم السلامة الصناعية',
    descriptionEn: 'Technical slate blueprint surface with safety-amber chevron edge strips and precision corner brackets.',
    descriptionAr: 'خلفية تقنية للسلامة الصناعية بشرائط تحذيرية هندسية وزوايا دقيقة.',
    category: 'industrial',
    supportedTargets: 'both',
    baseColor: '#F8FAFC',
    primaryColor: '#1E293B',
    secondaryColor: '#D97706',
    accentColor: '#F59E0B',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#1E293B',
    recommendedAccentColor: '#D97706',
    recommendedBorderColor: '#1E293B',
    renderSvgInner: (w, h, opts) => {
      const stripH = opts.target === 'card' ? 10 : 14;
      const step = opts.target === 'card' ? 24 : 32;
      const stripes: string[] = [];
      for (let x = -step; x < w + step; x += step) {
        stripes.push(
          `<polygon points="${x},0 ${x + step * 0.5},0 ${x + step * 0.28},${stripH} ${x - step * 0.22},${stripH}" fill="#F59E0B" opacity="0.85"/>`,
          `<polygon points="${x},${h - stripH} ${x + step * 0.5},${h - stripH} ${x + step * 0.28},${h} ${x - step * 0.22},${h}" fill="#F59E0B" opacity="0.85"/>`
        );
      }
      return `
        <defs>
          <pattern id="tech-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.9" fill="#94A3B8" opacity="0.32"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="#F8FAFC"/>
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#tech-dots)"/>
        <rect x="0" y="0" width="${w}" height="${stripH}" fill="#1E293B"/>
        <rect x="0" y="${h - stripH}" width="${w}" height="${stripH}" fill="#1E293B"/>
        ${stripes.join('')}
        <rect x="18" y="${stripH + 10}" width="${w - 36}" height="${h - (stripH + 10) * 2}" fill="none" stroke="#CBD5E1" stroke-width="1"/>
        <path d="M 18,${stripH + 34} L 18,${stripH + 10} L 42,${stripH + 10}" fill="none" stroke="#1E293B" stroke-width="2.5"/>
        <path d="M ${w - 42},${stripH + 10} L ${w - 18},${stripH + 10} L ${w - 18},${stripH + 34}" fill="none" stroke="#1E293B" stroke-width="2.5"/>
        <path d="M 18,${h - stripH - 34} L 18,${h - stripH - 10} L 42,${h - stripH - 10}" fill="none" stroke="#1E293B" stroke-width="2.5"/>
        <path d="M ${w - 42},${h - stripH - 10} L ${w - 18},${h - stripH - 10} L ${w - 18},${h - stripH - 34}" fill="none" stroke="#1E293B" stroke-width="2.5"/>
      `;
    },
  },
  {
    id: 'crimson-safety-crest',
    nameEn: 'Fire & HSE Crimson Crest',
    nameAr: 'شعار السلامة ومكافحة الحرائق',
    descriptionEn: 'Asymmetric crimson and charcoal architectural frame designed for Fire Safety & Emergency certifications.',
    descriptionAr: 'إطار معماري باللون القرمزي والرمادي الداكن مخصص لبرامج السلامة ومكافحة الحرائق.',
    category: 'industrial',
    supportedTargets: 'both',
    baseColor: '#FFFFFF',
    primaryColor: '#991B1B',
    secondaryColor: '#1E293B',
    accentColor: '#DC2626',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#991B1B',
    recommendedAccentColor: '#DC2626',
    recommendedBorderColor: '#991B1B',
    renderSvgInner: (w, h, opts) => {
      const bar = opts.target === 'card' ? 16 : 24;
      const cx = w / 2;
      const cy = h / 2;
      const s = opts.target === 'card' ? 52 : 90;
      return `
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
        <rect x="0" y="0" width="${bar}" height="${h}" fill="#991B1B"/>
        <rect x="${bar}" y="0" width="${bar * 0.28}" height="${h}" fill="#1E293B"/>
        <polygon points="${w - (opts.target === 'card' ? 110 : 185)},0 ${w},0 ${w},${opts.target === 'card' ? 75 : 120}" fill="#991B1B" opacity="0.92"/>
        <polygon points="${w - (opts.target === 'card' ? 128 : 210)},0 ${w - (opts.target === 'card' ? 114 : 190)},0 ${w},${opts.target === 'card' ? 78 : 124} ${w},${opts.target === 'card' ? 90 : 140}" fill="#1E293B" opacity="0.8"/>
        <path d="M ${cx},${cy - s} L ${cx + s * 0.78},${cy - s * 0.55} L ${cx + s * 0.78},${cy + s * 0.12} C ${cx + s * 0.78},${cy + s * 0.68} ${cx},${cy + s} ${cx},${cy + s} C ${cx},${cy + s} ${cx - s * 0.78},${cy + s * 0.68} ${cx - s * 0.78},${cy + s * 0.12} L ${cx - s * 0.78},${cy - s * 0.55} Z" fill="#991B1B" opacity="0.04" stroke="#991B1B" stroke-width="1.5" stroke-opacity="0.1"/>
        <rect x="${bar + 16}" y="16" width="${w - bar - 32}" height="${h - 32}" fill="none" stroke="#E2E8F0" stroke-width="1.2"/>
      `;
    },
  },
  {
    id: 'sapphire-wave-modern',
    nameEn: 'Modern Sapphire Wave',
    nameAr: 'الأمواج الزرقاء الحديثة',
    descriptionEn: 'Clean contemporary white backdrop with layered translucent cobalt and sky-blue Bezier waves.',
    descriptionAr: 'خلفية عصرية بيضاء بأمواج زرقاء متدرجة بانسيابية احترافية.',
    category: 'modern',
    supportedTargets: 'both',
    baseColor: '#FFFFFF',
    primaryColor: '#1E3A8A',
    secondaryColor: '#0284C7',
    accentColor: '#0EA5E9',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#334155',
    recommendedHeaderColor: '#1E3A8A',
    recommendedAccentColor: '#0284C7',
    recommendedBorderColor: '#1E3A8A',
    renderSvgInner: (w, h) => {
      return `
        <defs>
          <linearGradient id="sap-g1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#1E3A8A"/>
            <stop offset="100%" stop-color="#0284C7"/>
          </linearGradient>
          <linearGradient id="sap-g2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0284C7" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#38BDF8" stop-opacity="0.08"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
        <path d="M 0,0 L ${w},0 L ${w},${h * 0.14} Q ${w * 0.68},${h * 0.22} ${w * 0.35},${h * 0.11} T 0,${h * 0.16} Z" fill="url(#sap-g2)"/>
        <path d="M 0,0 L ${w},0 L ${w},${h * 0.07} Q ${w * 0.65},${h * 0.13} ${w * 0.3},${h * 0.06} T 0,${h * 0.09} Z" fill="url(#sap-g1)" opacity="0.92"/>
        <path d="M 0,${h} L ${w},${h} L ${w},${h * 0.84} Q ${w * 0.7},${h * 0.92} ${w * 0.35},${h * 0.86} T 0,${h * 0.89} Z" fill="url(#sap-g2)"/>
        <path d="M 0,${h} L ${w},${h} L ${w},${h * 0.93} Q ${w * 0.62},${h * 0.98} ${w * 0.32},${h * 0.93} T 0,${h * 0.95} Z" fill="url(#sap-g1)" opacity="0.9"/>
        <rect x="18" y="18" width="${w - 36}" height="${h - 36}" fill="none" stroke="#0284C7" stroke-width="0.9" opacity="0.35"/>
      `;
    },
  },
  {
    id: 'silver-platinum-grid',
    nameEn: 'Platinum Precision Grid',
    nameAr: 'الشبكة البلاتينية الدقيقة',
    descriptionEn: 'Cool titanium-pearl surface with architectural micro-grid, precision perimeter ticks, and metallic corner plates.',
    descriptionAr: 'تصميم بلاتيني هادئ بشبكة هندسية دقيقة وزوايا معدنية أنيقة.',
    category: 'geometric',
    supportedTargets: 'both',
    baseColor: '#F8FAFC',
    primaryColor: '#334155',
    secondaryColor: '#64748B',
    accentColor: '#0369A1',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#334155',
    recommendedAccentColor: '#0369A1',
    recommendedBorderColor: '#475569',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 16 : 24;
      const plate = opts.target === 'card' ? 28 : 44;
      return `
        <defs>
          <pattern id="plat-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#CBD5E1" stroke-width="0.6" opacity="0.45"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="#F8FAFC"/>
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="url(#plat-grid)"/>
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#64748B" stroke-width="1.5"/>
        <rect x="${m + 5}" y="${m + 5}" width="${w - (m + 5) * 2}" height="${h - (m + 5) * 2}" fill="none" stroke="#0369A1" stroke-width="0.7" opacity="0.55"/>
        <polygon points="${m},${m} ${m + plate},${m} ${m},${m + plate}" fill="#334155"/>
        <polygon points="${w - m},${m} ${w - m - plate},${m} ${w - m},${m + plate}" fill="#334155"/>
        <polygon points="${m},${h - m} ${m + plate},${h - m} ${m},${h - m - plate}" fill="#334155"/>
        <polygon points="${w - m},${h - m} ${w - m - plate},${h - m} ${w - m},${h - m - plate}" fill="#334155"/>
      `;
    },
  },
  {
    id: 'desert-sandstone-frame',
    nameEn: 'Desert Sandstone Heritage',
    nameAr: 'إطار الرمال التراثي',
    descriptionEn: 'Warm parchment field with stepped Najdi sandstone border bands and bronze corner arches.',
    descriptionAr: 'خلفية ورقية دافئة مستوحاة من العمارة النجدية الرملية بحدود برونزية أنيقة.',
    category: 'heritage',
    supportedTargets: 'both',
    baseColor: '#FAF7F2',
    primaryColor: '#78350F',
    secondaryColor: '#A16207',
    accentColor: '#B45309',
    isDarkSurface: false,
    recommendedTextColor: '#451A03',
    recommendedSecondaryTextColor: '#78350F',
    recommendedHeaderColor: '#78350F',
    recommendedAccentColor: '#B45309',
    recommendedBorderColor: '#78350F',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 14 : 22;
      return `
        <defs>
          <radialGradient id="sand-glow" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stop-color="#FFFDF9"/>
            <stop offset="100%" stop-color="#F2EAE0"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#sand-glow)"/>
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#92400E" stroke-width="2.2"/>
        <rect x="${m + 8}" y="${m + 8}" width="${w - (m + 8) * 2}" height="${h - (m + 8) * 2}" fill="none" stroke="#D6C7B2" stroke-width="4"/>
        <rect x="${m + 14}" y="${m + 14}" width="${w - (m + 14) * 2}" height="${h - (m + 14) * 2}" fill="none" stroke="#78350F" stroke-width="0.9" opacity="0.65"/>
        <path d="M ${w * 0.32},${m + 14} L ${w * 0.5},${m + 2} L ${w * 0.68},${m + 14}" fill="none" stroke="#B45309" stroke-width="1.5"/>
        <path d="M ${w * 0.32},${h - m - 14} L ${w * 0.5},${h - m - 2} L ${w * 0.68},${h - m - 14}" fill="none" stroke="#B45309" stroke-width="1.5"/>
      `;
    },
  },
  {
    id: 'obsidian-gold-luxury',
    nameEn: 'Obsidian & Gold Prestige',
    nameAr: 'الأسود الملكي والذهب',
    descriptionEn: 'Deep obsidian executive backdrop with luminous metallic gold border, halo gradient, and ornate corner filigree.',
    descriptionAr: 'تصميم فاخر باللون الأسود الداكن وإطار ذهبي لامع وتدرج ضوئي مركزي.',
    category: 'executive',
    supportedTargets: 'both',
    baseColor: '#0B1120',
    primaryColor: '#F59E0B',
    secondaryColor: '#FDE68A',
    accentColor: '#FBBF24',
    isDarkSurface: true,
    recommendedTextColor: '#F8FAFC',
    recommendedSecondaryTextColor: '#CBD5E1',
    recommendedHeaderColor: '#0F172A',
    recommendedAccentColor: '#FBBF24',
    recommendedBorderColor: '#F59E0B',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 16 : 26;
      const scale = opts.target === 'card' ? 0.58 : 1;
      const r = opts.target === 'card' ? 105 : 185;
      return `
        <defs>
          <radialGradient id="obs-halo" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stop-color="#1E293B"/>
            <stop offset="100%" stop-color="#090E1A"/>
          </radialGradient>
          <linearGradient id="gold-foil" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FDE68A"/>
            <stop offset="50%" stop-color="#D97706"/>
            <stop offset="100%" stop-color="#FBBF24"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#obs-halo)"/>
        ${guillocheRosette(w / 2, h / 2, r, '#F59E0B', 0.08)}
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="url(#gold-foil)" stroke-width="${opts.target === 'card' ? 2 : 2.5}"/>
        <rect x="${m + 7}" y="${m + 7}" width="${w - (m + 7) * 2}" height="${h - (m + 7) * 2}" fill="none" stroke="#FDE68A" stroke-width="0.7" opacity="0.45"/>
        ${cornerFiligree(m, m, 1, 1, '#F59E0B', '#FDE68A', scale)}
        ${cornerFiligree(w - m, m, -1, 1, '#F59E0B', '#FDE68A', scale)}
        ${cornerFiligree(m, h - m, 1, -1, '#F59E0B', '#FDE68A', scale)}
        ${cornerFiligree(w - m, h - m, -1, -1, '#F59E0B', '#FDE68A', scale)}
      `;
    },
  },
  {
    id: 'teal-iso-technical',
    nameEn: 'ISO Technical Teal',
    nameAr: 'التصميم التقني المعتمد',
    descriptionEn: 'Engineering-grade white canvas with deep teal side columns, technical hexagon nodes, and clean perimeter lines.',
    descriptionAr: 'خلفية تقنية حديثة بشريط جانبي أخضر مزرق وأشكال سداسية هندسية.',
    category: 'geometric',
    supportedTargets: 'both',
    baseColor: '#FFFFFF',
    primaryColor: '#115E59',
    secondaryColor: '#0D9488',
    accentColor: '#14B8A6',
    isDarkSurface: false,
    recommendedTextColor: '#0F172A',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#115E59',
    recommendedAccentColor: '#0D9488',
    recommendedBorderColor: '#115E59',
    renderSvgInner: (w, h, opts) => {
      const hex = (cx: number, cy: number, r: number, stroke: string, op: number) => {
        const pts: string[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="1.2" opacity="${op}"/>`;
      };
      const barW = opts.target === 'card' ? 14 : 22;
      const r = opts.target === 'card' ? 22 : 34;
      return `
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
        <rect x="0" y="0" width="${barW}" height="${h}" fill="#115E59"/>
        <rect x="${barW}" y="0" width="4" height="${h}" fill="#14B8A6"/>
        <rect x="${w - barW}" y="0" width="${barW}" height="${h}" fill="#115E59" opacity="0.14"/>
        <rect x="${barW + 14}" y="16" width="${w - barW * 2 - 28}" height="${h - 32}" fill="none" stroke="#CCFBF1" stroke-width="1.4"/>
        ${hex(w - barW - r * 1.4, r * 1.4, r, '#0D9488', 0.22)}
        ${hex(w - barW - r * 2.9, r * 2.2, r * 0.72, '#115E59', 0.16)}
        ${hex(barW + r * 1.6, h - r * 1.4, r, '#0D9488', 0.22)}
        ${hex(barW + r * 3.1, h - r * 2.2, r * 0.72, '#115E59', 0.16)}
      `;
    },
  },
  {
    id: 'burgundy-academic-seal',
    nameEn: 'Academic Burgundy Seal',
    nameAr: 'الختم الأكاديمي العنابي',
    descriptionEn: 'Classic ivory credential design with deep burgundy ribbon accent, antique gold rule, and seal medallion.',
    descriptionAr: 'تصميم أكاديمي كلاسيكي باللون العنابي الداكن والذهبي العتيق.',
    category: 'executive',
    supportedTargets: 'both',
    baseColor: '#FEFDFB',
    primaryColor: '#7F1D1D',
    secondaryColor: '#B45309',
    accentColor: '#991B1B',
    isDarkSurface: false,
    recommendedTextColor: '#1E293B',
    recommendedSecondaryTextColor: '#475569',
    recommendedHeaderColor: '#7F1D1D',
    recommendedAccentColor: '#991B1B',
    recommendedBorderColor: '#7F1D1D',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 16 : 24;
      const ribW = opts.target === 'card' ? 32 : 52;
      const ribX = opts.target === 'card' ? 36 : 58;
      return `
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FEFDFB"/>
        <polygon points="${ribX},0 ${ribX + ribW},0 ${ribX + ribW},${h * 0.28} ${ribX + ribW / 2},${h * 0.21} ${ribX},${h * 0.28}" fill="#7F1D1D" opacity="0.92"/>
        <polygon points="${ribX + 5},0 ${ribX + ribW - 5},0 ${ribX + ribW - 5},${h * 0.255} ${ribX + ribW / 2},${h * 0.19} ${ribX + 5},${h * 0.255}" fill="none" stroke="#F59E0B" stroke-width="1"/>
        <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#7F1D1D" stroke-width="2"/>
        <rect x="${m + 6}" y="${m + 6}" width="${w - (m + 6) * 2}" height="${h - (m + 6) * 2}" fill="none" stroke="#B45309" stroke-width="0.9"/>
        ${guillocheRosette(w / 2, h / 2, opts.target === 'card' ? 88 : 155, '#7F1D1D', 0.055)}
      `;
    },
  },
  {
    id: 'nordic-minimal-hairline',
    nameEn: 'Minimalist Studio Frame',
    nameAr: 'الإطار البسيط العصري',
    descriptionEn: 'Ultra-clean alabaster surface with asymmetric offset border, precision crosshairs, and subtle sky-blue bar.',
    descriptionAr: 'تصميم عصري فائق النظافة بإطار رفيع متداخل وعلامات دقة هندسية.',
    category: 'modern',
    supportedTargets: 'both',
    baseColor: '#FFFFFF',
    primaryColor: '#18181B',
    secondaryColor: '#0284C7',
    accentColor: '#0284C7',
    isDarkSurface: false,
    recommendedTextColor: '#18181B',
    recommendedSecondaryTextColor: '#52525B',
    recommendedHeaderColor: '#18181B',
    recommendedAccentColor: '#0284C7',
    recommendedBorderColor: '#18181B',
    renderSvgInner: (w, h, opts) => {
      const m = opts.target === 'card' ? 18 : 28;
      const off = opts.target === 'card' ? 5 : 8;
      return `
        <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF"/>
        <rect x="0" y="0" width="${w}" height="${opts.target === 'card' ? 5 : 7}" fill="#0284C7"/>
        <rect x="${m}" y="${m}" width="${w - m * 2 - off}" height="${h - m * 2 - off}" fill="none" stroke="#18181B" stroke-width="1.2" opacity="0.85"/>
        <rect x="${m + off}" y="${m + off}" width="${w - m * 2 - off}" height="${h - m * 2 - off}" fill="none" stroke="#94A3B8" stroke-width="0.8" opacity="0.7"/>
        <line x1="${m - 8}" y1="${m}" x2="${m + 10}" y2="${m}" stroke="#0284C7" stroke-width="1.5"/>
        <line x1="${m}" y1="${m - 8}" x2="${m}" y2="${m + 10}" stroke="#0284C7" stroke-width="1.5"/>
        <line x1="${w - m - 10}" y1="${h - m}" x2="${w - m + 8}" y2="${h - m}" stroke="#0284C7" stroke-width="1.5"/>
        <line x1="${w - m}" y1="${h - m - 10}" x2="${w - m}" y2="${h - m + 8}" stroke="#0284C7" stroke-width="1.5"/>
      `;
    },
  },
];

export class CertificateBackgroundLibraryService {
  private presets: Map<string, BackgroundPreset> = new Map();

  constructor(initialPresets: BackgroundPreset[] = BUILT_IN_PRESETS) {
    for (const preset of initialPresets) {
      this.presets.set(preset.id, preset);
    }
  }

  getAllPresets(target?: BackgroundRenderTarget): BackgroundPreset[] {
    const list = Array.from(this.presets.values());
    if (!target) return list;
    return list.filter((p) => p.supportedTargets === 'both' || p.supportedTargets === target);
  }

  getPresetById(id?: string | null): BackgroundPreset | undefined {
    if (!id) return undefined;
    return this.presets.get(id);
  }

  getPresetsByCategory(
    category: BackgroundCategory | 'all',
    target?: BackgroundRenderTarget
  ): BackgroundPreset[] {
    const all = this.getAllPresets(target);
    if (category === 'all') return all;
    return all.filter((p) => p.category === category);
  }

  getCategories(): Array<{ id: BackgroundCategory; labelEn: string; labelAr: string }> {
    return (Object.keys(BACKGROUND_CATEGORY_LABELS) as BackgroundCategory[]).map((id) => ({
      id,
      labelEn: BACKGROUND_CATEGORY_LABELS[id].en,
      labelAr: BACKGROUND_CATEGORY_LABELS[id].ar,
    }));
  }

  registerPreset(preset: BackgroundPreset): void {
    this.presets.set(preset.id, preset);
  }

  unregisterPreset(id: string): boolean {
    const existing = this.presets.get(id);
    if (!existing || !existing.isCustom) return false;
    return this.presets.delete(id);
  }

  getDimensions(opts: BackgroundSvgOptions): { width: number; height: number } {
    if (opts.target === 'card') {
      return { width: 856, height: 540 };
    }
    return opts.orientation === 'portrait'
      ? { width: 707, height: 1000 }
      : { width: 1000, height: 707 };
  }

  buildSvgMarkup(presetId: string | undefined | null, opts: BackgroundSvgOptions): string | null {
    const preset = this.getPresetById(presetId);
    if (!preset) return null;
    const { width, height } = this.getDimensions(opts);
    const inner = preset.renderSvgInner(width, height, opts);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${inner}</svg>`;
  }

  getSvgDataUri(presetId: string | undefined | null, opts: BackgroundSvgOptions): string | null {
    const svg = this.buildSvgMarkup(presetId, opts);
    if (!svg) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  getCssBackgroundStyle(
    presetId: string | undefined | null,
    opts: BackgroundSvgOptions
  ): {
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundRepeat?: string;
  } {
    const preset = this.getPresetById(presetId);
    const dataUri = this.getSvgDataUri(presetId, opts);
    if (!preset || !dataUri) return {};
    return {
      backgroundColor: preset.baseColor,
      backgroundImage: `url("${dataUri}")`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
}

export const certificateBackgroundLibrary = new CertificateBackgroundLibraryService();
