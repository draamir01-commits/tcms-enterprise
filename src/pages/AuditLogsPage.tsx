import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantOwnerRole } from '../lib/permissions';
import type { AuditLogItem, DeliveryLogItem, VerificationLogItem } from '../types/tcms';
import { EmptyState, ErrorAlert, StatusText, TableSkeleton } from '../components/ui/UiKit';

export function AuditLogsPage() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<'audit' | 'verification' | 'delivery'>('audit');
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLogItem[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLogItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = isTenantOwnerRole(profile?.role);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        auditLogs: AuditLogItem[];
        verificationLogs: VerificationLogItem[];
        deliveryLogs: DeliveryLogItem[];
      }>('/api/audit-logs');
      setAuditLogs(res.auditLogs);
      setVerificationLogs(res.verificationLogs);
      setDeliveryLogs(res.deliveryLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const q = search.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'audit' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            System Audit Trail ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('verification')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'verification' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Verification Logs ({verificationLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('delivery')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md ${
              tab === 'delivery' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Email & WhatsApp Logs ({deliveryLogs.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="w-56 px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
          />
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() =>
                void downloadProtectedFile(
                  '/api/system/backup',
                  `tcms_backup_${new Date().toISOString().slice(0, 10)}.json`
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON Backup</span>
            </button>
          )}
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : tab === 'audit' ? (
        auditLogs.length === 0 ? (
          <EmptyState title={t('noRecords')} description="All administrative and sensitive actions are logged immutably." />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-start">Timestamp</th>
                  <th className="py-2.5 px-4 text-start">Actor</th>
                  <th className="py-2.5 px-4 text-start">Action</th>
                  <th className="py-2.5 px-4 text-start">Entity</th>
                  <th className="py-2.5 px-4 text-start">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs
                  .filter(
                    (l) =>
                      !q ||
                      l.action.toLowerCase().includes(q) ||
                      (l.actorEmail || '').toLowerCase().includes(q) ||
                      (l.details || '').toLowerCase().includes(q)
                  )
                  .map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap text-slate-500">
                        {(l.createdAt || '').slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-slate-900">{l.actorEmail || l.actorUid}</div>
                        <div className="text-[11px] text-slate-400">{l.actorRole}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold text-slate-900">{l.action}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-600">
                        {l.entityType}:{l.entityId}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 max-w-md truncate" title={l.details}>
                        {l.details}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'verification' ? (
        verificationLogs.length === 0 ? (
          <EmptyState title={t('noRecords')} description="Public and internal certificate verification queries are recorded here." />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-start">Timestamp</th>
                  <th className="py-2.5 px-4 text-start">Mode</th>
                  <th className="py-2.5 px-4 text-start">Query</th>
                  <th className="py-2.5 px-4 text-start">Certificate #</th>
                  <th className="py-2.5 px-4 text-start">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {verificationLogs
                  .filter((v) => !q || v.query.toLowerCase().includes(q) || (v.certificateNumber || '').toLowerCase().includes(q))
                  .map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-500">
                        {(v.createdAt || '').slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-4 capitalize">{v.mode}</td>
                      <td className="py-2.5 px-4 font-mono-tabular">{v.query}</td>
                      <td className="py-2.5 px-4 font-mono-tabular">{v.certificateNumber || '—'}</td>
                      <td className="py-2.5 px-4">
                        <StatusText status={v.resultStatus} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      ) : deliveryLogs.length === 0 ? (
        <EmptyState title={t('noRecords')} description="Email and WhatsApp delivery attempts appear here." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start">Timestamp</th>
                <th className="py-2.5 px-4 text-start">Channel</th>
                <th className="py-2.5 px-4 text-start">Recipient</th>
                <th className="py-2.5 px-4 text-start">Type / Entity</th>
                <th className="py-2.5 px-4 text-start">Status</th>
                <th className="py-2.5 px-4 text-start">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveryLogs
                .filter((d) => !q || d.recipient.toLowerCase().includes(q) || (d.entityId || '').toLowerCase().includes(q))
                .map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500">
                      {(d.createdAt || '').slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2.5 px-4 capitalize">{d.channel.replace('_', ' ')}</td>
                    <td className="py-2.5 px-4 font-mono-tabular">{d.recipient}</td>
                    <td className="py-2.5 px-4">
                      {d.messageType} {d.entityId ? `(${d.entityId})` : ''}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText status={d.deliveryStatus} />
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">{d.failureReason || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
