import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import {
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  normalizePermissionMatrix,
} from '../lib/permissions';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import { getActiveTenantId, setActiveTenantId } from '../lib/api';
import type {
  LanguageCode,
  PermissionMatrix,
  RolePermissionMatrix,
  TenantContextSummary,
  UserProfile,
} from '../types/tcms';
import { useLanguage } from './LanguageContext';

const IDLE_WARNING_MS = 28 * 60 * 1000;
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  tenantContext: TenantContextSummary | null;
  roleMatrix: RolePermissionMatrix;
  effectivePermissions: PermissionMatrix;
  loading: boolean;
  authError: string | null;
  emailUnverified: boolean;
  sessionWarningSeconds: number | null;
  sessionExpiredNotice: boolean;
  clearAuthMessages: () => void;
  loginWithGoogle: () => Promise<void>;
  registerTenantWithGoogle: (payload: {
    nameEn: string;
    nameAr?: string;
    legalName?: string;
    crNumber?: string;
    vatNumber?: string;
    country?: string;
    city?: string;
    address?: string;
    website?: string;
    companyEmail?: string;
    companyPhone?: string;
    ownerDisplayName?: string;
    ownerMobile?: string;
    planCode: string;
    billingCycle: 'monthly' | 'annual';
    defaultLanguage: LanguageCode;
  }) => Promise<{
    status: 'provisioned' | 'verification_required';
    email?: string;
    tenantId?: string;
    tenantNameEn?: string;
    planCode?: string;
  }>;
  loginWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadAndRefreshSession: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateMyProfile: (updates: {
    displayName: string;
    phone: string;
    preferredLanguage: LanguageCode;
  }) => Promise<void>;
  staySignedIn: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  savePreferredLanguage: (lang: LanguageCode) => Promise<void>;
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenantContext, setTenantContext] = useState<TenantContextSummary | null>(null);
  const [roleMatrix, setRoleMatrix] = useState<RolePermissionMatrix>(DEFAULT_ROLE_PERMISSIONS);
  const [effectivePermissions, setEffectivePermissions] = useState<PermissionMatrix>(
    getEffectivePermissions(null)
  );
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [sessionWarningSeconds, setSessionWarningSeconds] = useState<number | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const { setLang, t } = useLanguage();
  const lastActivityRef = useRef<number>(Date.now());
  const suppressAutoBootstrapRef = useRef<boolean>(false);

  const mapFirebaseAuthError = useCallback(
    (err: unknown): string => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-email':
          return t('authErrorInvalidCredential');
        case 'auth/user-disabled':
          return t('authErrorUserDisabled');
        case 'auth/too-many-requests':
          return t('authErrorTooManyRequests');
        case 'auth/operation-not-allowed':
          return t('authErrorOperationNotAllowed');
        case 'auth/requires-recent-login':
          return t('authErrorRequiresRecentLogin');
        case 'auth/weak-password':
          return t('authErrorWeakPassword');
        case 'auth/network-request-failed':
          return t('authErrorNetwork');
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          return t('authErrorPopupClosed');
        case 'auth/popup-blocked':
          return t('authErrorPopupBlocked');
        case 'auth/account-exists-with-different-credential':
          return t('authErrorAccountExistsWithDifferentCredential');
        case 'auth/unauthorized-domain':
          return t('authErrorUnauthorizedDomain');
        default:
          return err instanceof Error ? err.message : String(err);
      }
    },
    [t]
  );

  const fetchServerProfile = useCallback(
    async (fbUser: FirebaseUser, forceRefreshToken = false) => {
      try {
        if (!fbUser.emailVerified) {
          setEmailUnverified(true);
          setProfile(null);
          setTenantContext(null);
          setActiveTenantId(null);
          setEffectivePermissions(getEffectivePermissions(null));
          setAuthError(null);
          return;
        }
        const token = await fbUser.getIdToken(forceRefreshToken);
        const currentTenantId = getActiveTenantId();
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(currentTenantId ? { 'x-tenant-id': currentTenantId } : {}),
          },
        });
        const data = (await res.json()) as {
          user?: UserProfile;
          effectivePermissions?: PermissionMatrix;
          roleMatrix?: RolePermissionMatrix;
          tenantContext?: TenantContextSummary | null;
          error?: string;
          code?: string;
        };
        if (!res.ok || !data.user) {
          if (data.code === 'EMAIL_NOT_VERIFIED') {
            setEmailUnverified(true);
            setProfile(null);
            setTenantContext(null);
            setActiveTenantId(null);
            setAuthError(null);
            return;
          }
          if (
            data.code === 'ACCOUNT_SUSPENDED' ||
            data.code === 'TENANT_SUSPENDED' ||
            data.code === 'TENANT_CANCELLED'
          ) {
            setAuthError(
              data.code === 'ACCOUNT_SUSPENDED'
                ? t('authErrorUserDisabled')
                : data.error || t('authErrorTenantUnavailable')
            );
            setProfile(null);
            setTenantContext(null);
            setActiveTenantId(null);
            await signOut(auth).catch(() => {});
            return;
          }
          throw new Error(data.error || 'Failed to authenticate user profile');
        }
        const nextMatrix = normalizePermissionMatrix(data.roleMatrix);
        const nextEffective = data.effectivePermissions || getEffectivePermissions(data.user, nextMatrix);
        setRoleMatrix(nextMatrix);
        setEffectivePermissions(nextEffective);
        setProfile(data.user);
        setTenantContext(data.tenantContext || null);
        if (data.user.platformRole === 'platform_super_admin') {
          setActiveTenantId(null);
        } else {
          setActiveTenantId(data.tenantContext?.tenantId || data.user.tenantId || null);
        }
        setEmailUnverified(false);
        setAuthError(null);
        setSessionExpiredNotice(false);
        lastActivityRef.current = Date.now();
        if (data.user.preferredLanguage === 'ar' || data.user.preferredLanguage === 'en') {
          setLang(data.user.preferredLanguage);
        }
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
        setProfile(null);
        setTenantContext(null);
        setActiveTenantId(null);
        setEffectivePermissions(getEffectivePermissions(null));
      }
    },
    [mapFirebaseAuthError, setLang, t]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        if (!suppressAutoBootstrapRef.current) {
          await fetchServerProfile(fbUser);
        }
      } else {
        setProfile(null);
        setTenantContext(null);
        setActiveTenantId(null);
        setEmailUnverified(false);
        setEffectivePermissions(getEffectivePermissions(null));
        setSessionWarningSeconds(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchServerProfile]);

  const performLogout = useCallback(async (expiredDueToIdle = false) => {
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        const tid = getActiveTenantId();
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(tid ? { 'x-tenant-id': tid } : {}),
          },
        });
      } catch {
        // Proceed with Firebase sign-out regardless
      }
    }
    await signOut(auth);
    setProfile(null);
    setTenantContext(null);
    setActiveTenantId(null);
    setEmailUnverified(false);
    setEffectivePermissions(getEffectivePermissions(null));
    setSessionWarningSeconds(null);
    if (expiredDueToIdle) {
      setSessionExpiredNotice(true);
    }
  }, []);

  // 30-minute idle timeout tracking when signed in
  useEffect(() => {
    if (!profile) {
      setSessionWarningSeconds(null);
      return;
    }

    lastActivityRef.current = Date.now();
    let lastTouch = Date.now();

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastTouch > 1000) {
        lastTouch = now;
        lastActivityRef.current = now;
        setSessionWarningSeconds(null);
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    events.forEach((ev) => window.addEventListener(ev, recordActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= IDLE_LOGOUT_MS) {
        window.clearInterval(timer);
        void performLogout(true);
      } else if (idleMs >= IDLE_WARNING_MS) {
        setSessionWarningSeconds(Math.max(1, Math.ceil((IDLE_LOGOUT_MS - idleMs) / 1000)));
      } else {
        setSessionWarningSeconds(null);
      }
    }, 5000);

    return () => {
      window.clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, recordActivity));
    };
  }, [profile, performLogout]);

  const clearAuthMessages = () => {
    setAuthError(null);
    setSessionExpiredNotice(false);
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    setSessionExpiredNotice(false);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const registerTenantWithGoogle: AuthContextValue['registerTenantWithGoogle'] = async (payload) => {
    setAuthError(null);
    setSessionExpiredNotice(false);
    suppressAutoBootstrapRef.current = true;
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithPopup(auth, googleProvider);
      const token = await cred.user.getIdToken(true);
      const res = await fetch('/api/public/register-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...payload,
          companyEmail: payload.companyEmail || cred.user.email || '',
          ownerDisplayName: payload.ownerDisplayName || cred.user.displayName || payload.nameEn,
        }),
      });
      const data = (await res.json()) as {
        status?: 'provisioned' | 'verification_required';
        email?: string;
        tenantId?: string;
        tenantNameEn?: string;
        planCode?: string;
        error?: string;
      };
      if (!res.ok) {
        await signOut(auth).catch(() => {});
        throw new Error(data.error || 'Google registration failed');
      }
      if (data.tenantId) {
        setActiveTenantId(data.tenantId);
      }
      suppressAutoBootstrapRef.current = false;
      await fetchServerProfile(cred.user, true);
      return {
        status: data.status || 'provisioned',
        email: data.email || cred.user.email || undefined,
        tenantId: data.tenantId,
        tenantNameEn: data.tenantNameEn || payload.nameEn,
        planCode: data.planCode || payload.planCode,
      };
    } catch (err) {
      suppressAutoBootstrapRef.current = false;
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const loginWithEmail = async (email: string, password: string, rememberMe: boolean) => {
    setAuthError(null);
    setSessionExpiredNotice(false);
    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      throw new Error(msg);
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('Not signed in');
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const reloadAndRefreshSession = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFirebaseUser(refreshed);
    if (!refreshed.emailVerified) {
      throw new Error(t('authErrorStillUnverified'));
    }
    await fetchServerProfile(refreshed, true);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('Not authenticated');
    const check = validatePasswordStrength(newPassword);
    if (!check.valid) {
      throw new Error(t('authErrorWeakPassword'));
    }

    const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword || newPassword);
      if (hasPasswordProvider) {
        const reauthCred = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, reauthCred);
        await updatePassword(user, newPassword);
      } else {
        await linkWithCredential(user, cred);
      }
      const token = await user.getIdToken(true);
      const tid = getActiveTenantId();
      await fetch('/api/auth/audit-password-change', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(tid ? { 'x-tenant-id': tid } : {}),
        },
      });
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const updateMyProfile = async (updates: {
    displayName: string;
    phone: string;
    preferredLanguage: LanguageCode;
  }) => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    setLang(updates.preferredLanguage);
    const token = await auth.currentUser.getIdToken();
    const tid = getActiveTenantId();
    const res = await fetch('/api/auth/preferences', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(tid ? { 'x-tenant-id': tid } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const data = (await res.json()) as { user?: UserProfile; error?: string };
    if (!res.ok || !data.user) {
      throw new Error(data.error || 'Failed to save profile preferences');
    }
    setProfile(data.user);
  };

  const staySignedIn = () => {
    lastActivityRef.current = Date.now();
    setSessionWarningSeconds(null);
  };

  const logout = async () => {
    await performLogout(false);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await fetchServerProfile(auth.currentUser, true);
    }
  };

  const getToken = async (): Promise<string> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    return auth.currentUser.getIdToken();
  };

  const savePreferredLanguage = async (lang: LanguageCode) => {
    setLang(lang);
    if (!auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const tid = getActiveTenantId();
      const res = await fetch('/api/auth/preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(tid ? { 'x-tenant-id': tid } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferredLanguage: lang }),
      });
      if (res.ok) {
        const data = (await res.json()) as { user?: UserProfile };
        if (data.user) setProfile(data.user);
      }
    } catch {
      // Language state already applied locally
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        tenantContext,
        roleMatrix,
        effectivePermissions,
        loading,
        authError,
        emailUnverified,
        sessionWarningSeconds,
        sessionExpiredNotice,
        clearAuthMessages,
        loginWithGoogle,
        registerTenantWithGoogle,
        loginWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        reloadAndRefreshSession,
        changePassword,
        updateMyProfile,
        staySignedIn,
        logout,
        refreshProfile,
        savePreferredLanguage,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
