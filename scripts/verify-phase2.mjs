// Phase 2 — legal & compliance.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (p) => readFileSync(join(root, p), 'utf8');
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const includes = (path, snippets) => {
  const content = read(path);
  for (const s of snippets) check(content.includes(s), `${path} is missing: ${s}`);
};

for (const file of [
  'functions/signLegalAgreement/src/main.js',
  'functions/generateLegalAgreementPdf/src/main.js',
  'src/lib/legal.js',
  'src/hooks/useLegalPacketStatus.js',
  'src/components/legal/LegalSignaturePanel.jsx',
  'src/pages/admin/AdminLegalDocuments.jsx',
  'src/lib/legalTemplateDefinitions.js',
  'scripts/seed-legal-templates.mjs',
]) check(existsSync(join(root, file)), `Missing required Phase 2 file: ${file}`);

// Server-side signer hardening: role derived server-side, guardian signings
// bound to a linked athlete, minors cannot self-sign athlete packets.
includes('functions/signLegalAgreement/src/main.js', [
  'callerAccountId',
  'guardian_athletes',
  'is_minor',
  'legalNameCheck',
  'legal_name_affirmed',
  'signature_hash',
  "Permission.read(Role.user(accountId))",
  "Permission.read(Role.label('admin'))",
]);

// Admin legal vault can create/version/retire templates server-side; clients
// must not mutate legal template documents directly.
includes('functions/adminOps/src/main.js', [
  'createLegalTemplate',
  'updateLegalTemplate',
  'retireLegalTemplate',
  'legalTemplateChecksum',
  'legal_template.new_version',
]);
includes('src/pages/admin/AdminLegalDocuments.jsx', [
  'New document',
  'View full',
  'Edit legal document',
  'Signed agreements',
  'created_new_version',
]);

// Full template packet with attorney-review marker on every body.
const templates = read('src/lib/legalTemplateDefinitions.js');
check(templates.includes('ATTORNEY REVIEW REQUIRED'), 'legal templates must carry the attorney-review marker');
for (const key of [
  'platform_terms_privacy_ack',
  'athlete_participation_waiver',
  'athlete_medical_emergency',
  'athlete_media_release',
  'athlete_communication_safety',
  'athlete_payment_terms',
  'guardian_authority_minor_packet',
  'guardian_medical_media_safety',
  'guardian_payment_booking_consent',
  'coach_independent_contractor_packet',
  'coach_safeguarding_boundaries_packet',
  'coach_communication_policy',
  'organization_service_authority_packet',
  'organization_roster_privacy_safety_packet',
]) check(templates.includes(`'${key}'`), `legal templates missing ${key}`);

// Seeder retires superseded versions so users never sign stale documents.
includes('scripts/seed-legal-templates.mjs', ['retired_at']);

// Guardian signings can target a specific child in the UI.
includes('src/components/legal/LegalSignaturePanel.jsx', ['athleteId']);

// Public pages clearly mark placeholder status.
includes('src/pages/Terms.jsx', ['ATTORNEY REVIEW']);
includes('src/pages/Privacy.jsx', ['ATTORNEY REVIEW']);

if (failures.length) {
  console.error('Phase 2 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 2 verification passed.');
