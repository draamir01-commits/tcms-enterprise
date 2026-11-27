import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Ban,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Printer,
  Layers,
  XCircle,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole, isTenantOwnerRole } from '../lib/permissions';
import type {
  Batch,
  Candidate,
  Certificate,
  CertificateTemplate,
  CompletionEligibility,
  Course,
  Enrollment,
} from '../types/tcms';
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  Modal,
  PdfPreviewModal,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';
import { ProtectedImage } from '../components/ui/ProtectedImage';

export function CertificatesPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();

  const [tab, setTab] = useState<'issued' | 'queue'>('issued');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, CompletionEligibility>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'valid' | 'expiring' | 'expired' | 'revoked' | 'superseded'
  >('all');
  const [issuedBatchFilter, setIssuedBatchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);
  const [bulkPdfLoading, setBulkPdfLoading] = useState(false);

  const [queueBatchFilter, setQueueBatchFilter] = useState('');
  const [queueScope, setQueueScope] = useState<'recommended' | 'all_active'>('recommended');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [previewingQueueId, setPreviewingQueueId] = useState<string | null>(null);

  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewBlobTitle, setPreviewBlobTitle] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [reissueTarget, setReissueTarget] = useState<Certificate | null>(null);

  const [shareOpen, setShareOpen] = useState<{
    cert: Certificate;
    channel: 'email' | 'whatsapp';
  } | null>(null);
  const [shareTarget, setShareTarget] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [manualWhatsappUrl, setManualWhatsappUrl] = useState<string | null>(null);

  const canIssueManage =
    isTenantOwnerRole(profile?.role) || profile?.role === 'certificate_officer';
  const canSendComms =
    isTenantAdminRole(profile?.role) || profile?.role === 'certificate_officer';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [certRes, enrRes, candRes, crsRes, bthRes, tplRes] = await Promise.all([
        apiFetch<{ certificates: Certificate[] }>('/api/certificates'),
        canIssueManage
          ? apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments')
          : Promise.resolve({ enrollments: [] }),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
        canIssueManage
          ? apiFetch<{ templates: CertificateTemplate[] }>('/api/templates/certificates').catch(
              () => ({ templates: [] })
            )
          : Promise.resolve({ templates: [] }),
      ]);

      setCertificates(
        certRes.certificates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setEnrollments(enrRes.enrollments);
      setCandidates(candRes.candidates);
      setCourses(crsRes.courses);
      setBatches(bthRes.batches);
      setTemplates(tplRes.templates.filter((tpl) => tpl.isActive !== false));

      if (canIssueManage) {
        const candidatesForCert = enrRes.enrollments.filter(
          (e) => !e.certificateId && ['confirmed', 'in_progress', 'completed'].includes(e.status)
        );
        const eligEntries = await Promise.all(
          candidatesForCert.slice(0, 60).map(async (e) => {
            try {
              const res = await apiFetch<{ eligibility: CompletionEligibility }>(
                `/api/enrollments/${e.id}/eligibility`
              );
              return [e.id, res.eligibility] as const;
            } catch {
              return null;
            }
          })
        );
        const map: Record<string, CompletionEligibility> = {};
        for (const item of eligEntries) {
          if (item) map[item[0]] = item[1];
        }
        setEligibilityMap(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [canIssueManage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const candMap = new Map(candidates.map((c) => [c.id, c]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const visibleCertificates = certificates.filter((c) => {
    if (issuedBatchFilter && c.batchId !== issuedBatchFilter) return false;
    const isExpiredDate = Boolean(c.expiryDate && c.expiryDate < today && c.status === 'valid');
    const isExpiringSoon = Boolean(
      c.status === 'valid' && c.expiryDate && c.expiryDate >= today && c.expiryDate <= in60Days
    );

    if (statusFilter === 'expiring' && !isExpiringSoon) return false;
    else if (statusFilter === 'expired' && !(c.status === 'expired' || isExpiredDate)) return false;
    else if (
      statusFilter !== 'all' &&
      statusFilter !== 'expiring' &&
      statusFilter !== 'expired' &&
      c.status !== statusFilter
    )
      return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.certificateNumber.toLowerCase().includes(q) ||
      c.candidateId.toLowerCase().includes(q) ||
      c.snapshot.candidateNameEn.toLowerCase().includes(q) ||
      c.snapshot.candidateNameAr.toLowerCase().includes(q) ||
      c.snapshot.courseTitleEn.toLowerCase().includes(q) ||
      (c.snapshot.batchNumber || '').toLowerCase().includes(q)
    );
  });

  const queueEnrollments = enrollments.filter((e) => {
    if (e.certificateId) return false;
    if (!['confirmed', 'in_progress', 'completed'].includes(e.status)) return false;
    if (queueBatchFilter && e.batchId !== queueBatchFilter) return false;
    if (queueScope === 'recommended' && !(e.completionApproved || e.trainerRecommended)) return false;
    return true;
  });

  const handleIssue = async (enrollmentIds: string[]) => {
    if (enrollmentIds.length === 0) return;
    setIssuing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{
        issued: Certificate[];
        errors: Array<{ enrollmentId: string; reason: string }>;
      }>('/api/certificates/issue', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentIds,
          ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
        }),
      });
      if (res.issued.length > 0) {
        setSuccessMsg(
          `Issued ${res.issued.length} certificate(s): ${res.issued
            .map((c) => c.certificateNumber)
            .join(', ')}`
        );
      }
      if (res.errors.length > 0) {
        setError(res.errors.map((e) => `${e.enrollmentId}: ${e.reason}`).join(' | '));
      }
      setSelectedQueueIds([]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIssuing(false);
    }
  };

  const handleIssueBatch = async () => {
    if (!queueBatchFilter) return;
    setIssuing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{
        issued: Certificate[];
        skippedCount: number;
        errors: Array<{ enrollmentId: string; reason: string }>;
      }>(`/api/certificates/batch/${encodeURIComponent(queueBatchFilter)}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
        }),
      });
      setSuccessMsg(
        `Batch Issuance Complete: Issued ${res.issued.length} certificate(s), Skipped ${res.skippedCount} existing, Ineligible ${res.errors.length}.`
      );
      if (res.issued.length === 0 && res.errors.length > 0) {
        setError(res.errors.slice(0, 3).map((e) => `${e.enrollmentId}: ${e.reason}`).join(' | '));
      }
      setSelectedQueueIds([]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIssuing(false);
    }
  };

  const handlePreviewQueuePdf = async (enr: Enrollment) => {
    setPreviewingQueueId(enr.id);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/certificates/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enrollmentId: enr.id,
          ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to render pre-issuance preview');
      }
      const blob = await res.blob();
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(URL.createObjectURL(blob));
      setPreviewBlobTitle(`Pre-Issuance Preview — ${enr.enrollmentNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewingQueueId(null);
    }
  };

  const handleBulkPdf = async () => {
    const idsToExport =
      selectedCertIds.length > 0 ? selectedCertIds : visibleCertificates.map((c) => c.id);
    if (idsToExport.length === 0) return;
    setBulkPdfLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/certificates/bulk-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ certificateIds: idsToExport }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate bulk PDF');
      }
      const blob = await res.blob();
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(URL.createObjectURL(blob));
      setPreviewBlobTitle(`Certificates Bundle (${idsToExport.length})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkPdfLoading(false);
    }
  };

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;
    setError(null);
    try {
      await apiFetch(`/api/certificates/${revokeTarget.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason }),
      });
      setSuccessMsg(`Certificate ${revokeTarget.certificateNumber} has been revoked.`);
      setRevokeTarget(null);
      setRevokeReason('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReissueConfirm = async () => {
    if (!reissueTarget) return;
    setError(null);
    try {
      const res = await apiFetch<{ certificate: Certificate }>(
        `/api/certificates/${reissueTarget.id}/reissue`,
        { method: 'POST' }
      );
      setSuccessMsg(
        `Reissued ${reissueTarget.certificateNumber} as ${res.certificate.certificateNumber}.`
      );
      setReissueTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openShareModal = (cert: Certificate, channel: 'email' | 'whatsapp') => {
    const cand = candMap.get(cert.candidateDocId);
    setManualWhatsappUrl(null);
    setShareTarget(channel === 'email' ? cand?.email || '' : cand?.mobile || '');
    const verifyUrl = `${window.location.origin}/?cert=${encodeURIComponent(cert.certificateNumber)}`;
    setShareMessage(
      `Congratulations ${cert.snapshot.candidateNameEn}! Your training certificate ${cert.certificateNumber} for ${cert.snapshot.courseTitleEn} has been issued on ${cert.issueDate}. Verify online: ${verifyUrl}`
    );
    setShareOpen({ cert, channel });
  };

  const handleSendShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareOpen) return;
    setSending(true);
    setError(null);
    setManualWhatsappUrl(null);
    try {
      if (shareOpen.channel === 'email') {
        const res = await apiFetch<{ ok: boolean; deliveryStatus?: string; error?: string }>('/api/communications/send-email', {
          method: 'POST',
          body: JSON.stringify({
            to: shareTarget,
            subject: `Training Certificate ${shareOpen.cert.certificateNumber} — ${shareOpen.cert.snapshot.courseTitleEn}`,
            message: shareMessage,
            messageType: 'certificate_pdf_delivery',
            entityId: shareOpen.cert.certificateNumber,
            candidateDocId: shareOpen.cert.candidateDocId,
            candidateId: shareOpen.cert.candidateId,
            enrollmentId: shareOpen.cert.enrollmentId,
            certificateId: shareOpen.cert.id,
            organizationId: shareOpen.cert.organizationId,
            attachmentFileId: shareOpen.cert.pdfFileId,
          }),
        });
        if (!res.ok) {
          setError(res.error || 'Email provider not configured; attempt recorded in Delivery Logs.');
        } else {
          setSuccessMsg(`Certificate email dispatched to ${shareTarget} (${res.deliveryStatus || 'sent'}).`);
          setShareOpen(null);
        }
      } else {
        const res = await apiFetch<{ ok: boolean; mode: string; deliveryStatus?: string; manualUrl?: string; error?: string }>(
          '/api/communications/send-whatsapp',
          {
            method: 'POST',
            body: JSON.stringify({
              toPhone: shareTarget,
              message: shareMessage,
              messageType: 'certificate_pdf_delivery',
              entityId: shareOpen.cert.certificateNumber,
              candidateDocId: shareOpen.cert.candidateDocId,
              candidateId: shareOpen.cert.candidateId,
              enrollmentId: shareOpen.cert.enrollmentId,
              certificateId: shareOpen.cert.id,
              organizationId: shareOpen.cert.organizationId,
              attachmentFileId: shareOpen.cert.pdfFileId,
            }),
          }
        );
        if (res.ok) {
          setSuccessMsg(`WhatsApp message dispatched to ${shareTarget} (${res.deliveryStatus || 'sent'}).`);
          setShareOpen(null);
        } else if (res.manualUrl) {
          setManualWhatsappUrl(res.manualUrl);
        } else {
          setError(res.error || 'WhatsApp dispatch failed.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('issued')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'issued'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {lang === 'ar' ? 'سجل الشهادات الصادرة' : 'Issued Certificates'} ({certificates.length})
          </button>
          {canIssueManage && (
            <button
              type="button"
              onClick={() => setTab('queue')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md ${
                tab === 'queue'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {lang === 'ar' ? 'قائمة انتظار الإصدار' : 'Issuance & Eligibility Queue'} (
              {queueEnrollments.length})
            </button>
          )}
        </div>

        {tab === 'issued' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'بحث برقم الشهادة أو المتدرب...'
                  : 'Search certificate #, candidate, course...'
              }
              className="w-56 px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            />
            <select
              value={issuedBatchFilter}
              onChange={(e) => setIssuedBatchFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">{t('filterAllBatches')}</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('all')}</option>
              <option value="valid">{t('status_valid')}</option>
              <option value="expiring">
                {lang === 'ar' ? 'تقارب الانتهاء (60 يوماً)' : 'Approaching Expiry (60d)'}
              </option>
              <option value="expired">{t('status_expired')}</option>
              <option value="revoked">{t('status_revoked')}</option>
              <option value="superseded">{t('status_superseded')}</option>
            </select>
            {visibleCertificates.length > 0 && (
              <button
                type="button"
                disabled={bulkPdfLoading}
                onClick={() => void handleBulkPdf()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {bulkPdfLoading
                    ? t('loading')
                    : selectedCertIds.length > 0
                    ? `${t('bulkPrintPdfBtn')} (${selectedCertIds.length})`
                    : `${t('bulkPrintPdfBtn')} (${visibleCertificates.length})`}
                </span>
              </button>
            )}
          </div>
        )}

        {tab === 'queue' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={queueBatchFilter}
              onChange={(e) => {
                setQueueBatchFilter(e.target.value);
                setSelectedQueueIds([]);
              }}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">{t('filterAllBatches')}</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber} — {b.batchName || courseMap.get(b.courseId)?.titleEn || ''}
                </option>
              ))}
            </select>
            <select
              value={queueScope}
              onChange={(e) => setQueueScope(e.target.value as 'recommended' | 'all_active')}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="recommended">{t('queueScopeRecommended')}</option>
              <option value="all_active">{t('queueScopeAllActive')}</option>
            </select>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              title={t('certTemplateOverrideLabel')}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md max-w-[230px]"
            >
              <option value="">{t('autoResolveCertTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.orientation})
                </option>
              ))}
            </select>
            {queueBatchFilter && (
              <button
                type="button"
                disabled={issuing}
                onClick={() => void handleIssueBatch()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-700 text-white rounded-md hover:bg-sky-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{issuing ? 'Issuing...' : t('issueBatchCertsBtn')}</span>
              </button>
            )}
            {selectedQueueIds.length > 0 && (
              <button
                type="button"
                disabled={issuing}
                onClick={() => void handleIssue(selectedQueueIds)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Award className="w-3.5 h-3.5" />
                <span>
                  {issuing ? 'Issuing...' : `Issue Selected (${selectedQueueIds.length})`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {successMsg && (
        <div className="px-4 py-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {successMsg}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : tab === 'issued' ? (
        visibleCertificates.length === 0 ? (
          <EmptyState
            title={t('noRecords')}
            description="Issued certificates appear here once candidates satisfy attendance, exam, practical assessment, trainer recommendation, and officer completion approval requirements."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        visibleCertificates.length > 0 &&
                        selectedCertIds.length === visibleCertificates.length
                      }
                      onChange={(e) =>
                        setSelectedCertIds(
                          e.target.checked ? visibleCertificates.map((c) => c.id) : []
                        )
                      }
                    />
                  </th>
                  <th className="py-2.5 px-4 text-start">Certificate #</th>
                  <th className="py-2.5 px-4 text-start">Candidate</th>
                  <th className="py-2.5 px-4 text-start">Course / Batch</th>
                  <th className="py-2.5 px-4 text-start">Issue / Expiry</th>
                  <th className="py-2.5 px-4 text-start">{t('issuingOfficerCol')}</th>
                  <th className="py-2.5 px-4 text-start">Status</th>
                  <th className="py-2.5 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleCertificates.map((cert) => {
                  const effectiveStatus =
                    cert.status === 'valid' && cert.expiryDate && cert.expiryDate < today
                      ? 'expired'
                      : cert.status;
                  return (
                    <tr key={cert.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={selectedCertIds.includes(cert.id)}
                          onChange={(e) =>
                            setSelectedCertIds((prev) =>
                              e.target.checked
                                ? [...prev, cert.id]
                                : prev.filter((id) => id !== cert.id)
                            )
                          }
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">
                        <div>{cert.certificateNumber}</div>
                        {cert.supersededBy && (
                          <div className="text-[11px] text-amber-700">→ {cert.supersededBy}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <ProtectedImage
                            fileId={cert.snapshot.photoFileId}
                            alt={cert.snapshot.candidateNameEn}
                            fallbackText={cert.snapshot.candidateNameEn}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                            fallbackClassName="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-semibold shrink-0"
                          />
                          <div>
                            <div className="font-medium text-slate-900">
                              {cert.snapshot.candidateNameEn}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {cert.snapshot.candidateNameAr} •{' '}
                              <span className="font-mono-tabular">{cert.candidateId}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-slate-900">{cert.snapshot.courseTitleEn}</div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular">
                          {cert.snapshot.courseCode}
                          {cert.snapshot.batchNumber ? ` · ${cert.snapshot.batchNumber}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                        <div>Issued: {cert.issueDate}</div>
                        <div className="text-[11px] text-slate-500">
                          Comp: {cert.completionDate}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Expiry: {cert.expiryDate || 'No Expiry'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-600">
                        <div className="font-medium text-slate-800">
                          {cert.snapshot.issuedByName || cert.issuedBy}
                        </div>
                        <div className="text-slate-500 font-mono-tabular">
                          {cert.snapshot.templateName || 'Classic'} · v{cert.templateVersion || 1}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText status={effectiveStatus} />
                        {cert.revocationReason && (
                          <div
                            className="text-[11px] text-red-600 mt-0.5 max-w-[180px] truncate"
                            title={cert.revocationReason}
                          >
                            {cert.revocationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewCert(cert)}
                            title="Preview & Print Certificate PDF"
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadProtectedFile(
                                `/api/files/${encodeURIComponent(cert.pdfFileId)}`,
                                `${cert.certificateNumber}.pdf`
                              )
                            }
                            title="Download Certificate PDF"
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {canSendComms && cert.status === 'valid' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openShareModal(cert, 'email')}
                                title={t('sendEmail')}
                                className="p-1.5 text-slate-600 hover:text-sky-700 rounded hover:bg-sky-50"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openShareModal(cert, 'whatsapp')}
                                title={t('sendWhatsapp')}
                                className="p-1.5 text-slate-600 hover:text-emerald-700 rounded hover:bg-emerald-50"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {canIssueManage && cert.status === 'valid' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setReissueTarget(cert)}
                                title={t('reissue')}
                                className="p-1.5 text-slate-600 hover:text-amber-700 rounded hover:bg-amber-50"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRevokeTarget(cert)}
                                title={t('revoke')}
                                className="p-1.5 text-slate-600 hover:text-red-700 rounded hover:bg-red-50"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : queueEnrollments.length === 0 ? (
        <EmptyState
          title="No pending completions in issuance queue"
          description="Enrollments appear here once trainers submit completion recommendations or certificate officers approve completion in Examinations."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      queueEnrollments.some((e) => eligibilityMap[e.id]?.eligible) &&
                      selectedQueueIds.length ===
                        queueEnrollments.filter((e) => eligibilityMap[e.id]?.eligible).length
                    }
                    onChange={(e) => {
                      const eligibleIds = queueEnrollments
                        .filter((enr) => eligibilityMap[enr.id]?.eligible)
                        .map((enr) => enr.id);
                      setSelectedQueueIds(e.target.checked ? eligibleIds : []);
                    }}
                  />
                </th>
                <th className="py-2.5 px-4 text-start">Enrollment #</th>
                <th className="py-2.5 px-4 text-start">Candidate</th>
                <th className="py-2.5 px-4 text-start">Course / Batch</th>
                <th className="py-2.5 px-4 text-start">Attendance</th>
                <th className="py-2.5 px-4 text-start">{t('eligibilityBreakdownCol')}</th>
                <th className="py-2.5 px-4 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {queueEnrollments.map((enr) => {
                const cand = candMap.get(enr.candidateDocId);
                const crs = courseMap.get(enr.courseId);
                const bth = batchMap.get(enr.batchId);
                const elig = eligibilityMap[enr.id];
                const renderGate = (label: string, passed: boolean) => (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] ${
                      passed ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {passed ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    <span>{label}</span>
                  </span>
                );
                return (
                  <tr key={enr.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        disabled={!elig?.eligible}
                        checked={selectedQueueIds.includes(enr.id)}
                        onChange={(e) =>
                          setSelectedQueueIds((prev) =>
                            e.target.checked
                              ? [...prev, enr.id]
                              : prev.filter((id) => id !== enr.id)
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular font-semibold">
                      {enr.enrollmentNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <ProtectedImage
                          fileId={cand?.photoFileId}
                          alt={cand?.fullNameEn || enr.candidateId}
                          fallbackText={cand?.fullNameEn || enr.candidateId}
                          className="w-7 h-7 rounded-full object-cover border border-slate-200"
                          fallbackClassName="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-semibold shrink-0"
                        />
                        <div>
                          <div className="font-medium text-slate-900">
                            {cand?.fullNameEn || enr.candidateId}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular">
                            {enr.candidateId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div>{crs?.titleEn || enr.courseId}</div>
                      <div className="text-[11px] text-slate-500 font-mono-tabular">
                        {bth?.batchNumber || enr.batchId}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular">
                      {elig ? `${elig.attendancePct}% (min ${elig.minAttendancePct}%)` : 'Checking...'}
                    </td>
                    <td className="py-2.5 px-4">
                      {elig ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            {renderGate(t('eligRuleConfirmed'), elig.enrollmentConfirmed)}
                            {renderGate(t('eligRuleCompleted'), elig.trainingCompleted)}
                            {renderGate(t('eligRuleAttendance'), elig.attendanceMet)}
                            {renderGate(t('eligRuleExam'), elig.examPassed)}
                            {renderGate(t('eligRulePractical'), elig.practicalPassed)}
                            {renderGate(t('eligRuleApproved'), elig.completionApproved)}
                          </div>
                          {!elig.eligible && elig.reasons.length > 0 && (
                            <div className="text-[11px] text-amber-700">
                              {elig.reasons.join(' • ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={previewingQueueId === enr.id}
                          onClick={() => void handlePreviewQueuePdf(enr)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 bg-white text-slate-700 rounded hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            {previewingQueueId === enr.id
                              ? t('loading')
                              : t('previewBeforeIssueBtn')}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={!elig?.eligible || issuing}
                          onClick={() => void handleIssue([enr.id])}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-40"
                        >
                          <Award className="w-3 h-3" />
                          <span>Issue Certificate</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PdfPreviewModal
        fileId={previewCert?.pdfFileId || null}
        blobUrlOverride={previewBlobUrl}
        title={
          previewCert
            ? `${previewCert.certificateNumber} — ${previewCert.snapshot.candidateNameEn}`
            : previewBlobTitle
        }
        onClose={() => {
          setPreviewCert(null);
          if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
          setPreviewBlobTitle('');
        }}
      />

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title={revokeTarget ? `Revoke Certificate ${revokeTarget.certificateNumber}` : ''}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRevoke} className="space-y-4">
          <p className="text-xs text-slate-600">
            Revoking this certificate immediately updates both internal records and the public QR
            verification portal to Revoked status while preserving the historical certificate record.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Revocation Reason *
            </label>
            <textarea
              required
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Enter official reason for revocation..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setRevokeTarget(null)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-md"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Confirm Revocation
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(reissueTarget)}
        title="Reissue Certificate"
        message={
          reissueTarget
            ? `Reissuing ${reissueTarget.certificateNumber} will mark the previous certificate as Superseded and issue a new certificate number with a fresh verification QR token.`
            : ''
        }
        confirmLabel="Reissue Certificate"
        onConfirm={() => void handleReissueConfirm()}
        onCancel={() => setReissueTarget(null)}
      />

      <Modal
        open={Boolean(shareOpen)}
        onClose={() => setShareOpen(null)}
        title={
          shareOpen
            ? `${shareOpen.channel === 'email' ? t('sendEmail') : t('sendWhatsapp')} — ${shareOpen.cert.certificateNumber}`
            : ''
        }
        maxWidth="max-w-lg"
      >
        {shareOpen && (
          <form onSubmit={handleSendShare} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {shareOpen.channel === 'email'
                  ? 'Recipient Email *'
                  : 'Recipient WhatsApp Number *'}
              </label>
              <input
                required
                type={shareOpen.channel === 'email' ? 'email' : 'text'}
                value={shareTarget}
                onChange={(e) => setShareTarget(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
              <textarea
                rows={4}
                required
                value={shareMessage}
                onChange={(e) => setShareMessage(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            {manualWhatsappUrl && (
              <div className="p-3 border border-amber-200 bg-amber-50 rounded-md text-xs text-amber-900 space-y-2">
                <p>
                  WhatsApp Cloud API is not configured. Click below to send via WhatsApp Web/App:
                </p>
                <a
                  href={manualWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded font-medium hover:bg-emerald-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open WhatsApp Share</span>
                </a>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShareOpen(null)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
              >
                {sending
                  ? 'Sending...'
                  : shareOpen.channel === 'email'
                  ? 'Send Email with PDF'
                  : 'Send Message'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
