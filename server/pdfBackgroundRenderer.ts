import type PDFDocument from 'pdfkit';
import { certificateBackgroundLibrary } from '../src/branding/CertificateBackgroundLibrary.ts';

function drawCornerFiligreePdf(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  sx: number,
  sy: number,
  color: string,
  secondary: string,
  scale: number
) {
  doc.save();
  doc.translate(x, y);
  doc.scale(sx * scale, sy * scale);

  doc.fillColor(color).fillOpacity(0.88);
  doc.moveTo(0, 0).lineTo(68, 0).lineTo(68, 5).lineTo(5, 5).lineTo(5, 68).lineTo(0, 68).closePath().fill();

  doc.fillColor(secondary).fillOpacity(0.72);
  doc.moveTo(12, 12).lineTo(54, 12).lineTo(54, 14.5).lineTo(14.5, 14.5).lineTo(14.5, 54).lineTo(12, 54).closePath().fill();

  doc.lineWidth(1.6).strokeColor(color).strokeOpacity(0.9);
  doc.circle(14, 14, 4.5).stroke();

  doc.lineWidth(1.2).strokeColor(color).strokeOpacity(0.55);
  doc.moveTo(24, 24).lineTo(44, 24).moveTo(24, 24).lineTo(24, 44).stroke();

  doc.fillColor(color).fillOpacity(0.9);
  doc.polygon([14, 7], [16, 12], [21, 14], [16, 16], [14, 21], [12, 16], [7, 14], [12, 12]).fill();

  doc.restore();
}

function drawGuillocheRosettePdf(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  radius: number,
  stroke: string,
  opacity = 0.08
) {
  doc.save();
  doc.lineWidth(0.7).strokeColor(stroke).strokeOpacity(opacity);
  for (let i = 0; i < 18; i++) {
    doc.save();
    doc.translate(cx, cy);
    doc.rotate(i * 10);
    doc.ellipse(0, 0, radius * 0.92, radius * 0.42).stroke();
    doc.restore();
  }
  doc.lineWidth(1.0).strokeOpacity(opacity * 1.4).circle(cx, cy, radius * 0.62).stroke();
  doc.lineWidth(0.9).strokeOpacity(opacity * 1.3).dash(4, { space: 4 }).circle(cx, cy, radius * 0.96).stroke();
  doc.undash();
  doc.restore();
}

function drawEightPointStarPdf(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  r: number,
  stroke: string,
  fill: string,
  opacity = 0.14
) {
  const s = r * 0.707;
  doc.save();
  doc.translate(cx, cy);
  doc.fillColor(fill).fillOpacity(opacity).strokeColor(stroke).strokeOpacity(opacity).lineWidth(1);
  doc.rect(-s, -s, s * 2, s * 2).fillAndStroke();
  doc.rotate(45);
  doc.rect(-s, -s, s * 2, s * 2).stroke();
  doc.circle(0, 0, r * 0.34).stroke();
  doc.restore();
}

export function drawPresetBackgroundPdf(
  doc: PDFKit.PDFDocument,
  presetId: string | undefined,
  pageW: number,
  pageH: number,
  target: 'certificate' | 'card',
  side: 'front' | 'back' = 'front'
): boolean {
  if (!presetId) return false;
  const preset = certificateBackgroundLibrary.getPresetById(presetId);
  if (!preset) return false;

  const isCard = target === 'card';
  const refW = isCard ? 856 : pageW;
  const refH = isCard ? 540 : pageH;
  const sx = pageW / refW;
  const sy = pageH / refH;

  doc.save();

  switch (preset.id) {
    case 'royal-gold-guilloche': {
      const m = isCard ? 6 : 20;
      const scale = isCard ? 0.25 : 0.75;
      const r = isCard ? 46 : 155;
      doc.rect(0, 0, pageW, pageH).fill('#FCFBF7');
      if (isCard && side === 'back') {
        doc.rect(0, 0, pageW, pageH * 0.12).fill('#0F172A');
        doc.rect(0, pageH * 0.12, pageW, 1.5).fill('#B45309');
        doc.lineWidth(0.7).strokeColor('#D97706').strokeOpacity(0.45).rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
        break;
      }
      drawGuillocheRosettePdf(doc, pageW / 2, pageH / 2, r, '#B45309', 0.08);
      doc.lineWidth(isCard ? 1.2 : 2.0).strokeColor('#B45309').rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(0.7).strokeColor('#0F172A').strokeOpacity(0.55).rect(m + 4, m + 4, pageW - (m + 4) * 2, pageH - (m + 4) * 2).stroke();
      drawCornerFiligreePdf(doc, m, m, 1, 1, '#B45309', '#0F172A', scale);
      drawCornerFiligreePdf(doc, pageW - m, m, -1, 1, '#B45309', '#0F172A', scale);
      drawCornerFiligreePdf(doc, m, pageH - m, 1, -1, '#B45309', '#0F172A', scale);
      drawCornerFiligreePdf(doc, pageW - m, pageH - m, -1, -1, '#B45309', '#0F172A', scale);
      break;
    }

    case 'najdi-geometric-emerald': {
      doc.rect(0, 0, pageW, pageH).fill('#F9FBF9');
      if (isCard && side === 'back') {
        doc.rect(0, 0, pageW, pageH * 0.12).fill('#065F46');
        doc.rect(0, pageH * 0.12, pageW, 1.5).fill('#D97706');
        drawEightPointStarPdf(doc, pageW - 30, pageH / 2 + 6, 16, '#065F46', '#10B981', 0.09);
        break;
      }
      const band = isCard ? 5 : 16;
      const step = isCard ? 14 : 36;
      doc.fillColor('#065F46').rect(0, 0, pageW, band).fill();
      doc.fillColor('#065F46').rect(0, pageH - band, pageW, band).fill();
      doc.fillColor('#065F46').fillOpacity(0.9).rect(0, 0, band * 0.55, pageH).fill();
      doc.fillColor('#065F46').fillOpacity(0.9).rect(pageW - band * 0.55, 0, band * 0.55, pageH).fill();
      doc.fillColor('#D97706').fillOpacity(0.88);
      for (let x = band + step / 2; x < pageW - band; x += step) {
        const d = isCard ? 1.8 : 3.5;
        doc.polygon([x, band / 2 - d], [x + d * 1.2, band / 2], [x, band / 2 + d], [x - d * 1.2, band / 2]).fill();
        doc.polygon([x, pageH - band / 2 - d], [x + d * 1.2, pageH - band / 2], [x, pageH - band / 2 + d], [x - d * 1.2, pageH - band / 2]).fill();
      }
      doc.fillOpacity(1).lineWidth(1).strokeColor('#B45309').rect(band * 0.85, band + 4, pageW - band * 1.7, pageH - (band + 4) * 2).stroke();
      drawEightPointStarPdf(doc, pageW / 2, pageH / 2, isCard ? 36 : 130, '#065F46', '#059669', 0.06);
      const cr = isCard ? 5 : 14;
      drawEightPointStarPdf(doc, band + 14, band + 16, cr, '#065F46', '#D97706', 0.25);
      drawEightPointStarPdf(doc, pageW - band - 14, band + 16, cr, '#065F46', '#D97706', 0.25);
      drawEightPointStarPdf(doc, band + 14, pageH - band - 16, cr, '#065F46', '#D97706', 0.25);
      drawEightPointStarPdf(doc, pageW - band - 14, pageH - band - 16, cr, '#065F46', '#D97706', 0.25);
      break;
    }

    case 'executive-navy-ribbon': {
      doc.rect(0, 0, pageW, pageH).fill('#FFFFFF');
      if (isCard && side === 'back') {
        doc.rect(0, 0, pageW, pageH * 0.12).fill('#0F172A');
        doc.fillColor('#0F172A').polygon([pageW - 32, pageH], [pageW, pageH - 32], [pageW, pageH]).fill();
        doc.fillColor('#CA8A04').polygon([pageW - 38, pageH], [pageW, pageH - 38], [pageW, pageH - 34], [pageW - 34, pageH]).fill();
        break;
      }
      const corner = isCard ? 36 : 135;
      const g = doc.linearGradient(0, 0, corner, corner).stop(0, '#0F172A').stop(1, '#1E3A8A');
      doc.fillColor(g).polygon([0, 0], [corner, 0], [0, corner]).fill();
      doc.fillColor('#CA8A04').polygon([corner + 4, 0], [corner + 10, 0], [0, corner + 10], [0, corner + 4]).fill();

      const g2 = doc.linearGradient(pageW - corner, pageH - corner, pageW, pageH).stop(0, '#1E3A8A').stop(1, '#0F172A');
      doc.fillColor(g2).polygon([pageW, pageH], [pageW - corner, pageH], [pageW, pageH - corner]).fill();
      doc.fillColor('#CA8A04').polygon([pageW - corner - 4, pageH], [pageW - corner - 10, pageH], [pageW, pageH - corner - 10], [pageW, pageH - corner - 4]).fill();

      const m = isCard ? 7 : 16;
      doc.lineWidth(0.8).strokeColor('#CBD5E1').rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(0.6).strokeColor('#0F172A').strokeOpacity(0.35).rect(m + 4, m + 4, pageW - (m + 4) * 2, pageH - (m + 4) * 2).stroke();
      break;
    }

    case 'industrial-slate-chevron': {
      doc.rect(0, 0, pageW, pageH).fill('#F8FAFC');
      const dotGap = isCard ? 9 : 18;
      doc.fillColor('#94A3B8').fillOpacity(0.32);
      for (let x = dotGap; x < pageW; x += dotGap) {
        for (let y = dotGap; y < pageH; y += dotGap) {
          doc.circle(x, y, isCard ? 0.45 : 0.7).fill();
        }
      }
      const stripH = isCard ? 4 : 11;
      const step = isCard ? 9 : 24;
      doc.fillOpacity(1).fillColor('#1E293B').rect(0, 0, pageW, stripH).fill();
      doc.fillColor('#1E293B').rect(0, pageH - stripH, pageW, stripH).fill();
      doc.fillColor('#F59E0B').fillOpacity(0.85);
      for (let x = -step; x < pageW + step; x += step) {
        doc.polygon([x, 0], [x + step * 0.5, 0], [x + step * 0.28, stripH], [x - step * 0.22, stripH]).fill();
        doc.polygon([x, pageH - stripH], [x + step * 0.5, pageH - stripH], [x + step * 0.28, pageH], [x - step * 0.22, pageH]).fill();
      }
      const pad = isCard ? 6 : 14;
      const br = isCard ? 10 : 20;
      doc.fillOpacity(1).lineWidth(0.7).strokeColor('#CBD5E1').rect(pad, stripH + 6, pageW - pad * 2, pageH - (stripH + 6) * 2).stroke();
      doc.lineWidth(1.6).strokeColor('#1E293B');
      doc.moveTo(pad, stripH + 6 + br).lineTo(pad, stripH + 6).lineTo(pad + br, stripH + 6).stroke();
      doc.moveTo(pageW - pad - br, stripH + 6).lineTo(pageW - pad, stripH + 6).lineTo(pageW - pad, stripH + 6 + br).stroke();
      doc.moveTo(pad, pageH - stripH - 6 - br).lineTo(pad, pageH - stripH - 6).lineTo(pad + br, pageH - stripH - 6).stroke();
      doc.moveTo(pageW - pad - br, pageH - stripH - 6).lineTo(pageW - pad, pageH - stripH - 6).lineTo(pageW - pad, pageH - stripH - 6 - br).stroke();
      break;
    }

    case 'crimson-safety-crest': {
      doc.rect(0, 0, pageW, pageH).fill('#FFFFFF');
      const bar = isCard ? 5.5 : 18;
      doc.fillColor('#991B1B').rect(0, 0, bar, pageH).fill();
      doc.fillColor('#1E293B').rect(bar, 0, bar * 0.28, pageH).fill();
      const cw = isCard ? 38 : 140;
      const ch = isCard ? 26 : 92;
      doc.fillColor('#991B1B').fillOpacity(0.92).polygon([pageW - cw, 0], [pageW, 0], [pageW, ch]).fill();
      doc.fillColor('#1E293B').fillOpacity(0.82).polygon([pageW - cw - 8, 0], [pageW - cw - 2, 0], [pageW, ch + 3], [pageW, ch + 11]).fill();

      // Subtle shield watermark
      const cx = pageW / 2;
      const cy = pageH / 2;
      const s = isCard ? 20 : 68;
      doc.fillColor('#991B1B').fillOpacity(0.04).strokeColor('#991B1B').strokeOpacity(0.1).lineWidth(1);
      doc
        .moveTo(cx, cy - s)
        .lineTo(cx + s * 0.78, cy - s * 0.55)
        .lineTo(cx + s * 0.78, cy + s * 0.12)
        .bezierCurveTo(cx + s * 0.78, cy + s * 0.68, cx, cy + s, cx, cy + s)
        .bezierCurveTo(cx, cy + s, cx - s * 0.78, cy + s * 0.68, cx - s * 0.78, cy + s * 0.12)
        .lineTo(cx - s * 0.78, cy - s * 0.55)
        .closePath()
        .fillAndStroke();

      doc.fillOpacity(1).strokeOpacity(1).lineWidth(0.9).strokeColor('#E2E8F0').rect(bar + 8, 10, pageW - bar - 18, pageH - 20).stroke();
      break;
    }

    case 'sapphire-wave-modern': {
      doc.rect(0, 0, pageW, pageH).fill('#FFFFFF');
      // Top translucent wave
      doc.fillColor('#0284C7').fillOpacity(0.14);
      doc
        .moveTo(0, 0)
        .lineTo(pageW, 0)
        .lineTo(pageW, pageH * 0.14)
        .quadraticCurveTo(pageW * 0.68, pageH * 0.22, pageW * 0.35, pageH * 0.11)
        .quadraticCurveTo(pageW * 0.15, pageH * 0.05, 0, pageH * 0.16)
        .closePath()
        .fill();
      // Top dark cobalt wave
      const gTop = doc.linearGradient(0, 0, pageW, 0).stop(0, '#1E3A8A').stop(1, '#0284C7');
      doc.fillColor(gTop).fillOpacity(0.92);
      doc
        .moveTo(0, 0)
        .lineTo(pageW, 0)
        .lineTo(pageW, pageH * 0.07)
        .quadraticCurveTo(pageW * 0.65, pageH * 0.13, pageW * 0.3, pageH * 0.06)
        .quadraticCurveTo(pageW * 0.12, pageH * 0.02, 0, pageH * 0.09)
        .closePath()
        .fill();
      // Bottom waves
      doc.fillColor('#0284C7').fillOpacity(0.14);
      doc
        .moveTo(0, pageH)
        .lineTo(pageW, pageH)
        .lineTo(pageW, pageH * 0.84)
        .quadraticCurveTo(pageW * 0.7, pageH * 0.92, pageW * 0.35, pageH * 0.86)
        .quadraticCurveTo(pageW * 0.15, pageH * 0.82, 0, pageH * 0.89)
        .closePath()
        .fill();
      doc.fillColor(gTop).fillOpacity(0.9);
      doc
        .moveTo(0, pageH)
        .lineTo(pageW, pageH)
        .lineTo(pageW, pageH * 0.93)
        .quadraticCurveTo(pageW * 0.62, pageH * 0.98, pageW * 0.32, pageH * 0.93)
        .quadraticCurveTo(pageW * 0.12, pageH * 0.9, 0, pageH * 0.95)
        .closePath()
        .fill();
      const m = isCard ? 6 : 14;
      doc.fillOpacity(1).lineWidth(0.7).strokeColor('#0284C7').strokeOpacity(0.35).rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      break;
    }

    case 'silver-platinum-grid': {
      doc.rect(0, 0, pageW, pageH).fill('#F8FAFC');
      const m = isCard ? 6 : 18;
      const gap = isCard ? 10 : 24;
      doc.lineWidth(0.4).strokeColor('#CBD5E1').strokeOpacity(0.5);
      for (let x = m; x <= pageW - m; x += gap) {
        doc.moveTo(x, m).lineTo(x, pageH - m).stroke();
      }
      for (let y = m; y <= pageH - m; y += gap) {
        doc.moveTo(m, y).lineTo(pageW - m, y).stroke();
      }
      doc.strokeOpacity(1).lineWidth(1.2).strokeColor('#64748B').rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(0.6).strokeColor('#0369A1').strokeOpacity(0.55).rect(m + 3, m + 3, pageW - (m + 3) * 2, pageH - (m + 3) * 2).stroke();
      const plate = isCard ? 10 : 32;
      doc.fillColor('#334155').fillOpacity(1);
      doc.polygon([m, m], [m + plate, m], [m, m + plate]).fill();
      doc.polygon([pageW - m, m], [pageW - m - plate, m], [pageW - m, m + plate]).fill();
      doc.polygon([m, pageH - m], [m + plate, pageH - m], [m, pageH - m - plate]).fill();
      doc.polygon([pageW - m, pageH - m], [pageW - m - plate, pageH - m], [pageW - m, pageH - m - plate]).fill();
      break;
    }

    case 'desert-sandstone-frame': {
      const grad = doc.radialGradient(pageW / 2, pageH / 2, 10, pageW / 2, pageH / 2, Math.max(pageW, pageH) * 0.72);
      grad.stop(0, '#FFFDF9').stop(1, '#F2EAE0');
      doc.rect(0, 0, pageW, pageH).fill(grad);
      const m = isCard ? 5 : 16;
      doc.lineWidth(1.6).strokeColor('#92400E').rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(3).strokeColor('#D6C7B2').rect(m + 5, m + 5, pageW - (m + 5) * 2, pageH - (m + 5) * 2).stroke();
      doc.lineWidth(0.75).strokeColor('#78350F').strokeOpacity(0.65).rect(m + 9, m + 9, pageW - (m + 9) * 2, pageH - (m + 9) * 2).stroke();
      doc.strokeOpacity(1).lineWidth(1.2).strokeColor('#B45309');
      doc.moveTo(pageW * 0.32, m + 9).lineTo(pageW * 0.5, m + 2).lineTo(pageW * 0.68, m + 9).stroke();
      doc.moveTo(pageW * 0.32, pageH - m - 9).lineTo(pageW * 0.5, pageH - m - 2).lineTo(pageW * 0.68, pageH - m - 9).stroke();
      break;
    }

    case 'obsidian-gold-luxury': {
      const bgGrad = doc.radialGradient(pageW / 2, pageH * 0.46, 8, pageW / 2, pageH * 0.46, Math.max(pageW, pageH) * 0.65);
      bgGrad.stop(0, '#1E293B').stop(1, '#090E1A');
      doc.rect(0, 0, pageW, pageH).fill(bgGrad);
      drawGuillocheRosettePdf(doc, pageW / 2, pageH / 2, isCard ? 42 : 145, '#F59E0B', 0.08);
      const m = isCard ? 5.5 : 18;
      const scale = isCard ? 0.22 : 0.72;
      const goldGrad = doc.linearGradient(0, 0, pageW, pageH).stop(0, '#FDE68A').stop(0.5, '#D97706').stop(1, '#FBBF24');
      doc.lineWidth(isCard ? 1.3 : 2.0).strokeColor(goldGrad).rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(0.6).strokeColor('#FDE68A').strokeOpacity(0.45).rect(m + 4, m + 4, pageW - (m + 4) * 2, pageH - (m + 4) * 2).stroke();
      drawCornerFiligreePdf(doc, m, m, 1, 1, '#F59E0B', '#FDE68A', scale);
      drawCornerFiligreePdf(doc, pageW - m, m, -1, 1, '#F59E0B', '#FDE68A', scale);
      drawCornerFiligreePdf(doc, m, pageH - m, 1, -1, '#F59E0B', '#FDE68A', scale);
      drawCornerFiligreePdf(doc, pageW - m, pageH - m, -1, -1, '#F59E0B', '#FDE68A', scale);
      break;
    }

    case 'teal-iso-technical': {
      doc.rect(0, 0, pageW, pageH).fill('#FFFFFF');
      const barW = isCard ? 5 : 16;
      doc.fillColor('#115E59').rect(0, 0, barW, pageH).fill();
      doc.fillColor('#14B8A6').rect(barW, 0, isCard ? 1.5 : 3.5, pageH).fill();
      doc.fillColor('#115E59').fillOpacity(0.14).rect(pageW - barW, 0, barW, pageH).fill();
      doc.fillOpacity(1).lineWidth(1).strokeColor('#CCFBF1').rect(barW + 6, 10, pageW - barW * 2 - 12, pageH - 20).stroke();

      const drawHex = (cx: number, cy: number, r: number, color: string, op: number) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        doc.save();
        doc.lineWidth(1).strokeColor(color).strokeOpacity(op).polygon(...pts).stroke();
        doc.restore();
      };
      const hr = isCard ? 8 : 26;
      drawHex(pageW - barW - hr * 1.4, hr * 1.4, hr, '#0D9488', 0.22);
      drawHex(pageW - barW - hr * 2.9, hr * 2.2, hr * 0.72, '#115E59', 0.16);
      drawHex(barW + hr * 1.6, pageH - hr * 1.4, hr, '#0D9488', 0.22);
      drawHex(barW + hr * 3.1, pageH - hr * 2.2, hr * 0.72, '#115E59', 0.16);
      break;
    }

    case 'burgundy-academic-seal': {
      doc.rect(0, 0, pageW, pageH).fill('#FEFDFB');
      const m = isCard ? 5.5 : 18;
      const ribW = isCard ? 11 : 40;
      const ribX = isCard ? 13 : 44;
      doc.fillColor('#7F1D1D').fillOpacity(0.92).polygon([ribX, 0], [ribX + ribW, 0], [ribX + ribW, pageH * 0.28], [ribX + ribW / 2, pageH * 0.21], [ribX, pageH * 0.28]).fill();
      doc.strokeOpacity(1).lineWidth(0.75).strokeColor('#F59E0B').polygon([ribX + 3, 0], [ribX + ribW - 3, 0], [ribX + ribW - 3, pageH * 0.255], [ribX + ribW / 2, pageH * 0.19], [ribX + 3, pageH * 0.255]).stroke();
      doc.fillOpacity(1).lineWidth(1.5).strokeColor('#7F1D1D').rect(m, m, pageW - m * 2, pageH - m * 2).stroke();
      doc.lineWidth(0.7).strokeColor('#B45309').rect(m + 4, m + 4, pageW - (m + 4) * 2, pageH - (m + 4) * 2).stroke();
      drawGuillocheRosettePdf(doc, pageW / 2, pageH / 2, isCard ? 32 : 120, '#7F1D1D', 0.055);
      break;
    }

    case 'nordic-minimal-hairline': {
      doc.rect(0, 0, pageW, pageH).fill('#FFFFFF');
      doc.fillColor('#0284C7').rect(0, 0, pageW, isCard ? 2.2 : 5.5).fill();
      const m = isCard ? 6.5 : 22;
      const off = isCard ? 2 : 6;
      doc.lineWidth(1).strokeColor('#18181B').strokeOpacity(0.85).rect(m, m, pageW - m * 2 - off, pageH - m * 2 - off).stroke();
      doc.lineWidth(0.6).strokeColor('#94A3B8').strokeOpacity(0.7).rect(m + off, m + off, pageW - m * 2 - off, pageH - m * 2 - off).stroke();
      const ch = isCard ? 4 : 8;
      doc.strokeOpacity(1).lineWidth(1.2).strokeColor('#0284C7');
      doc.moveTo(m - ch, m).lineTo(m + ch, m).moveTo(m, m - ch).lineTo(m, m + ch).stroke();
      doc.moveTo(pageW - m - ch, pageH - m).lineTo(pageW - m + ch, pageH - m).moveTo(pageW - m, pageH - m - ch).lineTo(pageW - m, pageH - m + ch).stroke();
      break;
    }

    default: {
      // Fallback scale reference to avoid unused var warning
      void sx;
      void sy;
      doc.restore();
      return false;
    }
  }

  doc.restore();
  return true;
}
