/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/auth/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { EmptyState } from './components/ui/UiKit';
import { canAccessModule, getAllowedNavModules } from './lib/permissions';
import type { BillingCycle, ModuleKey } from './types/tcms';

import { LandingPage } from './pages/LandingPage';
import { TenantRegisterPage } from './pages/TenantRegisterPage';
import { SuperAdminPortalPage } from './pages/SuperAdminPortalPage';
import { DashboardPage } from './pages/DashboardPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CorporateClientsPage } from './pages/CorporateClientsPage';
import { CoursesPage } from './pages/CoursesPage';
import { TrainersPage } from './pages/TrainersPage';
import { BatchesPage } from './pages/BatchesPage';
import { EnrollmentsPage } from './pages/EnrollmentsPage';
import { AttendancePage } from './pages/AttendancePage';
import { ExaminationsPage } from './pages/ExaminationsPage';
import { TrainingCardsPage } from './pages/TrainingCardsPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { VerificationPage } from './pages/VerificationPage';
import { CertificateTemplatesPage } from './pages/CertificateTemplatesPage';
import { CardTemplatesPage } from './pages/CardTemplatesPage';
import { ExcelImportExportPage } from './pages/ExcelImportExportPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { CompanySettingsPage } from './pages/CompanySettingsPage';

type PublicRoute = 'landing' | 'login' | 'register' | 'verify' | 'super_admin';

function detectRouteFromLocation(): {
  route: PublicRoute;
  planCode?: string;
  billingCycle?: BillingCycle;
} {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const viewParam = (params.get('view') || '').toLowerCase();
  const planCode = params.get('plan') || undefined;
  const billingRaw = params.get('billing');
  const billingCycle: BillingCycle | undefined =
    billingRaw === 'monthly' || billingRaw === 'annual' ? billingRaw : undefined;

  if (
    path.startsWith('/verify') ||
    viewParam === 'verify' ||
    Boolean(params.get('verify') || params.get('cert') || params.get('token'))
  ) {
    return { route: 'verify' };
  }
  if (path.startsWith('/super-admin') || viewParam === 'super-admin') {
    return { route: 'super_admin' };
  }
  if (path.startsWith('/register') || viewParam === 'register') {
    return { route: 'register', planCode, billingCycle };
  }
  if (path.startsWith('/login') || viewParam === 'login') {
    return { route: 'login' };
  }
  return { route: 'landing' };
}

function TcmsRouter() {
  const { profile, roleMatrix, loading, emailUnverified, firebaseUser } = useAuth();
  const { t } = useLanguage();

  const initial = detectRouteFromLocation();
  const [route, setRoute] = useState<PublicRoute>(initial.route);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | undefined>(initial.planCode);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<BillingCycle | undefined>(
    initial.billingCycle
  );
  const [previewPublicLandingWhenAuthed, setPreviewPublicLandingWhenAuthed] = useState(false);

  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');

  const navigateRoute = (
    nextRoute: PublicRoute,
    opts?: { planCode?: string; billingCycle?: BillingCycle; previewLanding?: boolean }
  ) => {
    setRoute(nextRoute);
    if (opts?.planCode !== undefined) setSelectedPlanCode(opts.planCode);
    if (opts?.billingCycle !== undefined) setSelectedBillingCycle(opts.billingCycle);
    setPreviewPublicLandingWhenAuthed(Boolean(opts?.previewLanding));

    let nextPath = '/';
    if (nextRoute === 'login') nextPath = '/login';
    else if (nextRoute === 'verify') nextPath = '/verify';
    else if (nextRoute === 'super_admin') nextPath = '/super-admin';
    else if (nextRoute === 'register') {
      const qs = new URLSearchParams();
      if (opts?.planCode) qs.set('plan', opts.planCode);
      if (opts?.billingCycle) qs.set('billing', opts.billingCycle);
      nextPath = qs.toString() ? `/register?${qs.toString()}` : '/register';
    }

    if (window.location.pathname + window.location.search !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const onPopState = () => {
      const parsed = detectRouteFromLocation();
      setRoute(parsed.route);
      if (parsed.planCode) setSelectedPlanCode(parsed.planCode);
      if (parsed.billingCycle) setSelectedBillingCycle(parsed.billingCycle);
      setPreviewPublicLandingWhenAuthed(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!canAccessModule(profile, activeModule, roleMatrix)) {
      const allowed = getAllowedNavModules(profile, roleMatrix);
      if (allowed[0] && allowed[0] !== activeModule) {
        setActiveModule(allowed[0]);
      }
    }
  }, [profile, roleMatrix, activeModule]);

  if (route === 'verify' && (!profile || Boolean(new URLSearchParams(window.location.search).get('cert')) || Boolean(new URLSearchParams(window.location.search).get('token')))) {
    return (
      <VerificationPage
        isPublicStandalone
        onBackToLogin={() => navigateRoute(profile ? 'landing' : 'login')}
      />
    );
  }

  if (route === 'super_admin') {
    return (
      <SuperAdminPortalPage
        onBackHome={() => navigateRoute('landing', { previewLanding: true })}
        onEnterTenantWorkspace={() => {
          setPreviewPublicLandingWhenAuthed(false);
          navigateRoute('login');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030714] flex items-center justify-center">
        <div className="text-xs font-medium text-slate-300">{t('loading')}</div>
      </div>
    );
  }

  if (profile && previewPublicLandingWhenAuthed && route === 'landing') {
    return (
      <LandingPage
        onNavigateLogin={() => {
          setPreviewPublicLandingWhenAuthed(false);
          navigateRoute(profile.platformRole === 'platform_super_admin' ? 'super_admin' : 'login');
        }}
        onNavigateRegister={(plan, billing) =>
          navigateRoute('register', { planCode: plan, billingCycle: billing })
        }
        onNavigateVerify={() => navigateRoute('verify')}
        onNavigateSuperAdmin={() => navigateRoute('super_admin')}
      />
    );
  }

  if (!profile) {
    if (emailUnverified && firebaseUser) {
      return (
        <LoginScreen
          onOpenPublicVerify={() => navigateRoute('verify')}
          onBackHome={() => navigateRoute('landing')}
          onOpenRegister={() => navigateRoute('register')}
        />
      );
    }
    if (route === 'register') {
      return (
        <TenantRegisterPage
          initialPlanCode={selectedPlanCode}
          initialBillingCycle={selectedBillingCycle}
          onBackHome={() => navigateRoute('landing')}
          onNavigateLogin={() => navigateRoute('login')}
        />
      );
    }
    if (route === 'login') {
      return (
        <LoginScreen
          onOpenPublicVerify={() => navigateRoute('verify')}
          onBackHome={() => navigateRoute('landing')}
          onOpenRegister={() => navigateRoute('register')}
        />
      );
    }
    return (
      <LandingPage
        onNavigateLogin={() => navigateRoute('login')}
        onNavigateRegister={(plan, billing) =>
          navigateRoute('register', { planCode: plan, billingCycle: billing })
        }
        onNavigateVerify={() => navigateRoute('verify')}
        onNavigateSuperAdmin={() => navigateRoute('super_admin')}
      />
    );
  }

  if (profile.platformRole === 'platform_super_admin') {
    return (
      <SuperAdminPortalPage
        onBackHome={() => navigateRoute('landing', { previewLanding: true })}
        onEnterTenantWorkspace={() => {}}
      />
    );
  }

  const allowed = getAllowedNavModules(profile, roleMatrix);
  const currentMod = canAccessModule(profile, activeModule, roleMatrix)
    ? activeModule
    : allowed[0];

  const renderModule = () => {
    if (!currentMod) {
      return (
        <EmptyState
          title={t('accessDeniedTitle')}
          description={t('accessDeniedDesc')}
        />
      );
    }
    switch (currentMod) {
      case 'dashboard':
        return <DashboardPage />;
      case 'candidates':
        return <CandidatesPage />;
      case 'corporate_clients':
        return <CorporateClientsPage onNavigate={setActiveModule} />;
      case 'courses':
        return <CoursesPage />;
      case 'trainers':
        return <TrainersPage />;
      case 'batches':
        return <BatchesPage />;
      case 'enrollments':
        return <EnrollmentsPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'assessments':
        return <ExaminationsPage />;
      case 'training_cards':
        return <TrainingCardsPage />;
      case 'certificates':
        return <CertificatesPage />;
      case 'verification':
        return <VerificationPage />;
      case 'certificate_templates':
        return <CertificateTemplatesPage />;
      case 'card_templates':
        return <CardTemplatesPage />;
      case 'excel_import_export':
        return <ExcelImportExportPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'user_management':
        return <UserManagementPage />;
      case 'audit_logs':
        return <AuditLogsPage />;
      case 'company_settings':
        return <CompanySettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <AppShell
      activeModule={currentMod || 'dashboard'}
      onNavigate={setActiveModule}
      onOpenSuperAdmin={() => navigateRoute('super_admin')}
    >
      {renderModule()}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <BrandingProvider>
            <TcmsRouter />
          </BrandingProvider>
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
