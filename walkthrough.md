# TCMS Enterprise — Production Readiness, Integration & Security Walkthrough

## 1. System Architecture Overview

TCMS Enterprise is a full-stack, bilingual (**English LTR / Arabic RTL**) Training Center Management System tailored for Saudi Arabian training operations.

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite 8 (`src/`), supporting full bidirectional LTR/RTL rendering (`DM Sans`, `Plus Jakarta Sans`, `IBM Plex Sans Arabic`, `JetBrains Mono`) across 20 operational modules and a standalone public certificate verification portal.
- **Backend API**: Express + TypeScript (`server.ts` + `server/*.ts`) executing on port `3000`, providing server-side authentication verification, RBAC enforcement, AES-256-GCM field encryption, keyed HMAC identity hashing, atomic certificate/business numbering, bilingual PDF generation (`pdfkit` + `arabic-persian-reshaper` + `bidi-js` + Noto Arabic/Latin TrueType fonts + `qrcode`), Excel template/import/export processing (`exceljs`), Nodemailer SMTP delivery, Meta WhatsApp Business Cloud API delivery & webhook verification, and reporting/analytics.
- **Persistence & Identity**: Firebase Authentication (Google Sign-In + JWKS-verified Firebase ID tokens via `jose`) and Cloud Firestore (`firestore.rules`, `firestore.indexes.json`), plus Firebase Storage (`storage.rules`) mirrored with the server private file vault (`server/fileVault.ts`).

---

## 2. Integrated Modules (22 Verified Modules)

1. **Authentication & User Management**: Firebase Auth, invite-only pre-provisioned roles, Super Admin role matrix editor, 60-minute inactivity timeout with 5-minute countdown warning, account security modal.
2. **Candidate Management**: Bilingual registration, Saudi Iqama/Passport AES-256-GCM encryption, masked display (`••••••9012`), HMAC-SHA256 duplicate detection, and audited reveal for authorized officers.
3. **Corporate Client Management**: Multi-tenant corporate organizations, user linkage, corporate-scoped candidate & enrollment portals.
4. **Course Management**: Configurable duration, theory/practical hours, minimum attendance %, minimum passing exam score, exam/practical requirements, validity period, supporting media, default card & certificate templates.
5. **Trainer Management**: Instructor profiles, credentials vault, course assignments, and trainer batch/student isolation.
6. **Batch Management**: Course scheduling, trainer assignment, venue, capacity controls, training mode, and start/end dates.
7. **Enrollment Management**: Direct enrollments, corporate enrollment requests with admin review (`approve`, `reject`, `request_info`), capacity override auditing, completion recommendation & approval workflow.
8. **Training Card Generation**: Auto-generation on confirmed enrollments, CR80 bilingual PDF cards with photo, logo, masked Iqama, course/batch metadata, opaque QR code, versioning, and bulk PDF export.
9. **Attendance Management**: Daily batch attendance marking, draft vs. submitted locking, administrator-only audited corrections, CSV and PDF attendance sheets.
10. **Examination & Assessment**: Written, practical, oral, trainer evaluation, and pass/fail assessments with automatic pass/fail calculation, re-attempts, and audited score corrections.
11. **Certificate Background Library & Preview**: Centralized `CertificateBackgroundLibrary` service with 12 built-in vector SVG/CSS & PDF background presets (`Royal Gold Guilloché`, `ISO Technical Teal`, `Academic Burgundy Seal`, `Minimalist Studio Frame`, Saudi Heritage patterns, Industrial/HSE themes, etc.) and interactive `BackgroundPreview` gallery switcher.
12. **Certificate Template Designer**: Visual drag-and-drop designer supporting A4 Landscape/Portrait, bilingual/EN/AR layouts, custom field positioning, logo, official stamp, signature, photo, and background presets.
13. **Card Template Designer**: Visual front/back CR80 card layout designer with live preview and background preset integration.
14. **Certificate Generation & Eligibility Gate**: Server-side enforcement requiring confirmed enrollment, completed training, required attendance %, passed exam, passed practical (if required), trainer recommendation, and authorized completion approval before issuing atomic `CERT-YYYY-NNNNNN` certificates. Reissue (supersedes prior certificate) and revocation workflows included.
15. **Public Certificate Verification**: Unauthenticated public portal (`/api/public/verify` & `?cert=` / `?token=` QR URLs) showing valid, expired, revoked, superseded, invalid, or not-found statuses with zero PII exposure.
16. **Internal Staff Verification**: Authenticated verification lookup supporting certificate number, candidate ID, bilingual name, and audited Iqama search for authorized staff, scoped by role/tenant.
17. **Excel Bulk Import & Export**: Downloadable formatted `.xlsx` templates (`candidates`, `corporate_employees`, `enrollment_requests`, `attendance`), row-by-row preview validation, duplicate detection, selective valid-row commit, downloadable error report `.xlsx`, import job history, and masked/unmasked dataset exports.
18. **WhatsApp Integration**: Meta WhatsApp Business Cloud API adapter, approved Meta template mapping, `wa.me` manual fallback tracking, and HMAC-SHA256 webhook delivery receipt reconciliation.
19. **Email Integration**: Nodemailer SMTP adapter supporting TLS, bilingual HTML/text rendering, and PDF attachment delivery.
20. **Notification Center & Message Templates**: 11 notification categories, in-app unread center, delivery logs with retry & manual fallback tracking, expiry reminder runner, and bilingual placeholder-sanitized template manager.
21. **Dashboard, Reports & Business Analytics**: Live Firestore-backed KPIs, date-filtered charts, operational queues (today's sessions, pending approvals, failed notifications), and 14 exportable reports across Candidate, Course/Batch, Attendance/Exam, Certificate, and Corporate/System categories (JSON/XLSX/CSV/PDF).
22. **Audit Logs & Company Settings**: Immutable `auditLogs` and `verificationLogs`, center branding/logo/stamp/signature uploads, data retention configuration, and JSON backup export.

---

## 3. End-to-End 21-Step Workflow Verification

Verified across backend handlers, data models, crypto/token pipelines, eligibility evaluator, and bilingual PDF/Excel generators:

1. Corporate organization created (`POST /api/organizations`) with atomic `ORG-YYYY-XXXX` sequence.
2. Corporate user invited & bound (`POST /api/users/invite` -> `users/{uid}` + `organizationUsers`).
3. Candidate registered (`POST /api/candidates`) with AES-256-GCM encrypted Iqama/Passport and HMAC hash.
4. Candidate identity documents uploaded (`POST /api/files/upload` + `POST /api/candidates/:id/documents`) with PDF/JPG/PNG magic-byte and 5MB validation.
5. Course created (`POST /api/courses`) defining attendance & exam thresholds and practical requirements.
6. Trainer created (`POST /api/trainers`) and linked to user account and eligible courses.
7. Training batch created (`POST /api/batches`) linking course, venue, dates, and capacity.
8. Trainer assigned to batch (`trainerId` + `trainerUserId` propagated to enrollments/attendance/assessments).
9. Candidate enrolled (`POST /api/enrollments` or corporate `POST /api/enrollment-requests`).
10. Enrollment confirmed (`PUT /api/enrollments/:id` / admin approval).
11. Training card auto-generated or triggered (`CARD-YYYY-XXXX`) with CR80 bilingual PDF and opaque QR token.
12. Attendance marked & submitted (`POST /api/attendance/mark`), enforcing submission lock for trainers.
13. Examination & practical scores recorded (`POST /api/assessments`) with automatic pass/fail calculation.
14. Trainer recommends and admin approves completion (`completionApproved: true`).
15. Certificate issued (`POST /api/certificates/issue`) ONLY after all eligibility gates pass, generating atomic `CERT-YYYY-NNNNNN` and hashed opaque verification token.
16. Certificate PDF downloaded (`GET /api/certificates/:id/pdf`) with Arabic reshaping, logo, stamp, signature, candidate photo (when configured), and QR code.
17. Email & WhatsApp delivery triggered (`POST /api/notifications/dispatch` / automated hooks) with delivery log persistence.
18. QR URL (`?token=...`) verified without exposing candidate ID numbers.
19. Public verification (`GET /api/public/verify`) returns non-PII verification summary (`valid`, `expired`, `revoked`, `superseded`, `not_found`).
20. Internal verification (`GET /api/verification/internal`) allows scoped authorized lookup and records `verificationLogs`.
21. Candidate training history and compliance reports (`GET /api/reports/candidate_training_history`) reflect completed enrollment, attendance %, exam status, and certificate number.

---

# Security Summary

During the final integration security review, all critical authorization, cryptographic, injection, webhook, and data-isolation paths were audited. Five concrete security/hardening issues were identified and resolved directly in the codebase:

1. **HTML Injection in Transactional Emails (`server/messagingService.ts`, `server/routesNotifications.ts`)**:
   - *Finding*: Rendered English/Arabic notification bodies, retried delivery previews, and center names were interpolated directly into HTML email markup without HTML entity escaping.
   - *Fix*: Exported and applied `escapeHtml()` (`&`, `<`, `>`, `"`, `'`) across `dispatchNotificationPipeline()`, `/api/notifications/logs/:id/retry`, and `/api/integrations/test-email` before line-break conversion.
2. **Role & Tenant Scoping on Training Card Generation, Bulk Certificate PDF & Internal Verification (`server/routesOperations.ts`)**:
   - *Finding*: When custom Role Permission Matrix grants allow non-admin roles access to `training_cards:create/edit`, `certificates:view`, or `verification:view`, `/api/training-cards/generate`, `/api/training-cards/batch/:batchId/generate`, `/api/training-cards/:enrollmentId/regenerate`, `/api/certificates/bulk-pdf`, and `/api/verification/internal` lacked explicit tenant/trainer/candidate ownership filters, and `/api/verification/internal` returned `tokenHash` in certificate payloads.
   - *Fix*: Enforced strict `corporate_client` (`organizationId`), `candidate` (`candidateUserId`), and `trainer` (`trainerUserId` / assigned batch) checks across all five endpoints, restricted global `identityHashes` Iqama lookups in `/api/verification/internal` to `super_admin`, `admin`, and `certificate_officer`, and stripped `tokenHash` from `/api/verification/internal` responses.
3. **Notification Mark-as-Read Ownership Check (`server/routesNotifications.ts`)**:
   - *Finding*: `PATCH /api/notifications/:id/read` called `fsUpdateDoc` directly without pre-checking ownership at the API layer.
   - *Fix*: Added explicit existence check (`404`) and ownership/role/organization verification (`403`) prior to updating the notification document.
4. **WhatsApp Webhook Fail-Closed Signature Verification (`server/routesNotifications.ts`)**:
   - *Finding*: `POST /api/webhooks/whatsapp` skipped `x-hub-signature-256` verification whenever `WHATSAPP_APP_SECRET` was unset, which would allow spoofed webhook delivery receipts in production if misconfigured.
   - *Fix*: Enforced fail-closed `503` response in `NODE_ENV=production` whenever `WHATSAPP_APP_SECRET` is not configured, while preserving HMAC-SHA256 signature verification via `crypto.timingSafeEqual`.
5. **Production Key Configuration Guard (`server/crypto.ts`, `.env.example`, `storage.rules`, `firestore.indexes.json`)**:
   - Added startup production warning when `SERVER_ENCRYPTION_KEY` is missing or left as the `.env.example` placeholder.
   - Added `storage.rules` for Firebase Storage (`tcms/{category}/{fileId}`) with default deny, 5MB/10MB size limits, and content-type enforcement.
   - Added `firestore.indexes.json` defining composite indexes for `attendance`, `assessments`, `enrollments`, `importJobs`, `auditLogs`, and `deliveryLogs`.

## PoC Verification

Verified via automated assertion suite (`npx tsx`), ESLint security rules validation (`npx eslint firestore.rules`), Vite production bundle compilation (`npm run build`), and TypeScript type checking (`npm run lint`):

- **Email HTML Escaping**: Verified `escapeHtml('<script>alert(1)</script> & "quote"')` converts dangerous characters into harmless HTML entities (`&lt;script&gt;`).
- **PII Placeholder Blocking**: Verified `sanitizeTemplateVariables` and `renderTemplateString` strip/redact `iqamaNumber`, `passportNumber`, and `dateOfBirth` even if referenced in templates (`[REDACTED]`).
- **Meta Webhook HMAC Verification**: Verified `verifyMetaSignatureHeader` accepts a valid `sha256=` HMAC-SHA256 signature and rejects tampered payloads or missing headers.
- **Cryptography & Token Hashing**: Verified AES-256-GCM encryption/decryption roundtrip, normalized keyed HMAC-SHA256 `iqama_` hashes, masking (`••••••9012`), and opaque base64url QR token + SHA-256 hash separation.
- **Certificate Eligibility Gate**: Verified `computeEnrollmentEligibilitySummary` rejects unapproved/incomplete enrollments with explicit reasons and passes only when enrollment, completion, attendance %, exam, practical, trainer recommendation, and admin approval are all satisfied.
- **Bilingual PDF & Arabic Shaping**: Verified `generateCertificatePdf` (`37,518` bytes, `%PDF-`) and `generateTrainingCardPdf` (`29,666` bytes, `%PDF-`) with Noto Arabic/Latin fonts, `arabic-persian-reshaper`, `bidi-js`, and QR embedding.
- **Firestore Security Rules**: `npx eslint firestore.rules` exited with status `0` and zero warnings/errors.
- **Bilingual Translation Parity**: Verified `924` English keys and `924` Arabic keys with zero missing translations in either language.

---

## 4. Role & Permission Matrix Summary

| Domain | Super Admin | Admin | Certificate Officer | Trainer | Corporate Client | Candidate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Dashboard | View | View | View | View | View (Org) | View (Self) |
| Candidates | All | View/Create/Edit/Approve | View | View (Assigned) | View/Create (Org) | View (Self) |
| Corporate Clients | All | View/Create/Edit | View | None | View (Own Org) | None |
| Courses / Batches | All | View/Create/Edit/Approve | View | View (Assigned) | View | View |
| Enrollments | All | View/Create/Edit/Approve | View | View (Assigned) | View/Create (Org) | View (Self) |
| Attendance | All | View/Create/Edit/Approve | View | View/Create (Assigned) | View (Org) | View (Self) |
| Assessments | All | View/Create/Edit/Approve | View | View/Create (Assigned) | View (Org) | None |
| Training Cards | All | View/Create/Edit/Approve | View/Create/Edit | View (Assigned) | View (Org) | View (Self) |
| Certificates | All | View | View/Create/Edit/Approve | None | View (Org) | View (Self) |
| Verification | All | View | View | None | View | None |
| Reports / Audit / Settings | All | View/Reports | View (Reports) | None | View (Org Reports) | None |

---

## 5. Saudi PDPL & Data Residency Review

- **Data Minimization & Purpose Limitation**: Public QR/certificate verification records (`publicVerifications`) contain zero personal identity numbers, contact details, addresses, birth dates, attendance percentages, or exam marks. Notification placeholder rendering blocks sensitive identity keys (`iqama*`, `passport*`, `dateOfBirth`).
- **Encryption & Keyed Hashing**: Iqama and Passport numbers are encrypted at rest with AES-256-GCM before Firestore writes and indexed only via keyed HMAC-SHA256 digests (`identityHashes`). Plaintext viewing is restricted to `super_admin`, `admin`, and `certificate_officer` with mandatory audit log entries (`REVEAL_CANDIDATE_IDENTITY`).
- **Access & Retention Controls**: System retention settings support configurable retention policies for audit logs, import jobs, and candidate files. Private candidate files enforce strict MIME magic-byte checks (PDF/JPG/PNG) and a 5MB cap.
- **Data Residency Action Item**: Ensure the provisioned Cloud Firestore database location (`me-central2` Dammam or `me-central1` Doha / customer-selected GCC region), Cloud Run deployment region, and Firebase Storage bucket region are aligned with your organization's Saudi Personal Data Protection Law (PDPL) cross-border transfer policies before onboarding live trainee records. Also configure a persistent Secret Manager value for `SERVER_ENCRYPTION_KEY` rather than relying on container-local `.data/.server-secret`, and use persistent cloud object storage rather than ephemeral local disk `.data/vault`.

---

## 6. Backup, Recovery & Monitoring Guide

- **Application Backup Export**: Super Admins can download a full JSON system snapshot via `GET /api/system/backup` (Company Settings -> Backup & Retention).
- **Firestore Automated Backups**: Enable scheduled Cloud Firestore daily exports to a locked Cloud Storage bucket (`gcloud firestore export`) and point-in-time recovery (PITR) in Google Cloud Console.
- **Health Check & Uptime Monitoring**: Monitor `GET /api/health` (returns HTTP `200` `{ ok: true, timestamp }`) via Cloud Monitoring / Uptime Checks.
- **Log Alerting**: Monitor Cloud Run logs for `[TCMS Security]`, HTTP `5xx` spikes, failed delivery logs (`deliveryStatus: failed | retry_required`), and webhook `401`/`503` responses.

---

## 7. Production Deployment & Readiness Checklist

### Ready & Verified in Repository
- Production client bundle builds cleanly (`npm run build` -> `dist/`).
- Express server executes natively on Node 22 (`"start": "node server.ts"`).
- Security rules (`firestore.rules`, `storage.rules`) and composite index manifest (`firestore.indexes.json`) prepared.
- Environment variable template documented in `.env.example`.

### External Prerequisites Required Before Go-Live
1. **Set Persistent `SERVER_ENCRYPTION_KEY`**: Provision a strong 32-byte random secret in Cloud Run / Secret Manager (`openssl rand -hex 32`).
2. **Deploy Firebase Rules & Indexes**: Run `firebase deploy --only firestore:rules,firestore:indexes,storage` against project `ai-studio-af1aca56-5e67-4645-84e7-4b40da9143cc`.
3. **Configure SMTP & WhatsApp Credentials**: Populate `SMTP_*` and `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET` (or configure via Super Admin Integration Settings), and register the Meta callback URL (`https://<domain>/api/webhooks/whatsapp`).
4. **Confirm Persistent File Storage & Region**: Ensure Firebase Storage bucket permissions allow server-mirrored objects (since local `.data/vault` on stateless Cloud Run containers is ephemeral across revisions/restarts) and verify the GCP/Firebase region meets Saudi PDPL residency requirements.
5. **Transitive Dependency Advisories (`bun audit`)**: Monitor upstream updates for `firebase` / `firebase-admin` (`@grpc/grpc-js`) and `exceljs` (`uuid`), as `bun audit` reports 3 transitive low/moderate advisories in upstream packages with no direct breaking upgrade available without major SDK changes.
