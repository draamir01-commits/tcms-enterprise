import React, { useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { apiFetch, uploadProtectedFile } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDocumentFileValidation } from '../../hooks/useDocumentFileValidation';
import type {
  Course,
  Trainer,
  TrainerEmploymentStatus,
  UserProfile,
} from '../../types/tcms';
import {
  ErrorAlert,
  FormField,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
} from '../ui/UiKit';
import { ProtectedImage } from '../ui/ProtectedImage';

interface VaultMetaItem {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface TrainerFormModalProps {
  open: boolean;
  editing: Trainer | null;
  courses: Course[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const EMPLOYMENT_STATUSES: TrainerEmploymentStatus[] = [
  'full_time',
  'part_time',
  'contract',
  'freelance',
];

export function TrainerFormModal({
  open,
  editing,
  courses,
  onClose,
  onSaved,
}: TrainerFormModalProps) {
  const { lang, t } = useLanguage();
  const {
    fieldErrors,
    validateFile,
    clearValidationErrors,
    acceptFor,
    formatFileSize,
  } = useDocumentFileValidation();

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainerUsers, setTrainerUsers] = useState<UserProfile[]>([]);
  const [docMetaMap, setDocMetaMap] = useState<Record<string, VaultMetaItem>>({});

  const [form, setForm] = useState({
    userId: '',
    nameEn: '',
    nameAr: '',
    mobile: '',
    email: '',
    nationality: 'Saudi Arabia',
    qualifications: '',
    certifications: '',
    specialization: '',
    experienceYears: 5,
    employmentStatus: 'full_time' as TrainerEmploymentStatus,
    assignedCourseIds: [] as string[],
    photoFileId: '',
    credentialFileIds: [] as string[],
    status: 'active' as Trainer['status'],
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    clearValidationErrors();

    apiFetch<{ users: UserProfile[] }>('/api/users')
      .then((res) => {
        setTrainerUsers((res.users || []).filter((u) => u.role === 'trainer'));
      })
      .catch(() => setTrainerUsers([]));

    if (editing) {
      const creds = editing.credentialFileIds || [];
      setForm({
        userId: editing.userId || '',
        nameEn: editing.nameEn,
        nameAr: editing.nameAr,
        mobile: editing.mobile,
        email: editing.email,
        nationality: editing.nationality || '',
        qualifications: editing.qualifications || '',
        certifications: editing.certifications || '',
        specialization: editing.specialization || '',
        experienceYears: editing.experienceYears ?? 0,
        employmentStatus: editing.employmentStatus || 'full_time',
        assignedCourseIds: editing.assignedCourseIds || [],
        photoFileId: editing.photoFileId || '',
        credentialFileIds: creds,
        status: editing.status || 'active',
      });
      if (creds.length > 0) {
        apiFetch<{ files: VaultMetaItem[] }>('/api/files/meta-batch', {
          method: 'POST',
          body: JSON.stringify({ fileIds: creds }),
        })
          .then((res) => {
            const nextMap: Record<string, VaultMetaItem> = {};
            for (const f of res.files || []) nextMap[f.fileId] = f;
            setDocMetaMap(nextMap);
          })
          .catch(() => setDocMetaMap({}));
      } else {
        setDocMetaMap({});
      }
    } else {
      setForm({
        userId: '',
        nameEn: '',
        nameAr: '',
        mobile: '',
        email: '',
        nationality: 'Saudi Arabia',
        qualifications: '',
        certifications: '',
        specialization: '',
        experienceYears: 5,
        employmentStatus: 'full_time',
        assignedCourseIds: [],
        photoFileId: '',
        credentialFileIds: [],
        status: 'active',
      });
      setDocMetaMap({});
    }
  }, [open, editing, clearValidationErrors]);

  const handlePhotoUpload = async (file: File) => {
    const check = validateFile(file, 'photo');
    if (!check.valid) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded = await uploadProtectedFile(file, 'trainer_doc');
      setForm((prev) => ({ ...prev, photoFileId: uploaded.fileId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCredentialUpload = async (file: File) => {
    const check = validateFile(file, 'additional');
    if (!check.valid) return;
    setUploadingDoc(true);
    setError(null);
    try {
      const uploaded = await uploadProtectedFile(file, 'trainer_doc');
      setDocMetaMap((prev) => ({ ...prev, [uploaded.fileId]: uploaded }));
      setForm((prev) => ({
        ...prev,
        credentialFileIds: prev.credentialFileIds.includes(uploaded.fileId)
          ? prev.credentialFileIds
          : [...prev.credentialFileIds, uploaded.fileId],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/trainers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/trainers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `${t('editTrainer')} · ${editing.trainerId}` : t('addTrainer')}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSave} className="space-y-5">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        <div className="flex flex-wrap items-center gap-4 p-3.5 border border-slate-200 rounded-lg bg-slate-50/50">
          <ProtectedImage
            fileId={form.photoFileId || undefined}
            alt={form.nameEn || 'Trainer'}
            fallbackText={form.nameEn || 'TR'}
            className="w-14 h-14 rounded-full object-cover border border-slate-200"
            fallbackClassName="w-14 h-14 rounded-full bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center text-sm font-semibold shrink-0"
          />
          <div className="space-y-1 flex-1 min-w-[200px]">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingPhoto ? t('loading') : t('uploadTrainerPhoto')}</span>
                <input
                  type="file"
                  accept={acceptFor('photo')}
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePhotoUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {form.photoFileId && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, photoFileId: '' }))}
                  className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">{t('photoValidationHint')}</p>
            {fieldErrors.photo && <p className="text-[11px] text-red-600">{fieldErrors.photo}</p>}
          </div>
          {editing && (
            <div className="text-end">
              <span className="text-[11px] text-slate-500 block">{t('trainerIdLabel')}</span>
              <span className="font-mono-tabular font-semibold text-sm text-slate-900">
                {editing.trainerId}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('trainerNameEn')} required>
            <TextInput
              required
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
          </FormField>

          <FormField label={t('trainerNameAr')} required>
            <TextInput
              required
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            />
          </FormField>

          <FormField label={t('mobileNumber')} required>
            <TextInput
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('emailAddress')} required>
            <TextInput
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>

          <FormField label={t('nationality')} required>
            <TextInput
              required
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              placeholder="e.g. Saudi Arabia"
            />
          </FormField>

          <FormField label={t('specializationLabel')} required>
            <TextInput
              required
              value={form.specialization}
              onChange={(e) => setForm({ ...form, specialization: e.target.value })}
              placeholder="e.g. NEBOSH / Industrial Safety"
            />
          </FormField>

          <FormField label={t('yearsOfExperience')}>
            <TextInput
              type="number"
              min={0}
              value={form.experienceYears}
              onChange={(e) => setForm({ ...form, experienceYears: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('employmentStatus')} required>
            <SelectInput
              value={form.employmentStatus}
              onChange={(e) =>
                setForm({ ...form, employmentStatus: e.target.value as TrainerEmploymentStatus })
              }
            >
              {EMPLOYMENT_STATUSES.map((es) => (
                <option key={es} value={es}>
                  {t(`empStatus_${es}`)}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('status')} required>
            <SelectInput
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Trainer['status'] })}
            >
              <option value="active">{t('status_active')}</option>
              <option value="inactive">{t('status_inactive')}</option>
              <option value="archived">{t('status_archived')}</option>
            </SelectInput>
          </FormField>

          <FormField label={t('linkedUserAccount')}>
            <SelectInput
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">{t('noLinkedUser')}</option>
              {trainerUsers.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </SelectInput>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('professionalQualifications')}>
            <TextArea
              rows={2}
              value={form.qualifications}
              onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              placeholder="e.g. B.Sc. Occupational Health & Safety"
            />
          </FormField>

          <FormField label={t('certificationsLabel')}>
            <TextArea
              rows={2}
              value={form.certifications}
              onChange={(e) => setForm({ ...form, certifications: e.target.value })}
              placeholder="e.g. NEBOSH IGC, OSHA 30-Hr, H2S Instructor"
            />
          </FormField>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('assignCourses')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2.5">
            {courses.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.assignedCourseIds.includes(c.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...form.assignedCourseIds, c.id]
                      : form.assignedCourseIds.filter((id) => id !== c.id);
                    setForm({ ...form, assignedCourseIds: next });
                  }}
                />
                <span className="truncate">
                  <span className="font-mono-tabular font-semibold me-1">{c.courseCode}</span>
                  — {lang === 'ar' ? c.titleAr : c.titleEn}
                </span>
              </label>
            ))}
            {courses.length === 0 && (
              <p className="text-xs text-slate-500 col-span-2">{t('noRecords')}</p>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="block text-xs font-medium text-slate-700">
            {t('qualificationDocuments')}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingDoc ? t('loading') : t('uploadQualificationDoc')}</span>
              <input
                type="file"
                accept={acceptFor('additional')}
                className="hidden"
                disabled={uploadingDoc}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCredentialUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-[11px] text-slate-500">{t('docValidationHint')}</span>
          </div>
          {fieldErrors.additional && (
            <p className="text-[11px] text-red-600">{fieldErrors.additional}</p>
          )}

          {form.credentialFileIds.length > 0 && (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
              {form.credentialFileIds.map((fid) => {
                const meta = docMetaMap[fid];
                return (
                  <div key={fid} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-slate-700">
                        {meta ? meta.fileName : fid}
                      </span>
                      {meta && (
                        <span className="text-[11px] text-slate-400 font-mono-tabular shrink-0">
                          {formatFileSize(meta.fileSize)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          credentialFileIds: prev.credentialFileIds.filter((id) => id !== fid),
                        }))
                      }
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? t('loading') : t('saveTrainer')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
