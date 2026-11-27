import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Search, CheckCircle2, AlertTriangle, XCircle, Globe, ArrowLeft, Eye } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type { Certificate, PublicVerificationResult } from '../types/tcms';
import { ErrorAlert, PdfPreviewModal, StatusText } from '../components/ui/UiKit';

export function VerificationPage({
  isPublicStandalone = false,
  onBackToLogin,
}: {
  isPublicStandalone?: boolean;
  onBackToLogin?: () => void;
}) {
  const { profile } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [tab, setTab] = useState<'public' | 'internal'>('public');
  const [certInput, setCertInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [publicResult, setPublicResult] = useState<PublicVerificationResult | null>(null);
  const [loadingPublic, setLoadingPublic] = useState(false);

  const [internalQuery, setInternalQuery] = useState('');
  const [internalResults, setInternalResults] = useState<Certificate[]>([]);
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canInternalVerify =
    !isPublicStandalone &&
    (isTenantAdminRole(profile?.role) || profile?.role === 'certificate_officer');

  const runPublicVerify = useCallback(async (certVal: string, tokenVal: string) => {
    if (!certVal.trim() && !tokenVal.trim()) return;
    setLoadingPublic(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (certVal.trim()) qs.set('cert', certVal.trim());
      if (tokenVal.trim()) qs.set('token', tokenVal.trim());
      const res = await fetch(`/api/public/verify?${qs.toString()}`);
      const data = (await res.json()) as PublicVerificationResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setPublicResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cert = params.get('cert') || '';
    const token = params.get('token') || '';
    if (cert || token) {
      setCertInput(cert);
      setTokenInput(token);
      void runPublicVerify(cert, token);
    }
  }, [runPublicVerify]);

  const handlePublicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runPublicVerify(certInput, tokenInput);
  };

  const handleInternalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internalQuery.trim()) return;
    setLoadingInternal(true);
    setError(null);
    try {
      const res = await apiFetch<{ certificates: Certificate[] }>(
        `/api/verification/internal?q=${encodeURIComponent(internalQuery.trim())}`
      );
      setInternalResults(res.certificates);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingInternal(false);
    }
  };

  const renderVerificationCard = () => {
    const statusBanner =
      publicResult?.status === 'valid'
        ? {
            bg: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
            icon: <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />,
            label: t('status_valid'),
          }
        : publicResult?.status === 'expired' || publicResult?.status === 'superseded'
          ? {
              bg: 'border-amber-200 bg-amber-50/70 text-amber-900',
              icon: <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />,
              label: t(`status_${publicResult.status}`),
            }
          : {
              bg: 'border-red-200 bg-red-50/70 text-red-900',
              icon: <XCircle className="w-6 h-6 text-red-600 shrink-0" />,
              label: t(`status_${publicResult?.status || 'not_found'}`),
            };

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-slate-900 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {t('verifyCertificateTitle')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('verifyCertificateHint')}</p>
            </div>
          </div>

          <form onSubmit={handlePublicSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'ar' ? 'رقم الشهادة' : 'Certificate Number'}
                </label>
                <input
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  placeholder="CERT-2026-0001"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {lang === 'ar' ? 'رمز QR (اختياري)' : 'QR Token (Optional)'}
                </label>
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Scanned token..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loadingPublic || (!certInput.trim() && !tokenInput.trim())}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{loadingPublic ? t('loading') : t('verifyButton')}</span>
            </button>
          </form>
        </div>

        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        {publicResult && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${statusBanner.bg}`}>
              <div className="flex items-center gap-3">
                {statusBanner.icon}
                <div>
                  <div className="text-sm font-bold">{statusBanner.label}</div>
                  {publicResult.certificateNumber && (
                    <div className="text-xs font-mono-tabular opacity-80">
                      {publicResult.certificateNumber}
                    </div>
                  )}
                </div>
              </div>
              <StatusText status={publicResult.status} />
            </div>

            {publicResult.found ? (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Candidate Name (EN)</span>
                  <span className="font-semibold text-slate-900">{publicResult.candidateNameEn}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Candidate Name (AR)</span>
                  <span className="font-semibold text-slate-900">{publicResult.candidateNameAr || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Course Title (EN)</span>
                  <span className="font-medium text-slate-900">{publicResult.courseTitleEn}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Course Title (AR)</span>
                  <span className="font-medium text-slate-900">{publicResult.courseTitleAr || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Completion Date</span>
                  <span className="font-mono-tabular text-slate-900">{publicResult.completionDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Issue / Expiry Date</span>
                  <span className="font-mono-tabular text-slate-900">
                    {publicResult.issueDate} / {publicResult.expiryDate || 'No Expiry'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block">Issuing Training Center</span>
                  <span className="font-medium text-slate-900">
                    {publicResult.issuingCenterEn}
                    {publicResult.issuingCenterAr ? ` — ${publicResult.issuingCenterAr}` : ''}
                  </span>
                </div>
                {publicResult.supersededBy && (
                  <div className="sm:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800">
                    This certificate was superseded by replacement certificate{' '}
                    <span className="font-mono-tabular font-semibold">{publicResult.supersededBy}</span>.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-xs text-slate-600">
                No matching certificate record was found for the provided certificate number or QR token.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const innerContent = (
    <div className="space-y-5">
      {canInternalVerify && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setTab('public')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'public' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {lang === 'ar' ? 'التحقق العام (بدون بيانات حساسة)' : 'Public Verification Lookup'}
          </button>
          <button
            type="button"
            onClick={() => setTab('internal')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'internal' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {lang === 'ar' ? 'التحقق الداخلي للموظفين' : 'Internal Staff Verification'}
          </button>
        </div>
      )}

      {tab === 'public' ? (
        renderVerificationCard()
      ) : (
        <div className="space-y-5">
          <form onSubmit={handleInternalSearch} className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap gap-3">
            <input
              type="text"
              value={internalQuery}
              onChange={(e) => setInternalQuery(e.target.value)}
              placeholder="Search by Certificate #, Candidate ID, Name, or full Iqama Number..."
              className="flex-1 min-w-[260px] px-3 py-2 text-xs border border-slate-200 rounded-md"
            />
            <button
              type="submit"
              disabled={loadingInternal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{loadingInternal ? t('loading') : 'Search Internal Registry'}</span>
            </button>
          </form>

          <ErrorAlert message={error} onDismiss={() => setError(null)} />

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-start">Certificate #</th>
                  <th className="py-2.5 px-4 text-start">Candidate</th>
                  <th className="py-2.5 px-4 text-start">Course</th>
                  <th className="py-2.5 px-4 text-start">Issue / Expiry</th>
                  <th className="py-2.5 px-4 text-start">Status</th>
                  <th className="py-2.5 px-4 text-end">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {internalResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                      Enter a certificate number, candidate ID, candidate name, or Iqama number to verify internally.
                    </td>
                  </tr>
                ) : (
                  internalResults.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold">{c.certificateNumber}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{c.snapshot.candidateNameEn}</div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular">{c.candidateId}</div>
                      </td>
                      <td className="py-2.5 px-4">{c.snapshot.courseTitleEn}</td>
                      <td className="py-2.5 px-4 font-mono-tabular">
                        {c.issueDate} / {c.expiryDate || 'No Expiry'}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText status={c.status} />
                      </td>
                      <td className="py-2.5 px-4 text-end">
                        <button
                          type="button"
                          onClick={() => setPreviewCert(c)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PdfPreviewModal
        fileId={previewCert?.pdfFileId || null}
        title={previewCert ? `${previewCert.certificateNumber}` : ''}
        onClose={() => setPreviewCert(null)}
      />
    </div>
  );

  if (!isPublicStandalone) {
    return innerContent;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 shrink-0 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('backToLogin')}</span>
            </button>
          )}
          <span className="font-display font-semibold text-sm text-slate-900 truncate">
            {t('publicVerificationPortal')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{lang === 'en' ? 'العربية' : 'English'}</span>
        </button>
      </header>

      <main className="flex-1 p-6 lg:p-10">{innerContent}</main>
    </div>
  );
}
