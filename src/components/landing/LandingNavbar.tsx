import React, { useEffect, useState } from 'react';
import { Globe, Menu, Shield, X, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { LanguageCode, PlatformPublicConfig } from '../../types/tcms';
import { LANDING_COPY } from '../../lib/landingContent';

interface LandingNavbarProps {
  lang: LanguageCode;
  onToggleLang: () => void;
  config: PlatformPublicConfig;
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
  onNavigateSuperAdmin: () => void;
}

export function LandingNavbar({
  lang,
  onToggleLang,
  config,
  onNavigateLogin,
  onNavigateRegister,
  onNavigateSuperAdmin,
}: LandingNavbarProps) {
  const copy = LANDING_COPY[lang].nav;
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const brandName = lang === 'ar' ? config.platformNameAr : config.platformNameEn;
  const subtitle = lang === 'ar' ? config.subtitleAr : config.subtitleEn;

  const navItems: Array<{ id: string; label: string }> = [
    { id: 'hero', label: copy.home },
    { id: 'features', label: copy.features },
    { id: 'solutions', label: copy.solutions },
    { id: 'how-it-works', label: copy.howItWorks },
    { id: 'pricing', label: copy.pricing },
    { id: 'faq', label: copy.faq },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#040919]/85 backdrop-blur-xl border-b border-cyan-400/15 shadow-lg shadow-slate-950/50'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
        {/* Left: Brand */}
        <button
          type="button"
          onClick={() => scrollToSection('hero')}
          className="flex items-center gap-3 text-start shrink-0 group focus:outline-none"
        >
          {config.logoDataUrl ? (
            <img
              src={config.logoDataUrl}
              alt={brandName}
              className="w-9 h-9 rounded-lg object-contain bg-slate-900/90 border border-cyan-400/30 p-1"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 via-cyan-500 to-violet-600 p-[1px] shadow-md shadow-cyan-500/20">
              <div className="w-full h-full rounded-[7px] bg-[#060D21] flex items-center justify-center">
                <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M7 9H25M16 9V24"
                    stroke="#38BDF8"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10 19.5L13.8 23.2L22.5 14"
                    stroke="#22D3EE"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-display font-bold text-base text-white tracking-tight leading-none">
              {brandName}
            </div>
            <div className="hidden sm:block text-[11px] text-slate-400 truncate max-w-[190px] mt-1">
              {subtitle}
            </div>
          </div>
        </button>

        {/* Center: Section Links (Desktop) */}
        <nav className="hidden xl:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-cyan-300 rounded-md hover:bg-white/[0.04] transition-colors whitespace-nowrap shrink-0"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-slate-200 border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>{copy.switchLang}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateSuperAdmin}
            title={copy.superAdmin}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-slate-300 hover:text-violet-300 border border-transparent hover:border-violet-400/25 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">{copy.superAdmin}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateLogin}
            className="hidden sm:inline-flex items-center px-3 py-1.5 min-h-[36px] text-xs font-medium text-slate-100 border border-white/15 hover:border-cyan-400/40 bg-white/[0.03] hover:bg-white/[0.08] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {copy.login}
          </button>

          <button
            type="button"
            onClick={onNavigateRegister}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 min-h-[36px] text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 rounded-md shadow-md shadow-cyan-500/20 transition-all whitespace-nowrap shrink-0"
          >
            <span>{copy.getStarted}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="xl:hidden p-2 text-slate-200 hover:text-white border border-white/10 rounded-md bg-white/[0.04]"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="xl:hidden bg-[#060E24]/95 backdrop-blur-xl border-b border-cyan-400/20 px-4 py-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-1.5">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="text-start px-3 py-2 text-xs font-medium text-slate-200 hover:text-cyan-300 hover:bg-white/[0.05] rounded-md"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onNavigateRegister();
                }}
                className="flex-1 min-w-[140px] py-2.5 px-4 text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-400 rounded-md"
              >
                {copy.getStarted}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onNavigateLogin();
                }}
                className="flex-1 min-w-[110px] py-2.5 px-4 text-xs font-medium text-white border border-white/15 rounded-md bg-white/[0.04]"
              >
                {copy.login}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onNavigateSuperAdmin();
                }}
                className="w-full py-2 px-3 text-xs font-medium text-slate-300 hover:text-violet-300 border border-white/10 rounded-md flex items-center justify-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{copy.superAdmin}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
