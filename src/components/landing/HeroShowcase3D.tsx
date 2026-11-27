import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Compass,
  CreditCard,
  LayoutDashboard,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { LanguageCode, PlatformPublicConfig } from '../../types/tcms';
import { LANDING_COPY } from '../../lib/landingContent';

interface HeroShowcase3DProps {
  lang: LanguageCode;
  config: PlatformPublicConfig;
  onNavigateRegister: () => void;
  onNavigateLogin: () => void;
  onExploreFeatures: () => void;
}

type PreviewTab = 'dashboard' | 'batches' | 'certificates' | 'verify';

export function HeroShowcase3D({
  lang,
  config,
  onNavigateRegister,
  onNavigateLogin,
  onExploreFeatures,
}: HeroShowcase3DProps) {
  const copy = LANDING_COPY[lang].hero;
  const [activeTab, setActiveTab] = useState<PreviewTab>('dashboard');

  const headline = lang === 'ar' ? config.heroHeadlineAr : config.heroHeadlineEn;
  const subheadline = lang === 'ar' ? config.heroSubheadlineAr : config.heroSubheadlineEn;

  const tabs: Array<{ id: PreviewTab; labelEn: string; labelAr: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', labelEn: 'Dashboard', labelAr: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'batches', labelEn: 'Batches', labelAr: 'الدفعات', icon: Users },
    { id: 'certificates', labelEn: 'Credentials', labelAr: 'الشهادات', icon: Award },
    { id: 'verify', labelEn: 'Verify QR', labelAr: 'التحقق', icon: QrCode },
  ];

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-24 pb-16 sm:pt-28 sm:pb-24 overflow-hidden bg-[#030714]"
    >
      {/* Ambient Radial Lighting + Architectural Grid (compositor-friendly) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 22% 18%, rgba(14, 165, 233, 0.22), transparent 65%),
            radial-gradient(ellipse 60% 50% at 82% 28%, rgba(124, 58, 237, 0.18), transparent 65%),
            radial-gradient(ellipse 55% 45% at 55% 88%, rgba(6, 182, 212, 0.12), transparent 70%),
            linear-gradient(to right, rgba(148, 163, 184, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 100% 100%, 56px 56px, 56px 56px',
        }}
      />

      {/* Lightweight Ambient Floating Beams (hidden when prefers-reduced-motion) */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none hidden md:block absolute -top-24 end-1/4 w-[420px] h-[420px] rounded-full bg-cyan-500/10 blur-3xl motion-reduce:hidden"
        animate={{ y: [0, 26, 0], x: [0, -18, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none hidden md:block absolute -bottom-24 start-1/4 w-[380px] h-[380px] rounded-full bg-violet-600/10 blur-3xl motion-reduce:hidden"
        animate={{ y: [0, -24, 0], x: [0, 16, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Headline, Description, Actions */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="lg:col-span-6 space-y-6"
          >
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              {copy.eyebrow}
            </p>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-[48px] xl:text-[52px] font-bold text-white leading-[1.12] tracking-tight">
              {headline}
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-xl">
              {subheadline}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onNavigateRegister}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[46px] text-xs sm:text-sm font-bold tracking-wide text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 hover:from-cyan-300 hover:to-blue-300 rounded-md shadow-lg shadow-cyan-500/25 transition-all whitespace-nowrap shrink-0"
              >
                <span>{copy.ctaPrimary}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180 shrink-0" />
              </button>

              <button
                type="button"
                onClick={onExploreFeatures}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 min-h-[46px] text-xs sm:text-sm font-semibold text-white border border-white/20 bg-white/[0.04] hover:bg-white/[0.09] hover:border-cyan-400/50 rounded-md transition-all whitespace-nowrap shrink-0"
              >
                <Compass className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>{copy.ctaSecondary}</span>
              </button>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-x-6 gap-y-2">
              <button
                type="button"
                onClick={onNavigateLogin}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors underline-offset-4 hover:underline"
              >
                <span>{copy.ctaLogin}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {copy.highlights.map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right Column: Interactive Floating 3D-Perspective Software Showcase */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="lg:col-span-6 [perspective:1200px]"
          >
            <div className="relative rounded-xl border border-cyan-400/25 bg-[#081129]/85 backdrop-blur-xl shadow-2xl shadow-cyan-950/50 overflow-hidden transition-transform duration-500 hover:[transform:rotateY(-2deg)_rotateX(2deg)] motion-reduce:hover:transform-none">
              {/* Top Window Header */}
              <div className="px-4 py-3 border-b border-white/10 bg-[#050B1D]/90 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center text-[10px] font-bold text-slate-950 shrink-0">
                    TC
                  </div>
                  <span className="text-xs font-semibold text-white truncate">
                    {lang === 'ar' ? 'مساحة مركز الخليج للسلامة' : 'Gulf Safety Academy Workspace'}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-cyan-300/90">
                  {copy.previewLabel}
                </span>
              </div>

              {/* Interactive Module Switcher Tabs */}
              <div className="px-4 pt-3 border-b border-white/10 flex items-center gap-1 overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-cyan-400 text-cyan-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'ar' ? tab.labelAr : tab.labelEn}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Preview Body */}
              <div className="p-4 sm:p-5 space-y-4 min-h-[340px]">
                {activeTab === 'dashboard' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        {
                          label: lang === 'ar' ? 'المتدربون' : 'Candidates',
                          value: '1,482',
                          sub: lang === 'ar' ? 'مسجلون' : 'Registered',
                        },
                        {
                          label: lang === 'ar' ? 'الدفعات النشطة' : 'Active Batches',
                          value: '18',
                          sub: lang === 'ar' ? 'قيد التنفيذ' : 'Running',
                        },
                        {
                          label: lang === 'ar' ? 'نسبة النجاح' : 'Pass Rate',
                          value: '94.6%',
                          sub: lang === 'ar' ? 'الاختبارات' : 'Assessments',
                        },
                        {
                          label: lang === 'ar' ? 'الشهادات' : 'Certificates',
                          value: '3,920',
                          sub: lang === 'ar' ? 'موثقة QR' : 'QR Verified',
                        },
                      ].map((kpi) => (
                        <div
                          key={kpi.label}
                          className="p-3 rounded-lg bg-white/[0.04] border border-white/10"
                        >
                          <div className="text-[11px] text-slate-400 truncate">{kpi.label}</div>
                          <div className="font-display font-bold text-lg text-white tabular-nums mt-1">
                            {kpi.value}
                          </div>
                          <div className="text-[10px] text-cyan-300/80 mt-0.5">{kpi.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Visual Attendance & Issuance Bar Chart Preview */}
                    <div className="p-4 rounded-lg bg-[#050C20] border border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">
                          {lang === 'ar'
                            ? 'اتجاه التسجيل وإصدار الشهادات الشهري'
                            : 'Monthly Enrollments & Certificate Issuance'}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-cyan-300">
                          {lang === 'ar' ? 'مثال توضيحي' : 'Illustrative Chart'}
                        </span>
                      </div>
                      <div className="grid grid-cols-7 gap-2 items-end h-28 pt-2">
                        {[42, 58, 51, 74, 68, 86, 94].map((val, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                            <div
                              className="w-full rounded-t bg-gradient-to-t from-sky-500/80 via-cyan-400/90 to-violet-400/85"
                              style={{ height: `${val}%` }}
                            />
                            <span className="font-mono-tabular text-[10px] text-slate-400">
                              M{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'batches' && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-200">
                      {lang === 'ar' ? 'جدول الدفعات التدريبية الجارية' : 'Active Training Batches Schedule'}
                    </div>
                    {[
                      {
                        code: 'BCH-2026-041',
                        title: lang === 'ar' ? 'السلامة المهنية المتقدمة (OSHA)' : 'Advanced Industrial Safety',
                        mode: lang === 'ar' ? 'حضوري' : 'Classroom',
                        capacity: '22 / 25',
                        pct: 88,
                      },
                      {
                        code: 'BCH-2026-042',
                        title: lang === 'ar' ? 'مكافحة الحرائق والإخلاء' : 'Fire Fighting & Emergency Response',
                        mode: lang === 'ar' ? 'عملي' : 'Practical',
                        capacity: '18 / 20',
                        pct: 90,
                      },
                      {
                        code: 'BCH-2026-043',
                        title: lang === 'ar' ? 'الإسعافات الأولية والإنعاش' : 'First Aid & BLS Certification',
                        mode: lang === 'ar' ? 'مدمج' : 'Hybrid',
                        capacity: '15 / 20',
                        pct: 75,
                      },
                    ].map((row) => (
                      <div
                        key={row.code}
                        className="p-3 rounded-lg bg-white/[0.04] border border-white/10 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono-tabular text-[11px] text-cyan-300">
                              {row.code} · {row.mode}
                            </div>
                            <div className="text-xs font-semibold text-white truncate">
                              {row.title}
                            </div>
                          </div>
                          <span className="font-mono-tabular text-xs font-semibold text-slate-200 shrink-0">
                            {row.capacity}
                          </span>
                        </div>
                        <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-400 to-violet-500"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'certificates' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Sample Certificate Miniature */}
                    <div className="p-4 rounded-lg border border-cyan-400/30 bg-gradient-to-br from-[#0B1739] to-[#050C21] space-y-3">
                      <div className="flex items-center justify-between">
                        <Award className="w-5 h-5 text-cyan-300" />
                        <span className="font-mono-tabular text-[10px] text-cyan-200">
                          CERT-2026-8841
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          {lang === 'ar' ? 'شهادة إتمام تدريب' : 'Certificate of Completion'}
                        </div>
                        <div className="font-display font-bold text-sm text-white">
                          {lang === 'ar' ? 'سالم القحطاني' : 'Salem Al-Qahtani'}
                        </div>
                        <div className="text-xs text-cyan-200">
                          {lang === 'ar' ? 'القيادة الدفاعية والسلامة' : 'Defensive Driving & HSE'}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{lang === 'ar' ? 'الحالة: سارية' : 'Status: Valid'}</span>
                        <QrCode className="w-5 h-5 text-white/80" />
                      </div>
                    </div>

                    {/* Sample Training Card Miniature */}
                    <div className="p-4 rounded-lg border border-violet-400/30 bg-gradient-to-br from-[#16103A] to-[#070E25] space-y-3">
                      <div className="flex items-center justify-between">
                        <CreditCard className="w-5 h-5 text-violet-300" />
                        <span className="font-mono-tabular text-[10px] text-violet-200">
                          CARD-4490
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          {lang === 'ar' ? 'بطاقة متدرب معتمدة' : 'Authorized Training Card'}
                        </div>
                        <div className="font-display font-bold text-sm text-white">
                          {lang === 'ar' ? 'شركة بترو الخليج' : 'Gulf Petro Logistics'}
                        </div>
                        <div className="text-xs text-slate-300 font-mono-tabular">
                          ID: ••••••4821
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{lang === 'ar' ? 'صالح لـ 24 شهراً' : 'Valid 24 Months'}</span>
                        <ShieldCheck className="w-4 h-4 text-cyan-300" />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'verify' && (
                  <div className="p-4 rounded-lg bg-[#050C20] border border-emerald-400/30 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-emerald-300">
                            {lang === 'ar' ? 'شهادة صالحة وموثقة' : 'Valid Verified Credential'}
                          </div>
                          <div className="font-mono-tabular text-[11px] text-slate-400">
                            CERT-2026-8841
                          </div>
                        </div>
                      </div>
                      <QrCode className="w-8 h-8 text-cyan-300 shrink-0" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-white/10">
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {lang === 'ar' ? 'اسم المتدرب' : 'Trainee Name'}
                        </div>
                        <div className="font-medium text-white">
                          {lang === 'ar' ? 'سالم القحطاني' : 'Salem Al-Qahtani'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {lang === 'ar' ? 'الدورة التدريبية' : 'Course'}
                        </div>
                        <div className="font-medium text-white">
                          {lang === 'ar' ? 'السلامة المهنية' : 'Industrial Safety'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {lang === 'ar' ? 'الجهة المصدرة' : 'Issuing Center'}
                        </div>
                        <div className="font-medium text-slate-200">
                          {lang === 'ar' ? 'مركز الخليج للسلامة' : 'Gulf Safety Academy'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {lang === 'ar' ? 'حماية الخصوصية' : 'Privacy Protection'}
                        </div>
                        <div className="font-medium text-cyan-300">
                          {lang === 'ar' ? 'بدون كشف رقم الهوية' : 'Zero-PII Public Lookup'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
