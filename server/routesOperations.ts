import { Router } from 'express';
import {
  fsCommit,
  fsCreateDoc,
  fsDeleteDoc,
  fsGetDoc,
  fsQueryTenantDocs,
  fsUpdateDoc,
  nextSequenceCode,
  type CommitWriteOp,
} from './firestoreRest.ts';
import {
  decryptSensitive,
  encryptSensitive,
  generateVerificationToken,
  hashVerificationToken,
  hmacIdentityHash,
  hmacTenantIdentityHash,
  maskIdentity,
  randomId,
} from './crypto.ts';
import { deletePrivateFile, savePrivateFile } from './fileVault.ts';
import { exportTableToWorkbook } from './excelService.ts';
import {
  generateAttendanceSheetPdf,
  generateCertificatePdf,
  generateTrainingCardPdf,
} from './pdfGenerator.ts';
import {
  createNotification,
  evaluateCompletionEligibility,
  getCompanyBranding,
  getRolePermissionMatrix,
  requireAuth,
  requirePermission,
  requireRole,
  resolveCardTemplate,
  resolveCertificateTemplate,
  sanitizeCandidateForClient,
  writeAuditLog,
  type AuthedRequest,
} from './helpers.ts';
import {
  assertRecordTenant,
  assertTenantPlanLimit,
  DEFAULT_TENANT_ID,
  isTenantAdminOrOwnerRole,
  isTenantOwnerRole,
  tenantScopedDocId,
  TenantSecurityError,
} from './tenantService.ts';
import { dispatchAutomatedCategoryNotifications } from './messagingService.ts';
import { hasPermission } from '../src/lib/permissions.ts';
import { validateCandidateDocumentFile } from '../src/lib/documentValidation.ts';
import type {
  AssessmentRecord,
  AttendanceRecord,
  AuditLogItem,
  Batch,
  Candidate,
  CandidateDocument,
  CardTemplate,
  Certificate,
  CertificateTemplate,
  Course,
  Enrollment,
  EnrollmentRequest,
  Organization,
  PublicVerificationResult,
  Trainer,
  TrainingCard,
  UserProfile,
} from '../src/types/tcms.ts';

export function getAppBaseUrl(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && envUrl !== 'MY_APP_URL') return envUrl.replace(/\/$/, '');
  const host = req.get('host') || 'localhost:3000';
  return `${req.protocol}://${host}`;
}

export function certSeqPrefix(tenantId: string): string {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) return 'CERT';
  const suffix = tenantId.replace(/^ten_/, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || 'TEN';
  return `CERT-${suffix}`;
}

export async function createTrainingCardForEnrollment(params: {
  tenantId?: string;
  strictTenant?: boolean;
  enrollment: Enrollment;
  candidate: Candidate;
  course: Course;
  batch: Batch;
  actor: UserProfile;
  idToken: string;
  verifyBaseUrl: string;
  previousVersion?: number;
  preferredTemplateId?: string;
}): Promise<TrainingCard> {
  const {
    enrollment,
    candidate,
    course,
    batch,
    actor,
    idToken,
    verifyBaseUrl,
    previousVersion,
    preferredTemplateId,
  } = params;
  const tenantId = params.tenantId || enrollment.tenantId || candidate.tenantId || actor.tenantId || DEFAULT_TENANT_ID;
  const strictTenant = Boolean(params.strictTenant);
  const [company, template, rawTrainer] = await Promise.all([
    getCompanyBranding(idToken, tenantId),
    resolveCardTemplate(course, idToken, preferredTemplateId, tenantId, strictTenant),
    batch.trainerId
      ? fsGetDoc<Trainer>('trainers', batch.trainerId, idToken).catch(() => null)
      : Promise.resolve(null),
  ]);
  const trainer = rawTrainer && assertRecordTenant(rawTrainer, tenantId, !strictTenant) ? rawTrainer : null;
  const serial = await nextSequenceCode('CARD', 'CARD', true, idToken, 4, tenantId);
  const { tokenHash } = generateVerificationToken();
  const cardId = randomId('card');
  const version = (previousVersion || 0) + 1;

  const frozenTemplateConfig = template?.config
    ? (JSON.parse(JSON.stringify(template.config)) as CardTemplate['config'])
    : undefined;

  const snapshot: TrainingCard['snapshot'] = {
    candidateNameEn: candidate.fullNameEn,
    candidateNameAr: candidate.fullNameAr,
    iqamaMasked: candidate.iqamaMasked || '',
    courseTitleEn: course.titleEn,
    courseTitleAr: course.titleAr,
    courseCode: course.courseCode,
    batchNumber: batch.batchNumber,
    startDate: batch.startDate,
    endDate: batch.endDate,
    companyNameEn: company.nameEn || 'Training Center',
    companyNameAr: company.nameAr || '',
    photoFileId: candidate.photoFileId || '',
    trainerNameEn: trainer?.nameEn || '',
    trainerNameAr: trainer?.nameAr || '',
    venue: batch.venue || '',
    cardTitleEn: template?.config?.cardTitleEn || 'TRAINING CARD',
    cardTitleAr: template?.config?.cardTitleAr || 'بطاقة تدريب',
    companyLogoFileId: company.logoFileId || '',
    stampFileId: company.stampFileId || '',
    signatureFileId: company.signatureFileId || '',
    signatoryName: company.signatoryName || '',
    templateWidthMm: template?.widthMm || 85.6,
    templateHeightMm: template?.heightMm || 53.98,
    ...(frozenTemplateConfig ? { templateConfigSnapshot: frozenTemplateConfig } : {}),
  };

  const draftCard: TrainingCard = {
    id: cardId,
    tenantId,
    cardSerialNumber: serial,
    enrollmentId: enrollment.id,
    candidateDocId: candidate.id,
    candidateId: candidate.candidateId,
    candidateUserId: candidate.userId,
    organizationId: candidate.organizationId || enrollment.organizationId,
    courseId: course.id,
    batchId: batch.id,
    templateId: template?.id,
    templateName: template?.name || 'Default CR80 Layout',
    templateVersion: template?.version || 1,
    qrTokenHash: tokenHash,
    pdfFileId: '',
    version,
    status: 'active',
    snapshot,
    generatedBy: actor.uid,
  };

  const pdfBuffer = await generateTrainingCardPdf({
    cards: [draftCard],
    company,
    template,
    verifyBaseUrl,
    idToken,
    tenantId,
  });

  const savedFile = await savePrivateFile(
    pdfBuffer,
    {
      tenantId,
      fileName: `${serial}.pdf`,
      mimeType: 'application/pdf',
      category: 'training_card',
      organizationId: draftCard.organizationId,
      candidateDocId: candidate.id,
      candidateUserId: candidate.userId,
      uploadedBy: actor.uid,
    },
    idToken
  );

  const cardRecord: Record<string, unknown> = {
    tenantId,
    cardSerialNumber: serial,
    enrollmentId: enrollment.id,
    candidateDocId: candidate.id,
    candidateId: candidate.candidateId,
    courseId: course.id,
    batchId: batch.id,
    templateName: draftCard.templateName,
    templateVersion: draftCard.templateVersion,
    qrTokenHash: tokenHash,
    pdfFileId: savedFile.fileId,
    version,
    status: 'active',
    snapshot,
    generatedBy: actor.uid,
  };
  if (candidate.userId) cardRecord.candidateUserId = candidate.userId;
  if (draftCard.organizationId) cardRecord.organizationId = draftCard.organizationId;
  if (template?.id) cardRecord.templateId = template.id;

  await fsCreateDoc('trainingCards', cardId, cardRecord, idToken, ['createdAt']);
  await fsUpdateDoc(
    'enrollments',
    enrollment.id,
    { trainingCardId: cardId },
    idToken,
    ['updatedAt']
  );

  draftCard.pdfFileId = savedFile.fileId;
  return draftCard;
}

export function createOperationsRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Candidates Registration & Management
  // ---------------------------------------------------------------------------
  async function findIdentityDuplicates(params: {
    tenantId: string;
    strictTenant?: boolean;
    iqamaNumber?: string;
    passportNumber?: string;
    excludeDocId?: string;
    actor: UserProfile;
    idToken: string;
  }) {
    const { tenantId, strictTenant, iqamaNumber, passportNumber, excludeDocId, actor, idToken } = params;
    const allowFallback = !strictTenant;
    const checks: Array<{ idType: 'iqama' | 'passport'; hashes: string[] }> = [];
    if (iqamaNumber && iqamaNumber.trim()) {
      const hList = [hmacTenantIdentityHash(tenantId, 'iqama', iqamaNumber)];
      if (allowFallback && tenantId === DEFAULT_TENANT_ID) {
        hList.push(hmacIdentityHash('iqama', iqamaNumber));
      }
      checks.push({ idType: 'iqama', hashes: Array.from(new Set(hList)) });
    }
    if (passportNumber && passportNumber.trim()) {
      const hList = [hmacTenantIdentityHash(tenantId, 'passport', passportNumber)];
      if (allowFallback && tenantId === DEFAULT_TENANT_ID) {
        hList.push(hmacIdentityHash('passport', passportNumber));
      }
      checks.push({ idType: 'passport', hashes: Array.from(new Set(hList)) });
    }
    const matches: Array<{
      idType: 'iqama' | 'passport';
      candidateDocId: string;
      candidateId: string;
      sameOrganization: boolean;
      canResolve: boolean;
      candidate?: Candidate;
    }> = [];
    const seenPairs = new Set<string>();

    for (const chk of checks) {
      for (const h of chk.hashes) {
        const entry = await fsGetDoc<{ candidateDocId: string; candidateId: string; tenantId?: string }>(
          'identityHashes',
          h,
          idToken
        ).catch(() => null);
        if (!entry || (excludeDocId && entry.candidateDocId === excludeDocId)) continue;
        if (!assertRecordTenant(entry, tenantId, allowFallback)) continue;

        const pairKey = `${chk.idType}:${entry.candidateDocId}`;
        if (seenPairs.has(pairKey)) continue;

        const matchedCand = await fsGetDoc<Candidate & { iqamaHash?: string; passportHash?: string }>(
          'candidates',
          entry.candidateDocId,
          idToken
        ).catch(() => null);
        if (!matchedCand || !assertRecordTenant(matchedCand, tenantId, allowFallback)) continue;

        seenPairs.add(pairKey);
        if (actor.role === 'corporate_client') {
          const sameOrg = Boolean(actor.organizationId && matchedCand.organizationId === actor.organizationId);
          matches.push({
            idType: chk.idType,
            candidateDocId: entry.candidateDocId,
            candidateId: entry.candidateId,
            sameOrganization: sameOrg,
            canResolve: sameOrg,
            ...(sameOrg ? { candidate: sanitizeCandidateForClient(matchedCand, actor.role) } : {}),
          });
        } else {
          matches.push({
            idType: chk.idType,
            candidateDocId: entry.candidateDocId,
            candidateId: entry.candidateId,
            sameOrganization: true,
            canResolve: isTenantAdminOrOwnerRole(actor.role),
            candidate: sanitizeCandidateForClient(matchedCand, actor.role),
          });
        }
      }
    }
    return matches;
  }

  async function fetchFilteredCandidatesForUser(req: AuthedRequest): Promise<Candidate[]> {
    const role = req.user!.role;
    const idToken = req.idToken!;
    const tenantId = req.tenantId!;
    const strictTenant = Boolean(req.strictTenantQuery);
    let candidates: Array<Candidate & { iqamaHash?: string; passportHash?: string }> = [];
    let enrollments: Enrollment[] = [];
    let certificates: Certificate[] = [];

    if (role === 'corporate_client') {
      if (!req.user!.organizationId) return [];
      const orgId = req.user!.organizationId;
      [candidates, enrollments, certificates] = await Promise.all([
        fsQueryTenantDocs<Candidate & { iqamaHash?: string; passportHash?: string }>('candidates', tenantId, idToken, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<Certificate>('certificates', tenantId, idToken, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: orgId }],
          strictTenantFilter: strictTenant,
        }),
      ]);
    } else if (role === 'candidate') {
      candidates = await fsQueryTenantDocs('candidates', tenantId, idToken, {
        filters: [{ field: 'userId', op: 'EQUAL', value: req.user!.uid }],
        strictTenantFilter: strictTenant,
      });
      if (candidates.length === 0 && req.user!.candidateId) {
        const bound = await fsGetDoc<Candidate & { iqamaHash?: string; passportHash?: string }>(
          'candidates',
          req.user!.candidateId,
          idToken
        ).catch(() => null);
        if (bound && assertRecordTenant(bound, tenantId, !strictTenant)) candidates = [bound];
      }
      const candDocIds = new Set(candidates.map((c) => c.id));
      if (candDocIds.size > 0) {
        [enrollments, certificates] = await Promise.all([
          fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
            filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
            strictTenantFilter: strictTenant,
          }),
          fsQueryTenantDocs<Certificate>('certificates', tenantId, idToken, {
            filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
            strictTenantFilter: strictTenant,
          }),
        ]);
      }
    } else if (role === 'trainer') {
      enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
        filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
        strictTenantFilter: strictTenant,
      });
      const assignedCandidateIds = new Set(enrollments.map((e) => e.candidateDocId));
      if (assignedCandidateIds.size === 0) return [];
      const allCandidates = await fsQueryTenantDocs<Candidate & { iqamaHash?: string; passportHash?: string }>(
        'candidates',
        tenantId,
        idToken,
        { strictTenantFilter: strictTenant }
      );
      candidates = allCandidates.filter((c) => assignedCandidateIds.has(c.id));
    } else {
      [candidates, enrollments, certificates] = await Promise.all([
        fsQueryTenantDocs<Candidate & { iqamaHash?: string; passportHash?: string }>('candidates', tenantId, idToken, {
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<Certificate>('certificates', tenantId, idToken, {
          strictTenantFilter: strictTenant,
        }),
      ]);
    }

    const enrollmentCounts = new Map<string, number>();
    const candidateCourses = new Map<string, Set<string>>();
    for (const e of enrollments) {
      if (['cancelled', 'withdrawn'].includes(e.status)) continue;
      enrollmentCounts.set(e.candidateDocId, (enrollmentCounts.get(e.candidateDocId) || 0) + 1);
      if (!candidateCourses.has(e.candidateDocId)) {
        candidateCourses.set(e.candidateDocId, new Set());
      }
      candidateCourses.get(e.candidateDocId)!.add(e.courseId);
    }

    const certificateCounts = new Map<string, number>();
    for (const cert of certificates) {
      if (cert.status === 'revoked' || cert.status === 'superseded') continue;
      certificateCounts.set(cert.candidateDocId, (certificateCounts.get(cert.candidateDocId) || 0) + 1);
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const orgFilter = String(req.query.organizationId || '').trim();
    const nationalityFilter = String(req.query.nationality || '').trim().toLowerCase();
    const companyFilter = String(req.query.companyName || '').trim().toLowerCase();
    const courseFilter = String(req.query.courseId || '').trim();

    let identityMatchedDocId: string | null = null;
    if (
      q &&
      (isTenantAdminOrOwnerRole(role) || ['certificate_officer', 'corporate_client'].includes(role)) &&
      /^[A-Za-z0-9\-]{5,30}$/.test(q)
    ) {
      const iqTenantHash = hmacTenantIdentityHash(tenantId, 'iqama', q);
      const ppTenantHash = hmacTenantIdentityHash(tenantId, 'passport', q);
      const [iqEntry, ppEntry, iqLegacy, ppLegacy] = await Promise.all([
        fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', iqTenantHash, idToken).catch(() => null),
        fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', ppTenantHash, idToken).catch(() => null),
        !strictTenant && tenantId === DEFAULT_TENANT_ID
          ? fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', hmacIdentityHash('iqama', q), idToken).catch(() => null)
          : Promise.resolve(null),
        !strictTenant && tenantId === DEFAULT_TENANT_ID
          ? fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', hmacIdentityHash('passport', q), idToken).catch(() => null)
          : Promise.resolve(null),
      ]);
      const validMatch = [iqEntry, ppEntry, iqLegacy, ppLegacy].find(
        (m) => m && assertRecordTenant(m, tenantId, !strictTenant)
      );
      identityMatchedDocId = validMatch?.candidateDocId || null;
    }

    return candidates
      .filter((c) => {
        if (status && status !== 'all' && c.status !== status) return false;
        if (orgFilter && orgFilter !== 'all') {
          if (orgFilter === '__individual__') {
            if (c.organizationId) return false;
          } else if (c.organizationId !== orgFilter) {
            return false;
          }
        }
        if (nationalityFilter && nationalityFilter !== 'all') {
          if (c.nationality.toLowerCase() !== nationalityFilter) return false;
        }
        if (companyFilter && companyFilter !== 'all') {
          if (!(c.companyName || '').toLowerCase().includes(companyFilter)) return false;
        }
        if (courseFilter && courseFilter !== 'all') {
          const enrolledSet = candidateCourses.get(c.id);
          if (!enrolledSet || !enrolledSet.has(courseFilter)) return false;
        }
        if (!q) return true;
        if (identityMatchedDocId && c.id === identityMatchedDocId) return true;
        return (
          c.candidateId.toLowerCase().includes(q) ||
          c.fullNameEn.toLowerCase().includes(q) ||
          c.fullNameAr.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.companyName || '').toLowerCase().includes(q) ||
          (c.employeeId || '').toLowerCase().includes(q) ||
          (c.jobTitle || '').toLowerCase().includes(q) ||
          (c.department || '').toLowerCase().includes(q) ||
          (c.workLocation || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.registrationDate || b.createdAt || '').localeCompare(a.registrationDate || a.createdAt || ''))
      .map((c) => ({
        ...sanitizeCandidateForClient(c, role),
        enrolledCoursesCount: enrollmentCounts.get(c.id) || 0,
        ...(role !== 'trainer' ? { issuedCertificatesCount: certificateCounts.get(c.id) || 0 } : {}),
      }));
  }

  router.get('/candidates/check-duplicate', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const matrix = req.roleMatrix || (await getRolePermissionMatrix(req.idToken!, tenantId));
      const allowed =
        isTenantOwnerRole(req.user!.role) ||
        hasPermission(req.user!, 'candidates', 'create', matrix) ||
        hasPermission(req.user!, 'candidates', 'edit', matrix);
      if (!allowed) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const iqamaNumber = String(req.query.iqamaNumber || '').trim();
      const passportNumber = String(req.query.passportNumber || '').trim();
      const excludeDocId = String(req.query.excludeDocId || '').trim() || undefined;
      const duplicates = await findIdentityDuplicates({
        tenantId,
        strictTenant: Boolean(req.strictTenantQuery),
        iqamaNumber,
        passportNumber,
        excludeDocId,
        actor: req.user!,
        idToken: req.idToken!,
      });
      res.json({ duplicates });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get(
    '/candidates/export',
    requireAuth,
    requirePermission('candidates', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const role = req.user!.role;
        if (role === 'candidate' || role === 'trainer') {
          res.status(403).json({ error: 'Forbidden: Excel export is restricted to authorized administrators and corporate managers' });
          return;
        }
        const rowsData = await fetchFilteredCandidatesForUser(req);
        const headers = [
          'Candidate ID',
          'Full Name (EN)',
          'Full Name (AR)',
          'Gender',
          'Nationality',
          'Iqama (Masked)',
          'Iqama Expiry',
          'Passport (Masked)',
          'Passport Expiry',
          'Mobile',
          'Email',
          'Company / Employer',
          'Employee ID',
          'Job Title',
          'Department',
          'Work Location',
          'Registration Date',
          'Status',
          'Enrolled Courses',
          'Issued Certificates',
        ];
        const rows = rowsData.map((c) => [
          c.candidateId,
          c.fullNameEn,
          c.fullNameAr,
          c.gender || '-',
          c.nationality,
          c.iqamaMasked || '-',
          c.iqamaExpiryDate || '-',
          c.passportMasked || '-',
          c.passportExpiryDate || '-',
          c.mobile,
          c.email || '-',
          c.companyName || 'Individual',
          c.employeeId || '-',
          c.jobTitle || '-',
          c.department || '-',
          c.workLocation || '-',
          c.registrationDate,
          c.status,
          c.enrolledCoursesCount ?? 0,
          c.issuedCertificatesCount ?? 0,
        ]);

        const buf = await exportTableToWorkbook('Candidates', headers, rows, 'xlsx');
        await writeAuditLog(
          req.user!,
          'EXPORT_CANDIDATES',
          'candidates',
          'export',
          `Exported ${rowsData.length} candidate record(s) to Excel`,
          req.idToken!,
          req.tenantId!
        );
        const dateTag = new Date().toISOString().slice(0, 10);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="candidates_export_${dateTag}.xlsx"`);
        res.send(buf);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get('/candidates', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const candidates = await fetchFilteredCandidatesForUser(req);
      res.json({ candidates });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/candidates',
    requireAuth,
    requirePermission('candidates', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const body = req.body as Record<string, unknown>;
        const iqamaRaw = String(body.iqamaNumber || '').trim();
        const passportRaw = String(body.passportNumber || '').trim();
        const fullNameEn = String(body.fullNameEn || '').trim().slice(0, 200);
        const fullNameAr = String(body.fullNameAr || fullNameEn).trim().slice(0, 200);
        const nationality = String(body.nationality || '').trim().slice(0, 100);
        const mobile = String(body.mobile || '').trim().slice(0, 32);

        if (fullNameEn.length < 2 || !nationality || mobile.length < 5) {
          res.status(400).json({ error: 'Full name (min 2 chars), nationality, and valid mobile number are required' });
          return;
        }
        if (!iqamaRaw && !passportRaw) {
          res.status(400).json({ error: 'Either Iqama number or Passport number is required' });
          return;
        }

        const duplicates = await findIdentityDuplicates({
          tenantId,
          strictTenant,
          iqamaNumber: iqamaRaw,
          passportNumber: passportRaw,
          actor: req.user!,
          idToken: req.idToken!,
        });

        if (duplicates.length > 0) {
          const dupTypes = duplicates.map((d) => (d.idType === 'iqama' ? 'Iqama' : 'Passport')).join(' & ');
          res.status(409).json({
            error: `Duplicate ${dupTypes} number detected in registry`,
            code: 'DUPLICATE_IDENTITY',
            duplicates,
          });
          return;
        }

        const iqamaHash = iqamaRaw ? hmacTenantIdentityHash(tenantId, 'iqama', iqamaRaw) : '';
        const passportHash = passportRaw ? hmacTenantIdentityHash(tenantId, 'passport', passportRaw) : '';

        const orgId =
          req.user!.role === 'corporate_client'
            ? req.user!.organizationId || ''
            : String(body.organizationId || '').trim();

        let companyName = String(body.companyName || '').trim().slice(0, 200);
        if (orgId) {
          const org = await fsGetDoc<Organization>('organizations', orgId, req.idToken!);
          if (!org || !assertRecordTenant(org, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: organization belongs to another tenant workspace' });
            return;
          }
          if (!companyName) companyName = org.nameEn;
        }

        await assertTenantPlanLimit({
          tenantId,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: strictTenant,
          metric: 'maxCandidates',
        });

        const candidateId = await nextSequenceCode('CND', 'CND', true, req.idToken!, 5, tenantId);
        const candidateDocId = tenantScopedDocId(tenantId, candidateId);

        const rawStatus = String(body.status || 'active');
        const status = ['active', 'inactive', 'archived', 'suspended'].includes(rawStatus)
          ? rawStatus
          : 'active';

        const candidateData: Record<string, unknown> = {
          tenantId,
          candidateId,
          fullNameEn,
          fullNameAr,
          nationality,
          mobile,
          registrationDate: String(body.registrationDate || new Date().toISOString().slice(0, 10)).slice(0, 32),
          status: req.user!.role === 'corporate_client' ? 'active' : status,
          createdBy: req.user!.uid,
        };
        if (body.userId) candidateData.userId = String(body.userId).trim().slice(0, 128);
        if (body.gender === 'male' || body.gender === 'female') candidateData.gender = body.gender;
        if (body.dateOfBirth) candidateData.dateOfBirth = String(body.dateOfBirth).trim().slice(0, 32);
        if (body.email) candidateData.email = String(body.email).trim().slice(0, 200);
        if (orgId) candidateData.organizationId = orgId.slice(0, 128);
        if (companyName) candidateData.companyName = companyName;
        if (body.employeeId) candidateData.employeeId = String(body.employeeId).trim().slice(0, 64);
        if (body.jobTitle) candidateData.jobTitle = String(body.jobTitle).trim().slice(0, 160);
        if (body.department) candidateData.department = String(body.department).trim().slice(0, 160);
        if (body.workLocation) candidateData.workLocation = String(body.workLocation).trim().slice(0, 200);
        if (body.address) candidateData.address = String(body.address).trim().slice(0, 400);
        if (body.emergencyContact) candidateData.emergencyContact = String(body.emergencyContact).trim().slice(0, 200);
        if (body.notes) candidateData.notes = String(body.notes).trim().slice(0, 1500);
        if (body.photoFileId) candidateData.photoFileId = String(body.photoFileId).trim().slice(0, 256);

        if (iqamaRaw) {
          candidateData.iqamaEncrypted = encryptSensitive(iqamaRaw);
          candidateData.iqamaMasked = maskIdentity(iqamaRaw);
          candidateData.iqamaHash = iqamaHash;
        }
        if (body.iqamaExpiryDate) {
          candidateData.iqamaExpiryDate = String(body.iqamaExpiryDate).trim().slice(0, 32);
        }
        if (passportRaw) {
          candidateData.passportEncrypted = encryptSensitive(passportRaw);
          candidateData.passportMasked = maskIdentity(passportRaw);
          candidateData.passportHash = passportHash;
        }
        if (body.passportExpiryDate) {
          candidateData.passportExpiryDate = String(body.passportExpiryDate).trim().slice(0, 32);
        }

        const ops: CommitWriteOp[] = [
          {
            type: 'create',
            collection: 'candidates',
            docId: candidateDocId,
            data: candidateData,
            serverTimestampFields: ['createdAt', 'updatedAt'],
          },
        ];

        if (iqamaHash) {
          ops.push({
            type: 'create',
            collection: 'identityHashes',
            docId: iqamaHash,
            data: { tenantId, hashKey: iqamaHash, idType: 'iqama', candidateDocId, candidateId },
            serverTimestampFields: ['createdAt'],
          });
        }
        if (passportHash) {
          ops.push({
            type: 'create',
            collection: 'identityHashes',
            docId: passportHash,
            data: { tenantId, hashKey: passportHash, idType: 'passport', candidateDocId, candidateId },
            serverTimestampFields: ['createdAt'],
          });
        }

        await fsCommit(ops, req.idToken!);
        await writeAuditLog(
          req.user!,
          'CREATE_CANDIDATE',
          'candidates',
          candidateDocId,
          `Registered candidate ${candidateId} (${fullNameEn})`,
          req.idToken!,
          tenantId
        );

        const created = await fsGetDoc<Candidate>('candidates', candidateDocId, req.idToken!);
        if (created) {
          void dispatchAutomatedCategoryNotifications({
            tenantId,
            category: 'candidate_registration',
            candidate: {
              id: created.id,
              candidateId: created.candidateId,
              userId: created.userId,
              fullNameEn: created.fullNameEn,
              fullNameAr: created.fullNameAr,
              email: created.email,
              mobile: created.mobile,
              organizationId: created.organizationId,
              tenantId,
            },
            entityId: created.candidateId,
            actor: req.user!,
            idToken: req.idToken!,
          });
        }
        res.json({ candidate: created ? sanitizeCandidateForClient(created, req.user!.role) : null });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/candidates/:id',
    requireAuth,
    requirePermission('candidates', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const docId = String(req.params.id);
        const existing = await fsGetDoc<
          Candidate & { organizationId?: string; iqamaHash?: string; passportHash?: string }
        >('candidates', docId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant candidate access denied' });
          return;
        }
        if (
          req.user!.role === 'corporate_client' &&
          existing.organizationId !== req.user!.organizationId
        ) {
          res.status(403).json({ error: 'Organization isolation violation' });
          return;
        }

        const updates: Record<string, unknown> = {};
        const isCorp = req.user!.role === 'corporate_client';
        const allowedFields = isCorp
          ? [
              'fullNameEn',
              'fullNameAr',
              'gender',
              'iqamaExpiryDate',
              'passportExpiryDate',
              'nationality',
              'dateOfBirth',
              'mobile',
              'email',
              'employeeId',
              'jobTitle',
              'department',
              'workLocation',
              'address',
              'emergencyContact',
              'notes',
              'photoFileId',
            ]
          : [
              'fullNameEn',
              'fullNameAr',
              'gender',
              'iqamaExpiryDate',
              'passportExpiryDate',
              'nationality',
              'dateOfBirth',
              'mobile',
              'email',
              'organizationId',
              'companyName',
              'employeeId',
              'jobTitle',
              'department',
              'workLocation',
              'address',
              'emergencyContact',
              'notes',
              'photoFileId',
              'status',
              'userId',
            ];

        for (const f of allowedFields) {
          if (req.body[f] === undefined) continue;
          const val = String(req.body[f]).trim();
          if (f === 'gender') {
            if (val === 'male' || val === 'female') updates[f] = val;
            continue;
          }
          if (f === 'status') {
            if (['active', 'inactive', 'archived', 'suspended'].includes(val)) {
              updates[f] = val;
            }
            continue;
          }
          updates[f] = val;
        }

        if (!isCorp && updates.organizationId && req.body.companyName === undefined) {
          const org = await fsGetDoc<Organization>('organizations', String(updates.organizationId), req.idToken!);
          if (!org || !assertRecordTenant(org, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: organization belongs to another tenant workspace' });
            return;
          }
          updates.companyName = org.nameEn;
        }

        const extraOps: CommitWriteOp[] = [];
        const canEditIdentityNumbers = isTenantAdminOrOwnerRole(req.user!.role);

        if (canEditIdentityNumbers) {
          const newIqama = req.body.iqamaNumber !== undefined ? String(req.body.iqamaNumber || '').trim() : '';
          const newPassport = req.body.passportNumber !== undefined ? String(req.body.passportNumber || '').trim() : '';

          if (newIqama || newPassport) {
            const duplicates = await findIdentityDuplicates({
              tenantId,
              strictTenant,
              iqamaNumber: newIqama || undefined,
              passportNumber: newPassport || undefined,
              excludeDocId: docId,
              actor: req.user!,
              idToken: req.idToken!,
            });
            if (duplicates.length > 0) {
              res.status(409).json({
                error: 'Duplicate identity number detected in registry',
                code: 'DUPLICATE_IDENTITY',
                duplicates,
              });
              return;
            }
          }

          if (newIqama) {
            const newHash = hmacTenantIdentityHash(tenantId, 'iqama', newIqama);
            updates.iqamaEncrypted = encryptSensitive(newIqama);
            updates.iqamaMasked = maskIdentity(newIqama);
            updates.iqamaHash = newHash;
            if (newHash !== existing.iqamaHash) {
              extraOps.push({
                type: 'set',
                collection: 'identityHashes',
                docId: newHash,
                data: {
                  tenantId,
                  hashKey: newHash,
                  idType: 'iqama',
                  candidateDocId: docId,
                  candidateId: existing.candidateId,
                },
                serverTimestampFields: ['createdAt'],
              });
              if (existing.iqamaHash) {
                extraOps.push({
                  type: 'delete',
                  collection: 'identityHashes',
                  docId: existing.iqamaHash,
                });
              }
            }
          }

          if (newPassport) {
            const newHash = hmacTenantIdentityHash(tenantId, 'passport', newPassport);
            updates.passportEncrypted = encryptSensitive(newPassport);
            updates.passportMasked = maskIdentity(newPassport);
            updates.passportHash = newHash;
            if (newHash !== existing.passportHash) {
              extraOps.push({
                type: 'set',
                collection: 'identityHashes',
                docId: newHash,
                data: {
                  tenantId,
                  hashKey: newHash,
                  idType: 'passport',
                  candidateDocId: docId,
                  candidateId: existing.candidateId,
                },
                serverTimestampFields: ['createdAt'],
              });
              if (existing.passportHash) {
                extraOps.push({
                  type: 'delete',
                  collection: 'identityHashes',
                  docId: existing.passportHash,
                });
              }
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          if (!existing.tenantId) updates.tenantId = tenantId;
          const ops: CommitWriteOp[] = [
            {
              type: 'update',
              collection: 'candidates',
              docId,
              data: updates,
              updateFields: Object.keys(updates),
              serverTimestampFields: ['updatedAt'],
            },
            ...extraOps,
          ];
          await fsCommit(ops, req.idToken!);
        }

        const auditAction =
          updates.status === 'archived' && existing.status !== 'archived'
            ? 'ARCHIVE_CANDIDATE'
            : updates.status === 'active' && existing.status === 'archived'
              ? 'RESTORE_CANDIDATE'
              : 'UPDATE_CANDIDATE';

        const safeLogSummary = { ...updates };
        delete safeLogSummary.iqamaEncrypted;
        delete safeLogSummary.passportEncrypted;
        delete safeLogSummary.iqamaHash;
        delete safeLogSummary.passportHash;

        await writeAuditLog(
          req.user!,
          auditAction,
          'candidates',
          docId,
          JSON.stringify(safeLogSummary),
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<Candidate>('candidates', docId, req.idToken!);
        res.json({ candidate: updated ? sanitizeCandidateForClient(updated, req.user!.role) : null });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get('/candidates/:id/profile', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const docId = String(req.params.id);
      const role = req.user!.role;
      const cand = await fsGetDoc<Candidate & { iqamaEncrypted?: string; passportEncrypted?: string }>(
        'candidates',
        docId,
        req.idToken!
      );
      if (!cand) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }
      if (!assertRecordTenant(cand, tenantId, !strictTenant)) {
        res.status(403).json({ error: 'Forbidden: cross-tenant candidate profile denied' });
        return;
      }
      if (role === 'corporate_client' && cand.organizationId !== req.user!.organizationId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (role === 'candidate' && cand.userId !== req.user!.uid && cand.id !== req.user!.candidateId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
        filters: [
          { field: 'candidateDocId', op: 'EQUAL', value: docId },
          ...(role === 'trainer'
            ? [{ field: 'trainerUserId' as const, op: 'EQUAL' as const, value: req.user!.uid }]
            : []),
        ],
        strictTenantFilter: strictTenant,
      });

      if (role === 'trainer' && enrollments.length === 0) {
        res.status(403).json({ error: 'Trainers can only access candidates enrolled in their assigned batches' });
        return;
      }

      const trainerBatchSet = new Set(enrollments.map((e) => e.batchId));
      const canSeeDocs =
        isTenantAdminOrOwnerRole(role) || ['certificate_officer', 'corporate_client', 'candidate'].includes(role);
      const canSeeAttAssess =
        isTenantAdminOrOwnerRole(role) || ['certificate_officer', 'trainer', 'corporate_client'].includes(role);

      const [documents, attendance, assessments, trainingCards, certificates, rawAuditLogs] =
        await Promise.all([
          canSeeDocs
            ? fsQueryTenantDocs<CandidateDocument>('candidateDocuments', tenantId, req.idToken!, {
                filters: [{ field: 'candidateId', op: 'EQUAL', value: docId }],
                strictTenantFilter: strictTenant,
              })
            : Promise.resolve([]),
          canSeeAttAssess
            ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                filters: [
                  { field: 'candidateDocId', op: 'EQUAL', value: docId },
                  ...(role === 'trainer'
                    ? [{ field: 'trainerUserId' as const, op: 'EQUAL' as const, value: req.user!.uid }]
                    : []),
                ],
                strictTenantFilter: strictTenant,
              })
            : Promise.resolve([]),
          canSeeAttAssess
            ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                filters: [
                  { field: 'candidateDocId', op: 'EQUAL', value: docId },
                  ...(role === 'trainer'
                    ? [{ field: 'trainerUserId' as const, op: 'EQUAL' as const, value: req.user!.uid }]
                    : []),
                ],
                strictTenantFilter: strictTenant,
              })
            : Promise.resolve([]),
          fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
            filters: [{ field: 'candidateDocId', op: 'EQUAL', value: docId }],
            strictTenantFilter: strictTenant,
          }).then((cards) =>
            role === 'trainer' ? cards.filter((c) => trainerBatchSet.has(c.batchId)) : cards
          ),
          role === 'trainer'
            ? Promise.resolve([])
            : fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                filters: [{ field: 'candidateDocId', op: 'EQUAL', value: docId }],
                strictTenantFilter: strictTenant,
              }),
          isTenantOwnerRole(role)
            ? fsQueryTenantDocs<AuditLogItem>('auditLogs', tenantId, req.idToken!, {
                filters: [{ field: 'entityId', op: 'EQUAL', value: docId }],
                strictTenantFilter: strictTenant,
              })
            : Promise.resolve([]),
        ]);

      // Build chronological activity timeline combining audit logs + operational lifecycle milestones
      const timeline: AuditLogItem[] = [...rawAuditLogs];
      if (cand.createdAt || cand.registrationDate) {
        timeline.push({
          id: `reg_${cand.id}`,
          tenantId,
          actorUid: cand.createdBy,
          actorRole: 'system',
          action: 'CANDIDATE_REGISTERED',
          entityType: 'candidates',
          entityId: cand.id,
          details: `${cand.candidateId} · ${cand.fullNameEn}`,
          createdAt: cand.createdAt || `${cand.registrationDate}T00:00:00.000Z`,
        });
      }
      for (const enr of enrollments) {
        timeline.push({
          id: `enr_${enr.id}`,
          tenantId,
          actorUid: enr.requestedBy,
          actorRole: 'system',
          action: `ENROLLMENT_${enr.status.toUpperCase()}`,
          entityType: 'enrollments',
          entityId: enr.id,
          details: `${enr.enrollmentNumber} · Batch ${enr.batchId}`,
          createdAt: enr.updatedAt || enr.createdAt || '',
        });
      }
      for (const card of trainingCards) {
        timeline.push({
          id: `card_${card.id}`,
          tenantId,
          actorUid: card.generatedBy,
          actorRole: 'system',
          action: 'TRAINING_CARD_ISSUED',
          entityType: 'trainingCards',
          entityId: card.id,
          details: `${card.cardSerialNumber} (v${card.version})`,
          createdAt: card.createdAt || '',
        });
      }
      for (const assess of assessments) {
        timeline.push({
          id: `assess_${assess.id}`,
          tenantId,
          actorUid: assess.assessorId,
          actorRole: 'system',
          action: `ASSESSMENT_${assess.result.toUpperCase()}`,
          entityType: 'assessments',
          entityId: assess.id,
          details: `${assess.assessmentType} #${assess.attemptNumber}: ${assess.obtainedMarks}/${assess.maxMarks}`,
          createdAt: assess.createdAt || `${assess.assessmentDate}T00:00:00.000Z`,
        });
      }
      if (role !== 'trainer') {
        for (const docItem of documents) {
          timeline.push({
            id: `doc_${docItem.id}`,
            tenantId,
            actorUid: docItem.uploadedBy,
            actorRole: 'system',
            action: 'DOCUMENT_UPLOADED',
            entityType: 'candidateDocuments',
            entityId: docItem.id,
            details: `${docItem.documentType} · ${docItem.fileName}`,
            createdAt: docItem.createdAt || '',
          });
        }
        for (const cert of certificates) {
          timeline.push({
            id: `cert_${cert.id}`,
            tenantId,
            actorUid: cert.issuedBy,
            actorRole: 'system',
            action: `CERTIFICATE_${cert.status.toUpperCase()}`,
            entityType: 'certificates',
            entityId: cert.id,
            details: `${cert.certificateNumber} · ${cert.snapshot?.courseTitleEn || cert.courseId}`,
            createdAt: cert.createdAt || `${cert.issueDate}T00:00:00.000Z`,
          });
        }
      }

      const activity = timeline.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      res.json({
        candidate: sanitizeCandidateForClient(cand, role),
        documents,
        enrollments,
        attendance,
        assessments,
        trainingCards,
        certificates,
        activity,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/candidates/:id/reveal-identity',
    requireAuth,
    requireRole(['super_admin', 'admin', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const docId = String(req.params.id);
        const cand = await fsGetDoc<{ tenantId?: string; iqamaEncrypted?: string; passportEncrypted?: string }>(
          'candidates',
          docId,
          req.idToken!
        );
        if (!cand) {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        if (!assertRecordTenant(cand, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant candidate identity access denied' });
          return;
        }
        await writeAuditLog(
          req.user!,
          'REVEAL_CANDIDATE_IDENTITY',
          'candidates',
          docId,
          'Authorized user viewed decrypted Iqama/Passport number',
          req.idToken!,
          tenantId
        );
        res.json({
          iqamaNumber: cand.iqamaEncrypted ? decryptSensitive(cand.iqamaEncrypted) : '',
          passportNumber: cand.passportEncrypted ? decryptSensitive(cand.passportEncrypted) : '',
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/candidates/:id/documents',
    requireAuth,
    requirePermission('candidates', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const docId = String(req.params.id);
        const cand = await fsGetDoc<Candidate>('candidates', docId, req.idToken!);
        if (!cand) {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        if (!assertRecordTenant(cand, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant candidate document upload denied' });
          return;
        }
        if (
          req.user!.role === 'corporate_client' &&
          cand.organizationId !== req.user!.organizationId
        ) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        const vaultFileId = String(req.body.fileId || '').trim();
        if (!vaultFileId) {
          res.status(400).json({ error: 'fileId is required' });
          return;
        }
        const vaultMeta = await fsGetDoc<{ tenantId?: string }>('fileVault', vaultFileId, req.idToken!).catch(() => null);
        if (vaultMeta && !assertRecordTenant(vaultMeta, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: referenced file belongs to another tenant' });
          return;
        }

        const docRecordId = randomId('cdoc');
        const documentType = String(req.body.documentType || 'additional');
        if (!['photo', 'iqama_copy', 'passport_copy', 'additional'].includes(documentType)) {
          res.status(400).json({ error: 'Invalid candidate document type' });
          return;
        }
        const fileName = String(req.body.fileName || 'document').slice(0, 255);
        const mimeType = String(req.body.mimeType || '').trim().toLowerCase().slice(0, 100);
        const fileSize = Number(req.body.fileSize || 0);

        const docCheck = validateCandidateDocumentFile(
          { name: fileName, type: mimeType, size: fileSize },
          documentType,
          'en'
        );
        if (!docCheck.valid) {
          res.status(400).json({ error: docCheck.errorMessage || 'Invalid candidate document' });
          return;
        }

        const payload: Record<string, unknown> = {
          tenantId,
          candidateDocId: docId,
          candidateId: cand.id,
          documentType,
          fileName,
          mimeType: docCheck.normalizedMimeType || mimeType,
          fileSize,
          fileId: vaultFileId,
          uploadedBy: req.user!.uid,
        };
        if (cand.organizationId) payload.organizationId = cand.organizationId;

        await fsCreateDoc('candidateDocuments', docRecordId, payload, req.idToken!, ['createdAt']);
        if (payload.documentType === 'photo') {
          await fsUpdateDoc('candidates', docId, { photoFileId: payload.fileId }, req.idToken!, ['updatedAt']);
        }
        await writeAuditLog(
          req.user!,
          'UPLOAD_CANDIDATE_DOCUMENT',
          'candidates',
          docId,
          `Uploaded ${payload.documentType}: ${payload.fileName}`,
          req.idToken!,
          tenantId
        );
        res.json({ document: { id: docRecordId, ...payload } });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.delete(
    '/candidates/:id/documents/:docRecordId',
    requireAuth,
    requirePermission('candidates', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const docId = String(req.params.id);
        const docRecordId = String(req.params.docRecordId);
        const [cand, docRec] = await Promise.all([
          fsGetDoc<Candidate>('candidates', docId, req.idToken!),
          fsGetDoc<CandidateDocument>('candidateDocuments', docRecordId, req.idToken!),
        ]);
        if (!cand || !docRec || (docRec.candidateId !== docId && docRec.candidateDocId !== docId)) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }
        if (
          !assertRecordTenant(cand, tenantId, !strictTenant) ||
          !assertRecordTenant(docRec, tenantId, !strictTenant)
        ) {
          res.status(403).json({ error: 'Forbidden: cross-tenant document deletion denied' });
          return;
        }
        if (
          req.user!.role === 'corporate_client' &&
          cand.organizationId !== req.user!.organizationId
        ) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        await fsDeleteDoc('candidateDocuments', docRecordId, req.idToken!);
        if (cand.photoFileId && cand.photoFileId === docRec.fileId) {
          await fsUpdateDoc('candidates', docId, { photoFileId: '' }, req.idToken!, ['updatedAt']);
        }
        await deletePrivateFile(docRec.fileId, req.idToken!, tenantId);
        await writeAuditLog(
          req.user!,
          'DELETE_CANDIDATE_DOCUMENT',
          'candidates',
          docId,
          `Deleted ${docRec.documentType}: ${docRec.fileName}`,
          req.idToken!,
          tenantId
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Enrollments + Automatic Training Card Generation
  // ---------------------------------------------------------------------------
  router.get('/enrollments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const role = req.user!.role;
      let enrollments: Enrollment[] = [];
      if (role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ enrollments: [] });
          return;
        }
        enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'trainer') {
        enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'candidate') {
        enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
      } else {
        enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
      }
      res.json({ enrollments });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/enrollments/check-eligibility',
    requireAuth,
    requirePermission('enrollments', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const batchId = String(req.body?.batchId || '').trim();
        const candidateDocIds: string[] = Array.isArray(req.body?.candidateDocIds)
          ? Array.from(new Set(req.body.candidateDocIds.map(String).filter(Boolean)))
          : [];
        if (!batchId) {
          res.status(400).json({ error: 'batchId is required' });
          return;
        }
        const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant batch access denied' });
          return;
        }
        const course = await fsGetDoc<Course>('courses', batch.courseId, req.idToken!);
        if (!course || !assertRecordTenant(course, tenantId, !strictTenant)) {
          res.status(404).json({ error: 'Course not found' });
          return;
        }

        const [allEnrollments, allCourses, allCerts, allCandidates] = await Promise.all([
          fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, { strictTenantFilter: strictTenant }).catch(() => []),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter: strictTenant }).catch(() => []),
          fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, { strictTenantFilter: strictTenant }).catch(() => []),
          fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, { strictTenantFilter: strictTenant }).catch(() => []),
        ]);

        const courseMap = new Map(allCourses.map((c) => [c.id, c]));
        const candMap = new Map(allCandidates.map((c) => [c.id, c]));
        const hasPrerequisites = Boolean(course.prerequisites && course.prerequisites.trim());

        const candidateChecks = candidateDocIds.map((candDocId) => {
          const cand = candMap.get(candDocId);
          const candEnrollments = allEnrollments.filter((e) => e.candidateDocId === candDocId);
          const alreadyInBatch = candEnrollments.some(
            (e) => e.batchId === batchId && !['cancelled', 'withdrawn', 'failed'].includes(e.status)
          );
          const activeOtherEnrollmentsCount = candEnrollments.filter(
            (e) =>
              e.batchId !== batchId &&
              ['pending', 'confirmed', 'in_progress'].includes(e.status)
          ).length;
          const completedCourseIds = new Set<string>();
          for (const e of candEnrollments) {
            if (e.status === 'completed') completedCourseIds.add(e.courseId);
          }
          for (const c of allCerts) {
            if (c.candidateDocId === candDocId && c.status === 'valid') {
              completedCourseIds.add(c.courseId);
            }
          }
          const completedCourseCodes = Array.from(completedCourseIds)
            .map((cid) => courseMap.get(cid)?.courseCode || cid)
            .filter(Boolean);

          return {
            candidateDocId: candDocId,
            candidateId: cand?.candidateId || candDocId,
            fullNameEn: cand?.fullNameEn || candDocId,
            fullNameAr: cand?.fullNameAr || cand?.fullNameEn || candDocId,
            alreadyInBatch,
            activeOtherEnrollmentsCount,
            completedCoursesCount: completedCourseIds.size,
            completedCourseCodes,
            prerequisiteMet: !hasPrerequisites || completedCourseIds.size > 0,
          };
        });

        const enrolledCount = batch.enrollmentCount || 0;
        const availableSeats = Math.max(0, batch.capacity - enrolledCount);

        res.json({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          batchStatus: batch.status,
          batchClosed: Boolean(batch.enrollmentClosed) || ['cancelled', 'completed'].includes(batch.status),
          enrollmentClosed: Boolean(batch.enrollmentClosed),
          capacity: batch.capacity,
          enrollmentCount: enrolledCount,
          availableSeats,
          hasPrerequisites,
          prerequisitesText: course.prerequisites || '',
          candidates: candidateChecks,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/enrollments',
    requireAuth,
    requirePermission('enrollments', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const candidateDocIds: string[] = Array.isArray(req.body.candidateDocIds)
          ? Array.from(new Set(req.body.candidateDocIds.map(String).filter(Boolean)))
          : req.body.candidateDocId
            ? [String(req.body.candidateDocId)]
            : [];
        const batchId = String(req.body.batchId || '').trim();
        if (!batchId || candidateDocIds.length === 0) {
          res.status(400).json({ error: 'Batch and at least one candidate are required' });
          return;
        }

        const isCorporateReq = req.user!.role === 'corporate_client';
        const isAuthorizedAdmin = isTenantAdminOrOwnerRole(req.user!.role);
        const overrideCapacity = Boolean(req.body.overrideCapacity);
        const capacityOverrideReason = String(req.body.capacityOverrideReason || '').trim().slice(0, 500);
        const prerequisiteConfirmed = req.body.prerequisiteConfirmed !== false;
        const notes = String(req.body.notes || '').trim().slice(0, 500);

        const targetStatus = isCorporateReq
          ? 'pending'
          : req.body.confirmImmediately === false
            ? 'pending'
            : 'confirmed';

        const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant batch enrollment denied' });
          return;
        }
        if (batch.status === 'cancelled' || batch.status === 'completed') {
          res.status(400).json({ error: `Cannot enroll candidates into a ${batch.status} batch` });
          return;
        }
        if (batch.enrollmentClosed && !(isAuthorizedAdmin && overrideCapacity && capacityOverrideReason)) {
          res.status(400).json({
            error: `Enrollment for batch ${batch.batchNumber} is currently closed.`,
            code: 'ENROLLMENT_CLOSED',
          });
          return;
        }

        const course = await fsGetDoc<Course>('courses', batch.courseId, req.idToken!);
        if (!course || !assertRecordTenant(course, tenantId, !strictTenant)) {
          res.status(404).json({ error: 'Course not found' });
          return;
        }
        if (targetStatus === 'confirmed' && course.prerequisites?.trim() && req.body.prerequisiteConfirmed === false) {
          res.status(400).json({
            error: `Course prerequisites must be verified before confirming enrollment: ${course.prerequisites}`,
            code: 'PREREQUISITES_NOT_CONFIRMED',
          });
          return;
        }

        const existingBatchEnrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        });

        const createdResults: Array<{ enrollment: Enrollment; card?: TrainingCard; skippedReason?: string }> = [];
        let currentCount = batch.enrollmentCount || 0;
        const verifyBaseUrl = getAppBaseUrl(req);

        for (const candDocId of candidateDocIds) {
          const cand = await fsGetDoc<Candidate>('candidates', candDocId, req.idToken!);
          if (!cand) continue;
          if (!assertRecordTenant(cand, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: cannot enroll candidate from another tenant workspace' });
            return;
          }
          if (isCorporateReq && cand.organizationId !== req.user!.organizationId) {
            res.status(403).json({
              error: 'Forbidden: corporate accounts can only request enrollments for employees in their own organization',
            });
            return;
          }

          const duplicateActive = existingBatchEnrollments.find(
            (e) =>
              e.candidateDocId === candDocId &&
              !['cancelled', 'withdrawn', 'failed'].includes(e.status)
          );
          if (duplicateActive) {
            createdResults.push({
              enrollment: duplicateActive,
              skippedReason: 'Candidate already enrolled in this batch',
            });
            continue;
          }

          const exceedsCapacity = targetStatus === 'confirmed' && currentCount >= batch.capacity;
          if (exceedsCapacity) {
            if (!isAuthorizedAdmin || !overrideCapacity) {
              res.status(409).json({
                error: `Batch ${batch.batchNumber} has reached maximum capacity (${batch.capacity}). Admin exception approval is required to enroll beyond capacity.`,
                code: 'CAPACITY_EXCEEDED',
              });
              return;
            }
            if (!capacityOverrideReason) {
              res.status(400).json({
                error: 'A written justification reason is required to approve a batch capacity exception.',
                code: 'CAPACITY_OVERRIDE_REASON_REQUIRED',
              });
              return;
            }
          }

          const enrollmentNumber = await nextSequenceCode('ENR', 'ENR', true, req.idToken!, 4, tenantId);
          const enrollmentId = tenantScopedDocId(tenantId, enrollmentNumber);

          const enrPayload: Record<string, unknown> = {
            tenantId,
            enrollmentNumber,
            candidateDocId: cand.id,
            candidateId: cand.candidateId,
            courseId: course.id,
            batchId: batch.id,
            trainerId: batch.trainerId,
            status: targetStatus,
            trainerRecommended: false,
            completionApproved: false,
            prerequisiteConfirmed,
            requestedBy: req.user!.uid,
          };
          if (cand.userId) enrPayload.candidateUserId = cand.userId;
          if (cand.organizationId) enrPayload.organizationId = cand.organizationId;
          if (batch.trainerUserId) enrPayload.trainerUserId = batch.trainerUserId;
          if (notes) enrPayload.notes = notes;
          if (exceedsCapacity && isAuthorizedAdmin && overrideCapacity) {
            enrPayload.capacityOverride = true;
            enrPayload.capacityOverrideReason = capacityOverrideReason;
            enrPayload.capacityOverrideBy = req.user!.uid;
          }

          const ops: CommitWriteOp[] = [
            {
              type: 'create',
              collection: 'enrollments',
              docId: enrollmentId,
              data: enrPayload,
              serverTimestampFields: ['createdAt', 'updatedAt'],
            },
          ];

          if (targetStatus === 'confirmed') {
            currentCount += 1;
            ops.push({
              type: 'update',
              collection: 'batches',
              docId: batch.id,
              data: { enrollmentCount: currentCount },
              updateFields: ['enrollmentCount'],
              serverTimestampFields: ['updatedAt'],
            });
          }

          await fsCommit(ops, req.idToken!);
          const createdEnr = (await fsGetDoc<Enrollment>('enrollments', enrollmentId, req.idToken!))!;

          let generatedCard: TrainingCard | undefined;
          if (targetStatus === 'confirmed') {
            generatedCard = await createTrainingCardForEnrollment({
              tenantId,
              strictTenant,
              enrollment: createdEnr,
              candidate: cand,
              course,
              batch,
              actor: req.user!,
              idToken: req.idToken!,
              verifyBaseUrl,
            });
            void dispatchAutomatedCategoryNotifications({
              tenantId,
              category: 'enrollment_confirmation',
              candidate: cand,
              enrollmentId: createdEnr.id,
              trainingCardId: generatedCard.id,
              attachmentFileId: generatedCard.pdfFileId,
              attachmentFilename: `${generatedCard.cardSerialNumber}.pdf`,
              entityId: createdEnr.enrollmentNumber,
              variables: {
                enrollmentNumber: createdEnr.enrollmentNumber,
                courseNameEn: course.titleEn,
                courseNameAr: course.titleAr,
                courseCode: course.courseCode,
                batchNumber: batch.batchNumber,
                startDate: batch.startDate,
                endDate: batch.endDate,
                batchDate: `${batch.startDate} – ${batch.endDate}`,
                trainingTime: batch.startTime && batch.endTime ? `${batch.startTime} – ${batch.endTime}` : '',
                venue: batch.venue,
                cardNumber: generatedCard.cardSerialNumber,
                documentLink: `${verifyBaseUrl}/?card=${encodeURIComponent(generatedCard.cardSerialNumber)}`,
              },
              actor: req.user!,
              idToken: req.idToken!,
            });
          } else {
            await createNotification(
              {
                tenantId,
                targetRole: 'admin',
                type: 'corporate_enrollment_request',
                titleEn: 'New Enrollment Pending Confirmation',
                titleAr: 'طلب تسجيل جديد بانتظار التأكيد',
                bodyEn: `${cand.fullNameEn} requested for ${course.titleEn} (${batch.batchNumber})`,
                bodyAr: `طلب تسجيل ${cand.fullNameAr} في دورة ${course.titleAr}`,
              },
              req.idToken!
            );
          }

          await writeAuditLog(
            req.user!,
            exceedsCapacity ? 'CAPACITY_OVERRIDE_ENROLLMENT' : 'CREATE_ENROLLMENT',
            'enrollments',
            enrollmentId,
            exceedsCapacity
              ? `Enrolled ${cand.candidateId} in ${batch.batchNumber} (${targetStatus}) with capacity override (${currentCount}/${batch.capacity}). Reason: ${capacityOverrideReason}`
              : `Enrolled ${cand.candidateId} in ${batch.batchNumber} (${targetStatus})`,
            req.idToken!,
            tenantId
          );
          createdResults.push({ enrollment: createdEnr, card: generatedCard });
        }

        res.json({ results: createdResults });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/enrollments/:id/confirm',
    requireAuth,
    requirePermission('enrollments', 'approve'),
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const enr = await fsGetDoc<Enrollment>('enrollments', id, req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant enrollment access denied' });
          return;
        }
        if (enr.status !== 'pending') {
          res.status(400).json({ error: `Enrollment is already ${enr.status}` });
          return;
        }
        const batch = await fsGetDoc<Batch>('batches', enr.batchId, req.idToken!);
        const course = await fsGetDoc<Course>('courses', enr.courseId, req.idToken!);
        const cand = await fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!);
        if (!batch || !course || !cand) {
          res.status(404).json({ error: 'Related batch, course, or candidate missing' });
          return;
        }
        if (
          !assertRecordTenant(batch, tenantId, !strictTenant) ||
          !assertRecordTenant(course, tenantId, !strictTenant) ||
          !assertRecordTenant(cand, tenantId, !strictTenant)
        ) {
          res.status(403).json({ error: 'Forbidden: cross-tenant dependency reference blocked' });
          return;
        }
        if (batch.status === 'cancelled' || batch.status === 'completed') {
          res.status(400).json({ error: `Cannot confirm enrollment in a ${batch.status} batch` });
          return;
        }

        const overrideCapacity = Boolean(req.body?.overrideCapacity);
        const capacityOverrideReason = String(req.body?.capacityOverrideReason || '').trim().slice(0, 500);

        if (batch.enrollmentClosed && !(overrideCapacity && capacityOverrideReason)) {
          res.status(400).json({
            error: `Enrollment for batch ${batch.batchNumber} is closed. Reopen enrollment or approve an exception with a reason.`,
            code: 'ENROLLMENT_CLOSED',
          });
          return;
        }

        const exceedsCapacity = (batch.enrollmentCount || 0) >= batch.capacity;
        if (exceedsCapacity) {
          if (!overrideCapacity) {
            res.status(409).json({
              error: `Batch ${batch.batchNumber} has reached capacity (${batch.capacity}). Admin exception approval is required.`,
              code: 'CAPACITY_EXCEEDED',
            });
            return;
          }
          if (!capacityOverrideReason) {
            res.status(400).json({
              error: 'A reason is required to approve a capacity exception.',
              code: 'CAPACITY_OVERRIDE_REASON_REQUIRED',
            });
            return;
          }
        }

        const enrUpdates: Record<string, unknown> = { status: 'confirmed', prerequisiteConfirmed: true };
        const updateFields = ['status', 'prerequisiteConfirmed'];
        if (exceedsCapacity) {
          enrUpdates.capacityOverride = true;
          enrUpdates.capacityOverrideReason = capacityOverrideReason;
          enrUpdates.capacityOverrideBy = req.user!.uid;
          updateFields.push('capacityOverride', 'capacityOverrideReason', 'capacityOverrideBy');
        }

        await fsCommit(
          [
            {
              type: 'update',
              collection: 'enrollments',
              docId: id,
              data: enrUpdates,
              updateFields,
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'batches',
              docId: batch.id,
              data: { enrollmentCount: (batch.enrollmentCount || 0) + 1 },
              updateFields: ['enrollmentCount'],
              serverTimestampFields: ['updatedAt'],
            },
          ],
          req.idToken!
        );

        const updatedEnr = (await fsGetDoc<Enrollment>('enrollments', id, req.idToken!))!;
        const verifyBaseUrl = getAppBaseUrl(req);
        const card = await createTrainingCardForEnrollment({
          tenantId,
          strictTenant,
          enrollment: updatedEnr,
          candidate: cand,
          course,
          batch,
          actor: req.user!,
          idToken: req.idToken!,
          verifyBaseUrl,
        });

        await createNotification(
          {
            tenantId,
            organizationId: enr.organizationId,
            targetUserId: enr.candidateUserId,
            type: 'enrollment_confirmed',
            titleEn: 'Enrollment Confirmed & Training Card Issued',
            titleAr: 'تم تأكيد التسجيل وإصدار بطاقة التدريب',
            bodyEn: `${cand.fullNameEn} confirmed for ${course.titleEn}`,
            bodyAr: `تم تأكيد تسجيل ${cand.fullNameAr} في ${course.titleAr}`,
          },
          req.idToken!
        );

        void dispatchAutomatedCategoryNotifications({
          tenantId,
          category: 'training_card_delivery',
          candidate: cand,
          enrollmentId: updatedEnr.id,
          trainingCardId: card.id,
          attachmentFileId: card.pdfFileId,
          attachmentFilename: `${card.cardSerialNumber}.pdf`,
          entityId: card.cardSerialNumber,
          variables: {
            enrollmentNumber: updatedEnr.enrollmentNumber,
            courseNameEn: course.titleEn,
            courseNameAr: course.titleAr,
            courseCode: course.courseCode,
            batchNumber: batch.batchNumber,
            startDate: batch.startDate,
            endDate: batch.endDate,
            batchDate: `${batch.startDate} – ${batch.endDate}`,
            trainingTime: batch.startTime && batch.endTime ? `${batch.startTime} – ${batch.endTime}` : '',
            venue: batch.venue,
            cardNumber: card.cardSerialNumber,
            documentLink: `${verifyBaseUrl}/?card=${encodeURIComponent(card.cardSerialNumber)}`,
          },
          actor: req.user!,
          idToken: req.idToken!,
        });

        await writeAuditLog(
          req.user!,
          exceedsCapacity ? 'CAPACITY_OVERRIDE_CONFIRM_ENROLLMENT' : 'CONFIRM_ENROLLMENT',
          'enrollments',
          id,
          exceedsCapacity
            ? `Confirmed enrollment with capacity exception (${capacityOverrideReason}) & auto-generated card ${card.cardSerialNumber}`
            : `Confirmed enrollment & auto-generated card ${card.cardSerialNumber}`,
          req.idToken!,
          tenantId
        );
        res.json({ enrollment: updatedEnr, card });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/enrollments/:id/status',
    requireAuth,
    requireRole(['super_admin', 'admin', 'trainer', 'certificate_officer']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const enr = await fsGetDoc<Enrollment>('enrollments', id, req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant enrollment status update denied' });
          return;
        }
        if (req.user!.role === 'trainer' && enr.trainerUserId !== req.user!.uid) {
          res.status(403).json({ error: 'Trainer can only update enrollments in assigned batches' });
          return;
        }
        const updates: Record<string, unknown> = {};
        if (req.body.status && isTenantAdminOrOwnerRole(req.user!.role)) {
          const nextStatus = String(req.body.status);
          updates.status = nextStatus;
          if (
            ['cancelled', 'withdrawn'].includes(nextStatus) &&
            ['confirmed', 'in_progress'].includes(enr.status)
          ) {
            const batch = await fsGetDoc<Batch>('batches', enr.batchId, req.idToken!);
            if (batch && batch.enrollmentCount > 0) {
              await fsUpdateDoc(
                'batches',
                batch.id,
                { enrollmentCount: batch.enrollmentCount - 1 },
                req.idToken!,
                ['updatedAt']
              );
            }
          }
        }
        if (
          req.body.trainerRecommended !== undefined &&
          (isTenantOwnerRole(req.user!.role) || req.user!.role === 'trainer')
        ) {
          updates.trainerRecommended = Boolean(req.body.trainerRecommended);
          updates.trainerRecommendedBy = req.user!.uid;
        }
        if (
          req.body.completionApproved !== undefined &&
          (isTenantOwnerRole(req.user!.role) || req.user!.role === 'certificate_officer')
        ) {
          updates.completionApproved = Boolean(req.body.completionApproved);
          updates.completionApprovedBy = req.user!.uid;
          if (updates.completionApproved) updates.status = 'completed';
        }

        await fsUpdateDoc('enrollments', id, updates, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'UPDATE_ENROLLMENT',
          'enrollments',
          id,
          JSON.stringify(updates),
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<Enrollment>('enrollments', id, req.idToken!);
        res.json({ enrollment: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Corporate Enrollment Requests & Approval Workflow
  // ---------------------------------------------------------------------------
  router.get(
    '/enrollment-requests',
    requireAuth,
    requirePermission('enrollments', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const role = req.user!.role;
        const statusFilter = req.query.status ? String(req.query.status) : undefined;
        let requests: EnrollmentRequest[] = [];

        if (role === 'corporate_client') {
          if (!req.user!.organizationId) {
            res.json({ requests: [] });
            return;
          }
          requests = await fsQueryTenantDocs<EnrollmentRequest>('enrollmentRequests', tenantId, req.idToken!, {
            filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
            strictTenantFilter: strictTenant,
          });
        } else if (isTenantAdminOrOwnerRole(role) || role === 'certificate_officer') {
          const filters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [];
          if (req.query.organizationId) {
            filters.push({ field: 'organizationId', op: 'EQUAL', value: String(req.query.organizationId) });
          }
          requests = await fsQueryTenantDocs<EnrollmentRequest>('enrollmentRequests', tenantId, req.idToken!, {
            filters,
            strictTenantFilter: strictTenant,
          });
        } else {
          res.json({ requests: [] });
          return;
        }

        if (statusFilter) {
          requests = requests.filter((r) => r.status === statusFilter);
        }
        requests.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        res.json({ requests });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/enrollment-requests',
    requireAuth,
    requirePermission('enrollments', 'create'),
    requireRole(['super_admin', 'admin', 'corporate_client']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const role = req.user!.role;
        const organizationId =
          role === 'corporate_client'
            ? req.user!.organizationId || ''
            : String(req.body.organizationId || '').trim();
        if (!organizationId) {
          res.status(400).json({ error: 'Organization assignment is required to submit an enrollment request' });
          return;
        }

        const org = await fsGetDoc<Organization>('organizations', organizationId, req.idToken!);
        if (!org) {
          res.status(404).json({ error: 'Organization not found' });
          return;
        }
        if (!assertRecordTenant(org, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: organization belongs to another tenant workspace' });
          return;
        }
        if (org.status !== 'active') {
          res.status(403).json({ error: 'Organization account is not active' });
          return;
        }

        const courseId = String(req.body.courseId || '').trim();
        const course = await fsGetDoc<Course>('courses', courseId, req.idToken!);
        if (!course || !assertRecordTenant(course, tenantId, !strictTenant) || course.status !== 'active') {
          res.status(404).json({ error: 'Selected course is not available or active' });
          return;
        }

        const preferredBatchId = req.body.preferredBatchId ? String(req.body.preferredBatchId).trim() : '';
        if (preferredBatchId) {
          const prefBatch = await fsGetDoc<Batch>('batches', preferredBatchId, req.idToken!);
          if (!prefBatch || !assertRecordTenant(prefBatch, tenantId, !strictTenant) || prefBatch.courseId !== course.id) {
            res.status(400).json({ error: 'Preferred batch does not match the selected course' });
            return;
          }
        }

        const rawIds: string[] = Array.isArray(req.body.candidateDocIds)
          ? Array.from(new Set(req.body.candidateDocIds.map(String).filter(Boolean)))
          : [];
        if (rawIds.length === 0 || rawIds.length > 100) {
          res.status(400).json({ error: 'Select between 1 and 100 employees for the request' });
          return;
        }

        for (const candId of rawIds) {
          const cand = await fsGetDoc<Candidate>('candidates', candId, req.idToken!);
          if (!cand || !assertRecordTenant(cand, tenantId, !strictTenant)) {
            res.status(404).json({ error: `Employee record ${candId} not found` });
            return;
          }
          if (cand.organizationId !== organizationId) {
            res.status(403).json({
              error: `Forbidden: employee ${cand.candidateId} does not belong to organization ${org.organizationId}`,
            });
            return;
          }
        }

        const requestNumber = await nextSequenceCode('ERQ', 'ERQ', true, req.idToken!, 5, tenantId);
        const requestDocId = tenantScopedDocId(tenantId, requestNumber);
        const requestNotes = String(req.body.requestNotes || '').trim().slice(0, 1000);
        const payload: Record<string, unknown> = {
          tenantId,
          requestNumber,
          organizationId: org.id,
          organizationNameEn: org.nameEn,
          organizationNameAr: org.nameAr,
          candidateDocIds: rawIds,
          courseId: course.id,
          status: 'pending_review',
          requestedBy: req.user!.uid,
          requestedByName: req.user!.displayName,
        };
        if (preferredBatchId) payload.preferredBatchId = preferredBatchId;
        if (requestNotes) payload.requestNotes = requestNotes;

        await fsCreateDoc('enrollmentRequests', requestDocId, payload, req.idToken!, ['createdAt', 'updatedAt']);

        await createNotification(
          {
            tenantId,
            targetRole: 'admin',
            type: 'enrollment_request_submitted',
            titleEn: 'New Corporate Enrollment Request',
            titleAr: 'طلب تسجيل شركة جديد',
            bodyEn: `${org.nameEn} requested enrollment for ${rawIds.length} employee(s) in ${course.titleEn} (${requestNumber}).`,
            bodyAr: `قدمت ${org.nameAr} طلب تسجيل لعدد ${rawIds.length} متدرباً في دورة ${course.titleAr} (${requestNumber}).`,
          },
          req.idToken!
        );

        await writeAuditLog(
          req.user!,
          'CREATE_ENROLLMENT_REQUEST',
          'enrollmentRequests',
          requestDocId,
          `Submitted ${requestNumber} for org ${org.organizationId}, course ${course.courseCode}, ${rawIds.length} employee(s)`,
          req.idToken!,
          tenantId
        );

        const created = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', requestDocId, req.idToken!);
        res.json({ request: created });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/enrollment-requests/:id/respond',
    requireAuth,
    requireRole(['super_admin', 'admin', 'corporate_client']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const reqRec = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
        if (!reqRec) {
          res.status(404).json({ error: 'Enrollment request not found' });
          return;
        }
        if (!assertRecordTenant(reqRec, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant enrollment request access denied' });
          return;
        }
        if (req.user!.role === 'corporate_client' && reqRec.organizationId !== req.user!.organizationId) {
          res.status(403).json({ error: 'Forbidden: cannot modify requests for another organization' });
          return;
        }
        if (reqRec.status !== 'info_requested') {
          res.status(400).json({ error: 'Only requests awaiting missing information can be updated and resubmitted' });
          return;
        }

        const updates: Record<string, unknown> = {
          status: 'pending_review',
          corporateResponseNotes: String(req.body.corporateResponseNotes || '').trim().slice(0, 1000),
        };
        if (req.body.requestNotes !== undefined) {
          updates.requestNotes = String(req.body.requestNotes).trim().slice(0, 1000);
        }
        if (req.body.preferredBatchId !== undefined && String(req.body.preferredBatchId).trim()) {
          const prefBatch = await fsGetDoc<Batch>('batches', String(req.body.preferredBatchId).trim(), req.idToken!);
          if (!prefBatch || !assertRecordTenant(prefBatch, tenantId, !strictTenant) || prefBatch.courseId !== reqRec.courseId) {
            res.status(400).json({ error: 'Preferred batch must belong to the requested course' });
            return;
          }
          updates.preferredBatchId = prefBatch.id;
        }
        if (Array.isArray(req.body.candidateDocIds) && req.body.candidateDocIds.length > 0) {
          const nextIds = Array.from(new Set<string>(req.body.candidateDocIds.map(String).filter(Boolean)));
          for (const cid of nextIds) {
            const cand = await fsGetDoc<Candidate>('candidates', cid, req.idToken!);
            if (!cand || !assertRecordTenant(cand, tenantId, !strictTenant) || cand.organizationId !== reqRec.organizationId) {
              res.status(403).json({ error: 'All employees must belong to the requesting organization' });
              return;
            }
          }
          updates.candidateDocIds = nextIds;
        }

        await fsUpdateDoc('enrollmentRequests', id, updates, req.idToken!, ['updatedAt']);

        await createNotification(
          {
            tenantId,
            targetRole: 'admin',
            type: 'enrollment_request_resubmitted',
            titleEn: 'Corporate Enrollment Request Updated',
            titleAr: 'تم تحديث طلب تسجيل الشركة',
            bodyEn: `${reqRec.organizationNameEn || reqRec.organizationId} provided missing information for ${reqRec.requestNumber}.`,
            bodyAr: `قامت ${reqRec.organizationNameAr || reqRec.organizationId} باستكمال البيانات للطلب ${reqRec.requestNumber}.`,
          },
          req.idToken!
        );

        await writeAuditLog(
          req.user!,
          'RESUBMIT_ENROLLMENT_REQUEST',
          'enrollmentRequests',
          id,
          `Resubmitted ${reqRec.requestNumber} after missing info request`,
          req.idToken!,
          tenantId
        );

        const updated = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
        res.json({ request: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/enrollment-requests/:id/review',
    requireAuth,
    requirePermission('enrollments', 'approve'),
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const reqRec = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
        if (!reqRec) {
          res.status(404).json({ error: 'Enrollment request not found' });
          return;
        }
        if (!assertRecordTenant(reqRec, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: cross-tenant enrollment request access denied' });
          return;
        }
        if (!['pending_review', 'info_requested'].includes(reqRec.status)) {
          res.status(400).json({ error: `Request ${reqRec.requestNumber} has already been finalized (${reqRec.status})` });
          return;
        }

        const action = String(req.body.action || '');
        const decisionDate = new Date().toISOString().slice(0, 10);

        if (action === 'request_info') {
          const missingInfoNotes = String(req.body.missingInfoNotes || '').trim().slice(0, 1000);
          if (!missingInfoNotes) {
            res.status(400).json({ error: 'Please specify what missing information is required from the corporate client' });
            return;
          }
          await fsUpdateDoc(
            'enrollmentRequests',
            id,
            {
              status: 'info_requested',
              missingInfoNotes,
              reviewedBy: req.user!.uid,
              reviewedByName: req.user!.displayName,
              decisionDate,
            },
            req.idToken!,
            ['updatedAt']
          );
          await createNotification(
            {
              tenantId,
              organizationId: reqRec.organizationId,
              targetUserId: reqRec.requestedBy,
              type: 'enrollment_request_info_needed',
              titleEn: `Missing Information Requested (${reqRec.requestNumber})`,
              titleAr: `مطلوب استكمال بيانات طلب التسجيل (${reqRec.requestNumber})`,
              bodyEn: missingInfoNotes,
              bodyAr: missingInfoNotes,
            },
            req.idToken!
          );
          await writeAuditLog(
            req.user!,
            'REQUEST_ENROLLMENT_INFO',
            'enrollmentRequests',
            id,
            `Requested missing info on ${reqRec.requestNumber}: ${missingInfoNotes}`,
            req.idToken!,
            tenantId
          );
          const updated = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
          res.json({ request: updated });
          return;
        }

        if (action === 'reject') {
          const decisionReason = String(req.body.decisionReason || '').trim().slice(0, 1000);
          if (!decisionReason) {
            res.status(400).json({ error: 'Rejection reason is required' });
            return;
          }
          await fsUpdateDoc(
            'enrollmentRequests',
            id,
            {
              status: 'rejected',
              decisionReason,
              reviewedBy: req.user!.uid,
              reviewedByName: req.user!.displayName,
              decisionDate,
            },
            req.idToken!,
            ['updatedAt']
          );
          await createNotification(
            {
              tenantId,
              organizationId: reqRec.organizationId,
              targetUserId: reqRec.requestedBy,
              type: 'enrollment_request_rejected',
              titleEn: `Enrollment Request Rejected (${reqRec.requestNumber})`,
              titleAr: `تم رفض طلب التسجيل (${reqRec.requestNumber})`,
              bodyEn: `Reason: ${decisionReason}`,
              bodyAr: `السبب: ${decisionReason}`,
            },
            req.idToken!
          );
          await writeAuditLog(
            req.user!,
            'REJECT_ENROLLMENT_REQUEST',
            'enrollmentRequests',
            id,
            `Rejected ${reqRec.requestNumber}: ${decisionReason}`,
            req.idToken!,
            tenantId
          );
          const updated = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
          res.json({ request: updated });
          return;
        }

        if (action === 'approve') {
          const targetBatchId = String(req.body.batchId || reqRec.preferredBatchId || '').trim();
          if (!targetBatchId) {
            res.status(400).json({ error: 'Please assign a target training batch before approving this request' });
            return;
          }
          const [batch, course] = await Promise.all([
            fsGetDoc<Batch>('batches', targetBatchId, req.idToken!),
            fsGetDoc<Course>('courses', reqRec.courseId, req.idToken!),
          ]);
          if (!batch || !course) {
            res.status(404).json({ error: 'Assigned batch or course not found' });
            return;
          }
          if (!assertRecordTenant(batch, tenantId, !strictTenant) || !assertRecordTenant(course, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: cross-tenant batch or course reference blocked' });
            return;
          }
          if (batch.courseId !== course.id) {
            res.status(400).json({ error: 'Assigned batch does not belong to the requested course' });
            return;
          }
          if (batch.status === 'cancelled' || batch.status === 'completed') {
            res.status(400).json({ error: `Cannot assign candidates to a ${batch.status} batch` });
            return;
          }

          const existingBatchEnrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
            filters: [{ field: 'batchId', op: 'EQUAL', value: batch.id }],
            strictTenantFilter: strictTenant,
          });
          let currentCount = batch.enrollmentCount || 0;
          const createdEnrollments: Enrollment[] = [];
          const createdCards: TrainingCard[] = [];
          const candidatesToEnroll: Candidate[] = [];
          const verifyBaseUrl = getAppBaseUrl(req);

          for (const candDocId of reqRec.candidateDocIds) {
            const cand = await fsGetDoc<Candidate>('candidates', candDocId, req.idToken!);
            if (!cand || !assertRecordTenant(cand, tenantId, !strictTenant) || cand.organizationId !== reqRec.organizationId) continue;

            const duplicateActive = existingBatchEnrollments.find(
              (e) =>
                e.candidateDocId === candDocId &&
                !['cancelled', 'withdrawn', 'failed'].includes(e.status)
            );
            if (duplicateActive) {
              createdEnrollments.push(duplicateActive);
              continue;
            }
            candidatesToEnroll.push(cand);
          }

          if (batch.enrollmentClosed && !Boolean(req.body.overrideCapacity)) {
            res.status(400).json({ error: `Enrollment for batch ${batch.batchNumber} is closed` });
            return;
          }

          if (currentCount + candidatesToEnroll.length > batch.capacity && !Boolean(req.body.overrideCapacity)) {
            const remaining = Math.max(0, batch.capacity - currentCount);
            res.status(400).json({
              error: `Batch ${batch.batchNumber} only has ${remaining} seat(s) available, cannot assign ${candidatesToEnroll.length} candidate(s).`,
            });
            return;
          }

          for (const cand of candidatesToEnroll) {
            const enrollmentNumber = await nextSequenceCode('ENR', 'ENR', true, req.idToken!, 4, tenantId);
            const enrollmentDocId = tenantScopedDocId(tenantId, enrollmentNumber);
            const enrPayload: Record<string, unknown> = {
              tenantId,
              enrollmentNumber,
              candidateDocId: cand.id,
              candidateId: cand.candidateId,
              courseId: course.id,
              batchId: batch.id,
              trainerId: batch.trainerId,
              status: 'confirmed',
              trainerRecommended: false,
              completionApproved: false,
              requestedBy: reqRec.requestedBy,
            };
            if (cand.userId) enrPayload.candidateUserId = cand.userId;
            if (cand.organizationId) enrPayload.organizationId = cand.organizationId;
            if (batch.trainerUserId) enrPayload.trainerUserId = batch.trainerUserId;

            currentCount += 1;
            await fsCommit(
              [
                {
                  type: 'create',
                  collection: 'enrollments',
                  docId: enrollmentDocId,
                  data: enrPayload,
                  serverTimestampFields: ['createdAt', 'updatedAt'],
                },
                {
                  type: 'update',
                  collection: 'batches',
                  docId: batch.id,
                  data: { enrollmentCount: currentCount },
                  updateFields: ['enrollmentCount'],
                  serverTimestampFields: ['updatedAt'],
                },
              ],
              req.idToken!
            );

            const createdEnr = (await fsGetDoc<Enrollment>('enrollments', enrollmentDocId, req.idToken!))!;
            const card = await createTrainingCardForEnrollment({
              tenantId,
              strictTenant,
              enrollment: createdEnr,
              candidate: cand,
              course,
              batch,
              actor: req.user!,
              idToken: req.idToken!,
              verifyBaseUrl,
            });
            createdEnrollments.push(createdEnr);
            createdCards.push(card);
          }

          const createdEnrollmentIds = createdEnrollments.map((e) => e.id);
          const decisionReason = String(req.body.decisionReason || '').trim().slice(0, 1000);
          await fsUpdateDoc(
            'enrollmentRequests',
            id,
            {
              status: 'approved',
              assignedBatchId: batch.id,
              reviewedBy: req.user!.uid,
              reviewedByName: req.user!.displayName,
              decisionDate,
              createdEnrollmentIds,
              ...(decisionReason ? { decisionReason } : {}),
            },
            req.idToken!,
            ['updatedAt']
          );

          await createNotification(
            {
              tenantId,
              organizationId: reqRec.organizationId,
              targetUserId: reqRec.requestedBy,
              type: 'enrollment_request_approved',
              titleEn: `Enrollment Request Approved (${reqRec.requestNumber})`,
              titleAr: `تمت الموافقة على طلب التسجيل (${reqRec.requestNumber})`,
              bodyEn: `Assigned to batch ${batch.batchNumber} (${course.titleEn}). ${createdCards.length} Training Card(s) generated.`,
              bodyAr: `تم التسكين في الدفعة ${batch.batchNumber} (${course.titleAr}) وإصدار ${createdCards.length} بطاقة تدريب.`,
            },
            req.idToken!
          );

          await writeAuditLog(
            req.user!,
            'APPROVE_ENROLLMENT_REQUEST',
            'enrollmentRequests',
            id,
            `Approved ${reqRec.requestNumber} -> batch ${batch.batchNumber}, created ${createdEnrollmentIds.join(', ')}`,
            req.idToken!,
            tenantId
          );

          const updated = await fsGetDoc<EnrollmentRequest>('enrollmentRequests', id, req.idToken!);
          res.json({ request: updated, enrollments: createdEnrollments, cards: createdCards });
          return;
        }

        res.status(400).json({ error: 'Invalid review action; must be approve, reject, or request_info' });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Attendance Management
  // ---------------------------------------------------------------------------
  router.get('/attendance', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!hasPermission(req.user!, 'attendance', 'view', matrix)) {
        res.status(403).json({ error: 'Forbidden: missing permission attendance:view' });
        return;
      }
      const filters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [];
      if (req.query.batchId) filters.push({ field: 'batchId', op: 'EQUAL', value: String(req.query.batchId) });
      if (req.query.date) filters.push({ field: 'date', op: 'EQUAL', value: String(req.query.date) });
      if (req.user!.role === 'candidate') {
        if (!req.user!.candidateId) {
          res.json({ attendance: [] });
          return;
        }
        filters.push({ field: 'candidateDocId', op: 'EQUAL', value: req.user!.candidateId });
      }
      if (req.user!.role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ attendance: [] });
          return;
        }
        filters.push({ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId });
      }
      if (req.user!.role === 'trainer') {
        if (req.query.batchId) {
          const b = await fsGetDoc<Batch>('batches', String(req.query.batchId), req.idToken!);
          if (!b || !assertRecordTenant(b, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Trainer can only view attendance for assigned batches in active tenant' });
            return;
          }
          if (
            b.trainerUserId !== req.user!.uid &&
            (!req.user!.trainerId || b.trainerId !== req.user!.trainerId)
          ) {
            res.status(403).json({ error: 'Trainer can only view attendance for assigned batches' });
            return;
          }
        } else {
          filters.push({ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid });
        }
      }
      const records = await fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
        filters,
        strictTenantFilter: strictTenant,
      });
      res.json({ attendance: records });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/attendance/mark',
    requireAuth,
    requirePermission('attendance', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const batchId = String(req.body.batchId || '');
        const date = String(req.body.date || '');
        const submitAttendance = req.body.submissionMode === 'submit' || req.body.submit === true;
        const batchCorrectionReason = String(req.body.correctionReason || '').trim().slice(0, 400);
        const entries = (req.body.entries || []) as Array<{
          enrollmentId: string;
          status: 'present' | 'absent' | 'late' | 'excused';
          remarks?: string;
          correctionReason?: string;
        }>;
        if (!batchId || !date) {
          res.status(400).json({ error: 'batchId and date are required' });
          return;
        }
        const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
          return;
        }
        const isTrainerAssigned =
          batch.trainerUserId === req.user!.uid ||
          Boolean(req.user!.trainerId && batch.trainerId === req.user!.trainerId);
        if (req.user!.role === 'trainer' && !isTrainerAssigned) {
          res.status(403).json({ error: 'Trainer can only mark attendance for assigned batches' });
          return;
        }

        const isAdminRole = isTenantAdminOrOwnerRole(req.user!.role);
        const enrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        });
        const enrMap = new Map(enrollments.map((e) => [e.id, e]));
        const existingDateRecords = await fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
          filters: [
            { field: 'batchId', op: 'EQUAL', value: batchId },
            { field: 'date', op: 'EQUAL', value: date },
          ],
          strictTenantFilter: strictTenant,
        });
        const existingMap = new Map(existingDateRecords.map((r) => [r.enrollmentId, r]));
        const dateAlreadySubmitted = existingDateRecords.some((r) => r.submissionStatus === 'submitted');

        if (dateAlreadySubmitted && !isAdminRole) {
          res.status(403).json({
            error: 'Attendance for this date has been submitted and locked. Only Administrators can correct submitted records with an audit trail.',
          });
          return;
        }

        const nowIso = new Date().toISOString();
        let updatedCount = 0;

        for (const entry of entries) {
          const enr = enrMap.get(entry.enrollmentId);
          if (!enr) continue;
          const rawAttKey = `${batchId}_${entry.enrollmentId}_${date}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
          const attId = tenantScopedDocId(tenantId, rawAttKey);
          const existing = existingMap.get(enr.id) || (await fsGetDoc<AttendanceRecord>('attendance', attId, req.idToken!).catch(() => null));
          if (existing && !assertRecordTenant(existing, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: attendance record belongs to another tenant' });
            return;
          }
          const entryRemarks = String(entry.remarks || '').slice(0, 400);
          const entryReason = String(entry.correctionReason || batchCorrectionReason || '').trim().slice(0, 400);

          if (existing) {
            if (existing.submissionStatus === 'submitted') {
              if (!isAdminRole) {
                res.status(403).json({
                  error: 'Submitted attendance records cannot be modified by unauthorized users.',
                });
                return;
              }
              const changed = existing.status !== entry.status || (existing.remarks || '') !== entryRemarks;
              if (!changed && !entryReason) continue;
              if (changed && !entryReason) {
                res.status(400).json({
                  error: 'A correction reason is required to modify submitted historical attendance records.',
                });
                return;
              }
              await fsUpdateDoc(
                'attendance',
                existing.id,
                {
                  tenantId,
                  status: entry.status,
                  remarks: entryRemarks,
                  markedBy: req.user!.uid,
                  submissionStatus: 'submitted',
                  correctedBy: req.user!.uid,
                  correctionReason: entryReason,
                },
                req.idToken!,
                ['updatedAt']
              );
              await writeAuditLog(
                req.user!,
                'CORRECT_ATTENDANCE',
                'attendance',
                existing.id,
                `Corrected submitted attendance for ${enr.enrollmentNumber} on ${date}: ${existing.status} -> ${entry.status}. Reason: ${entryReason}`,
                req.idToken!,
                tenantId
              );
              updatedCount++;
            } else {
              const nextStatus = submitAttendance ? 'submitted' : 'draft';
              const updatePayload: Record<string, unknown> = {
                tenantId,
                status: entry.status,
                remarks: entryRemarks,
                markedBy: req.user!.uid,
                submissionStatus: nextStatus,
              };
              if (submitAttendance) {
                updatePayload.submittedAt = nowIso;
                updatePayload.submittedBy = req.user!.uid;
              }
              await fsUpdateDoc('attendance', existing.id, updatePayload, req.idToken!, ['updatedAt']);
              if (existing.status !== entry.status) {
                await writeAuditLog(
                  req.user!,
                  'EDIT_ATTENDANCE',
                  'attendance',
                  existing.id,
                  `Updated draft attendance for ${enr.enrollmentNumber} on ${date} from ${existing.status} to ${entry.status}`,
                  req.idToken!,
                  tenantId
                );
              }
              updatedCount++;
            }
          } else {
            const payload: Record<string, unknown> = {
              tenantId,
              batchId,
              enrollmentId: enr.id,
              candidateDocId: enr.candidateDocId,
              date,
              status: entry.status,
              remarks: entryRemarks,
              markedBy: req.user!.uid,
              submissionStatus: submitAttendance ? 'submitted' : 'draft',
            };
            if (submitAttendance) {
              payload.submittedAt = nowIso;
              payload.submittedBy = req.user!.uid;
            }
            if (enr.organizationId) payload.organizationId = enr.organizationId;
            if (batch.trainerUserId) payload.trainerUserId = batch.trainerUserId;
            else if (req.user!.role === 'trainer') payload.trainerUserId = req.user!.uid;
            await fsCreateDoc('attendance', attId, payload, req.idToken!, ['createdAt', 'updatedAt']);
            updatedCount++;
          }
        }

        if (submitAttendance) {
          await writeAuditLog(
            req.user!,
            'SUBMIT_ATTENDANCE',
            'batches',
            batchId,
            `Submitted and locked attendance for batch ${batch.batchNumber} on ${date} (${entries.length} trainee(s))`,
            req.idToken!,
            tenantId
          );

          // Notify absent trainees if their cumulative attendance drops below course requirement
          const course = await fsGetDoc<Course>('courses', batch.courseId, req.idToken!).catch(() => null);
          const minAtt = course?.minAttendancePct ?? 80;
          const absentEntries = entries.filter((e) => e.status === 'absent');
          if (absentEntries.length > 0 && course) {
            const batchAtt = await fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
              filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
              strictTenantFilter: strictTenant,
            }).catch(() => []);
            for (const entry of absentEntries) {
              const enr = enrMap.get(entry.enrollmentId);
              if (!enr) continue;
              const enrAtt = batchAtt.filter((a) => a.enrollmentId === enr.id);
              const attended = enrAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
              const pct = enrAtt.length > 0 ? Math.round((attended / enrAtt.length) * 100) : 0;
              if (pct < minAtt) {
                const cand = await fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!).catch(() => null);
                if (cand && assertRecordTenant(cand, tenantId, !strictTenant)) {
                  void dispatchAutomatedCategoryNotifications({
                    tenantId,
                    category: 'attendance_notification',
                    candidate: cand,
                    enrollmentId: enr.id,
                    entityId: enr.enrollmentNumber,
                    variables: {
                      courseNameEn: course.titleEn,
                      courseNameAr: course.titleAr,
                      batchNumber: batch.batchNumber,
                      attendancePct: String(pct),
                    },
                    actor: req.user!,
                    idToken: req.idToken!,
                  });
                }
              }
            }
          }
        }

        res.json({ ok: true, submissionStatus: submitAttendance || dateAlreadySubmitted ? 'submitted' : 'draft', updatedCount });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get('/attendance/export', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (req.user!.role === 'candidate' || !hasPermission(req.user!, 'attendance', 'view', matrix)) {
        res.status(403).json({ error: 'Forbidden: missing permission attendance:view' });
        return;
      }
      const batchId = String(req.query.batchId || '');
      const dateFilter = req.query.date ? String(req.query.date) : '';
      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }
      const [batch, enrollments, attendance] = await Promise.all([
        fsGetDoc<Batch>('batches', batchId, req.idToken!),
        fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        }),
      ]);
      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
        res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
        return;
      }
      if (
        req.user!.role === 'trainer' &&
        batch.trainerUserId !== req.user!.uid &&
        batch.trainerId !== req.user!.trainerId
      ) {
        res.status(403).json({ error: 'Trainer can only export attendance for assigned batches' });
        return;
      }
      const course = await fsGetDoc<Course>('courses', batch.courseId, req.idToken!);
      const scopedEnrollments =
        req.user!.role === 'corporate_client'
          ? enrollments.filter((e) => e.organizationId === req.user!.organizationId)
          : enrollments;
      const enrMap = new Map(scopedEnrollments.map((e) => [e.id, e]));
      const candCache = new Map<string, Candidate | null>();
      for (const enr of scopedEnrollments) {
        if (!candCache.has(enr.candidateDocId)) {
          const c = await fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!);
          candCache.set(enr.candidateDocId, c && assertRecordTenant(c, tenantId, !strictTenant) ? c : null);
        }
      }

      const filteredRecords = attendance
        .filter((a) => enrMap.has(a.enrollmentId) && (!dateFilter || a.date === dateFilter))
        .sort((a, b) => a.date.localeCompare(b.date));

      const escapeCsv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = [
        'Batch Number',
        'Course Code',
        'Enrollment ID',
        'Candidate ID',
        'Candidate Name (EN)',
        'Candidate Name (AR)',
        'Date',
        'Status',
        'Submission Status',
        'Attended Sessions',
        'Total Sessions',
        'Attendance %',
        'Min Required %',
        'Remarks',
        'Correction Reason',
      ];
      const csvRows = [header.map(escapeCsv).join(',')];
      for (const rec of filteredRecords) {
        const enr = enrMap.get(rec.enrollmentId)!;
        const cand = candCache.get(enr.candidateDocId);
        const enrRecs = attendance.filter((a) => a.enrollmentId === enr.id);
        const attended = enrRecs.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
        const pct = enrRecs.length > 0 ? Math.round((attended / enrRecs.length) * 100) : 0;
        csvRows.push(
          [
            batch.batchNumber,
            course?.courseCode || '',
            enr.enrollmentNumber,
            enr.candidateId,
            cand?.fullNameEn || enr.candidateId,
            cand?.fullNameAr || '',
            rec.date,
            rec.status,
            rec.submissionStatus || 'draft',
            attended,
            enrRecs.length,
            `${pct}%`,
            `${course?.minAttendancePct ?? 80}%`,
            rec.remarks || '',
            rec.correctionReason || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }

      const csvBody = '\uFEFF' + csvRows.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance_${batch.batchNumber}_${dateFilter || 'all'}.csv"`
      );
      res.send(csvBody);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/attendance/pdf', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      if (req.user!.role === 'candidate') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const batchId = String(req.query.batchId);
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      const [batch, company, enrollments, attendance] = await Promise.all([
        fsGetDoc<Batch>('batches', batchId, req.idToken!),
        getCompanyBranding(req.idToken, tenantId),
        fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        }),
        fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
          filters: [
            { field: 'batchId', op: 'EQUAL', value: batchId },
            { field: 'date', op: 'EQUAL', value: date },
          ],
          strictTenantFilter: strictTenant,
        }),
      ]);
      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
        res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
        return;
      }
      if (
        req.user!.role === 'trainer' &&
        batch.trainerUserId !== req.user!.uid &&
        batch.trainerId !== req.user!.trainerId
      ) {
        res.status(403).json({ error: 'Trainer can only export attendance sheets for assigned batches' });
        return;
      }
      const scopedEnrollments =
        req.user!.role === 'corporate_client'
          ? enrollments.filter((e) => e.organizationId === req.user!.organizationId)
          : enrollments;
      const course = (await fsGetDoc<Course>('courses', batch.courseId, req.idToken!))!;
      const attMap = new Map(attendance.map((a) => [a.enrollmentId, a]));
      const rows: Array<{ candidate: Candidate; record?: AttendanceRecord }> = [];
      for (const enr of scopedEnrollments) {
        const cand = await fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!);
        if (cand && assertRecordTenant(cand, tenantId, !strictTenant)) rows.push({ candidate: cand, record: attMap.get(enr.id) });
      }
      const pdf = await generateAttendanceSheetPdf({ batch, course, date, company, rows });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${batch.batchNumber}_${date}.pdf"`);
      res.send(pdf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Examinations, Assessments & Completion Eligibility
  // ---------------------------------------------------------------------------
  router.get('/assessments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (req.user!.role === 'candidate' || !hasPermission(req.user!, 'assessments', 'view', matrix)) {
        res.status(403).json({ error: 'Forbidden: missing permission assessments:view' });
        return;
      }
      const filters: Array<{ field: string; op: 'EQUAL'; value: unknown }> = [];
      if (req.query.batchId) filters.push({ field: 'batchId', op: 'EQUAL', value: String(req.query.batchId) });
      if (req.query.enrollmentId) filters.push({ field: 'enrollmentId', op: 'EQUAL', value: String(req.query.enrollmentId) });
      if (req.user!.role === 'trainer') {
        filters.push({ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid });
      } else if (req.user!.role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ assessments: [] });
          return;
        }
        filters.push({ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId });
      }
      const assessments = await fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
        filters,
        strictTenantFilter: strictTenant,
      });
      res.json({ assessments });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/assessments',
    requireAuth,
    requirePermission('assessments', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const enrollmentId = String(req.body.enrollmentId || '');
        const enr = await fsGetDoc<Enrollment>('enrollments', enrollmentId, req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another tenant' });
          return;
        }
        const batch = await fsGetDoc<Batch>('batches', enr.batchId, req.idToken!);
        if (batch && !assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
          return;
        }
        const isTrainerAssigned =
          enr.trainerUserId === req.user!.uid ||
          Boolean(batch && (batch.trainerUserId === req.user!.uid || (req.user!.trainerId && batch.trainerId === req.user!.trainerId)));
        if (req.user!.role === 'trainer' && !isTrainerAssigned) {
          res.status(403).json({ error: 'Trainer can only score assigned enrollments' });
          return;
        }

        const existingAttempts = await fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
          filters: [{ field: 'enrollmentId', op: 'EQUAL', value: enrollmentId }],
          strictTenantFilter: strictTenant,
        });
        const assessmentType = String(req.body.assessmentType || 'written') as AssessmentRecord['assessmentType'];
        if (!['written', 'practical', 'oral', 'trainer_eval', 'pass_fail'].includes(assessmentType)) {
          res.status(400).json({ error: 'Invalid assessment type' });
          return;
        }
        const sameTypeCount = existingAttempts.filter((a) => a.assessmentType === assessmentType).length;

        const maxMarks = Math.max(1, Number(req.body.maxMarks || 100));
        const obtainedMarks = Math.max(0, Math.min(maxMarks, Number(req.body.obtainedMarks ?? 0)));
        const passingScore = Math.max(0, Math.min(100, Number(req.body.passingScore ?? 60)));
        const percentage =
          assessmentType === 'pass_fail'
            ? req.body.result === 'pass'
              ? 100
              : 0
            : Math.round((obtainedMarks / maxMarks) * 10000) / 100;
        const result =
          assessmentType === 'pass_fail'
            ? req.body.result === 'pass'
              ? 'pass'
              : 'fail'
            : percentage >= passingScore
              ? 'pass'
              : 'fail';

        const assessId = tenantScopedDocId(tenantId, randomId('assess'));
        const assessmentNumber = await nextSequenceCode('ASM', 'ASM', true, req.idToken!, 4, tenantId);
        const payload: Record<string, unknown> = {
          tenantId,
          assessmentNumber,
          enrollmentId: enr.id,
          candidateDocId: enr.candidateDocId,
          courseId: enr.courseId,
          batchId: enr.batchId,
          assessmentType,
          attemptNumber: sameTypeCount + 1,
          maxMarks,
          obtainedMarks: assessmentType === 'pass_fail' ? (result === 'pass' ? maxMarks : 0) : obtainedMarks,
          percentage,
          passingScore,
          result,
          remarks: String(req.body.remarks || '').slice(0, 500),
          assessorId: req.user!.uid,
          assessorName: req.user!.displayName || req.user!.email,
          assessmentStatus: 'recorded',
          assessmentDate: String(req.body.assessmentDate || new Date().toISOString().slice(0, 10)),
        };
        if (enr.organizationId) payload.organizationId = enr.organizationId;
        if (enr.trainerUserId) payload.trainerUserId = enr.trainerUserId;
        else if (req.user!.role === 'trainer') payload.trainerUserId = req.user!.uid;

        await fsCreateDoc('assessments', assessId, payload, req.idToken!, ['createdAt']);
        await writeAuditLog(
          req.user!,
          'RECORD_ASSESSMENT',
          'assessments',
          assessId,
          `Recorded ${assessmentNumber} (${assessmentType} attempt #${sameTypeCount + 1}: ${percentage}% ${result}) for enrollment ${enr.enrollmentNumber}`,
          req.idToken!,
          tenantId
        );
        const created = await fsGetDoc<AssessmentRecord>('assessments', assessId, req.idToken!);
        if (created) {
          const [cand, course, batchDoc] = await Promise.all([
            fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!).catch(() => null),
            fsGetDoc<Course>('courses', enr.courseId, req.idToken!).catch(() => null),
            fsGetDoc<Batch>('batches', enr.batchId, req.idToken!).catch(() => null),
          ]);
          if (cand && assertRecordTenant(cand, tenantId, !strictTenant)) {
            void dispatchAutomatedCategoryNotifications({
              tenantId,
              category: 'examination_result',
              candidate: cand,
              enrollmentId: enr.id,
              entityId: assessmentNumber,
              variables: {
                courseNameEn: course?.titleEn || enr.courseId,
                courseNameAr: course?.titleAr || course?.titleEn || enr.courseId,
                batchNumber: batchDoc?.batchNumber || enr.batchId,
                examResult: result.toUpperCase(),
                examScore:
                  assessmentType === 'pass_fail'
                    ? result.toUpperCase()
                    : `${created.obtainedMarks}/${created.maxMarks} (${percentage}%)`,
              },
              actor: req.user!,
              idToken: req.idToken!,
            });
          }
        }
        res.json({ assessment: created });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/assessments/:id/correction-request',
    requireAuth,
    requirePermission('assessments', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const assessId = String(req.params.id);
        const existing = await fsGetDoc<AssessmentRecord>('assessments', assessId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Assessment record not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: assessment belongs to another tenant' });
          return;
        }
        if (req.user!.role === 'trainer' && existing.trainerUserId !== req.user!.uid) {
          res.status(403).json({ error: 'Trainer can only request corrections on assigned assessments' });
          return;
        }
        const correctionReason = String(req.body.correctionReason || '').trim().slice(0, 400);
        if (!correctionReason) {
          res.status(400).json({ error: 'Correction reason is required' });
          return;
        }

        const updates: Record<string, unknown> = {
          assessmentStatus: 'pending_correction',
          correctionReason,
          correctionRequestedBy: req.user!.uid,
        };
        if (existing.assessmentType === 'pass_fail') {
          const correctedResult = req.body.correctedResult === 'pass' ? 'pass' : 'fail';
          updates.correctedResult = correctedResult;
          updates.correctedMarks = correctedResult === 'pass' ? existing.maxMarks : 0;
        } else {
          const correctedMarks = Math.max(
            0,
            Math.min(existing.maxMarks, Number(req.body.correctedMarks ?? existing.obtainedMarks))
          );
          const pct = (correctedMarks / Math.max(1, existing.maxMarks)) * 100;
          updates.correctedMarks = correctedMarks;
          updates.correctedResult = pct >= existing.passingScore ? 'pass' : 'fail';
        }

        await fsUpdateDoc('assessments', assessId, updates, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'REQUEST_ASSESSMENT_CORRECTION',
          'assessments',
          assessId,
          `Requested correction on ${existing.assessmentNumber || assessId}: ${correctionReason}`,
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<AssessmentRecord>('assessments', assessId, req.idToken!);
        res.json({ assessment: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/assessments/:id/approve-correction',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const assessId = String(req.params.id);
        const existing = await fsGetDoc<AssessmentRecord>('assessments', assessId, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Assessment record not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: assessment belongs to another tenant' });
          return;
        }
        const reason = String(req.body.correctionReason || existing.correctionReason || '').trim().slice(0, 400);
        if (!reason) {
          res.status(400).json({ error: 'Correction reason is required for administrator score approval' });
          return;
        }

        let nextMarks = existing.obtainedMarks;
        let nextResult = existing.result;
        let nextPct = existing.percentage ?? (existing.maxMarks > 0 ? Math.round((existing.obtainedMarks / existing.maxMarks) * 10000) / 100 : 0);

        if (existing.assessmentType === 'pass_fail') {
          nextResult =
            req.body.correctedResult === 'pass' || req.body.correctedResult === 'fail'
              ? req.body.correctedResult
              : existing.correctedResult || existing.result;
          nextMarks = nextResult === 'pass' ? existing.maxMarks : 0;
          nextPct = nextResult === 'pass' ? 100 : 0;
        } else {
          const candidateMarks =
            req.body.correctedMarks !== undefined
              ? Number(req.body.correctedMarks)
              : existing.correctedMarks !== undefined
                ? existing.correctedMarks
                : existing.obtainedMarks;
          nextMarks = Math.max(0, Math.min(existing.maxMarks, candidateMarks));
          nextPct = Math.round((nextMarks / Math.max(1, existing.maxMarks)) * 10000) / 100;
          nextResult = nextPct >= existing.passingScore ? 'pass' : 'fail';
        }

        const updates: Record<string, unknown> = {
          obtainedMarks: nextMarks,
          percentage: nextPct,
          result: nextResult,
          assessmentStatus: 'approved',
          correctionReason: reason,
          correctedMarks: nextMarks,
          correctedResult: nextResult,
          approvedBy: req.user!.uid,
        };
        if (req.body.remarks !== undefined) {
          updates.remarks = String(req.body.remarks).slice(0, 500);
        }

        await fsUpdateDoc('assessments', assessId, updates, req.idToken!, ['updatedAt']);
        await writeAuditLog(
          req.user!,
          'APPROVE_ASSESSMENT_CORRECTION',
          'assessments',
          assessId,
          `Approved score correction on ${existing.assessmentNumber || assessId}: ${existing.obtainedMarks}/${existing.maxMarks} (${existing.result}) -> ${nextMarks}/${existing.maxMarks} (${nextResult}). Reason: ${reason}`,
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<AssessmentRecord>('assessments', assessId, req.idToken!);
        res.json({ assessment: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get('/enrollments/:id/eligibility', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const enr = await fsGetDoc<Enrollment>('enrollments', String(req.params.id), req.idToken!);
      if (!enr) {
        res.status(404).json({ error: 'Enrollment not found' });
        return;
      }
      if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
        res.status(403).json({ error: 'Forbidden: enrollment belongs to another tenant' });
        return;
      }
      if (req.user!.role === 'trainer' && enr.trainerUserId !== req.user!.uid) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (req.user!.role === 'corporate_client' && enr.organizationId !== req.user!.organizationId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (
        req.user!.role === 'candidate' &&
        enr.candidateUserId !== req.user!.uid &&
        enr.candidateDocId !== req.user!.candidateId
      ) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const eligibility = await evaluateCompletionEligibility(
        enr,
        req.idToken!,
        req.user!.role === 'trainer' ? req.user!.uid : undefined,
        tenantId,
        strictTenant
      );
      res.json({ eligibility });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Training Cards
  // ---------------------------------------------------------------------------
  router.get('/training-cards', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const role = req.user!.role;
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!hasPermission(req.user!, 'training_cards', 'view', matrix) && role !== 'trainer') {
        res.status(403).json({ error: 'Forbidden: missing permission training_cards:view' });
        return;
      }
      let cards: TrainingCard[] = [];
      if (role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ trainingCards: [] });
          return;
        }
        cards = await fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'candidate') {
        cards = await fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
          filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'trainer') {
        const myBatches = await fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, {
          filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
        const myBatchIds = new Set(myBatches.map((b) => b.id));
        if (myBatchIds.size === 0) {
          res.json({ trainingCards: [] });
          return;
        }
        const allCards = await fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
        cards = allCards.filter((c) => myBatchIds.has(c.batchId));
      } else {
        cards = await fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
      }
      res.json({ trainingCards: cards });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/training-cards/generate',
    requireAuth,
    requirePermission('training_cards', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const enrollmentId = String(req.body.enrollmentId || '').trim();
        const templateId = req.body.templateId ? String(req.body.templateId).trim() : undefined;
        const regenerateIfExists = Boolean(req.body.regenerateIfExists);
        if (!enrollmentId) {
          res.status(400).json({ error: 'enrollmentId is required' });
          return;
        }
        const enr = await fsGetDoc<Enrollment>('enrollments', enrollmentId, req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another tenant' });
          return;
        }
        if (req.user!.role === 'corporate_client' && enr.organizationId !== req.user!.organizationId) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another organization' });
          return;
        }
        if (req.user!.role === 'trainer' && enr.trainerUserId !== req.user!.uid) {
          res.status(403).json({ error: 'Forbidden: enrollment is not assigned to this trainer' });
          return;
        }
        if (!['confirmed', 'in_progress', 'completed'].includes(enr.status)) {
          res.status(400).json({ error: 'Training card can only be generated for confirmed, in-progress, or completed enrollments' });
          return;
        }
        const [cand, course, batch, existingCards] = await Promise.all([
          fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!),
          fsGetDoc<Course>('courses', enr.courseId, req.idToken!),
          fsGetDoc<Batch>('batches', enr.batchId, req.idToken!),
          fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
            filters: [{ field: 'enrollmentId', op: 'EQUAL', value: enr.id }],
            strictTenantFilter: strictTenant,
          }),
        ]);
        if (!cand || !course || !batch) {
          res.status(404).json({ error: 'Missing candidate, course, or batch' });
          return;
        }
        if (
          !assertRecordTenant(cand, tenantId, !strictTenant) ||
          !assertRecordTenant(course, tenantId, !strictTenant) ||
          !assertRecordTenant(batch, tenantId, !strictTenant)
        ) {
          res.status(403).json({ error: 'Forbidden: linked records belong to another tenant' });
          return;
        }
        const activeExisting = existingCards.find((c) => c.status === 'active');
        if (activeExisting && !regenerateIfExists) {
          res.status(409).json({
            error: `Active card ${activeExisting.cardSerialNumber} already exists. Use regenerate instead.`,
          });
          return;
        }
        for (const old of existingCards) {
          if (old.status === 'active') {
            await fsUpdateDoc('trainingCards', old.id, { status: 'superseded' }, req.idToken!, []);
          }
        }
        const maxVer = existingCards.reduce((m, c) => Math.max(m, c.version || 1), 0);
        const card = await createTrainingCardForEnrollment({
          tenantId,
          strictTenant,
          enrollment: enr,
          candidate: cand,
          course,
          batch,
          actor: req.user!,
          idToken: req.idToken!,
          verifyBaseUrl: getAppBaseUrl(req),
          previousVersion: maxVer,
          preferredTemplateId: templateId,
        });
        await writeAuditLog(
          req.user!,
          'GENERATE_TRAINING_CARD',
          'trainingCards',
          card.id,
          `Generated training card ${card.cardSerialNumber} (v${card.version}) for ${cand.candidateId}`,
          req.idToken!,
          tenantId
        );
        res.json({ card });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/training-cards/batch/:batchId/generate',
    requireAuth,
    requirePermission('training_cards', 'create'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const batchId = String(req.params.batchId || '').trim();
        const mode: 'missing_only' | 'regenerate_all' =
          req.body.mode === 'regenerate_all' ? 'regenerate_all' : 'missing_only';
        const templateId = req.body.templateId ? String(req.body.templateId).trim() : undefined;

        const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
          return;
        }
        if (
          req.user!.role === 'trainer' &&
          batch.trainerUserId !== req.user!.uid &&
          (!req.user!.trainerId || batch.trainerId !== req.user!.trainerId)
        ) {
          res.status(403).json({ error: 'Forbidden: trainer is not assigned to this batch' });
          return;
        }
        const [course, batchEnrollments, batchCards] = await Promise.all([
          fsGetDoc<Course>('courses', batch.courseId, req.idToken!),
          fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
            filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
            strictTenantFilter: strictTenant,
          }),
          fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
            filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
            strictTenantFilter: strictTenant,
          }),
        ]);
        if (!course || !assertRecordTenant(course, tenantId, !strictTenant)) {
          res.status(404).json({ error: 'Course not found for batch' });
          return;
        }

        const eligibleEnrollments = batchEnrollments.filter((e) => {
          if (!['confirmed', 'in_progress', 'completed'].includes(e.status)) return false;
          if (req.user!.role === 'corporate_client' && e.organizationId !== req.user!.organizationId) {
            return false;
          }
          return true;
        });
        const generated: TrainingCard[] = [];
        let skippedCount = 0;
        const errors: string[] = [];

        for (const enr of eligibleEnrollments) {
          const enrCards = batchCards.filter((c) => c.enrollmentId === enr.id);
          const hasActive = enrCards.some((c) => c.status === 'active');
          if (mode === 'missing_only' && hasActive) {
            skippedCount += 1;
            continue;
          }
          try {
            const cand = await fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!);
            if (!cand || !assertRecordTenant(cand, tenantId, !strictTenant)) {
              errors.push(`${enr.enrollmentNumber}: Candidate not found`);
              continue;
            }
            for (const old of enrCards) {
              if (old.status === 'active') {
                await fsUpdateDoc('trainingCards', old.id, { status: 'superseded' }, req.idToken!, []);
              }
            }
            const maxVer = enrCards.reduce((m, c) => Math.max(m, c.version || 1), 0);
            const card = await createTrainingCardForEnrollment({
              tenantId,
              strictTenant,
              enrollment: enr,
              candidate: cand,
              course,
              batch,
              actor: req.user!,
              idToken: req.idToken!,
              verifyBaseUrl: getAppBaseUrl(req),
              previousVersion: maxVer,
              preferredTemplateId: templateId,
            });
            generated.push(card);
          } catch (innerErr) {
            errors.push(`${enr.enrollmentNumber}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`);
          }
        }

        await writeAuditLog(
          req.user!,
          'BATCH_GENERATE_TRAINING_CARDS',
          'batches',
          batchId,
          `Batch ${batch.batchNumber} (${mode}): generated ${generated.length}, skipped ${skippedCount}`,
          req.idToken!,
          tenantId
        );

        res.json({
          totalEligible: eligibleEnrollments.length,
          generatedCount: generated.length,
          skippedCount,
          cards: generated,
          errors,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/training-cards/:enrollmentId/regenerate',
    requireAuth,
    requirePermission('training_cards', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const templateId = req.body?.templateId ? String(req.body.templateId).trim() : undefined;
        const enr = await fsGetDoc<Enrollment>('enrollments', String(req.params.enrollmentId), req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another tenant' });
          return;
        }
        if (req.user!.role === 'corporate_client' && enr.organizationId !== req.user!.organizationId) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another organization' });
          return;
        }
        if (req.user!.role === 'trainer' && enr.trainerUserId !== req.user!.uid) {
          res.status(403).json({ error: 'Forbidden: enrollment is not assigned to this trainer' });
          return;
        }
        const [cand, course, batch, existingCards] = await Promise.all([
          fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!),
          fsGetDoc<Course>('courses', enr.courseId, req.idToken!),
          fsGetDoc<Batch>('batches', enr.batchId, req.idToken!),
          fsQueryTenantDocs<TrainingCard>('trainingCards', tenantId, req.idToken!, {
            filters: [{ field: 'enrollmentId', op: 'EQUAL', value: enr.id }],
            strictTenantFilter: strictTenant,
          }),
        ]);
        if (!cand || !course || !batch) {
          res.status(404).json({ error: 'Missing candidate, course, or batch' });
          return;
        }
        if (
          !assertRecordTenant(cand, tenantId, !strictTenant) ||
          !assertRecordTenant(course, tenantId, !strictTenant) ||
          !assertRecordTenant(batch, tenantId, !strictTenant)
        ) {
          res.status(403).json({ error: 'Forbidden: linked records belong to another tenant' });
          return;
        }
        for (const old of existingCards) {
          if (old.status === 'active') {
            await fsUpdateDoc('trainingCards', old.id, { status: 'superseded' }, req.idToken!, []);
          }
        }
        const maxVer = existingCards.reduce((m, c) => Math.max(m, c.version || 1), 0);
        const card = await createTrainingCardForEnrollment({
          tenantId,
          strictTenant,
          enrollment: enr,
          candidate: cand,
          course,
          batch,
          actor: req.user!,
          idToken: req.idToken!,
          verifyBaseUrl: getAppBaseUrl(req),
          previousVersion: maxVer,
          preferredTemplateId: templateId,
        });
        await writeAuditLog(
          req.user!,
          'REGENERATE_TRAINING_CARD',
          'trainingCards',
          card.id,
          `Regenerated card ${card.cardSerialNumber} (v${card.version})`,
          req.idToken!,
          tenantId
        );
        res.json({ card });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post('/training-cards/bulk-pdf', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const cardIds = (req.body.cardIds || []) as string[];
      let trainerBatchIds: Set<string> | null = null;
      if (req.user!.role === 'trainer') {
        const myBatches = await fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, {
          filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
        trainerBatchIds = new Set(myBatches.map((b) => b.id));
      }
      const cards: TrainingCard[] = [];
      for (const cid of cardIds) {
        const card = await fsGetDoc<TrainingCard>('trainingCards', cid, req.idToken!);
        if (!card || !assertRecordTenant(card, tenantId, !strictTenant)) continue;
        if (req.user!.role === 'corporate_client' && card.organizationId !== req.user!.organizationId) {
          continue;
        }
        if (req.user!.role === 'candidate' && card.candidateUserId !== req.user!.uid) {
          continue;
        }
        if (trainerBatchIds && !trainerBatchIds.has(card.batchId)) {
          continue;
        }
        cards.push(card);
      }
      if (cards.length === 0) {
        res.status(404).json({ error: 'No accessible training cards found' });
        return;
      }
      const company = await getCompanyBranding(req.idToken, tenantId);
      const pdf = await generateTrainingCardPdf({
        cards,
        company,
        verifyBaseUrl: getAppBaseUrl(req),
        idToken: req.idToken,
        tenantId,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="training_cards_bulk.pdf"');
      res.send(pdf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Certificates: Eligibility-Enforced Issuance, Reissue, Revocation
  // ---------------------------------------------------------------------------
  router.get('/certificates', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const role = req.user!.role;
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!hasPermission(req.user!, 'certificates', 'view', matrix)) {
        res.status(403).json({ error: 'Forbidden: missing permission certificates:view' });
        return;
      }
      let certificates: Certificate[] = [];
      if (role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ certificates: [] });
          return;
        }
        certificates = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'candidate') {
        certificates = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
          filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'trainer') {
        const myBatches = await fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, {
          filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
          strictTenantFilter: strictTenant,
        });
        const myBatchIds = new Set(myBatches.map((b) => b.id));
        const allCerts = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
        certificates = allCerts.filter((c) => myBatchIds.has(c.batchId));
      } else {
        certificates = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
      }
      res.json({ certificates });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  async function buildCertificateSnapshotAndObj(params: {
    tenantId?: string;
    certId?: string;
    enr: Enrollment;
    cand: Candidate;
    course: Course;
    batch: Batch;
    trainer: Trainer | null;
    company: Awaited<ReturnType<typeof getCompanyBranding>>;
    template: CertificateTemplate | null;
    certNumber: string;
    tokenHash: string;
    issueDate: string;
    completionDate: string;
    expiryDate?: string;
    actor: UserProfile;
  }): Promise<Certificate> {
    const {
      enr,
      cand,
      course,
      batch,
      trainer,
      company,
      template,
      certNumber,
      tokenHash,
      issueDate,
      completionDate,
      expiryDate,
      actor,
    } = params;
    const tenantId = params.tenantId || enr.tenantId || cand.tenantId || DEFAULT_TENANT_ID;
    const certId = params.certId || tenantScopedDocId(tenantId, certNumber);
    const tplCfg = template?.config;
    const snapshot: Certificate['snapshot'] = {
      candidateNameEn: cand.fullNameEn,
      candidateNameAr: cand.fullNameAr,
      courseTitleEn: course.titleEn,
      courseTitleAr: course.titleAr,
      courseCode: course.courseCode,
      batchNumber: batch.batchNumber,
      durationLabelEn: `${course.duration} ${course.durationUnit}`,
      durationLabelAr: `${course.duration} ${
        course.durationUnit === 'hours' ? 'ساعات' : course.durationUnit === 'days' ? 'أيام' : 'أسابيع'
      }`,
      startDate: batch.startDate,
      completionDate,
      trainerNameEn: trainer?.nameEn || 'Lead Instructor',
      trainerNameAr: trainer?.nameAr || '',
      signatoryName: company.signatoryName || 'Authorized Signatory',
      companyNameEn: company.nameEn || 'Training Center',
      companyNameAr: company.nameAr || '',
      certificateTitleEn: tplCfg?.headingEn || 'CERTIFICATE OF COMPLETION',
      certificateTitleAr: tplCfg?.headingAr || 'شهادة إتمام تدريب',
      issuedByName: actor.displayName || actor.email,
      ...(cand.photoFileId ? { photoFileId: cand.photoFileId } : {}),
      ...(tplCfg?.customLogoFileId || company.logoFileId
        ? { companyLogoFileId: tplCfg?.customLogoFileId || company.logoFileId }
        : {}),
      ...(tplCfg?.customStampFileId || company.stampFileId
        ? { stampFileId: tplCfg?.customStampFileId || company.stampFileId }
        : {}),
      ...(tplCfg?.customSignatureFileId || company.signatureFileId
        ? { signatureFileId: tplCfg?.customSignatureFileId || company.signatureFileId }
        : {}),
      ...(template?.name ? { templateName: template.name } : {}),
      ...(template?.orientation ? { templateOrientation: template.orientation } : {}),
      ...(tplCfg ? { templateConfigSnapshot: tplCfg } : {}),
    };

    return {
      id: certId,
      tenantId,
      certificateNumber: certNumber,
      enrollmentId: enr.id,
      candidateDocId: cand.id,
      candidateId: cand.candidateId,
      candidateUserId: cand.userId,
      organizationId: cand.organizationId || enr.organizationId,
      courseId: course.id,
      batchId: batch.id,
      templateId: template?.id,
      templateVersion: template?.version || 1,
      tokenHash,
      pdfFileId: '',
      issueDate,
      completionDate,
      expiryDate,
      status: 'valid',
      issuedBy: actor.uid,
      snapshot,
    };
  }

  async function issueCertificateSingle(params: {
    tenantId: string;
    strictTenant: boolean;
    enr: Enrollment;
    idToken: string;
    actor: UserProfile;
    verifyBaseUrl: string;
    company: Awaited<ReturnType<typeof getCompanyBranding>>;
    preferredTemplateId?: string;
  }): Promise<{ certificate?: Certificate; errorReason?: string }> {
    const { tenantId, strictTenant, enr, idToken, actor, verifyBaseUrl, company, preferredTemplateId } = params;
    if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
      return { errorReason: 'Enrollment belongs to another tenant' };
    }
    const eligibility = await evaluateCompletionEligibility(enr, idToken, undefined, tenantId, strictTenant);
    if (!eligibility.eligible) {
      return { errorReason: eligibility.reasons.join('; ') };
    }

    if (enr.certificateId) {
      const existingCert = await fsGetDoc<Certificate>('certificates', enr.certificateId, idToken);
      if (existingCert && assertRecordTenant(existingCert, tenantId, !strictTenant) && existingCert.status === 'valid') {
        return { errorReason: `Active certificate already issued (${existingCert.certificateNumber})` };
      }
    }

    const [cand, course, batch, rawTrainer] = await Promise.all([
      fsGetDoc<Candidate>('candidates', enr.candidateDocId, idToken),
      fsGetDoc<Course>('courses', enr.courseId, idToken),
      fsGetDoc<Batch>('batches', enr.batchId, idToken),
      enr.trainerId ? fsGetDoc<Trainer>('trainers', enr.trainerId, idToken) : Promise.resolve(null),
    ]);
    if (
      !cand ||
      !course ||
      !batch ||
      !assertRecordTenant(cand, tenantId, !strictTenant) ||
      !assertRecordTenant(course, tenantId, !strictTenant) ||
      !assertRecordTenant(batch, tenantId, !strictTenant)
    ) {
      return { errorReason: 'Missing candidate, course, or batch' };
    }
    const trainer = rawTrainer && assertRecordTenant(rawTrainer, tenantId, !strictTenant) ? rawTrainer : null;

    const template = await resolveCertificateTemplate(course, idToken, preferredTemplateId, tenantId, strictTenant);
    const seqPrefix = certSeqPrefix(tenantId);
    const certNumber = await nextSequenceCode(seqPrefix, seqPrefix, true, idToken, 6, tenantId);
    const certId = tenantScopedDocId(tenantId, certNumber);
    const { rawToken, tokenHash } = generateVerificationToken();
    const issueDate = new Date().toISOString().slice(0, 10);
    const completionDate = batch.endDate || issueDate;

    let expiryDate: string | undefined;
    if (course.validityMonths && course.validityMonths > 0) {
      const d = new Date(issueDate);
      d.setMonth(d.getMonth() + course.validityMonths);
      expiryDate = d.toISOString().slice(0, 10);
    }

    const certObj = await buildCertificateSnapshotAndObj({
      tenantId,
      certId,
      enr,
      cand,
      course,
      batch,
      trainer,
      company,
      template,
      certNumber,
      tokenHash,
      issueDate,
      completionDate,
      expiryDate,
      actor,
    });

    const pdfBuf = await generateCertificatePdf({
      certificates: [{ certificate: certObj, rawVerificationToken: rawToken }],
      company,
      template,
      verifyBaseUrl,
      idToken,
      tenantId,
    });

    const savedPdf = await savePrivateFile(
      pdfBuf,
      {
        tenantId,
        fileName: `${certNumber}.pdf`,
        mimeType: 'application/pdf',
        category: 'certificate',
        organizationId: certObj.organizationId,
        candidateDocId: cand.id,
        candidateUserId: cand.userId,
        uploadedBy: actor.uid,
      },
      idToken
    );
    certObj.pdfFileId = savedPdf.fileId;

    const certDoc: Record<string, unknown> = {
      tenantId,
      certificateNumber: certNumber,
      enrollmentId: enr.id,
      candidateDocId: cand.id,
      candidateId: cand.candidateId,
      courseId: course.id,
      batchId: batch.id,
      templateVersion: template?.version || 1,
      tokenHash,
      pdfFileId: savedPdf.fileId,
      issueDate,
      completionDate,
      status: 'valid',
      issuedBy: actor.uid,
      snapshot: certObj.snapshot,
    };
    if (cand.userId) certDoc.candidateUserId = cand.userId;
    if (certObj.organizationId) certDoc.organizationId = certObj.organizationId;
    if (template?.id) certDoc.templateId = template.id;
    if (expiryDate) certDoc.expiryDate = expiryDate;

    const pubBase = {
      tenantId,
      certificateNumber: certNumber,
      candidateNameEn: cand.fullNameEn,
      candidateNameAr: cand.fullNameAr,
      courseTitleEn: course.titleEn,
      courseTitleAr: course.titleAr,
      completionDate,
      issueDate,
      issuingCenterEn: company.nameEn || 'Training Center',
      issuingCenterAr: company.nameAr || '',
      status: 'valid',
      ...(expiryDate ? { expiryDate } : {}),
    };

    await fsCommit(
      [
        {
          type: 'create',
          collection: 'certificates',
          docId: certId,
          data: certDoc,
          serverTimestampFields: ['createdAt', 'updatedAt'],
        },
        {
          type: 'set',
          collection: 'publicVerifications',
          docId: certNumber,
          data: { lookupKey: certNumber, ...pubBase },
          serverTimestampFields: ['updatedAt'],
        },
        {
          type: 'set',
          collection: 'publicVerifications',
          docId: tokenHash,
          data: { lookupKey: tokenHash, ...pubBase },
          serverTimestampFields: ['updatedAt'],
        },
        {
          type: 'update',
          collection: 'enrollments',
          docId: enr.id,
          data: { certificateId: certId },
          updateFields: ['certificateId'],
          serverTimestampFields: ['updatedAt'],
        },
      ],
      idToken
    );

    await createNotification(
      {
        tenantId,
        organizationId: certObj.organizationId,
        targetUserId: cand.userId,
        type: 'certificate_issued',
        titleEn: 'Training Certificate Issued',
        titleAr: 'تم إصدار الشهادة التدريبية',
        bodyEn: `Certificate ${certNumber} issued for ${cand.fullNameEn}`,
        bodyAr: `تم إصدار الشهادة ${certNumber} للمتدرب ${cand.fullNameAr}`,
      },
      idToken
    );

    void dispatchAutomatedCategoryNotifications({
      tenantId,
      category: 'certificate_pdf_delivery',
      candidate: cand,
      enrollmentId: enr.id,
      certificateId: certId,
      attachmentFileId: certObj.pdfFileId,
      attachmentFilename: `${certNumber}.pdf`,
      entityId: certNumber,
      variables: {
        certificateNumber: certNumber,
        courseNameEn: certObj.snapshot.courseTitleEn,
        courseNameAr: certObj.snapshot.courseTitleAr,
        expiryDate: certObj.expiryDate || 'Lifetime',
        documentLink: verifyBaseUrl
          ? `${verifyBaseUrl}/?cert=${encodeURIComponent(certNumber)}`
          : certNumber,
      },
      actor,
      idToken,
    });

    await writeAuditLog(
      actor,
      'ISSUE_CERTIFICATE',
      'certificates',
      certId,
      `Issued certificate ${certNumber} (template v${certObj.templateVersion}) for ${cand.candidateId}`,
      idToken,
      tenantId
    );

    return { certificate: certObj };
  }

  router.post(
    '/certificates/issue',
    requireAuth,
    requirePermission('certificates', 'approve'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const enrollmentIds: string[] = Array.isArray(req.body.enrollmentIds)
          ? req.body.enrollmentIds.map(String)
          : [String(req.body.enrollmentId)];
        const preferredTemplateId = req.body.templateId ? String(req.body.templateId).trim() : undefined;
        const issued: Certificate[] = [];
        const errors: Array<{ enrollmentId: string; reason: string }> = [];
        const verifyBaseUrl = getAppBaseUrl(req);
        const company = await getCompanyBranding(req.idToken, tenantId);

        await assertTenantPlanLimit({
          tenantId,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: strictTenant,
          metric: 'maxCertificates',
        });

        for (const enrId of enrollmentIds) {
          const enr = await fsGetDoc<Enrollment>('enrollments', enrId, req.idToken!);
          if (!enr || !assertRecordTenant(enr, tenantId, !strictTenant)) {
            errors.push({ enrollmentId: enrId, reason: 'Enrollment not found in active tenant' });
            continue;
          }
          const result = await issueCertificateSingle({
            tenantId,
            strictTenant,
            enr,
            idToken: req.idToken!,
            actor: req.user!,
            verifyBaseUrl,
            company,
            preferredTemplateId,
          });
          if (result.certificate) issued.push(result.certificate);
          else errors.push({ enrollmentId: enrId, reason: result.errorReason || 'Eligibility check failed' });
        }

        res.json({ issued, errors });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/certificates/batch/:batchId/issue',
    requireAuth,
    requirePermission('certificates', 'approve'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const batchId = String(req.params.batchId || '');
        const preferredTemplateId = req.body?.templateId ? String(req.body.templateId).trim() : undefined;
        const batch = await fsGetDoc<Batch>('batches', batchId, req.idToken!);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        if (!assertRecordTenant(batch, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: batch belongs to another tenant' });
          return;
        }
        const batchEnrollments = await fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
          filters: [{ field: 'batchId', op: 'EQUAL', value: batchId }],
          strictTenantFilter: strictTenant,
        });

        const issued: Certificate[] = [];
        const errors: Array<{ enrollmentId: string; reason: string }> = [];
        let skippedCount = 0;
        const verifyBaseUrl = getAppBaseUrl(req);
        const company = await getCompanyBranding(req.idToken, tenantId);

        await assertTenantPlanLimit({
          tenantId,
          tenant: req.tenant,
          idToken: req.idToken!,
          strictTenantQuery: strictTenant,
          metric: 'maxCertificates',
        });

        for (const enr of batchEnrollments) {
          if (enr.certificateId) {
            const existingCert = await fsGetDoc<Certificate>('certificates', enr.certificateId, req.idToken!);
            if (existingCert && existingCert.status === 'valid') {
              skippedCount += 1;
              continue;
            }
          }
          const result = await issueCertificateSingle({
            tenantId,
            strictTenant,
            enr,
            idToken: req.idToken!,
            actor: req.user!,
            verifyBaseUrl,
            company,
            preferredTemplateId,
          });
          if (result.certificate) issued.push(result.certificate);
          else errors.push({ enrollmentId: enr.enrollmentNumber || enr.id, reason: result.errorReason || 'Not eligible' });
        }

        await writeAuditLog(
          req.user!,
          'BATCH_ISSUE_CERTIFICATES',
          'batches',
          batchId,
          `Batch ${batch.batchNumber}: issued ${issued.length}, skipped ${skippedCount}, ineligible ${errors.length}`,
          req.idToken!,
          tenantId
        );

        res.json({
          issued,
          skippedCount,
          errors,
        });
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          res.status(err.status).json({ error: err.message, code: err.code });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/certificates/preview',
    requireAuth,
    requirePermission('certificates', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const enrollmentId = String(req.body.enrollmentId || '').trim();
        const preferredTemplateId = req.body.templateId ? String(req.body.templateId).trim() : undefined;
        if (!enrollmentId) {
          res.status(400).json({ error: 'enrollmentId is required' });
          return;
        }
        const enr = await fsGetDoc<Enrollment>('enrollments', enrollmentId, req.idToken!);
        if (!enr) {
          res.status(404).json({ error: 'Enrollment not found' });
          return;
        }
        if (!assertRecordTenant(enr, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: enrollment belongs to another tenant' });
          return;
        }
        const [cand, course, batch, rawTrainer, company] = await Promise.all([
          fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!),
          fsGetDoc<Course>('courses', enr.courseId, req.idToken!),
          fsGetDoc<Batch>('batches', enr.batchId, req.idToken!),
          enr.trainerId ? fsGetDoc<Trainer>('trainers', enr.trainerId, req.idToken!) : Promise.resolve(null),
          getCompanyBranding(req.idToken, tenantId),
        ]);
        if (
          !cand ||
          !course ||
          !batch ||
          !assertRecordTenant(cand, tenantId, !strictTenant) ||
          !assertRecordTenant(course, tenantId, !strictTenant) ||
          !assertRecordTenant(batch, tenantId, !strictTenant)
        ) {
          res.status(404).json({ error: 'Missing candidate, course, or batch' });
          return;
        }
        const trainer = rawTrainer && assertRecordTenant(rawTrainer, tenantId, !strictTenant) ? rawTrainer : null;
        const template = await resolveCertificateTemplate(course, req.idToken!, preferredTemplateId, tenantId, strictTenant);
        const issueDate = new Date().toISOString().slice(0, 10);
        const completionDate = batch.endDate || issueDate;
        let expiryDate: string | undefined;
        if (course.validityMonths && course.validityMonths > 0) {
          const d = new Date(issueDate);
          d.setMonth(d.getMonth() + course.validityMonths);
          expiryDate = d.toISOString().slice(0, 10);
        }
        const previewCert = await buildCertificateSnapshotAndObj({
          tenantId,
          certId: 'preview-cert',
          enr,
          cand,
          course,
          batch,
          trainer,
          company,
          template,
          certNumber: `${certSeqPrefix(tenantId)}-${new Date().getFullYear()}-PREVIEW`,
          tokenHash: 'PREVIEW_TOKEN_HASH',
          issueDate,
          completionDate,
          expiryDate,
          actor: req.user!,
        });

        const pdf = await generateCertificatePdf({
          certificates: [{ certificate: previewCert, rawVerificationToken: 'PREVIEW_VERIFICATION_TOKEN' }],
          company,
          template,
          verifyBaseUrl: getAppBaseUrl(req),
          idToken: req.idToken,
          tenantId,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="certificate_preview.pdf"');
        res.send(pdf);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/certificates/bulk-pdf',
    requireAuth,
    requirePermission('certificates', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const certificateIds = Array.isArray(req.body.certificateIds)
          ? req.body.certificateIds.map(String)
          : [];
        if (certificateIds.length === 0) {
          res.status(400).json({ error: 'certificateIds array is required' });
          return;
        }
        const role = req.user!.role;
        let trainerBatchIds: Set<string> | null = null;
        if (role === 'trainer') {
          const myBatches = await fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, {
            filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
            strictTenantFilter: strictTenant,
          });
          trainerBatchIds = new Set(myBatches.map((b) => b.id));
        }
        const certs: Array<{ certificate: Certificate }> = [];
        for (const cid of certificateIds) {
          const cert = await fsGetDoc<Certificate>('certificates', cid, req.idToken!);
          if (!cert || !assertRecordTenant(cert, tenantId, !strictTenant)) continue;
          if (role === 'corporate_client' && cert.organizationId !== req.user!.organizationId) continue;
          if (role === 'candidate' && cert.candidateUserId !== req.user!.uid) continue;
          if (trainerBatchIds && !trainerBatchIds.has(cert.batchId)) continue;
          certs.push({ certificate: cert });
        }
        if (certs.length === 0) {
          res.status(404).json({ error: 'No accessible certificates found' });
          return;
        }
        const company = await getCompanyBranding(req.idToken, tenantId);
        const pdf = await generateCertificatePdf({
          certificates: certs,
          company,
          verifyBaseUrl: getAppBaseUrl(req),
          idToken: req.idToken,
          tenantId,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="certificates_bundle.pdf"');
        res.send(pdf);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/certificates/:id/revoke',
    requireAuth,
    requirePermission('certificates', 'delete'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const reason = String(req.body.reason || '').trim().slice(0, 500);
        if (!reason) {
          res.status(400).json({ error: 'A revocation reason is required' });
          return;
        }
        const cert = await fsGetDoc<Certificate>('certificates', id, req.idToken!);
        if (!cert) {
          res.status(404).json({ error: 'Certificate not found' });
          return;
        }
        if (!assertRecordTenant(cert, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: certificate belongs to another tenant' });
          return;
        }

        await fsCommit(
          [
            {
              type: 'update',
              collection: 'certificates',
              docId: id,
              data: { status: 'revoked', revocationReason: reason, revokedBy: req.user!.uid },
              updateFields: ['status', 'revocationReason', 'revokedBy'],
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'publicVerifications',
              docId: cert.certificateNumber,
              data: { status: 'revoked' },
              updateFields: ['status'],
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'publicVerifications',
              docId: cert.tokenHash,
              data: { status: 'revoked' },
              updateFields: ['status'],
              serverTimestampFields: ['updatedAt'],
            },
          ],
          req.idToken!
        );

        await writeAuditLog(
          req.user!,
          'REVOKE_CERTIFICATE',
          'certificates',
          id,
          `Revoked ${cert.certificateNumber}: ${reason}`,
          req.idToken!,
          tenantId
        );
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/certificates/:id/reissue',
    requireAuth,
    requirePermission('certificates', 'edit'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const oldCert = await fsGetDoc<Certificate>('certificates', id, req.idToken!);
        if (!oldCert) {
          res.status(404).json({ error: 'Certificate not found' });
          return;
        }
        if (!assertRecordTenant(oldCert, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: certificate belongs to another tenant' });
          return;
        }

        const seqPrefix = certSeqPrefix(tenantId);
        const newCertNumber = await nextSequenceCode(seqPrefix, seqPrefix, true, req.idToken!, 6, tenantId);
        const newCertId = tenantScopedDocId(tenantId, newCertNumber);
        const { rawToken, tokenHash } = generateVerificationToken();
        const company = await getCompanyBranding(req.idToken, tenantId);
        const rawTpl = oldCert.templateId
          ? await fsGetDoc<CertificateTemplate>('certificateTemplates', oldCert.templateId, req.idToken!)
          : null;
        const template = rawTpl && assertRecordTenant(rawTpl, tenantId, !strictTenant) ? rawTpl : null;
        const issueDate = new Date().toISOString().slice(0, 10);

        const newCertObj: Certificate = {
          ...oldCert,
          id: newCertId,
          tenantId,
          certificateNumber: newCertNumber,
          tokenHash,
          issueDate,
          status: 'valid',
          issuedBy: req.user!.uid,
          pdfFileId: '',
          snapshot: {
            ...oldCert.snapshot,
            issuedByName: req.user!.displayName || req.user!.email,
          },
        };

        const pdfBuf = await generateCertificatePdf({
          certificates: [{ certificate: newCertObj, rawVerificationToken: rawToken }],
          company,
          template,
          verifyBaseUrl: getAppBaseUrl(req),
          idToken: req.idToken,
          tenantId,
        });
        const savedPdf = await savePrivateFile(
          pdfBuf,
          {
            tenantId,
            fileName: `${newCertNumber}.pdf`,
            mimeType: 'application/pdf',
            category: 'certificate',
            organizationId: oldCert.organizationId,
            candidateDocId: oldCert.candidateDocId,
            candidateUserId: oldCert.candidateUserId,
            uploadedBy: req.user!.uid,
          },
          req.idToken
        );

        const newDoc: Record<string, unknown> = {
          tenantId,
          certificateNumber: newCertNumber,
          enrollmentId: oldCert.enrollmentId,
          candidateDocId: oldCert.candidateDocId,
          candidateId: oldCert.candidateId,
          courseId: oldCert.courseId,
          batchId: oldCert.batchId,
          templateVersion: oldCert.templateVersion || 1,
          tokenHash,
          pdfFileId: savedPdf.fileId,
          issueDate,
          completionDate: oldCert.completionDate,
          status: 'valid',
          issuedBy: req.user!.uid,
          snapshot: newCertObj.snapshot,
        };
        if (oldCert.candidateUserId) newDoc.candidateUserId = oldCert.candidateUserId;
        if (oldCert.organizationId) newDoc.organizationId = oldCert.organizationId;
        if (oldCert.templateId) newDoc.templateId = oldCert.templateId;
        if (oldCert.expiryDate) newDoc.expiryDate = oldCert.expiryDate;

        const pubBase = {
          tenantId,
          certificateNumber: newCertNumber,
          candidateNameEn: oldCert.snapshot.candidateNameEn,
          candidateNameAr: oldCert.snapshot.candidateNameAr,
          courseTitleEn: oldCert.snapshot.courseTitleEn,
          courseTitleAr: oldCert.snapshot.courseTitleAr,
          completionDate: oldCert.completionDate,
          issueDate,
          issuingCenterEn: oldCert.snapshot.companyNameEn,
          issuingCenterAr: oldCert.snapshot.companyNameAr,
          status: 'valid',
          ...(oldCert.expiryDate ? { expiryDate: oldCert.expiryDate } : {}),
        };

        await fsCommit(
          [
            {
              type: 'update',
              collection: 'certificates',
              docId: id,
              data: { status: 'superseded', supersededBy: newCertNumber },
              updateFields: ['status', 'supersededBy'],
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'publicVerifications',
              docId: oldCert.certificateNumber,
              data: { status: 'superseded', supersededBy: newCertNumber },
              updateFields: ['status', 'supersededBy'],
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'publicVerifications',
              docId: oldCert.tokenHash,
              data: { status: 'superseded', supersededBy: newCertNumber },
              updateFields: ['status', 'supersededBy'],
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'create',
              collection: 'certificates',
              docId: newCertId,
              data: newDoc,
              serverTimestampFields: ['createdAt', 'updatedAt'],
            },
            {
              type: 'set',
              collection: 'publicVerifications',
              docId: newCertNumber,
              data: { lookupKey: newCertNumber, ...pubBase },
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'set',
              collection: 'publicVerifications',
              docId: tokenHash,
              data: { lookupKey: tokenHash, ...pubBase },
              serverTimestampFields: ['updatedAt'],
            },
            {
              type: 'update',
              collection: 'enrollments',
              docId: oldCert.enrollmentId,
              data: { certificateId: newCertId },
              updateFields: ['certificateId'],
              serverTimestampFields: ['updatedAt'],
            },
          ],
          req.idToken!
        );

        await writeAuditLog(
          req.user!,
          'REISSUE_CERTIFICATE',
          'certificates',
          newCertId,
          `Reissued ${oldCert.certificateNumber} as ${newCertNumber}`,
          req.idToken!,
          tenantId
        );
        res.json({ certificate: { ...newCertObj, pdfFileId: savedPdf.fileId } });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Templates: Certificate Templates & Card Templates
  // ---------------------------------------------------------------------------
  router.get('/templates/certificates', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const templates = await fsQueryTenantDocs<CertificateTemplate>('certificateTemplates', tenantId, req.idToken!, {
        strictTenantFilter: strictTenant,
      });
      res.json({ templates });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/templates/certificates',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = req.body.id ? String(req.body.id) : tenantScopedDocId(tenantId, randomId('ctpl'));
        const existing = await fsGetDoc<CertificateTemplate>('certificateTemplates', id, req.idToken!);
        if (existing && !assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: certificate template belongs to another tenant' });
          return;
        }
        const scope = req.body.scope === 'course' ? 'course' : 'common';
        const courseId = scope === 'course' && req.body.courseId ? String(req.body.courseId) : undefined;
        if (courseId) {
          const course = await fsGetDoc<Course>('courses', courseId, req.idToken!);
          if (!course || !assertRecordTenant(course, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: course belongs to another tenant' });
            return;
          }
        }
        const languageMode: 'bilingual' | 'en' | 'ar' =
          req.body.languageMode === 'en' || req.body.languageMode === 'ar'
            ? req.body.languageMode
            : 'bilingual';
        const isDefault = Boolean(req.body.isDefault);
        const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

        if (isDefault) {
          const allTemplates = await fsQueryTenantDocs<CertificateTemplate>('certificateTemplates', tenantId, req.idToken!, {
            strictTenantFilter: strictTenant,
          });
          for (const tpl of allTemplates) {
            if (tpl.id === id) continue;
            if (
              (scope === 'common' && tpl.scope === 'common' && tpl.isDefault) ||
              (scope === 'course' && tpl.scope === 'course' && tpl.courseId === courseId && tpl.isDefault)
            ) {
              await fsUpdateDoc('certificateTemplates', tpl.id, { isDefault: false }, req.idToken!, ['updatedAt']);
            }
          }
        }

        const payload: Record<string, unknown> = {
          tenantId,
          name: String(req.body.name || 'Standard Certificate Template').slice(0, 160),
          scope,
          orientation: req.body.orientation === 'portrait' ? 'portrait' : 'landscape',
          languageMode,
          version: (existing?.version || 0) + 1,
          isDefault,
          isActive: isDefault ? true : isActive,
          config: { ...(req.body.config || {}), languageMode },
          updatedBy: req.user!.uid,
        };
        if (courseId) {
          payload.courseId = courseId;
        }

        if (existing) {
          await fsUpdateDoc('certificateTemplates', id, payload, req.idToken!, ['updatedAt']);
        } else {
          await fsCreateDoc('certificateTemplates', id, payload, req.idToken!, ['createdAt', 'updatedAt']);
        }
        await writeAuditLog(
          req.user!,
          'SAVE_CERTIFICATE_TEMPLATE',
          'certificateTemplates',
          id,
          `Saved certificate template ${payload.name} (v${payload.version})`,
          req.idToken!,
          tenantId
        );
        const saved = await fsGetDoc<CertificateTemplate>('certificateTemplates', id, req.idToken!);
        res.json({ template: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/templates/certificates/:id/status',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const existing = await fsGetDoc<CertificateTemplate>('certificateTemplates', id, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Certificate template not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: certificate template belongs to another tenant' });
          return;
        }
        const nextActive =
          req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive !== false;
        const nextDefault =
          req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : existing.isDefault;

        if (nextDefault) {
          const allTemplates = await fsQueryTenantDocs<CertificateTemplate>('certificateTemplates', tenantId, req.idToken!, {
            strictTenantFilter: strictTenant,
          });
          for (const tpl of allTemplates) {
            if (tpl.id === id) continue;
            if (
              (existing.scope === 'common' && tpl.scope === 'common' && tpl.isDefault) ||
              (existing.scope === 'course' && tpl.scope === 'course' && tpl.courseId === existing.courseId && tpl.isDefault)
            ) {
              await fsUpdateDoc('certificateTemplates', tpl.id, { isDefault: false }, req.idToken!, ['updatedAt']);
            }
          }
        }

        await fsUpdateDoc(
          'certificateTemplates',
          id,
          {
            tenantId,
            isActive: nextDefault ? true : nextActive,
            isDefault: nextActive ? nextDefault : false,
            updatedBy: req.user!.uid,
          },
          req.idToken!,
          ['updatedAt']
        );
        await writeAuditLog(
          req.user!,
          'UPDATE_CERTIFICATE_TEMPLATE_STATUS',
          'certificateTemplates',
          id,
          `Updated certificate template ${existing.name}: active=${nextDefault ? true : nextActive}, default=${nextActive ? nextDefault : false}`,
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<CertificateTemplate>('certificateTemplates', id, req.idToken!);
        res.json({ template: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/templates/certificates/preview',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const company = await getCompanyBranding(req.idToken, tenantId);
        let previewTpl: CertificateTemplate | null = req.body.template || null;
        if (!previewTpl && req.body.templateId) {
          const fetchedTpl = await fsGetDoc<CertificateTemplate>(
            'certificateTemplates',
            String(req.body.templateId),
            req.idToken!
          );
          if (fetchedTpl && !assertRecordTenant(fetchedTpl, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: certificate template belongs to another tenant' });
            return;
          }
          previewTpl = fetchedTpl;
        }

        const sampleCert: Certificate = {
          id: 'preview-cert',
          tenantId,
          certificateNumber: `${certSeqPrefix(tenantId)}-${new Date().getFullYear()}-000001`,
          enrollmentId: 'preview-enr',
          candidateDocId: 'preview-cnd',
          candidateId: 'CND-2026-00001',
          courseId: 'preview-crs',
          batchId: 'preview-bth',
          templateId: previewTpl?.id,
          templateVersion: previewTpl?.version || 1,
          tokenHash: 'PREVIEW_CERT_TOKEN_HASH',
          pdfFileId: '',
          issueDate: new Date().toISOString().slice(0, 10),
          completionDate: new Date().toISOString().slice(0, 10),
          expiryDate: '2028-05-14',
          status: 'valid',
          issuedBy: req.user!.uid,
          snapshot: {
            candidateNameEn: 'Tariq Abdullah Al-Mansoor',
            candidateNameAr: 'طارق عبدالله المنصور',
            courseTitleEn: 'Occupational Health & Industrial Safety Level 3',
            courseTitleAr: 'الصحة المهنية والسلامة الصناعية - المستوى الثالث',
            courseCode: 'OHS-301',
            batchNumber: 'BTH-2026-0001',
            durationLabelEn: '5 days (40 hrs)',
            durationLabelAr: '5 أيام (40 ساعة)',
            startDate: '2026-05-10',
            completionDate: '2026-05-14',
            trainerNameEn: 'Eng. Faisal Al-Qahtani',
            trainerNameAr: 'م. فيصل القحطاني',
            signatoryName: company.signatoryName || 'Dr. Khaled Al-Otaibi',
            companyNameEn: company.nameEn || 'Training Center',
            companyNameAr: company.nameAr || 'مركز التدريب المعتمد',
            certificateTitleEn: previewTpl?.config?.headingEn || 'CERTIFICATE OF COMPLETION',
            certificateTitleAr: previewTpl?.config?.headingAr || 'شهادة إتمام تدريب',
            templateOrientation: previewTpl?.orientation || 'landscape',
            templateConfigSnapshot: previewTpl?.config,
          },
        };

        const pdf = await generateCertificatePdf({
          certificates: [{ certificate: sampleCert, rawVerificationToken: 'PREVIEW_CERTIFICATE_TOKEN' }],
          company,
          template: previewTpl,
          verifyBaseUrl: getAppBaseUrl(req),
          idToken: req.idToken,
          tenantId,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="certificate_template_preview.pdf"');
        res.send(pdf);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.get('/templates/cards', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const templates = await fsQueryTenantDocs<CardTemplate>('cardTemplates', tenantId, req.idToken!, {
        strictTenantFilter: strictTenant,
      });
      res.json({ templates });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post(
    '/templates/cards',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = req.body.id ? String(req.body.id) : tenantScopedDocId(tenantId, randomId('cardtpl'));
        const existing = await fsGetDoc<CardTemplate>('cardTemplates', id, req.idToken!);
        if (existing && !assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: card template belongs to another tenant' });
          return;
        }
        const scope = req.body.scope === 'course' ? 'course' : 'common';
        const courseId = scope === 'course' && req.body.courseId ? String(req.body.courseId) : undefined;
        if (courseId) {
          const course = await fsGetDoc<Course>('courses', courseId, req.idToken!);
          if (!course || !assertRecordTenant(course, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: course belongs to another tenant' });
            return;
          }
        }
        const languageMode: 'bilingual' | 'en' | 'ar' =
          req.body.languageMode === 'en' || req.body.languageMode === 'ar' ? req.body.languageMode : 'bilingual';
        const isDefault = Boolean(req.body.isDefault);
        const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

        if (isDefault) {
          const allTemplates = await fsQueryTenantDocs<CardTemplate>('cardTemplates', tenantId, req.idToken!, {
            strictTenantFilter: strictTenant,
          });
          for (const tpl of allTemplates) {
            if (tpl.id === id) continue;
            if (
              (scope === 'common' && tpl.scope === 'common' && tpl.isDefault) ||
              (scope === 'course' && tpl.scope === 'course' && tpl.courseId === courseId && tpl.isDefault)
            ) {
              await fsUpdateDoc('cardTemplates', tpl.id, { isDefault: false }, req.idToken!, ['updatedAt']);
            }
          }
        }

        const payload: Record<string, unknown> = {
          tenantId,
          name: String(req.body.name || 'Standard CR80 Card Template').slice(0, 160),
          scope,
          languageMode,
          widthMm: Number(req.body.widthMm || 85.6),
          heightMm: Number(req.body.heightMm || 53.98),
          version: (existing?.version || 0) + 1,
          isDefault,
          isActive: isDefault ? true : isActive,
          config: { ...(req.body.config || {}), languageMode },
          updatedBy: req.user!.uid,
        };
        if (courseId) {
          payload.courseId = courseId;
        }

        if (existing) {
          await fsUpdateDoc('cardTemplates', id, payload, req.idToken!, ['updatedAt']);
        } else {
          await fsCreateDoc('cardTemplates', id, payload, req.idToken!, ['createdAt', 'updatedAt']);
        }
        await writeAuditLog(
          req.user!,
          'SAVE_CARD_TEMPLATE',
          'cardTemplates',
          id,
          `Saved card template ${payload.name} (v${payload.version})`,
          req.idToken!,
          tenantId
        );
        const saved = await fsGetDoc<CardTemplate>('cardTemplates', id, req.idToken!);
        res.json({ template: saved });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.patch(
    '/templates/cards/:id/status',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const id = String(req.params.id);
        const existing = await fsGetDoc<CardTemplate>('cardTemplates', id, req.idToken!);
        if (!existing) {
          res.status(404).json({ error: 'Card template not found' });
          return;
        }
        if (!assertRecordTenant(existing, tenantId, !strictTenant)) {
          res.status(403).json({ error: 'Forbidden: card template belongs to another tenant' });
          return;
        }
        const nextActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive !== false;
        const nextDefault = req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : existing.isDefault;

        if (nextDefault) {
          const allTemplates = await fsQueryTenantDocs<CardTemplate>('cardTemplates', tenantId, req.idToken!, {
            strictTenantFilter: strictTenant,
          });
          for (const tpl of allTemplates) {
            if (tpl.id === id) continue;
            if (
              (existing.scope === 'common' && tpl.scope === 'common' && tpl.isDefault) ||
              (existing.scope === 'course' && tpl.scope === 'course' && tpl.courseId === existing.courseId && tpl.isDefault)
            ) {
              await fsUpdateDoc('cardTemplates', tpl.id, { isDefault: false }, req.idToken!, ['updatedAt']);
            }
          }
        }

        await fsUpdateDoc(
          'cardTemplates',
          id,
          {
            tenantId,
            isActive: nextDefault ? true : nextActive,
            isDefault: nextActive ? nextDefault : false,
            updatedBy: req.user!.uid,
          },
          req.idToken!,
          ['updatedAt']
        );
        await writeAuditLog(
          req.user!,
          'UPDATE_CARD_TEMPLATE_STATUS',
          'cardTemplates',
          id,
          `Updated template ${existing.name}: active=${nextDefault ? true : nextActive}, default=${nextActive ? nextDefault : false}`,
          req.idToken!,
          tenantId
        );
        const updated = await fsGetDoc<CardTemplate>('cardTemplates', id, req.idToken!);
        res.json({ template: updated });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  router.post(
    '/templates/cards/preview',
    requireAuth,
    requireRole(['super_admin', 'admin']),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const company = await getCompanyBranding(req.idToken, tenantId);
        const enrollmentId = req.body.enrollmentId ? String(req.body.enrollmentId).trim() : '';
        let previewTpl: CardTemplate | null = req.body.template || null;
        if (!previewTpl && req.body.templateId) {
          const fetchedTpl = await fsGetDoc<CardTemplate>('cardTemplates', String(req.body.templateId), req.idToken!);
          if (fetchedTpl && !assertRecordTenant(fetchedTpl, tenantId, !strictTenant)) {
            res.status(403).json({ error: 'Forbidden: card template belongs to another tenant' });
            return;
          }
          previewTpl = fetchedTpl;
        }

        let sampleCard: TrainingCard | null = null;
        if (enrollmentId) {
          const enr = await fsGetDoc<Enrollment>('enrollments', enrollmentId, req.idToken!);
          if (enr && assertRecordTenant(enr, tenantId, !strictTenant)) {
            const [cand, course, batch] = await Promise.all([
              fsGetDoc<Candidate>('candidates', enr.candidateDocId, req.idToken!),
              fsGetDoc<Course>('courses', enr.courseId, req.idToken!),
              fsGetDoc<Batch>('batches', enr.batchId, req.idToken!),
            ]);
            const rawTrainer = batch?.trainerId
              ? await fsGetDoc<Trainer>('trainers', batch.trainerId, req.idToken!).catch(() => null)
              : null;
            const trainer = rawTrainer && assertRecordTenant(rawTrainer, tenantId, !strictTenant) ? rawTrainer : null;
            if (
              cand &&
              course &&
              batch &&
              assertRecordTenant(cand, tenantId, !strictTenant) &&
              assertRecordTenant(course, tenantId, !strictTenant) &&
              assertRecordTenant(batch, tenantId, !strictTenant)
            ) {
              sampleCard = {
                id: 'preview-card',
                tenantId,
                cardSerialNumber: 'CARD-2026-PREVIEW',
                enrollmentId: enr.id,
                candidateDocId: cand.id,
                candidateId: cand.candidateId,
                courseId: course.id,
                batchId: batch.id,
                qrTokenHash: 'PREVIEW_QR_VERIFICATION_HASH_0000',
                pdfFileId: '',
                version: 1,
                status: 'active',
                generatedBy: req.user!.uid,
                snapshot: {
                  candidateNameEn: cand.fullNameEn,
                  candidateNameAr: cand.fullNameAr,
                  iqamaMasked: cand.iqamaMasked || '******1234',
                  courseTitleEn: course.titleEn,
                  courseTitleAr: course.titleAr,
                  courseCode: course.courseCode,
                  batchNumber: batch.batchNumber,
                  startDate: batch.startDate,
                  endDate: batch.endDate,
                  companyNameEn: company.nameEn || 'Training Center',
                  companyNameAr: company.nameAr || 'مركز التدريب',
                  photoFileId: cand.photoFileId || '',
                  trainerNameEn: trainer?.nameEn || 'Eng. Faisal Al-Qahtani',
                  trainerNameAr: trainer?.nameAr || 'م. فيصل القحطاني',
                  venue: batch.venue || 'Main Training Hall',
                  cardTitleEn: previewTpl?.config?.cardTitleEn || 'TRAINING CARD',
                  cardTitleAr: previewTpl?.config?.cardTitleAr || 'بطاقة تدريب',
                },
              };
            }
          }
        }

        if (!sampleCard) {
          sampleCard = {
            id: 'preview-card',
            tenantId,
            cardSerialNumber: 'CARD-2026-0001',
            enrollmentId: 'preview-enr',
            candidateDocId: 'preview-cnd',
            candidateId: 'CND-2026-00001',
            courseId: 'preview-crs',
            batchId: 'preview-bth',
            qrTokenHash: 'PREVIEW_QR_VERIFICATION_HASH_0000',
            pdfFileId: '',
            version: 1,
            status: 'active',
            generatedBy: req.user!.uid,
            snapshot: {
              candidateNameEn: 'Tariq Al-Mansoor',
              candidateNameAr: 'طارق المنصور',
              iqamaMasked: '******1234',
              courseTitleEn: 'Industrial Fire Safety & Rescue',
              courseTitleAr: 'السلامة من الحرائق والإنقاذ الصناعي',
              courseCode: 'FS-101',
              batchNumber: 'BTH-2026-0001',
              startDate: '2026-05-10',
              endDate: '2026-05-14',
              companyNameEn: company.nameEn || 'Training Center',
              companyNameAr: company.nameAr || 'مركز التدريب المعتمد',
              trainerNameEn: 'Eng. Faisal Al-Qahtani',
              trainerNameAr: 'م. فيصل القحطاني',
              venue: 'Riyadh Safety Academy - Hall A',
              cardTitleEn: previewTpl?.config?.cardTitleEn || 'TRAINING CARD',
              cardTitleAr: previewTpl?.config?.cardTitleAr || 'بطاقة تدريب',
            },
          };
        }

        const pdf = await generateTrainingCardPdf({
          cards: [sampleCard],
          company,
          template: previewTpl,
          verifyBaseUrl: getAppBaseUrl(req),
          idToken: req.idToken,
          tenantId,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="card_template_preview.pdf"');
        res.send(pdf);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Public & Internal Certificate Verification
  // ---------------------------------------------------------------------------
  router.get('/public/verify', async (req, res) => {
    try {
      const certNum = String(req.query.cert || '').trim().toUpperCase();
      const rawToken = String(req.query.token || '').trim();
      const lookupKey = rawToken ? hashVerificationToken(rawToken) : certNum;

      if (!lookupKey || !/^[a-zA-Z0-9_\-]+$/.test(lookupKey)) {
        res.json({ found: false, status: 'not_found' } satisfies PublicVerificationResult);
        return;
      }

      const record = await fsGetDoc<{
        tenantId?: string;
        certificateNumber: string;
        candidateNameEn: string;
        candidateNameAr?: string;
        courseTitleEn: string;
        courseTitleAr?: string;
        completionDate: string;
        issueDate: string;
        expiryDate?: string;
        issuingCenterEn: string;
        issuingCenterAr?: string;
        status: 'valid' | 'expired' | 'revoked' | 'superseded';
        supersededBy?: string;
      }>('publicVerifications', lookupKey);

      let computedStatus: PublicVerificationResult['status'] = record ? record.status : 'not_found';
      if (record && record.status === 'valid' && record.expiryDate) {
        if (record.expiryDate < new Date().toISOString().slice(0, 10)) {
          computedStatus = 'expired';
        }
      }

      // Log public verification without PII
      try {
        await fsCreateDoc(
          'verificationLogs',
          randomId('vlog'),
          {
            tenantId: record?.tenantId || DEFAULT_TENANT_ID,
            mode: 'public',
            query: certNum || 'qr_token',
            resultStatus: computedStatus,
            ...(record?.certificateNumber ? { certificateNumber: record.certificateNumber } : {}),
          },
          undefined,
          ['createdAt']
        );
      } catch {
        // Non-blocking audit log
      }

      if (!record) {
        res.json({ found: false, status: 'not_found' } satisfies PublicVerificationResult);
        return;
      }

      res.json({
        found: true,
        status: computedStatus,
        tenantId: record.tenantId,
        certificateNumber: record.certificateNumber,
        candidateNameEn: record.candidateNameEn,
        candidateNameAr: record.candidateNameAr,
        courseTitleEn: record.courseTitleEn,
        courseTitleAr: record.courseTitleAr,
        completionDate: record.completionDate,
        issueDate: record.issueDate,
        expiryDate: record.expiryDate,
        issuingCenterEn: record.issuingCenterEn,
        issuingCenterAr: record.issuingCenterAr,
        supersededBy: record.supersededBy,
      } satisfies PublicVerificationResult);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get(
    '/verification/internal',
    requireAuth,
    requirePermission('verification', 'view'),
    async (req: AuthedRequest, res) => {
      try {
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const q = String(req.query.q || '').trim();
        if (!q) {
          res.json({ certificates: [] });
          return;
        }
        const role = req.user!.role;
        let scopedCerts: Certificate[] = [];
        if (role === 'corporate_client') {
          if (!req.user!.organizationId) {
            res.json({ certificates: [] });
            return;
          }
          scopedCerts = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
            filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
            strictTenantFilter: strictTenant,
          });
        } else if (role === 'candidate') {
          scopedCerts = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
            filters: [{ field: 'candidateUserId', op: 'EQUAL', value: req.user!.uid }],
            strictTenantFilter: strictTenant,
          });
        } else if (role === 'trainer') {
          const myBatches = await fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, {
            filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
            strictTenantFilter: strictTenant,
          });
          const myBatchIds = new Set(myBatches.map((b) => b.id));
          if (myBatchIds.size > 0) {
            const allCerts = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
              strictTenantFilter: strictTenant,
            });
            scopedCerts = allCerts.filter((c) => myBatchIds.has(c.batchId));
          }
        } else {
          scopedCerts = await fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
            strictTenantFilter: strictTenant,
          });
        }

        const qLower = q.toLowerCase();

        // Check if query is an Iqama number (only tenant staff roles may look up tenant identityHashes)
        let iqamaCandidateDocId: string | null = null;
        if (
          /^[0-9]{8,15}$/.test(q) &&
          (isTenantAdminOrOwnerRole(role) || role === 'certificate_officer')
        ) {
          const hashCandidates = [hmacTenantIdentityHash(tenantId, 'iqama', q)];
          if (!strictTenant && tenantId === DEFAULT_TENANT_ID) {
            hashCandidates.push(hmacIdentityHash('iqama', q));
          }
          for (const iqHash of hashCandidates) {
            const foundHash = await fsGetDoc<{ candidateDocId: string; tenantId?: string }>(
              'identityHashes',
              iqHash,
              req.idToken!
            ).catch(() => null);
            if (foundHash && assertRecordTenant(foundHash, tenantId, !strictTenant)) {
              iqamaCandidateDocId = foundHash.candidateDocId;
              break;
            }
          }
        }

        const matched = scopedCerts
          .filter(
            (c) =>
              c.certificateNumber.toLowerCase().includes(qLower) ||
              c.candidateId.toLowerCase().includes(qLower) ||
              c.snapshot.candidateNameEn.toLowerCase().includes(qLower) ||
              c.snapshot.candidateNameAr.toLowerCase().includes(qLower) ||
              (iqamaCandidateDocId && c.candidateDocId === iqamaCandidateDocId)
          )
          .map(({ tokenHash: _th, ...safeCert }) => safeCert);

        await fsCreateDoc(
          'verificationLogs',
          randomId('vlog'),
          {
            tenantId,
            mode: 'internal',
            query: iqamaCandidateDocId ? 'iqama_search' : q.slice(0, 200),
            resultStatus: matched.length > 0 ? 'found' : 'not_found',
            ...(matched[0]?.certificateNumber ? { certificateNumber: matched[0].certificateNumber } : {}),
            actorUid: req.user!.uid,
          },
          req.idToken!,
          ['createdAt']
        );

        res.json({ certificates: matched });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  return router;
}
