import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import bidiFactory from 'bidi-js';
import type {
  AttendanceRecord,
  Batch,
  Candidate,
  CardTemplate,
  Certificate,
  CertificateTemplate,
  CompanySettings,
  Course,
  TrainingCard,
} from '../src/types/tcms.ts';
import { readFileBufferSafe, readPrivateFileAsync } from './fileVault.ts';
import { drawPresetBackgroundPdf } from './pdfBackgroundRenderer.ts';

const bidi = bidiFactory();

function pickFirstExistingFont(candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

const FONT_AR_REG = pickFirstExistingFont([
  '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoKufiArabic-Regular.ttf',
]);
const FONT_AR_BOLD = pickFirstExistingFont([
  '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf',
  FONT_AR_REG,
]);
const FONT_LATIN_REG = pickFirstExistingFont([
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]);
const FONT_LATIN_BOLD = pickFirstExistingFont([
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  FONT_LATIN_REG,
]);

type FontKitFace = {
  hasGlyphForCodePoint?: (cp: number) => boolean;
};

type CachedFontFace = {
  fk: FontKitFace;
  ascender: number;
  hasGlyphFn: boolean;
};

type PdfDocInternal = PDFKit.PDFDocument & {
  _font?: { ascender: number; descender: number; font: FontKitFace };
  _fontSize?: number;
};

interface CachedFontMeta {
  latinRegName: string;
  latinBoldName: string;
  arabicRegName: string;
  arabicBoldName: string;
  faces: Record<string, CachedFontFace>;
}

const docFontMetaCache = new WeakMap<PDFKit.PDFDocument, CachedFontMeta>();

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function faceHasGlyph(face: CachedFontFace | undefined, cp: number, isArabicFace: boolean): boolean {
  if (!face || !face.fk) return false;
  if (face.hasGlyphFn && typeof face.fk.hasGlyphForCodePoint === 'function') {
    try {
      return Boolean(face.fk.hasGlyphForCodePoint(cp));
    } catch {
      return false;
    }
  }
  if (isArabicFace) return false;
  return cp >= 0x20 && cp <= 0xff;
}

function registerFonts(doc: PDFKit.PDFDocument) {
  const faces: Record<string, CachedFontFace> = {};

  const recordFace = (fontKey: string) => {
    const internal = doc as PdfDocInternal;
    if (internal._font) {
      const fk = internal._font.font;
      faces[fontKey] = {
        fk,
        ascender: internal._font.ascender || 1000,
        hasGlyphFn: typeof fk?.hasGlyphForCodePoint === 'function',
      };
    }
  };

  const reg = (name: string, filePath: string, fallback: string): string => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        doc.registerFont(name, filePath);
        doc.font(name);
        recordFace(name);
        return name;
      } catch {
        // Fall back to standard or previously registered font if TTF registration fails
      }
    }
    doc.font(fallback);
    if (!faces[fallback]) {
      recordFace(fallback);
    }
    return fallback;
  };

  const latinRegName = reg('LatinRegular', FONT_LATIN_REG, 'Helvetica');
  const latinBoldName = reg('LatinBold', FONT_LATIN_BOLD, 'Helvetica-Bold');
  const arabicRegName = reg('ArabicRegular', FONT_AR_REG, latinRegName);
  const arabicBoldName = reg('ArabicBold', FONT_AR_BOLD, latinBoldName);

  docFontMetaCache.set(doc, {
    latinRegName,
    latinBoldName,
    arabicRegName,
    arabicBoldName,
    faces,
  });
}

function fontName(isArabic: boolean, bold = false): string {
  if (isArabic) {
    if (bold && FONT_AR_BOLD) return 'ArabicBold';
    if (FONT_AR_REG) return 'ArabicRegular';
  }
  if (bold && FONT_LATIN_BOLD) return 'LatinBold';
  if (FONT_LATIN_REG) return 'LatinRegular';
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

function detectBaseDir(text: string, forceArabic?: boolean): 'rtl' | 'ltr' {
  for (const ch of text) {
    const t = bidi.getBidiCharTypeName(ch);
    if (t === 'R' || t === 'AL') return 'rtl';
    if (t === 'L') return 'ltr';
  }
  return forceArabic ? 'rtl' : 'ltr';
}

interface VisualRun {
  text: string;
  font: string;
  ascender: number;
}

function buildVisualFontRuns(
  line: string,
  meta: CachedFontMeta,
  bold: boolean,
  forceArabic?: boolean
): VisualRun[] {
  if (!line) return [];
  const latFontName = bold ? meta.latinBoldName : meta.latinRegName;
  const arFontName = bold ? meta.arabicBoldName : meta.arabicRegName;
  const latFace = meta.faces[latFontName];
  const arFace = meta.faces[arFontName];

  if (!latFace || !arFace) {
    const chosen = forceArabic || containsArabic(line) ? arFontName : latFontName;
    return [{ text: line, font: chosen, ascender: meta.faces[chosen]?.ascender || 1069 }];
  }

  const hasDistinctArabicFont = arFontName !== latFontName && arFace.hasGlyphFn;

  const baseDir = detectBaseDir(line, forceArabic);
  const lv = bidi.getEmbeddingLevels(line, baseDir);
  const visualIdx = bidi.getReorderedIndices(line, lv);

  const parityGroups: Array<{ isRtl: boolean; chars: string[] }> = [];
  for (let v = 0; v < visualIdx.length; v += 1) {
    const logIdx = visualIdx[v];
    const isRtl = lv.levels[logIdx] % 2 === 1;
    const rawCh = line[logIdx];
    const last = parityGroups[parityGroups.length - 1];
    if (last && last.isRtl === isRtl) {
      last.chars.push(rawCh);
    } else {
      parityGroups.push({ isRtl, chars: [rawCh] });
    }
  }

  const runs: VisualRun[] = [];
  for (const g of parityGroups) {
    if (!g.isRtl) {
      for (const ch of g.chars) {
        const cp = ch.codePointAt(0) || 32;
        const useAr =
          hasDistinctArabicFont &&
          !faceHasGlyph(latFace, cp, false) &&
          faceHasGlyph(arFace, cp, true);
        const targetFont = useAr ? arFontName : latFontName;
        const asc = useAr ? arFace.ascender : latFace.ascender;
        const last = runs[runs.length - 1];
        if (last && last.font === targetFont) {
          last.text += ch;
        } else {
          runs.push({ text: ch, font: targetFont, ascender: asc });
        }
      }
    } else {
      const subRuns: Array<{ useAr: boolean; chars: string[] }> = [];
      for (const rawCh of g.chars) {
        const cp = rawCh.codePointAt(0) || 32;
        const useAr = hasDistinctArabicFont && faceHasGlyph(arFace, cp, true);
        const ch = useAr ? rawCh : bidi.getMirroredCharacter(rawCh) ?? rawCh;
        const last = subRuns[subRuns.length - 1];
        if (last && last.useAr === useAr) {
          last.chars.push(ch);
        } else {
          subRuns.push({ useAr, chars: [ch] });
        }
      }
      for (const sr of subRuns) {
        if (sr.useAr) {
          // Reverse visual RTL slice back to logical Arabic order so fontkit executes OpenType shaping natively
          runs.push({
            text: sr.chars.slice().reverse().join(''),
            font: arFontName,
            ascender: arFace.ascender,
          });
        } else {
          runs.push({
            text: sr.chars.join(''),
            font: latFontName,
            ascender: latFace.ascender,
          });
        }
      }
    }
  }
  return runs;
}

function measureRunsWidth(
  doc: PDFKit.PDFDocument,
  runs: VisualRun[]
): { totalWidth: number; widths: number[]; maxAscender: number } {
  let totalWidth = 0;
  let maxAscender = 0;
  const widths: number[] = [];
  for (const r of runs) {
    doc.font(r.font);
    const w = doc.widthOfString(r.text);
    widths.push(w);
    totalWidth += w;
    if (r.ascender > maxAscender) maxAscender = r.ascender;
  }
  return { totalWidth, widths, maxAscender: maxAscender || 1069 };
}

function wrapMixedParagraph(
  doc: PDFKit.PDFDocument,
  paragraph: string,
  maxWidth: number,
  meta: CachedFontMeta,
  bold: boolean,
  forceArabic?: boolean
): string[] {
  if (!paragraph) return [''];
  const fullRuns = buildVisualFontRuns(paragraph, meta, bold, forceArabic);
  if (measureRunsWidth(doc, fullRuns).totalWidth <= maxWidth) {
    return [paragraph];
  }

  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [paragraph];

  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    const candidateWidth = measureRunsWidth(
      doc,
      buildVisualFontRuns(candidate, meta, bold, forceArabic)
    ).totalWidth;
    if (candidateWidth <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawTextSmart(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: PDFKit.Mixins.TextOptions & { bold?: boolean; forceArabic?: boolean } = {}
) {
  if (!text) return;
  const hasAr = Boolean(options.forceArabic || containsArabic(text));
  const meta = docFontMetaCache.get(doc);

  if (!hasAr || !meta) {
    const chosenFont = meta
      ? hasAr
        ? options.bold
          ? meta.arabicBoldName
          : meta.arabicRegName
        : options.bold
          ? meta.latinBoldName
          : meta.latinRegName
      : fontName(hasAr, options.bold);
    doc.font(chosenFont);
    doc.text(text, x, y, options);
    return;
  }

  const bold = Boolean(options.bold);
  const fontSize = (doc as PdfDocInternal)._fontSize || 12;
  const maxWidth = typeof options.width === 'number' && options.width > 0 ? options.width : 0;
  const align = options.align || 'left';
  const allowWrap = options.lineBreak !== false && maxWidth > 0;
  const lineHeight = fontSize * 1.32;
  const maxHeight = typeof options.height === 'number' && options.height > 0 ? options.height : Infinity;

  const paragraphs = String(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (allowWrap) {
      lines.push(...wrapMixedParagraph(doc, p, maxWidth, meta, bold, options.forceArabic));
    } else {
      lines.push(p);
    }
  }

  let cursorY = y;
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (idx > 0 && cursorY - y + lineHeight > maxHeight + 2) break;
    const line = lines[idx];
    if (line) {
      const runs = buildVisualFontRuns(line, meta, bold, options.forceArabic);
      const { totalWidth, widths, maxAscender } = measureRunsWidth(doc, runs);
      let startX = x;
      if (maxWidth > 0) {
        if (align === 'right') startX = x + maxWidth - totalWidth;
        else if (align === 'center') startX = x + (maxWidth - totalWidth) / 2;
      }
      let curX = startX;
      for (let rIdx = 0; rIdx < runs.length; rIdx += 1) {
        const r = runs[rIdx];
        const baselineShift = ((maxAscender - r.ascender) / 1000) * fontSize;
        doc.font(r.font).text(r.text, curX, cursorY + baselineShift, { lineBreak: false });
        curX += widths[rIdx];
      }
    }
    cursorY += lineHeight;
  }
}

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

async function makeQrBuffer(content: string, sizePx = 220): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    type: 'png',
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function tryImage(
  doc: PDFKit.PDFDocument,
  buf: Buffer | null,
  x: number,
  y: number,
  opts: PDFKit.Mixins.ImageOption
) {
  if (!buf || buf.length === 0) return false;
  try {
    doc.image(buf, x, y, opts);
    return true;
  } catch {
    return false;
  }
}

import type {
  CardCanvasElement,
  CardFieldKey,
  CardTemplateConfig,
  CertCanvasElement,
  CertFieldKey,
  CertificateTemplateConfig,
} from '../src/types/tcms.ts';

function resolveCardFieldValue(
  fieldKey: CardFieldKey | undefined,
  customText: string | undefined,
  card: TrainingCard,
  company: CompanySettings,
  cfg: Partial<CardTemplateConfig>
): string {
  const snap = card.snapshot;
  const langMode = cfg.languageMode || 'bilingual';
  switch (fieldKey) {
    case 'customText':
      return customText || '';
    case 'centerName':
      return snap.companyNameEn || company.nameEn || 'Training Center';
    case 'centerNameAr':
      return snap.companyNameAr || company.nameAr || '';
    case 'cardTitle': {
      const en = snap.cardTitleEn || cfg.cardTitleEn || 'TRAINING CARD';
      const ar = snap.cardTitleAr || cfg.cardTitleAr || 'بطاقة تدريب';
      if (langMode === 'ar') return ar;
      if (langMode === 'en') return en;
      return [en, ar].filter(Boolean).join(' · ');
    }
    case 'candidateNameEn':
      return snap.candidateNameEn || '';
    case 'candidateNameAr':
      return snap.candidateNameAr || '';
    case 'candidateId':
      return card.candidateId || '';
    case 'iqamaMasked':
      return snap.iqamaMasked || '';
    case 'courseTitleEn':
      return snap.courseTitleEn || '';
    case 'courseTitleAr':
      return snap.courseTitleAr || '';
    case 'courseCode':
      return snap.courseCode || '';
    case 'batchNumber':
      return snap.batchNumber || '';
    case 'trainerName': {
      const en = snap.trainerNameEn || '';
      const ar = snap.trainerNameAr || '';
      if (langMode === 'ar') return ar || en;
      if (langMode === 'en') return en || ar;
      return en && ar && en !== ar ? `${en} / ${ar}` : en || ar;
    }
    case 'startDate':
      return snap.startDate || '';
    case 'endDate':
      return snap.endDate || '';
    case 'trainingDates':
      return `${snap.startDate || ''} - ${snap.endDate || ''}`;
    case 'venue':
      return snap.venue || '';
    case 'cardSerialNumber':
      return card.cardSerialNumber || '';
    default:
      return customText || '';
  }
}

export async function generateTrainingCardPdf(params: {
  cards: TrainingCard[];
  company: CompanySettings;
  template?: CardTemplate | null;
  verifyBaseUrl: string;
  idToken?: string;
  tenantId?: string;
}): Promise<Buffer> {
  const { cards, company, template, verifyBaseUrl, idToken, tenantId } = params;
  const firstSnap = cards[0]?.snapshot;
  const initialW = mmToPt(template?.widthMm || firstSnap?.templateWidthMm || 85.6);
  const initialH = mmToPt(template?.heightMm || firstSnap?.templateHeightMm || 53.98);

  const doc = new PDFDocument({
    size: [initialW, initialH],
    margin: 0,
    autoFirstPage: false,
  });
  registerFonts(doc);
  const bufferPromise = collectPdfBuffer(doc);

  const imageCache = new Map<string, Buffer | null>();
  const resolvedTenantId = tenantId || company.tenantId || cards[0]?.tenantId;
  const preloadIds = new Set<string>();
  if (company.logoFileId) preloadIds.add(company.logoFileId);
  if (company.stampFileId) preloadIds.add(company.stampFileId);
  if (company.signatureFileId) preloadIds.add(company.signatureFileId);
  if (template?.config?.backgroundImageFileId) preloadIds.add(template.config.backgroundImageFileId);
  for (const c of cards) {
    const s = c.snapshot;
    if (s.companyLogoFileId) preloadIds.add(s.companyLogoFileId);
    if (s.stampFileId) preloadIds.add(s.stampFileId);
    if (s.signatureFileId) preloadIds.add(s.signatureFileId);
    if (s.photoFileId) preloadIds.add(s.photoFileId);
    if (s.templateConfigSnapshot?.backgroundImageFileId) {
      preloadIds.add(s.templateConfigSnapshot.backgroundImageFileId);
    }
  }
  await Promise.all(
    Array.from(preloadIds).map(async (fileId) => {
      const asyncFound = await readPrivateFileAsync(fileId, idToken, resolvedTenantId).catch(() => null);
      imageCache.set(fileId, asyncFound?.buffer || readFileBufferSafe(fileId));
    })
  );

  const getCachedFile = (fileId?: string): Buffer | null => {
    if (!fileId) return null;
    if (!imageCache.has(fileId)) {
      imageCache.set(fileId, readFileBufferSafe(fileId));
    }
    return imageCache.get(fileId) || null;
  };

  for (const card of cards) {
    const snap = card.snapshot;
    const effectiveConfig: Partial<CardTemplateConfig> =
      template?.config || snap.templateConfigSnapshot || {};
    const widthPt = mmToPt(template?.widthMm || snap.templateWidthMm || 85.6);
    const heightPt = mmToPt(template?.heightMm || snap.templateHeightMm || 53.98);

    const langMode = effectiveConfig.languageMode || template?.languageMode || 'bilingual';
    const headerColor = effectiveConfig.headerColor || company.primaryColor || '#0F172A';
    const accentColor = effectiveConfig.accentColor || company.secondaryColor || '#0284C7';
    const bgColor = effectiveConfig.backgroundColor || '#FFFFFF';
    const showBack = effectiveConfig.showBackSide !== false;
    const showMaskedIqama = effectiveConfig.showMaskedIqama !== false;
    const showDates = effectiveConfig.showDates !== false;
    const showTrainer = effectiveConfig.showTrainer !== false;
    const showVenue = effectiveConfig.showVenue !== false;
    const showSignature = Boolean(effectiveConfig.showSignature);
    const showStamp = Boolean(effectiveConfig.showStamp);
    const footerText = effectiveConfig.footerText || company.cardFooter || '';

    const logoBuf = getCachedFile(snap.companyLogoFileId || company.logoFileId);
    const stampBuf = getCachedFile(snap.stampFileId || company.stampFileId);
    const sigBuf = getCachedFile(snap.signatureFileId || company.signatureFileId);
    const bgImgBuf = getCachedFile(effectiveConfig.backgroundImageFileId);
    const photoBuf = getCachedFile(snap.photoFileId);

    const qrUrl = `${verifyBaseUrl}/?card=${encodeURIComponent(card.cardSerialNumber)}&t=${encodeURIComponent(card.qrTokenHash.slice(0, 16))}`;
    const qrBuf = await makeQrBuffer(qrUrl, 180);

    const customElements =
      effectiveConfig.useCustomLayout && Array.isArray(effectiveConfig.elements)
        ? effectiveConfig.elements.filter((el: CardCanvasElement) => el.visible !== false)
        : null;

    if (customElements && customElements.length > 0) {
      const renderSide = (side: 'front' | 'back') => {
        doc.addPage({ size: [widthPt, heightPt], margin: 0 });
        const hasPreset =
          !bgImgBuf && effectiveConfig.backgroundPresetId
            ? drawPresetBackgroundPdf(doc, effectiveConfig.backgroundPresetId, widthPt, heightPt, 'card', side)
            : false;
        if (!hasPreset) {
          doc.rect(0, 0, widthPt, heightPt).fill(side === 'front' ? bgColor : '#FFFFFF');
          if (side === 'front' && bgImgBuf) {
            tryImage(doc, bgImgBuf, 0, 0, { width: widthPt, height: heightPt });
          } else if (side === 'back') {
            doc.rect(0, 0, widthPt, 14).fill(headerColor);
          }
        }

        const sideEls = customElements.filter((el) => el.side === side);
        for (const el of sideEls) {
          const x = (Math.max(0, Math.min(100, el.xPct)) / 100) * widthPt;
          const y = (Math.max(0, Math.min(100, el.yPct)) / 100) * heightPt;
          const w = Math.max(8, (Math.max(1, Math.min(100, el.wPct)) / 100) * widthPt);
          const h = Math.max(8, (Math.max(1, Math.min(100, el.hPct)) / 100) * heightPt);

          if (el.type === 'logo') {
            tryImage(doc, logoBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' });
          } else if (el.type === 'photo') {
            doc.save();
            doc.roundedRect(x, y, w, h, 3).lineWidth(0.75).strokeColor('#CBD5E1').stroke();
            doc.restore();
            if (!tryImage(doc, photoBuf, x + 1, y + 1, { fit: [w - 2, h - 2], align: 'center', valign: 'center' })) {
              doc.fillColor('#94A3B8').fontSize(6);
              drawTextSmart(doc, 'PHOTO', x, y + h / 2 - 3, { width: w, align: 'center', lineBreak: false });
            }
          } else if (el.type === 'qr') {
            const sideLen = Math.min(w, h);
            tryImage(doc, qrBuf, x + (w - sideLen) / 2, y + (h - sideLen) / 2, {
              width: sideLen,
              height: sideLen,
            });
          } else if (el.type === 'signature') {
            if (!tryImage(doc, sigBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' })) {
              doc.moveTo(x + 2, y + h - 4).lineTo(x + w - 2, y + h - 4).lineWidth(0.6).strokeColor('#64748B').stroke();
            }
          } else if (el.type === 'stamp') {
            tryImage(doc, stampBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' });
          } else {
            const val = resolveCardFieldValue(el.fieldKey, el.customText, card, company, effectiveConfig);
            if (!val) continue;
            doc.fillColor(el.color || '#0F172A').fontSize(el.fontSize || 7);
            drawTextSmart(doc, val, x, y, {
              width: w,
              height: h,
              align: el.align || (el.fontFamily === 'arabic' ? 'right' : 'left'),
              bold: el.fontWeight === 'bold',
              forceArabic: el.fontFamily === 'arabic',
            });
          }
        }
      };

      renderSide('front');
      if (showBack && customElements.some((el) => el.side === 'back')) {
        renderSide('back');
      } else if (showBack) {
        // Fallback standard back side if user toggled showBackSide without placing back elements
        doc.addPage({ size: [widthPt, heightPt], margin: 0 });
        doc.rect(0, 0, widthPt, heightPt).fill('#FFFFFF');
        doc.rect(0, 0, widthPt, 18).fill(headerColor);
        tryImage(doc, qrBuf, 12, 28, { width: 64, height: 64 });
        doc.fillColor('#0F172A').fontSize(6.5);
        drawTextSmart(doc, snap.courseTitleEn, 84, 30, { width: widthPt - 94, bold: true });
        if (langMode !== 'en' && snap.courseTitleAr) {
          doc.fillColor('#334155').fontSize(6.5);
          drawTextSmart(doc, snap.courseTitleAr, 84, 42, { width: widthPt - 94, align: 'right' });
        }
        doc.fillColor('#475569').fontSize(5.8);
        drawTextSmart(doc, `Serial: ${card.cardSerialNumber}`, 84, 58, { width: widthPt - 94 });
        drawTextSmart(doc, `Batch: ${snap.batchNumber}`, 84, 68, { width: widthPt - 94 });
        if (snap.venue) {
          drawTextSmart(doc, `Venue: ${snap.venue}`, 84, 78, { width: widthPt - 94 });
        }
      }
      continue;
    }

    // CLASSIC STRUCTURED LAYOUT (Respects languageMode, background preset/image, trainer, venue, signature & stamp)
    doc.addPage({ size: [widthPt, heightPt], margin: 0 });
    const hasClassicPreset =
      !bgImgBuf && effectiveConfig.backgroundPresetId
        ? drawPresetBackgroundPdf(doc, effectiveConfig.backgroundPresetId, widthPt, heightPt, 'card', 'front')
        : false;
    if (!hasClassicPreset) {
      doc.rect(0, 0, widthPt, heightPt).fill(bgColor);
      if (bgImgBuf) {
        tryImage(doc, bgImgBuf, 0, 0, { width: widthPt, height: heightPt });
      }
    }

    // Header bar
    doc.rect(0, 0, widthPt, 34).fill(headerColor);
    doc.rect(0, 34, widthPt, 2.5).fill(accentColor);

    const logoPos = effectiveConfig.logoPosition || 'top-left';
    const logoDrawn =
      logoPos === 'top-right'
        ? tryImage(doc, logoBuf, widthPt - 32, 5, { fit: [24, 24] })
        : tryImage(doc, logoBuf, 8, 5, { fit: [24, 24] });
    const textStartX = logoDrawn && logoPos !== 'top-right' ? 36 : 10;
    const headerW = logoDrawn ? widthPt - 44 : widthPt - 18;

    const centerEn = snap.companyNameEn || company.nameEn || 'Training Center';
    const centerAr = snap.companyNameAr || company.nameAr || '';
    const cardTitleEn = snap.cardTitleEn || effectiveConfig.cardTitleEn || 'TRAINING CARD';
    const cardTitleAr = snap.cardTitleAr || effectiveConfig.cardTitleAr || 'بطاقة تدريب';

    if (langMode !== 'ar') {
      doc.fillColor('#FFFFFF').fontSize(7.2);
      drawTextSmart(doc, centerEn, textStartX, 6, { width: headerW, bold: true, lineBreak: false });
      doc.fillColor('#CBD5E1').fontSize(5.3);
      drawTextSmart(doc, cardTitleEn, textStartX, 15, { width: headerW, lineBreak: false });
    }
    if (langMode !== 'en' && (centerAr || cardTitleAr)) {
      doc.fillColor('#E2E8F0').fontSize(6.5);
      drawTextSmart(doc, centerAr || cardTitleAr, textStartX, langMode === 'ar' ? 7 : 21, {
        width: headerW,
        align: 'right',
        lineBreak: false,
      });
    }

    // Photo box
    const photoOnRight = effectiveConfig.photoPosition === 'right';
    const photoX = photoOnRight ? widthPt - 54 : 10;
    const photoY = 42;
    doc.save();
    doc.roundedRect(photoX, photoY, 44, 52, 3).lineWidth(0.75).strokeColor('#CBD5E1').stroke();
    doc.restore();
    if (!tryImage(doc, photoBuf, photoX + 1, photoY + 1, { fit: [42, 50], align: 'center', valign: 'center' })) {
      doc.fillColor('#94A3B8').fontSize(6);
      drawTextSmart(doc, 'PHOTO', photoX, photoY + 22, { width: 44, align: 'center' });
    }

    // Candidate details
    const infoX = photoOnRight ? 10 : 60;
    const infoW = widthPt - 70;
    let curY = 41;

    if (langMode !== 'ar') {
      doc.fillColor('#0F172A').fontSize(7.8);
      drawTextSmart(doc, snap.candidateNameEn, infoX, curY, { width: infoW, bold: true, lineBreak: false });
      curY += 10;
    }
    if (langMode !== 'en' && snap.candidateNameAr) {
      doc.fillColor('#334155').fontSize(7.2);
      drawTextSmart(doc, snap.candidateNameAr, infoX, curY, { width: infoW, align: 'right', lineBreak: false });
      curY += 10;
    }

    doc.fillColor('#475569').fontSize(5.8);
    drawTextSmart(
      doc,
      showMaskedIqama && snap.iqamaMasked ? `ID: ${card.candidateId} · ${snap.iqamaMasked}` : `ID: ${card.candidateId}`,
      infoX,
      curY,
      { width: infoW, bold: true, lineBreak: false }
    );
    curY += 9;

    doc.fillColor(accentColor).fontSize(6.5);
    const courseLabel =
      langMode === 'ar' && snap.courseTitleAr
        ? `${snap.courseCode} · ${snap.courseTitleAr}`
        : `${snap.courseCode} · ${snap.courseTitleEn}`;
    drawTextSmart(doc, courseLabel, infoX, curY, {
      width: infoW,
      align: langMode === 'ar' ? 'right' : 'left',
      bold: true,
      lineBreak: false,
    });
    curY += 9.5;

    if (showTrainer && (snap.trainerNameEn || snap.trainerNameAr)) {
      doc.fillColor('#475569').fontSize(5.5);
      const trLabel =
        langMode === 'ar' && snap.trainerNameAr
          ? `المدرب: ${snap.trainerNameAr}`
          : `Trainer: ${snap.trainerNameEn || snap.trainerNameAr}`;
      drawTextSmart(doc, trLabel, infoX, curY, {
        width: infoW,
        align: langMode === 'ar' ? 'right' : 'left',
        lineBreak: false,
      });
      curY += 8.5;
    }

    if (showDates) {
      doc.fillColor('#475569').fontSize(5.5);
      drawTextSmart(doc, `Batch: ${snap.batchNumber} | ${snap.startDate} - ${snap.endDate}`, 10, 100, {
        width: widthPt - 64,
        lineBreak: false,
      });
    }
    if (showVenue && snap.venue) {
      doc.fillColor('#475569').fontSize(5.3);
      drawTextSmart(doc, `Venue: ${snap.venue}`, 10, 108, {
        width: widthPt - 64,
        lineBreak: false,
      });
    }

    doc.fillColor('#0F172A').fontSize(5.8);
    drawTextSmart(doc, `Card #: ${card.cardSerialNumber}`, 10, 117, {
      width: widthPt - 64,
      bold: true,
      lineBreak: false,
    });

    if (effectiveConfig.qrPosition === 'front-bottom') {
      tryImage(doc, qrBuf, widthPt - 44, 98, { width: 36, height: 36 });
    } else {
      if (showStamp && stampBuf) {
        tryImage(doc, stampBuf, widthPt - 62, 102, { fit: [24, 24] });
      }
      if (showSignature && sigBuf) {
        tryImage(doc, sigBuf, widthPt - 34, 106, { fit: [26, 18] });
      }
    }

    // Footer strip
    doc.rect(0, heightPt - 14, widthPt, 14).fill('#F1F5F9');
    doc.fillColor('#475569').fontSize(5);
    drawTextSmart(doc, footerText || 'Authorized Trainee Identification Card', 8, heightPt - 10, {
      width: widthPt - 16,
      align: 'center',
      lineBreak: false,
    });

    // BACK SIDE
    if (showBack) {
      doc.addPage({ size: [widthPt, heightPt], margin: 0 });
      const hasBackPreset =
        !bgImgBuf && effectiveConfig.backgroundPresetId
          ? drawPresetBackgroundPdf(doc, effectiveConfig.backgroundPresetId, widthPt, heightPt, 'card', 'back')
          : false;
      if (!hasBackPreset) {
        doc.rect(0, 0, widthPt, heightPt).fill('#FFFFFF');
        doc.rect(0, 0, widthPt, 18).fill(headerColor);
      }
      doc.fillColor('#FFFFFF').fontSize(6.2);
      drawTextSmart(
        doc,
        langMode === 'ar' ? 'بيانات التحقق والدورة التدريبية' : 'VERIFICATION & COURSE DETAILS',
        10,
        5,
        { width: widthPt - 20, bold: true, align: langMode === 'ar' ? 'right' : 'left' }
      );

      tryImage(doc, qrBuf, 12, 26, { width: 62, height: 62 });

      if (langMode !== 'ar') {
        doc.fillColor('#0F172A').fontSize(6.4);
        drawTextSmart(doc, snap.courseTitleEn, 82, 26, { width: widthPt - 92, bold: true, lineBreak: false });
      }
      if (langMode !== 'en' && snap.courseTitleAr) {
        doc.fillColor('#334155').fontSize(6.2);
        drawTextSmart(doc, snap.courseTitleAr, 82, langMode === 'ar' ? 26 : 36, {
          width: widthPt - 92,
          align: 'right',
          lineBreak: false,
        });
      }
      doc.fillColor('#475569').fontSize(5.5);
      drawTextSmart(doc, `Serial: ${card.cardSerialNumber}`, 82, 48, { width: widthPt - 92 });
      drawTextSmart(doc, `Batch: ${snap.batchNumber}`, 82, 57, { width: widthPt - 92 });
      drawTextSmart(doc, `Valid: ${snap.startDate} to ${snap.endDate}`, 82, 66, { width: widthPt - 92 });
      if (snap.trainerNameEn || snap.trainerNameAr) {
        drawTextSmart(doc, `Trainer: ${snap.trainerNameEn || snap.trainerNameAr}`, 82, 75, {
          width: widthPt - 92,
          lineBreak: false,
        });
      }
      if (snap.venue) {
        drawTextSmart(doc, `Venue: ${snap.venue}`, 82, 84, { width: widthPt - 92, lineBreak: false });
      }

      if (showStamp && stampBuf) {
        tryImage(doc, stampBuf, widthPt - 64, 96, { fit: [26, 26] });
      }
      if (showSignature && sigBuf) {
        tryImage(doc, sigBuf, widthPt - 34, 100, { fit: [26, 18] });
      }

      doc.fillColor('#64748B').fontSize(5);
      drawTextSmart(
        doc,
        'This card confirms enrollment in the specified training batch. Scan QR code to verify.',
        12,
        104,
        { width: widthPt - 82 }
      );
      if (company.phone || company.email || company.website) {
        drawTextSmart(
          doc,
          [company.phone, company.email, company.website].filter(Boolean).join(' · '),
          12,
          heightPt - 16,
          { width: widthPt - 24, align: 'center', lineBreak: false }
        );
      }
    }
  }

  doc.end();
  return bufferPromise;
}

function resolveCertFieldValue(
  fieldKey: CertFieldKey | undefined,
  customText: string | undefined,
  cert: Certificate,
  company: CompanySettings,
  cfg?: Partial<CertificateTemplateConfig>
): string {
  const snap = cert.snapshot;
  const langMode = cfg?.languageMode || 'bilingual';
  switch (fieldKey) {
    case 'customText':
      return customText || '';
    case 'centerName':
      return snap.companyNameEn || company.nameEn || 'Training Center';
    case 'centerNameAr':
      return snap.companyNameAr || company.nameAr || '';
    case 'certTitle':
      return snap.certificateTitleEn || cfg?.headingEn || 'CERTIFICATE OF COMPLETION';
    case 'certTitleAr':
      return snap.certificateTitleAr || cfg?.headingAr || 'شهادة إتمام تدريب';
    case 'subHeadingEn':
      return cfg?.subHeadingEn || 'This is to certify that';
    case 'subHeadingAr':
      return cfg?.subHeadingAr || 'يشهد المركز بأن المتدرب';
    case 'candidateNameEn':
      return snap.candidateNameEn || '';
    case 'candidateNameAr':
      return snap.candidateNameAr || '';
    case 'candidateId':
      return cert.candidateId || '';
    case 'courseTitleEn':
      return snap.courseTitleEn || '';
    case 'courseTitleAr':
      return snap.courseTitleAr || '';
    case 'courseCode':
      return snap.courseCode || '';
    case 'duration':
      if (langMode === 'ar') return snap.durationLabelAr || snap.durationLabelEn || '';
      if (langMode === 'en') return snap.durationLabelEn || '';
      return [snap.durationLabelEn, snap.durationLabelAr].filter(Boolean).join(' / ');
    case 'startDate':
      return snap.startDate || '';
    case 'completionDate':
      return cert.completionDate || snap.completionDate || '';
    case 'issueDate':
      return cert.issueDate || '';
    case 'expiryDate':
      return cert.expiryDate || 'No Expiry';
    case 'trainerName': {
      const en = snap.trainerNameEn || '';
      const ar = snap.trainerNameAr || '';
      if (langMode === 'ar') return ar || en;
      if (langMode === 'en') return en || ar;
      return en && ar && en !== ar ? `${en} / ${ar}` : en || ar;
    }
    case 'signatoryName':
      return snap.signatoryName || company.signatoryName || 'Authorized Signatory';
    case 'certificateNumber':
      return cert.certificateNumber || '';
    case 'footerText':
      return cfg?.footerText || company.certificateFooter || '';
    default:
      return customText || '';
  }
}

export async function generateCertificatePdf(params: {
  certificates: Array<{ certificate: Certificate; rawVerificationToken?: string }>;
  company: CompanySettings;
  template?: CertificateTemplate | null;
  verifyBaseUrl: string;
  idToken?: string;
  tenantId?: string;
}): Promise<Buffer> {
  const { certificates, company, template, verifyBaseUrl, idToken, tenantId } = params;
  const firstOrient = template?.orientation || certificates[0]?.certificate.snapshot?.templateOrientation || 'landscape';

  const doc = new PDFDocument({
    size: 'A4',
    layout: firstOrient === 'portrait' ? 'portrait' : 'landscape',
    margin: 0,
    autoFirstPage: false,
  });
  registerFonts(doc);
  const bufferPromise = collectPdfBuffer(doc);

  const imgCache = new Map<string, Buffer | null>();
  const resolvedTenantId = tenantId || company.tenantId || certificates[0]?.certificate.tenantId;
  const preloadIds = new Set<string>();
  if (company.logoFileId) preloadIds.add(company.logoFileId);
  if (company.stampFileId) preloadIds.add(company.stampFileId);
  if (company.signatureFileId) preloadIds.add(company.signatureFileId);
  if (template?.config?.customLogoFileId) preloadIds.add(template.config.customLogoFileId);
  if (template?.config?.customStampFileId) preloadIds.add(template.config.customStampFileId);
  if (template?.config?.customSignatureFileId) preloadIds.add(template.config.customSignatureFileId);
  if (template?.config?.backgroundImageFileId) preloadIds.add(template.config.backgroundImageFileId);
  for (const item of certificates) {
    const s = item.certificate.snapshot;
    if (s.companyLogoFileId) preloadIds.add(s.companyLogoFileId);
    if (s.stampFileId) preloadIds.add(s.stampFileId);
    if (s.signatureFileId) preloadIds.add(s.signatureFileId);
    if (s.photoFileId) preloadIds.add(s.photoFileId);
    const snapCfg = s.templateConfigSnapshot;
    if (snapCfg?.customLogoFileId) preloadIds.add(snapCfg.customLogoFileId);
    if (snapCfg?.customStampFileId) preloadIds.add(snapCfg.customStampFileId);
    if (snapCfg?.customSignatureFileId) preloadIds.add(snapCfg.customSignatureFileId);
    if (snapCfg?.backgroundImageFileId) preloadIds.add(snapCfg.backgroundImageFileId);
  }
  await Promise.all(
    Array.from(preloadIds).map(async (fileId) => {
      const asyncFound = await readPrivateFileAsync(fileId, idToken, resolvedTenantId).catch(() => null);
      imgCache.set(fileId, asyncFound?.buffer || readFileBufferSafe(fileId));
    })
  );

  const getImg = (fileId?: string): Buffer | null => {
    if (!fileId) return null;
    if (!imgCache.has(fileId)) {
      imgCache.set(fileId, readFileBufferSafe(fileId));
    }
    return imgCache.get(fileId) || null;
  };

  for (const item of certificates) {
    const cert = item.certificate;
    const snap = cert.snapshot;
    const cfg: Partial<CertificateTemplateConfig> =
      template?.config || snap.templateConfigSnapshot || {};
    const layout: 'portrait' | 'landscape' =
      (template?.orientation || snap.templateOrientation || 'landscape') === 'portrait'
        ? 'portrait'
        : 'landscape';

    const langMode = cfg.languageMode || template?.languageMode || 'bilingual';
    const accentColor = cfg.accentColor || company.primaryColor || '#0F172A';
    const borderColor = cfg.borderColor || company.secondaryColor || '#B45309';
    const showLogo = cfg.showLogo !== false;
    const showStamp = cfg.showStamp !== false;
    const showSignature = cfg.showSignature !== false;
    const showQr = cfg.showQr !== false;
    const showArabic = langMode !== 'en' && cfg.showArabic !== false;
    const showEnglish = langMode !== 'ar' && cfg.showEnglish !== false;
    const showCandidatePhoto = Boolean(cfg.showCandidatePhoto);

    const logoBuf = getImg(cfg.customLogoFileId || snap.companyLogoFileId || company.logoFileId);
    const stampBuf = getImg(cfg.customStampFileId || snap.stampFileId || company.stampFileId);
    const sigBuf = getImg(cfg.customSignatureFileId || snap.signatureFileId || company.signatureFileId);
    const bgImgBuf = getImg(cfg.backgroundImageFileId);
    const photoBuf = getImg(snap.photoFileId);

    const verifyQuery = item.rawVerificationToken
      ? `token=${encodeURIComponent(item.rawVerificationToken)}`
      : `cert=${encodeURIComponent(cert.certificateNumber)}`;
    const qrBuf = await makeQrBuffer(`${verifyBaseUrl}/?verify=1&${verifyQuery}`, 200);

    doc.addPage({ size: 'A4', layout, margin: 0 });
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Background fill, graphic preset, & optional uploaded background image
    const hasCertPreset =
      !bgImgBuf && cfg.backgroundPresetId
        ? drawPresetBackgroundPdf(doc, cfg.backgroundPresetId, pageW, pageH, 'certificate', 'front')
        : false;
    if (!hasCertPreset) {
      doc.rect(0, 0, pageW, pageH).fill(cfg.backgroundStyle === 'tinted' ? '#F8FAFC' : '#FFFFFF');
      if (bgImgBuf) {
        tryImage(doc, bgImgBuf, 0, 0, { width: pageW, height: pageH });
      }
    }

    // Border frame
    if (cfg.borderStyle !== 'minimal') {
      doc.save();
      doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(2.4).strokeColor(accentColor).stroke();
      if (cfg.borderStyle === 'classic' || !cfg.borderStyle) {
        doc.rect(28, 28, pageW - 56, pageH - 56).lineWidth(0.75).strokeColor(borderColor).stroke();
      }
      doc.restore();
    }

    const customElements =
      cfg.useCustomLayout && Array.isArray(cfg.elements)
        ? cfg.elements.filter((el: CertCanvasElement) => el.visible !== false)
        : null;

    if (customElements && customElements.length > 0) {
      for (const el of customElements) {
        const x = (Math.max(0, Math.min(100, el.xPct)) / 100) * pageW;
        const y = (Math.max(0, Math.min(100, el.yPct)) / 100) * pageH;
        const w = Math.max(12, (Math.max(1, Math.min(100, el.wPct)) / 100) * pageW);
        const h = Math.max(10, (Math.max(1, Math.min(100, el.hPct)) / 100) * pageH);

        if (el.type === 'logo') {
          if (showLogo) tryImage(doc, logoBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' });
        } else if (el.type === 'photo') {
          if (photoBuf || showCandidatePhoto) {
            doc.save();
            doc.roundedRect(x, y, w, h, 4).lineWidth(0.8).strokeColor('#CBD5E1').stroke();
            doc.restore();
            if (!tryImage(doc, photoBuf, x + 2, y + 2, { fit: [w - 4, h - 4], align: 'center', valign: 'center' })) {
              doc.fillColor('#94A3B8').fontSize(8);
              drawTextSmart(doc, 'PHOTO', x, y + h / 2 - 4, { width: w, align: 'center', lineBreak: false });
            }
          }
        } else if (el.type === 'qr') {
          if (showQr) {
            const sideLen = Math.min(w, h);
            tryImage(doc, qrBuf, x + (w - sideLen) / 2, y + (h - sideLen) / 2, {
              width: sideLen,
              height: sideLen,
            });
          }
        } else if (el.type === 'signature') {
          if (showSignature) {
            if (!tryImage(doc, sigBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' })) {
              doc.moveTo(x + 4, y + h - 6).lineTo(x + w - 4, y + h - 6).lineWidth(0.75).strokeColor('#94A3B8').stroke();
            }
          }
        } else if (el.type === 'stamp') {
          if (showStamp) {
            tryImage(doc, stampBuf, x, y, { fit: [w, h], align: 'center', valign: 'center' });
          }
        } else {
          const val = resolveCertFieldValue(el.fieldKey, el.customText, cert, company, cfg);
          if (!val) continue;
          doc.fillColor(el.color || '#0F172A').fontSize(el.fontSize || 12);
          drawTextSmart(doc, val, x, y, {
            width: w,
            height: h,
            align: el.align || (el.fontFamily === 'arabic' ? 'right' : 'center'),
            bold: el.fontWeight === 'bold',
            forceArabic: el.fontFamily === 'arabic',
          });
        }
      }
      continue;
    }

    // STRUCTURED CLASSIC CERTIFICATE LAYOUT
    if (showCandidatePhoto) {
      const photoX = pageW - 115;
      const photoY = 44;
      doc.save();
      doc.roundedRect(photoX, photoY, 68, 82, 4).lineWidth(0.8).strokeColor('#CBD5E1').stroke();
      doc.restore();
      if (!tryImage(doc, photoBuf, photoX + 2, photoY + 2, { fit: [64, 78], align: 'center', valign: 'center' })) {
        doc.fillColor('#94A3B8').fontSize(8);
        drawTextSmart(doc, 'PHOTO', photoX, photoY + 36, { width: 68, align: 'center' });
      }
    }

    let cursorY = 42;
    if (showLogo) {
      const drawn = tryImage(doc, logoBuf, pageW / 2 - 34, cursorY, { fit: [68, 50], align: 'center' });
      if (drawn) cursorY += 54;
    }

    if (showEnglish) {
      doc.fillColor(accentColor).fontSize(14);
      drawTextSmart(doc, snap.companyNameEn || company.nameEn || 'Training Center', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 19;
    }

    if (showArabic && (snap.companyNameAr || company.nameAr)) {
      doc.fillColor('#334155').fontSize(13);
      drawTextSmart(doc, snap.companyNameAr || company.nameAr, 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 21;
    }

    doc.moveTo(pageW * 0.25, cursorY + 2).lineTo(pageW * 0.75, cursorY + 2).lineWidth(1).strokeColor(borderColor).stroke();
    cursorY += 13;

    if (showEnglish) {
      doc.fillColor(borderColor).fontSize(20);
      drawTextSmart(doc, snap.certificateTitleEn || cfg.headingEn || 'CERTIFICATE OF COMPLETION', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 25;
    }
    if (showArabic) {
      doc.fillColor(accentColor).fontSize(18);
      drawTextSmart(doc, snap.certificateTitleAr || cfg.headingAr || 'شهادة إتمام دورة تدريبية', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 26;
    }

    if (showEnglish) {
      doc.fillColor('#475569').fontSize(10.5);
      drawTextSmart(doc, cfg.subHeadingEn || 'This is to certify that', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
      });
      cursorY += 15;
    }
    if (showArabic) {
      doc.fillColor('#475569').fontSize(10.5);
      drawTextSmart(doc, cfg.subHeadingAr || 'يشهد المركز بأن المتدرب / المتدربة', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
      });
      cursorY += 18;
    }

    if (showEnglish || !snap.candidateNameAr) {
      doc.fillColor('#0F172A').fontSize(20);
      drawTextSmart(doc, snap.candidateNameEn, 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 26;
    }

    if (showArabic && snap.candidateNameAr) {
      doc.fillColor('#0F172A').fontSize(17.5);
      drawTextSmart(doc, snap.candidateNameAr, 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 24;
    }

    if (showEnglish) {
      doc.fillColor('#475569').fontSize(10);
      drawTextSmart(doc, 'has successfully completed the professional training course', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
      });
      cursorY += 15;
    }
    if (showArabic) {
      doc.fillColor('#475569').fontSize(10);
      drawTextSmart(doc, 'قد أتم بنجاح متطلبات الدورة التدريبية', 60, cursorY, {
        width: pageW - 120,
        align: 'center',
      });
      cursorY += 18;
    }

    if (showEnglish || !snap.courseTitleAr) {
      doc.fillColor(accentColor).fontSize(14.5);
      drawTextSmart(doc, `${snap.courseTitleEn} (${snap.courseCode})`, 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 19;
    }
    if (showArabic && snap.courseTitleAr) {
      doc.fillColor(accentColor).fontSize(13.5);
      drawTextSmart(doc, snap.courseTitleAr, 60, cursorY, {
        width: pageW - 120,
        align: 'center',
        bold: true,
      });
      cursorY += 20;
    }

    const metaLineEn = `Duration: ${snap.durationLabelEn}   |   Start: ${snap.startDate}   |   Completion: ${cert.completionDate}   |   Issue Date: ${cert.issueDate}${cert.expiryDate ? `   |   Expiry: ${cert.expiryDate}` : ''}`;
    doc.fillColor('#334155').fontSize(8.8);
    drawTextSmart(doc, metaLineEn, 50, cursorY + 3, {
      width: pageW - 100,
      align: 'center',
    });

    const bottomY = pageH - 128;

    doc.fillColor('#0F172A').fontSize(8.8);
    drawTextSmart(doc, `Certificate No: ${cert.certificateNumber}`, 52, bottomY, { width: 220, bold: true });
    doc.fillColor('#475569').fontSize(8.2);
    const trDisp =
      langMode === 'ar' && snap.trainerNameAr
        ? `المدرب: ${snap.trainerNameAr}`
        : `Trainer: ${snap.trainerNameEn || snap.trainerNameAr}`;
    drawTextSmart(doc, trDisp, 52, bottomY + 15, { width: 220 });
    drawTextSmart(doc, `Status: ${cert.status.toUpperCase()}`, 52, bottomY + 29, { width: 220 });

    if (showStamp) {
      tryImage(doc, stampBuf, pageW / 2 - 80, bottomY - 12, { fit: [68, 68] });
    }
    if (showQr) {
      tryImage(doc, qrBuf, pageW / 2 + 12, bottomY - 12, { width: 66, height: 66 });
    }

    const sigX = pageW - 242;
    if (showSignature) {
      tryImage(doc, sigBuf, sigX + 45, bottomY - 22, { fit: [100, 40] });
    }
    doc.moveTo(sigX + 20, bottomY + 26).lineTo(sigX + 170, bottomY + 26).lineWidth(0.75).strokeColor('#94A3B8').stroke();
    doc.fillColor('#0F172A').fontSize(9);
    drawTextSmart(doc, snap.signatoryName || company.signatoryName || 'Authorized Signatory', sigX, bottomY + 30, {
      width: 190,
      align: 'center',
      bold: true,
    });
    doc.fillColor('#64748B').fontSize(8);
    drawTextSmart(doc, 'Authorized Signature', sigX, bottomY + 43, { width: 190, align: 'center' });

    doc.fillColor('#64748B').fontSize(7.5);
    drawTextSmart(
      doc,
      cfg.footerText || company.certificateFooter || 'Verify certificate authenticity by scanning the QR code.',
      50,
      pageH - 44,
      { width: pageW - 100, align: 'center' }
    );
  }

  doc.end();
  return bufferPromise;
}

export async function generateAttendanceSheetPdf(params: {
  batch: Batch;
  course: Course;
  date: string;
  company: CompanySettings;
  rows: Array<{ candidate: Candidate; record?: AttendanceRecord }>;
}): Promise<Buffer> {
  const { batch, course, date, company, rows } = params;
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 40 });
  registerFonts(doc);
  const bufferPromise = collectPdfBuffer(doc);

  doc.fillColor(company.primaryColor || '#0F172A').fontSize(15);
  drawTextSmart(doc, company.nameEn || 'Training Center', 40, 40, { bold: true });
  doc.fillColor('#475569').fontSize(10);
  drawTextSmart(doc, `Batch Attendance Sheet — ${date}`, 40, 60);
  drawTextSmart(doc, `Course: ${course.courseCode} - ${course.titleEn} | Batch: ${batch.batchNumber} | Venue: ${batch.venue}`, 40, 76);

  let y = 108;
  doc.rect(40, y, 515, 22).fill('#F1F5F9');
  doc.fillColor('#0F172A').fontSize(8.5);
  drawTextSmart(doc, 'Candidate ID', 46, y + 7, { bold: true });
  drawTextSmart(doc, 'Candidate Name', 130, y + 7, { bold: true });
  drawTextSmart(doc, 'Status', 330, y + 7, { bold: true });
  drawTextSmart(doc, 'Remarks', 410, y + 7, { bold: true });
  y += 24;

  for (const row of rows) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    doc.moveTo(40, y + 20).lineTo(555, y + 20).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
    doc.fillColor('#0F172A').fontSize(8.5);
    drawTextSmart(doc, row.candidate.candidateId, 46, y + 5, { width: 80 });
    drawTextSmart(doc, row.candidate.fullNameEn, 130, y + 5, { width: 190 });
    drawTextSmart(doc, (row.record?.status || 'unmarked').toUpperCase(), 330, y + 5, { width: 70 });
    drawTextSmart(doc, row.record?.remarks || '-', 410, y + 5, { width: 140 });
    y += 22;
  }

  doc.end();
  return bufferPromise;
}

export async function generateReportPdf(params: {
  title: string;
  company: CompanySettings;
  headers: string[];
  rows: string[][];
}): Promise<Buffer> {
  const { title, company, headers, rows } = params;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  registerFonts(doc);
  const bufferPromise = collectPdfBuffer(doc);

  const pageW = doc.page.width - 72;
  const colW = Math.max(60, Math.floor(pageW / Math.max(1, headers.length)));

  doc.fillColor(company.primaryColor || '#0F172A').fontSize(14);
  drawTextSmart(doc, company.nameEn || 'TCMS Enterprise', 36, 36, { bold: true });
  doc.fillColor('#334155').fontSize(11);
  drawTextSmart(doc, title, 36, 56, { bold: true });
  doc.fillColor('#64748B').fontSize(8);
  drawTextSmart(doc, `Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, 36, 72);

  let y = 96;
  const drawHeader = () => {
    doc.rect(36, y, pageW, 20).fill('#0F172A');
    doc.fillColor('#FFFFFF').fontSize(7.5);
    headers.forEach((h, idx) => {
      drawTextSmart(doc, h, 40 + idx * colW, y + 6, { width: colW - 6, bold: true, lineBreak: false });
    });
    y += 22;
  };
  drawHeader();

  for (const r of rows) {
    if (y > doc.page.height - 50) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
      y = 36;
      drawHeader();
    }
    doc.moveTo(36, y + 18).lineTo(36 + pageW, y + 18).lineWidth(0.4).strokeColor('#E2E8F0').stroke();
    doc.fillColor('#0F172A').fontSize(7.5);
    r.forEach((cell, idx) => {
      drawTextSmart(doc, cell ?? '', 40 + idx * colW, y + 5, { width: colW - 6, lineBreak: false });
    });
    y += 19;
  }

  doc.end();
  return bufferPromise;
}
