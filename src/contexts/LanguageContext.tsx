import React, { createContext, useContext, useEffect, useState } from 'react';
import type { LanguageCode } from '../types/tcms';
import { TRANSLATIONS } from '../i18n/translations';

interface LanguageContextValue {
  lang: LanguageCode;
  dir: 'ltr' | 'rtl';
  setLang: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
  formatDate: (dateStr?: string) => string;
  formatNumber: (num: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('tcms_lang');
    return saved === 'ar' ? 'ar' : 'en';
  });

  const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem('tcms_lang', lang);
  }, [lang, dir]);

  const setLang = (next: LanguageCode) => {
    setLangState(next);
  };

  const t = (key: string, fallback?: string): string => {
    return TRANSLATIONS[lang][key] || fallback || key;
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(d);
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US').format(num);
  };

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t, formatDate, formatNumber }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
