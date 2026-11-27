import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Download,
  Eye,
  Mail,
  MessageCircle,
  RefreshCw,
  History,
  ExternalLink,
  Printer,
  Plus,
  Layers,
} from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type {
  Batch,
  Candidate,
  CardTemplate,
  Course,
  Enrollment,
  TrainingCard,
} from '../types/tcms';
import {
  EmptyState,
  ErrorAlert,
  Modal,
  PdfPreviewModal,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';

export function TrainingCardsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const [cards, setCards] = useState<TrainingCard[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'superseded' | 'revoked'>('active');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewCard, setPreviewCard] = useState<TrainingCard | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [historyCard, setHistoryCard] = useState<TrainingCard | null>(null);

  // Single & Batch generation modals
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [genEnrollmentId, setGenEnrollmentId] = useState('');
  const [genTemplateId, setGenTemplateId] = useState('');
  const [generatingSingle, setGeneratingSingle] = useState(false);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchGenId, setBatchGenId] = useState('');
  const [batchGenMode, setBatchGenMode] = useState<'missing_only' | 'regenerate_all'>('missing_only');
  const [batchTemplateId, setBatchTemplateId] = useState('');
  const [generatingBatch, setGeneratingBatch] = useState(false);

  const [shareOpen, setShareOpen] = useState<{ card: TrainingCard; channel: 'email' | 'whatsapp' } | null>(null);
  const [shareTarget, setShareTarget] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [manualWhatsappUrl, setManualWhatsappUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = isTenantAdminRole(profile?.role);
  const canSendComms =
    isTenantAdminRole(profile?.role) || profile?.role === 'certificate_officer';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cardsRes, candRes, enrRes, batchRes, crsRes, tplRes] = await Promise.all([
        apiFetch<{ trainingCards: TrainingCard[] }>('/api/training-cards'),
        apiFetch<{ candidates: Candidate[] }>('/api/candidates').catch(() => ({ candidates: [] })),
        apiFetch<{ enrollments: Enrollment[] }>('/api/enrollments').catch(() => ({ enrollments: [] })),
        apiFetch<{ batches: Batch[] }>('/api/batches').catch(() => ({ batches: [] })),
        apiFetch<{ courses: Course[] }>('/api/courses').catch(() => ({ courses: [] })),
        apiFetch<{ templates: CardTemplate[] }>('/api/templates/cards').catch(() => ({ templates: [] })),
      ]);
      setCards(
        cardsRes.trainingCards.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
      setCandidates(candRes.candidates);
      setEnrollments(enrRes.enrollments);
      setBatches(batchRes.batches);
      setCourses(crsRes.courses);
      setTemplates(tplRes.templates.filter((tpl) => tpl.isActive !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const visibleCards = cards.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.cardSerialNumber.toLowerCase().includes(q) ||
      c.candidateId.toLowerCase().includes(q) ||
      c.snapshot.candidateNameEn.toLowerCase().includes(q) ||
      c.snapshot.candidateNameAr.toLowerCase().includes(q) ||
      c.snapshot.courseTitleEn.toLowerCase().includes(q) ||
      c.snapshot.batchNumber.toLowerCase().includes(q)
    );
  });

  const eligibleEnrollments = enrollments.filter((e) =>
    ['confirmed', 'in_progress', 'completed'].includes(e.status)
  );
  const activeEnrollmentIds = new Set(cards.filter((c) => c.status === 'active').map((c) => c.enrollmentId));
  const enrollmentsWithoutActiveCard = eligibleEnrollments.filter((e) => !activeEnrollmentIds.has(e.id));

  const handleDirectPrint = async (card: TrainingCard) => {
    setBusyId(card.id);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/files/${encodeURIComponent(card.pdfFileId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t('failedToLoadDocument'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } finally {
            setTimeout(() => {
              URL.revokeObjectURL(url);
              iframe.remove();
            }, 60_000);
          }
        }, 250);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (card: TrainingCard) => {
    setBusyId(card.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{ card: TrainingCard }>(
        `/api/training-cards/${encodeURIComponent(card.enrollmentId)}/regenerate`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setSuccessMsg(
        lang === 'ar'
          ? `تم إعادة إنشاء البطاقة ${res.card.cardSerialNumber} (الإصدار ${res.card.version})`
          : `Regenerated Training Card ${res.card.cardSerialNumber} (v${res.card.version})`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genEnrollmentId) return;
    setGeneratingSingle(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const hasExisting = activeEnrollmentIds.has(genEnrollmentId);
      const res = await apiFetch<{ card: TrainingCard }>('/api/training-cards/generate', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: genEnrollmentId,
          ...(genTemplateId ? { templateId: genTemplateId } : {}),
          regenerateIfExists: hasExisting,
        }),
      });
      setSingleModalOpen(false);
      setSuccessMsg(
        lang === 'ar'
          ? `تم إصدار البطاقة ${res.card.cardSerialNumber} بنجاح.`
          : `Generated Training Card ${res.card.cardSerialNumber} (v${res.card.version}).`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingSingle(false);
    }
  };

  const handlePreviewBeforeGenerate = async () => {
    if (!genEnrollmentId) return;
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/templates/cards/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enrollmentId: genEnrollmentId,
          ...(genTemplateId ? { templateId: genTemplateId } : {}),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Preview generation failed');
      }
      const blob = await res.blob();
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchGenId) return;
    setGeneratingBatch(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<{
        totalEligible: number;
        generatedCount: number;
        skippedCount: number;
        errors: string[];
      }>(`/api/training-cards/batch/${encodeURIComponent(batchGenId)}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          mode: batchGenMode,
          ...(batchTemplateId ? { templateId: batchTemplateId } : {}),
        }),
      });
      setBatchModalOpen(false);
      setSuccessMsg(
        lang === 'ar'
          ? `تم إصدار ${res.generatedCount} بطاقة (تم تخطي ${res.skippedCount}).`
          : `Batch generation completed: ${res.generatedCount} generated, ${res.skippedCount} skipped.`
      );
      if (res.errors?.length) {
        setError(res.errors.join(' · '));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleBulkPdf = async () => {
    if (selectedIds.length === 0) return;
    setError(null);
    try {
      await downloadProtectedFile('/api/training-cards/bulk-pdf', 'training_cards_bulk.pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: selectedIds }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openShareModal = (card: TrainingCard, channel: 'email' | 'whatsapp') => {
    const cand = candMap.get(card.candidateDocId);
    setManualWhatsappUrl(null);
    setShareTarget(channel === 'email' ? cand?.email || '' : cand?.mobile || '');
    setShareMessage(
      `Training Card ${card.cardSerialNumber} for ${card.snapshot.candidateNameEn} (${card.snapshot.courseTitleEn}, Batch ${card.snapshot.batchNumber}, ${card.snapshot.startDate} to ${card.snapshot.endDate}).`
    );
    setShareOpen({ card, channel });
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
            subject: `Training Card ${shareOpen.card.cardSerialNumber} — ${shareOpen.card.snapshot.courseTitleEn}`,
            message: shareMessage,
            messageType: 'training_card_delivery',
            entityId: shareOpen.card.cardSerialNumber,
            candidateDocId: shareOpen.card.candidateDocId,
            candidateId: shareOpen.card.candidateId,
            enrollmentId: shareOpen.card.enrollmentId,
            trainingCardId: shareOpen.card.id,
            organizationId: shareOpen.card.organizationId,
            attachmentFileId: shareOpen.card.pdfFileId,
          }),
        });
        if (!res.ok) {
          setError(res.error || 'Email provider not configured; logged attempt in Delivery Logs.');
        } else {
          setSuccessMsg(`Training Card email dispatched to ${shareTarget} (${res.deliveryStatus || 'sent'}).`);
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
              messageType: 'training_card_delivery',
              entityId: shareOpen.card.cardSerialNumber,
              candidateDocId: shareOpen.card.candidateDocId,
              candidateId: shareOpen.card.candidateId,
              enrollmentId: shareOpen.card.enrollmentId,
              trainingCardId: shareOpen.card.id,
              organizationId: shareOpen.card.organizationId,
              attachmentFileId: shareOpen.card.pdfFileId,
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

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? visibleCards.map((c) => c.id) : []);
  };

  const versionHistoryFor = (enrollmentId: string) =>
    cards
      .filter((c) => c.enrollmentId === enrollmentId)
      .sort((a, b) => (b.version || 1) - (a.version || 1));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث برقم البطاقة، المتدرب، الدورة...' : 'Search serial #, candidate, course, batch...'}
            className="w-64 px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
          >
            <option value="active">{lang === 'ar' ? 'البطاقات النشطة' : 'Active Cards'}</option>
            <option value="superseded">{lang === 'ar' ? 'النسخ المستبدلة' : 'Superseded Versions'}</option>
            <option value="revoked">{lang === 'ar' ? 'الملغاة' : 'Revoked'}</option>
            <option value="all">{t('all')}</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkPdf()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {lang === 'ar'
                  ? `تنزيل PDF مجمع (${selectedIds.length})`
                  : `Download Bulk PDF (${selectedIds.length})`}
              </span>
            </button>
          )}
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => {
                  setGenEnrollmentId(
                    enrollmentsWithoutActiveCard[0]?.id || eligibleEnrollments[0]?.id || ''
                  );
                  setGenTemplateId('');
                  setSingleModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('generateSingleCard')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBatchGenId(batches[0]?.id || '');
                  setBatchGenMode('missing_only');
                  setBatchTemplateId('');
                  setBatchModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('generateBatchCards')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 py-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
        {t('historicalTemplateNotice')}
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />
      {successMsg && (
        <div className="px-4 py-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {successMsg}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : visibleCards.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description="Training Cards are automatically generated as bilingual front-and-back PDFs when enrollments are confirmed."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start w-10">
                  <input
                    type="checkbox"
                    checked={visibleCards.length > 0 && selectedIds.length === visibleCards.length}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="Select all cards"
                  />
                </th>
                <th className="py-2.5 px-4 text-start">Card Serial</th>
                <th className="py-2.5 px-4 text-start">Candidate</th>
                <th className="py-2.5 px-4 text-start">Course & Batch</th>
                <th className="py-2.5 px-4 text-start">Training Dates</th>
                <th className="py-2.5 px-4 text-start">Template / Ver</th>
                <th className="py-2.5 px-4 text-start">Status</th>
                <th className="py-2.5 px-4 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleCards.map((card) => (
                <tr key={card.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(card.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, card.id] : prev.filter((id) => id !== card.id)
                        )
                      }
                      aria-label={`Select ${card.cardSerialNumber}`}
                    />
                  </td>
                  <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{card.cardSerialNumber}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{card.snapshot.candidateNameEn}</div>
                    <div className="text-[11px] text-slate-500">
                      {card.snapshot.candidateNameAr} • <span className="font-mono-tabular">{card.candidateId}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="text-slate-900">{card.snapshot.courseTitleEn}</div>
                    <div className="text-[11px] text-slate-500 font-mono-tabular">
                      {card.snapshot.courseCode} • {card.snapshot.batchNumber}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono-tabular text-slate-600 whitespace-nowrap">
                    {card.snapshot.startDate} → {card.snapshot.endDate}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-mono-tabular text-slate-800 font-medium">Card v{card.version}</div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                      {card.templateName || 'Default'} (T-v{card.templateVersion || 1})
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusText status={card.status} />
                  </td>
                  <td className="py-2.5 px-4 text-end whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewCard(card)}
                        title="Preview PDF (Front & Back)"
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === card.id}
                        onClick={() => void handleDirectPrint(card)}
                        title={t('printPdf')}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 disabled:opacity-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(
                            `/api/files/${encodeURIComponent(card.pdfFileId)}`,
                            `${card.cardSerialNumber}.pdf`
                          )
                        }
                        title="Download PDF"
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryCard(card)}
                        title="Version History"
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {canSendComms && (
                        <>
                          <button
                            type="button"
                            onClick={() => openShareModal(card, 'email')}
                            title={t('sendEmail')}
                            className="p-1.5 text-slate-600 hover:text-sky-700 rounded hover:bg-sky-50"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openShareModal(card, 'whatsapp')}
                            title={t('sendWhatsapp')}
                            className="p-1.5 text-slate-600 hover:text-emerald-700 rounded hover:bg-emerald-50"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {canManage && card.status === 'active' && (
                        <button
                          type="button"
                          disabled={busyId === card.id}
                          onClick={() => void handleRegenerate(card)}
                          title={t('regenerate')}
                          className="p-1.5 text-slate-600 hover:text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${busyId === card.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Single Card Generation Modal */}
      <Modal
        open={singleModalOpen}
        onClose={() => setSingleModalOpen(false)}
        title={t('generateSingleCard')}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleGenerateSingle} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('selectEnrollmentLabel')} *
            </label>
            <select
              required
              value={genEnrollmentId}
              onChange={(e) => setGenEnrollmentId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="">Select Enrollment...</option>
              {eligibleEnrollments.map((enr) => {
                const cand = candMap.get(enr.candidateDocId);
                const crs = courseMap.get(enr.courseId);
                const bth = batchMap.get(enr.batchId);
                const hasCard = activeEnrollmentIds.has(enr.id);
                return (
                  <option key={enr.id} value={enr.id}>
                    {enr.enrollmentNumber} — {cand?.fullNameEn || enr.candidateId} ({crs?.courseCode || ''} / {bth?.batchNumber || ''}) {hasCard ? '[Has Active Card -> Regenerate]' : '[Missing Card]'}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('selectTemplateOptional')}
            </label>
            <select
              value={genTemplateId}
              onChange={(e) => setGenTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="">{t('autoResolveTemplateOption')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} (v{tpl.version}, {tpl.scope})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={!genEnrollmentId}
              onClick={() => void handlePreviewBeforeGenerate()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t('previewBeforeGenerate')}</span>
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSingleModalOpen(false)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={generatingSingle || !genEnrollmentId}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
              >
                {generatingSingle ? '...' : t('generateCardNow')}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Batch Card Generation Modal */}
      <Modal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title={t('generateBatchCards')}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleGenerateBatch} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('selectBatchLabel')} *
            </label>
            <select
              required
              value={batchGenId}
              onChange={(e) => setBatchGenId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="">Select Batch...</option>
              {batches.map((b) => {
                const crs = courseMap.get(b.courseId);
                return (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} — {b.batchName || crs?.titleEn || b.venue} ({crs?.courseCode || ''})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="radio"
                name="batchGenMode"
                checked={batchGenMode === 'missing_only'}
                onChange={() => setBatchGenMode('missing_only')}
              />
              <span>{t('batchGenModeMissing')}</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="radio"
                name="batchGenMode"
                checked={batchGenMode === 'regenerate_all'}
                onChange={() => setBatchGenMode('regenerate_all')}
              />
              <span>{t('batchGenModeRegenerateAll')}</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {t('selectTemplateOptional')}
            </label>
            <select
              value={batchTemplateId}
              onChange={(e) => setBatchTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="">{t('autoResolveTemplateOption')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} (v{tpl.version}, {tpl.scope})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setBatchModalOpen(false)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-md"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={generatingBatch || !batchGenId}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md disabled:opacity-50"
            >
              {generatingBatch ? '...' : t('generateBatchNow')}
            </button>
          </div>
        </form>
      </Modal>

      <PdfPreviewModal
        fileId={previewCard?.pdfFileId || null}
        blobUrlOverride={previewBlobUrl}
        title={
          previewCard
            ? `${previewCard.cardSerialNumber} — ${previewCard.snapshot.candidateNameEn}`
            : 'Training Card Preview'
        }
        onClose={() => {
          setPreviewCard(null);
          if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(null);
          }
        }}
      />

      <Modal
        open={Boolean(historyCard)}
        onClose={() => setHistoryCard(null)}
        title={historyCard ? `Card Version History — ${historyCard.snapshot.candidateNameEn}` : ''}
      >
        {historyCard && (
          <div className="space-y-3">
            {versionHistoryFor(historyCard.enrollmentId).map((ver) => (
              <div
                key={ver.id}
                className="flex items-center justify-between gap-4 p-3 border border-slate-200 rounded-md text-xs"
              >
                <div>
                  <div className="font-mono-tabular font-semibold text-slate-900">
                    {ver.cardSerialNumber} (v{ver.version})
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Template: {ver.templateName || 'Default'} (v{ver.templateVersion || 1})
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-tabular">
                    Generated: {(ver.createdAt || '').slice(0, 19).replace('T', ' ')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusText status={ver.status} />
                  <button
                    type="button"
                    onClick={() => setPreviewCard(ver)}
                    className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(shareOpen)}
        onClose={() => setShareOpen(null)}
        title={
          shareOpen
            ? `${shareOpen.channel === 'email' ? t('sendEmail') : t('sendWhatsapp')} — ${shareOpen.card.cardSerialNumber}`
            : ''
        }
        maxWidth="max-w-lg"
      >
        {shareOpen && (
          <form onSubmit={handleSendShare} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {shareOpen.channel === 'email' ? 'Recipient Email *' : 'Recipient WhatsApp Number (with country code) *'}
              </label>
              <input
                required
                type={shareOpen.channel === 'email' ? 'email' : 'text'}
                value={shareTarget}
                onChange={(e) => setShareTarget(e.target.value)}
                placeholder={shareOpen.channel === 'email' ? 'candidate@company.com' : '+9665XXXXXXXX'}
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
                <p>WhatsApp Cloud API is not configured. Use the official WhatsApp Web/App link below to send manually:</p>
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
                {sending ? 'Sending...' : shareOpen.channel === 'email' ? 'Send with PDF Attachment' : 'Send Message'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
