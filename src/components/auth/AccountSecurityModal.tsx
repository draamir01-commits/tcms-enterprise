import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, Shield, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getPermissionActionLabel, getPermissionDomainLabel, getRoleLabel } from '../../i18n/translations';
import { validatePasswordStrength } from '../../lib/passwordPolicy';
import { PERMISSION_DOMAINS } from '../../lib/permissions';
import type { LanguageCode } from '../../types/tcms';
import {
  ErrorAlert,
  FormField,
  Modal,
  NotificationBanner,
  SelectInput,
  StatusText,
  TextInput,
} from '../ui/UiKit';

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useLanguage();
  const res = validatePasswordStrength(password);
  const strengthLabel =
    res.score >= 4
      ? t('pwStrengthStrong')
      : res.score === 3
        ? t('pwStrengthGood')
        : res.score === 2
          ? t('pwStrengthFair')
          : t('pwStrengthWeak');

  const barColor =
    res.score >= 4
      ? 'bg-emerald-600'
      : res.score === 3
        ? 'bg-sky-600'
        : res.score === 2
          ? 'bg-amber-500'
          : 'bg-red-500';

  const rules: Array<{ ok: boolean; label: string }> = [
    { ok: res.checks.minLength, label: t('pwRuleMinLength') },
    { ok: res.checks.upper, label: t('pwRuleUpper') },
    { ok: res.checks.lower, label: t('pwRuleLower') },
    { ok: res.checks.number, label: t('pwRuleNumber') },
    { ok: res.checks.special, label: t('pwRuleSpecial') },
  ];

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between text-[11px]">
        <div className="grid grid-cols-4 gap-1.5 flex-1 me-3">
          {[1, 2, 3, 4].map((seg) => (
            <div
              key={seg}
              className={`h-1.5 rounded-sm transition-colors ${
                password.length > 0 && res.score >= seg ? barColor : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <span className="font-medium text-slate-600 min-w-[48px] text-end">
          {password.length > 0 ? strengthLabel : '—'}
        </span>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
        {rules.map((r) => (
          <li
            key={r.label}
            className={`flex items-center gap-1.5 ${
              r.ok ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {r.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300" />
            )}
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountSecurityModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    firebaseUser,
    profile,
    effectivePermissions,
    changePassword,
    updateMyProfile,
  } = useAuth();
  const { lang, t } = useLanguage();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.displayName || '');
      setPhone(profile.phone || '');
      setPreferredLanguage(profile.preferredLanguage || lang);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [open, profile, lang]);

  if (!profile) return null;

  const hasPasswordProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === 'password')
  );
  const pwCheck = validatePasswordStrength(newPassword);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setProfileSaving(true);
    try {
      await updateMyProfile({ displayName, phone, preferredLanguage });
      setSuccess(t('profileUpdatedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    if (!pwCheck.valid) {
      setError(t('authErrorWeakPassword'));
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(t('passwordUpdatedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPwSaving(false);
    }
  };

  const scopeLabel = profile.organizationId
    ? `Org: ${profile.organizationId}`
    : profile.trainerId
      ? `Trainer: ${profile.trainerId}`
      : profile.candidateId
        ? `Candidate: ${profile.candidateId}`
        : 'Global';

  return (
    <Modal open={open} onClose={onClose} title={t('accountSecurity')} maxWidth="max-w-3xl">
      <div className="space-y-6">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />
        <NotificationBanner variant="success" message={success} onDismiss={() => setSuccess(null)} />

        {/* Read-only Identity & Session Snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-md text-xs">
          <div>
            <p className="text-[11px] text-slate-500">{t('emailLabel')}</p>
            <p className="font-mono-tabular font-medium text-slate-900 truncate mt-0.5">{profile.email}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Role</p>
            <p className="font-medium text-slate-900 mt-0.5">{getRoleLabel(profile.role, lang)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">{t('status')}</p>
            <div className="mt-0.5">
              <StatusText status={profile.status} />
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">{t('lastLoginLabel')}</p>
            <p className="font-mono-tabular text-slate-700 mt-0.5">
              {profile.lastLoginAt ? profile.lastLoginAt.slice(0, 16).replace('T', ' ') : t('neverSignedIn')}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {t('assignedScopeLabel')}: {scopeLabel}
            </p>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 border border-slate-200 rounded-md p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <UserCheck className="w-4 h-4 text-slate-700" />
            <span>{t('myProfile')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label={t('displayNameLabel')} required>
              <TextInput
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </FormField>
            <FormField label={t('phoneNumberLabel')}>
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+966 5X XXX XXXX"
              />
            </FormField>
            <FormField label={t('preferredLanguageLabel')}>
              <SelectInput
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value === 'ar' ? 'ar' : 'en')}
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </SelectInput>
            </FormField>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </form>

        {/* Change or Link Password Form */}
        <form onSubmit={handleSavePassword} className="space-y-4 border border-slate-200 rounded-md p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <span>{hasPasswordProvider ? t('changePasswordTitle') : t('setPasswordTitle')}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
            >
              {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!hasPasswordProvider && (
            <p className="text-[11px] text-slate-600">{t('setPasswordHint')}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {hasPasswordProvider && (
              <FormField label={t('currentPassword')} required>
                <TextInput
                  type={showPasswords ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </FormField>
            )}
            <FormField label={t('newPassword')} required>
              <TextInput
                type={showPasswords ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>
            <FormField label={t('confirmNewPassword')} required>
              <TextInput
                type={showPasswords ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </FormField>
          </div>

          <PasswordStrengthMeter password={newPassword} />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwSaving || !pwCheck.valid || newPassword !== confirmPassword}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {hasPasswordProvider ? t('changePasswordTitle') : t('setPasswordTitle')}
            </button>
          </div>
        </form>

        {/* Read-only Effective Permissions Matrix Summary */}
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Shield className="w-4 h-4 text-slate-700" />
            <span>{t('effectivePermissionsSummary')}</span>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 text-xs">
            {PERMISSION_DOMAINS.map((domain) => {
              const actions = effectivePermissions[domain] || [];
              return (
                <div key={domain} className="px-4 py-2 flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-800">
                    {getPermissionDomainLabel(domain, lang)}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-slate-600">
                    {actions.length > 0
                      ? actions.map((a) => getPermissionActionLabel(a, lang)).join(' · ')
                      : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
