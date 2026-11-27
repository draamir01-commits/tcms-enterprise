import React, { useEffect, useState } from 'react';
import type { BillingCycle, PlatformPublicConfig, SubscriptionPlan } from '../types/tcms';
import { DEFAULT_PLATFORM_CONFIG, DEFAULT_SUBSCRIPTION_PLANS } from '../lib/saasDefaults';
import { useLanguage } from '../contexts/LanguageContext';
import { LandingNavbar } from '../components/landing/LandingNavbar';
import { HeroShowcase3D } from '../components/landing/HeroShowcase3D';
import { LandingSections } from '../components/landing/LandingSections';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onNavigateRegister: (planCode?: string, billingCycle?: BillingCycle) => void;
  onNavigateVerify: () => void;
  onNavigateSuperAdmin: () => void;
}

export function LandingPage({
  onNavigateLogin,
  onNavigateRegister,
  onNavigateVerify,
  onNavigateSuperAdmin,
}: LandingPageProps) {
  const { lang, setLang } = useLanguage();
  const [config, setConfig] = useState<PlatformPublicConfig>(DEFAULT_PLATFORM_CONFIG);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);

  useEffect(() => {
    let mounted = true;
    fetch('/api/public/saas-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { platformConfig?: PlatformPublicConfig; subscriptionPlans?: SubscriptionPlan[] } | null) => {
        if (!mounted || !data) return;
        if (data.platformConfig) setConfig(data.platformConfig);
        if (Array.isArray(data.subscriptionPlans) && data.subscriptionPlans.length > 0) {
          setPlans(data.subscriptionPlans);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const brandName = lang === 'ar' ? config.platformNameAr : config.platformNameEn;
    const sub = lang === 'ar' ? config.subtitleAr : config.subtitleEn;
    document.title = `${brandName} — ${sub}`;
  }, [config, lang]);

  const toggleLang = () => setLang(lang === 'en' ? 'ar' : 'en');

  const scrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#030714] text-slate-100 selection:bg-cyan-400/30 selection:text-cyan-100">
      <LandingNavbar
        lang={lang}
        onToggleLang={toggleLang}
        config={config}
        onNavigateLogin={onNavigateLogin}
        onNavigateRegister={() => onNavigateRegister()}
        onNavigateSuperAdmin={onNavigateSuperAdmin}
      />

      <main>
        <HeroShowcase3D
          lang={lang}
          config={config}
          onNavigateRegister={() => onNavigateRegister()}
          onNavigateLogin={onNavigateLogin}
          onExploreFeatures={scrollToFeatures}
        />

        <LandingSections
          lang={lang}
          config={config}
          plans={plans}
          onNavigateRegister={onNavigateRegister}
          onNavigateLogin={onNavigateLogin}
          onNavigateVerify={onNavigateVerify}
          onNavigateSuperAdmin={onNavigateSuperAdmin}
        />
      </main>
    </div>
  );
}
