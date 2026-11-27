/**
 * Phase 1 Multi-Tenant SaaS Security Test Specification for TCMS Firestore Rules.
 * Verifies the "Dirty Dozen" + Multi-Tenant SaaS isolation adversarial payloads
 * against the expected rule invariants.
 * Run against Firebase Emulator when available (`FIRESTORE_EMULATOR_HOST`).
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actorRole: string;
  actorTenantId?: string;
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation on Signup',
    collection: 'users/attacker_uid',
    operation: 'create',
    actorRole: 'unprivileged_new_user',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      role: 'tenant_owner',
      platformRole: 'platform_super_admin',
    },
  },
  {
    id: 2,
    name: 'Role Self-Upgrade via Profile Update',
    collection: 'users/cand_uid',
    operation: 'update',
    actorRole: 'candidate',
    expected: 'PERMISSION_DENIED',
    payload: { role: 'certificate_officer' },
  },
  {
    id: 3,
    name: 'Ghost Field Injection (Shadow Update)',
    collection: 'candidates/cand_1',
    operation: 'create',
    actorRole: 'tenant_admin',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'tenant_default', candidateId: 'CAND-2026-0001', isBypassed: true },
  },
  {
    id: 4,
    name: 'Unverified Email Bypass',
    collection: 'candidates/cand_1',
    operation: 'create',
    actorRole: 'unverified_email_admin',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Tenant Corporate Read',
    collection: 'candidates/cand_org2',
    operation: 'get',
    actorRole: 'corporate_client(ORG-0001)',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cross-Tenant Corporate List Scrape',
    collection: 'candidates',
    operation: 'list',
    actorRole: 'corporate_client(ORG-0001)',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Candidate Unauthorized Certificate Issuance',
    collection: 'certificates/cert_fake',
    operation: 'create',
    actorRole: 'candidate',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'tenant_default', certificateNumber: 'CERT-2026-9999', status: 'valid' },
  },
  {
    id: 8,
    name: 'Audit Log & Platform Audit Log Tampering',
    collection: 'auditLogs/log_1',
    operation: 'delete',
    actorRole: 'tenant_admin',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Public Verification Scraping',
    collection: 'publicVerifications',
    operation: 'list',
    actorRole: 'unauthenticated',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning Attack',
    collection: 'courses/' + 'A'.repeat(200),
    operation: 'create',
    actorRole: 'tenant_admin',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Timestamp Forgery',
    collection: 'courses/crs_1',
    operation: 'create',
    actorRole: 'tenant_admin',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'tenant_default', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 12,
    name: 'System Settings Secret Exfiltration',
    collection: 'systemSettings/tenant_default_integrations',
    operation: 'get',
    actorRole: 'trainer',
    actorTenantId: 'tenant_default',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Cross-Tenant Business Record Read (Tenant Alpha -> Tenant Beta)',
    collection: 'candidates/ten_beta_cand_1',
    operation: 'get',
    actorRole: 'tenant_owner',
    actorTenantId: 'ten_alpha',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 14,
    name: 'Cross-Tenant Write Forgery (Tenant Admin writing foreign tenantId)',
    collection: 'courses/ten_beta_crs_hijack',
    operation: 'create',
    actorRole: 'tenant_admin',
    actorTenantId: 'ten_alpha',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'ten_beta', courseId: 'CRS-HIJACK', titleEn: 'Hijacked Course' },
  },
  {
    id: 15,
    name: 'Unauthorized SaaS Tenant Provisioning by Tenant Owner',
    collection: 'saasTenants/ten_rogue',
    operation: 'create',
    actorRole: 'tenant_owner',
    actorTenantId: 'ten_alpha',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'ten_rogue', tenantCode: 'TEN-9999', nameEn: 'Rogue Center', status: 'active' },
  },
  {
    id: 16,
    name: 'Unauthorized Cross-Tenant Membership Forgery',
    collection: 'tenantMemberships/ten_beta__attacker_uid',
    operation: 'create',
    actorRole: 'candidate',
    actorTenantId: 'ten_alpha',
    expected: 'PERMISSION_DENIED',
    payload: { tenantId: 'ten_beta', uid: 'attacker_uid', email: 'attacker@example.com', role: 'tenant_owner', status: 'active' },
  },
];
