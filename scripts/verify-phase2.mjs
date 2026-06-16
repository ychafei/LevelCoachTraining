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
  'src/lib/legalDocumentText.js',
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
  'deleteLegalTemplate',
  'legalTemplateChecksum',
  'legal_template.new_version',
  'legal_template.delete',
]);
includes('src/pages/admin/AdminLegalDocuments.jsx', [
  'New document',
  'View full',
  'Edit legal document',
  'Delete',
  'Signed agreements',
  'created_new_version',
]);

// Full template packet generated from the Michigan v1.0 legal forms package.
const templates = read('src/lib/legalTemplateDefinitions.js');
const legalDocs = read('src/lib/legalDocumentText.js');
const legalSources = `${templates}\n${legalDocs}`;
check(templates.includes('live signable templates'), 'legal template seed must identify the live signable packet');
for (const key of [
  'platform_universal_account_terms_privacy_esign',
  'adult_athlete_booking_agreement',
  'parent_guardian_minor_athlete_agreement',
  'coach_public_profile_agreement',
  'organization_public_profile_agreement',
]) check(legalSources.includes(key), `legal templates missing ${key}`);

for (const file of [
  'LevelCoach_Universal_Account_Terms_Privacy_Esign_Michigan_v1_0.docx',
  'LevelCoach_Adult_Athlete_Booking_Agreement_Michigan_v1_0.docx',
  'LevelCoach_Parent_Guardian_Minor_Athlete_Agreement_Michigan_v1_0.docx',
  'LevelCoach_Coach_Public_Profile_Agreement_Michigan_v1_0.docx',
  'LevelCoach_Organization_Public_Profile_Agreement_Michigan_v1_0.docx',
]) check(existsSync(join(root, 'public/legal', file)), `Missing public legal download: ${file}`);

// Seeder retires superseded versions so users never sign stale documents.
includes('scripts/seed-legal-templates.mjs', ['retired_at']);

// Guardian signings can target a specific child in the UI.
includes('src/components/legal/LegalSignaturePanel.jsx', ['athleteId']);

// Public pages expose the new universal account packet and privacy notice.
includes('src/pages/Terms.jsx', ['Universal Account Terms', 'LEGAL_SIGNING_FLOW']);
includes('src/pages/Privacy.jsx', ['Privacy Notice', 'platform_universal_account_terms_privacy_esign']);

if (failures.length) {
  console.error('Phase 2 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 2 verification passed.');
