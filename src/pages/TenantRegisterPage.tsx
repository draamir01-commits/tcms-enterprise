import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_SUBSCRIPTION_PLANS, formatPlanPrice } from '../lib/saasDefaults';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import type { BillingCycle, SubscriptionPlan } from '../types/tcms';

interface TenantRegisterPageProps {
  initialPlanCode?: string;
  initialBillingCycle?: BillingCycle;
  onBackHome: () => void;
  onNavigateLogin: () => void;
}

export function TenantRegisterPage({
  initialPlanCode,
  initialBillingCycle,
  onBackHome,
  onNavigateLogin,
}: TenantRegisterPageProps) {
  const { lang, setLang } = useLanguage();
  const { registerTenantWithGoogle } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [selectedPlan, setSelectedPlan] = useState(initialPlanCode || 'professional');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialBillingCycle || 'annual');

  const [form, setForm] = useState({
    nameEn: '',
    nameAr: '',
    legalName: '',
    crNumber: '',
    vatNumber: '',
    country: 'Saudi Arabia',
    city: '',
    address: '',
    website: '',
    companyEmail: '',
    companyPhone: '',
    ownerDisplayName: '',
    ownerMobile: '',
    ownerEmail: '',
    password: '',
    confirmPassword: '',
    defaultLanguage: lang,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: 'verification_required' | 'provisioned';
    email: string;
    tenantNameEn: string;
    planCode: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/public/saas-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { subscriptionPlans?: SubscriptionPlan[] } | null) => {
        if (data?.subscriptionPlans && data.subscriptionPlans.length > 0) {
          setPlans(data.subscriptionPlans);
        }
      })
      .catch(() => {});
  }, []);

  const pwCheck = validatePasswordStrength(form.password);
  const activePlanObj = plans.find((p) => p.code === selectedPlan) || plans[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError(
        lang === 'ar'
          ? 'كلمتا المرور غير متطابقتين.'
          : 'Password and confirmation password do not match.'
      );
      return;
    }
    if (!pwCheck.valid) {
      setError(
        lang === 'ar'
          ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتشمل حرفاً كبيراً وصغيراً ورقماً ورمزاً خاصاً.'
          : 'Password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/register-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn: form.nameEn,
          nameAr: form.nameAr || form.nameEn,
          legalName: form.legalName || form.nameEn,
          crNumber: form.crNumber,
          vatNumber: form.vatNumber,
          country: form.country,
          city: form.city,
          address: form.address,
          website: form.website,
          companyEmail: form.companyEmail || form.ownerEmail,
          companyPhone: form.companyPhone || form.ownerMobile,
          ownerDisplayName: form.ownerDisplayName,
          ownerMobile: form.ownerMobile || form.companyPhone,
          ownerEmail: form.ownerEmail,
          password: form.password,
          planCode: selectedPlan,
          billingCycle,
          defaultLanguage: form.defaultLanguage,
        }),
      });
      const data = (await res.json()) as {
        status?: 'verification_required' | 'provisioned';
        email?: string;
        tenantNameEn?: string;
        planCode?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setResult({
        status: data.status || 'verification_required',
        email: data.email || form.ownerEmail,
        tenantNameEn: data.tenantNameEn || form.nameEn,
        planCode: data.planCode || selectedPlan,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleProvision = async () => {
    setError(null);
    if (!form.nameEn.trim() || form.nameEn.trim().length < 2) {
      setError(
        lang === 'ar'
          ? 'يرجى إدخال اسم مركز التدريب بالإنجليزية أولاً قبل المتابعة بحساب Google.'
          : 'Please enter the Training Center English Name before continuing with Google.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const regRes = await registerTenantWithGoogle({
        nameEn: form.nameEn,
        nameAr: form.nameAr || form.nameEn,
        legalName: form.legalName || form.nameEn,
        crNumber: form.crNumber,
        vatNumber: form.vatNumber,
        country: form.country,
        city: form.city,
        address: form.address,
        website: form.website,
        companyEmail: form.companyEmail,
        companyPhone: form.companyPhone || form.ownerMobile,
        ownerDisplayName: form.ownerDisplayName,
        ownerMobile: form.ownerMobile || form.companyPhone,
        planCode: selectedPlan,
        billingCycle,
        defaultLanguage: form.defaultLanguage,
      });
      if (regRes.status === 'verification_required') {
        setResult({
          status: 'verification_required',
          email: regRes.email || '',
          tenantNameEn: regRes.tenantNameEn || form.nameEn,
          planCode: regRes.planCode || selectedPlan,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030714] text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="h-16 border-b border-white/10 bg-[#050A1B]/90 backdrop-blur px-4 sm:px-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-cyan-300"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          <span>{lang === 'ar' ? 'العودة للصفحة الرئيسية' : 'Back to Home'}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-white/15 rounded-md text-slate-200 hover:bg-white/5"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
          <button
            type="button"
            onClick={onNavigateLogin}
            className="px-3.5 py-1.5 text-xs font-medium text-white border border-white/15 rounded-md hover:border-cyan-400/40"
          >
            {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {result ? (
          <div className="max-w-xl mx-auto rounded-2xl border border-emerald-400/30 bg-[#071029] p-8 text-center space-y-5">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h1 className="font-display text-2xl font-bold text-white">
              {lang === 'ar'
                ? 'تم إنشاء تسجيل مركز التدريب بنجاح'
                : 'Training Center Registration Created'}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? `تم إرسال رابط التفعيل إلى البريد الإلكتروني ${result.email}. يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول لتفعيل مساحة عمل ${result.tenantNameEn} تلقائياً.`
                : `A verification email has been sent to ${result.email}. Please verify your email address, then sign in to automatically activate your ${result.tenantNameEn} workspace.`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onNavigateLogin}
                className="px-6 py-3 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md"
              >
                {lang === 'ar' ? 'الانتقال لتسجيل الدخول' : 'Continue to Login'}
              </button>
              <button
                type="button"
                onClick={onBackHome}
                className="px-5 py-3 text-xs font-medium text-slate-200 border border-white/15 rounded-md hover:bg-white/5"
              >
                {lang === 'ar' ? 'الرئيسية' : 'Back to Home'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Column */}
            <div className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#071029]/90 p-6 sm:p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
                  {lang === 'ar' ? 'تسجيل مستأجر جديد' : 'NEW TENANT ONBOARDING'}
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {lang === 'ar'
                    ? 'سجّل مركز التدريب الخاص بك'
                    : 'Register Your Training Center'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  {lang === 'ar'
                    ? 'أنشئ مساحة عمل مستقلة لمركزك مع فترة تجريبية فورية وصلاحيات المالك.'
                    : 'Provision your isolated training center workspace with instant tenant owner access.'}
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-lg border border-red-400/40 bg-red-500/10 text-xs text-red-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Company Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300 border-b border-white/10 pb-2">
                    <Building2 className="w-4 h-4" />
                    <span>
                      {lang === 'ar'
                        ? 'بيانات مركز التدريب والشركة'
                        : 'Training Center & Organization Information'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'اسم المركز (بالإنجليزية) *' : 'Training Center Name (EN) *'}
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={form.nameEn}
                        onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))}
                        placeholder="Gulf Safety Training Academy"
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'اسم المركز (بالعربية)' : 'Training Center Name (AR)'}
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={form.nameAr}
                        onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))}
                        placeholder="أكاديمية الخليج للتدريب"
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'الاسم القانوني / المسجل' : 'Legal Registered Name'}
                      </label>
                      <input
                        type="text"
                        value={form.legalName}
                        onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">
                          {lang === 'ar' ? 'رقم السجل التجاري' : 'CR Number'}
                        </label>
                        <input
                          type="text"
                          value={form.crNumber}
                          onChange={(e) => setForm((p) => ({ ...p, crNumber: e.target.value }))}
                          className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">
                          {lang === 'ar' ? 'الرقم الضريبي' : 'VAT / Tax ID'}
                        </label>
                        <input
                          type="text"
                          value={form.vatNumber}
                          onChange={(e) => setForm((p) => ({ ...p, vatNumber: e.target.value }))}
                          className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'الدولة *' : 'Country *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={form.country}
                        onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'المدينة' : 'City'}
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'هاتف المركز' : 'Company Phone'}
                      </label>
                      <input
                        type="text"
                        value={form.companyPhone}
                        onChange={(e) => setForm((p) => ({ ...p, companyPhone: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'الموقع الإلكتروني' : 'Website'}
                      </label>
                      <input
                        type="text"
                        value={form.website}
                        onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                        placeholder="https://"
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Owner Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300 border-b border-white/10 pb-2">
                    <User className="w-4 h-4" />
                    <span>
                      {lang === 'ar' ? 'بيانات مالك المركز' : 'Tenant Owner Account'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'الاسم الكامل للمالك *' : 'Owner Full Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={form.ownerDisplayName}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, ownerDisplayName: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'رقم الجوال *' : 'Owner Mobile *'}
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={form.ownerMobile}
                          onChange={(e) => setForm((p) => ({ ...p, ownerMobile: e.target.value }))}
                          className="w-full ps-8 pe-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'البريد الإلكتروني للعمل *' : 'Owner Login Email *'}
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={form.ownerEmail}
                          onChange={(e) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))}
                          className="w-full ps-8 pe-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'اللغة الافتراضية للمركز' : 'Default Workspace Language'}
                      </label>
                      <select
                        value={form.defaultLanguage}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            defaultLanguage: e.target.value === 'ar' ? 'ar' : 'en',
                          }))
                        }
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      >
                        <option value="en">English (LTR)</option>
                        <option value="ar">العربية (RTL)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'كلمة المرور *' : 'Password *'}
                      </label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={form.password}
                          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                          className="w-full ps-8 pe-9 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {lang === 'ar' ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={form.confirmPassword}
                        onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 min-w-[200px] py-3 px-6 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 rounded-md disabled:opacity-50"
                  >
                    {submitting
                      ? lang === 'ar'
                        ? 'جارٍ إنشاء مركز التدريب...'
                        : 'Creating Workspace...'
                      : lang === 'ar'
                        ? 'إنشاء مساحة عمل مركز التدريب'
                        : 'Create Training Center Workspace'}
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleGoogleProvision()}
                    className="px-4 py-3 text-xs font-semibold text-white border border-white/20 bg-white/[0.04] hover:bg-white/[0.09] rounded-md whitespace-nowrap"
                  >
                    {lang === 'ar' ? 'التسجيل السريع عبر Google' : 'Continue with Google'}
                  </button>
                </div>
              </form>
            </div>

            {/* Plan Selector Summary Column */}
            <div className="lg:col-span-4 rounded-2xl border border-cyan-400/25 bg-[#071029]/95 p-6 space-y-5 lg:sticky lg:top-8">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-white">
                  {lang === 'ar' ? 'الباقة المختارة' : 'Selected Plan'}
                </h2>
                <div className="inline-flex rounded border border-white/15 bg-[#040919] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-2 py-1 rounded ${
                      billingCycle === 'monthly' ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {lang === 'ar' ? 'شهري' : 'Monthly'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`px-2 py-1 rounded ${
                      billingCycle === 'annual' ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {lang === 'ar' ? 'سنوي' : 'Annual'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {plans.map((p) => {
                  const selected = p.code === selectedPlan;
                  const price = billingCycle === 'annual' ? p.priceAnnual : p.priceMonthly;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setSelectedPlan(p.code)}
                      className={`w-full p-3 rounded-lg border text-start transition-colors flex items-center justify-between gap-2 ${
                        selected
                          ? 'border-cyan-400 bg-cyan-500/15'
                          : 'border-white/10 bg-[#050B1D] hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                          {p.recommended && <Sparkles className="w-3 h-3 text-cyan-300" />}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {p.limits.maxCandidates.toLocaleString()}{' '}
                          {lang === 'ar' ? 'متدرب' : 'candidates'} · {p.limits.maxUsers}{' '}
                          {lang === 'ar' ? 'مستخدم' : 'users'}
                        </div>
                      </div>
                      <div className="font-mono-tabular text-xs font-bold text-cyan-300 shrink-0">
                        {formatPlanPrice(price, p.currency, lang)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activePlanObj && (
                <div className="pt-3 border-t border-white/10 space-y-2 text-xs text-slate-300">
                  <div className="font-semibold text-white">
                    {lang === 'ar' ? 'مميزات الباقة:' : 'Included in plan:'}
                  </div>
                  {(lang === 'ar' ? activePlanObj.featuresAr : activePlanObj.featuresEn).map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
