import { useCallback, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CANDIDATE_DOC_INPUT_ACCEPT,
  CANDIDATE_PHOTO_INPUT_ACCEPT,
  SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES,
  validateCandidateDocumentFile,
} from '../lib/documentValidation';
import type { CandidateDocument } from '../types/tcms';

export type DocumentFieldErrors = Partial<Record<CandidateDocument['documentType'], string>>;

export function useDocumentFileValidation() {
  const { lang, t } = useLanguage();
  const [fieldErrors, setFieldErrors] = useState<DocumentFieldErrors>({});

  const resolveErrorText = useCallback(
    (
      errorCode: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'INVALID_FILE_TYPE' | undefined,
      documentType: CandidateDocument['documentType'],
      fallbackMsg?: string
    ): string => {
      switch (errorCode) {
        case 'EMPTY_FILE':
          return t('docValidationEmptyFile', fallbackMsg);
        case 'FILE_TOO_LARGE':
          return t('docValidationTooLarge', fallbackMsg);
        case 'INVALID_FILE_TYPE':
          return documentType === 'photo'
            ? t('photoValidationInvalidType', fallbackMsg)
            : t('docValidationInvalidType', fallbackMsg);
        default:
          return fallbackMsg || t('docValidationInvalidType');
      }
    },
    [t]
  );

  const validateFile = useCallback(
    (
      file: File | null | undefined,
      documentType: CandidateDocument['documentType']
    ): { valid: boolean; error?: string } => {
      if (!file) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[documentType];
          return next;
        });
        return { valid: true };
      }

      const result = validateCandidateDocumentFile(file, documentType, lang);
      if (!result.valid) {
        const message = resolveErrorText(result.errorCode, documentType, result.errorMessage);
        setFieldErrors((prev) => ({ ...prev, [documentType]: message }));
        return { valid: false, error: message };
      }

      setFieldErrors((prev) => {
        if (!prev[documentType]) return prev;
        const next = { ...prev };
        delete next[documentType];
        return next;
      });
      return { valid: true };
    },
    [lang, resolveErrorText]
  );

  const validateBeforeUpload = useCallback(
    (
      attachments: Array<{ type: CandidateDocument['documentType']; file: File }>
    ): { valid: boolean; errors: DocumentFieldErrors; firstError?: string } => {
      const nextErrors: DocumentFieldErrors = {};
      let firstError: string | undefined;

      for (const item of attachments) {
        const res = validateCandidateDocumentFile(item.file, item.type, lang);
        if (!res.valid) {
          const msg = resolveErrorText(res.errorCode, item.type, res.errorMessage);
          nextErrors[item.type] = msg;
          if (!firstError) firstError = msg;
        }
      }

      setFieldErrors(nextErrors);
      return {
        valid: Object.keys(nextErrors).length === 0,
        errors: nextErrors,
        firstError,
      };
    },
    [lang, resolveErrorText]
  );

  const clearValidationErrors = useCallback((documentType?: CandidateDocument['documentType']) => {
    if (!documentType) {
      setFieldErrors({});
      return;
    }
    setFieldErrors((prev) => {
      if (!prev[documentType]) return prev;
      const next = { ...prev };
      delete next[documentType];
      return next;
    });
  }, []);

  const acceptFor = useCallback((documentType: CandidateDocument['documentType']) => {
    return documentType === 'photo' ? CANDIDATE_PHOTO_INPUT_ACCEPT : CANDIDATE_DOC_INPUT_ACCEPT;
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, []);

  return {
    maxFileSizeBytes: SAUDI_REGULATORY_MAX_FILE_SIZE_BYTES,
    fieldErrors,
    validateFile,
    validateBeforeUpload,
    clearValidationErrors,
    acceptFor,
    formatFileSize,
  };
}
