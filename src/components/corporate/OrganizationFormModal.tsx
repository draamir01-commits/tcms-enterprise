import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Organization } from '../../types/tcms';
import { ErrorAlert, FormField, Modal, SelectInput, TextArea, TextInput } from '../ui/UiKit';

interface OrganizationFormModalProps {
  open: boolean;
  editing: Organization | null;
  onClose: () => void;
  onSaved: (organization: Organization) => Promise<void> | void;
}

export function OrganizationFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: OrganizationFormModalProps) {
  const { t } = useLanguage();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const initializedEditIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    nameEn: '',
    nameAr: '',
    crNumber: '',
    vatNumber: '',
    city: '',
    address: '',
    contactPerson: '',
    contactDesignation: '',
    mobile: '',
    email: '',
    billingInfo: '',
    notes: '',
    status: 'active' as Organization['status'],
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
    setError(null);
    if (editing) {
      setForm({
        nameEn: editing.nameEn || '',
        nameAr: editing.nameAr || '',
        crNumber: editing.crNumber || '',
        vatNumber: editing.vatNumber || '',
        city: editing.city || '',
        address: editing.address || '',
        contactPerson: editing.contactPerson || '',
        contactDesignation: editing.contactDesignation || '',
        mobile: editing.mobile || '',
        email: editing.email || '',
        billingInfo: editing.billingInfo || '',
        notes: editing.notes || '',
        status: editing.status || 'active',
      });
    } else {
      setForm({
        nameEn: '',
        nameAr: '',
        crNumber: '',
        vatNumber: '',
        city: '',
        address: '',
        contactPerson: '',
        contactDesignation: '',
        mobile: '',
        email: '',
        billingInfo: '',
        notes: '',
        status: 'active',
      });
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let saved: Organization;
      if (editing) {
        const res = await apiFetch<{ organization: Organization }>(`/api/organizations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        saved = res.organization;
      } else {
        const res = await apiFetch<{ organization: Organization }>('/api/organizations', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        saved = res.organization;
      }
      await onSaved(saved);
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
      closeOnBackdropClick={false}
      title={editing ? `${t('editCorporateClient')} — ${editing.organizationId}` : t('addCorporateClient')}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        {/* Section 1: Company Identification */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
              {t('sectionOrgIdentity')}
            </h4>
            <span className="text-[11px] font-mono-tabular text-slate-500">
              {editing ? editing.organizationId : t('orgIdAutoHint')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('companyNameEn')} required>
              <TextInput
                required
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              />
            </FormField>

            <FormField label={t('companyNameAr')} required>
              <TextInput
                required
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              />
            </FormField>

            <FormField label={t('crNumber')}>
              <TextInput
                dir="ltr"
                className="font-mono-tabular"
                value={form.crNumber}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
              />
            </FormField>

            <FormField label={t('vatNumber')}>
              <TextInput
                dir="ltr"
                className="font-mono-tabular"
                value={form.vatNumber}
                onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
              />
            </FormField>
          </div>
        </section>

        {/* Section 2: Primary Contact & Location */}
        <section className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800 pb-2 border-b border-slate-200">
            {t('sectionContactLocation')}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('contactPerson')} required>
              <TextInput
                required
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </FormField>

            <FormField label={t('contactDesignation')}>
              <TextInput
                value={form.contactDesignation}
                onChange={(e) => setForm({ ...form, contactDesignation: e.target.value })}
              />
            </FormField>

            <FormField label={t('mobileNumber')} required>
              <TextInput
                required
                dir="ltr"
                className="font-mono-tabular"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </FormField>

            <FormField label={t('emailAddress')} required>
              <TextInput
                required
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>

            <FormField label={t('city')}>
              <TextInput
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </FormField>

            <FormField label={t('address')}>
              <TextInput
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </FormField>
          </div>
        </section>

        {/* Section 3: Billing & Notes */}
        <section className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800 pb-2 border-b border-slate-200">
            {t('sectionBillingNotes')}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label={t('billingInfo')}>
              <TextArea
                rows={3}
                value={form.billingInfo}
                onChange={(e) => setForm({ ...form, billingInfo: e.target.value })}
              />
            </FormField>

            <FormField label={t('notes')}>
              <TextArea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>

          {editing && (
            <div className="max-w-xs">
              <FormField label={t('status')}>
                <SelectInput
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Organization['status'] })}
                >
                  <option value="active">{t('status_active')}</option>
                  <option value="inactive">{t('status_inactive')}</option>
                  <option value="suspended">{t('status_suspended')}</option>
                </SelectInput>
              </FormField>
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? t('loading') : t('saveOrganization')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
