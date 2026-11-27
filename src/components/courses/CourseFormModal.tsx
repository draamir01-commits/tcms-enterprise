import React, { useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { apiFetch, uploadProtectedFile } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDocumentFileValidation } from '../../hooks/useDocumentFileValidation';
import type {
  CardTemplate,
  CertificateTemplate,
  Course,
  CourseType,
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

interface CourseFormModalProps {
  open: boolean;
  editing: Course | null;
  categories: string[];
  certTemplates: CertificateTemplate[];
  cardTemplates: CardTemplate[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const COURSE_TYPE_OPTIONS: CourseType[] = [
  'theoretical',
  'practical',
  'blended',
  'certification',
  'refresher',
];

export function CourseFormModal({
  open,
  editing,
  categories,
  certTemplates,
  cardTemplates,
  onClose,
  onSaved,
}: CourseFormModalProps) {
  const { lang, t } = useLanguage();
  const {
    fieldErrors,
    validateFile,
    clearValidationErrors,
    acceptFor,
    formatFileSize,
  } = useDocumentFileValidation();

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docMetaMap, setDocMetaMap] = useState<Record<string, VaultMetaItem>>({});

  const [form, setForm] = useState({
    courseCode: '',
    titleEn: '',
    titleAr: '',
    descriptionEn: '',
    descriptionAr: '',
    category: categories[0] || 'Industrial Safety',
    courseType: 'blended' as CourseType,
    duration: 3,
    durationUnit: 'days' as Course['durationUnit'],
    theoryHours: 16,
    practicalHours: 8,
    fee: 0,
    minAttendancePct: 80,
    minExamScore: 60,
    examRequired: true,
    practicalRequired: false,
    validityMonths: 24,
    prerequisites: '',
    imageFileId: '',
    supportingDocIds: [] as string[],
    defaultCertificateTemplateId: '',
    defaultCardTemplateId: '',
    status: 'active' as Course['status'],
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    clearValidationErrors();

    if (editing) {
      const docs = editing.supportingDocIds || [];
      setForm({
        courseCode: editing.courseCode,
        titleEn: editing.titleEn,
        titleAr: editing.titleAr,
        descriptionEn: editing.descriptionEn || '',
        descriptionAr: editing.descriptionAr || '',
        category: editing.category || categories[0] || 'Industrial Safety',
        courseType: editing.courseType || 'blended',
        duration: editing.duration || 1,
        durationUnit: editing.durationUnit || 'days',
        theoryHours: editing.theoryHours ?? 0,
        practicalHours: editing.practicalHours ?? 0,
        fee: editing.fee ?? 0,
        minAttendancePct: editing.minAttendancePct ?? 80,
        minExamScore: editing.minExamScore ?? 60,
        examRequired: editing.examRequired !== false,
        practicalRequired: Boolean(editing.practicalRequired),
        validityMonths: editing.validityMonths ?? 24,
        prerequisites: editing.prerequisites || '',
        imageFileId: editing.imageFileId || '',
        supportingDocIds: docs,
        defaultCertificateTemplateId: editing.defaultCertificateTemplateId || '',
        defaultCardTemplateId: editing.defaultCardTemplateId || '',
        status: editing.status || 'active',
      });
      if (docs.length > 0) {
        apiFetch<{ files: VaultMetaItem[] }>('/api/files/meta-batch', {
          method: 'POST',
          body: JSON.stringify({ fileIds: docs }),
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
        courseCode: '',
        titleEn: '',
        titleAr: '',
        descriptionEn: '',
        descriptionAr: '',
        category: categories[0] || 'Industrial Safety',
        courseType: 'blended',
        duration: 3,
        durationUnit: 'days',
        theoryHours: 16,
        practicalHours: 8,
        fee: 0,
        minAttendancePct: 80,
        minExamScore: 60,
        examRequired: true,
        practicalRequired: false,
        validityMonths: 24,
        prerequisites: '',
        imageFileId: '',
        supportingDocIds: [],
        defaultCertificateTemplateId: '',
        defaultCardTemplateId: '',
        status: 'active',
      });
      setDocMetaMap({});
    }
  }, [open, editing, categories, clearValidationErrors]);

  const handleImageUpload = async (file: File) => {
    const check = validateFile(file, 'photo');
    if (!check.valid) return;
    setUploadingImage(true);
    setError(null);
    try {
      const uploaded = await uploadProtectedFile(file, 'course_doc');
      setForm((prev) => ({ ...prev, imageFileId: uploaded.fileId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSupportingDocUpload = async (file: File) => {
    const check = validateFile(file, 'additional');
    if (!check.valid) return;
    setUploadingDoc(true);
    setError(null);
    try {
      const uploaded = await uploadProtectedFile(file, 'course_doc');
      setDocMetaMap((prev) => ({ ...prev, [uploaded.fileId]: uploaded }));
      setForm((prev) => ({
        ...prev,
        supportingDocIds: prev.supportingDocIds.includes(uploaded.fileId)
          ? prev.supportingDocIds
          : [...prev.supportingDocIds, uploaded.fileId],
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
        await apiFetch(`/api/courses/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/courses', {
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
      title={editing ? `${t('editCourse')} · ${editing.courseCode}` : t('addCourse')}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSave} className="space-y-5">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label={t('courseId')}>
            <TextInput
              readOnly
              value={editing ? editing.courseId : 'Auto-generated (CRS-0001)'}
              className="bg-slate-50 text-slate-500 font-mono-tabular"
            />
          </FormField>

          <FormField label={t('courseCode')} required>
            <TextInput
              required
              value={form.courseCode}
              onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
              placeholder="e.g. OHS-101"
              className="font-mono-tabular uppercase"
            />
          </FormField>

          <FormField label={t('status')} required>
            <SelectInput
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Course['status'] })}
            >
              <option value="active">{t('status_active')}</option>
              <option value="inactive">{t('status_inactive')}</option>
              <option value="archived">{t('status_archived')}</option>
            </SelectInput>
          </FormField>

          <FormField label={t('courseCategory')} required>
            <SelectInput
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('courseType')} required>
            <SelectInput
              value={form.courseType}
              onChange={(e) => setForm({ ...form, courseType: e.target.value as CourseType })}
            >
              {COURSE_TYPE_OPTIONS.map((ct) => (
                <option key={ct} value={ct}>
                  {t(`courseType_${ct}`)}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('courseFeeSar')}>
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('courseTitleEn')} required>
            <TextInput
              required
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
            />
          </FormField>

          <FormField label={t('courseTitleAr')} required>
            <TextInput
              required
              dir="rtl"
              value={form.titleAr}
              onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
            />
          </FormField>

          <FormField label={t('courseDescriptionEn')}>
            <TextArea
              rows={3}
              value={form.descriptionEn}
              onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
            />
          </FormField>

          <FormField label={t('courseDescriptionAr')}>
            <TextArea
              rows={3}
              dir="rtl"
              value={form.descriptionAr}
              onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          <FormField label={t('courseDuration')} required>
            <div className="flex gap-1.5">
              <TextInput
                type="number"
                min={0.5}
                step="0.5"
                required
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                className="w-20 font-mono-tabular"
              />
              <SelectInput
                value={form.durationUnit}
                onChange={(e) =>
                  setForm({ ...form, durationUnit: e.target.value as Course['durationUnit'] })
                }
              >
                <option value="hours">{t('unit_hours')}</option>
                <option value="days">{t('unit_days')}</option>
                <option value="weeks">{t('unit_weeks')}</option>
              </SelectInput>
            </div>
          </FormField>

          <FormField label={t('theoryHours')}>
            <TextInput
              type="number"
              min={0}
              step="0.5"
              value={form.theoryHours}
              onChange={(e) => setForm({ ...form, theoryHours: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('practicalHours')}>
            <TextInput
              type="number"
              min={0}
              step="0.5"
              value={form.practicalHours}
              onChange={(e) => setForm({ ...form, practicalHours: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('certificateValidityPeriod')}>
            <TextInput
              type="number"
              min={0}
              value={form.validityMonths}
              onChange={(e) => setForm({ ...form, validityMonths: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('examRequiredLabel')}>
            <SelectInput
              value={form.examRequired ? 'yes' : 'no'}
              onChange={(e) => setForm({ ...form, examRequired: e.target.value === 'yes' })}
            >
              <option value="yes">{t('examRequiredYes')}</option>
              <option value="no">{t('examRequiredNo')}</option>
            </SelectInput>
          </FormField>

          <FormField label={t('passingScore')} required>
            <TextInput
              type="number"
              min={0}
              max={100}
              required
              disabled={!form.examRequired}
              value={form.minExamScore}
              onChange={(e) => setForm({ ...form, minExamScore: Number(e.target.value) })}
              className="font-mono-tabular disabled:bg-slate-50 disabled:text-slate-400"
            />
          </FormField>

          <FormField label={t('minAttendancePctLabel')} required>
            <TextInput
              type="number"
              min={0}
              max={100}
              required
              value={form.minAttendancePct}
              onChange={(e) => setForm({ ...form, minAttendancePct: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.practicalRequired}
                onChange={(e) => setForm({ ...form, practicalRequired: e.target.checked })}
              />
              <span>{t('practicalRequiredLabel')}</span>
            </label>
          </div>
        </div>

        <FormField label={t('prerequisites')}>
          <TextInput
            value={form.prerequisites}
            onChange={(e) => setForm({ ...form, prerequisites: e.target.value })}
            placeholder={lang === 'ar' ? 'مثال: شهادة السلامة الأساسية أو خبرة ميدانية' : 'e.g. Basic Safety Orientation or valid Iqama'}
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Default Certificate Template">
            <SelectInput
              value={form.defaultCertificateTemplateId}
              onChange={(e) =>
                setForm({ ...form, defaultCertificateTemplateId: e.target.value })
              }
            >
              <option value="">System Default Common Template</option>
              {certTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.scope})
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label="Default Card Template">
            <SelectInput
              value={form.defaultCardTemplateId}
              onChange={(e) => setForm({ ...form, defaultCardTemplateId: e.target.value })}
            >
              <option value="">System Default Card Template</option>
              {cardTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.scope})
                </option>
              ))}
            </SelectInput>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">{t('courseImage')}</span>
            <div className="flex items-center gap-3">
              {form.imageFileId && (
                <ProtectedImage
                  fileId={form.imageFileId}
                  alt={form.titleEn || 'Course cover'}
                  className="w-16 h-12 rounded object-cover border border-slate-200"
                />
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingImage ? t('loading') : t('uploadCourseImage')}</span>
                <input
                  type="file"
                  accept={acceptFor('photo')}
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImageUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {form.imageFileId && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, imageFileId: '' }))}
                  className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                  title={t('delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">{t('photoValidationHint')}</p>
            {fieldErrors.photo && <p className="text-[11px] text-red-600">{fieldErrors.photo}</p>}
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">{t('supportingDocuments')}</span>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingDoc ? t('loading') : t('uploadSupportingDoc')}</span>
              <input
                type="file"
                accept={acceptFor('additional')}
                className="hidden"
                disabled={uploadingDoc}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSupportingDocUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="text-[11px] text-slate-500">{t('docValidationHint')}</p>
            {fieldErrors.additional && (
              <p className="text-[11px] text-red-600">{fieldErrors.additional}</p>
            )}
            {form.supportingDocIds.length > 0 && (
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                {form.supportingDocIds.map((fid) => {
                  const meta = docMetaMap[fid];
                  return (
                    <div key={fid} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs">
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
                            supportingDocIds: prev.supportingDocIds.filter((id) => id !== fid),
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
            {saving ? t('loading') : t('saveCourse')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
