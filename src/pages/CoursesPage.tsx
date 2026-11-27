import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Plus, Power } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { isTenantAdminRole } from '../lib/permissions';
import type { CardTemplate, CertificateTemplate, Course, CourseType } from '../types/tcms';
import { DEFAULT_COURSE_CATEGORIES } from '../types/tcms';
import {
  EmptyState,
  ErrorAlert,
  NotificationBanner,
  SearchFilterBar,
  StatusText,
  TableSkeleton,
} from '../components/ui/UiKit';
import { ProtectedImage } from '../components/ui/ProtectedImage';
import { CourseFormModal } from '../components/courses/CourseFormModal';
import { CourseDetailsModal } from '../components/courses/CourseDetailsModal';

type DurationBucket = 'all' | 'short' | 'medium' | 'extended';

function matchesDurationBucket(c: Course, bucket: DurationBucket): boolean {
  if (bucket === 'all') return true;
  const approxHours =
    c.durationUnit === 'hours'
      ? c.duration
      : c.durationUnit === 'days'
        ? c.duration * 8
        : c.duration * 40;
  if (bucket === 'short') return approxHours <= 8;
  if (bucket === 'medium') return approxHours > 8 && approxHours <= 40;
  return approxHours > 40;
}

export function CoursesPage() {
  const { profile } = useAuth();
  const { lang, t, formatNumber } = useLanguage();

  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_COURSE_CATEGORIES);
  const [certTemplates, setCertTemplates] = useState<CertificateTemplate[]>([]);
  const [cardTemplates, setCardTemplates] = useState<CardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState<DurationBucket>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CourseType>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [detailsCourse, setDetailsCourse] = useState<Course | null>(null);

  const canManage = isTenantAdminRole(profile?.role);
  const isTrainer = profile?.role === 'trainer';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [crsRes, catRes, ctRes, cardRes] = await Promise.all([
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ categories: string[] }>('/api/categories').catch(() => ({
          categories: DEFAULT_COURSE_CATEGORIES,
        })),
        apiFetch<{ templates: CertificateTemplate[] }>('/api/templates/certificates').catch(() => ({
          templates: [],
        })),
        apiFetch<{ templates: CardTemplate[] }>('/api/templates/cards').catch(() => ({
          templates: [],
        })),
      ]);
      setCourses(crsRes.courses);
      setCategories(catRes.categories);
      setCertTemplates(ctRes.templates);
      setCardTemplates(cardRes.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (c: Course) => {
    setEditing(c);
    setFormOpen(true);
  };

  const toggleActiveStatus = async (c: Course) => {
    try {
      const nextStatus = c.status === 'active' ? 'inactive' : 'active';
      await apiFetch(`/api/courses/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setDurationFilter('all');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  const visibleCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (typeFilter !== 'all' && (c.courseType || 'blended') !== typeFilter) return false;
      if (!matchesDurationBucket(c, durationFilter)) return false;
      if (!q) return true;
      const hay = `${c.courseId} ${c.courseCode} ${c.titleEn} ${c.titleAr} ${c.category} ${c.prerequisites || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [courses, searchQuery, categoryFilter, durationFilter, statusFilter, typeFilter]);

  return (
    <div className="space-y-5">
      {isTrainer && (
        <NotificationBanner variant="info" message={t('trainerAssignedCoursesNotice')} />
      )}

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={lang === 'ar' ? 'ابحث برمز الدورة أو الاسم أو التصنيف...' : 'Search by Course ID, Code, Name, or Prerequisites...'}
        onReset={resetFilters}
        filters={
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('all')}: {t('courseCategory')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | CourseType)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('filterCourseType')}</option>
              <option value="theoretical">{t('courseType_theoretical')}</option>
              <option value="practical">{t('courseType_practical')}</option>
              <option value="blended">{t('courseType_blended')}</option>
              <option value="certification">{t('courseType_certification')}</option>
              <option value="refresher">{t('courseType_refresher')}</option>
            </select>

            <select
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value as DurationBucket)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('filterDuration')}</option>
              <option value="short">{t('durationShort')}</option>
              <option value="medium">{t('durationMedium')}</option>
              <option value="extended">{t('durationExtended')}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="all">{t('filterByStatus')}</option>
              <option value="active">{t('status_active')}</option>
              <option value="inactive">{t('status_inactive')}</option>
              <option value="archived">{t('status_archived')}</option>
            </select>
          </>
        }
        actions={
          canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('addCourse')}</span>
            </button>
          ) : undefined
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : visibleCourses.length === 0 ? (
        <EmptyState
          title={t('noRecords')}
          description={
            canManage
              ? 'Create courses in your configurable catalogue with theory/practical hours, attendance, exam, and certificate rules.'
              : t('noRecords')
          }
          actionLabel={canManage ? t('addCourse') : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-start whitespace-nowrap">{t('courseId')} / {t('courseCode')}</th>
                <th className="py-2.5 px-4 text-start">{t('courseTitleEn')}</th>
                <th className="py-2.5 px-4 text-start">{t('courseCategory')}</th>
                <th className="py-2.5 px-4 text-start">{t('courseDuration')}</th>
                <th className="py-2.5 px-4 text-start">{t('courseFeeSar')}</th>
                <th className="py-2.5 px-4 text-start">{t('prerequisites')}</th>
                <th className="py-2.5 px-4 text-start">{t('status')}</th>
                <th className="py-2.5 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleCourses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      {c.imageFileId && (
                        <ProtectedImage
                          fileId={c.imageFileId}
                          alt={c.titleEn}
                          className="w-8 h-8 rounded object-cover border border-slate-200"
                        />
                      )}
                      <div>
                        <div className="font-mono-tabular font-semibold text-slate-900">
                          {c.courseCode}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-500">
                          {c.courseId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => setDetailsCourse(c)}
                      className="text-start hover:underline font-medium text-slate-900 block"
                    >
                      {c.titleEn}
                    </button>
                    <div className="text-[11px] text-slate-500" dir="rtl">
                      {c.titleAr}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="text-slate-800">{c.category}</div>
                    <div className="text-[11px] text-slate-500">
                      {t(`courseType_${c.courseType || 'blended'}`)}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap">
                    <div className="text-slate-900">
                      {c.duration} {t(`unit_${c.durationUnit}`)}
                    </div>
                    {((c.theoryHours || 0) > 0 || (c.practicalHours || 0) > 0) && (
                      <div className="text-[11px] text-slate-500">
                        {c.theoryHours ?? 0}h / {c.practicalHours ?? 0}h
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap text-slate-900">
                    {formatNumber(c.fee || 0)} {t('sarCurrency')}
                  </td>
                  <td className="py-2.5 px-4 max-w-[200px]">
                    <span className="text-slate-600 line-clamp-2" title={c.prerequisites || ''}>
                      {c.prerequisites || t('noPrerequisites')}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusText status={c.status} />
                  </td>
                  <td className="py-2.5 px-4 text-end whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setDetailsCourse(c)}
                      title={t('courseDetails')}
                      className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          title={t('editCourse')}
                          className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActiveStatus(c)}
                          title={c.status === 'active' ? t('deactivateCourse') : t('activateCourse')}
                          className={`p-1.5 rounded ${
                            c.status === 'active'
                              ? 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CourseFormModal
        open={formOpen}
        editing={editing}
        categories={categories}
        certTemplates={certTemplates}
        cardTemplates={cardTemplates}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
      />

      <CourseDetailsModal
        course={detailsCourse}
        onClose={() => setDetailsCourse(null)}
      />
    </div>
  );
}
