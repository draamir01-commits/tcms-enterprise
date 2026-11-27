import { Router } from 'express';
import multer from 'multer';
import {
  fsCommit,
  fsCreateDoc,
  fsGetDoc,
  fsQueryTenantDocs,
  fsUpdateDoc,
  nextSequenceCode,
  type CommitWriteOp,
} from './firestoreRest.ts';
import {
  decryptSensitive,
  encryptSensitive,
  hmacIdentityHash,
  hmacTenantIdentityHash,
  maskIdentity,
} from './crypto.ts';
import {
  exportTableToWorkbook,
  generateImportErrorWorkbook,
  generateImportTemplateWorkbook,
  parseSpreadsheetBuffer,
  type ErrorReportRowInput,
} from './excelService.ts';
import {
  createNotification,
  getRolePermissionMatrix,
  requireAuth,
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
import { createTrainingCardForEnrollment, getAppBaseUrl } from './routesOperations.ts';
import { hasPermission } from '../src/lib/permissions.ts';
import type {
  AssessmentRecord,
  AttendanceRecord,
  Batch,
  Candidate,
  Certificate,
  Course,
  Enrollment,
  ExcelExportDatasetKey,
  ExcelTemplateType,
  ImportDuplicateMatch,
  ImportJob,
  ImportJobStatus,
  ImportPreviewRow,
  ImportValidationSummary,
  Organization,
  RolePermissionMatrix,
  Trainer,
  UserProfile,
} from '../src/types/tcms.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const VALID_TEMPLATE_TYPES: ExcelTemplateType[] = [
  'candidates',
  'corporate_employees',
  'enrollment_requests',
  'enrollments',
  'attendance',
  'courses',
  'trainers',
];

function isValidIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());
}

function isValidPhone(val: string): boolean {
  const clean = val.trim();
  const digits = clean.replace(/\D/g, '');
  return /^[+\d\s\-()]{6,28}$/.test(clean) && digits.length >= 6 && digits.length <= 16;
}

function inDateRange(dateStr: string | undefined, from?: string, to?: string): boolean {
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function canUseImportType(
  user: UserProfile,
  importType: ExcelTemplateType,
  matrix: RolePermissionMatrix
): boolean {
  if (!VALID_TEMPLATE_TYPES.includes(importType)) return false;
  if (user.role === 'candidate') return false;
  if (isTenantOwnerRole(user.role)) return true;
  const isAdmin = isTenantAdminOrOwnerRole(user.role);
  switch (importType) {
    case 'candidates':
      return isAdmin && hasPermission(user, 'candidates', 'create', matrix);
    case 'corporate_employees':
      return (
        (isAdmin || user.role === 'corporate_client') &&
        hasPermission(user, 'candidates', 'create', matrix)
      );
    case 'enrollment_requests':
      if (user.role === 'corporate_client') {
        return Boolean(user.organizationId) && hasPermission(user, 'enrollments', 'create', matrix);
      }
      return isAdmin && hasPermission(user, 'enrollments', 'create', matrix);
    case 'enrollments':
      return isAdmin && hasPermission(user, 'enrollments', 'create', matrix);
    case 'attendance':
      return (
        (isAdmin || user.role === 'trainer') &&
        hasPermission(user, 'attendance', 'create', matrix)
      );
    case 'courses':
      return isAdmin && hasPermission(user, 'courses', 'create', matrix);
    case 'trainers':
      return isAdmin && hasPermission(user, 'trainers', 'create', matrix);
    default:
      return false;
  }
}

function mapRawRowToCanonical(
  raw: Record<string, string>,
  importType: ExcelTemplateType
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [k, rawVal] of Object.entries(raw)) {
    const v = String(rawVal ?? '').trim();
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      norm === 'fullnameen' ||
      norm.includes('fullnameenglish') ||
      (norm.includes('candidatename') && norm.includes('en'))
    ) {
      mapped.fullNameEn = v;
    } else if (
      norm === 'fullnamear' ||
      norm.includes('fullnamearabic') ||
      (norm.includes('candidatename') && norm.includes('ar'))
    ) {
      mapped.fullNameAr = v;
    } else if (norm === 'nameen' || norm.includes('nameenglish')) {
      if (importType === 'trainers') mapped.nameEn = v;
      else mapped.fullNameEn = v;
    } else if (norm === 'namear' || norm.includes('namearabic')) {
      if (importType === 'trainers') mapped.nameAr = v;
      else mapped.fullNameAr = v;
    } else if (norm.startsWith('gender')) mapped.gender = v.toLowerCase();
    else if (norm.includes('iqamaexpiry')) mapped.iqamaExpiryDate = v;
    else if (norm.includes('iqama')) mapped.iqamaNumber = v;
    else if (norm.includes('passportexpiry')) mapped.passportExpiryDate = v;
    else if (norm.includes('passport')) mapped.passportNumber = v;
    else if (norm.includes('nationality')) mapped.nationality = v;
    else if (norm.includes('dateofbirth') || norm === 'dob') mapped.dateOfBirth = v;
    else if (norm.includes('mobile') || norm.includes('phone')) mapped.mobile = v;
    else if (norm.includes('email')) mapped.email = v;
    else if (norm.includes('company')) mapped.companyName = v;
    else if (norm.includes('employeeid')) mapped.employeeId = v;
    else if (norm.includes('jobtitle')) mapped.jobTitle = v;
    else if (norm.includes('department')) mapped.department = v;
    else if (norm.includes('worklocation')) mapped.workLocation = v;
    else if (norm === 'address') mapped.address = v;
    else if (norm.includes('emergency')) mapped.emergencyContact = v;
    else if (norm.includes('coursecode')) mapped.courseCode = v.toUpperCase();
    else if (norm.includes('titleenglish') || norm === 'titleen') mapped.titleEn = v;
    else if (norm.includes('titlearabic') || norm === 'titlear') mapped.titleAr = v;
    else if (norm.includes('category')) mapped.category = v;
    else if (norm.includes('coursetype')) mapped.courseType = v.toLowerCase();
    else if (norm === 'duration') mapped.duration = v;
    else if (norm.includes('durationunit')) mapped.durationUnit = v.toLowerCase();
    else if (norm.includes('minattendance')) mapped.minAttendancePct = v;
    else if (norm.includes('minexam') || norm.includes('passingscore')) mapped.minExamScore = v;
    else if (norm.includes('fee') || norm.includes('coursefee')) mapped.fee = v;
    else if (norm.includes('validity')) mapped.validityMonths = v;
    else if (norm.includes('specialization')) mapped.specialization = v;
    else if (norm.includes('qualification')) mapped.qualifications = v;
    else if (norm.includes('certification')) mapped.certifications = v;
    else if (norm.includes('experience')) mapped.experienceYears = v;
    else if (norm.includes('employmentstatus')) mapped.employmentStatus = v.toLowerCase();
    else if (norm.includes('candidateid')) mapped.candidateId = v.toUpperCase();
    else if (norm.includes('enrollmentid') || norm.includes('enrollmentnumber')) mapped.enrollmentNumber = v.toUpperCase();
    else if (norm.includes('preferredbatch')) mapped.preferredBatchNumber = v.toUpperCase();
    else if (norm.includes('batchnumber') || norm === 'batchid' || norm === 'batch') mapped.batchNumber = v.toUpperCase();
    else if (norm.includes('attendancedate') || norm === 'date') mapped.date = v;
    else if (norm.includes('attendancestatus') || norm.startsWith('status')) {
      if (importType === 'attendance' || importType === 'enrollments') mapped.status = v.toLowerCase();
      else mapped[k] = v;
    } else if (norm.includes('submissionmode') || norm.includes('submissionstatus')) mapped.submissionStatus = v.toLowerCase();
    else if (norm.includes('correctionreason')) mapped.correctionReason = v;
    else if (norm.includes('requestnotes')) mapped.requestNotes = v;
    else if (norm.includes('remarks')) mapped.remarks = v;
    else if (norm === 'notes') mapped.notes = v;
    else if (v) mapped[k] = v;
  }
  return mapped;
}

interface ValidationContext {
  coursesByCode: Map<string, Course>;
  batchesByNumber: Map<string, Batch>;
  trainersByEmail: Map<string, Trainer>;
  candidatesList: Array<Candidate & { iqamaHash?: string; passportHash?: string }>;
  candidatesById: Map<string, Candidate>;
  enrollmentsList: Enrollment[];
  attendanceList: AttendanceRecord[];
}

async function loadValidationContext(
  importType: ExcelTemplateType,
  actor: UserProfile,
  idToken: string,
  tenantId: string,
  strictTenant: boolean
): Promise<ValidationContext> {
  const needCourses = ['enrollment_requests', 'enrollments', 'courses', 'attendance'].includes(importType);
  const needBatches = ['enrollment_requests', 'enrollments', 'attendance'].includes(importType);
  const needTrainers = importType === 'trainers';
  const needCandidates = ['enrollment_requests', 'enrollments', 'attendance'].includes(importType);
  const needEnrollments = ['enrollments', 'attendance'].includes(importType);
  const needAttendance = importType === 'attendance';

  const [courses, batches, trainers, candidates, enrollments, attendance] = await Promise.all([
    needCourses
      ? fsQueryTenantDocs<Course>('courses', tenantId, idToken, { strictTenantFilter: strictTenant })
      : Promise.resolve([]),
    needBatches
      ? fsQueryTenantDocs<Batch>('batches', tenantId, idToken, { strictTenantFilter: strictTenant })
      : Promise.resolve([]),
    needTrainers
      ? fsQueryTenantDocs<Trainer>('trainers', tenantId, idToken, { strictTenantFilter: strictTenant })
      : Promise.resolve([]),
    needCandidates
      ? actor.role === 'corporate_client' && actor.organizationId
        ? fsQueryTenantDocs<Candidate>('candidates', tenantId, idToken, {
            filters: [{ field: 'organizationId', op: 'EQUAL', value: actor.organizationId }],
            strictTenantFilter: strictTenant,
          })
        : fsQueryTenantDocs<Candidate>('candidates', tenantId, idToken, {
            strictTenantFilter: strictTenant,
          })
      : Promise.resolve([]),
    needEnrollments
      ? actor.role === 'trainer'
        ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
            filters: [{ field: 'trainerUserId', op: 'EQUAL', value: actor.uid }],
            strictTenantFilter: strictTenant,
          })
        : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, idToken, {
            strictTenantFilter: strictTenant,
          })
      : Promise.resolve([]),
    needAttendance
      ? actor.role === 'trainer'
        ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, idToken, {
            filters: [{ field: 'trainerUserId', op: 'EQUAL', value: actor.uid }],
            strictTenantFilter: strictTenant,
          })
        : fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, idToken, {
            strictTenantFilter: strictTenant,
          })
      : Promise.resolve([]),
  ]);

  const coursesByCode = new Map<string, Course>();
  for (const c of courses) coursesByCode.set(c.courseCode.toUpperCase(), c);

  const batchesByNumber = new Map<string, Batch>();
  for (const b of batches) batchesByNumber.set(b.batchNumber.toUpperCase(), b);

  const trainersByEmail = new Map<string, Trainer>();
  for (const t of trainers) trainersByEmail.set(t.email.trim().toLowerCase(), t);

  const candidatesById = new Map<string, Candidate>();
  for (const c of candidates) candidatesById.set(c.candidateId.toUpperCase(), c);

  return {
    coursesByCode,
    batchesByNumber,
    trainersByEmail,
    candidatesList: candidates,
    candidatesById,
    enrollmentsList: enrollments,
    attendanceList: attendance,
  };
}

async function resolveCandidateDuplicate(params: {
  idType: 'iqama' | 'passport';
  hash: string;
  legacyHash?: string;
  tenantId: string;
  strictTenant: boolean;
  actor: UserProfile;
  idToken: string;
}): Promise<ImportDuplicateMatch | null> {
  const { idType, hash, legacyHash, tenantId, strictTenant, actor, idToken } = params;
  let entry = await fsGetDoc<{ candidateDocId: string; candidateId: string; tenantId?: string }>(
    'identityHashes',
    hash,
    idToken
  ).catch(() => null);
  if (!entry && legacyHash && !strictTenant && tenantId === DEFAULT_TENANT_ID) {
    entry = await fsGetDoc<{ candidateDocId: string; candidateId: string; tenantId?: string }>(
      'identityHashes',
      legacyHash,
      idToken
    ).catch(() => null);
  }
  if (!entry || !assertRecordTenant(entry, tenantId, !strictTenant)) return null;

  const matchedCand = await fsGetDoc<Candidate>(
    'candidates',
    entry.candidateDocId,
    idToken
  ).catch(() => null);
  if (!matchedCand || !assertRecordTenant(matchedCand, tenantId, !strictTenant)) return null;

  if (actor.role === 'corporate_client') {
    const sameOrg = Boolean(
      matchedCand &&
        actor.organizationId &&
        matchedCand.organizationId === actor.organizationId
    );
    return {
      idType,
      candidateDocId: sameOrg ? entry.candidateDocId : undefined,
      candidateId: sameOrg ? entry.candidateId : undefined,
      fullNameEn: sameOrg ? matchedCand?.fullNameEn : undefined,
      fullNameAr: sameOrg ? matchedCand?.fullNameAr : undefined,
      companyName: sameOrg ? matchedCand?.companyName : undefined,
      organizationId: sameOrg ? matchedCand?.organizationId : undefined,
      iqamaMasked: sameOrg ? matchedCand?.iqamaMasked : undefined,
      passportMasked: sameOrg ? matchedCand?.passportMasked : undefined,
      sameOrganization: sameOrg,
      canUpdate: sameOrg,
      existingRecordId: sameOrg ? entry.candidateId : undefined,
      existingDetails: sameOrg
        ? `Matches ${entry.candidateId} (${matchedCand?.fullNameEn || 'Employee'})`
        : 'Identity number is already registered under another organization (protected)',
    };
  }

  const canUpdate = isTenantAdminOrOwnerRole(actor.role);
  return {
    idType,
    candidateDocId: entry.candidateDocId,
    candidateId: entry.candidateId,
    fullNameEn: matchedCand?.fullNameEn,
    fullNameAr: matchedCand?.fullNameAr,
    companyName: matchedCand?.companyName,
    organizationId: matchedCand?.organizationId,
    iqamaMasked: matchedCand?.iqamaMasked,
    passportMasked: matchedCand?.passportMasked,
    sameOrganization: true,
    canUpdate,
    existingRecordId: entry.candidateId,
    existingDetails: `Matches ${entry.candidateId} (${matchedCand?.fullNameEn || 'Candidate'})`,
  };
}

function summarizeValidation(rows: ImportPreviewRow[]): ImportValidationSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === 'valid' && !r.skip).length,
    invalidRows: rows.filter((r) => r.status === 'invalid').length,
    duplicateRows: rows.filter((r) => r.status === 'duplicate').length,
    missingRequiredRows: rows.filter((r) => r.missingFields.length > 0).length,
    formatErrorRows: rows.filter((r) => r.formatErrors.length > 0).length,
    skippedRows: rows.filter((r) => Boolean(r.skip)).length,
  };
}

async function validateAndAnalyzeRows(params: {
  importType: ExcelTemplateType;
  inputRows: Array<{
    rowNumber: number;
    mapped: Record<string, string>;
    skip?: boolean;
    duplicateAction?: 'skip' | 'update';
    explicitUpdateConfirmed?: boolean;
  }>;
  targetOrgId?: string;
  tenantId: string;
  strictTenant: boolean;
  actor: UserProfile;
  idToken: string;
}): Promise<{ rows: ImportPreviewRow[]; stats: ImportValidationSummary }> {
  const { importType, inputRows, targetOrgId, tenantId, strictTenant, actor, idToken } = params;
  const ctx = await loadValidationContext(importType, actor, idToken, tenantId, strictTenant);

  const seenIqama = new Map<string, number>();
  const seenPassport = new Map<string, number>();
  const seenCourseCodes = new Map<string, number>();
  const seenTrainerEmails = new Map<string, number>();
  const seenBatchEnrollmentPairs = new Map<string, number>();
  const seenAttendanceKeys = new Map<string, number>();

  const previewRows: ImportPreviewRow[] = [];

  for (const input of inputRows) {
    const m = { ...input.mapped };
    const missingFields: string[] = [];
    const formatErrors: string[] = [];
    const duplicateDetails: ImportDuplicateMatch[] = [];
    const errors: string[] = [];
    let status: 'valid' | 'duplicate' | 'invalid' = 'valid';

    if (importType === 'candidates' || importType === 'corporate_employees') {
      if (!m.fullNameEn || m.fullNameEn.trim().length < 2) {
        missingFields.push('Full Name English');
      }
      if (!m.nationality) missingFields.push('Nationality');
      if (!m.mobile) missingFields.push('Mobile');
      if (!m.iqamaNumber && !m.passportNumber) {
        missingFields.push('Iqama Number or Passport Number');
      }

      if (m.mobile && !isValidPhone(m.mobile)) {
        formatErrors.push('Invalid Mobile number format');
      }
      if (m.email && !isValidEmail(m.email)) {
        formatErrors.push('Invalid Email format');
      }
      if (m.gender && !['male', 'female'].includes(m.gender.toLowerCase())) {
        formatErrors.push('Gender must be "male" or "female"');
      }
      if (m.dateOfBirth && !isValidIsoDate(m.dateOfBirth)) {
        formatErrors.push('Date of Birth must be YYYY-MM-DD');
      }
      if (m.iqamaExpiryDate && !isValidIsoDate(m.iqamaExpiryDate)) {
        formatErrors.push('Iqama Expiry must be YYYY-MM-DD');
      }
      if (m.passportExpiryDate && !isValidIsoDate(m.passportExpiryDate)) {
        formatErrors.push('Passport Expiry must be YYYY-MM-DD');
      }
      if (m.iqamaNumber && m.iqamaNumber.trim().length < 6) {
        formatErrors.push('Iqama Number must be at least 6 characters');
      }
      if (m.passportNumber && m.passportNumber.trim().length < 5) {
        formatErrors.push('Passport Number must be at least 5 characters');
      }

      if (m.iqamaNumber) {
        const iqHash = hmacTenantIdentityHash(tenantId, 'iqama', m.iqamaNumber);
        const legacyIqHash = !strictTenant && tenantId === DEFAULT_TENANT_ID ? hmacIdentityHash('iqama', m.iqamaNumber) : undefined;
        const prevRow = seenIqama.get(iqHash);
        if (prevRow !== undefined) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate Iqama in uploaded file (first seen at Row ${prevRow})`,
          });
        } else {
          seenIqama.set(iqHash, input.rowNumber);
          const dbMatch = await resolveCandidateDuplicate({
            idType: 'iqama',
            hash: iqHash,
            legacyHash: legacyIqHash,
            tenantId,
            strictTenant,
            actor,
            idToken,
          });
          if (dbMatch) {
            status = 'duplicate';
            duplicateDetails.push(dbMatch);
          }
        }
      }

      if (m.passportNumber) {
        const ppHash = hmacTenantIdentityHash(tenantId, 'passport', m.passportNumber);
        const legacyPpHash = !strictTenant && tenantId === DEFAULT_TENANT_ID ? hmacIdentityHash('passport', m.passportNumber) : undefined;
        const prevRow = seenPassport.get(ppHash);
        if (prevRow !== undefined) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate Passport in uploaded file (first seen at Row ${prevRow})`,
          });
        } else {
          seenPassport.set(ppHash, input.rowNumber);
          const dbMatch = await resolveCandidateDuplicate({
            idType: 'passport',
            hash: ppHash,
            legacyHash: legacyPpHash,
            tenantId,
            strictTenant,
            actor,
            idToken,
          });
          if (dbMatch) {
            // Avoid duplicate entry if same candidateDocId already added by iqama check
            const alreadyMatched = dbMatch.candidateDocId && duplicateDetails.some(
              (d) => d.candidateDocId === dbMatch.candidateDocId
            );
            status = 'duplicate';
            if (!alreadyMatched) {
              duplicateDetails.push(dbMatch);
            }
          }
        }
      }
    } else if (importType === 'enrollment_requests') {
      if (!m.candidateId && !m.iqamaNumber && !m.passportNumber) {
        missingFields.push('Candidate ID (or Iqama/Passport)');
      }
      if (!m.courseCode) missingFields.push('Course Code');

      let resolvedCand: Candidate | undefined;
      if (m.candidateId) {
        resolvedCand = ctx.candidatesById.get(m.candidateId.toUpperCase());
      } else if (m.iqamaNumber) {
        const iqHash = hmacTenantIdentityHash(tenantId, 'iqama', m.iqamaNumber);
        let hashDoc = await fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', iqHash, idToken).catch(() => null);
        if (!hashDoc && !strictTenant && tenantId === DEFAULT_TENANT_ID) {
          hashDoc = await fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', hmacIdentityHash('iqama', m.iqamaNumber), idToken).catch(() => null);
        }
        if (hashDoc && assertRecordTenant(hashDoc, tenantId, !strictTenant)) {
          resolvedCand = ctx.candidatesList.find((c) => c.id === hashDoc!.candidateDocId);
        }
      } else if (m.passportNumber) {
        const ppHash = hmacTenantIdentityHash(tenantId, 'passport', m.passportNumber);
        let hashDoc = await fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', ppHash, idToken).catch(() => null);
        if (!hashDoc && !strictTenant && tenantId === DEFAULT_TENANT_ID) {
          hashDoc = await fsGetDoc<{ candidateDocId: string; tenantId?: string }>('identityHashes', hmacIdentityHash('passport', m.passportNumber), idToken).catch(() => null);
        }
        if (hashDoc && assertRecordTenant(hashDoc, tenantId, !strictTenant)) {
          resolvedCand = ctx.candidatesList.find((c) => c.id === hashDoc!.candidateDocId);
        }
      }

      if ((m.candidateId || m.iqamaNumber || m.passportNumber) && !resolvedCand) {
        formatErrors.push('Candidate record not found in your authorized scope');
      } else if (resolvedCand) {
        m._resolvedCandidateDocId = resolvedCand.id;
        m.candidateId = resolvedCand.candidateId;
        const resolvedOrgId =
          actor.role === 'corporate_client'
            ? actor.organizationId || ''
            : resolvedCand.organizationId || targetOrgId || '';
        if (!resolvedOrgId) {
          formatErrors.push('Corporate enrollment requests require an organization-linked candidate or selected organization');
        } else {
          m._resolvedOrganizationId = resolvedOrgId;
        }
      }

      const course = m.courseCode ? ctx.coursesByCode.get(m.courseCode.toUpperCase()) : undefined;
      if (m.courseCode && !course) {
        formatErrors.push(`Course code "${m.courseCode}" not found`);
      } else if (course && course.status !== 'active') {
        formatErrors.push(`Course "${course.courseCode}" is ${course.status}`);
      } else if (course) {
        m._resolvedCourseId = course.id;
      }

      if (m.preferredBatchNumber) {
        const batch = ctx.batchesByNumber.get(m.preferredBatchNumber.toUpperCase());
        if (!batch) {
          formatErrors.push(`Preferred batch "${m.preferredBatchNumber}" not found`);
        } else if (course && batch.courseId !== course.id) {
          formatErrors.push(`Preferred batch "${batch.batchNumber}" belongs to another course`);
        } else if (batch.status === 'cancelled') {
          formatErrors.push(`Preferred batch "${batch.batchNumber}" is cancelled`);
        } else {
          m._resolvedPreferredBatchId = batch.id;
        }
      }
    } else if (importType === 'enrollments') {
      if (!m.candidateId) missingFields.push('Candidate ID');
      if (!m.courseCode) missingFields.push('Course Code');
      if (!m.batchNumber) missingFields.push('Batch Number');
      if (m.status && !['pending', 'confirmed'].includes(m.status.toLowerCase())) {
        formatErrors.push('Status must be "pending" or "confirmed"');
      }

      const cand = m.candidateId ? ctx.candidatesById.get(m.candidateId.toUpperCase()) : undefined;
      if (m.candidateId && !cand) {
        formatErrors.push(`Candidate "${m.candidateId}" not found`);
      }
      const course = m.courseCode ? ctx.coursesByCode.get(m.courseCode.toUpperCase()) : undefined;
      if (m.courseCode && !course) {
        formatErrors.push(`Course "${m.courseCode}" not found`);
      }
      const batch = m.batchNumber ? ctx.batchesByNumber.get(m.batchNumber.toUpperCase()) : undefined;
      if (m.batchNumber && !batch) {
        formatErrors.push(`Batch "${m.batchNumber}" not found`);
      } else if (batch) {
        if (course && batch.courseId !== course.id) {
          formatErrors.push(`Batch "${batch.batchNumber}" does not match course "${course.courseCode}"`);
        }
        if (batch.status === 'cancelled' || batch.status === 'completed') {
          formatErrors.push(`Batch "${batch.batchNumber}" is ${batch.status}`);
        }
        if (batch.enrollmentClosed) {
          formatErrors.push(`Enrollment is closed for batch "${batch.batchNumber}"`);
        }
      }

      if (cand && batch) {
        m._resolvedCandidateDocId = cand.id;
        m._resolvedBatchId = batch.id;
        m._resolvedCourseId = course?.id || batch.courseId;
        const pairKey = `${cand.id}__${batch.id}`;
        if (seenBatchEnrollmentPairs.has(pairKey)) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate candidate/batch pair in uploaded file (Row ${seenBatchEnrollmentPairs.get(pairKey)})`,
          });
        } else {
          seenBatchEnrollmentPairs.set(pairKey, input.rowNumber);
          const existingEnr = ctx.enrollmentsList.find(
            (e) =>
              e.candidateDocId === cand.id &&
              e.batchId === batch.id &&
              !['cancelled', 'withdrawn', 'failed'].includes(e.status)
          );
          if (existingEnr) {
            status = 'duplicate';
            duplicateDetails.push({
              idType: 'enrollment_existing',
              sameOrganization: true,
              canUpdate: false,
              existingRecordId: existingEnr.enrollmentNumber,
              existingDetails: `Already enrolled in batch (${existingEnr.enrollmentNumber})`,
            });
          }
        }
      }
    } else if (importType === 'attendance') {
      if (!m.batchNumber) missingFields.push('Batch Number');
      if (!m.enrollmentNumber && !m.candidateId) missingFields.push('Enrollment ID or Candidate ID');
      if (!m.date) missingFields.push('Attendance Date');
      if (!m.status) missingFields.push('Attendance Status');

      if (m.date && !isValidIsoDate(m.date)) {
        formatErrors.push('Attendance Date must be YYYY-MM-DD');
      }
      if (m.status && !['present', 'absent', 'late', 'excused'].includes(m.status.toLowerCase())) {
        formatErrors.push('Attendance Status must be present, absent, late, or excused');
      }
      if (m.submissionStatus && !['draft', 'submitted'].includes(m.submissionStatus.toLowerCase())) {
        formatErrors.push('Submission Mode must be draft or submitted');
      }

      const batch = m.batchNumber ? ctx.batchesByNumber.get(m.batchNumber.toUpperCase()) : undefined;
      if (m.batchNumber && !batch) {
        formatErrors.push(`Batch "${m.batchNumber}" not found`);
      } else if (batch && actor.role === 'trainer') {
        const isAssigned =
          batch.trainerUserId === actor.uid ||
          (actor.trainerId && batch.trainerId === actor.trainerId);
        if (!isAssigned) {
          formatErrors.push(`Trainer is not assigned to batch "${batch.batchNumber}"`);
        }
      }

      let matchedEnr: Enrollment | undefined;
      if (batch) {
        if (m.enrollmentNumber) {
          matchedEnr = ctx.enrollmentsList.find(
            (e) => e.batchId === batch.id && e.enrollmentNumber.toUpperCase() === m.enrollmentNumber.toUpperCase()
          );
        } else if (m.candidateId) {
          matchedEnr = ctx.enrollmentsList.find(
            (e) => e.batchId === batch.id && e.candidateId.toUpperCase() === m.candidateId.toUpperCase()
          );
        }
        if ((m.enrollmentNumber || m.candidateId) && !matchedEnr) {
          formatErrors.push(`Active enrollment not found in batch "${batch.batchNumber}"`);
        } else if (matchedEnr && !['confirmed', 'in_progress', 'completed'].includes(matchedEnr.status)) {
          formatErrors.push(`Enrollment "${matchedEnr.enrollmentNumber}" is ${matchedEnr.status} and cannot mark attendance`);
        }
      }

      if (batch && matchedEnr && m.date && isValidIsoDate(m.date)) {
        m._resolvedBatchId = batch.id;
        m._resolvedEnrollmentId = matchedEnr.id;
        const attKey = `${batch.id}_${matchedEnr.id}_${m.date}`;
        if (seenAttendanceKeys.has(attKey)) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate attendance row in file (Row ${seenAttendanceKeys.get(attKey)})`,
          });
        } else {
          seenAttendanceKeys.set(attKey, input.rowNumber);
          const dateLocked = ctx.attendanceList.some(
            (a) => a.batchId === batch.id && a.date === m.date && a.submissionStatus === 'submitted'
          );
          const existingRec = ctx.attendanceList.find(
            (a) => a.batchId === batch.id && a.enrollmentId === matchedEnr!.id && a.date === m.date
          );
          if (dateLocked) {
            if (actor.role === 'trainer') {
              formatErrors.push(`Attendance for ${batch.batchNumber} on ${m.date} is submitted and locked`);
            } else if (!m.correctionReason) {
              status = 'duplicate';
              duplicateDetails.push({
                idType: 'attendance_locked',
                sameOrganization: true,
                canUpdate: true,
                existingRecordId: existingRec?.id || attKey,
                existingDetails: `Locked attendance on ${m.date}; supply Correction Reason and confirm update`,
              });
            }
          } else if (existingRec) {
            status = 'duplicate';
            duplicateDetails.push({
              idType: 'attendance_existing',
              sameOrganization: true,
              canUpdate: true,
              existingRecordId: existingRec.id,
              existingDetails: `Draft attendance already exists for ${matchedEnr.enrollmentNumber} on ${m.date} (${existingRec.status})`,
            });
          }
        }
      }
    } else if (importType === 'courses') {
      if (!m.courseCode) missingFields.push('Course Code');
      if (!m.titleEn) missingFields.push('Title English');
      if (!m.category) missingFields.push('Category');
      if (!m.duration) missingFields.push('Duration');
      if (!m.durationUnit) missingFields.push('Duration Unit');

      if (m.duration && (!(Number(m.duration) > 0))) {
        formatErrors.push('Duration must be a positive number');
      }
      if (m.durationUnit && !['hours', 'days', 'weeks'].includes(m.durationUnit)) {
        formatErrors.push('Duration Unit must be hours, days, or weeks');
      }
      if (m.minAttendancePct && (Number.isNaN(Number(m.minAttendancePct)) || Number(m.minAttendancePct) < 0 || Number(m.minAttendancePct) > 100)) {
        formatErrors.push('Min Attendance % must be 0–100');
      }
      if (m.minExamScore && (Number.isNaN(Number(m.minExamScore)) || Number(m.minExamScore) < 0 || Number(m.minExamScore) > 100)) {
        formatErrors.push('Min Exam Score must be 0–100');
      }
      if (m.courseType && !['theoretical', 'practical', 'blended', 'certification', 'refresher'].includes(m.courseType)) {
        formatErrors.push('Invalid Course Type');
      }
      if (m.courseCode) {
        const code = m.courseCode.toUpperCase();
        if (seenCourseCodes.has(code)) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate Course Code in file (Row ${seenCourseCodes.get(code)})`,
          });
        } else {
          seenCourseCodes.set(code, input.rowNumber);
          const existing = ctx.coursesByCode.get(code);
          if (existing) {
            status = 'duplicate';
            duplicateDetails.push({
              idType: 'course_code',
              sameOrganization: true,
              canUpdate: false,
              existingRecordId: existing.courseId,
              existingDetails: `Course code ${code} already exists (${existing.titleEn})`,
            });
          }
        }
      }
    } else if (importType === 'trainers') {
      const nameEn = m.nameEn || m.fullNameEn;
      if (!nameEn) missingFields.push('Name English');
      if (!m.mobile) missingFields.push('Mobile');
      if (!m.email) missingFields.push('Email');
      if (!m.specialization) missingFields.push('Specialization');

      if (m.mobile && !isValidPhone(m.mobile)) formatErrors.push('Invalid Mobile number format');
      if (m.email && !isValidEmail(m.email)) formatErrors.push('Invalid Email format');
      if (m.experienceYears && (Number.isNaN(Number(m.experienceYears)) || Number(m.experienceYears) < 0)) {
        formatErrors.push('Experience Years must be a non-negative number');
      }
      if (m.employmentStatus && !['full_time', 'part_time', 'contract', 'freelance'].includes(m.employmentStatus)) {
        formatErrors.push('Employment Status must be full_time, part_time, contract, or freelance');
      }

      if (m.email) {
        const emailLower = m.email.trim().toLowerCase();
        if (seenTrainerEmails.has(emailLower)) {
          status = 'duplicate';
          duplicateDetails.push({
            idType: 'in_file',
            sameOrganization: true,
            canUpdate: false,
            existingDetails: `Duplicate Email in file (Row ${seenTrainerEmails.get(emailLower)})`,
          });
        } else {
          seenTrainerEmails.set(emailLower, input.rowNumber);
          const existing = ctx.trainersByEmail.get(emailLower);
          if (existing) {
            status = 'duplicate';
            duplicateDetails.push({
              idType: 'trainer_email',
              sameOrganization: true,
              canUpdate: false,
              existingRecordId: existing.trainerId,
              existingDetails: `Trainer email already exists (${existing.nameEn})`,
            });
          }
        }
      }
    }

    for (const f of missingFields) errors.push(`Missing required: ${f}`);
    for (const f of formatErrors) errors.push(f);
    for (const d of duplicateDetails) {
      if (d.existingDetails) errors.push(d.existingDetails);
    }

    if (missingFields.length > 0 || formatErrors.length > 0) {
      status = 'invalid';
    } else if (duplicateDetails.length > 0) {
      status = 'duplicate';
    }

    const canUpdateAny = status === 'duplicate' && duplicateDetails.some((d) => d.canUpdate);
    const keepUpdate =
      canUpdateAny &&
      input.duplicateAction === 'update' &&
      Boolean(input.explicitUpdateConfirmed);

    previewRows.push({
      rowNumber: input.rowNumber,
      status,
      missingFields,
      formatErrors,
      duplicateDetails,
      errors,
      mapped: m,
      skip: Boolean(input.skip),
      duplicateAction: keepUpdate ? 'update' : 'skip',
      explicitUpdateConfirmed: keepUpdate,
    });
  }

  return { rows: previewRows, stats: summarizeValidation(previewRows) };
}

export function createExcelRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // 1. Download Multi-Sheet Excel Import Template
  // ---------------------------------------------------------------------------
  router.get('/excel/template/:type', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const type = String(req.params.type) as ExcelTemplateType;
      const matrix = await getRolePermissionMatrix(req.idToken!, req.tenantId!);
      if (!canUseImportType(req.user!, type, matrix)) {
        res.status(403).json({ error: `Forbidden: not authorized to download ${type} import template` });
        return;
      }
      const buf = await generateImportTemplateWorkbook(type);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="tcms_${type}_template.xlsx"`);
      res.send(buf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Parse Uploaded XLSX / XLS / CSV & Return Validation Preview
  // ---------------------------------------------------------------------------
  router.post(
    '/excel/parse',
    requireAuth,
    upload.single('file'),
    async (req: AuthedRequest, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Spreadsheet file is required' });
          return;
        }
        const tenantId = req.tenantId!;
        const strictTenant = Boolean(req.strictTenantQuery);
        const importType = String(req.body.importType || 'candidates') as ExcelTemplateType;
        const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
        if (!canUseImportType(req.user!, importType, matrix)) {
          res.status(403).json({ error: `Forbidden: not authorized to import ${importType}` });
          return;
        }
        const targetOrgId =
          req.user!.role === 'corporate_client'
            ? req.user!.organizationId || ''
            : String(req.body.organizationId || '').trim();

        const isCsv =
          req.file.originalname.toLowerCase().endsWith('.csv') ||
          req.file.mimetype === 'text/csv';
        const parsed = await parseSpreadsheetBuffer(req.file.buffer, isCsv);

        const mappedInput = parsed.rows.map((raw, idx) => ({
          rowNumber: idx + 2,
          mapped: mapRawRowToCanonical(raw, importType),
        }));

        const { rows, stats } = await validateAndAnalyzeRows({
          importType,
          inputRows: mappedInput,
          targetOrgId,
          tenantId,
          strictTenant,
          actor: req.user!,
          idToken: req.idToken!,
        });

        res.json({
          fileName: req.file.originalname,
          importType,
          headers: parsed.headers,
          stats,
          rows,
        });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Re-validate Inline-Edited Rows Before Commit
  // ---------------------------------------------------------------------------
  router.post('/excel/revalidate', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const importType = String(req.body.importType || 'candidates') as ExcelTemplateType;
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!canUseImportType(req.user!, importType, matrix)) {
        res.status(403).json({ error: `Forbidden: not authorized to validate ${importType}` });
        return;
      }
      const targetOrgId =
        req.user!.role === 'corporate_client'
          ? req.user!.organizationId || ''
          : String(req.body.organizationId || '').trim();
      const rawRows = Array.isArray(req.body.rows) ? req.body.rows : [];
      const inputRows = rawRows.map((r: Record<string, unknown>, idx: number) => ({
        rowNumber: Number(r.rowNumber || idx + 2),
        mapped: ((r.mapped as Record<string, string>) || {}),
        skip: Boolean(r.skip),
        duplicateAction: r.duplicateAction === 'update' ? ('update' as const) : ('skip' as const),
        explicitUpdateConfirmed: Boolean(r.explicitUpdateConfirmed),
      }));

      const { rows, stats } = await validateAndAnalyzeRows({
        importType,
        inputRows,
        targetOrgId,
        tenantId,
        strictTenant,
        actor: req.user!,
        idToken: req.idToken!,
      });

      res.json({ importType, stats, rows });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Commit Validated Rows (No Silent Discard, Explicit Update Confirmation Only)
  // ---------------------------------------------------------------------------
  router.post('/excel/commit', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const importType = String(req.body.importType || 'candidates') as ExcelTemplateType;
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!canUseImportType(req.user!, importType, matrix)) {
        res.status(403).json({ error: `Forbidden: not authorized to commit ${importType}` });
        return;
      }

      const fileName = String(req.body.fileName || 'upload.xlsx').slice(0, 255);
      const skipInvalid = req.body.skipInvalid !== false;
      const orgId =
        req.user!.role === 'corporate_client'
          ? req.user!.organizationId || ''
          : String(req.body.organizationId || '').trim();

      const submittedRows = Array.isArray(req.body.rows) ? req.body.rows : [];
      const inputRows = submittedRows.map((r: Record<string, unknown>, idx: number) => ({
        rowNumber: Number(r.rowNumber || idx + 2),
        mapped: ((r.mapped as Record<string, string>) || {}),
        skip: Boolean(r.skip),
        duplicateAction: r.duplicateAction === 'update' ? ('update' as const) : ('skip' as const),
        explicitUpdateConfirmed: Boolean(r.explicitUpdateConfirmed),
      }));

      const { rows } = await validateAndAnalyzeRows({
        importType,
        inputRows,
        targetOrgId: orgId,
        tenantId,
        strictTenant,
        actor: req.user!,
        idToken: req.idToken!,
      });

      let orgRecord: Organization | null = null;
      if (orgId) {
        const fetchedOrg = await fsGetDoc<Organization>('organizations', orgId, req.idToken!).catch(() => null);
        if (fetchedOrg && assertRecordTenant(fetchedOrg, tenantId, !strictTenant)) {
          orgRecord = fetchedOrg;
        } else if (fetchedOrg) {
          res.status(403).json({ error: 'Forbidden: target organization belongs to another tenant', code: 'TENANT_MISMATCH' });
          return;
        }
      }

      let importedCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;
      let invalidCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const failedRows: ErrorReportRowInput[] = [];

      // Track enrollment requests grouped by (organizationId, courseId, preferredBatchId)
      const requestGroups = new Map<
        string,
        {
          organizationId: string;
          courseId: string;
          preferredBatchId?: string;
          candidateDocIds: string[];
          notes: string[];
          rowNumbers: number[];
        }
      >();

      // Enforce candidate quota for bulk candidate/employee imports
      if (importType === 'candidates' || importType === 'corporate_employees') {
        const newCandidateCount = rows.filter((r) => !r.skip && r.status === 'valid').length;
        if (newCandidateCount > 0) {
          await assertTenantPlanLimit({
            tenantId,
            tenant: req.tenant,
            idToken: req.idToken!,
            strictTenantQuery: strictTenant,
            metric: 'maxCandidates',
            incrementBy: newCandidateCount,
          });
        }
      }

      // Track batch capacity increments for enrollments import
      const batchCache = new Map<string, Batch>();

      for (const row of rows) {
        if (row.skip) {
          skippedCount += 1;
          continue;
        }

        if (row.status === 'invalid') {
          invalidCount += 1;
          failedRows.push({
            rowNumber: row.rowNumber,
            status: 'invalid',
            missingFields: row.missingFields,
            formatErrors: row.formatErrors,
            duplicateDetails: row.duplicateDetails,
            errors: row.errors,
            data: row.mapped,
          });
          continue;
        }

        if (row.status === 'duplicate') {
          const primaryMatch = row.duplicateDetails[0];
          const canAuthorizedUpdate =
            row.duplicateAction === 'update' &&
            row.explicitUpdateConfirmed === true &&
            Boolean(primaryMatch?.canUpdate) &&
            Boolean(primaryMatch?.candidateDocId || primaryMatch?.existingRecordId);

          if (!canAuthorizedUpdate) {
            duplicateCount += 1;
            if (!skipInvalid) {
              failedRows.push({
                rowNumber: row.rowNumber,
                status: 'duplicate',
                duplicateDetails: row.duplicateDetails,
                errors: row.errors.length > 0 ? row.errors : ['Duplicate record skipped (no update confirmed)'],
                data: row.mapped,
              });
            } else {
              failedRows.push({
                rowNumber: row.rowNumber,
                status: 'duplicate',
                duplicateDetails: row.duplicateDetails,
                errors: row.errors.length > 0 ? row.errors : ['Duplicate record not imported'],
                data: row.mapped,
              });
            }
            continue;
          }

          // Explicit authorized duplicate update
          try {
            if (importType === 'candidates' || importType === 'corporate_employees') {
              const targetDocId = primaryMatch!.candidateDocId!;
              const existing = await fsGetDoc<Candidate>('candidates', targetDocId, req.idToken!);
              if (!existing || !assertRecordTenant(existing, tenantId, !strictTenant)) {
                throw new Error('Existing candidate document not found in tenant workspace for update');
              }
              if (
                req.user!.role === 'corporate_client' &&
                existing.organizationId !== req.user!.organizationId
              ) {
                throw new Error('Forbidden: cross-organization candidate overwrite blocked');
              }
              const m = row.mapped;
              const updates: Record<string, unknown> = {};
              const updateFields: string[] = [];
              const addField = (k: string, val: unknown) => {
                if (val !== undefined && val !== '') {
                  updates[k] = val;
                  updateFields.push(k);
                }
              };
              addField('fullNameEn', m.fullNameEn?.slice(0, 200));
              addField('fullNameAr', (m.fullNameAr || m.fullNameEn)?.slice(0, 200));
              if (m.gender === 'male' || m.gender === 'female') addField('gender', m.gender);
              addField('nationality', m.nationality?.slice(0, 100));
              addField('mobile', m.mobile?.slice(0, 32));
              addField('dateOfBirth', m.dateOfBirth?.slice(0, 32));
              addField('email', m.email?.slice(0, 200));
              addField('employeeId', m.employeeId?.slice(0, 64));
              addField('jobTitle', m.jobTitle?.slice(0, 160));
              addField('department', m.department?.slice(0, 160));
              addField('workLocation', m.workLocation?.slice(0, 200));
              addField('address', m.address?.slice(0, 400));
              addField('emergencyContact', m.emergencyContact?.slice(0, 200));
              addField('iqamaExpiryDate', m.iqamaExpiryDate?.slice(0, 32));
              addField('passportExpiryDate', m.passportExpiryDate?.slice(0, 32));
              if (req.user!.role !== 'corporate_client') {
                if (orgId) addField('organizationId', orgId);
                if (m.companyName || orgRecord?.nameEn) {
                  addField('companyName', (m.companyName || orgRecord?.nameEn || '').slice(0, 200));
                }
              }

              if (updateFields.length > 0) {
                await fsUpdateDoc('candidates', targetDocId, updates, req.idToken!, ['updatedAt']);
                await writeAuditLog(
                  req.user!,
                  'EXCEL_CANDIDATE_UPDATE',
                  'candidates',
                  targetDocId,
                  `Explicitly updated ${existing.candidateId} via Excel bulk import (${fileName})`,
                  req.idToken!,
                  tenantId
                );
              }
              updatedCount += 1;
              continue;
            }

            if (importType === 'attendance') {
              const m = row.mapped;
              const batch = await fsGetDoc<Batch>('batches', m._resolvedBatchId, req.idToken!);
              const enr = await fsGetDoc<Enrollment>('enrollments', m._resolvedEnrollmentId, req.idToken!);
              if (
                !batch ||
                !enr ||
                !assertRecordTenant(batch, tenantId, !strictTenant) ||
                !assertRecordTenant(enr, tenantId, !strictTenant)
              ) {
                throw new Error('Batch or enrollment missing in tenant workspace');
              }
              const attId = primaryMatch?.existingRecordId || tenantScopedDocId(tenantId, `${batch.id}_${enr.id}_${m.date}`);
              const existingAtt = await fsGetDoc<AttendanceRecord>('attendance', attId, req.idToken!).catch(() => null);
              if (existingAtt && !assertRecordTenant(existingAtt, tenantId, !strictTenant)) {
                throw new Error('Cross-tenant attendance overwrite blocked');
              }
              const isLocked = existingAtt?.submissionStatus === 'submitted';
              if (isLocked && req.user!.role === 'trainer') {
                throw new Error(`Locked attendance on ${m.date} cannot be modified by trainer`);
              }
              if (isLocked && !m.correctionReason) {
                throw new Error(`Correction reason is required to overwrite locked attendance on ${m.date}`);
              }
              const updates: Record<string, unknown> = {
                status: m.status,
                remarks: (m.remarks || '').slice(0, 400),
                markedBy: req.user!.uid,
              };
              if (isLocked) {
                updates.correctedBy = req.user!.uid;
                updates.correctionReason = m.correctionReason.slice(0, 400);
              } else if (m.submissionStatus === 'submitted') {
                updates.submissionStatus = 'submitted';
                updates.submittedAt = new Date().toISOString();
                updates.submittedBy = req.user!.uid;
              }
              await fsUpdateDoc('attendance', attId, updates, req.idToken!, ['updatedAt']);
              if (isLocked) {
                await writeAuditLog(
                  req.user!,
                  'ATTENDANCE_EXCEL_CORRECTION',
                  'attendance',
                  attId,
                  `Corrected locked attendance (${enr.enrollmentNumber} on ${m.date}): ${m.correctionReason}`,
                  req.idToken!,
                  tenantId
                );
              }
              updatedCount += 1;
              continue;
            }

            duplicateCount += 1;
            failedRows.push({
              rowNumber: row.rowNumber,
              status: 'duplicate',
              duplicateDetails: row.duplicateDetails,
              errors: ['Update not supported for this entity type'],
              data: row.mapped,
            });
          } catch (updErr) {
            failedCount += 1;
            failedRows.push({
              rowNumber: row.rowNumber,
              status: 'failed',
              errors: [updErr instanceof Error ? updErr.message : String(updErr)],
              data: row.mapped,
            });
          }
          continue;
        }

        // Valid new record
        try {
          const m = row.mapped;
          if (importType === 'candidates' || importType === 'corporate_employees') {
            const iqHash = m.iqamaNumber ? hmacTenantIdentityHash(tenantId, 'iqama', m.iqamaNumber) : '';
            const ppHash = m.passportNumber ? hmacTenantIdentityHash(tenantId, 'passport', m.passportNumber) : '';
            const legacyIqHash = !strictTenant && tenantId === DEFAULT_TENANT_ID && m.iqamaNumber ? hmacIdentityHash('iqama', m.iqamaNumber) : '';
            const legacyPpHash = !strictTenant && tenantId === DEFAULT_TENANT_ID && m.passportNumber ? hmacIdentityHash('passport', m.passportNumber) : '';
            if (
              (iqHash && (await fsGetDoc('identityHashes', iqHash, req.idToken!).catch(() => null))) ||
              (legacyIqHash && (await fsGetDoc('identityHashes', legacyIqHash, req.idToken!).catch(() => null)))
            ) {
              duplicateCount += 1;
              failedRows.push({ rowNumber: row.rowNumber, status: 'duplicate', errors: ['Iqama already registered'], data: m });
              continue;
            }
            if (
              (ppHash && (await fsGetDoc('identityHashes', ppHash, req.idToken!).catch(() => null))) ||
              (legacyPpHash && (await fsGetDoc('identityHashes', legacyPpHash, req.idToken!).catch(() => null)))
            ) {
              duplicateCount += 1;
              failedRows.push({ rowNumber: row.rowNumber, status: 'duplicate', errors: ['Passport already registered'], data: m });
              continue;
            }

            const candidateId = await nextSequenceCode('CND', 'CND', true, req.idToken!, 5, tenantId);
            const candidateDocId = tenantScopedDocId(tenantId, candidateId);
            const data: Record<string, unknown> = {
              tenantId,
              candidateId,
              fullNameEn: m.fullNameEn.slice(0, 200),
              fullNameAr: (m.fullNameAr || m.fullNameEn).slice(0, 200),
              nationality: m.nationality.slice(0, 100),
              mobile: m.mobile.slice(0, 32),
              registrationDate: new Date().toISOString().slice(0, 10),
              status: 'active',
              createdBy: req.user!.uid,
            };
            if (m.gender === 'male' || m.gender === 'female') data.gender = m.gender;
            if (m.dateOfBirth) data.dateOfBirth = m.dateOfBirth.slice(0, 32);
            if (m.email) data.email = m.email.slice(0, 200);
            if (orgId) data.organizationId = orgId;
            const resolvedCompany = m.companyName || orgRecord?.nameEn || '';
            if (resolvedCompany) data.companyName = resolvedCompany.slice(0, 200);
            if (m.employeeId) data.employeeId = m.employeeId.slice(0, 64);
            if (m.jobTitle) data.jobTitle = m.jobTitle.slice(0, 160);
            if (m.department) data.department = m.department.slice(0, 160);
            if (m.workLocation) data.workLocation = m.workLocation.slice(0, 200);
            if (m.address) data.address = m.address.slice(0, 400);
            if (m.emergencyContact) data.emergencyContact = m.emergencyContact.slice(0, 200);
            if (m.iqamaExpiryDate) data.iqamaExpiryDate = m.iqamaExpiryDate.slice(0, 32);
            if (m.passportExpiryDate) data.passportExpiryDate = m.passportExpiryDate.slice(0, 32);
            if (m.iqamaNumber) {
              data.iqamaEncrypted = encryptSensitive(m.iqamaNumber);
              data.iqamaMasked = maskIdentity(m.iqamaNumber);
              data.iqamaHash = iqHash;
            }
            if (m.passportNumber) {
              data.passportEncrypted = encryptSensitive(m.passportNumber);
              data.passportMasked = maskIdentity(m.passportNumber);
              data.passportHash = ppHash;
            }
            const ops: CommitWriteOp[] = [
              {
                type: 'create',
                collection: 'candidates',
                docId: candidateDocId,
                data,
                serverTimestampFields: ['createdAt', 'updatedAt'],
              },
            ];
            if (iqHash) {
              ops.push({
                type: 'create',
                collection: 'identityHashes',
                docId: iqHash,
                data: { tenantId, hashKey: iqHash, idType: 'iqama', candidateDocId, candidateId },
                serverTimestampFields: ['createdAt'],
              });
            }
            if (ppHash) {
              ops.push({
                type: 'create',
                collection: 'identityHashes',
                docId: ppHash,
                data: { tenantId, hashKey: ppHash, idType: 'passport', candidateDocId, candidateId },
                serverTimestampFields: ['createdAt'],
              });
            }
            await fsCommit(ops, req.idToken!);
            importedCount += 1;
          } else if (importType === 'enrollment_requests') {
            const gOrg = m._resolvedOrganizationId;
            const gCourse = m._resolvedCourseId;
            const gBatch = m._resolvedPreferredBatchId || '';
            const key = `${gOrg}__${gCourse}__${gBatch}`;
            const existingGroup = requestGroups.get(key) || {
              organizationId: gOrg,
              courseId: gCourse,
              ...(gBatch ? { preferredBatchId: gBatch } : {}),
              candidateDocIds: [],
              notes: [],
              rowNumbers: [],
            };
            if (!existingGroup.candidateDocIds.includes(m._resolvedCandidateDocId)) {
              existingGroup.candidateDocIds.push(m._resolvedCandidateDocId);
            }
            if (m.requestNotes && !existingGroup.notes.includes(m.requestNotes)) {
              existingGroup.notes.push(m.requestNotes);
            }
            existingGroup.rowNumbers.push(row.rowNumber);
            requestGroups.set(key, existingGroup);
          } else if (importType === 'enrollments') {
            const batchId = m._resolvedBatchId;
            let batch = batchCache.get(batchId);
            if (!batch) {
              batch = (await fsGetDoc<Batch>('batches', batchId, req.idToken!)) || undefined;
              if (batch) batchCache.set(batchId, batch);
            }
            const cand = await fsGetDoc<Candidate>('candidates', m._resolvedCandidateDocId, req.idToken!);
            const course = await fsGetDoc<Course>('courses', m._resolvedCourseId, req.idToken!);
            if (
              !batch ||
              !cand ||
              !course ||
              !assertRecordTenant(batch, tenantId, !strictTenant) ||
              !assertRecordTenant(cand, tenantId, !strictTenant) ||
              !assertRecordTenant(course, tenantId, !strictTenant)
            ) {
              throw new Error('Enrollment references missing in tenant workspace');
            }
            const targetStatus = m.status === 'pending' ? 'pending' : 'confirmed';
            if (targetStatus === 'confirmed' && batch.enrollmentCount >= batch.capacity) {
              throw new Error(`Batch ${batch.batchNumber} has reached capacity (${batch.capacity})`);
            }

            const enrollmentNumber = await nextSequenceCode('ENR', 'ENR', true, req.idToken!, 4, tenantId);
            const enrDocId = tenantScopedDocId(tenantId, enrollmentNumber);
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
              prerequisiteConfirmed: true,
              requestedBy: req.user!.uid,
            };
            if (cand.userId) enrPayload.candidateUserId = cand.userId;
            if (cand.organizationId) enrPayload.organizationId = cand.organizationId;
            if (batch.trainerUserId) enrPayload.trainerUserId = batch.trainerUserId;
            if (m.notes) enrPayload.notes = m.notes.slice(0, 480);

            const ops: CommitWriteOp[] = [
              {
                type: 'create',
                collection: 'enrollments',
                docId: enrDocId,
                data: enrPayload,
                serverTimestampFields: ['createdAt', 'updatedAt'],
              },
            ];
            if (targetStatus === 'confirmed') {
              batch.enrollmentCount += 1;
              ops.push({
                type: 'update',
                collection: 'batches',
                docId: batch.id,
                data: { enrollmentCount: batch.enrollmentCount },
                updateFields: ['enrollmentCount'],
                serverTimestampFields: ['updatedAt'],
              });
            }
            await fsCommit(ops, req.idToken!);

            if (targetStatus === 'confirmed') {
              const createdEnr = await fsGetDoc<Enrollment>('enrollments', enrDocId, req.idToken!);
              if (createdEnr) {
                try {
                  const card = await createTrainingCardForEnrollment({
                    tenantId,
                    strictTenant,
                    enrollment: createdEnr,
                    candidate: cand,
                    course,
                    batch,
                    actor: req.user!,
                    idToken: req.idToken!,
                    verifyBaseUrl: getAppBaseUrl(req),
                  });
                  await fsUpdateDoc(
                    'enrollments',
                    createdEnr.id,
                    { trainingCardId: card.id },
                    req.idToken!,
                    ['updatedAt']
                  );
                } catch {
                  // Enrollment succeeds even if card generation fails asynchronously
                }
              }
            }
            importedCount += 1;
          } else if (importType === 'attendance') {
            const batch = await fsGetDoc<Batch>('batches', m._resolvedBatchId, req.idToken!);
            const enr = await fsGetDoc<Enrollment>('enrollments', m._resolvedEnrollmentId, req.idToken!);
            if (
              !batch ||
              !enr ||
              !assertRecordTenant(batch, tenantId, !strictTenant) ||
              !assertRecordTenant(enr, tenantId, !strictTenant)
            ) {
              throw new Error('Batch or enrollment missing in tenant workspace');
            }
            const attId = tenantScopedDocId(tenantId, `${batch.id}_${enr.id}_${m.date}`);
            const nowIso = new Date().toISOString();
            const submit = m.submissionStatus === 'submitted';
            const payload: Record<string, unknown> = {
              tenantId,
              batchId: batch.id,
              enrollmentId: enr.id,
              candidateDocId: enr.candidateDocId,
              date: m.date,
              status: m.status,
              remarks: (m.remarks || '').slice(0, 400),
              markedBy: req.user!.uid,
              submissionStatus: submit ? 'submitted' : 'draft',
            };
            if (submit) {
              payload.submittedAt = nowIso;
              payload.submittedBy = req.user!.uid;
            }
            if (enr.organizationId) payload.organizationId = enr.organizationId;
            if (batch.trainerUserId) payload.trainerUserId = batch.trainerUserId;
            else if (req.user!.role === 'trainer') payload.trainerUserId = req.user!.uid;
            await fsCreateDoc('attendance', attId, payload, req.idToken!, ['createdAt', 'updatedAt']);
            importedCount += 1;
          } else if (importType === 'courses') {
            const courseId = await nextSequenceCode('CRS', 'CRS', false, req.idToken!, 4, tenantId);
            const courseDocId = tenantScopedDocId(tenantId, courseId);
            const courseData: Record<string, unknown> = {
              tenantId,
              courseId,
              courseCode: m.courseCode.toUpperCase().slice(0, 40),
              titleEn: m.titleEn.slice(0, 220),
              titleAr: (m.titleAr || m.titleEn).slice(0, 220),
              category: (m.category || 'Industrial Safety').slice(0, 120),
              duration: Number(m.duration || 1),
              durationUnit: ['hours', 'days', 'weeks'].includes(m.durationUnit) ? m.durationUnit : 'days',
              minAttendancePct: Number(m.minAttendancePct || 80),
              minExamScore: Number(m.minExamScore || 60),
              examRequired: true,
              practicalRequired: false,
              validityMonths: Number(m.validityMonths || 24),
              status: 'active',
              createdBy: req.user!.uid,
            };
            if (m.courseType && ['theoretical', 'practical', 'blended', 'certification', 'refresher'].includes(m.courseType)) {
              courseData.courseType = m.courseType;
            }
            if (m.fee && !Number.isNaN(Number(m.fee))) {
              courseData.fee = Number(m.fee);
            }
            await fsCreateDoc('courses', courseDocId, courseData, req.idToken!, ['createdAt', 'updatedAt']);
            importedCount += 1;
          } else if (importType === 'trainers') {
            const trainerId = await nextSequenceCode('TRN', 'TRN', false, req.idToken!, 4, tenantId);
            const trainerDocId = tenantScopedDocId(tenantId, trainerId);
            const nameEn = (m.nameEn || m.fullNameEn).slice(0, 200);
            const trainerData: Record<string, unknown> = {
              tenantId,
              trainerId,
              nameEn,
              nameAr: (m.nameAr || m.fullNameAr || nameEn).slice(0, 200),
              mobile: m.mobile.slice(0, 32),
              email: m.email.slice(0, 200),
              specialization: (m.specialization || 'Safety').slice(0, 200),
              qualifications: (m.qualifications || '').slice(0, 500),
              experienceYears: Number(m.experienceYears || 0),
              status: 'active',
              createdBy: req.user!.uid,
            };
            if (m.nationality) trainerData.nationality = m.nationality.slice(0, 100);
            if (m.certifications) trainerData.certifications = m.certifications.slice(0, 500);
            if (m.employmentStatus && ['full_time', 'part_time', 'contract', 'freelance'].includes(m.employmentStatus)) {
              trainerData.employmentStatus = m.employmentStatus;
            }
            await fsCreateDoc('trainers', trainerDocId, trainerData, req.idToken!, ['createdAt', 'updatedAt']);
            importedCount += 1;
          }
        } catch (rowErr) {
          failedCount += 1;
          failedRows.push({
            rowNumber: row.rowNumber,
            status: 'failed',
            errors: [rowErr instanceof Error ? rowErr.message : String(rowErr)],
            data: row.mapped,
          });
        }
      }

      // Flush grouped enrollment requests (1..100 candidateDocIds per ERQ doc)
      if (importType === 'enrollment_requests' && requestGroups.size > 0) {
        for (const group of requestGroups.values()) {
          const [grpOrg, grpCourse] = await Promise.all([
            fsGetDoc<Organization>('organizations', group.organizationId, req.idToken!).catch(() => null),
            fsGetDoc<Course>('courses', group.courseId, req.idToken!).catch(() => null),
          ]);
          for (let offset = 0; offset < group.candidateDocIds.length; offset += 100) {
            const chunk = group.candidateDocIds.slice(offset, offset + 100);
            const requestNumber = await nextSequenceCode('ERQ', 'ERQ', true, req.idToken!, 5, tenantId);
            const erqDocId = tenantScopedDocId(tenantId, requestNumber);
            const payload: Record<string, unknown> = {
              tenantId,
              requestNumber,
              organizationId: group.organizationId,
              organizationNameEn: grpOrg?.nameEn || group.organizationId,
              organizationNameAr: grpOrg?.nameAr || grpOrg?.nameEn || group.organizationId,
              candidateDocIds: chunk,
              courseId: group.courseId,
              status: 'pending_review',
              requestedBy: req.user!.uid,
              requestedByName: req.user!.displayName,
            };
            if (group.preferredBatchId) payload.preferredBatchId = group.preferredBatchId;
            if (group.notes.length > 0) payload.requestNotes = group.notes.join(' | ').slice(0, 1000);
            await fsCreateDoc('enrollmentRequests', erqDocId, payload, req.idToken!, ['createdAt', 'updatedAt']);
            await createNotification(
              {
                tenantId,
                targetRole: 'admin',
                type: 'enrollment_request_submitted',
                titleEn: 'Bulk Enrollment Request Uploaded',
                titleAr: 'طلب تسجيل جماعي عبر Excel',
                bodyEn: `${grpOrg?.nameEn || group.organizationId} submitted ${requestNumber} for ${chunk.length} employee(s) in ${grpCourse?.titleEn || group.courseId}.`,
                bodyAr: `قدمت ${grpOrg?.nameAr || group.organizationId} طلب تسجيل جماعي ${requestNumber} لعدد ${chunk.length} متدرباً في دورة ${grpCourse?.titleAr || group.courseId}.`,
              },
              req.idToken!
            );
            importedCount += chunk.length;
          }
        }
      }

      const successTotal = importedCount + updatedCount;
      const issueTotal = duplicateCount + invalidCount + failedCount;
      const jobStatus: ImportJobStatus =
        successTotal === 0 && issueTotal > 0
          ? 'failed'
          : issueTotal > 0
            ? 'completed_with_errors'
            : 'completed';

      const jobId = await nextSequenceCode('IMP', 'IMP', true, req.idToken!, 5, tenantId);
      const jobDocId = tenantScopedDocId(tenantId, jobId);
      const jobDoc: Record<string, unknown> = {
        tenantId,
        jobId,
        importType,
        ...(orgId ? { organizationId: orgId } : {}),
        fileName,
        uploadedByName: req.user!.displayName.slice(0, 160),
        uploadedByEmail: req.user!.email.slice(0, 200),
        totalRows: rows.length,
        importedCount,
        updatedCount,
        duplicateCount,
        invalidCount,
        skippedCount,
        failedCount,
        status: jobStatus,
        createdBy: req.user!.uid,
      };

      await fsCreateDoc('importJobs', jobDocId, jobDoc, req.idToken!, ['createdAt']);

      await writeAuditLog(
        req.user!,
        'EXCEL_BULK_IMPORT',
        'importJobs',
        jobDocId,
        `Imported ${importedCount} created, ${updatedCount} updated, ${duplicateCount} duplicates, ${invalidCount} invalid, ${skippedCount} skipped, ${failedCount} failed (${importType})`,
        req.idToken!,
        tenantId
      );

      res.json({
        summary: {
          jobId,
          status: jobStatus,
          totalRows: rows.length,
          importedCount,
          updatedCount,
          duplicateCount,
          invalidCount,
          skippedCount,
          failedCount,
          failedRows,
        },
      });
    } catch (err) {
      if (err instanceof TenantSecurityError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Cancel Import Preview & Record Audit / Import History Entry
  // ---------------------------------------------------------------------------
  router.post('/excel/cancel', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const importType = String(req.body.importType || 'candidates') as ExcelTemplateType;
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      if (!canUseImportType(req.user!, importType, matrix)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const fileName = String(req.body.fileName || 'cancelled_upload.xlsx').slice(0, 255);
      const totalRows = Math.max(0, Number(req.body.totalRows || 0));
      const orgId =
        req.user!.role === 'corporate_client'
          ? req.user!.organizationId || ''
          : String(req.body.organizationId || '').trim();

      const jobId = await nextSequenceCode('IMP', 'IMP', true, req.idToken!, 5, tenantId);
      const jobDocId = tenantScopedDocId(tenantId, jobId);
      await fsCreateDoc(
        'importJobs',
        jobDocId,
        {
          tenantId,
          jobId,
          importType,
          ...(orgId ? { organizationId: orgId } : {}),
          fileName,
          uploadedByName: req.user!.displayName.slice(0, 160),
          uploadedByEmail: req.user!.email.slice(0, 200),
          totalRows,
          importedCount: 0,
          updatedCount: 0,
          duplicateCount: 0,
          invalidCount: 0,
          skippedCount: totalRows,
          failedCount: 0,
          status: 'cancelled',
          createdBy: req.user!.uid,
        },
        req.idToken!,
        ['createdAt']
      );

      await writeAuditLog(
        req.user!,
        'EXCEL_IMPORT_CANCELLED',
        'importJobs',
        jobDocId,
        `Cancelled ${importType} Excel import for ${fileName} (${totalRows} row(s))`,
        req.idToken!,
        tenantId
      );

      res.json({ ok: true, jobId, status: 'cancelled' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Download Excel Error Report
  // ---------------------------------------------------------------------------
  router.post('/excel/error-report', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const failedRows = (req.body.failedRows || []) as ErrorReportRowInput[];
      const buf = await generateImportErrorWorkbook(failedRows);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="import_errors_report.xlsx"');
      res.send(buf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Import History (Role & Org Scoped)
  // ---------------------------------------------------------------------------
  router.get('/excel/history', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const role = req.user!.role;
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      if (role === 'candidate') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const importTypeFilter = req.query.importType ? String(req.query.importType) : undefined;
      const statusFilter = req.query.status ? String(req.query.status) : undefined;

      let jobs: ImportJob[] = [];
      if (role === 'corporate_client') {
        if (!req.user!.organizationId) {
          res.json({ jobs: [] });
          return;
        }
        jobs = await fsQueryTenantDocs<ImportJob>('importJobs', tenantId, req.idToken!, {
          filters: [{ field: 'organizationId', op: 'EQUAL', value: req.user!.organizationId }],
          strictTenantFilter: strictTenant,
        });
      } else if (role === 'trainer') {
        jobs = await fsQueryTenantDocs<ImportJob>('importJobs', tenantId, req.idToken!, {
          filters: [
            { field: 'importType', op: 'EQUAL', value: 'attendance' },
            { field: 'createdBy', op: 'EQUAL', value: req.user!.uid },
          ],
          strictTenantFilter: strictTenant,
        });
      } else {
        jobs = await fsQueryTenantDocs<ImportJob>('importJobs', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
      }

      const filtered = jobs
        .filter((j) => (!importTypeFilter || j.importType === importTypeFilter) && (!statusFilter || j.status === statusFilter))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      res.json({ jobs: filtered });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // 8. Excel Export Catalog & 8 Role-Secured Datasets
  // ---------------------------------------------------------------------------
  router.get('/excel/exports/catalog', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const role = req.user!.role;
      const tenantId = req.tenantId!;
      if (role === 'candidate') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      const isAdminOrOwner = isTenantAdminOrOwnerRole(role);
      const allDatasets: Array<{
        key: ExcelExportDatasetKey;
        allowed: boolean;
        supportsSensitiveUnmask: boolean;
      }> = [
        {
          key: 'candidates',
          allowed: role !== 'trainer' && hasPermission(req.user!, 'candidates', 'view', matrix),
          supportsSensitiveUnmask: isAdminOrOwner,
        },
        {
          key: 'courses',
          allowed: hasPermission(req.user!, 'courses', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'batches',
          allowed: hasPermission(req.user!, 'batches', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'enrollments',
          allowed: hasPermission(req.user!, 'enrollments', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'attendance',
          allowed: hasPermission(req.user!, 'attendance', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'assessments',
          allowed: hasPermission(req.user!, 'assessments', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'certificates',
          allowed: role !== 'trainer' && hasPermission(req.user!, 'certificates', 'view', matrix),
          supportsSensitiveUnmask: false,
        },
        {
          key: 'corporate_employees',
          allowed: role !== 'trainer' && hasPermission(req.user!, 'candidates', 'view', matrix),
          supportsSensitiveUnmask: isAdminOrOwner,
        },
      ];

      res.json({
        datasets: allDatasets.filter((d) => d.allowed),
        canIncludeSensitive: isAdminOrOwner,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/excel/export/:dataset', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const strictTenant = Boolean(req.strictTenantQuery);
      const dataset = String(req.params.dataset) as ExcelExportDatasetKey;
      const format = String(req.query.format || 'xlsx') === 'csv' ? 'csv' : 'xlsx';
      const role = req.user!.role;
      if (role === 'candidate') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const matrix = await getRolePermissionMatrix(req.idToken!, tenantId);
      const includeSensitive =
        req.query.includeSensitive === 'true' && isTenantAdminOrOwnerRole(role);
      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;
      const courseId = req.query.courseId ? String(req.query.courseId) : undefined;
      const orgFilter =
        role === 'corporate_client'
          ? req.user!.organizationId || '__unassigned__'
          : req.query.organizationId
            ? String(req.query.organizationId)
            : undefined;

      let title = 'Dataset Export';
      let headers: string[] = [];
      let rows: Array<Array<string | number>> = [];

      const decryptIfAllowed = (encrypted?: string, masked?: string): string => {
        if (!includeSensitive || !encrypted) return masked || '-';
        try {
          return decryptSensitive(encrypted) || masked || '-';
        } catch {
          return masked || '-';
        }
      };

      const loadOrgMap = async (): Promise<Map<string, Organization>> => {
        if (role === 'corporate_client' && orgFilter) {
          const o = await fsGetDoc<Organization>('organizations', orgFilter, req.idToken!).catch(() => null);
          const list = o && assertRecordTenant(o, tenantId, !strictTenant) ? [o] : [];
          return new Map(list.map((item) => [item.id, item]));
        }
        const orgs = await fsQueryTenantDocs<Organization>('organizations', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
        return new Map(orgs.map((item) => [item.id, item]));
      };

      if (dataset === 'candidates' || dataset === 'corporate_employees') {
        if (role === 'trainer' || !hasPermission(req.user!, 'candidates', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing candidates:view permission' });
          return;
        }
        const rawCandidates = orgFilter
          ? await fsQueryTenantDocs<Candidate & { iqamaEncrypted?: string; passportEncrypted?: string }>('candidates', tenantId, req.idToken!, {
              filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
              strictTenantFilter: strictTenant,
            })
          : await fsQueryTenantDocs<Candidate & { iqamaEncrypted?: string; passportEncrypted?: string }>('candidates', tenantId, req.idToken!, {
              strictTenantFilter: strictTenant,
            });

        const orgMap = await loadOrgMap();

        const list = rawCandidates.filter((c) => {
          if (dataset === 'corporate_employees' && !c.organizationId) return false;
          return inDateRange(c.registrationDate, from, to);
        });

        title = dataset === 'corporate_employees' ? 'Corporate Employees Report' : 'Candidates Registry';
        headers = [
          'Candidate ID',
          'Full Name (EN)',
          'Full Name (AR)',
          'Gender',
          'Nationality',
          includeSensitive ? 'Iqama Number (Unmasked)' : 'Iqama (Masked)',
          'Iqama Expiry',
          includeSensitive ? 'Passport Number (Unmasked)' : 'Passport (Masked)',
          'Passport Expiry',
          'Date of Birth',
          'Mobile',
          'Email',
          'Organization',
          'Employee ID',
          'Job Title',
          'Department',
          'Work Location',
          'Registration Date',
          'Status',
        ];
        rows = list.map((c) => {
          const safe = sanitizeCandidateForClient(c, role);
          return [
            safe.candidateId,
            safe.fullNameEn,
            safe.fullNameAr,
            safe.gender || '-',
            safe.nationality,
            decryptIfAllowed(c.iqamaEncrypted, safe.iqamaMasked),
            safe.iqamaExpiryDate || '-',
            decryptIfAllowed(c.passportEncrypted, safe.passportMasked),
            safe.passportExpiryDate || '-',
            safe.dateOfBirth || '-',
            safe.mobile,
            safe.email || '-',
            (safe.organizationId && orgMap.get(safe.organizationId)?.nameEn) || safe.companyName || 'Individual',
            safe.employeeId || '-',
            safe.jobTitle || '-',
            safe.department || '-',
            safe.workLocation || '-',
            safe.registrationDate,
            safe.status,
          ];
        });
      } else if (dataset === 'courses') {
        if (!hasPermission(req.user!, 'courses', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing courses:view permission' });
          return;
        }
        const courses = await fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, {
          strictTenantFilter: strictTenant,
        });
        const filtered = courses.filter((c) => !courseId || c.id === courseId);
        title = 'Course Catalogue';
        headers = [
          'Course ID',
          'Course Code',
          'Title (EN)',
          'Title (AR)',
          'Category',
          'Course Type',
          'Duration',
          'Theory Hrs',
          'Practical Hrs',
          'Min Attendance %',
          'Passing Score %',
          'Fee (SAR)',
          'Validity (Months)',
          'Prerequisites',
          'Status',
        ];
        rows = filtered.map((c) => [
          c.courseId,
          c.courseCode,
          c.titleEn,
          c.titleAr,
          c.category,
          c.courseType || '-',
          `${c.duration} ${c.durationUnit}`,
          c.theoryHours ?? 0,
          c.practicalHours ?? 0,
          c.minAttendancePct,
          c.minExamScore,
          c.fee ?? 0,
          c.validityMonths ?? 0,
          c.prerequisites || 'None',
          c.status,
        ]);
      } else if (dataset === 'batches') {
        if (!hasPermission(req.user!, 'batches', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing batches:view permission' });
          return;
        }
        const [batches, courses, trainers, enrollments] = await Promise.all([
          fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          role === 'corporate_client'
            ? Promise.resolve([])
            : fsQueryTenantDocs<Trainer>('trainers', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          orgFilter
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : Promise.resolve([]),
        ]);
        const courseMap = new Map(courses.map((c) => [c.id, c]));
        const trainerMap = new Map(trainers.map((t) => [t.id, t]));
        const orgBatchIds = new Set(enrollments.map((e) => e.batchId));

        const scoped = batches.filter((b) => {
          if (courseId && b.courseId !== courseId) return false;
          if (!inDateRange(b.startDate, from, to)) return false;
          if (role === 'trainer') {
            return b.trainerUserId === req.user!.uid || (req.user!.trainerId && b.trainerId === req.user!.trainerId);
          }
          if (role === 'corporate_client') return orgBatchIds.has(b.id) || b.status === 'scheduled';
          return true;
        });

        title = 'Training Batches';
        headers = [
          'Batch Number',
          'Batch Name',
          'Course Code',
          'Course Title',
          'Trainer',
          'Mode',
          'Venue',
          'Start Date',
          'End Date',
          'Enrolled',
          'Capacity',
          'Available Seats',
          'Enrollment Closed',
          'Status',
        ];
        rows = scoped.map((b) => {
          const crs = courseMap.get(b.courseId);
          const trn = trainerMap.get(b.trainerId);
          return [
            b.batchNumber,
            b.batchName || '-',
            crs?.courseCode || '-',
            crs?.titleEn || b.courseId,
            trn?.nameEn || b.trainerId,
            b.trainingMode || 'classroom',
            b.venue,
            b.startDate,
            b.endDate,
            b.enrollmentCount,
            b.capacity,
            Math.max(0, b.capacity - b.enrollmentCount),
            b.enrollmentClosed ? 'Yes' : 'No',
            b.status,
          ];
        });
      } else if (dataset === 'enrollments') {
        if (!hasPermission(req.user!, 'enrollments', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing enrollments:view permission' });
          return;
        }
        const [enrollments, candidates, courses, batches, orgMap] = await Promise.all([
          orgFilter
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter: strictTenant,
                })
              : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  strictTenantFilter: strictTenant,
                }),
          orgFilter
            ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                strictTenantFilter: strictTenant,
              }),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          role === 'trainer' ? Promise.resolve(new Map<string, Organization>()) : loadOrgMap(),
        ]);

        const candMap = new Map(candidates.map((c) => [c.id, c]));
        const courseMap = new Map(courses.map((c) => [c.id, c]));
        const batchMap = new Map(batches.map((b) => [b.id, b]));

        const filtered = enrollments.filter(
          (e) => (!courseId || e.courseId === courseId) && inDateRange(e.createdAt, from, to)
        );
        title = 'Enrollment Report';
        headers = [
          'Enrollment #',
          'Candidate ID',
          'Candidate Name (EN)',
          'Course Code',
          'Course Title',
          'Batch Number',
          'Organization',
          'Status',
          'Trainer Recommended',
          'Completion Approved',
          'Enrolled Date',
        ];
        rows = filtered.map((e) => [
          e.enrollmentNumber,
          e.candidateId,
          candMap.get(e.candidateDocId)?.fullNameEn || e.candidateId,
          courseMap.get(e.courseId)?.courseCode || '-',
          courseMap.get(e.courseId)?.titleEn || e.courseId,
          batchMap.get(e.batchId)?.batchNumber || e.batchId,
          (e.organizationId && orgMap.get(e.organizationId)?.nameEn) || 'Individual',
          e.status,
          e.trainerRecommended ? 'Yes' : 'No',
          e.completionApproved ? 'Yes' : 'No',
          (e.createdAt || '').slice(0, 10),
        ]);
      } else if (dataset === 'attendance') {
        if (!hasPermission(req.user!, 'attendance', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing attendance:view permission' });
          return;
        }
        const [attendance, enrollments, candidates, batches, courses] = await Promise.all([
          orgFilter
            ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter: strictTenant,
                })
              : fsQueryTenantDocs<AttendanceRecord>('attendance', tenantId, req.idToken!, {
                  strictTenantFilter: strictTenant,
                }),
          orgFilter
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter: strictTenant,
                })
              : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  strictTenantFilter: strictTenant,
                }),
          orgFilter
            ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                strictTenantFilter: strictTenant,
              }),
          fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
        ]);

        const enrMap = new Map(enrollments.map((e) => [e.id, e]));
        const candMap = new Map(candidates.map((c) => [c.id, c]));
        const batchMap = new Map(batches.map((b) => [b.id, b]));
        const courseMap = new Map(courses.map((c) => [c.id, c]));

        const filtered = attendance
          .filter((a) => {
            const b = batchMap.get(a.batchId);
            if (courseId && b?.courseId !== courseId) return false;
            return inDateRange(a.date, from, to);
          })
          .sort((a, b) => a.date.localeCompare(b.date));

        title = 'Attendance Report';
        headers = [
          'Date',
          'Batch Number',
          'Course Code',
          'Enrollment #',
          'Candidate ID',
          'Candidate Name',
          'Status',
          'Submission Status',
          'Remarks',
          'Correction Reason',
        ];
        rows = filtered.map((a) => {
          const enr = enrMap.get(a.enrollmentId);
          const cand = candMap.get(a.candidateDocId);
          const batch = batchMap.get(a.batchId);
          const crs = batch ? courseMap.get(batch.courseId) : undefined;
          return [
            a.date,
            batch?.batchNumber || a.batchId,
            crs?.courseCode || '-',
            enr?.enrollmentNumber || a.enrollmentId,
            cand?.candidateId || enr?.candidateId || '-',
            cand?.fullNameEn || a.candidateDocId,
            a.status,
            a.submissionStatus || 'draft',
            a.remarks || '-',
            a.correctionReason || '-',
          ];
        });
      } else if (dataset === 'assessments') {
        if (!hasPermission(req.user!, 'assessments', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing assessments:view permission' });
          return;
        }
        const [assessments, enrollments, candidates, courses, batches] = await Promise.all([
          orgFilter
            ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter: strictTenant,
                })
              : fsQueryTenantDocs<AssessmentRecord>('assessments', tenantId, req.idToken!, {
                  strictTenantFilter: strictTenant,
                }),
          orgFilter
            ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : role === 'trainer'
              ? fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  filters: [{ field: 'trainerUserId', op: 'EQUAL', value: req.user!.uid }],
                  strictTenantFilter: strictTenant,
                })
              : fsQueryTenantDocs<Enrollment>('enrollments', tenantId, req.idToken!, {
                  strictTenantFilter: strictTenant,
                }),
          orgFilter
            ? fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : fsQueryTenantDocs<Candidate>('candidates', tenantId, req.idToken!, {
                strictTenantFilter: strictTenant,
              }),
          fsQueryTenantDocs<Course>('courses', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
          fsQueryTenantDocs<Batch>('batches', tenantId, req.idToken!, { strictTenantFilter: strictTenant }),
        ]);

        const enrMap = new Map(enrollments.map((e) => [e.id, e]));
        const candMap = new Map(candidates.map((c) => [c.id, c]));
        const courseMap = new Map(courses.map((c) => [c.id, c]));
        const batchMap = new Map(batches.map((b) => [b.id, b]));

        const filtered = assessments.filter(
          (a) => (!courseId || a.courseId === courseId) && inDateRange(a.assessmentDate, from, to)
        );
        title = 'Examination Results';
        headers = [
          'Assessment #',
          'Assessment Date',
          'Enrollment #',
          'Candidate ID',
          'Candidate Name',
          'Course',
          'Batch',
          'Type',
          'Attempt',
          'Obtained',
          'Max Marks',
          'Score %',
          'Result',
          'Status',
        ];
        rows = filtered.map((a) => {
          const enr = enrMap.get(a.enrollmentId);
          const cand = candMap.get(a.candidateDocId);
          const pct = a.percentage ?? (a.maxMarks > 0 ? Math.round((a.obtainedMarks / a.maxMarks) * 100) : 0);
          return [
            a.assessmentNumber || a.id,
            a.assessmentDate,
            enr?.enrollmentNumber || a.enrollmentId,
            cand?.candidateId || enr?.candidateId || '-',
            cand?.fullNameEn || a.candidateDocId,
            courseMap.get(a.courseId)?.titleEn || a.courseId,
            batchMap.get(a.batchId)?.batchNumber || a.batchId,
            a.assessmentType,
            a.attemptNumber,
            a.obtainedMarks,
            a.maxMarks,
            `${pct}%`,
            a.result.toUpperCase(),
            a.assessmentStatus || 'recorded',
          ];
        });
      } else if (dataset === 'certificates') {
        if (role === 'trainer' || !hasPermission(req.user!, 'certificates', 'view', matrix)) {
          res.status(403).json({ error: 'Forbidden: missing certificates:view permission' });
          return;
        }
        const [certificates, orgMap] = await Promise.all([
          orgFilter
            ? fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                filters: [{ field: 'organizationId', op: 'EQUAL', value: orgFilter }],
                strictTenantFilter: strictTenant,
              })
            : fsQueryTenantDocs<Certificate>('certificates', tenantId, req.idToken!, {
                strictTenantFilter: strictTenant,
              }),
          loadOrgMap(),
        ]);
        const filtered = certificates.filter(
          (c) => (!courseId || c.courseId === courseId) && inDateRange(c.issueDate, from, to)
        );
        title = 'Certificate Register';
        headers = [
          'Certificate Number',
          'Candidate ID',
          'Candidate Name (EN)',
          'Candidate Name (AR)',
          'Organization',
          'Course Code',
          'Course Title',
          'Trainer',
          'Completion Date',
          'Issue Date',
          'Expiry Date',
          'Issuing Officer',
          'Status',
        ];
        rows = filtered.map((c) => [
          c.certificateNumber,
          c.candidateId,
          c.snapshot.candidateNameEn,
          c.snapshot.candidateNameAr,
          (c.organizationId && orgMap.get(c.organizationId)?.nameEn) || 'Individual',
          c.snapshot.courseCode,
          c.snapshot.courseTitleEn,
          c.snapshot.trainerNameEn || '-',
          c.completionDate,
          c.issueDate,
          c.expiryDate || 'No Expiry',
          c.snapshot.issuedByName || c.issuedBy,
          c.status,
        ]);
      } else {
        res.status(404).json({ error: `Unknown export dataset: ${dataset}` });
        return;
      }

      const buf = await exportTableToWorkbook(
        title,
        headers,
        rows,
        format,
        orgFilter ? `Organization: ${orgFilter}` : 'Full Authorized Scope'
      );

      await writeAuditLog(
        req.user!,
        includeSensitive ? 'EXPORT_UNMASKED_CANDIDATES' : 'EXCEL_DATASET_EXPORT',
        dataset,
        'export',
        `Exported ${rows.length} row(s) of ${dataset} (${format.toUpperCase()}${includeSensitive ? ', UNMASKED PII' : ', masked'})`,
        req.idToken!,
        tenantId
      );

      const dateTag = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="tcms_${dataset}_${dateTag}.${format}"`
      );
      res.send(buf);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
