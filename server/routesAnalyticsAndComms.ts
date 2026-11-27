import { Router } from 'express';
import { fsGetDoc, fsQueryTenantDocs } from './firestoreRest.ts';
import { exportTableToWorkbook } from './excelService.ts';
import { generateReportPdf } from './pdfGenerator.ts';
import { buildDashboardPayload, buildReportPayload } from './analyticsService.ts';
import {
  getCompanyBranding,
  getRolePermissionMatrix,
  requireAuth,
  requirePermission,
  requireRole,
  sanitizeCandidateForClient,
  writeAuditLog,
  type AuthedRequest,
} from './helpers.ts';
import {
  assertRecordTenant,
  DEFAULT_TENANT_ID,
  isTenantAdminOrOwnerRole,
  isTenantOwnerRole,
} from './tenantService.ts';
import { hasPermission } from '../src/lib/permissions.ts';
import type {
  AssessmentRecord,
  AttendanceRecord,
  AuditLogItem,
  Batch,
  Candidate,
  Certificate,
  Course,
  DeliveryLogItem,
  Enrollment,
  EnrollmentRequest,
  Organization,
  Trainer,
  TrainingCard,
  UserProfile,
  VerificationLogItem,
} from '../src/types/tcms.ts';

export function createAnalyticsAndCommsRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Business Dashboard (Live Database Aggregations)
  // ---------------------------------------------------------------------------
  router.get('/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId || DEFAULT_TENANT_ID;
      const strictTenantFilter = Boolean(req.strictTenantQuery);
      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;
      const role = req.user!.role;
      const uid = req.user!.uid;
      const orgFilter = role === 'corporate_client' ? req.user!.organizationId || '__unassigned__' : undefined;

      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      const canViewAttendance = role !== 'candidate' && hasPermission(req.user!, 'attendance', 'view', matrix);
      const canViewAssessments = role !== 'candidate' && hasPermission(req.user!, 'assessments', 'view', matrix);
      const canViewCertificates =
        (isTenantAdminOrOwnerRole(role) ||
          ['certificate_officer', 'corporate_client', 'candidate'].includes(role)) &&
        hasPermission(req.user!, 'certificates', 'view', matrix);
      const canViewAuditLogs = isTenantOwnerRole(role);

      const [
        candidates,
        organizations,
        courses,
        trainers,
        batches,
        enrollments,
        attendance,
        assessments,
        certificates,
        enrollmentRequests,
        deliveryLogs,
        auditLogs,
      ] = await Promise.all([
        role === 'candidate'
          ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
              filters: [{ field: 'userId', op: 'EQUAL', value: uid }],
              strictTenantFilter,
            })
          : orgFilter
            ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              })
            : isTenantAdminOrOwnerRole(role) || ['certificate_officer', 'trainer'].includes(role)
              ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                  strictTenantFilter,
                })
              : Promise.resolve([]),
        role === 'corporate_client' && req.user!.organizationId
          ? fsGetDoc<Organization>('organizations', req.user!.organizationId, req.idToken!).then((o) =>
              o && assertRecordTenant(o, tenantId, !strictTenantFilter) ? [o] : []
            )
          : isTenantAdminOrOwnerRole(role) || role === 'certificate_officer'
            ? fsQueryTenantDocs<Organization>('organizations', tenantId, req.idToken!, {
                strictTenantFilter,
              })
            : Promise.resolve([]),
        fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter }),
        isTenantAdminOrOwnerRole(role) ||
        ['certificate_officer', 'trainer', 'corporate_client'].includes(role)
          ? fsQueryTenantDocs<Trainer>('trainers', tenantId, req.idToken!, {
              strictTenantFilter,
            }).catch(() => [] as Trainer[])
          : Promise.resolve([]),
        fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter }),
        role === 'candidate'
          ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
              filters: [{ field: 'candidateUserId', op: 'EQUAL', value: uid }],
              strictTenantFilter,
            })
          : orgFilter
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: uid }],
                  strictTenantFilter,
                })
              : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  strictTenantFilter,
                }),
        !canViewAttendance
          ? Promise.resolve([] as AttendanceRecord[])
          : orgFilter
            ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: uid }],
                  strictTenantFilter,
                })
              : fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                  strictTenantFilter,
                }),
        !canViewAssessments
          ? Promise.resolve([] as AssessmentRecord[])
          : orgFilter
            ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: uid }],
                  strictTenantFilter,
                })
              : fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                  strictTenantFilter,
                }),
        !canViewCertificates
          ? Promise.resolve([] as Certificate[])
          : role === 'candidate'
            ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                filters: [{ field: 'candidateUserId', op: 'EQUAL', value: uid }],
                strictTenantFilter,
              })
            : orgFilter
              ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                  filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                  strictTenantFilter,
                })
              : isTenantAdminOrOwnerRole(role) || role === 'certificate_officer'
                ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                    strictTenantFilter,
                  })
                : Promise.resolve([]),
        isTenantAdminOrOwnerRole(role)
          ? fsQueryTenantDocs<EnrollmentRequest>('enrollmentRequests', tenantId, req.idToken!, {
              strictTenantFilter,
            }).catch(() => [] as EnrollmentRequest[])
          : orgFilter
            ? fsQueryTenantDocs<EnrollmentRequest>('enrollmentRequests', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              }).catch(() => [] as EnrollmentRequest[])
            : Promise.resolve([] as EnrollmentRequest[]),
        isTenantAdminOrOwnerRole(role) || role === 'certificate_officer'
          ? fsQueryTenantDocs<DeliveryLogItem>('deliveryLogs', tenantId, req.idToken!, {
              strictTenantFilter,
            }).catch(() => [] as DeliveryLogItem[])
          : orgFilter
            ? fsQueryTenantDocs<DeliveryLogItem>('deliveryLogs', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter,
              }).catch(() => [] as DeliveryLogItem[])
            : Promise.resolve([] as DeliveryLogItem[]),
        canViewAuditLogs
          ? fsQueryTenantDocs<AuditLogItem>('auditLogs', tenantId, req.idToken!, {
              strictTenantFilter,
            }).catch(() => [] as AuditLogItem[])
          : Promise.resolve([] as AuditLogItem[]),
      ]);

      const payload = buildDashboardPayload({
        role,
        userId: uid,
        organizationId: req.user!.organizationId,
        trainerId: req.user!.trainerId,
        from,
        to,
        permissions: {
          canViewAttendance,
          canViewAssessments,
          canViewCertificates,
          canViewAuditLogs,
        },
        candidates,
        organizations,
        courses,
        trainers,
        batches,
        enrollments,
        attendance,
        assessments,
        certificates,
        enrollmentRequests,
        deliveryLogs,
        auditLogs,
      });

      res.json(payload);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Dedicated Corporate Client Portal Dashboard (Strict Org Isolation)
  // ---------------------------------------------------------------------------
  router.get(
    '/corporate/dashboard',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer', 'corporate_client']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const strictTenantFilter = Boolean(req.strictTenantQuery);
        const role = req.user!.role;
        const orgId =
          role === 'corporate_client'
            ? req.user!.organizationId || ''
            : String(req.query.organizationId || '');

        if (!orgId) {
          res.json({
            organization: null,
            permissions: {
              canViewAttendance: false,
              canViewAssessments: false,
              canViewCards: false,
              canViewCertificates: false,
              canViewReports: false,
            },
            kpis: {
              totalRegisteredEmployees: 0,
              activeEnrollments: 0,
              upcomingTrainingBatches: 0,
              completedCourses: 0,
              pendingExaminations: 0,
              issuedCertificates: 0,
              expiringCertificates: 0,
              pendingRequests: 0,
            },
            upcomingBatches: [],
            expiringCertificatesList: [],
          });
          return;
        }

        const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
        const canViewAttendance = hasPermission(req.user!, 'attendance', 'view', matrix);
        const canViewAssessments = hasPermission(req.user!, 'assessments', 'view', matrix);
        const canViewCards = hasPermission(req.user!, 'training_cards', 'view', matrix);
        const canViewCertificates = hasPermission(req.user!, 'certificates', 'view', matrix);
        const canViewReports = hasPermission(req.user!, 'reports', 'view', matrix);

        const org = await fsGetDoc<Organization>('organizations', orgId, req.idToken!);
        if (org && !assertRecordTenant(org, tenantId, !strictTenantFilter)) {
          res.status(403).json({ error: 'Forbidden: organization belongs to another tenant' });
          return;
        }

        const [candidates, enrollments, courses, batches, certificates, assessments, requests] =
          await Promise.all([
            fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
              strictTenantFilter,
            }),
            fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
              strictTenantFilter,
            }),
            fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
              strictTenantFilter,
            }),
            fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
              strictTenantFilter,
            }),
            fsQueryTenantDocs<EnrollmentRequest>('enrollmentRequests', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
              strictTenantFilter,
            }),
          ]);

        const today = new Date().toISOString().slice(0, 10);
        const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
        const courseMap = new Map(courses.map((c) => [c.id, c]));

        const assessedEnrollmentIds = new Set(assessments.map((a) => a.enrollmentId));
        const upcomingBatchesRaw = batches
          .filter((b) => (b.status === 'scheduled' || (b.status === 'in_progress' && b.endDate >= today)) && b.startDate >= today)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        // If no future startDate batches exist yet, include all scheduled batches so upcoming scheduled sessions are always visible
        const upcomingBatches = (
          upcomingBatchesRaw.length > 0
            ? upcomingBatchesRaw
            : batches.filter((b) => b.status === 'scheduled').sort((a, b) => a.startDate.localeCompare(b.startDate))
        ).map((b) => {
          const crs = courseMap.get(b.courseId);
          return {
            ...b,
            courseCode: crs?.courseCode || '',
            courseTitleEn: crs?.titleEn || b.courseId,
            courseTitleAr: crs?.titleAr || '',
            orgEnrolledCount: enrollments.filter(
              (e) => e.batchId === b.id && !['cancelled', 'withdrawn'].includes(e.status)
            ).length,
          };
        });

        const expiringCerts = certificates
          .filter((c) => c.status === 'valid' && c.expiryDate && c.expiryDate >= today && c.expiryDate <= in60Days)
          .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

        const kpis = {
          totalRegisteredEmployees: candidates.length,
          activeEnrollments: enrollments.filter((e) => ['pending', 'confirmed', 'in_progress'].includes(e.status)).length,
          upcomingTrainingBatches: upcomingBatches.length,
          completedCourses: enrollments.filter((e) => e.status === 'completed').length,
          pendingExaminations: enrollments.filter((e) => {
            if (!['confirmed', 'in_progress'].includes(e.status)) return false;
            const crs = courseMap.get(e.courseId);
            if (crs && !crs.examRequired && !crs.practicalRequired) return false;
            return !assessedEnrollmentIds.has(e.id);
          }).length,
          issuedCertificates: certificates.filter((c) => c.status === 'valid').length,
          expiringCertificates: expiringCerts.length,
          pendingRequests: requests.filter((r) => ['pending_review', 'info_requested'].includes(r.status)).length,
        };

        res.json({
          organization: org,
          permissions: {
            canViewAttendance,
            canViewAssessments,
            canViewCards,
            canViewCertificates,
            canViewReports,
          },
          kpis,
          upcomingBatches: upcomingBatches.slice(0, 12),
          expiringCertificatesList: expiringCerts.slice(0, 10),
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Operational Reports + Pagination + PDF/Excel/CSV Export
  // ---------------------------------------------------------------------------
  router.get(
    '/reports/:type',
    requireAuth,
    requirePermission('reports', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const reportType = String(req.params.type);
        const format = String(req.query.format || 'json') as 'json' | 'xlsx' | 'csv' | 'pdf';
        const from = req.query.from ? String(req.query.from) : undefined;
        const to = req.query.to ? String(req.query.to) : undefined;
        const courseId = req.query.courseId ? String(req.query.courseId) : undefined;
        const batchId = req.query.batchId ? String(req.query.batchId) : undefined;
        const trainerId = req.query.trainerId ? String(req.query.trainerId) : undefined;
        const candidateStatus = req.query.candidateStatus ? String(req.query.candidateStatus) : undefined;
        const enrollmentStatus = req.query.enrollmentStatus ? String(req.query.enrollmentStatus) : undefined;
        const certStatus = req.query.status ? String(req.query.status) : undefined;
        const page = req.query.page ? Number(req.query.page) : 1;
        const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;

        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const strictTenantFilter = Boolean(req.strictTenantQuery);
        const role = req.user!.role;
        const orgId =
          role === 'corporate_client'
            ? req.user!.organizationId || '__unassigned__'
            : req.query.organizationId
              ? String(req.query.organizationId)
              : undefined;

        if (role === 'candidate') {
          res.status(403).json({ error: 'Candidates do not have access to operational reports' });
          return;
        }

        const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
        const canViewAttendance = hasPermission(req.user!, 'attendance', 'view', matrix);
        const canViewAssessments = hasPermission(req.user!, 'assessments', 'view', matrix);
        const canViewCertificates = hasPermission(req.user!, 'certificates', 'view', matrix);

        if (
          ['attendance', 'daily_attendance', 'batch_attendance', 'candidate_attendance_pct'].includes(reportType) &&
          !canViewAttendance
        ) {
          res.status(403).json({ error: 'Forbidden: missing permission attendance:view' });
          return;
        }
        if (
          ['examination', 'examination_results', 'pass_fail_analysis', 'assessment_completion'].includes(reportType) &&
          !canViewAssessments
        ) {
          res.status(403).json({ error: 'Forbidden: missing permission assessments:view' });
          return;
        }
        if (
          [
            'certificate_issuance',
            'valid_certificates',
            'expired_certificates',
            'certificate_revocation',
            'revoked_certificates',
            'certificate_expiry',
          ].includes(reportType) &&
          !canViewCertificates
        ) {
          res.status(403).json({ error: 'Forbidden: missing permission certificates:view' });
          return;
        }

        const [
          rawCandidates,
          orgs,
          courses,
          rawTrainers,
          rawBatches,
          enrollments,
          attendance,
          assessments,
          rawCards,
          rawCertificates,
          auditLogs,
        ] = await Promise.all([
          orgId
            ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                strictTenantFilter,
              })
            : fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, { strictTenantFilter }),
          role === 'corporate_client' && orgId
            ? fsGetDoc<Organization>('organizations', orgId, req.idToken!).then((o) =>
                o && assertRecordTenant(o, tenantId, !strictTenantFilter) ? [o] : []
              )
            : role === 'trainer'
              ? Promise.resolve([] as Organization[])
              : fsQueryTenantDocs<Organization>('organizations', tenantId, req.idToken!, { strictTenantFilter }),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter }),
          role === 'corporate_client'
            ? Promise.resolve([] as Trainer[])
            : fsQueryTenantDocs<Trainer>('trainers', tenantId, req.idToken!, { strictTenantFilter }),
          fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter }),
          orgId
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                strictTenantFilter,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter,
                })
              : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, { strictTenantFilter }),
          !canViewAttendance
            ? Promise.resolve([] as AttendanceRecord[])
            : orgId
              ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                  filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                  strictTenantFilter,
                })
              : role === 'trainer'
                ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                    filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                    strictTenantFilter,
                  })
                : fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                    strictTenantFilter,
                  }),
          !canViewAssessments
            ? Promise.resolve([] as AssessmentRecord[])
            : orgId
              ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                  filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                  strictTenantFilter,
                })
              : role === 'trainer'
                ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                    filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                    strictTenantFilter,
                  })
                : fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                    strictTenantFilter,
                  }),
          orgId
            ? fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                strictTenantFilter,
              })
            : isTenantAdminOrOwnerRole(role) || ['certificate_officer', 'trainer'].includes(role)
              ? fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
                  strictTenantFilter,
                })
              : Promise.resolve([] as TrainingCard[]),
          !canViewCertificates
            ? Promise.resolve([] as Certificate[])
            : orgId
              ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                  filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
                  strictTenantFilter,
                })
              : isTenantAdminOrOwnerRole(role) || role === 'certificate_officer'
                ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                    strictTenantFilter,
                  })
                : Promise.resolve([] as Certificate[]),
          isTenantOwnerRole(role)
            ? fsQueryTenantDocs<AuditLogItem>('auditLogs', tenantId, req.idToken!, {
                strictTenantFilter,
              }).catch(() => [] as AuditLogItem[])
            : Promise.resolve([] as AuditLogItem[]),
        ]);

        const trainerBatchIds = new Set(
          rawBatches
            .filter(
              (b) =>
                b.trainerUserId === req.user!.uid ||
                (req.user!.trainerId && b.trainerId === req.user!.trainerId)
            )
            .map((b) => b.id)
        );
        const enrolledCandIds = new Set(enrollments.map((e) => e.candidateDocId));
        const orgBatchIds = new Set(enrollments.map((e) => e.batchId));

        const candidates =
          role === 'trainer' ? rawCandidates.filter((c) => enrolledCandIds.has(c.id)) : rawCandidates;
        const trainers =
          role === 'trainer'
            ? rawTrainers.filter(
                (t) => t.userId === req.user!.uid || (req.user!.trainerId && t.id === req.user!.trainerId)
              )
            : rawTrainers;
        const batches =
          role === 'trainer'
            ? rawBatches.filter((b) => trainerBatchIds.has(b.id))
            : role === 'corporate_client'
              ? rawBatches.filter((b) => orgBatchIds.has(b.id))
              : rawBatches;
        const cards = role === 'trainer' ? rawCards.filter((c) => trainerBatchIds.has(c.batchId)) : rawCards;

        const result = buildReportPayload({
          reportType,
          role,
          from,
          to,
          courseId,
          batchId,
          trainerId,
          organizationId: orgId,
          candidateStatus,
          enrollmentStatus,
          certStatus,
          page,
          pageSize,
          permissions: {
            canViewAttendance,
            canViewAssessments,
            canViewCertificates,
          },
          candidates,
          organizations: orgs,
          courses,
          trainers,
          batches,
          enrollments,
          attendance,
          assessments,
          cards,
          certificates: rawCertificates,
          auditLogs,
        });

        if (format === 'xlsx' || format === 'csv') {
          const buf = await exportTableToWorkbook(
            result.title,
            result.headers,
            result.allRows,
            format,
            result.subtitle
          );
          await writeAuditLog(
            req.user!,
            'EXPORT_REPORT',
            'reports',
            reportType,
            `Exported ${reportType} as ${format.toUpperCase()} (${result.allRows.length} rows)`,
            req.idToken!,
            tenantId
          ).catch(() => undefined);
          res.setHeader(
            'Content-Type',
            format === 'csv'
              ? 'text/csv; charset=utf-8'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report.${format}"`);
          res.send(buf);
          return;
        }

        if (format === 'pdf') {
          const company = await getCompanyBranding(req.idToken, tenantId);
          const buf = await generateReportPdf({
            title: result.title,
            company,
            headers: result.headers,
            rows: result.allRows,
          });
          await writeAuditLog(
            req.user!,
            'EXPORT_REPORT',
            'reports',
            reportType,
            `Exported ${reportType} as PDF (${result.allRows.length} rows)`,
            req.idToken!,
            tenantId
          ).catch(() => undefined);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report.pdf"`);
          res.send(buf);
          return;
        }

        res.json({
          title: result.title,
          subtitle: result.subtitle,
          headers: result.headers,
          rows: result.rows,
          totalRows: result.totalRows,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
          summary: result.summary,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Audit Logs, Verification Logs & System Backup
  // ---------------------------------------------------------------------------
  router.get(
    '/audit-logs',
    requireAuth,
    requirePermission('audit_logs', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const strictTenantFilter = Boolean(req.strictTenantQuery);
        const [auditLogs, verificationLogs, deliveryLogs] = await Promise.all([
          fsQueryTenantDocs<AuditLogItem>('auditLogs', tenantId, req.idToken!, { strictTenantFilter }),
          fsQueryTenantDocs<VerificationLogItem>('verificationLogs', tenantId, req.idToken!, {
            strictTenantFilter,
          }),
          fsQueryTenantDocs<DeliveryLogItem>('deliveryLogs', tenantId, req.idToken!, {
            strictTenantFilter,
          }),
        ]);
        res.json({
          auditLogs: auditLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
          verificationLogs: verificationLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
          deliveryLogs: deliveryLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get(
    '/system/backup',
    requireAuth,
    requireRole(['super_admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId || DEFAULT_TENANT_ID;
        const strictTenantFilter = Boolean(req.strictTenantQuery);
        const [users, candidates, organizations, courses, trainers, batches, enrollments, certificates] =
          await Promise.all([
            fsQueryTenantDocs<UserProfile>('users', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Organization>('organizations', tenantId, req.idToken!, {
              strictTenantFilter,
            }),
            fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Trainer>('trainers', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, { strictTenantFilter }),
            fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
              strictTenantFilter,
            }),
          ]);

        await writeAuditLog(
          req.user!,
          'EXPORT_SYSTEM_BACKUP',
          'system',
          'backup',
          'Generated full tenant JSON backup snapshot',
          req.idToken!,
          tenantId
        );

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="tcms_backup_${tenantId}_${new Date().toISOString().slice(0, 10)}.json"`
        );
        res.send(
          JSON.stringify(
            {
              tenantId,
              exportedAt: new Date().toISOString(),
              exportedBy: req.user!.email,
              collections: {
                users,
                candidates: candidates.map((c) => sanitizeCandidateForClient(c, req.user!.role)),
                organizations,
                courses,
                trainers,
                batches,
                enrollments,
                certificates,
              },
            },
            null,
            2
          )
        );
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  return router;
}
