import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { apiFetch } from '../lib/api';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import { DEFAULT_PLATFORM_CONFIG, formatPlanPrice } from '../lib/saasDefaults';
import type {
  PendingTenantRegistration,
  PlatformLead,
  PlatformPublicConfig,
  SaasTenant,
  SubscriptionPlan,
  TenantStatus,
} from '../types/tcms';

type AdminTab = 'tenants' | 'plans' | 'branding' | 'leads';

interface SuperAdminPortalPageProps {
  onBackHome: () => void;
  onEnterTenantWorkspace: () => void;
}

export function SuperAdminPortalPage({
  onBackHome,
  onEnterTenantWorkspace,
}: SuperAdminPortalPageProps) {
  const {
    profile,
    loginWithEmail,
    loginWithGoogle,
    logout,
    authError,
    clearAuthMessages,
  } = useAuth();
  const { lang, setLang } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [submittingLogin, setSubmittingLogin] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('tenants');
  const [loadingData, setLoadingData] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tenants, setTenants] = useState<SaasTenant[]>([]);
  const [pendingRegs, setPendingRegs] = useState<PendingTenantRegistration[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [leads, setLeads] = useState<PlatformLead[]>([]);
  const [branding, setBranding] = useState<PlatformPublicConfig>(DEFAULT_PLATFORM_CONFIG);

  const [newTenantModal, setNewTenantModal] = useState(false);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantModalError, setTenantModalError] = useState<string | null>(null);
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [newTenant, setNewTenant] = useState({
    nameEn: '',
    nameAr: '',
    ownerEmail: '',
    ownerDisplayName: '',
    ownerPassword: '',
    planCode: 'professional',
    status: 'active' as TenantStatus,
  });

  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

  const isPlatformSuperAdmin = profile?.platformRole === 'platform_super_admin';

  const loadAllPlatformData = useCallback(async () => {
    if (!isPlatformSuperAdmin) return;
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const [tRes, pRes, bRes, lRes, pendRes] = await Promise.all([
        apiFetch<{ tenants: SaasTenant[] }>('/api/platform/tenants'),
        apiFetch<{ plans: SubscriptionPlan[] }>('/api/platform/plans'),
        apiFetch<{ config: PlatformPublicConfig }>('/api/platform/branding'),
        apiFetch<{ leads: PlatformLead[] }>('/api/platform/leads'),
        apiFetch<{ pending: PendingTenantRegistration[] }>('/api/platform/pending-registrations'),
      ]);
      setTenants(tRes.tenants || []);
      setPlans(pRes.plans || []);
      if (bRes.config) setBranding(bRes.config);
      setLeads(lRes.leads || []);
      setPendingRegs(pendRes.pending || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingData(false);
    }
  }, [isPlatformSuperAdmin]);

  useEffect(() => {
    void loadAllPlatformData();
  }, [loadAllPlatformData]);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(null);
    clearAuthMessages();
    setSubmittingLogin(true);
    try {
      await loginWithEmail(email, password, true);
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setTenantModalError(null);

    if (newTenant.ownerPassword.trim()) {
      const pwCheck = validatePasswordStrength(newTenant.ownerPassword);
      if (!pwCheck.valid) {
        setTenantModalError(
          lang === 'ar'
            ? 'كلمة مرور المالك يجب أن تكون 8 أحرف على الأقل وتشمل حرفاً كبيراً وصغيراً ورقماً ورمزاً خاصاً.'
            : 'Owner password must be at least 8 characters and include uppercase, lowercase, a digit, and a special character.'
        );
        return;
      }
    }

    setCreatingTenant(true);
    try {
      const created = await apiFetch<{
        ownerAuthCreated?: boolean;
        verificationEmailSent?: boolean;
      }>('/api/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(newTenant),
      });
      setNewTenantModal(false);
      setShowOwnerPassword(false);
      setNewTenant({
        nameEn: '',
        nameAr: '',
        ownerEmail: '',
        ownerDisplayName: '',
        ownerPassword: '',
        planCode: 'professional',
        status: 'active',
      });
      setBanner(
        created.ownerAuthCreated
          ? lang === 'ar'
            ? `تم إنشاء مساحة العمل وحساب المالك.${created.verificationEmailSent ? ' تم إرسال رسالة تأكيد البريد الإلكتروني.' : ''}`
            : `Tenant workspace & owner Email/Password account created.${created.verificationEmailSent ? ' Verification email dispatched.' : ''}`
          : lang === 'ar'
            ? 'تم إنشاء مساحة عمل المركز وإرسال دعوة المالك للدخول عبر Google.'
            : 'Tenant workspace created and owner invite prepared (owner can sign in with Google).'
      );
      await loadAllPlatformData();
    } catch (err) {
      setTenantModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleTenantUpdate = async (tenantId: string, updates: Record<string, unknown>) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setBanner(lang === 'ar' ? 'تم تحديث حالة المستأجر.' : 'Tenant updated.');
      await loadAllPlatformData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSeedDefaultPlans = async () => {
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ plans: SubscriptionPlan[] }>('/api/platform/plans/seed-defaults', {
        method: 'POST',
      });
      setPlans(res.plans || []);
      setBanner(lang === 'ar' ? 'تم حفظ الباقات الافتراضية الأربع في قاعدة البيانات.' : 'Default 4 subscription plans saved to Firestore.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setErrorMsg(null);
    try {
      if (editingPlan.id) {
        await apiFetch(`/api/platform/plans/${encodeURIComponent(editingPlan.id)}`, {
          method: 'PUT',
          body: JSON.stringify(editingPlan),
        });
      } else {
        await apiFetch('/api/platform/plans', {
          method: 'POST',
          body: JSON.stringify(editingPlan),
        });
      }
      setEditingPlan(null);
      setBanner(lang === 'ar' ? 'تم حفظ باقة الاشتراك.' : 'Subscription plan saved.');
      await loadAllPlatformData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ config: PlatformPublicConfig }>('/api/platform/branding', {
        method: 'PUT',
        body: JSON.stringify(branding),
      });
      if (res.config) setBranding(res.config);
      setBanner(
        lang === 'ar'
          ? 'تم تحديث إعدادات المنصة العامة وستنعكس فوراً على الصفحة الرئيسية.'
          : 'Public platform branding saved and reflected live on the landing page.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 90 * 1024) {
      setErrorMsg(lang === 'ar' ? 'الحد الأقصى لحجم الشعار 90 كيلوبايت.' : 'Platform logo file must be under 90 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBranding((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateLeadStatus = async (leadId: string, status: PlatformLead['status']) => {
    try {
      await apiFetch(`/api/platform/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAllPlatformData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // Unauthenticated dedicated Platform Super Admin Login
  if (!profile) {
    const activeErr = loginErr || authError;
    return (
      <div className="min-h-screen bg-[#030714] text-slate-100 flex flex-col">
        <header className="h-16 border-b border-white/10 px-4 sm:px-8 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-cyan-300"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{lang === 'ar' ? 'العودة للموقع العام' : 'Return to Public Website'}</span>
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/15 rounded-md text-slate-200 hover:bg-white/5"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-violet-400/30 bg-[#071029] p-7 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-400/35 flex items-center justify-center">
                <Shield className="w-5 h-5 text-violet-300" />
              </div>
              <div>
                <h1 className="font-display font-bold text-lg text-white">
                  {lang === 'ar' ? 'بوابة الإدارة العليا للمنصة' : 'Platform Super Admin Portal'}
                </h1>
                <p className="text-[11px] text-slate-400">
                  {lang === 'ar'
                    ? 'دخول مقصور على مالك منصة SaaS فقط'
                    : 'Restricted to authorized SaaS Platform Super Admins'}
                </p>
              </div>
            </div>

            {activeErr && (
              <div className="p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-xs text-red-200">
                {activeErr}
              </div>
            )}

            <form onSubmit={handleAdminSignIn} className="space-y-3.5">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  {lang === 'ar' ? 'البريد الإلكتروني' : 'Super Admin Email'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full ps-9 pe-3 py-2.5 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  {lang === 'ar' ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full ps-9 pe-3 py-2.5 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submittingLogin}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 rounded-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{lang === 'ar' ? 'دخول الإدارة العليا' : 'Sign In as Platform Super Admin'}</span>
              </button>
            </form>

            <button
              type="button"
              disabled={submittingLogin}
              onClick={() => void loginWithGoogle()}
              className="w-full py-2.5 px-4 text-xs font-medium text-slate-200 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] rounded-md"
            >
              {lang === 'ar' ? 'تسجيل الدخول عبر Google' : 'Sign in with Google'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Logged-in ordinary tenant user attempting to access Super Admin route -> Strict 403 block
  if (!isPlatformSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#030714] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-red-400/35 bg-[#071029] p-7 text-center space-y-4">
          <ShieldAlert className="w-11 h-11 text-red-400 mx-auto" />
          <h1 className="font-display font-bold text-xl text-white">
            {lang === 'ar' ? 'تم رفض الوصول (403)' : '403 — Platform Access Denied'}
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            {lang === 'ar'
              ? `الحساب (${profile.email}) مخصص لمركز التدريب ولا يملك صلاحية الإدارة العليا للمنصة (platform_super_admin).`
              : `Account (${profile.email}) does not hold platform_super_admin authorization. Tenant users cannot access the SaaS Platform Console.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onEnterTenantWorkspace}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-md"
            >
              {lang === 'ar' ? 'الدخول للوحة مركزي' : 'Open My Tenant Workspace'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 text-xs font-medium text-red-200 border border-red-400/30 rounded-md hover:bg-red-500/10"
            >
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; labelEn: string; labelAr: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'tenants', labelEn: 'Tenants & Onboarding', labelAr: 'المراكز والتسجيل', icon: Building2 },
    { id: 'plans', labelEn: 'Subscription Plans', labelAr: 'باقات الاشتراك', icon: Layers },
    { id: 'branding', labelEn: 'Website & Branding', labelAr: 'الهوية والموقع العام', icon: Palette },
    { id: 'leads', labelEn: 'Contact Leads', labelAr: 'رسائل التواصل', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-[#030714] text-slate-100 flex flex-col">
      <header className="h-16 border-b border-white/10 bg-[#050A1B]/95 px-4 sm:px-8 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-400/40 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-violet-300" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-white truncate">
              {lang === 'ar' ? 'وحدة تحكم الإدارة العليا للمنصة' : 'SaaS Platform Super Admin Console'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">{profile.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackHome}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/15 rounded-md text-slate-200 hover:bg-white/5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'عرض الموقع العام' : 'Public Site'}</span>
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="px-2.5 py-1.5 text-xs border border-white/15 rounded-md text-slate-200 hover:bg-white/5"
          >
            {lang === 'en' ? 'AR' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="p-2 text-slate-300 hover:text-red-300 border border-white/15 rounded-md"
            title={lang === 'ar' ? 'خروج' : 'Sign Out'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Tabs Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap border-b border-white/10 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-violet-500/20 text-violet-200 border border-violet-400/40'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? tab.labelAr : tab.labelEn}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void loadAllPlatformData()}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/15 rounded-md text-slate-200 hover:bg-white/5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
            <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>

        {banner && (
          <div className="p-3.5 rounded-lg border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{banner}</span>
            </div>
            <button type="button" onClick={() => setBanner(null)} className="text-emerald-200 hover:text-white">
              ×
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-lg border border-red-400/35 bg-red-500/10 text-xs text-red-200 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-red-200 hover:text-white">
              ×
            </button>
          </div>
        )}

        {/* TAB 1: TENANTS */}
        {activeTab === 'tenants' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg text-white">
                  {lang === 'ar' ? 'مراكز التدريب المشتركة' : 'Registered SaaS Tenants'}
                </h2>
                <p className="text-xs text-slate-400">
                  {tenants.length} {lang === 'ar' ? 'مركز مسجل' : 'workspaces'} · {pendingRegs.length}{' '}
                  {lang === 'ar' ? 'بانتظار تفعيل البريد' : 'pending email verification'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewTenantModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md"
              >
                <Plus className="w-4 h-4" />
                <span>{lang === 'ar' ? 'إضافة مركز تدريب' : 'Provision Tenant'}</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#071029]">
              <table className="w-full text-xs text-start">
                <thead className="border-b border-white/10 bg-[#050B1D] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">Code</th>
                    <th className="px-4 py-3 text-start font-medium">Training Center</th>
                    <th className="px-4 py-3 text-start font-medium">Owner / Contact</th>
                    <th className="px-4 py-3 text-start font-medium">Plan</th>
                    <th className="px-4 py-3 text-start font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {tenants.map((t) => (
                    <tr key={t.tenantId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono-tabular text-cyan-300">{t.tenantCode}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{t.nameEn}</div>
                        <div className="text-[11px] text-slate-400">{t.nameAr}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{t.contactEmail || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={t.planCode}
                          onChange={(e) =>
                            void handleTenantUpdate(t.tenantId, { planCode: e.target.value })
                          }
                          className="px-2 py-1 text-xs bg-[#040919] border border-white/15 rounded text-white"
                        >
                          {['starter', 'professional', 'business', 'enterprise'].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={t.status}
                          onChange={(e) =>
                            void handleTenantUpdate(t.tenantId, { status: e.target.value })
                          }
                          className="px-2 py-1 text-xs bg-[#040919] border border-white/15 rounded text-white"
                        >
                          {['trial', 'active', 'grace_period', 'suspended', 'cancelled'].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pendingRegs.length > 0 && (
              <div className="rounded-xl border border-amber-400/25 bg-[#071029] p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  {lang === 'ar'
                    ? 'تسجيلات بانتظار تأكيد البريد الإلكتروني'
                    : 'Pending Registrations Awaiting Email Verification'}
                </h3>
                <div className="space-y-2">
                  {pendingRegs.map((reg) => (
                    <div
                      key={reg.ownerUid}
                      className="p-3 rounded-lg bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{reg.nameEn}</span> ·{' '}
                        <span className="text-slate-300">{reg.ownerEmail}</span>
                      </div>
                      <span className="font-mono-tabular text-cyan-300">
                        {reg.planCode} ({reg.billingCycle})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SUBSCRIPTION PLANS */}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg text-white">
                  {lang === 'ar' ? 'إدارة باقات الاشتراك والأسعار' : 'Subscription Plans & Pricing'}
                </h2>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'الباقات المحفوظة هنا تظهر ديناميكياً في قسم الأسعار على الموقع العام.'
                    : 'Plans saved here dynamically power the pricing grid on the public landing page.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSeedDefaultPlans()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-cyan-400/35 text-cyan-200 rounded-md hover:bg-cyan-500/10"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'تثبيت الباقات الافتراضية' : 'Seed Default 4 Plans'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="p-5 rounded-xl border border-white/15 bg-[#071029] flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular text-[11px] text-cyan-300">{p.code}</span>
                      {p.recommended && (
                        <span className="text-[10px] font-bold text-cyan-300 border border-cyan-400/35 px-2 py-0.5 rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-base text-white">{p.nameEn}</h3>
                    <div className="text-xs text-slate-400">{p.nameAr}</div>
                    <div className="font-mono-tabular text-sm font-bold text-white pt-1">
                      {formatPlanPrice(p.priceMonthly, p.currency, lang)}/mo ·{' '}
                      {formatPlanPrice(p.priceAnnual, p.currency, lang)}/mo annual
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPlan(p)}
                    className="w-full py-2 text-xs font-semibold text-white border border-white/15 rounded-md hover:bg-white/5"
                  >
                    {lang === 'ar' ? 'تعديل الباقة' : 'Edit Plan'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PUBLIC WEBSITE BRANDING & CONTACT */}
        {activeTab === 'branding' && (
          <form
            onSubmit={handleSaveBranding}
            className="rounded-xl border border-white/10 bg-[#071029] p-6 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display font-bold text-lg text-white">
                  {lang === 'ar' ? 'تخصيص الموقع العام والهوية' : 'Public Website Branding & Footer Configuration'}
                </h2>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'تعديل اسم المنصة، الشعار، النصوص الترحيبية، وبيانات التواصل الرسمية.'
                    : 'Configure platform identity, hero messaging, recommended plan, legal text, social links, and contact details.'}
                </p>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md"
              >
                <Save className="w-4 h-4" />
                <span>{lang === 'ar' ? 'حفظ الإعدادات' : 'Save Public Config'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Platform Name (EN)</label>
                <input
                  type="text"
                  value={branding.platformNameEn}
                  onChange={(e) => setBranding((b) => ({ ...b, platformNameEn: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Platform Name (AR)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={branding.platformNameAr}
                  onChange={(e) => setBranding((b) => ({ ...b, platformNameAr: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Subtitle (EN)</label>
                <input
                  type="text"
                  value={branding.subtitleEn}
                  onChange={(e) => setBranding((b) => ({ ...b, subtitleEn: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Subtitle (AR)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={branding.subtitleAr}
                  onChange={(e) => setBranding((b) => ({ ...b, subtitleAr: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Hero Headline (EN)</label>
                <input
                  type="text"
                  value={branding.heroHeadlineEn}
                  onChange={(e) => setBranding((b) => ({ ...b, heroHeadlineEn: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Hero Headline (AR)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={branding.heroHeadlineAr}
                  onChange={(e) => setBranding((b) => ({ ...b, heroHeadlineAr: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Recommended Plan Code</label>
                <select
                  value={branding.recommendedPlanCode}
                  onChange={(e) =>
                    setBranding((b) => ({ ...b, recommendedPlanCode: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                >
                  {['starter', 'professional', 'business', 'enterprise'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Platform Logo (Optional SVG/PNG under 90KB)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="w-full text-xs text-slate-300 file:me-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-cyan-500/20 file:text-cyan-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={branding.contactEmail}
                  onChange={(e) => setBranding((b) => ({ ...b, contactEmail: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={branding.contactPhone}
                  onChange={(e) => setBranding((b) => ({ ...b, contactPhone: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Office Address (EN)</label>
                <input
                  type="text"
                  value={branding.addressEn}
                  onChange={(e) => setBranding((b) => ({ ...b, addressEn: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Office Address (AR)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={branding.addressAr}
                  onChange={(e) => setBranding((b) => ({ ...b, addressAr: e.target.value }))}
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={branding.socialLinks?.linkedin || ''}
                  onChange={(e) =>
                    setBranding((b) => ({
                      ...b,
                      socialLinks: { ...b.socialLinks, linkedin: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">X / Twitter URL</label>
                <input
                  type="url"
                  value={branding.socialLinks?.x || ''}
                  onChange={(e) =>
                    setBranding((b) => ({
                      ...b,
                      socialLinks: { ...b.socialLinks, x: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md"
                />
              </div>
            </div>
          </form>
        )}

        {/* TAB 4: CONTACT LEADS */}
        {activeTab === 'leads' && (
          <div className="space-y-4">
            <h2 className="font-display font-bold text-lg text-white">
              {lang === 'ar' ? 'طلبات التواصل والاستفسارات' : 'Public Contact Inquiries'}
            </h2>
            <div className="space-y-3">
              {leads.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-white/10 bg-[#071029] text-xs text-slate-400">
                  {lang === 'ar' ? 'لا توجد رسائل تواصل حتى الآن.' : 'No contact inquiries submitted yet.'}
                </div>
              ) : (
                leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-5 rounded-xl border border-white/10 bg-[#071029] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-sm text-white">{lead.name}</span> ·{' '}
                        <span className="text-xs text-cyan-300">{lead.email}</span>
                        {lead.companyName && (
                          <span className="text-xs text-slate-400"> · {lead.companyName}</span>
                        )}
                      </div>
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          void handleUpdateLeadStatus(
                            lead.id,
                            e.target.value as PlatformLead['status']
                          )
                        }
                        className="px-2.5 py-1 text-xs bg-[#040919] border border-white/15 rounded text-white"
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div className="text-xs font-semibold text-slate-200">{lead.subject}</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{lead.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Tenant Modal */}
      {newTenantModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTenant}
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#071029] p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-base text-white">
              {lang === 'ar' ? 'إنشاء مستأجر جديد' : 'Provision New Tenant'}
            </h3>
            {tenantModalError && (
              <div className="p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-xs text-red-200">
                {tenantModalError}
              </div>
            )}
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder={lang === 'ar' ? 'اسم المركز (بالإنجليزية) *' : 'Center Name (EN) *'}
                value={newTenant.nameEn}
                onChange={(e) => setNewTenant((p) => ({ ...p, nameEn: e.target.value }))}
                className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
              />
              <input
                type="text"
                dir="rtl"
                placeholder={lang === 'ar' ? 'اسم المركز (بالعربية)' : 'Center Name (AR)'}
                value={newTenant.nameAr}
                onChange={(e) => setNewTenant((p) => ({ ...p, nameAr: e.target.value }))}
                className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
              />
              <input
                type="email"
                required
                placeholder={lang === 'ar' ? 'بريد المالك *' : 'Owner Email *'}
                value={newTenant.ownerEmail}
                onChange={(e) => setNewTenant((p) => ({ ...p, ownerEmail: e.target.value }))}
                className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
              />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'الاسم الظاهر للمالك' : 'Owner Display Name'}
                value={newTenant.ownerDisplayName}
                onChange={(e) => setNewTenant((p) => ({ ...p, ownerDisplayName: e.target.value }))}
                className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
              />
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type={showOwnerPassword ? 'text' : 'password'}
                    placeholder={
                      lang === 'ar'
                        ? 'كلمة مرور أولية (اختياري للدخول بالبريد)'
                        : 'Owner Initial Password (optional for Email login)'
                    }
                    value={newTenant.ownerPassword}
                    onChange={(e) => setNewTenant((p) => ({ ...p, ownerPassword: e.target.value }))}
                    className="w-full ps-3 pe-9 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword((v) => !v)}
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {lang === 'ar'
                    ? 'حدد كلمة مرور (8+ أحرف مع كبير وصغير ورقم ورمز) لتفعيل الدخول بالبريد وكلمة المرور، أو اتركه فارغاً للدخول عبر Google.'
                    : 'Set a strong password (8+ chars, upper, lower, digit, symbol) for Email/Password login, or leave blank for Google Sign-In.'}
                </p>
              </div>
              <select
                value={newTenant.planCode}
                onChange={(e) => setNewTenant((p) => ({ ...p, planCode: e.target.value }))}
                className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded"
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={creatingTenant}
                onClick={() => {
                  setNewTenantModal(false);
                  setTenantModalError(null);
                }}
                className="px-4 py-2 text-xs text-slate-300 border border-white/15 rounded"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={creatingTenant}
                className="px-4 py-2 text-xs font-bold bg-cyan-400 text-slate-950 rounded disabled:opacity-50"
              >
                {creatingTenant
                  ? lang === 'ar'
                    ? 'جارٍ الإنشاء...'
                    : 'Creating...'
                  : lang === 'ar'
                    ? 'إنشاء'
                    : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Subscription Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePlan}
            className="w-full max-w-lg rounded-xl border border-white/15 bg-[#071029] p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-display font-bold text-base text-white">
              Edit Plan: {editingPlan.nameEn}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Name (EN)</label>
                <input
                  type="text"
                  required
                  value={editingPlan.nameEn}
                  onChange={(e) => setEditingPlan((p) => (p ? { ...p, nameEn: e.target.value } : p))}
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Name (AR)</label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={editingPlan.nameAr}
                  onChange={(e) => setEditingPlan((p) => (p ? { ...p, nameAr: e.target.value } : p))}
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Monthly Price</label>
                <input
                  type="number"
                  min={0}
                  value={editingPlan.priceMonthly}
                  onChange={(e) =>
                    setEditingPlan((p) => (p ? { ...p, priceMonthly: Number(e.target.value) } : p))
                  }
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Annual Monthly Price</label>
                <input
                  type="number"
                  min={0}
                  value={editingPlan.priceAnnual}
                  onChange={(e) =>
                    setEditingPlan((p) => (p ? { ...p, priceAnnual: Number(e.target.value) } : p))
                  }
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">Currency (e.g. SAR)</label>
                <input
                  type="text"
                  maxLength={8}
                  value={editingPlan.currency}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, currency: e.target.value.toUpperCase() } : p
                    )
                  }
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Max Candidates</label>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.limits.maxCandidates}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p
                        ? { ...p, limits: { ...p.limits, maxCandidates: Number(e.target.value) } }
                        : p
                    )
                  }
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Max Users</label>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.limits.maxUsers}
                  onChange={(e) =>
                    setEditingPlan((p) =>
                      p ? { ...p, limits: { ...p.limits, maxUsers: Number(e.target.value) } } : p
                    )
                  }
                  className="w-full px-3 py-2 text-white bg-[#040919] border border-white/15 rounded"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={editingPlan.recommended}
                onChange={(e) =>
                  setEditingPlan((p) => (p ? { ...p, recommended: e.target.checked } : p))
                }
              />
              <span>Highlight as Recommended</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 text-xs text-slate-300 border border-white/15 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-cyan-400 text-slate-950 rounded"
              >
                Save Plan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
