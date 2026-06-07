import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    assert(content.includes(snippet), `${path} is missing: ${snippet}`);
  }
}

const requiredFiles = [
  'functions/signLegalAgreement/package.json',
  'functions/signLegalAgreement/src/main.js',
  'src/lib/legal.js',
  'src/hooks/useLegalPacketStatus.js',
  'src/components/legal/LegalSignaturePanel.jsx',
  'src/pages/admin/AdminLegalDocuments.jsx',
  'src/lib/legalTemplateDefinitions.js',
  'scripts/seed-legal-templates.mjs',
];

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required Phase 2 file: ${file}`);
}

includes('appwrite.json', [
  '"$id": "signLegalAgreement"',
  '"path": "functions/signLegalAgreement"',
  '"$id": "generateLegalAgreementPdf"',
]);

includes('scripts/provision-appwrite.mjs', [
  "'template_checksum'",
  "'signer_account_id'",
  "'signer_email'",
  "'affirmations_json'",
  "'signature_method'",
  "'drawn_signature_hash'",
]);

includes('functions/signLegalAgreement/src/main.js', [
  'callerAccountId',
  'affirmationsValid',
  'signature_hash',
  'pdf_file_id',
  "Permission.read(Role.user(accountId))",
  "Permission.read(Role.label('admin'))",
  "action: 'legal_agreement.sign'",
]);

includes('functions/generateLegalAgreementPdf/src/main.js', [
  'canGenerate',
  'Authentication required.',
  'You do not have access to this legal agreement.',
  'already_exists',
]);

includes('src/components/legal/LegalSignaturePanel.jsx', [
  'Typed legal signature',
  'electronic_records_consent',
  'reviewed_current_template',
  'accurate_information',
  'legal_authority',
  'toDataURL',
]);

includes('src/pages/Book.jsx', [
  'LegalSignaturePanel',
  'legalReadyForBooking',
  'Please complete the required legal packet before payment or scheduling.',
]);

includes('src/pages/admin/AdminLegalDocuments.jsx', [
  'generateLegalAgreementPdf',
  'legalPdfUrl',
  'legalAdminNoteRepo.create',
]);

includes('src/App.jsx', [
  'AdminLegalDocuments',
  'path="/admin/legal-documents"',
  'RequireSignedLegalPacket',
]);

includes('src/pages/admin/AdminCoaches.jsx', [
  'getLegalPacketStatus',
  'Coach legal packet is incomplete',
]);

console.log('Phase 2 verification passed.');
