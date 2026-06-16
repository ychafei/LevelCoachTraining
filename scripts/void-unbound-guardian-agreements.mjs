// Void legacy guardian agreements that are not bound to a specific athlete.
//
// Runtime checkout/booking gates now require child-bound guardian agreements.
// This script cleans up older signed guardian rows so production data matches
// that rule without deleting legal history.
//
// Usage:
//   node scripts/void-unbound-guardian-agreements.mjs --dry-run
//   node scripts/void-unbound-guardian-agreements.mjs --apply

import { Client, Databases, ID, Query } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error(`Could not read ${envPath}. Make sure .env.local exists in the project root.`);
  process.exit(1);
}

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing required env vars. Need: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);
const templateRoleCache = new Map();

async function templateRoleFor(agreement) {
  const templateId = String(agreement.template_id || '').trim();
  if (templateId) {
    if (templateRoleCache.has(templateId)) return templateRoleCache.get(templateId);
    const template = await databases.getDocument(DB_ID, 'legal_templates', templateId).catch(() => null);
    const role = template?.role || '';
    templateRoleCache.set(templateId, role);
    return role;
  }

  const templateKey = String(agreement.template_key || '').trim();
  if (!templateKey) return '';
  const cacheKey = `key:${templateKey}`;
  if (templateRoleCache.has(cacheKey)) return templateRoleCache.get(cacheKey);
  const rows = await databases.listDocuments(DB_ID, 'legal_templates', [
    Query.equal('template_key', templateKey),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const role = rows.documents[0]?.role || '';
  templateRoleCache.set(cacheKey, role);
  return role;
}

async function* signedGuardianAgreements() {
  let cursor = null;
  while (true) {
    const queries = [
      Query.equal('signer_role', 'guardian'),
      Query.equal('status', 'signed'),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DB_ID, 'legal_agreements', queries);
    for (const doc of page.documents) yield doc;
    if (page.documents.length < 100) return;
    cursor = page.documents[page.documents.length - 1].$id;
  }
}

let scanned = 0;
let candidates = 0;
let voided = 0;

for await (const agreement of signedGuardianAgreements()) {
  scanned += 1;
  if (String(agreement.athlete_id || '').trim()) continue;
  const templateRole = await templateRoleFor(agreement);
  if (templateRole === 'platform') continue;
  candidates += 1;

  console.log([
    DRY_RUN ? '[dry-run]' : '[void]',
    agreement.$id,
    agreement.template_key || agreement.template_id,
    agreement.signer_email || agreement.signer_profile_id,
  ].join(' '));

  if (!DRY_RUN) {
    await databases.updateDocument(DB_ID, 'legal_agreements', agreement.$id, { status: 'voided' });
    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: 'script:void-unbound-guardian-agreements',
      actor_role: 'admin',
      action: 'legal_agreement.void_unbound_guardian',
      entity_type: 'LegalAgreement',
      entity_id: agreement.$id,
      before: JSON.stringify({ status: agreement.status, athlete_id: agreement.athlete_id || '' }),
      after: JSON.stringify({ status: 'voided', athlete_id: '' }),
      metadata: JSON.stringify({ template_key: agreement.template_key || '', signer_profile_id: agreement.signer_profile_id || '' }),
    }).catch(() => {});
    voided += 1;
  }
}

console.log(`${DRY_RUN ? 'Dry run' : 'Applied'} complete. Scanned ${scanned}; candidates ${candidates}; voided ${voided}.`);
if (DRY_RUN) console.log('Run with --apply to void candidates.');
