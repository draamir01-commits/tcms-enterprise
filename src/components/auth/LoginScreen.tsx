import React, { useState } from 'react';
import {
  ShieldCheck,
  Globe,
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
  LogOut,
  KeyRound,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ErrorAlert, NotificationBanner } from '../ui/UiKit';

export function LoginScreen({
  onOpenPublicVerify,
  onBackHome,
  onOpenRegister,
}: {
  onOpenPublicVerify: () => void;
  onBackHome?: () => void;
  onOpenRegister?: () => void;
}) {
  const {
    firebaseUser,
    loginWithGoogle,
    loginWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    reloadAndRefreshSession,
    logout,
    authError,
    emailUnverified,
    sessionExpiredNotice,
    clearAuthMessages,
    loading,
  } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoBanner(null);
    clearAuthMessages();
    setSubmitting(true);
    try {
      await loginWithEmail(email, password, rememberMe);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoBanner(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setInfoBanner(t('resetEmailSent'));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setLocalError(null);
    setInfoBanner(null);
    setSubmitting(true);
    try {
      await resendVerificationEmail();
      setInfoBanner(t('verificationEmailSent'));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    setLocalError(null);
    setInfoBanner(null);
    setSubmitting(true);
    try {
      await reloadAndRefreshSession();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
            </button>
          )}
          <span className="font-display font-bold text-base sm:text-lg text-slate-900 truncate">
            {t('appTitle')}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={onOpenPublicVerify}
            className="hidden sm:inline-block text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
          >
            {t('publicVerificationPortal')}
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-6 sm:p-8 space-y-5">
          {emailUnverified && firebaseUser ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-bold text-slate-900">
                  {t('emailVerifyRequiredTitle')}
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('emailVerifyRequiredDesc')}
                </p>
                <p className="text-xs font-mono-tabular font-semibold text-slate-800 pt-1">
                  {firebaseUser.email}
                </p>
              </div>

              <NotificationBanner
                variant="success"
                message={infoBanner}
                onDismiss={() => setInfoBanner(null)}
              />
              <ErrorAlert
                message={activeError}
                onDismiss={() => {
                  setLocalError(null);
                  clearAuthMessages();
                }}
              />

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleCheckVerified()}
                  className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('iveVerifiedContinue')}</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleResendVerification()}
                  className="w-full min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>{t('resendVerificationEmail')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('signOut')}</span>
                </button>
              </div>
            </div>
          ) : mode === 'reset' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900">
                  <KeyRound className="w-5 h-5 text-slate-700 shrink-0" />
                  <h1 className="font-display text-xl font-bold">{t('resetPasswordTitle')}</h1>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('resetPasswordSubtitle')}
                </p>
              </div>

              <NotificationBanner
                variant="success"
                message={infoBanner}
                onDismiss={() => setInfoBanner(null)}
              />
              <ErrorAlert
                message={activeError}
                onDismiss={() => {
                  setLocalError(null);
                  clearAuthMessages();
                }}
              />

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    {t('emailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.sa"
                      className="w-full ps-9 pe-3 py-2.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <span>{t('sendResetLink')}</span>
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);
                  setInfoBanner(null);
                  clearAuthMessages();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                <span>{t('backToLogin')}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  {t('appTitle')}
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {lang === 'ar'
                    ? 'منصة متكاملة لإدارة المتدربين والدورات والشركات وإصدار بطاقات التدريب والشهادات المعتمدة.'
                    : 'Enterprise training operations platform for candidate registration, corporate clients, batch scheduling, training cards, and verified certificates.'}
                </p>
              </div>

              {sessionExpiredNotice && (
                <NotificationBanner
                  variant="warning"
                  message={t('sessionExpiredNotice')}
                  onDismiss={clearAuthMessages}
                />
              )}

              <ErrorAlert
                message={activeError}
                onDismiss={() => {
                  setLocalError(null);
                  clearAuthMessages();
                }}
              />

              <form onSubmit={handleEmailSignIn} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    {t('emailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.sa"
                      className="w-full ps-9 pe-3 py-2.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      {t('passwordLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setLocalError(null);
                        setInfoBanner(null);
                        clearAuthMessages();
                      }}
                      className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                    >
                      {t('forgotPassword')}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full ps-9 pe-10 py-2.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-0"
                  />
                  <span>{t('rememberMe')}</span>
                </label>

                <button
                  type="submit"
                  disabled={loading || submitting}
                  className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{t('signInWithEmail')}</span>
                </button>
              </form>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-2.5 text-[11px] text-slate-500">
                    {t('orContinueWith')}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={loading || submitting}
                  onClick={() => void loginWithGoogle()}
                  className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-800 text-xs font-medium rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>{t('signInWithGoogle')}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenPublicVerify}
                  className="w-full min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-xs font-medium rounded-md hover:bg-slate-50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('publicVerificationPortal')}</span>
                </button>

                {onOpenRegister && (
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="w-full min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 border border-blue-200 bg-blue-50/70 text-blue-700 text-xs font-semibold rounded-md hover:bg-blue-100/70 transition-colors"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>
                      {lang === 'ar'
                        ? 'مركز تدريب جديد؟ سجّل شركتك الآن'
                        : 'New training center? Register your company'}
                    </span>
                  </button>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                {lang === 'ar'
                  ? 'يتم تطبيق صلاحيات الوصول حسب الدور المؤسسي (المدير العام، الإدارة، مسؤول الشهادات، المدرب، عميل الشركة، المتدرب).'
                  : 'Access is enforced by organizational role (Super Admin, Administrator, Certificate Officer, Trainer, Corporate Client, Candidate).'}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
