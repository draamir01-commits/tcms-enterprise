import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Batch, Course, Trainer, TrainingMode } from '../../types/tcms';
import { ErrorAlert, FormField, Modal, NotificationBanner, SelectInput, TextArea, TextInput } from '../ui/UiKit';

function toMinutes(val: string | undefined, fallback: number): number {
  if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fallback;
  const [h, m] = val.trim().split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

const TRAINING_MODES: TrainingMode[] = ['classroom', 'practical', 'online', 'hybrid'];

export function BatchFormModal({
  open,
  editingBatch,
  courses,
  trainers,
  allBatches,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingBatch: Batch | null;
  courses: Course[];
  trainers: Trainer[];
  allBatches: Batch[];
  onClose: () => void;
  onSaved: (batch: Batch) => Promise<void> | void;
}) {
  const { lang, t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    batchNumber: '',
    batchName: '',
    courseId: '',
    trainerId: '',
    venue: '',
    trainingMode: 'classroom' as TrainingMode,
    startDate: '',
    endDate: '',
    startTime: '08:00',
    endTime: '16:00',
    capacity: 20,
    minParticipants: 5,
    status: 'scheduled' as Batch['status'],
    enrollmentClosed: false,
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    const today = new Date().toISOString().slice(0, 10);
    if (editingBatch) {
      setForm({
        batchNumber: editingBatch.batchNumber || '',
        batchName: editingBatch.batchName || '',
        courseId: editingBatch.courseId || '',
        trainerId: editingBatch.trainerId || '',
        venue: editingBatch.venue || '',
        trainingMode: editingBatch.trainingMode || 'classroom',
        startDate: editingBatch.startDate || today,
        endDate: editingBatch.endDate || today,
        startTime: editingBatch.startTime || '08:00',
        endTime: editingBatch.endTime || '16:00',
        capacity: editingBatch.capacity || 20,
        minParticipants: editingBatch.minParticipants ?? 1,
        status: editingBatch.status || 'scheduled',
        enrollmentClosed: Boolean(editingBatch.enrollmentClosed),
        notes: editingBatch.notes || '',
      });
    } else {
      const firstActiveCourse = courses.find((c) => c.status === 'active') || courses[0];
      const firstActiveTrainer = trainers.find((tr) => tr.status === 'active') || trainers[0];
      setForm({
        batchNumber: '',
        batchName: '',
        courseId: firstActiveCourse?.id || '',
        trainerId: firstActiveTrainer?.id || '',
        venue: 'Main Training Hall A',
        trainingMode: 'classroom',
        startDate: today,
        endDate: today,
        startTime: '08:00',
        endTime: '16:00',
        capacity: 20,
        minParticipants: 5,
        status: 'scheduled',
        enrollmentClosed: false,
        notes: '',
      });
    }
  }, [open, editingBatch, courses, trainers]);

  const activeTrainers = useMemo(
    () => trainers.filter((tr) => tr.status === 'active' || tr.id === form.trainerId),
    [trainers, form.trainerId]
  );

  const scheduleConflict = useMemo(() => {
    if (!open || !form.trainerId || !form.startDate || !form.endDate) return null;
    if (form.status !== 'scheduled' && form.status !== 'in_progress') return null;

    const sMin = toMinutes(form.startTime, 8 * 60);
    const eMin = toMinutes(form.endTime, 16 * 60);

    return (
      allBatches.find((b) => {
        if (editingBatch && b.id === editingBatch.id) return false;
        if (b.trainerId !== form.trainerId) return false;
        if (b.status !== 'scheduled' && b.status !== 'in_progress') return false;
        if (!(form.startDate <= b.endDate && form.endDate >= b.startDate)) return false;
        const bSMin = toMinutes(b.startTime, 8 * 60);
        const bEMin = toMinutes(b.endTime, 16 * 60);
        return sMin < bEMin && eMin > bSMin;
      }) || null
    );
  }, [open, form, allBatches, editingBatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (form.endDate < form.startDate) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }
    if (form.minParticipants > form.capacity) {
      setFormError('Minimum required participants cannot exceed maximum capacity.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity),
        minParticipants: Number(form.minParticipants),
      };
      const res = editingBatch
        ? await apiFetch<{ batch: Batch }>(`/api/batches/${editingBatch.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ batch: Batch }>('/api/batches', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      await onSaved(res.batch);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingBatch ? `${t('editBatchTitle')} — ${editingBatch.batchId}` : t('scheduleBatch')}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />

        {scheduleConflict && (
          <NotificationBanner
            variant="warning"
            message={`${t('scheduleConflictWarning')}: ${t('scheduleConflictDesc')} ${scheduleConflict.batchNumber} (${scheduleConflict.startDate} → ${scheduleConflict.endDate}, ${scheduleConflict.startTime || '08:00'}–${scheduleConflict.endTime || '16:00'})`}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label={t('batchIdLabel')} hint="BTH-YYYY-0001">
            <TextInput
              value={editingBatch?.batchId || t('autoGenerated')}
              readOnly
              className="bg-slate-50 text-slate-600 font-mono-tabular"
            />
          </FormField>

          <FormField label={t('batchNumberLabel')}>
            <TextInput
              value={form.batchNumber}
              onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              placeholder={t('autoGenerated')}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('batchNameLabel')}>
            <TextInput
              value={form.batchName}
              onChange={(e) => setForm({ ...form, batchName: e.target.value })}
              placeholder={t('batchNamePlaceholder')}
            />
          </FormField>

          <FormField label={t('trainingModeLabel')} required>
            <SelectInput
              required
              value={form.trainingMode}
              onChange={(e) => setForm({ ...form, trainingMode: e.target.value as TrainingMode })}
            >
              {TRAINING_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode_${m}`)}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('nav_courses')} required>
            <SelectInput
              required
              value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            >
              <option value="">--</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} — {lang === 'ar' ? c.titleAr : c.titleEn}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('nav_trainers')} required>
            <SelectInput
              required
              value={form.trainerId}
              onChange={(e) => setForm({ ...form, trainerId: e.target.value })}
            >
              <option value="">--</option>
              {activeTrainers.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {lang === 'ar' ? tr.nameAr : tr.nameEn} ({tr.specialization})
                  {tr.status !== 'active' ? ` [${tr.status}]` : ''}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label={t('trainingLocationLabel')} required>
            <TextInput
              required
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
            />
          </FormField>

          <FormField label={t('status')}>
            <SelectInput
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Batch['status'] })}
              disabled={!editingBatch}
            >
              <option value="scheduled">{t('status_scheduled')}</option>
              <option value="in_progress">{t('status_in_progress')}</option>
              <option value="completed">{t('status_completed')}</option>
              <option value="cancelled">{t('status_cancelled')}</option>
            </SelectInput>
          </FormField>

          <FormField label={t('startDate')} required>
            <TextInput
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('endDate')} required>
            <TextInput
              required
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('startTime')}>
            <TextInput
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('endTime')}>
            <TextInput
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField
            label={t('maxCapacityLabel')}
            required
            hint={editingBatch ? `${editingBatch.enrollmentCount} ${t('enrolled')}` : undefined}
          >
            <TextInput
              required
              type="number"
              min={Math.max(1, editingBatch?.enrollmentCount || 1)}
              max={500}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>

          <FormField label={t('minParticipantsLabel')}>
            <TextInput
              type="number"
              min={0}
              max={form.capacity}
              value={form.minParticipants}
              onChange={(e) => setForm({ ...form, minParticipants: Number(e.target.value) })}
              className="font-mono-tabular"
            />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.enrollmentClosed}
            onChange={(e) => setForm({ ...form, enrollmentClosed: e.target.checked })}
          />
          <span>{t('closeEnrollment')}</span>
        </label>

        <FormField label={t('batchNotesLabel')}>
          <TextArea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={1000}
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || Boolean(scheduleConflict)}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? t('loading') : t('saveBatch')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
