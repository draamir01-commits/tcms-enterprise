import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole, isTenantOwnerRole } from '../lib/permissions';
import type { UserRole } from '../types/tcms';
import { CardSkeleton, ErrorAlert } from '../components/ui/UiKit';

interface ChartPoint {
  label: string;
  value: number;
}

interface DashboardResponse {
  role: UserRole;
  dateRange: { from: string | null; to: string | null };
  kpis: {
    totalCandidates: number;
    activeCandidates: number;
    totalCorporateClients: number;
    totalCourses: number;
    activeTrainers: number;
    totalTrainers: number;
    activeBatches: number;
    upcomingBatches: number;
    activeEnrollments: number;
    currentEnrollments: number;
    currentlyTraining: number;
    completedEnrollments: number;
    completedCourses: number;
    candidatesAwaitingExam: number;
    pendingAssessments: number;
    eligibleCertificatesPending: number;
    totalCertificatesIssued: number;
    certificatesIssued: number;
    expiringCertificates: number;
  };
  metrics: {
    completionRatePct: number;
    attendanceRatePct: number;
    examPassRatePct: number;
  };
  charts: {
    registrationsByMonth: ChartPoint[];
    enrollmentsByMonth: ChartPoint[];
    courseEnrollments: ChartPoint[];
    completionStats: ChartPoint[];
    attendancePerformance: ChartPoint[];
    examPassRate: ChartPoint[];
    certificatesByMonth: ChartPoint[];
    corporateActivity: ChartPoint[];
    trainerPerformance: ChartPoint[];
  };
  operational: {
    todaysSessions: Array<{
      id: string;
      batchNumber: string;
      courseCode: string;
      courseTitle: string;
      trainerName: string;
      venue: string;
      trainingMode: string;
      startTime: string;
      endTime: string;
      enrollmentCount: number;
      capacity: number;
      status: string;
    }>;
    upcomingSessions: Array<{
      id: string;
      batchNumber: string;
      courseCode: string;
      courseTitle: string;
      trainerName: string;
      venue: string;
      startDate: string;
      endDate: string;
      enrollmentCount: number;
      capacity: number;
      status: string;
    }>;
    todaysAttendance: {
      date: string;
      totalMarked: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      batchesMarked: number;
      activeBatchesCount: number;
    } | null;
    pendingEnrollmentApprovals: {
      count: number;
      items: Array<{
        id: string;
        ref: string;
        kind: 'enrollment' | 'corporate_request';
        title: string;
        subtitle: string;
        date: string;
        status: string;
      }>;
    };
    pendingAssessments: {
      count: number;
      items: Array<{
        id: string;
        ref: string;
        candidateName: string;
        courseTitle: string;
        batchNumber: string;
        status: string;
      }>;
    };
    pendingCertificateApprovals: {
      count: number;
      readyCount: number;
      items: Array<{
        enrollmentId: string;
        enrollmentNumber: string;
        candidateName: string;
        courseTitle: string;
        batchNumber: string;
        eligible: boolean;
        completionApproved: boolean;
        attendancePct: number;
      }>;
    };
    failedNotifications: {
      count: number;
      items: Array<{
        id: string;
        channel: string;
        recipient: string;
        category: string;
        deliveryStatus: string;
        failureReason: string;
        createdAt: string;
      }>;
    };
    recentActivity: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      actorEmail: string;
      actorRole: string;
      details: string;
      createdAt: string;
    }>;
  };
}

function ColumnTrendChart({
  title,
  data,
  emptyLabel,
  color = '#0f172a',
}: {
  title: string;
  data: ChartPoint[];
  emptyLabel: string;
  color?: string;
}) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {data.length > 0 && (
          <span className="text-xs font-mono-tabular text-slate-500">
            {data.reduce((s, d) => s + d.value, 0)}
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="h-44 flex items-end gap-2 pt-4 border-b border-slate-100">
          {data.map((item) => {
            const pct = Math.max(6, Math.round((item.value / maxVal) * 100));
            return (
              <div key={item.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                <span className="text-[10px] font-mono-tabular font-semibold text-slate-700 mb-1">
                  {item.value}
                </span>
                <div className="w-full max-w-[34px] flex-1 flex items-end">
                  <div
                    className="w-full rounded-t transition-all duration-300"
                    style={{ height: `${pct}%`, backgroundColor: color }}
                    title={`${item.label}: ${item.value}`}
                  />
                </div>
                <span className="mt-1.5 text-[10px] font-mono-tabular text-slate-500 truncate w-full text-center">
                  {item.label.slice(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BarChartCard({
  title,
  data,
  emptyLabel,
  color = '#0f172a',
}: {
  title: string;
  data: ChartPoint[];
  emptyLabel: string;
  color?: string;
}) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="space-y-2.5">
          {data.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-700 truncate">{item.label}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">{item.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(pct, item.value > 0 ? 4 : 0)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RateDistributionCard({
  title,
  headlinePct,
  data,
  emptyLabel,
  palette,
}: {
  title: string;
  headlinePct: number;
  data: Array<{ label: string; value: number; key: string }>;
  emptyLabel: string;
  palette: Record<string, string>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-lg font-display font-bold text-slate-900 font-mono-tabular">
          {headlinePct}%
        </span>
      </div>
      {total === 0 ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="space-y-4">
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {data.map((item) => {
              if (item.value <= 0) return null;
              const widthPct = (item.value / total) * 100;
              return (
                <div
                  key={item.key}
                  style={{ width: `${widthPct}%`, backgroundColor: palette[item.key] || '#0f172a' }}
                  title={`${item.label}: ${item.value}`}
                />
              );
            })}
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {data.map((item) => {
              const share = Math.round((item.value / total) * 100);
              return (
                <div key={item.key} className="py-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: palette[item.key] || '#0f172a' }}
                    />
                    <span className="text-slate-700 truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono-tabular shrink-0">
                    <span className="text-slate-500">{share}%</span>
                    <span className="font-semibold text-slate-900 w-8 text-end">{item.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const { t, formatNumber } = useLanguage();
  const [preset, setPreset] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeDates = useCallback(
    (p: typeof preset): { from?: string; to?: string } => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      if (p === 'today') return { from: todayStr, to: todayStr };
      if (p === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        return { from: start.toISOString().slice(0, 10), to: todayStr };
      }
      if (p === 'month') {
        return { from: `${todayStr.slice(0, 7)}-01`, to: todayStr };
      }
      if (p === 'year') {
        return { from: `${todayStr.slice(0, 4)}-01-01`, to: todayStr };
      }
      if (p === 'custom') {
        return { from: fromDate || undefined, to: toDate || undefined };
      }
      return {};
    },
    [fromDate, toDate]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeDates(preset);
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await apiFetch<DashboardResponse>(`/api/dashboard?${qs.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [computeDates, preset]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const role = data?.role || profile?.role || 'admin';
  const kpis = data?.kpis;

  const kpiCards = kpis
    ? (() => {
        const all12 = [
          { key: 'totalCandidates', label: t('kpi_totalCandidates'), value: kpis.totalCandidates },
          { key: 'totalCorporateClients', label: t('kpi_corporateClients'), value: kpis.totalCorporateClients },
          { key: 'totalCourses', label: t('kpi_availableCourses'), value: kpis.totalCourses },
          { key: 'activeTrainers', label: t('kpi_activeTrainers'), value: kpis.activeTrainers },
          { key: 'activeBatches', label: t('kpi_activeBatches'), value: kpis.activeBatches },
          { key: 'upcomingBatches', label: t('kpi_upcomingBatches'), value: kpis.upcomingBatches },
          { key: 'activeEnrollments', label: t('kpi_activeEnrollments'), value: kpis.activeEnrollments },
          { key: 'completedEnrollments', label: t('kpi_completedEnrollments'), value: kpis.completedEnrollments },
          { key: 'candidatesAwaitingExam', label: t('kpi_candidatesAwaitingExam'), value: kpis.candidatesAwaitingExam },
          {
            key: 'eligibleCertificatesPending',
            label: t('kpi_eligibleCertificatesPending'),
            value: kpis.eligibleCertificatesPending,
          },
          { key: 'totalCertificatesIssued', label: t('kpi_totalCertificatesIssued'), value: kpis.totalCertificatesIssued },
          { key: 'expiringCertificates', label: t('kpi_expiringCertificates'), value: kpis.expiringCertificates },
        ];

        if (role === 'trainer') {
          return all12.filter((k) =>
            [
              'activeBatches',
              'upcomingBatches',
              'activeEnrollments',
              'completedEnrollments',
              'candidatesAwaitingExam',
              'totalCourses',
            ].includes(k.key)
          );
        }
        if (role === 'candidate') {
          return all12.filter((k) =>
            [
              'activeEnrollments',
              'completedEnrollments',
              'upcomingBatches',
              'totalCertificatesIssued',
              'expiringCertificates',
            ].includes(k.key)
          );
        }
        if (role === 'corporate_client') {
          return all12.filter((k) =>
            [
              'totalCandidates',
              'activeEnrollments',
              'completedEnrollments',
              'upcomingBatches',
              'candidatesAwaitingExam',
              'eligibleCertificatesPending',
              'totalCertificatesIssued',
              'expiringCertificates',
            ].includes(k.key)
          );
        }
        return all12;
      })()
    : [];

  const translateStatus = (raw: string) => {
    const key = `status_${raw.toLowerCase()}`;
    const res = t(key);
    return res !== key ? res : raw;
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header & Date Preset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{t(`role_${role}`)}</p>
          <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
            {t(`dashRoleOverview_${role}`)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['all', t('all')],
                ['today', t('today')],
                ['week', t('thisWeek')],
                ['month', t('thisMonth')],
                ['year', t('thisYear')],
                ['custom', t('customRange')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  preset === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                aria-label={t('fromDate')}
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md font-mono-tabular"
                aria-label={t('toDate')}
              />
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                {t('filter')}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            title={t('loading')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('reset') === 'Reset' ? 'Refresh' : 'تحديث'}</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Section 1: Key Performance Indicators */}
      {loading && !data ? (
        <CardSkeleton count={12} />
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('dashSectionKpis')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {kpiCards.map((kpi) => (
              <div key={kpi.key} className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-500 truncate">{kpi.label}</p>
                <p className="mt-2 text-2xl font-display font-bold text-slate-900 font-mono-tabular">
                  {formatNumber(kpi.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Operational Live Desk */}
      {data && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('dashSectionOperational')}
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Today's Training Sessions */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">{t('op_todaysSessions')}</h4>
                <span className="text-xs font-mono-tabular font-semibold text-slate-700">
                  {data.operational.todaysSessions.length}
                </span>
              </div>
              {data.operational.todaysSessions.length === 0 ? (
                <div className="p-6 text-xs text-slate-400 text-center">{t('op_noSessionsToday')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-2 px-3 text-start">Batch</th>
                        <th className="py-2 px-3 text-start">Course</th>
                        <th className="py-2 px-3 text-start">Venue</th>
                        <th className="py-2 px-3 text-end">Time</th>
                        <th className="py-2 px-3 text-end">Enrolled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.operational.todaysSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono-tabular font-medium text-slate-900 whitespace-nowrap">
                            {s.batchNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-700 truncate max-w-[180px]">{s.courseTitle}</td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[120px]">{s.venue}</td>
                          <td className="py-2 px-3 text-end font-mono-tabular text-slate-600 whitespace-nowrap">
                            {s.startTime}–{s.endTime}
                          </td>
                          <td className="py-2 px-3 text-end font-mono-tabular font-medium text-slate-900 whitespace-nowrap">
                            {s.enrollmentCount}/{s.capacity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Upcoming Training Sessions */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">{t('op_upcomingSessions')}</h4>
                <span className="text-xs font-mono-tabular font-semibold text-slate-700">
                  {data.operational.upcomingSessions.length}
                </span>
              </div>
              {data.operational.upcomingSessions.length === 0 ? (
                <div className="p-6 text-xs text-slate-400 text-center">{t('op_noUpcomingSessions')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-2 px-3 text-start">Batch</th>
                        <th className="py-2 px-3 text-start">Course</th>
                        <th className="py-2 px-3 text-start">Trainer</th>
                        <th className="py-2 px-3 text-end">Start Date</th>
                        <th className="py-2 px-3 text-end">Seats</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.operational.upcomingSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono-tabular font-medium text-slate-900 whitespace-nowrap">
                            {s.batchNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-700 truncate max-w-[180px]">{s.courseTitle}</td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[120px]">{s.trainerName}</td>
                          <td className="py-2 px-3 text-end font-mono-tabular text-slate-600 whitespace-nowrap">
                            {s.startDate}
                          </td>
                          <td className="py-2 px-3 text-end font-mono-tabular font-medium text-slate-900 whitespace-nowrap">
                            {s.enrollmentCount}/{s.capacity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Operational Action Queues Row */}
          {role !== 'candidate' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Today's Attendance Status */}
              {data.operational.todaysAttendance && (
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-900">{t('op_todaysAttendance')}</h4>
                    <span className="text-[11px] font-mono-tabular text-slate-500">
                      {data.operational.todaysAttendance.date}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[11px] text-slate-500 block">{t('status_present')}</span>
                      <span className="font-mono-tabular font-bold text-emerald-700 text-sm">
                        {formatNumber(data.operational.todaysAttendance.present)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[11px] text-slate-500 block">{t('status_absent')}</span>
                      <span className="font-mono-tabular font-bold text-rose-700 text-sm">
                        {formatNumber(data.operational.todaysAttendance.absent)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[11px] text-slate-500 block">{t('status_late')}</span>
                      <span className="font-mono-tabular font-bold text-amber-700 text-sm">
                        {formatNumber(data.operational.todaysAttendance.late)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-[11px] text-slate-500 block">{t('op_batchesMarked')}</span>
                      <span className="font-mono-tabular font-bold text-slate-900 text-sm">
                        {data.operational.todaysAttendance.batchesMarked}/{data.operational.todaysAttendance.activeBatchesCount}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Enrollment Approvals */}
              {(isTenantAdminRole(role) || role === 'corporate_client') && (
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-900">{t('op_pendingEnrollments')}</h4>
                    <span className="text-sm font-mono-tabular font-bold text-slate-900">
                      {formatNumber(data.operational.pendingEnrollmentApprovals.count)}
                    </span>
                  </div>
                  {data.operational.pendingEnrollmentApprovals.items.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">{t('op_noPendingItems')}</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {data.operational.pendingEnrollmentApprovals.items.slice(0, 4).map((item) => (
                        <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{item.title}</p>
                            <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                          </div>
                          <span className="text-[11px] font-mono-tabular text-slate-500 shrink-0">{item.ref}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pending Assessment Results */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-900">{t('op_pendingAssessments')}</h4>
                  <span className="text-sm font-mono-tabular font-bold text-slate-900">
                    {formatNumber(data.operational.pendingAssessments.count)}
                  </span>
                </div>
                {data.operational.pendingAssessments.items.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">{t('op_noPendingItems')}</p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {data.operational.pendingAssessments.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{item.candidateName}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.batchNumber} · {item.courseTitle}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono-tabular text-amber-700 shrink-0">
                          {item.status === 'pending_correction' ? 'Correction' : 'Due'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Certificate Approvals */}
              {(isTenantAdminRole(role) || role === 'certificate_officer' || role === 'corporate_client') && (
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-900">{t('op_pendingCertificates')}</h4>
                    <span className="text-sm font-mono-tabular font-bold text-slate-900">
                      {formatNumber(data.operational.pendingCertificateApprovals.count)}
                    </span>
                  </div>
                  {data.operational.pendingCertificateApprovals.items.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">{t('op_noPendingItems')}</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {data.operational.pendingCertificateApprovals.items.slice(0, 4).map((item) => (
                        <div key={item.enrollmentId} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{item.candidateName}</p>
                            <p className="text-[11px] text-slate-500 truncate">{item.courseTitle}</p>
                          </div>
                          <span
                            className={`text-[11px] font-mono-tabular shrink-0 ${
                              item.eligible ? 'text-emerald-700 font-semibold' : 'text-amber-700'
                            }`}
                          >
                            {item.eligible ? t('op_readyToIssue') : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Failed Notifications & Recent System Activity */}
          {(isTenantAdminRole(role) || role === 'certificate_officer') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Failed Notifications */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">{t('op_failedNotifications')}</h4>
                  <span
                    className={`text-xs font-mono-tabular font-semibold ${
                      data.operational.failedNotifications.count > 0 ? 'text-rose-700' : 'text-slate-600'
                    }`}
                  >
                    {formatNumber(data.operational.failedNotifications.count)}
                  </span>
                </div>
                {data.operational.failedNotifications.items.length === 0 ? (
                  <div className="p-6 text-xs text-slate-400 text-center">{t('op_noFailedNotifications')}</div>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {data.operational.failedNotifications.items.map((item) => (
                      <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">
                            {item.channel.toUpperCase()} · {item.recipient}
                          </p>
                          <p className="text-[11px] text-rose-700 truncate">{item.failureReason}</p>
                        </div>
                        <span className="text-[11px] font-mono-tabular text-slate-500 shrink-0">
                          {(item.createdAt || '').slice(0, 10)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent System Activity */}
              {isTenantOwnerRole(role) && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">{t('op_recentActivity')}</h4>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {data.operational.recentActivity.length}
                    </span>
                  </div>
                  {data.operational.recentActivity.length === 0 ? (
                    <div className="p-6 text-xs text-slate-400 text-center">{t('op_noRecentActivity')}</div>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs max-h-72 overflow-y-auto">
                      {data.operational.recentActivity.map((act) => (
                        <div key={act.id} className="px-4 py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {act.action} · <span className="text-slate-600">{act.entityType}</span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {act.actorEmail} — {act.details || act.entityId}
                            </p>
                          </div>
                          <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                            {(act.createdAt || '').slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section 3: 8 Visual Analytics Charts */}
      {data && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('dashSectionAnalytics')}
          </h3>

          {/* 3 Time-Series Monthly Column Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ColumnTrendChart
              title={t('chart_registrationsByMonth')}
              data={data.charts.registrationsByMonth}
              emptyLabel={t('noChartData')}
              color="#0f172a"
            />
            <ColumnTrendChart
              title={t('chart_enrollmentsByMonth')}
              data={data.charts.enrollmentsByMonth}
              emptyLabel={t('noChartData')}
              color="#0284c7"
            />
            <ColumnTrendChart
              title={t('chart_certificatesByMonth')}
              data={data.charts.certificatesByMonth}
              emptyLabel={t('noChartData')}
              color="#b45309"
            />
          </div>

          {/* 3 Performance Rate Breakdown Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RateDistributionCard
              title={t('chart_completionStats')}
              headlinePct={data.metrics.completionRatePct}
              emptyLabel={t('noChartData')}
              data={data.charts.completionStats.map((item) => ({
                key: item.label.toLowerCase(),
                label: translateStatus(item.label),
                value: item.value,
              }))}
              palette={{
                completed: '#16a34a',
                in_progress: '#0284c7',
                confirmed: '#334155',
                pending: '#d97706',
                failed: '#dc2626',
              }}
            />
            <RateDistributionCard
              title={t('chart_attendancePerformance')}
              headlinePct={data.metrics.attendanceRatePct}
              emptyLabel={t('noChartData')}
              data={data.charts.attendancePerformance.map((item) => ({
                key: item.label.toLowerCase(),
                label: translateStatus(item.label),
                value: item.value,
              }))}
              palette={{
                present: '#16a34a',
                late: '#d97706',
                excused: '#0284c7',
                absent: '#dc2626',
              }}
            />
            <RateDistributionCard
              title={t('chart_examPassRate')}
              headlinePct={data.metrics.examPassRatePct}
              emptyLabel={t('noChartData')}
              data={data.charts.examPassRate.map((item) => ({
                key: item.label.toLowerCase(),
                label: translateStatus(item.label),
                value: item.value,
              }))}
              palette={{
                pass: '#16a34a',
                fail: '#dc2626',
                pending: '#94a3b8',
              }}
            />
          </div>

          {/* 2 Horizontal Proportion Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarChartCard
              title={t('chart_courseEnrollments')}
              data={data.charts.courseEnrollments}
              emptyLabel={t('noChartData')}
              color="#0284c7"
            />
            <BarChartCard
              title={t('chart_corporateActivity')}
              data={data.charts.corporateActivity}
              emptyLabel={t('noChartData')}
              color="#334155"
            />
          </div>
        </div>
      )}
    </div>
  );
}
