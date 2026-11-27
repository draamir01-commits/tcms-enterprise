import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Printer,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
} from 'lucide-react';
import { auth } from '../../firebase';
import { useLanguage } from '../../contexts/LanguageContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  zoom: number;
  rotation: number;
  onVisible?: (pageNumber: number) => void;
  setPageRef: (pageNumber: number, el: HTMLDivElement | null) => void;
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoom,
  rotation,
  onVisible,
  setPageRef,
}: PdfPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !onVisible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
            onVisible(pageNumber);
          }
        }
      },
      { threshold: [0.45] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    (async () => {
      try {
        setRendering(true);
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1, rotation });
        const availableWidth = Math.max(260, containerWidth - 32);
        const fitScale = Math.min(2.2, availableWidth / baseViewport.width);
        const cssScale = Math.max(0.4, fitScale * zoom);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        const cssViewport = page.getViewport({ scale: cssScale, rotation });
        const renderViewport = page.getViewport({ scale: cssScale * dpr, rotation });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
          canvas,
        });
        await renderTask.promise;
        if (!cancelled) setRendering(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!cancelled && !msg.toLowerCase().includes('cancelled')) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, containerWidth, zoom, rotation]);

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        setPageRef(pageNumber, el);
      }}
      className="relative mx-auto bg-white shadow-md border border-slate-300/80 rounded-sm overflow-hidden transition-all"
      style={{ width: 'fit-content' }}
    >
      <canvas ref={canvasRef} className="block bg-white" />
      {rendering && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-xs text-slate-500">
          Rendering page {pageNumber}...
        </div>
      )}
    </div>
  );
}

export function PdfPreviewModal({
  fileId,
  blobUrlOverride,
  title,
  onClose,
}: {
  fileId: string | null;
  blobUrlOverride?: string | null;
  title: string;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const isOpen = Boolean(fileId || blobUrlOverride);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [containerWidth, setContainerWidth] = useState(760);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el);
    else pageRefs.current.delete(pageNum);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth || 760);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, pdfDoc]);

  useEffect(() => {
    if (!isOpen) {
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setZoom(1);
      setRotation(0);
      setImagePreviewUrl(null);
      setErr(null);
      return;
    }

    let active = true;
    let ownedObjectUrl: string | null = null;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    (async () => {
      setLoading(true);
      setErr(null);
      setPdfDoc(null);
      setImagePreviewUrl(null);
      setNumPages(0);
      setCurrentPage(1);

      try {
        let buffer: ArrayBuffer;
        let mime = 'application/pdf';

        if (blobUrlOverride) {
          const res = await fetch(blobUrlOverride);
          if (!res.ok) throw new Error(t('failedToLoadDocument'));
          const blob = await res.blob();
          mime = blob.type || 'application/pdf';
          buffer = await blob.arrayBuffer();
          if (active) setDownloadUrl(blobUrlOverride);
        } else if (fileId) {
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(t('failedToLoadDocument'));
          const blob = await res.blob();
          mime = res.headers.get('content-type') || blob.type || 'application/pdf';
          buffer = await blob.arrayBuffer();
          ownedObjectUrl = URL.createObjectURL(new Blob([buffer], { type: mime }));
          if (active) setDownloadUrl(ownedObjectUrl);
        } else {
          return;
        }

        if (!active) return;

        if (mime.startsWith('image/')) {
          const imgUrl = ownedObjectUrl || blobUrlOverride || null;
          setImagePreviewUrl(imgUrl);
          setLoading(false);
          return;
        }

        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          useWorkerFetch: false,
        });
        const loadedDoc = await loadingTask.promise;
        if (!active) {
          await loadingTask.destroy();
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setLoading(false);
      } catch (e) {
        if (active) {
          setErr(e instanceof Error ? e.message : t('failedToLoadDocument'));
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (ownedObjectUrl) URL.revokeObjectURL(ownedObjectUrl);
      if (loadingTask) {
        void loadingTask.destroy().catch(() => {});
      }
    };
  }, [isOpen, fileId, blobUrlOverride, t]);

  const jumpToPage = (pageNum: number) => {
    const target = Math.max(1, Math.min(numPages, pageNum));
    setCurrentPage(target);
    const el = pageRefs.current.get(target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePrint = async () => {
    if (imagePreviewUrl) {
      const printRoot = document.createElement('div');
      printRoot.id = 'tcms-pdf-print-portal';
      const img = document.createElement('img');
      img.src = imagePreviewUrl;
      img.alt = title;
      printRoot.appendChild(img);
      document.body.appendChild(printRoot);
      const cleanup = () => {
        printRoot.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => window.print(), 60);
      return;
    }

    if (!pdfDoc || printing) return;
    setPrinting(true);
    try {
      const printRoot = document.createElement('div');
      printRoot.id = 'tcms-pdf-print-portal';

      for (let i = 1; i <= pdfDoc.numPages; i += 1) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 2, rotation });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          const img = document.createElement('img');
          img.src = canvas.toDataURL('image/png');
          img.alt = `${title} - Page ${i}`;
          printRoot.appendChild(img);
        }
      }

      document.body.appendChild(printRoot);
      const cleanup = () => {
        printRoot.remove();
        setPrinting(false);
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          if (document.body.contains(printRoot)) cleanup();
        }, 1500);
      }, 80);
    } catch {
      setPrinting(false);
    }
  };

  if (!isOpen) return null;

  const safeFilename = `${(title || 'document').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')}.pdf`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl h-[90vh] max-h-[900px] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-sky-400 shrink-0" />
            <h3 className="text-sm font-semibold truncate">{title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {pdfDoc && numPages > 0 && (
              <>
                <div className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-xs">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => jumpToPage(currentPage - 1)}
                    className="p-0.5 text-slate-300 hover:text-white disabled:opacity-35"
                    aria-label={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                  <span className="font-mono-tabular px-1.5 text-[11px] text-slate-200 whitespace-nowrap">
                    {currentPage} / {numPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= numPages}
                    onClick={() => jumpToPage(currentPage + 1)}
                    className="p-0.5 text-slate-300 hover:text-white disabled:opacity-35"
                    aria-label={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
                  >
                    <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                </div>

                <div className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
                    className="p-0.5 text-slate-300 hover:text-white"
                    title={lang === 'ar' ? 'تصغير' : 'Zoom out'}
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono-tabular px-1 text-[11px] text-slate-200 min-w-[42px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
                    className="p-0.5 text-slate-300 hover:text-white"
                    title={lang === 'ar' ? 'تكبير' : 'Zoom in'}
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="p-0.5 text-slate-300 hover:text-white"
                    title={lang === 'ar' ? 'ملاءمة العرض' : 'Fit width'}
                    aria-label="Fit width"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-md"
                  title={lang === 'ar' ? 'تدوير' : 'Rotate 90°'}
                  aria-label="Rotate"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {(pdfDoc || imagePreviewUrl) && (
              <button
                type="button"
                disabled={printing}
                onClick={() => void handlePrint()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 text-slate-100 rounded-md hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{printing ? '...' : t('printPdf')}</span>
              </button>
            )}

            {downloadUrl && (
              <a
                href={downloadUrl}
                download={safeFilename}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-md hover:bg-sky-400 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('downloadPdf')}</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md"
              aria-label={t('close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Document Viewport */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-y-auto overflow-x-auto bg-slate-200/85 p-3 sm:p-5 space-y-4"
        >
          {err && (
            <div className="max-w-lg mx-auto mt-10 p-4 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 text-center">
              {err}
            </div>
          )}

          {loading && !err && (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3 text-slate-600 text-xs">
              <div className="w-7 h-7 rounded-full border-2 border-slate-400 border-t-slate-900 animate-spin" />
              <span>{t('loadingDocument')}</span>
            </div>
          )}

          {imagePreviewUrl && !loading && !err && (
            <div className="flex justify-center">
              <img
                src={imagePreviewUrl}
                alt={title}
                className="max-w-full h-auto rounded shadow-md bg-white border border-slate-300"
              />
            </div>
          )}

          {pdfDoc &&
            !loading &&
            !err &&
            Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
              <PdfPageCanvas
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                containerWidth={containerWidth}
                zoom={zoom}
                rotation={rotation}
                onVisible={setCurrentPage}
                setPageRef={setPageRef}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
