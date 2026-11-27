import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CompanySettings } from '../types/tcms';
import { useAuth } from './AuthContext';
import { apiFetch, fetchProtectedFileUrl } from '../lib/api';
import {
  certificateBackgroundLibrary,
  type CertificateBackgroundLibraryService,
} from '../branding/CertificateBackgroundLibrary';

interface BrandingContextValue {
  branding: CompanySettings;
  logoUrl: string | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  backgroundLibrary: CertificateBackgroundLibraryService;
  refreshBranding: () => Promise<void>;
}

const DEFAULT_BRANDING: CompanySettings = {
  nameEn: '',
  nameAr: '',
  legalName: '',
  crNumber: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  primaryColor: '#0f172a',
  secondaryColor: '#0284c7',
  certificateFooter: '',
  cardFooter: '',
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [branding, setBranding] = useState<CompanySettings>(DEFAULT_BRANDING);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const requestSeqRef = React.useRef(0);
  const blobUrlsRef = React.useRef<{ logo: string | null; stamp: string | null; signature: string | null }>({
    logo: null,
    stamp: null,
    signature: null,
  });

  const updateBlobUrl = (
    key: 'logo' | 'stamp' | 'signature',
    nextUrl: string | null,
    setter: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const prev = blobUrlsRef.current[key];
    if (prev && prev !== nextUrl && prev.startsWith('blob:')) {
      URL.revokeObjectURL(prev);
    }
    blobUrlsRef.current[key] = nextUrl;
    setter(nextUrl);
  };

  useEffect(() => {
    return () => {
      for (const u of Object.values(blobUrlsRef.current)) {
        if (u && u.startsWith('blob:')) {
          URL.revokeObjectURL(u);
        }
      }
    };
  }, []);

  const refreshBranding = useCallback(async () => {
    if (!profile) return;
    const seq = ++requestSeqRef.current;
    try {
      const data = await apiFetch<{ settings: CompanySettings }>('/api/company-settings');
      if (seq !== requestSeqRef.current) return;
      if (data.settings) {
        setBranding(data.settings);
        document.documentElement.style.setProperty('--brand-primary', data.settings.primaryColor || '#0f172a');
        document.documentElement.style.setProperty('--brand-secondary', data.settings.secondaryColor || '#0284c7');

        const [nextLogo, nextStamp, nextSig] = await Promise.all([
          data.settings.logoFileId
            ? fetchProtectedFileUrl(data.settings.logoFileId).catch(() => null)
            : Promise.resolve(null),
          data.settings.stampFileId
            ? fetchProtectedFileUrl(data.settings.stampFileId).catch(() => null)
            : Promise.resolve(null),
          data.settings.signatureFileId
            ? fetchProtectedFileUrl(data.settings.signatureFileId).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (seq !== requestSeqRef.current) {
          for (const u of [nextLogo, nextStamp, nextSig]) {
            if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
          }
          return;
        }
        updateBlobUrl('logo', nextLogo, setLogoUrl);
        updateBlobUrl('stamp', nextStamp, setStampUrl);
        updateBlobUrl('signature', nextSig, setSignatureUrl);
      }
    } catch {
      // Keep neutral defaults
    }
  }, [profile]);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        logoUrl,
        stampUrl,
        signatureUrl,
        backgroundLibrary: certificateBackgroundLibrary,
        refreshBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
}
