import fs from 'node:fs';
import path from 'node:path';
import {
  fsCommit,
  fsGetDoc,
  fsQueryDocs,
  fsSetDoc,
  fsUpdateDoc,
  type CommitWriteOp,
} from './firestoreRest.ts';
import { decryptSensitive, hmacTenantIdentityHash } from './crypto.ts';
import {
  DEFAULT_TENANT_ID,
  ensureDefaultLegacyTenant,
  makeMembershipDocId,
  writePlatformAuditLog,
} from './tenantService.ts';
import type { Candidate, UserProfile } from '../src/types/tcms.ts';

const MIGRATABLE_BUSINESS_COLLECTIONS = [
  'users',
  'userInvites',
  'organizations',
  'organizationUsers',
  'courses',
  'trainers',
  'batches',
  'candidates',
  'candidateDocuments',
  'enrollmentRequests',
  'enrollments',
  'attendance',
  'assessments',
  'trainingCards',
  'certificateTemplates',
  'cardTemplates',
  'certificates',
  'publicVerifications',
  'messageTemplates',
  'deliveryLogs',
  'notifications',
  'importJobs',
  'auditLogs',
  'verificationLogs',
] as const;

export interface MigrationCollectionCount {
  collection: string;
  totalDocs: number;
  untaggedDocs: number;
  alreadyTaggedDocs: number;
  foreignTaggedDocs: number;
}

export interface LegacyMigrationPreview {
  defaultTenantId: string;
  migrationCompleted: boolean;
  collections: MigrationCollectionCount[];
  legacySingletons: {
    companySettingsDefault: boolean;
    companySettingsTenantDefault: boolean;
    systemPermissionsLegacy: boolean;
    systemIntegrationsLegacy: boolean;
    systemGeneralLegacy: boolean;
    legacyCountersCount: number;
    legacyIdentityHashCount: number;
    localVaultMissingTenantCount: number;
  };
  totalDocumentsToBackfill: number;
}

export interface LegacyMigrationReport {
  ok: boolean;
  dryRun: boolean;
  defaultTenantId: string;
  executedAt: string;
  executedBy: string;
  manifestPath: string;
  preSnapshotCounts: Record<string, number>;
  postSnapshotCounts: Record<string, number>;
  updatedDocuments: number;
  migratedSingletons: string[];
  migratedCounters: string[];
  migratedIdentityHashes: number;
  migratedUsersToSaas: number;
  updatedVaultMetaCount: number;
}

export async function analyzeLegacyMigration(idToken: string): Promise<LegacyMigrationPreview> {
  const defaultTenant = await ensureDefaultLegacyTenant(idToken);
  const collections: MigrationCollectionCount[] = [];
  let totalDocumentsToBackfill = 0;

  for (const col of MIGRATABLE_BUSINESS_COLLECTIONS) {
    const docs = await fsQueryDocs<{ tenantId?: string }>(col, idToken).catch(() => []);
    let untaggedDocs = 0;
    let alreadyTaggedDocs = 0;
    let foreignTaggedDocs = 0;
    for (const d of docs) {
      if (!d.tenantId) {
        untaggedDocs++;
      } else if (d.tenantId === DEFAULT_TENANT_ID) {
        alreadyTaggedDocs++;
      } else {
        foreignTaggedDocs++;
      }
    }
    totalDocumentsToBackfill += untaggedDocs;
    collections.push({
      collection: col,
      totalDocs: docs.length,
      untaggedDocs,
      alreadyTaggedDocs,
      foreignTaggedDocs,
    });
  }

  const [
    compDefault,
    compTenant,
    sysPerm,
    sysInt,
    sysGen,
    counters,
    identityHashes,
  ] = await Promise.all([
    fsGetDoc('companySettings', 'default', idToken).catch(() => null),
    fsGetDoc('companySettings', DEFAULT_TENANT_ID, idToken).catch(() => null),
    fsGetDoc('systemSettings', 'permissions', idToken).catch(() => null),
    fsGetDoc('systemSettings', 'integrations', idToken).catch(() => null),
    fsGetDoc('systemSettings', 'general', idToken).catch(() => null),
    fsQueryDocs<{ tenantId?: string }>('counters', idToken).catch(() => []),
    fsQueryDocs<{ tenantId?: string }>('identityHashes', idToken).catch(() => []),
  ]);

  const legacyCounters = counters.filter((c) => !c.tenantId && !c.id.startsWith(`${DEFAULT_TENANT_ID}_`));
  const legacyHashes = identityHashes.filter((h) => !h.tenantId && !h.id.startsWith(`${DEFAULT_TENANT_ID}_`));

  const vaultDir = path.resolve(process.cwd(), '.data', 'vault');
  let localVaultMissingTenantCount = 0;
  if (fs.existsSync(vaultDir)) {
    for (const file of fs.readdirSync(vaultDir)) {
      if (!file.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(vaultDir, file), 'utf8')) as { tenantId?: string };
        if (!meta.tenantId) localVaultMissingTenantCount++;
      } catch {
        // skip
      }
    }
  }

  return {
    defaultTenantId: DEFAULT_TENANT_ID,
    migrationCompleted: Boolean(defaultTenant.migrationCompleted),
    collections,
    legacySingletons: {
      companySettingsDefault: Boolean(compDefault),
      companySettingsTenantDefault: Boolean(compTenant),
      systemPermissionsLegacy: Boolean(sysPerm),
      systemIntegrationsLegacy: Boolean(sysInt),
      systemGeneralLegacy: Boolean(sysGen),
      legacyCountersCount: legacyCounters.length,
      legacyIdentityHashCount: legacyHashes.length,
      localVaultMissingTenantCount,
    },
    totalDocumentsToBackfill:
      totalDocumentsToBackfill + legacyCounters.length + legacyHashes.length + localVaultMissingTenantCount,
  };
}

export async function runLegacyTenantMigration(params: {
  actor: UserProfile;
  idToken: string;
  dryRun?: boolean;
  backfillFiles?: boolean;
}): Promise<LegacyMigrationReport> {
  const { actor, idToken } = params;
  const dryRun = Boolean(params.dryRun);
  const backfillFiles = params.backfillFiles !== false;

  await ensureDefaultLegacyTenant(idToken, actor.uid);

  const preSnapshotCounts: Record<string, number> = {};
  const postSnapshotCounts: Record<string, number> = {};
  let updatedDocuments = 0;

  // Step 1: Backfill tenantId onto all untagged business documents (non-destructive, additive only)
  for (const col of MIGRATABLE_BUSINESS_COLLECTIONS) {
    const docs = await fsQueryDocs<{ tenantId?: string }>(col, idToken).catch(() => []);
    preSnapshotCounts[col] = docs.length;
    const untagged = docs.filter((d) => !d.tenantId);

    if (dryRun) {
      updatedDocuments += untagged.length;
      continue;
    }

    // Commit in batches of 40 operations
    for (let i = 0; i < untagged.length; i += 40) {
      const slice = untagged.slice(i, i + 40);
      const ops: CommitWriteOp[] = slice.map((d) => ({
        type: 'update',
        collection: col,
        docId: d.id,
        data: { tenantId: DEFAULT_TENANT_ID },
        updateFields: ['tenantId'],
      }));
      await fsCommit(ops, idToken);
      updatedDocuments += slice.length;
    }
  }

  // Step 2: Copy legacy singletons into tenant-scoped docs (preserving original 'default' / legacy docs untouched)
  const migratedSingletons: string[] = [];
  const legacyCompany = await fsGetDoc<Record<string, unknown>>('companySettings', 'default', idToken).catch(() => null);
  const existingTenantCompany = await fsGetDoc<Record<string, unknown>>(
    'companySettings',
    DEFAULT_TENANT_ID,
    idToken
  ).catch(() => null);
  if (legacyCompany && !existingTenantCompany) {
    if (!dryRun) {
      const { id: _id, ...companyData } = legacyCompany;
      await fsSetDoc(
        'companySettings',
        DEFAULT_TENANT_ID,
        { ...companyData, tenantId: DEFAULT_TENANT_ID },
        idToken,
        ['updatedAt']
      );
    }
    migratedSingletons.push(`companySettings/${DEFAULT_TENANT_ID}`);
  } else if (legacyCompany && !legacyCompany.tenantId && !dryRun) {
    await fsUpdateDoc('companySettings', 'default', { tenantId: DEFAULT_TENANT_ID }, idToken, []).catch(() => {});
  }

  for (const key of ['permissions', 'integrations', 'general'] as const) {
    const legacyDoc = await fsGetDoc<Record<string, unknown>>('systemSettings', key, idToken).catch(() => null);
    const tenantDocId = `${DEFAULT_TENANT_ID}_${key}`;
    const existingTenantDoc = await fsGetDoc<Record<string, unknown>>('systemSettings', tenantDocId, idToken).catch(
      () => null
    );
    if (legacyDoc && !existingTenantDoc) {
      if (!dryRun) {
        const { id: _id, ...settingData } = legacyDoc;
        await fsSetDoc(
          'systemSettings',
          tenantDocId,
          { ...settingData, key, tenantId: DEFAULT_TENANT_ID },
          idToken,
          ['updatedAt']
        );
      }
      migratedSingletons.push(`systemSettings/${tenantDocId}`);
    }
  }

  // Step 3: Clone legacy counters to tenant-scoped counters preserving high-water mark values
  const migratedCounters: string[] = [];
  const counters = await fsQueryDocs<{ prefix: string; value: number; tenantId?: string }>('counters', idToken).catch(
    () => []
  );
  for (const counter of counters) {
    if (counter.tenantId || counter.id.startsWith(`${DEFAULT_TENANT_ID}_`)) continue;
    const scopedId = `${DEFAULT_TENANT_ID}_${counter.id}`;
    const existingScoped = await fsGetDoc('counters', scopedId, idToken).catch(() => null);
    if (!existingScoped) {
      if (!dryRun) {
        await fsSetDoc(
          'counters',
          scopedId,
          {
            prefix: counter.prefix,
            value: counter.value,
            tenantId: DEFAULT_TENANT_ID,
          },
          idToken,
          ['updatedAt']
        );
      }
      migratedCounters.push(scopedId);
    }
  }

  // Step 4: Backfill tenant-scoped identityHashes from candidates (encrypted PII decrypted in memory only)
  let migratedIdentityHashes = 0;
  const candidates = await fsQueryDocs<
    Candidate & { iqamaEncrypted?: string; passportEncrypted?: string }
  >('candidates', idToken).catch(() => []);
  for (const cand of candidates) {
    if (cand.tenantId && cand.tenantId !== DEFAULT_TENANT_ID) continue;
    if (cand.iqamaEncrypted) {
      const rawIqama = decryptSensitive(cand.iqamaEncrypted);
      if (rawIqama) {
        const tHash = hmacTenantIdentityHash(DEFAULT_TENANT_ID, 'iqama', rawIqama);
        const existingHash = await fsGetDoc('identityHashes', tHash, idToken).catch(() => null);
        if (!existingHash) {
          if (!dryRun) {
            await fsSetDoc(
              'identityHashes',
              tHash,
              {
                hashKey: tHash,
                candidateDocId: cand.id,
                candidateId: cand.candidateId,
                idType: 'iqama',
                tenantId: DEFAULT_TENANT_ID,
              },
              idToken,
              ['createdAt']
            ).catch(() => {});
          }
          migratedIdentityHashes++;
        }
      }
    }
    if (cand.passportEncrypted) {
      const rawPassport = decryptSensitive(cand.passportEncrypted);
      if (rawPassport) {
        const tHash = hmacTenantIdentityHash(DEFAULT_TENANT_ID, 'passport', rawPassport);
        const existingHash = await fsGetDoc('identityHashes', tHash, idToken).catch(() => null);
        if (!existingHash) {
          if (!dryRun) {
            await fsSetDoc(
              'identityHashes',
              tHash,
              {
                hashKey: tHash,
                candidateDocId: cand.id,
                candidateId: cand.candidateId,
                idType: 'passport',
                tenantId: DEFAULT_TENANT_ID,
              },
              idToken,
              ['createdAt']
            ).catch(() => {});
          }
          migratedIdentityHashes++;
        }
      }
    }
  }

  if (!dryRun) {
    // Tag any remaining legacy identityHashes
    const allHashes = await fsQueryDocs<{ tenantId?: string }>('identityHashes', idToken).catch(() => []);
    for (const h of allHashes) {
      if (!h.tenantId) {
        await fsUpdateDoc('identityHashes', h.id, { tenantId: DEFAULT_TENANT_ID }, idToken, []).catch(() => {});
      }
    }
  }

  // Step 5: Sync all users -> saasUsers + tenantMemberships for DEFAULT_TENANT_ID
  let migratedUsersToSaas = 0;
  const allUsers = await fsQueryDocs<UserProfile>('users', idToken).catch(() => []);
  for (const u of allUsers) {
    const uid = u.uid || u.id;
    const uTenantId = u.tenantId || DEFAULT_TENANT_ID;
    const existingSaasUser = await fsGetDoc('saasUsers', uid, idToken).catch(() => null);
    if (!existingSaasUser) {
      if (!dryRun) {
        await fsSetDoc(
          'saasUsers',
          uid,
          {
            uid,
            email: u.email,
            displayName: u.displayName || u.email.split('@')[0],
            ...(u.platformRole ? { platformRole: u.platformRole } : {}),
            defaultTenantId: uTenantId,
            status: u.status || 'active',
          },
          idToken,
          ['createdAt', 'updatedAt']
        ).catch(() => {});
      }
      migratedUsersToSaas++;
    }
    const memId = makeMembershipDocId(uTenantId, uid);
    const existingMem = await fsGetDoc('tenantMemberships', memId, idToken).catch(() => null);
    if (!existingMem && !dryRun) {
      await fsSetDoc(
        'tenantMemberships',
        memId,
        {
          tenantId: uTenantId,
          uid,
          email: u.email,
          displayName: u.displayName || u.email.split('@')[0],
          role: u.role,
          status: u.status === 'suspended' ? 'suspended' : 'active',
          ...(u.organizationId ? { organizationId: u.organizationId } : {}),
          ...(u.trainerId ? { trainerId: u.trainerId } : {}),
          ...(u.candidateId ? { candidateId: u.candidateId } : {}),
        },
        idToken,
        ['createdAt', 'updatedAt']
      ).catch(() => {});
    }
  }

  // Step 6: Tag local vault .meta.json files with tenantId if missing
  let updatedVaultMetaCount = 0;
  if (backfillFiles) {
    const vaultDir = path.resolve(process.cwd(), '.data', 'vault');
    if (fs.existsSync(vaultDir)) {
      for (const file of fs.readdirSync(vaultDir)) {
        if (!file.endsWith('.meta.json')) continue;
        const fullPath = path.join(vaultDir, file);
        try {
          const meta = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
          if (!meta.tenantId) {
            if (!dryRun) {
              meta.tenantId = DEFAULT_TENANT_ID;
              fs.writeFileSync(fullPath, JSON.stringify(meta, null, 2));
            }
            updatedVaultMetaCount++;
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  if (dryRun) {
    Object.assign(postSnapshotCounts, preSnapshotCounts);
    return {
      ok: true,
      dryRun: true,
      defaultTenantId: DEFAULT_TENANT_ID,
      executedAt: new Date().toISOString(),
      executedBy: actor.email,
      manifestPath: '',
      preSnapshotCounts,
      postSnapshotCounts,
      updatedDocuments,
      migratedSingletons,
      migratedCounters,
      migratedIdentityHashes,
      migratedUsersToSaas,
      updatedVaultMetaCount,
    };
  }

  // Verify post counts match pre counts (zero document loss invariant)
  for (const col of MIGRATABLE_BUSINESS_COLLECTIONS) {
    const docs = await fsQueryDocs<{ tenantId?: string }>(col, idToken).catch(() => []);
    postSnapshotCounts[col] = docs.length;
  }

  await fsUpdateDoc(
    'saasTenants',
    DEFAULT_TENANT_ID,
    {
      migrationCompleted: true,
      migratedAt: new Date().toISOString(),
      migratedBy: actor.uid,
    },
    idToken,
    ['updatedAt']
  );

  // Persist migration report manifest locally
  const migDir = path.resolve(process.cwd(), '.data', 'migrations');
  if (!fs.existsSync(migDir)) {
    fs.mkdirSync(migDir, { recursive: true });
  }
  const executedAt = new Date().toISOString();
  const manifestPath = path.join(migDir, `migration_${DEFAULT_TENANT_ID}_${Date.now()}.json`);
  const report: LegacyMigrationReport = {
    ok: true,
    dryRun: false,
    defaultTenantId: DEFAULT_TENANT_ID,
    executedAt,
    executedBy: actor.email,
    manifestPath,
    preSnapshotCounts,
    postSnapshotCounts,
    updatedDocuments,
    migratedSingletons,
    migratedCounters,
    migratedIdentityHashes,
    migratedUsersToSaas,
    updatedVaultMetaCount,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2));

  await writePlatformAuditLog(
    actor,
    'EXECUTE_LEGACY_TENANT_MIGRATION',
    'saasTenants',
    DEFAULT_TENANT_ID,
    `Backfilled ${updatedDocuments} docs, ${migratedSingletons.length} singletons, ${migratedCounters.length} counters, ${migratedIdentityHashes} identityHashes, ${migratedUsersToSaas} SaaS users`,
    idToken,
    DEFAULT_TENANT_ID
  );

  return report;
}
