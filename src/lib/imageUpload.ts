const DIRECT_PASSTHROUGH_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const DIRECT_PASSTHROUGH_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_BRANDING_DIMENSION = 2400;
const FALLBACK_BRANDING_DIMENSION = 1600;
const TARGET_PNG_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|webp|svg|gif|bmp|tiff?|avif|ico|heic|heif)$/i;

export function isSupportedBrandingImageFile(file: File): boolean {
  if (!file) return false;
  if (file.type && file.type.toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSION_REGEX.test(file.name || '');
}

async function decodeImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width || 1,
        height: bitmap.height || 1,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement loader
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || img.width || 1200;
    const height = img.naturalHeight || img.height || 1200;
    return {
      width,
      height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const sampleW = Math.min(width, 256);
    const sampleH = Math.min(height, 256);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 252) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function replaceExtension(fileName: string, newExt: string): string {
  const base = (fileName || 'branding-asset').replace(/\.[^.]+$/, '');
  return `${base || 'branding-asset'}.${newExt}`;
}

/**
 * Prepares a branding image (logo, stamp, signature, or template background) of any size
 * or image format so it uploads reliably and renders cleanly in UI previews and PDF generators.
 * Never rejects a file based on size.
 */
export async function prepareBrandingImageFile(file: File): Promise<File> {
  if (!file || file.size <= 0) {
    throw new Error('Selected image file is empty (0 bytes).');
  }

  const mime = (file.type || '').toLowerCase();
  if (DIRECT_PASSTHROUGH_MIMES.has(mime) && file.size <= DIRECT_PASSTHROUGH_MAX_BYTES) {
    return file;
  }

  try {
    const decoded = await decodeImageSource(file);
    try {
      const renderAtMaxDim = async (maxDim: number): Promise<File | null> => {
        const scale = Math.min(1, maxDim / Math.max(decoded.width, decoded.height, 1));
        const targetW = Math.max(1, Math.round(decoded.width * scale));
        const targetH = Math.max(1, Math.round(decoded.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.clearRect(0, 0, targetW, targetH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        decoded.draw(ctx, targetW, targetH);

        const pngBlob = await canvasToBlob(canvas, 'image/png');
        if (pngBlob && pngBlob.size <= TARGET_PNG_MAX_BYTES) {
          return new File([pngBlob], replaceExtension(file.name, 'png'), { type: 'image/png' });
        }

        if (!hasTransparency(ctx, targetW, targetH)) {
          const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
          if (jpgBlob) {
            return new File([jpgBlob], replaceExtension(file.name, 'jpg'), { type: 'image/jpeg' });
          }
        }

        if (pngBlob) {
          return new File([pngBlob], replaceExtension(file.name, 'png'), { type: 'image/png' });
        }
        return null;
      };

      const primary = await renderAtMaxDim(MAX_BRANDING_DIMENSION);
      if (primary && primary.size <= 14 * 1024 * 1024) {
        return primary;
      }

      const compact = await renderAtMaxDim(FALLBACK_BRANDING_DIMENSION);
      if (compact) return compact;
      if (primary) return primary;
    } finally {
      decoded.cleanup();
    }
  } catch {
    // Fallback: return original file untouched if browser canvas decoding fails
  }

  return file;
}
