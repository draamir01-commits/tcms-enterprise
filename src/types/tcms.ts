export type PlatformRole =
  | 'platform_super_admin'
  | 'platform_admin'
  | 'platform_support'
  | 'platform_finance';

export type TenantStatus =
  | 'trial'
  | 'active'
  | 'grace_period'
  | 'suspended'
  | 'cancelled';

export type UserRole =
  | 'tenant_owner'
  | 'tenant_admin'
  | 'super_admin'
  | 'admin'
  | 'certificate_officer'
  | 'trainer'
  | 'corporate_client'
  | 'candidate';

export type TenantRole = UserRole;

export type LanguageCode = 'en' | 'ar';

export type ModuleKey =
  | 'dashboard'
  | 'candidates'
  | 'corporate_clients'
  | 'courses'
  | 'trainers'
  | 'batches'
  | 'enrollments'
  | 'attendance'
  | 'assessments'
  | 'training_cards'
  | 'certificates'
  | 'verification'
  | 'certificate_templates'
  | 'card_templates'
  | 'excel_import_export'
  | 'notifications'
  | 'reports'
  | 'user_management'
  | 'audit_logs'
  | 'company_settings';

export type PermissionDomain =
  | 'dashboard'
  | 'candidates'
  | 'corporate_clients'
  | 'courses'
  | 'trainers'
  | 'batches'
  | 'enrollments'
  | 'attendance'
  | 'assessments'
  | 'training_cards'
  | 'certificates'
  | 'verification'
  | 'reports'
  | 'settings'
  | 'user_management'
  | 'audit_logs';

export type PermissionAction = 'view' | 'create' | 'edit' | 'approve' | 'delete';

export type PermissionMatrix = Record<PermissionDomain, PermissionAction[]>;

export type RolePermissionMatrix = Record<UserRole, PermissionMatrix>;

export interface SaasTenant {
  id: string;
  tenantId: string;
  tenantCode: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  companyNameEn?: string;
  companyNameAr?: string;
  legalName?: string;
  crNumber?: string;
  vatNumber?: string;
  country?: string;
  city?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  status: TenantStatus;
  planCode: string;
  planId?: string;
  subscriptionId?: string;
  ownerUserId?: string;
  customDomain?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoFileId?: string;
  trialStartsAt?: string;
  trialEndsAt?: string;
  activatedAt?: string;
  defaultLanguage?: LanguageCode;
  timezone?: string;
  onboardingCompleted?: boolean;
  migrationCompleted?: boolean;
  migratedAt?: string;
  migratedBy?: string;
  isDefaultLegacyTenant?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaasUser {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  platformRole?: PlatformRole | null;
  defaultTenantId?: string;
  preferredLanguage?: LanguageCode;
  status: 'active' | 'suspended';
  lastLoginAt?: string;
  lastAuthTime?: number;
  authProvider?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantMembership {
  id: string;
  membershipId?: string;
  tenantId: string;
  uid: string;
  userId?: string;
  email: string;
  displayName?: string;
  role: UserRole;
  organizationId?: string;
  trainerId?: string;
  candidateId?: string;
  status: 'active' | 'invited' | 'suspended' | 'revoked';
  isDefault?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantContextSummary {
  tenantId: string;
  tenantCode: string;
  nameEn: string;
  nameAr: string;
  status: TenantStatus;
  planCode: string;
  planNameEn?: string;
  planNameAr?: string;
  trialEndsAt?: string;
  limits?: SubscriptionPlanLimits;
  role: UserRole;
  platformRole: PlatformRole | null;
  isDefaultLegacyTenant?: boolean;
  migrationCompleted?: boolean;
  availableTenants: Array<{
    tenantId: string;
    role: UserRole;
    nameEn: string;
    nameAr: string;
  }>;
}

export interface PlatformSettings {
  id?: string;
  key: string;
  config: Record<string, unknown>;
  updatedBy: string;
  updatedAt?: string;
}

export interface PlatformAuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  platformRole?: PlatformRole | string;
  actorPlatformRole?: string;
  tenantId?: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  createdAt?: string;
}

export type BillingCycle = 'monthly' | 'annual';

export interface SubscriptionPlanLimits {
  maxCandidates: number;
  maxUsers: number;
  maxBatches: number;
  maxCertificates: number;
  maxCorporateClients?: number;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  recommended: boolean;
  isActive: boolean;
  displayOrder: number;
  featuresEn: string[];
  featuresAr: string[];
  limits: SubscriptionPlanLimits;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformSocialLinks {
  linkedin?: string;
  x?: string;
  youtube?: string;
  website?: string;
}

export interface PlatformPublicConfig {
  platformNameEn: string;
  platformNameAr: string;
  subtitleEn: string;
  subtitleAr: string;
  logoDataUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentVioletColor: string;
  heroHeadlineEn: string;
  heroHeadlineAr: string;
  heroSubheadlineEn: string;
  heroSubheadlineAr: string;
  recommendedPlanCode: string;
  contactEmail: string;
  contactPhone: string;
  addressEn: string;
  addressAr: string;
  copyrightEn: string;
  copyrightAr: string;
  socialLinks: PlatformSocialLinks;
  privacyContentEn: string;
  privacyContentAr: string;
  termsContentEn: string;
  termsContentAr: string;
  cookiesContentEn: string;
  cookiesContentAr: string;
  dataProtectionContentEn: string;
  dataProtectionContentAr: string;
}

export interface PlatformLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  subject: string;
  message: string;
  preferredLanguage: LanguageCode;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt?: string;
  updatedAt?: string;
}

export interface PendingTenantRegistration {
  id?: string;
  ownerUid: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerMobile: string;
  proposedTenantId: string;
  nameEn: string;
  nameAr: string;
  legalName?: string;
  crNumber?: string;
  vatNumber?: string;
  country: string;
  city?: string;
  address?: string;
  website?: string;
  companyEmail: string;
  companyPhone: string;
  planCode: string;
  billingCycle: BillingCycle;
  defaultLanguage: LanguageCode;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id?: string;
  uid: string;
  tenantId?: string;
  platformRole?: PlatformRole | null;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  organizationId?: string;
  trainerId?: string;
  candidateId?: string;
  permissions?: Partial<PermissionMatrix>;
  preferredLanguage: LanguageCode;
  status: 'active' | 'suspended';
  lastLoginAt?: string;
  lastAuthTime?: number;
  authProvider?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserInvite {
  id: string;
  tenantId?: string;
  email: string;
  displayName?: string;
  role: UserRole;
  organizationId?: string;
  trainerId?: string;
  candidateId?: string;
  status: 'pending' | 'claimed' | 'revoked';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanySettings {
  id?: string;
  tenantId?: string;
  nameEn: string;
  nameAr: string;
  legalName?: string;
  crNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoFileId?: string;
  stampFileId?: string;
  signatoryName?: string;
  signatureFileId?: string;
  primaryColor: string;
  secondaryColor: string;
  certificateFooter?: string;
  cardFooter?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Candidate {
  id: string;
  tenantId?: string;
  candidateId: string;
  userId?: string;
  fullNameEn: string;
  fullNameAr: string;
  gender?: 'male' | 'female';
  iqamaMasked?: string;
  iqamaNumber?: string;
  iqamaExpiryDate?: string;
  passportMasked?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  nationality: string;
  dateOfBirth?: string;
  mobile: string;
  email?: string;
  organizationId?: string;
  companyName?: string;
  employeeId?: string;
  jobTitle?: string;
  department?: string;
  workLocation?: string;
  address?: string;
  emergencyContact?: string;
  notes?: string;
  photoFileId?: string;
  registrationDate: string;
  status: 'active' | 'inactive' | 'archived' | 'suspended';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  enrolledCoursesCount?: number;
  issuedCertificatesCount?: number;
}

export interface CandidateDocument {
  id: string;
  tenantId?: string;
  candidateDocId: string;
  candidateId: string;
  organizationId?: string;
  documentType: 'photo' | 'iqama_copy' | 'passport_copy' | 'additional';
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadedBy: string;
  createdAt?: string;
}

export interface Organization {
  id: string;
  tenantId?: string;
  organizationId: string;
  nameEn: string;
  nameAr: string;
  crNumber?: string;
  vatNumber?: string;
  contactPerson: string;
  contactDesignation?: string;
  mobile: string;
  email: string;
  address?: string;
  city?: string;
  billingInfo?: string;
  notes?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CourseType =
  | 'theoretical'
  | 'practical'
  | 'blended'
  | 'certification'
  | 'refresher';

export interface Course {
  id: string;
  tenantId?: string;
  courseId: string;
  courseCode: string;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  category: string;
  courseType?: CourseType;
  duration: number;
  durationUnit: 'hours' | 'days' | 'weeks';
  theoryHours?: number;
  practicalHours?: number;
  fee?: number;
  minAttendancePct: number;
  minExamScore: number;
  examRequired: boolean;
  practicalRequired: boolean;
  validityMonths?: number;
  prerequisites?: string;
  imageFileId?: string;
  supportingDocIds?: string[];
  defaultCertificateTemplateId?: string;
  defaultCardTemplateId?: string;
  status: 'active' | 'inactive' | 'archived';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TrainerEmploymentStatus =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance';

export interface Trainer {
  id: string;
  tenantId?: string;
  trainerId: string;
  userId?: string;
  nameEn: string;
  nameAr: string;
  mobile: string;
  email: string;
  nationality?: string;
  qualifications?: string;
  certifications?: string;
  specialization: string;
  experienceYears?: number;
  employmentStatus?: TrainerEmploymentStatus;
  photoFileId?: string;
  credentialFileIds?: string[];
  assignedCourseIds?: string[];
  status: 'active' | 'inactive' | 'archived';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TrainingMode = 'classroom' | 'practical' | 'online' | 'hybrid';

export interface Batch {
  id: string;
  tenantId?: string;
  batchId: string;
  batchNumber: string;
  batchName?: string;
  courseId: string;
  trainerId: string;
  trainerUserId?: string;
  venue: string;
  trainingMode?: TrainingMode;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  minParticipants?: number;
  enrollmentCount: number;
  enrollmentClosed?: boolean;
  notes?: string;
  cancellationReason?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EnrollmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'withdrawn';

export interface Enrollment {
  id: string;
  tenantId?: string;
  enrollmentNumber: string;
  candidateDocId: string;
  candidateId: string;
  candidateUserId?: string;
  organizationId?: string;
  courseId: string;
  batchId: string;
  trainerId?: string;
  trainerUserId?: string;
  status: EnrollmentStatus;
  trainerRecommended?: boolean;
  trainerRecommendedBy?: string;
  completionApproved?: boolean;
  completionApprovedBy?: string;
  trainingCardId?: string;
  certificateId?: string;
  capacityOverride?: boolean;
  capacityOverrideReason?: string;
  capacityOverrideBy?: string;
  prerequisiteConfirmed?: boolean;
  notes?: string;
  requestedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EnrollmentRequestStatus =
  | 'pending_review'
  | 'info_requested'
  | 'approved'
  | 'rejected';

export interface EnrollmentRequest {
  id: string;
  tenantId?: string;
  requestNumber: string;
  organizationId: string;
  organizationNameEn?: string;
  organizationNameAr?: string;
  candidateDocIds: string[];
  courseId: string;
  preferredBatchId?: string;
  assignedBatchId?: string;
  requestNotes?: string;
  missingInfoNotes?: string;
  corporateResponseNotes?: string;
  decisionReason?: string;
  status: EnrollmentRequestStatus;
  requestedBy: string;
  requestedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  decisionDate?: string;
  createdEnrollmentIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceSubmissionStatus = 'draft' | 'submitted';

export interface AttendanceRecord {
  id: string;
  tenantId?: string;
  batchId: string;
  enrollmentId: string;
  candidateDocId: string;
  organizationId?: string;
  trainerUserId?: string;
  date: string;
  status: AttendanceStatus;
  remarks?: string;
  markedBy: string;
  submissionStatus?: AttendanceSubmissionStatus;
  submittedAt?: string;
  submittedBy?: string;
  correctedBy?: string;
  correctionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AssessmentType = 'written' | 'practical' | 'oral' | 'trainer_eval' | 'pass_fail';
export type AssessmentRecordStatus = 'recorded' | 'pending_correction' | 'approved';

export interface AssessmentRecord {
  id: string;
  tenantId?: string;
  assessmentNumber?: string;
  enrollmentId: string;
  candidateDocId: string;
  organizationId?: string;
  courseId: string;
  batchId: string;
  trainerUserId?: string;
  assessmentType: AssessmentType;
  attemptNumber: number;
  maxMarks: number;
  obtainedMarks: number;
  percentage?: number;
  passingScore: number;
  result: 'pass' | 'fail';
  remarks?: string;
  assessorId: string;
  assessorName?: string;
  assessmentDate: string;
  assessmentStatus?: AssessmentRecordStatus;
  correctionReason?: string;
  correctedMarks?: number;
  correctedResult?: 'pass' | 'fail';
  correctionRequestedBy?: string;
  approvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompletionEligibility {
  eligible: boolean;
  enrollmentConfirmed: boolean;
  trainingCompleted: boolean;
  totalSessions?: number;
  sessionsAttended?: number;
  sessionsMissed?: number;
  attendancePct: number;
  minAttendancePct: number;
  attendanceMet: boolean;
  examRequired?: boolean;
  practicalRequired?: boolean;
  examPassed: boolean;
  practicalPassed: boolean;
  assessmentStatusLabel?: 'not_required' | 'passed' | 'failed' | 'pending';
  overallProgressPct?: number;
  trainerRecommended: boolean;
  completionApproved: boolean;
  reasons: string[];
}

export interface TrainingCard {
  id: string;
  tenantId?: string;
  cardSerialNumber: string;
  enrollmentId: string;
  candidateDocId: string;
  candidateId: string;
  candidateUserId?: string;
  organizationId?: string;
  courseId: string;
  batchId: string;
  templateId?: string;
  templateName?: string;
  templateVersion?: number;
  qrTokenHash: string;
  pdfFileId: string;
  version: number;
  status: 'active' | 'superseded' | 'revoked';
  snapshot: {
    candidateNameEn: string;
    candidateNameAr: string;
    iqamaMasked: string;
    courseTitleEn: string;
    courseTitleAr: string;
    courseCode: string;
    batchNumber: string;
    startDate: string;
    endDate: string;
    companyNameEn: string;
    companyNameAr: string;
    photoFileId?: string;
    trainerNameEn?: string;
    trainerNameAr?: string;
    venue?: string;
    cardTitleEn?: string;
    cardTitleAr?: string;
    companyLogoFileId?: string;
    stampFileId?: string;
    signatureFileId?: string;
    signatoryName?: string;
    templateWidthMm?: number;
    templateHeightMm?: number;
    templateConfigSnapshot?: CardTemplateConfig;
  };
  generatedBy: string;
  createdAt?: string;
}

export interface Certificate {
  id: string;
  tenantId?: string;
  certificateNumber: string;
  enrollmentId: string;
  candidateDocId: string;
  candidateId: string;
  candidateUserId?: string;
  organizationId?: string;
  courseId: string;
  batchId: string;
  templateId?: string;
  templateVersion?: number;
  tokenHash: string;
  pdfFileId: string;
  issueDate: string;
  completionDate: string;
  expiryDate?: string;
  status: 'valid' | 'expired' | 'revoked' | 'superseded';
  revocationReason?: string;
  revokedBy?: string;
  supersededBy?: string;
  issuedBy: string;
  snapshot: {
    candidateNameEn: string;
    candidateNameAr: string;
    courseTitleEn: string;
    courseTitleAr: string;
    courseCode: string;
    batchNumber?: string;
    durationLabelEn: string;
    durationLabelAr: string;
    startDate: string;
    completionDate: string;
    trainerNameEn: string;
    trainerNameAr: string;
    signatoryName: string;
    companyNameEn: string;
    companyNameAr: string;
    photoFileId?: string;
    certificateTitleEn?: string;
    certificateTitleAr?: string;
    companyLogoFileId?: string;
    stampFileId?: string;
    signatureFileId?: string;
    templateName?: string;
    templateOrientation?: 'landscape' | 'portrait';
    templateConfigSnapshot?: CertificateTemplateConfig;
    issuedByName?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type CertLanguageMode = 'bilingual' | 'en' | 'ar';
export type CertElementType = 'text' | 'logo' | 'photo' | 'qr' | 'signature' | 'stamp';
export type CertFieldKey =
  | 'customText'
  | 'centerName'
  | 'centerNameAr'
  | 'certTitle'
  | 'certTitleAr'
  | 'subHeadingEn'
  | 'subHeadingAr'
  | 'candidateNameEn'
  | 'candidateNameAr'
  | 'candidateId'
  | 'courseTitleEn'
  | 'courseTitleAr'
  | 'courseCode'
  | 'duration'
  | 'startDate'
  | 'completionDate'
  | 'issueDate'
  | 'expiryDate'
  | 'trainerName'
  | 'signatoryName'
  | 'certificateNumber'
  | 'footerText';

export interface CertCanvasElement {
  id: string;
  type: CertElementType;
  fieldKey?: CertFieldKey;
  label?: string;
  customText?: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontFamily?: 'sans' | 'arabic' | 'mono';
  color?: string;
  align?: 'left' | 'center' | 'right';
  visible: boolean;
}

export interface CertificateTemplateConfig {
  headingEn: string;
  headingAr: string;
  subHeadingEn: string;
  subHeadingAr: string;
  accentColor: string;
  borderColor: string;
  borderStyle: 'classic' | 'modern' | 'minimal';
  showLogo: boolean;
  showStamp: boolean;
  showSignature: boolean;
  showQr: boolean;
  showArabic: boolean;
  showEnglish: boolean;
  showCandidatePhoto?: boolean;
  footerText: string;
  backgroundStyle: 'clean' | 'tinted' | 'framed';
  languageMode?: CertLanguageMode;
  backgroundPresetId?: string;
  backgroundImageFileId?: string;
  customLogoFileId?: string;
  customSignatureFileId?: string;
  customStampFileId?: string;
  useCustomLayout?: boolean;
  elements?: CertCanvasElement[];
}

export interface CertificateTemplate {
  id: string;
  tenantId?: string;
  name: string;
  scope: 'common' | 'course';
  courseId?: string;
  orientation: 'landscape' | 'portrait';
  languageMode?: CertLanguageMode;
  version: number;
  isDefault: boolean;
  isActive?: boolean;
  config: CertificateTemplateConfig;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CardLanguageMode = 'bilingual' | 'en' | 'ar';
export type CardElementType = 'text' | 'logo' | 'photo' | 'qr' | 'signature' | 'stamp';
export type CardFieldKey =
  | 'customText'
  | 'centerName'
  | 'centerNameAr'
  | 'cardTitle'
  | 'candidateNameEn'
  | 'candidateNameAr'
  | 'candidateId'
  | 'iqamaMasked'
  | 'courseTitleEn'
  | 'courseTitleAr'
  | 'courseCode'
  | 'batchNumber'
  | 'trainerName'
  | 'startDate'
  | 'endDate'
  | 'trainingDates'
  | 'venue'
  | 'cardSerialNumber';

export interface CardCanvasElement {
  id: string;
  side: 'front' | 'back';
  type: CardElementType;
  fieldKey?: CardFieldKey;
  label?: string;
  customText?: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontFamily?: 'sans' | 'arabic' | 'mono';
  color?: string;
  align?: 'left' | 'center' | 'right';
  visible: boolean;
}

export interface CardTemplateConfig {
  headerColor: string;
  accentColor: string;
  backgroundColor: string;
  logoPosition: 'top-left' | 'top-right' | 'top-center';
  photoPosition: 'left' | 'right';
  qrPosition: 'front-bottom' | 'back-center';
  showBackSide: boolean;
  showMaskedIqama: boolean;
  showDates: boolean;
  footerText: string;
  languageMode?: CardLanguageMode;
  cardTitleEn?: string;
  cardTitleAr?: string;
  backgroundPresetId?: string;
  backgroundImageFileId?: string;
  showSignature?: boolean;
  showStamp?: boolean;
  showTrainer?: boolean;
  showVenue?: boolean;
  useCustomLayout?: boolean;
  elements?: CardCanvasElement[];
}

export interface CardTemplate {
  id: string;
  tenantId?: string;
  name: string;
  scope: 'common' | 'course';
  courseId?: string;
  languageMode?: CardLanguageMode;
  widthMm: number;
  heightMm: number;
  version: number;
  isDefault: boolean;
  isActive?: boolean;
  config: CardTemplateConfig;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type NotificationCategory =
  | 'candidate_registration'
  | 'enrollment_confirmation'
  | 'training_schedule'
  | 'training_reminder'
  | 'training_card_delivery'
  | 'attendance_notification'
  | 'examination_schedule'
  | 'examination_result'
  | 'certificate_issuance'
  | 'certificate_pdf_delivery'
  | 'certificate_expiry_reminder';

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'whatsapp_manual';

export type DeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'retry_required'
  | 'manual_initiated';

export interface NotificationChannelPref {
  email: boolean;
  whatsapp: boolean;
  inApp: boolean;
}

export interface NotificationPreferences {
  enableAutoEmail: boolean;
  enableAutoWhatsapp: boolean;
  enableInApp: boolean;
  defaultRetryLimit: number;
  expiryReminderDaysBefore: number;
  autoCategories: Record<NotificationCategory, NotificationChannelPref>;
}

export interface IntegrationSettingsPublic {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  smtpSenderName?: string;
  hasSmtpPass: boolean;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId?: string;
  whatsappApiVersion: string;
  hasWhatsappToken: boolean;
  hasWebhookVerifyToken?: boolean;
  hasWhatsappAppSecret?: boolean;
  notificationPreferences?: NotificationPreferences;
}

export interface MessageTemplate {
  id: string;
  tenantId?: string;
  code: string;
  category: NotificationCategory;
  nameEn: string;
  nameAr: string;
  subjectEn: string;
  subjectAr: string;
  bodyEn: string;
  bodyAr: string;
  whatsappTemplateName?: string;
  whatsappLanguageEn?: string;
  whatsappLanguageAr?: string;
  useApprovedMetaTemplate?: boolean;
  placeholders?: string[];
  isActive: boolean;
  updatedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  tenantId?: string;
  targetUserId?: string;
  targetRole?: string;
  organizationId?: string;
  type: string;
  category?: NotificationCategory;
  channel?: NotificationChannel;
  deliveryStatus?: DeliveryStatus;
  recipient?: string;
  candidateDocId?: string;
  candidateId?: string;
  enrollmentId?: string;
  trainingCardId?: string;
  certificateId?: string;
  attachmentFileId?: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  read: boolean;
  createdAt?: string;
}

export interface AuditLogItem {
  id: string;
  tenantId?: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  createdAt?: string;
}

export interface DeliveryLogItem {
  id: string;
  tenantId?: string;
  channel: NotificationChannel;
  recipient: string;
  recipientName?: string;
  messageType: string;
  category?: NotificationCategory;
  templateId?: string;
  language?: 'en' | 'ar' | 'bilingual';
  titleEn?: string;
  titleAr?: string;
  messagePreview?: string;
  providerMessageId?: string;
  deliveryStatus: DeliveryStatus;
  failureReason?: string;
  providerStatusDetails?: string;
  entityId?: string;
  candidateDocId?: string;
  candidateId?: string;
  enrollmentId?: string;
  trainingCardId?: string;
  certificateId?: string;
  organizationId?: string;
  attachmentFileId?: string;
  manualUrl?: string;
  retryCount?: number;
  lastRetryAt?: string;
  deliveredAt?: string;
  sentBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VerificationLogItem {
  id: string;
  tenantId?: string;
  mode: 'public' | 'internal';
  query: string;
  resultStatus: string;
  certificateNumber?: string;
  actorUid?: string;
  createdAt?: string;
}

export type ExcelTemplateType =
  | 'candidates'
  | 'corporate_employees'
  | 'enrollment_requests'
  | 'enrollments'
  | 'attendance'
  | 'courses'
  | 'trainers';

export type ImportJobStatus =
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export interface ImportDuplicateMatch {
  idType: 'iqama' | 'passport' | 'in_file' | 'attendance_locked' | 'attendance_existing' | 'enrollment_existing' | 'course_code' | 'trainer_email';
  candidateDocId?: string;
  candidateId?: string;
  fullNameEn?: string;
  fullNameAr?: string;
  companyName?: string;
  organizationId?: string;
  iqamaMasked?: string;
  passportMasked?: string;
  sameOrganization: boolean;
  canUpdate: boolean;
  existingRecordId?: string;
  existingDetails?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: 'valid' | 'duplicate' | 'invalid';
  missingFields: string[];
  formatErrors: string[];
  duplicateDetails: ImportDuplicateMatch[];
  errors: string[];
  mapped: Record<string, string>;
  skip?: boolean;
  duplicateAction?: 'skip' | 'update';
  explicitUpdateConfirmed?: boolean;
}

export interface ImportValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  missingRequiredRows: number;
  formatErrorRows: number;
  skippedRows: number;
}

export interface ImportJob {
  id: string;
  tenantId?: string;
  jobId: string;
  importType: ExcelTemplateType;
  organizationId?: string;
  fileName: string;
  uploadedByName?: string;
  uploadedByEmail?: string;
  totalRows: number;
  importedCount: number;
  updatedCount?: number;
  duplicateCount: number;
  invalidCount: number;
  skippedCount: number;
  failedCount: number;
  status: ImportJobStatus;
  createdBy: string;
  createdAt?: string;
}

export type ExcelExportDatasetKey =
  | 'candidates'
  | 'courses'
  | 'batches'
  | 'enrollments'
  | 'attendance'
  | 'assessments'
  | 'certificates'
  | 'corporate_employees';

export interface PublicVerificationResult {
  found: boolean;
  tenantId?: string;
  status: 'valid' | 'expired' | 'revoked' | 'superseded' | 'not_found';
  certificateNumber?: string;
  candidateNameEn?: string;
  candidateNameAr?: string;
  courseTitleEn?: string;
  courseTitleAr?: string;
  completionDate?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingCenterEn?: string;
  issuingCenterAr?: string;
  supersededBy?: string;
}

export const ROLE_NAV_PERMISSIONS: Record<UserRole, ModuleKey[]> = {
  tenant_owner: [
    'dashboard',
    'candidates',
    'corporate_clients',
    'courses',
    'trainers',
    'batches',
    'enrollments',
    'attendance',
    'assessments',
    'training_cards',
    'certificates',
    'verification',
    'certificate_templates',
    'card_templates',
    'excel_import_export',
    'notifications',
    'reports',
    'user_management',
    'audit_logs',
    'company_settings',
  ],
  tenant_admin: [
    'dashboard',
    'candidates',
    'corporate_clients',
    'courses',
    'trainers',
    'batches',
    'enrollments',
    'attendance',
    'assessments',
    'training_cards',
    'certificate_templates',
    'card_templates',
    'verification',
    'excel_import_export',
    'notifications',
    'reports',
    'user_management',
  ],
  super_admin: [
    'dashboard',
    'candidates',
    'corporate_clients',
    'courses',
    'trainers',
    'batches',
    'enrollments',
    'attendance',
    'assessments',
    'training_cards',
    'certificates',
    'verification',
    'certificate_templates',
    'card_templates',
    'excel_import_export',
    'notifications',
    'reports',
    'user_management',
    'audit_logs',
    'company_settings',
  ],
  admin: [
    'dashboard',
    'candidates',
    'corporate_clients',
    'courses',
    'trainers',
    'batches',
    'enrollments',
    'attendance',
    'assessments',
    'training_cards',
    'certificate_templates',
    'card_templates',
    'verification',
    'excel_import_export',
    'notifications',
    'reports',
    'user_management',
  ],
  certificate_officer: [
    'dashboard',
    'enrollments',
    'attendance',
    'assessments',
    'certificates',
    'verification',
    'excel_import_export',
    'notifications',
    'reports',
  ],
  trainer: [
    'dashboard',
    'candidates',
    'courses',
    'trainers',
    'batches',
    'enrollments',
    'attendance',
    'assessments',
    'training_cards',
    'excel_import_export',
    'notifications',
  ],
  corporate_client: [
    'dashboard',
    'corporate_clients',
    'candidates',
    'courses',
    'batches',
    'enrollments',
    'attendance',
    'training_cards',
    'certificates',
    'excel_import_export',
    'notifications',
    'reports',
  ],
  candidate: [
    'dashboard',
    'candidates',
    'enrollments',
    'training_cards',
    'certificates',
    'notifications',
  ],
};

export const DEFAULT_COURSE_CATEGORIES = [
  'Industrial Safety',
  'Fire Safety',
  'First Aid',
  'Occupational Health and Safety',
  'Technical Training',
  'Construction Safety',
  'Defensive Driving',
  'Electrical Safety',
  'Environmental Safety',
  'Specialized Industrial Courses',
];
