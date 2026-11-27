import React, { useEffect, useState } from 'react';
import { CalendarDays, Download, Eye, FileText, History, Users } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AuditLogItem, Batch, Course, Trainer } from '../../types/tcms';
import { ErrorAlert, Modal, PdfPreviewModal, StatusText } from '../ui/UiKit';
import { ProtectedImage } from '../ui/ProtectedImage';

interface VaultFileMeta {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface CourseHistoryBundle {
  course: Course;
  logs: AuditLogItem[];
  batches: Batch[];
  assignedTrainers: Trainer[];
}

interface CourseDetailsModalProps {
  course: Course | null;
  onClose: () => void;
}

export function CourseDetailsModal({ course, onClose }: CourseDetailsModalProps) {
  const { lang, t, formatDate, formatNumber } = useLanguage();
  const [bundle, setBundle] = useState<CourseHistoryBundle | null>(null);
  const [docMetaMap, setDocMetaMap] = useState<Record<string, VaultFileMeta>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ fileId: string; title: string } | null>(null);
  const [previewImg, setPreviewImg] = useState<{ fileId: string; title: string } | null>(null);

  useEffect(() => {
    if (!course) {
      setBundle(null);
      setDocMetaMap({});
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const hist = await apiFetch<CourseHistoryBundle>(`/api/courses/${course.id}/history`);
        if (!active) return;
        setBundle(hist);

        const docIds = hist.course.supportingDocIds || [];
        if (docIds.length > 0) {
          const metaRes = await apiFetch<{ files: VaultFileMeta[] }>('/api/files/meta-batch', {
            method: 'POST',
            body: JSON.stringify({ fileIds: docIds }),
          }).catch(() => ({ files: [] }));
          if (!active) return;
          const map: Record<string, VaultFileMeta> = {};
          for (const f of metaRes.files) map[f.fileId] = f;
          setDocMetaMap(map);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [course]);

  const c = bundle?.course || course;
  if (!c) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      <Modal
        open={Boolean(course)}
        onClose={onClose}
        title={`${c.courseCode} · ${lang === 'ar' ? c.titleAr : c.titleEn}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5 text-xs">
          <ErrorAlert message={error} onDismiss={() => setError(null)} />

          <div className="flex flex-col sm:flex-row gap-4 p-4 border border-slate-200 rounded-lg bg-slate-50/50">
            {c.imageFileId && (
              <ProtectedImage
                fileId={c.imageFileId}
                alt={c.titleEn}
                className="w-full sm:w-40 h-28 rounded-md object-cover border border-slate-200 bg-white"
              />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono-tabular text-slate-600">
                  <span className="font-semibold text-slate-900">{c.courseId}</span>
                  <span>·</span>
                  <span>{c.courseCode}</span>
                </div>
                <StatusText status={c.status} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{c.titleEn}</h4>
                <p className="text-xs text-slate-600 mt-0.5" dir="rtl">
                  {c.titleAr}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600 pt-1">
                <span>
                  {t('courseCategory')}: <strong className="text-slate-900">{c.category}</strong>
                </span>
                <span>
                  {t('courseType')}:{' '}
                  <strong className="text-slate-900">
                    {t(`courseType_${c.courseType || 'blended'}`)}
                  </strong>
                </span>
                <span>
                  {t('courseFeeSar')}:{' '}
                  <strong className="font-mono-tabular text-slate-900">
                    {formatNumber(c.fee || 0)} {t('sarCurrency')}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <span className="text-[11px] text-slate-500 block">{t('courseDuration')}</span>
              <span className="font-mono-tabular font-semibold text-slate-900 text-sm">
                {c.duration} {t(`unit_${c.durationUnit}`)}
              </span>
              <span className="block text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                {c.theoryHours ?? 0}h {t('theoryHours')} · {c.practicalHours ?? 0}h {t('practicalHours')}
              </span>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <span className="text-[11px] text-slate-500 block">{t('minAttendancePctLabel')}</span>
              <span className="font-mono-tabular font-semibold text-slate-900 text-sm">
                {c.minAttendancePct}%
              </span>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <span className="text-[11px] text-slate-500 block">{t('passingScore')}</span>
              <span className="font-mono-tabular font-semibold text-slate-900 text-sm">
                {c.examRequired ? `${c.minExamScore}%` : t('examRequiredNo')}
              </span>
            </div>
            <div className="p-3 border border-slate-200 rounded-md bg-white">
              <span className="text-[11px] text-slate-500 block">{t('certificateValidityPeriod')}</span>
              <span className="font-mono-tabular font-semibold text-slate-900 text-sm">
                {c.validityMonths ? `${c.validityMonths} ${t('moShort')}` : t('noExpiryLabel')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 border border-slate-200 rounded-md space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                {t('courseDescriptionEn')}
              </span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                {c.descriptionEn || '—'}
              </p>
            </div>
            <div className="p-3.5 border border-slate-200 rounded-md space-y-1.5" dir="rtl">
              <span className="text-[11px] font-semibold text-slate-500">
                {t('courseDescriptionAr')}
              </span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                {c.descriptionAr || '—'}
              </p>
            </div>
          </div>

          <div className="p-3.5 border border-slate-200 rounded-md">
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">
              {t('prerequisites')}
            </span>
            <p className="text-slate-800">{c.prerequisites || t('noPrerequisites')}</p>
          </div>

          {(c.supportingDocIds || []).length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>{t('supportingDocuments')}</span>
              </h4>
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                {(c.supportingDocIds || []).map((fid) => {
                  const meta = docMetaMap[fid];
                  const isPdf = meta?.mimeType === 'application/pdf';
                  const isImg = meta?.mimeType?.startsWith('image/');
                  return (
                    <div key={fid} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900 block truncate">
                          {meta?.fileName || fid}
                        </span>
                        {meta && (
                          <span className="text-[11px] text-slate-500 font-mono-tabular">
                            {meta.mimeType} · {formatBytes(meta.fileSize)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(isPdf || isImg) && (
                          <button
                            type="button"
                            onClick={() =>
                              isPdf
                                ? setPreviewPdf({ fileId: fid, title: meta?.fileName || fid })
                                : setPreviewImg({ fileId: fid, title: meta?.fileName || fid })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('previewFile')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void downloadProtectedFile(
                              `/api/files/${encodeURIComponent(fid)}`,
                              meta?.fileName || `${fid}.bin`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50"
                        >
                          <Download className="w-3 h-3" />
                          <span>{t('download')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-24 bg-slate-50 border border-slate-200 rounded-md animate-pulse" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('assignedTrainersForCourse')}</span>
                </h4>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {(bundle?.assignedTrainers || []).map((tr) => (
                    <div key={tr.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono-tabular font-semibold text-slate-700 me-2">
                          {tr.trainerId}
                        </span>
                        <span className="font-medium text-slate-900">
                          {lang === 'ar' ? tr.nameAr : tr.nameEn}
                        </span>
                      </div>
                      <StatusText status={tr.status} />
                    </div>
                  ))}
                  {(bundle?.assignedTrainers || []).length === 0 && (
                    <p className="p-3 text-slate-500">{t('noRecords')}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('scheduledBatchesForCourse')}</span>
                </h4>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {(bundle?.batches || []).map((b) => (
                    <div key={b.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono-tabular font-semibold text-slate-900 me-2">
                          {b.batchNumber}
                        </span>
                        <span className="font-mono-tabular text-slate-500">
                          {b.startDate} → {b.endDate}
                        </span>
                      </div>
                      <StatusText status={b.status} />
                    </div>
                  ))}
                  {(bundle?.batches || []).length === 0 && (
                    <p className="p-3 text-slate-500">{t('noBatchesAssigned')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('courseHistory')}</span>
            </h4>
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {(bundle?.logs || []).map((log) => (
                <div key={log.id} className="px-3 py-2 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-semibold text-slate-800">
                      {log.action}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-slate-500">
                      {log.createdAt ? formatDate(log.createdAt) : '—'}
                    </span>
                  </div>
                  <p className="text-slate-600">{log.details}</p>
                  <p className="text-[11px] text-slate-400">{log.actorEmail}</p>
                </div>
              ))}
              {(bundle?.logs || []).length === 0 && !loading && (
                <p className="p-3 text-slate-500">{t('noAuditHistory')}</p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <PdfPreviewModal
        fileId={previewPdf?.fileId || null}
        title={previewPdf?.title || ''}
        onClose={() => setPreviewPdf(null)}
      />

      <Modal
        open={Boolean(previewImg)}
        onClose={() => setPreviewImg(null)}
        title={previewImg?.title || ''}
        maxWidth="max-w-2xl"
      >
        {previewImg && (
          <div className="flex justify-center bg-slate-50 border border-slate-200 rounded-md p-3">
            <ProtectedImage
              fileId={previewImg.fileId}
              alt={previewImg.title}
              className="max-h-[70vh] w-auto object-contain rounded"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
