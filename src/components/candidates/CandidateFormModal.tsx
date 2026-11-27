import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit2, Eye, Loader2, Upload } from 'lucide-react';
import { ApiError, apiFetch, uploadProtectedFile } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { isTenantAdminRole } from '../../lib/permissions';
import { useDocumentFileValidation } from '../../hooks/useDocumentFileValidation';
import type { Candidate, CandidateDocument, Organization } from '../../types/tcms';
import {
  ErrorAlert,
  FormField,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
} from '../ui/UiKit';
import { ProtectedImage } from '../ui/ProtectedImage';

export interface DuplicateMatch {
  idType: 'iqama' | 'passport';
  candidateDocId: string;
  candidateId: string;
  sameOrganization: boolean;
  canResolve: boolean;
  candidate?: Candidate;
}

interface CandidateFormModalProps {
  open: boolean;
  editing: Candidate | null;
  organizations: Organization[];
  defaultOrganizationId?: string;
  onClose: () => void;
  onSaved: (candidate: Candidate) => Promise<void> | void;
  onResolveViewCandidate: (candidate: Candidate) => void;
  onResolveEditCandidate: (candidate: Candidate) => void;
}

const COMMON_NATIONALITIES = [
  'Saudi Arabia',
  'India',
  'Pakistan',
  'Egypt',
  'Philippines',
  'Bangladesh',
  'Nepal',
  'Yemen',
  'Sudan',
  'Jordan',
  'Syria',
  'United Kingdom',
  'United States',
];

export function CandidateFormModal({
  open,
  editing,
  organizations,
  defaultOrganizationId,
  onClose,
  onSaved,
  onResolveViewCandidate,
  onResolveEditCandidate,
}: CandidateFormModalProps) {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();

  const isCorporate = profile?.role === 'corporate_client';
  const canManageStatus = isTenantAdminRole(profile?.role);
  const canEditIdentityNumbers = !editing || canManageStatus;
  const wasOpenRef = useRef(false);
  const initializedEditIdRef = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingDups, setCheckingDups] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [pendingDocs, setPendingDocs] = useState<Array<{ type: CandidateDocument['documentType']; file: File }>>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const {
    fieldErrors: docErrors,
    validateFile: validateDocFile,
    validateBeforeUpload,
    clearValidationErrors,
    acceptFor,
    formatFileSize,
  } = useDocumentFileValidation();

  const [form, setForm] = useState({
    fullNameEn: '',
    fullNameAr: '',
    gender: '' as '' | 'male' | 'female',
    dateOfBirth: '',
    nationality: 'Saudi Arabia',
    mobile: '',
    email: '',
    iqamaNumber: '',
    iqamaExpiryDate: '',
    passportNumber: '',
    passportExpiryDate: '',
    organizationId: '',
    companyName: '',
    employeeId: '',
    jobTitle: '',
    department: '',
    workLocation: '',
    address: '',
    emergencyContact: '',
    notes: '',
    registrationDate: new Date().toISOString().slice(0, 10),
    status: 'active' as Candidate['status'],
    photoFileId: '',
  });

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      initializedEditIdRef.current = null;
      return;
    }
    const nextEditId = editing?.id || '__new__';
    if (wasOpenRef.current && initializedEditIdRef.current === nextEditId) {
      return;
    }
    wasOpenRef.current = true;
    initializedEditIdRef.current = nextEditId;

    setFormError(null);
    setDuplicates([]);
    setPendingDocs([]);
    clearValidationErrors();
    if (editing) {
      setForm({
        fullNameEn: editing.fullNameEn || '',
        fullNameAr: editing.fullNameAr || '',
        gender: editing.gender || '',
        dateOfBirth: editing.dateOfBirth || '',
        nationality: editing.nationality || 'Saudi Arabia',
        mobile: editing.mobile || '',
        email: editing.email || '',
        iqamaNumber: '',
        iqamaExpiryDate: editing.iqamaExpiryDate || '',
        passportNumber: '',
        passportExpiryDate: editing.passportExpiryDate || '',
        organizationId: editing.organizationId || '',
        companyName: editing.companyName || '',
        employeeId: editing.employeeId || '',
        jobTitle: editing.jobTitle || '',
        department: editing.department || '',
        workLocation: editing.workLocation || '',
        address: editing.address || '',
        emergencyContact: editing.emergencyContact || '',
        notes: editing.notes || '',
        registrationDate: editing.registrationDate || new Date().toISOString().slice(0, 10),
        status: editing.status || 'active',
        photoFileId: editing.photoFileId || '',
      });
    } else {
      const targetOrgId = isCorporate ? profile?.organizationId || '' : defaultOrganizationId || '';
      const ownOrg = targetOrgId ? organizations.find((o) => o.id === targetOrgId) : undefined;
      setForm({
        fullNameEn: '',
        fullNameAr: '',
        gender: '',
        dateOfBirth: '',
        nationality: 'Saudi Arabia',
        mobile: '',
        email: '',
        iqamaNumber: '',
        iqamaExpiryDate: '',
        passportNumber: '',
        passportExpiryDate: '',
        organizationId: targetOrgId,
        companyName: ownOrg?.nameEn || '',
        employeeId: '',
        jobTitle: '',
        department: '',
        workLocation: '',
        address: '',
        emergencyContact: '',
        notes: '',
        registrationDate: new Date().toISOString().slice(0, 10),
        status: 'active',
        photoFileId: '',
      });
    }
  }, [open, editing, isCorporate, defaultOrganizationId, organizations, profile?.organizationId, clearValidationErrors]);

  useEffect(() => {
    const pendingPhoto = pendingDocs.find((d) => d.type === 'photo')?.file;
    if (!pendingPhoto) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingPhoto);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingDocs]);

  useEffect(() => {
    if (!open || !canEditIdentityNumbers) return;
    const iq = form.iqamaNumber.trim();
    const pp = form.passportNumber.trim();
    if (iq.length < 5 && pp.length < 5) {
      setDuplicates([]);
      setCheckingDups(false);
      return;
    }

    let cancelled = false;
    setCheckingDups(true);
    const timer = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (iq.length >= 5) qs.set('iqamaNumber', iq);
        if (pp.length >= 5) qs.set('passportNumber', pp);
        if (editing?.id) qs.set('excludeDocId', editing.id);
        const res = await apiFetch<{ duplicates: DuplicateMatch[] }>(
          `/api/candidates/check-duplicate?${qs.toString()}`
        );
        if (!cancelled) {
          setDuplicates(res.duplicates || []);
        }
      } catch {
        if (!cancelled) setDuplicates([]);
      } finally {
        if (!cancelled) setCheckingDups(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, canEditIdentityNumbers, form.iqamaNumber, form.passportNumber, editing?.id]);

  const setPendingFile = (type: CandidateDocument['documentType'], file: File | undefined) => {
    if (!file) return;
    const check = validateDocFile(file, type);
    if (!check.valid) {
      setPendingDocs((prev) => prev.filter((d) => d.type !== type));
      return;
    }
    setPendingDocs((prev) => [...prev.filter((d) => d.type !== type), { type, file }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editing && !form.iqamaNumber.trim() && !form.passportNumber.trim()) {
      setFormError(
        lang === 'ar'
          ? 'يجب إدخال رقم الإقامة أو رقم جواز السفر على الأقل.'
          : 'Please enter either an Iqama number or a Passport number.'
      );
      return;
    }

    const docCheck = validateBeforeUpload(pendingDocs);
    if (!docCheck.valid) {
      setFormError(docCheck.firstError || t('docValidationInvalidType'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        fullNameEn: form.fullNameEn.trim(),
        fullNameAr: form.fullNameAr.trim() || form.fullNameEn.trim(),
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth,
        nationality: form.nationality.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        iqamaExpiryDate: form.iqamaExpiryDate,
        passportExpiryDate: form.passportExpiryDate,
        employeeId: form.employeeId.trim(),
        jobTitle: form.jobTitle.trim(),
        department: form.department.trim(),
        workLocation: form.workLocation.trim(),
        address: form.address.trim(),
        emergencyContact: form.emergencyContact.trim(),
        notes: form.notes.trim(),
      };

      if (!isCorporate) {
        payload.organizationId = form.organizationId;
        payload.companyName = form.companyName.trim();
      }
      if (canManageStatus) {
        payload.status = form.status;
      }
      if (!editing) {
        payload.registrationDate = form.registrationDate;
        payload.iqamaNumber = form.iqamaNumber.trim();
        payload.passportNumber = form.passportNumber.trim();
      } else if (canManageStatus) {
        if (form.iqamaNumber.trim()) payload.iqamaNumber = form.iqamaNumber.trim();
        if (form.passportNumber.trim()) payload.passportNumber = form.passportNumber.trim();
      }

      const res = editing
        ? await apiFetch<{ candidate: Candidate }>(`/api/candidates/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ candidate: Candidate }>('/api/candidates', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      const savedCand = res.candidate;

      for (const item of pendingDocs) {
        const uploaded = await uploadProtectedFile(item.file, 'candidate_doc', {
          candidateDocId: savedCand.id,
          organizationId: savedCand.organizationId || '',
        });
        await apiFetch(`/api/candidates/${savedCand.id}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            documentType: item.type,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.fileSize,
            fileId: uploaded.fileId,
          }),
        });
      }

      await onSaved(savedCand);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_IDENTITY') {
        const serverDups = Array.isArray(err.data?.duplicates)
          ? (err.data.duplicates as DuplicateMatch[])
          : [];
        if (serverDups.length > 0) setDuplicates(serverDups);
      }
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdropClick={false}
      title={editing ? `${t('edit')} — ${editing.candidateId}` : t('candidateRegistration')}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />

        {duplicates.length > 0 && (
          <div className="border border-amber-300 bg-amber-50/90 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-950">{t('duplicateDetectedTitle')}</p>
                <p className="text-xs text-amber-900">{t('duplicateDetectedHint')}</p>
              </div>
            </div>

            <div className="space-y-2">
              {duplicates.map((dup) => (
                <div
                  key={`${dup.idType}-${dup.candidateDocId}`}
                  className="flex flex-wrap items-center justify-between gap-3 bg-white border border-amber-200 rounded-md px-3 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {dup.candidateId}
                    </span>
                    <span className="ms-2 text-slate-500">
                      ({dup.idType === 'iqama' ? t('iqamaNumber') : t('passportNumber')})
                    </span>
                    {dup.candidate ? (
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {dup.candidate.fullNameEn}
                        {dup.candidate.fullNameAr ? ` · ${dup.candidate.fullNameAr}` : ''}
                        {dup.candidate.companyName ? ` · ${dup.candidate.companyName}` : ''}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-800 mt-0.5">
                        {t('crossOrgDuplicateNotice')}
                      </div>
                    )}
                  </div>

                  {dup.canResolve && dup.candidate && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onResolveViewCandidate(dup.candidate!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-50"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{t('viewExistingCandidate')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolveEditCandidate(dup.candidate!)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{t('editExistingCandidate')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 1: Personal Information */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              {t('sectionPersonalInfo')}
            </h4>
            <span className="text-[11px] font-mono-tabular text-slate-500">
              {editing ? editing.candidateId : t('candidateIdAutoHint')}
            </span>
          </div>

          <div
            className={`p-3 bg-slate-50 border rounded-md space-y-2 ${
              docErrors.photo ? 'border-red-300 bg-red-50/30' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt={form.fullNameEn || 'Candidate photo'}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <ProtectedImage
                  fileId={form.photoFileId}
                  alt={form.fullNameEn || 'Candidate'}
                  fallbackText={form.fullNameEn || 'CN'}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                  fallbackClassName="w-14 h-14 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center text-sm font-semibold shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800">{t('photograph')}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {pendingDocs.find((d) => d.type === 'photo')
                    ? `${pendingDocs.find((d) => d.type === 'photo')!.file.name} (${formatFileSize(
                        pendingDocs.find((d) => d.type === 'photo')!.file.size
                      )})`
                    : form.photoFileId
                      ? lang === 'ar'
                        ? 'تم حفظ صورة شخصية مسبقاً — ارفع ملفاً جديداً للاستبدال'
                        : 'Photo stored in private vault — upload new image to replace'
                      : t('photoValidationHint')}
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md cursor-pointer hover:bg-slate-100 shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{t('uploadDocument')}</span>
                <input
                  type="file"
                  className="hidden"
                  accept={acceptFor('photo')}
                  onChange={(e) => {
                    setPendingFile('photo', e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {docErrors.photo && <p className="text-[11px] text-red-600">{docErrors.photo}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('fullNameEn')} required>
              <TextInput
                required
                value={form.fullNameEn}
                onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
                placeholder="e.g. Abdullah Mohammed Al-Harbi"
              />
            </FormField>

            <FormField label={t('fullNameAr')} required>
              <TextInput
                required
                dir="rtl"
                value={form.fullNameAr}
                onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
                placeholder="مثال: عبدالله محمد الحربي"
              />
            </FormField>

            <FormField label={t('nationality')} required>
              <TextInput
                required
                list="tcms-nationalities-list"
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              />
              <datalist id="tcms-nationalities-list">
                {COMMON_NATIONALITIES.map((nat) => (
                  <option key={nat} value={nat} />
                ))}
              </datalist>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('dateOfBirth')}>
                <TextInput
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                />
              </FormField>
              <FormField label={t('gender')}>
                <SelectInput
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value as '' | 'male' | 'female' })}
                >
                  <option value="">—</option>
                  <option value="male">{t('gender_male')}</option>
                  <option value="female">{t('gender_female')}</option>
                </SelectInput>
              </FormField>
            </div>

            <FormField label={t('mobileNumber')} required>
              <TextInput
                required
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="+966 5x xxx xxxx"
                className="font-mono-tabular"
              />
            </FormField>

            <FormField label={t('emailAddress')}>
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="candidate@company.com"
              />
            </FormField>
          </div>
        </section>

        {/* Section 2: Identity Information */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              {t('sectionIdentityInfo')}
            </h4>
            {checkingDups && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t('checkingDuplicates')}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label={t('iqamaNumber')}
              hint={
                editing
                  ? `${editing.iqamaMasked ? `${editing.iqamaMasked} · ` : ''}${
                      canEditIdentityNumbers ? t('identityEditHint') : ''
                    }`
                  : undefined
              }
            >
              <TextInput
                disabled={!canEditIdentityNumbers}
                value={form.iqamaNumber}
                onChange={(e) => setForm({ ...form, iqamaNumber: e.target.value })}
                placeholder={editing?.iqamaMasked || '1xxxxxxxxx / 2xxxxxxxxx'}
                className="font-mono-tabular disabled:bg-slate-50"
              />
            </FormField>

            <FormField label={t('iqamaExpiryDate')}>
              <TextInput
                type="date"
                value={form.iqamaExpiryDate}
                onChange={(e) => setForm({ ...form, iqamaExpiryDate: e.target.value })}
              />
            </FormField>

            <FormField
              label={t('passportNumber')}
              hint={
                editing
                  ? `${editing.passportMasked ? `${editing.passportMasked} · ` : ''}${
                      canEditIdentityNumbers ? t('identityEditHint') : ''
                    }`
                  : undefined
              }
            >
              <TextInput
                disabled={!canEditIdentityNumbers}
                value={form.passportNumber}
                onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
                placeholder={editing?.passportMasked || 'A1234567'}
                className="font-mono-tabular disabled:bg-slate-50"
              />
            </FormField>

            <FormField label={t('passportExpiryDate')}>
              <TextInput
                type="date"
                value={form.passportExpiryDate}
                onChange={(e) => setForm({ ...form, passportExpiryDate: e.target.value })}
              />
            </FormField>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-500">{t('docValidationHint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ['iqama_copy', t('docType_iqama_copy')],
                  ['passport_copy', t('docType_passport_copy')],
                ] as const
              ).map(([docType, label]) => {
                const selected = pendingDocs.find((d) => d.type === docType)?.file;
                const docErr = docErrors[docType];
                return (
                  <div key={docType} className="space-y-1">
                    <label
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 border border-dashed rounded-md cursor-pointer transition-colors ${
                        docErr
                          ? 'border-red-300 bg-red-50/40'
                          : selected
                            ? 'border-emerald-300 bg-emerald-50/40'
                            : 'border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {selected ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="block text-xs font-medium text-slate-800">{label}</span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {selected
                              ? `${selected.name} (${formatFileSize(selected.size)})`
                              : lang === 'ar'
                                ? 'اختر ملفاً (PDF، JPG، PNG)'
                                : 'Select PDF, JPG, or PNG'}
                          </span>
                        </div>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept={acceptFor(docType)}
                        onChange={(e) => {
                          setPendingFile(docType, e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {docErr && <p className="text-[11px] text-red-600">{docErr}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 3: Employment Information */}
        <section className="space-y-4">
          <div className="pb-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              {t('sectionEmploymentInfo')}
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!isCorporate && (
              <FormField label={t('corporateOrganization')}>
                <SelectInput
                  value={form.organizationId}
                  onChange={(e) => {
                    const org = organizations.find((o) => o.id === e.target.value);
                    setForm({
                      ...form,
                      organizationId: e.target.value,
                      companyName: org ? org.nameEn : '',
                    });
                  }}
                >
                  <option value="">{t('individualUnassigned')}</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {lang === 'ar' && o.nameAr ? `${o.nameAr} — ${o.nameEn}` : o.nameEn}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            )}

            <FormField label={t('companyEmployer')}>
              <TextInput
                disabled={isCorporate}
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="disabled:bg-slate-50"
              />
            </FormField>

            <FormField label={t('employeeId')}>
              <TextInput
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="font-mono-tabular"
              />
            </FormField>

            <FormField label={t('jobTitle')}>
              <TextInput
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </FormField>

            <FormField label={t('department')}>
              <TextInput
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </FormField>

            <FormField label={t('workLocation')}>
              <TextInput
                value={form.workLocation}
                onChange={(e) => setForm({ ...form, workLocation: e.target.value })}
                placeholder="e.g. Jubail Industrial City"
              />
            </FormField>
          </div>
        </section>

        {/* Section 4: Additional Information */}
        <section className="space-y-4">
          <div className="pb-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              {t('sectionAdditionalInfo')}
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('address')}>
              <TextInput
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </FormField>

            <FormField label={t('emergencyContact')}>
              <TextInput
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                placeholder="Name · +966 5x xxx xxxx"
              />
            </FormField>

            {!editing && (
              <FormField label={t('registrationDate')}>
                <TextInput
                  type="date"
                  value={form.registrationDate}
                  onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                />
              </FormField>
            )}

            {canManageStatus && (
              <FormField label={t('status')}>
                <SelectInput
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Candidate['status'] })}
                >
                  <option value="active">{t('status_active')}</option>
                  <option value="inactive">{t('status_inactive')}</option>
                  <option value="suspended">{t('status_suspended')}</option>
                  <option value="archived">{t('status_archived')}</option>
                </SelectInput>
              </FormField>
            )}
          </div>

          <FormField label={t('notes')}>
            <TextArea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
        </section>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || duplicates.length > 0}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? t('loading') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export { CandidateFormModal as CandidateRegistrationForm };
