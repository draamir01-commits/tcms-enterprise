import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  BookOpen,
  UserCheck,
  CalendarDays,
  ClipboardList,
  CheckSquare,
  FileSpreadsheet,
  CreditCard,
  Award,
  ShieldCheck,
  FileCode,
  Layers,
  Upload,
  Bell,
  BarChart3,
  UserCog,
  History,
  Settings,
  Menu,
  X,
  LogOut,
  Globe,
  Shield,
  Clock,
} from 'lucide-react';
import type { ModuleKey } from '../../types/tcms';
import { getAllowedNavModules } from '../../lib/permissions';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBranding } from '../../contexts/BrandingContext';
import { getNavLabel, getRoleLabel } from '../../i18n/translations';
import { apiFetch } from '../../lib/api';
import { AccountSecurityModal } from '../auth/AccountSecurityModal';

const MODULE_ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  candidates: Users,
  corporate_clients: Building2,
  courses: BookOpen,
  trainers: UserCheck,
  batches: CalendarDays,
  enrollments: ClipboardList,
  attendance: CheckSquare,
  assessments: FileSpreadsheet,
  training_cards: CreditCard,
  certificates: Award,
  verification: ShieldCheck,
  certificate_templates: FileCode,
  card_templates: Layers,
  excel_import_export: Upload,
  notifications: Bell,
  reports: BarChart3,
  user_management: UserCog,
  audit_logs: History,
  company_settings: Settings,
};

export function AppShell({
  activeModule,
  onNavigate,
  onOpenSuperAdmin,
  children,
}: {
  activeModule: ModuleKey;
  onNavigate: (mod: ModuleKey) => void;
  onOpenSuperAdmin?: () => void;
  children: React.ReactNode;
}) {
  const {
    profile,
    tenantContext,
    roleMatrix,
    sessionWarningSeconds,
    staySignedIn,
    logout,
    savePreferredLanguage,
  } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const { branding, logoUrl } = useBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const allowedModules = getAllowedNavModules(profile, roleMatrix);

  useEffect(() => {
    if (!profile) return;
    apiFetch<{ notifications: Array<{ read: boolean }> }>('/api/notifications')
      .then((res) => {
        setUnreadCount(res.notifications.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, [profile, activeModule]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const brandName =
    lang === 'ar'
      ? branding.nameAr || branding.nameEn || t('appTitle')
      : branding.nameEn || t('appTitle');

  const toggleLanguage = () => {
    const next = lang === 'en' ? 'ar' : 'en';
    setLang(next);
    void savePreferredLanguage(next);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 lg:sticky lg:top-0 z-50 h-screen w-64 shrink-0 bg-white border-e border-slate-200 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : lang === 'ar' ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 object-contain rounded border border-slate-200 bg-white shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: branding.primaryColor || '#0f172a' }}
              >
                TC
              </div>
            )}
            <span className="font-display font-semibold text-sm text-slate-900 truncate">
              {brandName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {allowedModules.map((mod) => {
            const Icon = MODULE_ICONS[mod];
            const isActive = activeModule === mod;
            return (
              <button
                key={mod}
                type="button"
                onClick={() => {
                  onNavigate(mod);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                style={isActive ? { backgroundColor: branding.primaryColor || '#0f172a' } : undefined}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{getNavLabel(mod, lang)}</span>
                </span>
                {mod === 'notifications' && unreadCount > 0 && (
                  <span className="font-mono-tabular text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1.5">
          <div className="px-2 py-1">
            <p className="text-xs font-medium text-slate-900 truncate">{profile?.displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {profile ? getRoleLabel(profile.role, lang) : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAccountModalOpen(true);
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span>{t('accountSecurity')}</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 shrink-0"
              aria-label={t('toggleMenu')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">{brandName}</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {getNavLabel(activeModule, lang)}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
            {allowedModules.includes('notifications') && (
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="relative p-2 min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 shrink-0"
                aria-label={t('nav_notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-amber-600 text-white rounded flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </header>

        {sessionWarningSeconds !== null && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {t('sessionExpiringWarning')}{' '}
                <strong className="font-mono-tabular">{sessionWarningSeconds}s</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={staySignedIn}
              className="px-3 py-1.5 text-xs font-medium bg-amber-900 text-white rounded-md hover:bg-amber-800 whitespace-nowrap"
            >
              {t('staySignedIn')}
            </button>
          </div>
        )}

        {tenantContext && (tenantContext.status === 'grace_period' || tenantContext.status === 'trial') && (
          <div
            className={`border-b px-4 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs ${
              tenantContext.status === 'grace_period'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-sky-50 border-sky-200 text-sky-900'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <span>
                {tenantContext.status === 'grace_period'
                  ? t('subscriptionGraceBanner')
                  : t('subscriptionTrialBanner')}
              </span>
              <span className="opacity-75">•</span>
              <span>
                {lang === 'ar'
                  ? tenantContext.planNameAr || tenantContext.planCode
                  : tenantContext.planNameEn || tenantContext.planCode}
              </span>
            </div>
            {tenantContext.status === 'trial' && tenantContext.trialEndsAt && (
              <span className="font-mono-tabular text-[11px] opacity-85">
                {t('subscriptionEndsLabel')}: {tenantContext.trialEndsAt.slice(0, 10)}
              </span>
            )}
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      <AccountSecurityModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
      />
    </div>
  );
}
