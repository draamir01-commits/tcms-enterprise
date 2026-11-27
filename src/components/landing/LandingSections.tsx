import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  CreditCard,
  FileSpreadsheet,
  Globe,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BillingCycle,
  LanguageCode,
  PlatformPublicConfig,
  SubscriptionPlan,
} from '../../types/tcms';
import { LANDING_COPY } from '../../lib/landingContent';
import { formatPlanPrice } from '../../lib/saasDefaults';

interface LandingSectionsProps {
  lang: LanguageCode;
  config: PlatformPublicConfig;
  plans: SubscriptionPlan[];
  onNavigateRegister: (planCode?: string, billingCycle?: BillingCycle) => void;
  onNavigateLogin: () => void;
  onNavigateVerify: () => void;
  onNavigateSuperAdmin: () => void;
}

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  candidates: Users,
  courses: BookOpen,
  trainers: UserCheck,
  batches: CalendarDays,
  attendance: CheckSquare,
  assessments: FileSpreadsheet,
  cards: CreditCard,
  certificates: Award,
  verification: ShieldCheck,
  corporate: Building2,
  reports: BarChart3,
  notifications: Bell,
};

type LegalDocKey = 'privacy' | 'terms' | 'cookies' | 'dataProtection';

export function LandingSections({
  lang,
  config,
  plans,
  onNavigateRegister,
  onNavigateLogin,
  onNavigateVerify,
  onNavigateSuperAdmin,
}: LandingSectionsProps) {
  const copy = LANDING_COPY[lang];
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [bilingualDemoLang, setBilingualDemoLang] = useState<LanguageCode>(lang);
  const [certBgIndex, setCertBgIndex] = useState(0);

  // Contact modal state
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    subject: '',
    message: '',
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);

  // Legal modal state
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocKey | null>(null);

  const certThemeSwatches = [
    {
      nameEn: 'Royal Midnight',
      nameAr: 'ليلي ملكي',
      className: 'from-[#0B1739] via-[#0F2557] to-[#060D24] border-cyan-400/40',
    },
    {
      nameEn: 'Geometric Emerald',
      nameAr: 'هندسي زمردي',
      className: 'from-[#062425] via-[#0B3B3A] to-[#041417] border-emerald-400/40',
    },
    {
      nameEn: 'Imperial Violet',
      nameAr: 'بنفسجي مؤسسي',
      className: 'from-[#1B103D] via-[#261459] to-[#0A081E] border-violet-400/40',
    },
    {
      nameEn: 'Gulf Sapphire',
      nameAr: 'ياقوتي خليجي',
      className: 'from-[#081F3D] via-[#0D3366] to-[#040E1F] border-sky-400/40',
    },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSubmitting(true);
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactForm,
          preferredLanguage: lang,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setContactSuccess(true);
      setContactForm({ name: '', email: '', phone: '', companyName: '', subject: '', message: '' });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : String(err));
    } finally {
      setContactSubmitting(false);
    }
  };

  const renderShowcasePreview = (id: string) => {
    switch (id) {
      case 'dashboard':
        return (
          <div className="rounded-xl border border-cyan-400/20 bg-[#071029]/90 p-5 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                {lang === 'ar' ? 'المؤشرات التشغيلية اليومية' : 'Daily Operational KPIs'}
              </span>
              <span className="font-mono-tabular text-[11px] text-cyan-300">
                {lang === 'ar' ? 'بيانات نموذجية' : 'Sample View'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: lang === 'ar' ? 'جلسات اليوم' : "Today's Sessions", val: '6' },
                { label: lang === 'ar' ? 'طلبات معلقة' : 'Pending Requests', val: '12' },
                { label: lang === 'ar' ? 'نسبة الحضور' : 'Attendance Avg', val: '96%' },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-lg bg-white/[0.04] border border-white/10">
                  <div className="text-[11px] text-slate-400 truncate">{s.label}</div>
                  <div className="font-display font-bold text-xl text-cyan-300 tabular-nums mt-1">
                    {s.val}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              {[
                { label: lang === 'ar' ? 'اعتماد الشهادات الجاهزة' : 'Eligible Certificates Ready', pct: 84 },
                { label: lang === 'ar' ? 'نسبة اجتياز الاختبارات' : 'Examination Pass Rate', pct: 92 },
              ].map((bar) => (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>{bar.label}</span>
                    <span className="font-mono-tabular text-cyan-300">{bar.pct}%</span>
                  </div>
                  <div className="h-2 rounded bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-cyan-400"
                      style={{ width: `${bar.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'candidates':
        return (
          <div className="rounded-xl border border-cyan-400/20 bg-[#071029]/90 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-xs font-semibold text-white">
                  {lang === 'ar' ? 'عبدالله بن محمد الحربي' : 'Abdullah Mohammed Al-Harbi'}
                </div>
                <div className="font-mono-tabular text-[11px] text-cyan-300 mt-0.5">
                  CND-001482 · {lang === 'ar' ? 'الهوية: ••••••8421' : 'ID: ••••••8421'}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/30 text-[11px] font-medium text-emerald-300">
                {lang === 'ar' ? 'نشط' : 'Active'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-white/[0.03] border border-white/10">
                <div className="text-[10px] text-slate-400">{lang === 'ar' ? 'الشركة' : 'Organization'}</div>
                <div className="text-slate-100 mt-0.5">
                  {lang === 'ar' ? 'المتحدة للطاقة والصناعة' : 'United Energy Industrial'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-white/[0.03] border border-white/10">
                <div className="text-[10px] text-slate-400">{lang === 'ar' ? 'فحص التكرار' : 'HMAC Deduplication'}</div>
                <div className="text-cyan-300 mt-0.5">{lang === 'ar' ? 'سجل فريد موثق' : 'Unique Verified Key'}</div>
              </div>
            </div>
          </div>
        );

      case 'credentials': {
        const theme = certThemeSwatches[certBgIndex] || certThemeSwatches[0];
        return (
          <div className="rounded-xl border border-cyan-400/20 bg-[#071029]/90 p-5 space-y-4">
            <div className={`rounded-lg border p-5 bg-gradient-to-br ${theme.className} transition-all duration-300`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300">
                    {lang === 'ar' ? 'شهادة تدريب معتمدة' : 'Accredited Training Certificate'}
                  </div>
                  <div className="font-display font-bold text-base text-white mt-1">
                    {lang === 'ar' ? 'شهادة إتمام دورة السلامة المهنية' : 'Occupational Safety Completion'}
                  </div>
                </div>
                <Award className="w-6 h-6 text-cyan-300 shrink-0" />
              </div>
              <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-slate-200">
                <span className="font-mono-tabular">CERT-2026-0912</span>
                <span>{lang === 'ar' ? theme.nameAr : theme.nameEn}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">
                {lang === 'ar' ? 'تبديل الخلفية:' : 'Theme Preview:'}
              </span>
              {certThemeSwatches.map((sw, i) => (
                <button
                  key={sw.nameEn}
                  type="button"
                  onClick={() => setCertBgIndex(i)}
                  className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
                    certBgIndex === i
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  {lang === 'ar' ? sw.nameAr : sw.nameEn}
                </button>
              ))}
            </div>
          </div>
        );
      }

      case 'verification':
        return (
          <div className="rounded-xl border border-emerald-400/25 bg-[#071029]/90 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-300">
                    {lang === 'ar' ? 'شهادة سارية المفعول' : 'Status: Valid & Authentic'}
                  </div>
                  <div className="font-mono-tabular text-[11px] text-slate-400">
                    QR Token Verified · Zero-PII Mode
                  </div>
                </div>
              </div>
              <QrCode className="w-9 h-9 text-cyan-300 shrink-0" />
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-300">
                {lang === 'ar' ? 'يمكن لأي جهة خارجية الفحص الفوري.' : 'Instant verification open to employers & inspectors.'}
              </span>
              <button
                type="button"
                onClick={onNavigateVerify}
                className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md whitespace-nowrap shrink-0"
              >
                {copy.showcaseSection.openVerifyCta}
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="rounded-xl border border-cyan-400/20 bg-[#071029]/90 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-semibold text-white">
                  {lang === 'ar' ? 'طلبات تسجيل الشركة العميلة' : 'Corporate Client Enrollment Requests'}
                </span>
              </div>
              <span className="font-mono-tabular text-[11px] text-cyan-300">REQ-2026-07</span>
            </div>
            {[
              {
                name: lang === 'ar' ? '14 موظفاً — السلامة الكهربائية' : '14 Employees — Electrical Safety',
                status: lang === 'ar' ? 'معتمد ومجدول' : 'Approved & Scheduled',
                cls: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
              },
              {
                name: lang === 'ar' ? '8 موظفين — العمل في الأماكن المغلقة' : '8 Employees — Confined Space',
                status: lang === 'ar' ? 'قيد المراجعة' : 'Pending Review',
                cls: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
              },
            ].map((req) => (
              <div
                key={req.name}
                className="p-3 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3"
              >
                <span className="text-xs text-slate-200">{req.name}</span>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${req.cls}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        );
    }
  };

  const getLegalContent = (key: LegalDocKey) => {
    switch (key) {
      case 'privacy':
        return {
          title: copy.footer.links.privacy,
          body: lang === 'ar' ? config.privacyContentAr : config.privacyContentEn,
        };
      case 'terms':
        return {
          title: copy.footer.links.terms,
          body: lang === 'ar' ? config.termsContentAr : config.termsContentEn,
        };
      case 'cookies':
        return {
          title: copy.footer.links.cookies,
          body: lang === 'ar' ? config.cookiesContentAr : config.cookiesContentEn,
        };
      case 'dataProtection':
        return {
          title: copy.footer.links.dataProtection,
          body: lang === 'ar' ? config.dataProtectionContentAr : config.dataProtectionContentEn,
        };
    }
  };

  const brandName = lang === 'ar' ? config.platformNameAr : config.platformNameEn;
  const subtitle = lang === 'ar' ? config.subtitleAr : config.subtitleEn;

  return (
    <div className="bg-[#030714] text-slate-100">
      {/* SECTION 3: TRUST & VALUE PROPOSITION */}
      <section className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#040A1C]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
              {copy.trust.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.trust.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {copy.trust.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {copy.trust.pillars.map((pillar, idx) => (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className="p-6 rounded-xl border border-white/10 bg-white/[0.025] hover:border-cyan-400/35 hover:bg-white/[0.04] transition-all space-y-3"
              >
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center font-mono-tabular text-xs font-bold text-cyan-300">
                  0{idx + 1}
                </div>
                <h3 className="font-display font-semibold text-base text-white">{pillar.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {pillar.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: CORE FEATURES GRID (12 MODULES) */}
      <section id="features" className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#030714]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
              {copy.featuresSection.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.featuresSection.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {copy.featuresSection.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {copy.featuresSection.items.map((item, idx) => {
              const Icon = FEATURE_ICONS[item.id] || Layers;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.35, delay: (idx % 4) * 0.05 }}
                  className="group p-5 rounded-xl border border-white/10 bg-[#070E23]/80 hover:border-cyan-400/40 hover:bg-[#091432] transition-all space-y-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/25 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-semibold text-sm sm:text-base text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 5: PRODUCT SHOWCASE (5 ALTERNATING SECTIONS) */}
      <section className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#04091B]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
              {copy.showcaseSection.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.showcaseSection.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {copy.showcaseSection.subtitle}
            </p>
          </div>

          <div className="space-y-16">
            {copy.showcaseSection.items.map((item, idx) => {
              const reversed = idx % 2 === 1;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.45 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
                >
                  <div className={`lg:col-span-6 space-y-4 ${reversed ? 'lg:order-2' : ''}`}>
                    <p className="font-mono-tabular text-xs font-semibold text-cyan-300">
                      {item.eyebrow}
                    </p>
                    <h3 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white">
                      {item.title}
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>
                    <ul className="space-y-2 pt-1">
                      {item.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`lg:col-span-6 ${reversed ? 'lg:order-1' : ''}`}>
                    {renderShowcasePreview(item.id)}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 6: MULTI-TENANT ARCHITECTURE VISUALIZATION */}
      <section id="solutions" className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#030714]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
              {copy.multiTenant.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.multiTenant.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {copy.multiTenant.subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-400/20 bg-[#060D24]/90 p-6 sm:p-8 space-y-8">
            {/* Top Tier: Platform Super Admin */}
            <div className="max-w-xl mx-auto p-5 rounded-xl border border-violet-400/35 bg-gradient-to-r from-violet-950/60 to-sky-950/60 text-center space-y-1.5">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-white">
                <Shield className="w-4 h-4 text-violet-300" />
                <span>{copy.multiTenant.superAdminLabel}</span>
              </div>
              <p className="text-xs text-slate-300">{copy.multiTenant.superAdminDesc}</p>
            </div>

            {/* Connector lines */}
            <div className="hidden sm:grid grid-cols-3 gap-6 max-w-3xl mx-auto -my-4">
              <div className="h-6 border-e border-cyan-400/30" />
              <div className="h-6 border-e border-cyan-400/30" />
              <div className="h-6" />
            </div>

            {/* Isolated Tenant Nodes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { name: copy.multiTenant.tenantA, code: 'TEN-0001' },
                { name: copy.multiTenant.tenantB, code: 'TEN-0002' },
                { name: copy.multiTenant.tenantC, code: 'TEN-0003' },
              ].map((tenant) => (
                <div
                  key={tenant.code}
                  className="p-5 rounded-xl border border-cyan-400/25 bg-[#08122E] space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono-tabular text-[11px] text-cyan-300">
                        {tenant.code}
                      </div>
                      <h3 className="font-display font-semibold text-sm text-white mt-0.5">
                        {tenant.name}
                      </h3>
                    </div>
                    <span className="text-[10px] font-medium text-cyan-200 border border-cyan-400/25 px-2 py-0.5 rounded">
                      {copy.multiTenant.isolatedBadge}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/10">
                    {copy.multiTenant.rolesLabel.map((role) => (
                      <div
                        key={role}
                        className="px-2 py-1.5 rounded bg-white/[0.03] border border-white/10 text-[11px] text-slate-300 truncate"
                      >
                        {role}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: BILINGUAL CAPABILITIES INTERACTIVE PREVIEW */}
      <section className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#040A1C]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
                {copy.bilingual.eyebrow}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                {copy.bilingual.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {copy.bilingual.subtitle}
              </p>
              <ul className="space-y-2.5 pt-1">
                {copy.bilingual.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                    <Globe className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-xl border border-cyan-400/25 bg-[#071029] p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <span className="text-xs font-semibold text-white">
                    {lang === 'ar' ? 'معاينة التبديل الحي للغة' : 'Live Language & Direction Preview'}
                  </span>
                  <div className="inline-flex rounded-md border border-white/15 bg-[#050A1A] p-0.5">
                    <button
                      type="button"
                      onClick={() => setBilingualDemoLang('en')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                        bilingualDemoLang === 'en'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {copy.bilingual.toggleDemoEn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBilingualDemoLang('ar')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                        bilingualDemoLang === 'ar'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {copy.bilingual.toggleDemoAr}
                    </button>
                  </div>
                </div>

                <div
                  dir={bilingualDemoLang === 'ar' ? 'rtl' : 'ltr'}
                  className="p-4 rounded-lg bg-[#050C20] border border-white/10 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">
                      {bilingualDemoLang === 'ar'
                        ? 'إشعار إصدار شهادة تدريب'
                        : 'Certificate Issuance Notification'}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-cyan-300">
                      {bilingualDemoLang === 'ar' ? 'RTL · عربي' : 'LTR · English'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {bilingualDemoLang === 'ar'
                      ? 'عزيزي المتدرب، تم إصدار شهادتك المعتمدة بنجاح لدورة السلامة المهنية. يمكنك تحميل نسخة PDF أو مشاركة رابط التحقق الفوري.'
                      : 'Dear Trainee, your accredited certificate for Occupational Safety has been issued. Download the verified PDF or share your QR verification link.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: SECURITY & TRUST SECTION */}
      <section className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#030714]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
              {copy.security.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.security.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {copy.security.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {copy.security.items.map((sec) => (
              <div
                key={sec.title}
                className="p-6 rounded-xl border border-white/10 bg-[#070E23]/80 space-y-3"
              >
                <Lock className="w-5 h-5 text-cyan-400" />
                <h3 className="font-display font-semibold text-base text-white">{sec.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {sec.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 9: HOW IT WORKS (5 STEPS) */}
      <section id="how-it-works" className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#04091B]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
                {copy.howItWorks.eyebrow}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                {copy.howItWorks.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {copy.howItWorks.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRegister(undefined, billingCycle)}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 rounded-md whitespace-nowrap shrink-0"
            >
              <span>{copy.howItWorks.cta}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {copy.howItWorks.steps.map((step) => (
              <div
                key={step.number}
                className="p-5 rounded-xl border border-white/10 bg-[#071029]/80 space-y-3"
              >
                <div className="font-mono-tabular text-2xl font-bold text-cyan-400">
                  {step.number}
                </div>
                <h3 className="font-display font-semibold text-sm text-white">{step.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 10: DYNAMIC SUBSCRIPTION PRICING */}
      <section id="pricing" className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#030714]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
                {copy.pricing.eyebrow}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                {copy.pricing.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {copy.pricing.subtitle}
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <div className="inline-flex rounded-lg border border-white/15 bg-[#071029] p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                    billingCycle === 'monthly'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {copy.pricing.monthly}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                    billingCycle === 'annual'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {copy.pricing.annual}
                </button>
              </div>
              <span className="text-[11px] font-medium text-cyan-300">{copy.pricing.annualNote}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {plans.map((plan) => {
              const isHighlighted = plan.code === config.recommendedPlanCode || plan.recommended;
              const displayPrice =
                billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
              const features = lang === 'ar' ? plan.featuresAr : plan.featuresEn;
              return (
                <div
                  key={plan.code}
                  className={`flex flex-col justify-between p-6 rounded-2xl border transition-all ${
                    isHighlighted
                      ? 'border-cyan-400/70 bg-gradient-to-b from-[#0B183B] to-[#060E24] shadow-xl shadow-cyan-950/50'
                      : 'border-white/10 bg-[#070E23]/80 hover:border-white/25'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-lg text-white">
                        {lang === 'ar' ? plan.nameAr : plan.nameEn}
                      </h3>
                      {isHighlighted && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-400/15 border border-cyan-400/40 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                          <Sparkles className="w-3 h-3" />
                          <span>{copy.pricing.recommended}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 min-h-[34px]">
                      {lang === 'ar' ? plan.taglineAr : plan.taglineEn}
                    </p>

                    <div className="pt-2 border-t border-white/10">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display font-bold text-3xl text-white tabular-nums">
                          {formatPlanPrice(displayPrice, plan.currency, lang)}
                        </span>
                        <span className="text-xs text-slate-400">{copy.pricing.perMonth}</span>
                      </div>
                      {billingCycle === 'annual' && (
                        <div className="text-[11px] text-cyan-300/80 mt-0.5">
                          {copy.pricing.billedAnnually}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[#050B1D] border border-white/10 text-[11px]">
                      <div>
                        <span className="text-slate-400">{copy.pricing.limitsLabels.candidates}:</span>{' '}
                        <span className="font-mono-tabular font-semibold text-white">
                          {plan.limits.maxCandidates.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">{copy.pricing.limitsLabels.users}:</span>{' '}
                        <span className="font-mono-tabular font-semibold text-white">
                          {plan.limits.maxUsers.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">{copy.pricing.limitsLabels.batches}:</span>{' '}
                        <span className="font-mono-tabular font-semibold text-white">
                          {plan.limits.maxBatches.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">{copy.pricing.limitsLabels.certificates}:</span>{' '}
                        <span className="font-mono-tabular font-semibold text-white">
                          {plan.limits.maxCertificates.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <ul className="space-y-2 pt-1">
                      {features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-xs text-slate-200">
                          <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateRegister(plan.code, billingCycle)}
                    className={`mt-6 w-full py-3 px-4 rounded-md text-xs font-bold transition-all ${
                      isHighlighted
                        ? 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 hover:from-cyan-300 hover:to-sky-300 shadow-lg shadow-cyan-500/20'
                        : 'border border-white/20 bg-white/[0.04] text-white hover:bg-white/[0.1] hover:border-cyan-400/50'
                    }`}
                  >
                    {copy.pricing.choosePlan}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 11: FAQ ACCORDION (12 QUESTIONS) */}
      <section id="faq" className="py-20 sm:py-24 border-t border-white/[0.07] bg-[#040A1C]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
              {copy.faq.eyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {copy.faq.title}
            </h2>
            <p className="text-sm sm:text-base text-slate-300">{copy.faq.subtitle}</p>
          </div>

          <div className="space-y-2.5">
            {copy.faq.items.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-xl border border-white/10 bg-[#071029]/85 overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-start hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="font-display font-semibold text-xs sm:text-sm text-white">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-cyan-300 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/10">
                          {item.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 12: FINAL CALL TO ACTION */}
      <section className="py-20 sm:py-24 border-t border-white/[0.07] bg-gradient-to-b from-[#06122E] to-[#030714]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            {copy.finalCta.title}
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {copy.finalCta.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigateRegister(undefined, billingCycle)}
              className="inline-flex items-center gap-2 px-7 py-3.5 min-h-[48px] text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 hover:from-cyan-300 hover:to-blue-300 rounded-md shadow-lg shadow-cyan-500/25 whitespace-nowrap"
            >
              <span>{copy.finalCta.primary}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={onNavigateLogin}
              className="inline-flex items-center gap-2 px-6 py-3.5 min-h-[48px] text-xs sm:text-sm font-semibold text-white border border-white/20 bg-white/[0.04] hover:bg-white/[0.09] rounded-md whitespace-nowrap"
            >
              <span>{copy.finalCta.secondary}</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 13: FOOTER */}
      <footer className="border-t border-white/10 bg-[#02050F] py-14">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 space-y-3">
              <div className="font-display font-bold text-lg text-white">{brandName}</div>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">{subtitle}</p>
              {(config.contactEmail || config.contactPhone || (lang === 'ar' ? config.addressAr : config.addressEn)) && (
                <div className="space-y-1.5 pt-2 text-xs text-slate-300">
                  {config.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{config.contactEmail}</span>
                    </div>
                  )}
                  {config.contactPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span dir="ltr">{config.contactPhone}</span>
                    </div>
                  )}
                  {(lang === 'ar' ? config.addressAr : config.addressEn) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{lang === 'ar' ? config.addressAr : config.addressEn}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                {copy.footer.productTitle}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>
                  <button type="button" onClick={() => scrollToSection('features')} className="hover:text-cyan-300">
                    {copy.nav.features}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('solutions')} className="hover:text-cyan-300">
                    {copy.nav.solutions}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => scrollToSection('pricing')} className="hover:text-cyan-300">
                    {copy.nav.pricing}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={onNavigateVerify} className="hover:text-cyan-300">
                    {copy.footer.links.verify}
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                {copy.footer.accountTitle}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigateRegister(undefined, billingCycle)}
                    className="hover:text-cyan-300"
                  >
                    {copy.footer.links.register}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={onNavigateLogin} className="hover:text-cyan-300">
                    {copy.footer.links.login}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={onNavigateSuperAdmin} className="hover:text-violet-300">
                    {copy.footer.links.superAdmin}
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                {copy.footer.legalTitle} &amp; {copy.footer.supportTitle}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>
                  <button type="button" onClick={() => setActiveLegalDoc('privacy')} className="hover:text-cyan-300">
                    {copy.footer.links.privacy}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveLegalDoc('terms')} className="hover:text-cyan-300">
                    {copy.footer.links.terms}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveLegalDoc('cookies')} className="hover:text-cyan-300">
                    {copy.footer.links.cookies}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setActiveLegalDoc('dataProtection')} className="hover:text-cyan-300">
                    {copy.footer.links.dataProtection}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setContactSuccess(false);
                      setContactError(null);
                      setContactOpen(true);
                    }}
                    className="hover:text-cyan-300 font-medium text-cyan-400"
                  >
                    {copy.footer.links.contactUs}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <span>
              © {new Date().getFullYear()} {brandName} ·{' '}
              {lang === 'ar' ? config.copyrightAr : config.copyrightEn}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {config.socialLinks?.linkedin && (
                <a
                  href={config.socialLinks.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-300"
                >
                  LinkedIn
                </a>
              )}
              {config.socialLinks?.x && (
                <a
                  href={config.socialLinks.x}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-300"
                >
                  X
                </a>
              )}
              {config.socialLinks?.youtube && (
                <a
                  href={config.socialLinks.youtube}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-cyan-300"
                >
                  YouTube
                </a>
              )}
              <button
                type="button"
                onClick={() => scrollToSection('faq')}
                className="hover:text-cyan-300"
              >
                {copy.footer.links.helpCenter}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* CONTACT MODAL */}
      <AnimatePresence>
        {contactOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-[#071029] p-6 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-white">
                    {copy.contactModal.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">{copy.contactModal.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {contactSuccess ? (
                <div className="p-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 space-y-2 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="font-semibold text-sm text-white">
                    {copy.contactModal.successTitle}
                  </div>
                  <p className="text-xs text-slate-300">{copy.contactModal.successBody}</p>
                  <button
                    type="button"
                    onClick={() => setContactOpen(false)}
                    className="mt-2 px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded-md"
                  >
                    {copy.contactModal.close}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitContact} className="space-y-3">
                  {contactError && (
                    <div className="p-3 rounded-md border border-red-400/40 bg-red-500/10 text-xs text-red-200">
                      {contactError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {copy.contactModal.name} *
                      </label>
                      <input
                        type="text"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {copy.contactModal.email} *
                      </label>
                      <input
                        type="email"
                        required
                        value={contactForm.email}
                        onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {copy.contactModal.phone}
                      </label>
                      <input
                        type="text"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        {copy.contactModal.company}
                      </label>
                      <input
                        type="text"
                        value={contactForm.companyName}
                        onChange={(e) =>
                          setContactForm((p) => ({ ...p, companyName: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      {copy.contactModal.subject}
                    </label>
                    <input
                      type="text"
                      value={contactForm.subject}
                      onChange={(e) => setContactForm((p) => ({ ...p, subject: e.target.value }))}
                      className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      {copy.contactModal.message} *
                    </label>
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      value={contactForm.message}
                      onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
                      className="w-full px-3 py-2 text-xs text-white bg-[#040919] border border-white/15 rounded-md focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setContactOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-300 border border-white/15 rounded-md hover:bg-white/5"
                    >
                      {copy.contactModal.close}
                    </button>
                    <button
                      type="submit"
                      disabled={contactSubmitting}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {contactSubmitting
                          ? copy.contactModal.sending
                          : copy.contactModal.submit}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEGAL DOCUMENT MODAL */}
      <AnimatePresence>
        {activeLegalDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#071029] p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-bold text-lg text-white">
                  {getLegalContent(activeLegalDoc).title}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveLegalDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {getLegalContent(activeLegalDoc).body}
              </p>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveLegalDoc(null)}
                  className="px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded-md"
                >
                  {copy.contactModal.close}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
