import React, { useEffect, useRef } from 'react';
import { X, AlertCircle, CheckCircle2, Clock, Ban, Search, Info, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
export { PdfPreviewModal } from './PdfViewerModal';

export function Modal({
  open,
  onClose,
  title,
  maxWidth = 'max-w-2xl',
  closeOnBackdropClick = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  closeOnBackdropClick?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const mouseDownOnBackdropRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === 'SELECT' ||
          (activeEl instanceof HTMLInputElement &&
            (activeEl.hasAttribute('list') || activeEl.type === 'date')))
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const startedOnBackdrop = mouseDownOnBackdropRef.current;
        mouseDownOnBackdropRef.current = false;
        if (closeOnBackdropClick && startedOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-auto`}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 shrink-0"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 sm:p-6 max-h-[82vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function StatusText({ status }: { status: string }) {
  const { t } = useLanguage();
  const s = (status || '').toLowerCase();
  const translated = t(`status_${s}`);
  const display = translated !== `status_${s}` ? translated : s.replace(/_/g, ' ') || '—';

  if (['active', 'confirmed', 'completed', 'valid', 'pass', 'present', 'sent', 'delivered', 'claimed', 'approved'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{display}</span>
      </span>
    );
  }
  if (['pending', 'queued', 'pending_review', 'info_requested', 'scheduled', 'in_progress', 'late', 'excused', 'manual_initiated', 'superseded', 'completed_with_errors'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{display}</span>
      </span>
    );
  }
  if (['revoked', 'rejected', 'failed', 'retry_required', 'fail', 'absent', 'cancelled', 'expired', 'suspended', 'invalid', 'duplicate', 'withdrawn', 'inactive'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <Ban className="w-3.5 h-3.5 shrink-0" />
        <span>{display}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <span>{display}</span>
    </span>
  );
}

export function ErrorAlert({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  const { t } = useLanguage();
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 px-4 py-3 border border-red-200 bg-red-50/70 rounded-md text-sm text-red-800"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-500 hover:text-red-700 shrink-0"
          aria-label={t('close')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function NotificationBanner({
  variant = 'info',
  message,
  onDismiss,
}: {
  variant?: 'success' | 'info' | 'warning' | 'error';
  message: string | null;
  onDismiss?: () => void;
}) {
  const { t } = useLanguage();
  if (!message) return null;

  const styles: Record<typeof variant, { box: string; icon: React.ReactNode }> = {
    success: {
      box: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
      icon: <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />,
    },
    info: {
      box: 'border-sky-200 bg-sky-50/80 text-sky-900',
      icon: <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-600" />,
    },
    warning: {
      box: 'border-amber-200 bg-amber-50/80 text-amber-900',
      icon: <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />,
    },
    error: {
      box: 'border-red-200 bg-red-50/80 text-red-900',
      icon: <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />,
    },
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start justify-between gap-3 px-4 py-3 border rounded-md text-xs sm:text-sm ${styles[variant].box}`}
    >
      <div className="flex items-start gap-2.5">
        {styles[variant].icon}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-70 hover:opacity-100 shrink-0"
          aria-label={t('close')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function SuccessAlert({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  return <NotificationBanner variant="success" message={message} onDismiss={onDismiss} />;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="border border-slate-200 bg-white rounded-lg py-12 px-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-4 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

export function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600 ms-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-slate-500">{hint}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

export function TextInput({
  className = '',
  hasError = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-xs bg-white border rounded-md focus:outline-none transition-colors ${
        hasError
          ? 'border-red-300 focus:border-red-500'
          : 'border-slate-200 focus:border-slate-400'
      } ${className}`}
    />
  );
}

export function SelectInput({
  className = '',
  hasError = false,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 text-xs bg-white border rounded-md focus:outline-none transition-colors ${
        hasError
          ? 'border-red-300 focus:border-red-500'
          : 'border-slate-200 focus:border-slate-400'
      } ${className}`}
    >
      {children}
    </select>
  );
}

export function TextArea({
  className = '',
  hasError = false,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 text-xs bg-white border rounded-md focus:outline-none transition-colors ${
        hasError
          ? 'border-red-300 focus:border-red-500'
          : 'border-slate-200 focus:border-slate-400'
      } ${className}`}
    />
  );
}

export function SearchFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onReset,
  actions,
}: {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  onReset?: () => void;
  actions?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[220px]">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder || t('searchPlaceholder')}
              className="w-full ps-9 pe-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
            />
          </div>
        )}
        {filters}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-600 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            {t('reset')}
          </button>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'start' | 'end';
  className?: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
  const { t } = useLanguage();

  if (loading) {
    return <TableSkeleton rows={5} cols={Math.max(4, columns.length)} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle || t('noRecords')}
        description={emptyDescription || ''}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-start border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 px-4 whitespace-nowrap ${col.align === 'end' ? 'text-end' : 'text-start'} ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50/70">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2.5 px-4 ${col.align === 'end' ? 'text-end' : 'text-start'} ${col.className || ''}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 text-xs font-medium text-white rounded-md whitespace-nowrap ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {confirmLabel || t('confirm')}
        </button>
      </div>
    </Modal>
  );
}
