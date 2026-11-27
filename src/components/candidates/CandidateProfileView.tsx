import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Download,
  Edit2,
  Eye,
  FileText,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile, uploadProtectedFile } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDocumentFileValidation } from '../../hooks/useDocumentFileValidation';
import { hasPermission, isTenantAdminRole } from '../../lib/permissions';
import type {
  AssessmentRecord,
  AttendanceRecord,
  AuditLogItem,
  Batch,
  Candidate,
  CandidateDocument,
  Certificate,
  Course,
  Enrollment,
  TrainingCard,
} from '../../types/tcms';
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  Modal,
  NotificationBanner,
  PdfPreviewModal,
  SelectInput,
  StatusText,
} from '../ui/UiKit';
import { ProtectedImage } from '../ui/ProtectedImage';

export interface CandidateProfileBundle {
  candidate: Candidate;
  documents: CandidateDocument[];
  enrollments: Enrollment[];
  attendance: AttendanceRecord[];
  assessments: AssessmentRecord[];
  trainingCards: TrainingCard[];
  certificates: Certificate[];
  activity: AuditLogItem[];
}

type ProfileTabKey =
  | 'personal'
  | 'documents'
  | 'employment'
  | 'enrollments'
  | 'cards'
  | 'attendance'
  | 'assessments'
  | 'certificates'
  | 'activity';

interface CandidateProfileViewProps {
  candidateDocId: string;
  courses: Course[];
  batches: Batch[];
  onBack: () => void;
  onEdit: (candidate: Candidate) => void;
  onCandidateChanged: () => Promise<void> | void;
}

export function CandidateProfileView({
  candidateDocId,
  courses,
  batches,
  onBack,
  onEdit,
  onCandidateChanged,
}: CandidateProfileViewProps) {
  const { profile, roleMatrix } = useAuth();
  const { lang, dir, t, formatDate, formatNumber } = useLanguage();

  const [bundle, setBundle] = useState<CandidateProfileBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('personal');
  const [revealedIds, setRevealedIds] = useState<{ iqamaNumber?: string; passportNumber?: string } | null>(null);
  const [uploadDocType, setUploadDocType] = useState<CandidateDocument['documentType']>('additional');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [previewPdf, setPreviewPdf] = useState<{ fileId: string; title: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ fileId: string; title: string } | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<CandidateDocument | null>(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const {
    fieldErrors: docErrors,
    validateFile: validateDocFile,
    clearValidationErrors,
    acceptFor,
  } = useDocumentFileValidation();

  const isTrainer = profile?.role === 'trainer';
  const canEdit = hasPermission(profile, 'candidates', 'edit', roleMatrix) && profile?.role !== 'candidate';
  const canArchive =
    isTenantAdminRole(profile?.role) ||
    hasPermission(profile, 'candidates', 'delete', roleMatrix);
  const canRevealIdentity =
    isTenantAdminRole(profile?.role) || profile?.role === 'certificate_officer';

  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRevealedIds(null);
    try {
      const data = await apiFetch<CandidateProfileBundle>(`/api/candidates/${candidateDocId}/profile`);
      setBundle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [candidateDocId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleRevealIdentity = async () => {
    try {
      const data = await apiFetch<{ iqamaNumber: string; passportNumber: string }>(
        `/api/candidates/${candidateDocId}/reveal-identity`,
        { method: 'POST' }
      );
      setRevealedIds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUploadDocument = async (file: File) => {
    if (!bundle) return;
    const validation = validateDocFile(file, uploadDocType);
    if (!validation.valid) {
      setError(validation.error || t('docValidationInvalidType'));
      return;
    }
    setUploadingDoc(true);
    setError(null);
    clearValidationErrors(uploadDocType);
    try {
      const uploaded = await uploadProtectedFile(file, 'candidate_doc', {
        candidateDocId: bundle.candidate.id,
        organizationId: bundle.candidate.organizationId || '',
      });
      await apiFetch(`/api/candidates/${bundle.candidate.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          documentType: uploadDocType,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
          fileId: uploaded.fileId,
        }),
      });
      await loadProfile();
      await onCandidateChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!bundle || !confirmDeleteDoc) return;
    try {
      await apiFetch(`/api/candidates/${bundle.candidate.id}/documents/${confirmDeleteDoc.id}`, {
        method: 'DELETE',
      });
      setConfirmDeleteDoc(null);
      await loadProfile();
      await onCandidateChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmDeleteDoc(null);
    }
  };

  const handleToggleArchive = async () => {
    if (!bundle) return;
    const nextStatus = bundle.candidate.status === 'archived' ? 'active' : 'archived';
    try {
      await apiFetch(`/api/candidates/${bundle.candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setConfirmArchiveOpen(false);
      await loadProfile();
      await onCandidateChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmArchiveOpen(false);
    }
  };

  const tabs: Array<{ key: ProfileTabKey; label: string }> = [
    { key: 'personal', label: t('tabPersonalInfo') },
    { key: 'documents', label: t('tabIdentityDocs') },
    { key: 'employment', label: t('tabEmploymentInfo') },
    { key: 'enrollments', label: t('tabEnrollments') },
    { key: 'cards', label: t('tabTrainingCards') },
    { key: 'attendance', label: t('tabAttendance') },
    { key: 'assessments', label: t('tabExamResults') },
    { key: 'certificates', label: t('tabCertificates') },
    { key: 'activity', label: t('tabActivityHistory') },
  ];

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  if (loading && !bundle) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
        >
          <BackIcon className="w-3.5 h-3.5" />
          <span>{t('backToCandidates')}</span>
        </button>
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-xs text-slate-500">
          {t('loading')}
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
        >
          <BackIcon className="w-3.5 h-3.5" />
          <span>{t('backToCandidates')}</span>
        </button>
        <ErrorAlert message={error || t('noRecords')} />
      </div>
    );
  }

  const cand = bundle.candidate;
  const activeEnrollments = bundle.enrollments.filter((e) => !['cancelled', 'withdrawn'].includes(e.status));
  const presentOrLate = bundle.attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendancePct =
    bundle.attendance.length > 0 ? Math.round((presentOrLate / bundle.attendance.length) * 100) : null;

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
        >
          <BackIcon className="w-3.5 h-3.5" />
          <span>{t('backToCandidates')}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(cand)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{t('edit')}</span>
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              onClick={() => setConfirmArchiveOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md ${
                cand.status === 'archived'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {cand.status === 'archived' ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('restore')}</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  <span>{t('archive')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Header Summary Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <ProtectedImage
              fileId={isTrainer ? undefined : cand.photoFileId}
              alt={cand.fullNameEn}
              fallbackText={cand.fullNameEn}
              className="w-16 h-16 rounded-lg object-cover border border-slate-200"
              fallbackClassName="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center text-base font-semibold shrink-0"
            />
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono-tabular text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {cand.candidateId}
                </span>
                <StatusText status={cand.status} />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{cand.fullNameEn}</h2>
              {cand.fullNameAr && <p className="text-xs text-slate-600">{cand.fullNameAr}</p>}
              <p className="text-xs text-slate-500">
                {cand.companyName || t('individualUnassigned')} · {cand.nationality}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:min-w-[420px]">
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <span className="block text-[11px] text-slate-500">{t('tabEnrollments')}</span>
              <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                {formatNumber(activeEnrollments.length)}
              </span>
            </div>
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <span className="block text-[11px] text-slate-500">{t('tabTrainingCards')}</span>
              <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                {formatNumber(bundle.trainingCards.length)}
              </span>
            </div>
            {!isTrainer && (
              <div className="border border-slate-200 rounded-md px-3 py-2">
                <span className="block text-[11px] text-slate-500">{t('tabCertificates')}</span>
                <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                  {formatNumber(bundle.certificates.length)}
                </span>
              </div>
            )}
            <div className="border border-slate-200 rounded-md px-3 py-2">
              <span className="block text-[11px] text-slate-500">{t('registrationDate')}</span>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                {formatDate(cand.registrationDate)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 9-Tab Bar & Content */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/70 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Tab 1: Personal Information */}
          {activeTab === 'personal' && (
            <div className="space-y-5">
              {isTrainer && <NotificationBanner variant="info" message={t('trainerPrivacyNotice')} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('candidateId')}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">{cand.candidateId}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('fullNameEn')}</span>
                  <span className="font-medium text-slate-900">{cand.fullNameEn}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('fullNameAr')}</span>
                  <span className="font-medium text-slate-900">{cand.fullNameAr || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('nationality')}</span>
                  <span className="text-slate-900">{cand.nationality}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('gender')}</span>
                  <span className="text-slate-900">
                    {cand.gender ? t(`gender_${cand.gender}`) : '—'}
                  </span>
                </div>
                {!isTrainer && (
                  <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                    <span className="text-slate-500 block mb-0.5">{t('dateOfBirth')}</span>
                    <span className="font-mono-tabular text-slate-900">{formatDate(cand.dateOfBirth)}</span>
                  </div>
                )}
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('mobileNumber')}</span>
                  <span className="font-mono-tabular text-slate-900">{cand.mobile}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('emailAddress')}</span>
                  <span className="text-slate-900">{cand.email || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                  <span className="text-slate-500 block mb-0.5">{t('registrationDate')}</span>
                  <span className="font-mono-tabular text-slate-900">{formatDate(cand.registrationDate)}</span>
                </div>

                {!isTrainer && (
                  <>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('iqamaNumber')}</span>
                      <span className="font-mono-tabular text-slate-900">
                        {revealedIds?.iqamaNumber || cand.iqamaMasked || '—'}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('iqamaExpiryDate')}</span>
                      <span className="font-mono-tabular text-slate-900">
                        {formatDate(cand.iqamaExpiryDate)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('passportNumber')}</span>
                      <span className="font-mono-tabular text-slate-900">
                        {revealedIds?.passportNumber || cand.passportMasked || '—'}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('passportExpiryDate')}</span>
                      <span className="font-mono-tabular text-slate-900">
                        {formatDate(cand.passportExpiryDate)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('address')}</span>
                      <span className="text-slate-900">{cand.address || '—'}</span>
                    </div>
                    <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                      <span className="text-slate-500 block mb-0.5">{t('emergencyContact')}</span>
                      <span className="text-slate-900">{cand.emergencyContact || '—'}</span>
                    </div>
                    {cand.notes && (
                      <div className="sm:col-span-2 lg:col-span-3 p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                        <span className="text-slate-500 block mb-0.5">{t('notes')}</span>
                        <span className="text-slate-900 whitespace-pre-wrap">{cand.notes}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {canRevealIdentity && !revealedIds && (
                <div>
                  <button
                    type="button"
                    onClick={() => void handleRevealIdentity()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-300 bg-amber-50 text-amber-800 rounded-md hover:bg-amber-100"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t('revealIdentity')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Identity Documents */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              {isTrainer ? (
                <NotificationBanner variant="info" message={t('trainerPrivacyNotice')} />
              ) : (
                <>
                  {canEdit && (
                    <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-48">
                          <SelectInput
                            value={uploadDocType}
                            onChange={(e) => {
                              clearValidationErrors();
                              setUploadDocType(e.target.value as CandidateDocument['documentType']);
                            }}
                          >
                            <option value="photo">{t('docType_photo')}</option>
                            <option value="iqama_copy">{t('docType_iqama_copy')}</option>
                            <option value="passport_copy">{t('docType_passport_copy')}</option>
                            <option value="additional">{t('docType_additional')}</option>
                          </SelectInput>
                        </div>
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 text-white rounded-md cursor-pointer hover:bg-slate-800">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingDoc ? t('loading') : t('uploadDocument')}</span>
                          <input
                            type="file"
                            disabled={uploadingDoc}
                            className="hidden"
                            accept={acceptFor(uploadDocType)}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadDocument(f);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                        <span className="text-[11px] text-slate-500">
                          {uploadDocType === 'photo'
                            ? t('photoValidationHint')
                            : t('docValidationHint')}
                        </span>
                      </div>
                      {docErrors[uploadDocType] && (
                        <p className="text-[11px] text-red-600">{docErrors[uploadDocType]}</p>
                      )}
                    </div>
                  )}

                  {bundle.documents.length === 0 ? (
                    <EmptyState
                      title={t('noRecords')}
                      description={
                        lang === 'ar'
                          ? 'لم يتم رفع وثائق هوية أو مرفقات لهذا المتدرب بعد.'
                          : 'No identity copies or supporting documents have been uploaded yet.'
                      }
                    />
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                      {bundle.documents.map((doc) => {
                        const isImage = (doc.mimeType || '').startsWith('image/');
                        const isPdf = doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf');
                        return (
                          <div
                            key={doc.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 truncate">{doc.fileName}</p>
                                <p className="text-[11px] text-slate-500">
                                  {t(`docType_${doc.documentType}`)} · {formatFileSize(doc.fileSize)} ·{' '}
                                  <span className="font-mono-tabular">{formatDate(doc.createdAt)}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {(isImage || isPdf) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isImage) {
                                      setPreviewImage({ fileId: doc.fileId, title: doc.fileName });
                                    } else {
                                      setPreviewPdf({ fileId: doc.fileId, title: doc.fileName });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded hover:bg-slate-50"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{t('previewFile')}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void downloadProtectedFile(`/api/files/${doc.fileId}`, doc.fileName)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded hover:bg-slate-50"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{t('download')}</span>
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteDoc(doc)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded hover:bg-red-50"
                                  title={t('delete')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab 3: Employment Information */}
          {activeTab === 'employment' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('companyEmployer')}</span>
                <span className="font-medium text-slate-900">
                  {cand.companyName || t('individualUnassigned')}
                </span>
              </div>
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('corporateOrganization')}</span>
                <span className="font-mono-tabular text-slate-900">{cand.organizationId || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('employeeId')}</span>
                <span className="font-mono-tabular text-slate-900">{cand.employeeId || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('jobTitle')}</span>
                <span className="text-slate-900">{cand.jobTitle || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('department')}</span>
                <span className="text-slate-900">{cand.department || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-md">
                <span className="text-slate-500 block mb-0.5">{t('workLocation')}</span>
                <span className="text-slate-900">{cand.workLocation || '—'}</span>
              </div>
            </div>
          )}

          {/* Tab 4: Enrollments */}
          {activeTab === 'enrollments' && (
            bundle.enrollments.length === 0 ? (
              <EmptyState title={t('noRecords')} description="" />
            ) : (
              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 text-start">Enrollment #</th>
                      <th className="py-2.5 px-3 text-start">{t('perm_domain_courses')}</th>
                      <th className="py-2.5 px-3 text-start">{t('perm_domain_batches')}</th>
                      <th className="py-2.5 px-3 text-start">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bundle.enrollments.map((enr) => {
                      const course = courseMap.get(enr.courseId);
                      const batch = batchMap.get(enr.batchId);
                      return (
                        <tr key={enr.id}>
                          <td className="py-2.5 px-3 font-mono-tabular font-medium text-slate-900">
                            {enr.enrollmentNumber}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800">
                            {course ? (lang === 'ar' ? course.titleAr : course.titleEn) : enr.courseId}
                          </td>
                          <td className="py-2.5 px-3 font-mono-tabular text-slate-700">
                            {batch ? `${batch.batchNumber} (${batch.startDate})` : enr.batchId}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusText status={enr.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Tab 5: Training Cards */}
          {activeTab === 'cards' && (
            bundle.trainingCards.length === 0 ? (
              <EmptyState title={t('noRecords')} description="" />
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {bundle.trainingCards.map((card) => (
                  <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                    <div>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {card.cardSerialNumber}
                      </span>
                      <span className="text-slate-600 ms-2">
                        {lang === 'ar' ? card.snapshot.courseTitleAr : card.snapshot.courseTitleEn} · v{card.version}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusText status={card.status} />
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPdf({ fileId: card.pdfFileId, title: card.cardSerialNumber })
                        }
                        className="text-sky-700 hover:underline font-medium"
                      >
                        {t('previewFile')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(`/api/files/${card.pdfFileId}`, `${card.cardSerialNumber}.pdf`)
                        }
                        className="text-slate-700 hover:underline font-medium"
                      >
                        {t('downloadPdf')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Tab 6: Attendance */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {attendancePct !== null && (
                <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
                  <span className="font-medium text-slate-700">
                    {t('perm_domain_attendance')}:{' '}
                    <strong className="font-mono-tabular text-slate-900">{attendancePct}%</strong>
                  </span>
                  <span className="text-slate-500 font-mono-tabular">
                    ({presentOrLate} / {bundle.attendance.length})
                  </span>
                </div>
              )}

              {bundle.attendance.length === 0 ? (
                <EmptyState title={t('noRecords')} description="" />
              ) : (
                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-start">Date</th>
                        <th className="py-2.5 px-3 text-start">{t('perm_domain_batches')}</th>
                        <th className="py-2.5 px-3 text-start">{t('status')}</th>
                        <th className="py-2.5 px-3 text-start">{t('notes')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bundle.attendance.map((att) => {
                        const batch = batchMap.get(att.batchId);
                        return (
                          <tr key={att.id}>
                            <td className="py-2.5 px-3 font-mono-tabular">{att.date}</td>
                            <td className="py-2.5 px-3 font-mono-tabular">
                              {batch ? batch.batchNumber : att.batchId}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusText status={att.status} />
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{att.remarks || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 7: Examination Results */}
          {activeTab === 'assessments' && (
            bundle.assessments.length === 0 ? (
              <EmptyState title={t('noRecords')} description="" />
            ) : (
              <div className="border border-slate-200 rounded-md overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 text-start">Date</th>
                      <th className="py-2.5 px-3 text-start">{t('perm_domain_courses')}</th>
                      <th className="py-2.5 px-3 text-start">Type</th>
                      <th className="py-2.5 px-3 text-start">Attempt</th>
                      <th className="py-2.5 px-3 text-start">Score</th>
                      <th className="py-2.5 px-3 text-start">{t('status')}</th>
                      <th className="py-2.5 px-3 text-start">{t('notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bundle.assessments.map((a) => {
                      const course = courseMap.get(a.courseId);
                      return (
                        <tr key={a.id}>
                          <td className="py-2.5 px-3 font-mono-tabular">{a.assessmentDate}</td>
                          <td className="py-2.5 px-3">
                            {course ? (lang === 'ar' ? course.titleAr : course.titleEn) : a.courseId}
                          </td>
                          <td className="py-2.5 px-3 capitalize">{a.assessmentType.replace(/_/g, ' ')}</td>
                          <td className="py-2.5 px-3 font-mono-tabular">#{a.attemptNumber}</td>
                          <td className="py-2.5 px-3 font-mono-tabular">
                            {a.obtainedMarks} / {a.maxMarks}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusText status={a.result} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{a.remarks || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Tab 8: Certificates */}
          {activeTab === 'certificates' && (
            isTrainer ? (
              <NotificationBanner variant="info" message={t('trainerPrivacyNotice')} />
            ) : bundle.certificates.length === 0 ? (
              <EmptyState title={t('noRecords')} description="" />
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {bundle.certificates.map((cert) => (
                  <div key={cert.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                    <div>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {cert.certificateNumber}
                      </span>
                      <span className="text-slate-600 ms-2">
                        {lang === 'ar' ? cert.snapshot.courseTitleAr : cert.snapshot.courseTitleEn} ·{' '}
                        <span className="font-mono-tabular">{cert.issueDate}</span>
                        {cert.expiryDate ? ` → ${cert.expiryDate}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusText status={cert.status} />
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewPdf({ fileId: cert.pdfFileId, title: cert.certificateNumber })
                        }
                        className="text-sky-700 hover:underline font-medium"
                      >
                        {t('previewFile')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(
                            `/api/files/${cert.pdfFileId}`,
                            `${cert.certificateNumber}.pdf`
                          )
                        }
                        className="text-slate-700 hover:underline font-medium"
                      >
                        {t('downloadPdf')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Tab 9: Activity History */}
          {activeTab === 'activity' && (
            bundle.activity.length === 0 ? (
              <EmptyState title={t('noRecords')} description="" />
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {bundle.activity.map((log) => (
                  <div key={log.id} className="px-4 py-3 text-xs flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="font-semibold text-slate-900">{log.action}</span>
                      {log.details && <span className="text-slate-600 ms-2">{log.details}</span>}
                    </div>
                    <span className="font-mono-tabular text-slate-400 shrink-0">
                      {(log.createdAt || '').slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Document Previews & Confirmations */}
      <PdfPreviewModal
        fileId={previewPdf?.fileId || null}
        title={previewPdf?.title || 'Document Preview'}
        onClose={() => setPreviewPdf(null)}
      />

      <Modal
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.title || t('previewFile')}
        maxWidth="max-w-2xl"
      >
        {previewImage && (
          <div className="flex flex-col items-center gap-4">
            <ProtectedImage
              fileId={previewImage.fileId}
              alt={previewImage.title}
              className="max-h-[70vh] w-auto rounded-md border border-slate-200 object-contain"
              fallbackClassName="w-full h-64 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-sm"
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDeleteDoc)}
        title={t('confirmDeleteDocumentTitle')}
        message={t('confirmDeleteDocumentMsg')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => void handleDeleteDocument()}
        onCancel={() => setConfirmDeleteDoc(null)}
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        title={cand.status === 'archived' ? t('confirmRestoreTitle') : t('confirmArchiveTitle')}
        message={cand.status === 'archived' ? t('confirmRestoreMsg') : t('confirmArchiveMsg')}
        confirmLabel={cand.status === 'archived' ? t('restore') : t('archive')}
        danger={cand.status !== 'archived'}
        onConfirm={() => void handleToggleArchive()}
        onCancel={() => setConfirmArchiveOpen(false)}
      />
    </div>
  );
}
