import type { CandidateDocument, LanguageCode } from '../types/tcms';

export const SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)

export const ALLOWED_CANDIDATE_DOC_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

export const ALLOWED_CANDIDATE_DOC_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

export const ALLOWED_CANDIDATE_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

export const ALLOWED_CANDIDATE_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

export const CANDIDATE_DOC_INPUT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const CANDIDATE_PHOTO_INPUT_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png';

export type DocumentValidationErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE';

export interface DocumentValidationResult {
  valid: boolean;
  errorCode?: DocumentValidationErrorCode;
  errorMessage?: string;
  normalizedMimeType: string;
}

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function getFileExtension(fileName: string): string {
  const lower = (fileName || '').trim().toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  return dotIdx >= 0 ? lower.slice(dotIdx) : '';
}

export function validateCandidateDocumentFile(
  file: { name: string; type: string; size: number },
  documentType: CandidateDocument['documentType'] | string = 'additional',
  lang: LanguageCode = 'en'
): DocumentValidationResult {
  const isPhoto = documentType === 'photo';
  const ext = getFileExtension(file.name);
  const rawMime = (file.type || '').trim().toLowerCase();
  const normalizedMimeType =
    rawMime === 'image/jpg'
      ? 'image/jpeg'
      : rawMime || EXT_TO_MIME[ext] || '';

  const allowedMimes: readonly string[] = isPhoto
    ? ALLOWED_CANDIDATE_PHOTO_MIME_TYPES
    : ALLOWED_CANDIDATE_DOC_MIME_TYPES;
  const allowedExts: readonly string[] = isPhoto
    ? ALLOWED_CANDIDATE_PHOTO_EXTENSIONS
    : ALLOWED_CANDIDATE_DOC_EXTENSIONS;

  const mimeOk = rawMime ? allowedMimes.includes(rawMime) : Boolean(EXT_TO_MIME[ext]);
  const extOk = ext ? allowedExts.includes(ext) : Boolean(rawMime && allowedMimes.includes(rawMime));

  if (!mimeOk || !extOk) {
    return {
      valid: false,
      errorCode: 'INVALID_FILE_TYPE',
      errorMessage:
        lang === 'ar'
          ? isPhoto
            ? 'صيغة الصورة غير مدعومة. يجب أن تكون الصورة الشخصية بصيغة JPG أو PNG.'
            : 'صيغة الملف غير مدعومة. يُسمح فقط بملفات PDF وJPG وPNG وفق المتطلبات التنظيمية في المملكة.'
          : isPhoto
            ? 'Unsupported image format. Candidate photographs must be JPG or PNG.'
            : 'Unsupported file format. Only PDF, JPG, and PNG documents are permitted under Saudi regulatory requirements.',
      normalizedMimeType,
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      errorCode: 'EMPTY_FILE',
      errorMessage:
        lang === 'ar'
          ? 'الملف المختار فارغ (0 بايت). يرجى اختيار مستند صالح.'
          : 'Selected file is empty (0 bytes). Please choose a valid document.',
      normalizedMimeType,
    };
  }

  if (file.size > SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage:
        lang === 'ar'
          ? 'يتجاوز حجم الملف الحد الأقصى المسموح به وهو 5 ميجابايت.'
          : 'File exceeds the maximum allowed size of 5 MB.',
      normalizedMimeType,
    };
  }

  return {
    valid: true,
    normalizedMimeType,
  };
}
