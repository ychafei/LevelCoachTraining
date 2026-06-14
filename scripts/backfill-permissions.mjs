// scripts/backfill-permissions.mjs
//
// Per-document permission backfill for the production cutover
// (docs/ARCHITECTURE.md §2). Run AFTER scripts/provision-appwrite.mjs has
// switched collections to documentSecurity + admin-only collection reads —
// existing documents then need per-document read grants so owners keep access:
//
//   profiles                → read: owner account (account_id)
//   sessions                → read: client profile account + coach account (coaches.user_id)
//   session_credits         → read: owner account (client_email → profile lookup)
//   conversations           → read: participants (participant_emails → profiles)
//   messages                → read: participants of the parent conversation
//   legal_agreements        → read: signer account
//   stripe_payment_records  → read: payer (metadata client_account_id)
//   stripe_transfer_records → read: payee owner (destination connected account)
//   credit_ledger_entries   → read: owner account
//   credit_reservations     → read: owner account
//   payout_obligations      → read: payee owner
//
// Idempotent: documents already carrying every desired grant are skipped, and
// new grants are merged into the existing $permissions (nothing is removed).
//
// Usage:
//   node scripts/backfill-permissions.mjs [--dry-run]

import { Client, Databases, Permission, Role, Query } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Env loading (parse .env.local manually so we don't add a dotenv dep) ----

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
const PROJECT  = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY  = process.env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing required env vars. Need: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 100;

// --- Document iteration -------------------------------------------------------

async function* listAll(coll) {
  let cursor = null;
  while (true) {
    const queries = [Query.limit(BATCH)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DB_ID, coll, queries);
    for (const doc of page.documents) yield doc;
    if (page.documents.length < BATCH) return;
    cursor = page.documents[page.documents.length - 1].$id;
  }
}

// --- Lookup helpers (cached — backfill touches the same owners repeatedly) ---

const accountByEmail = new Map();     // email → account_id | null
const accountByProfileId = new Map(); // profile $id → account_id | null
const accountByCoachId = new Map();   // coach $id → account_id | null
const conversationById = new Map();   // conversation $id → doc | null
const ownersByStripeAccount = new Map(); // stripe acct id → [account ids]

async function accountForEmail(email) {
  const key = String(email || '').toLowerCase().trim();
  if (!key) return null;
  if (accountByEmail.has(key)) return accountByEmail.get(key);
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', key),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const accountId = rows.documents[0]?.account_id || null;
  accountByEmail.set(key, accountId);
  return accountId;
}

async function accountForProfileId(profileId) {
  if (!profileId) return null;
  if (accountByProfileId.has(profileId)) return accountByProfileId.get(profileId);
  const profile = await databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
  const accountId = profile?.account_id || null;
  accountByProfileId.set(profileId, accountId);
  return accountId;
}

async function accountForCoachId(coachId) {
  if (!coachId) return null;
  if (accountByCoachId.has(coachId)) return accountByCoachId.get(coachId);
  const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
  const accountId = coach?.user_id || null;
  accountByCoachId.set(coachId, accountId);
  return accountId;
}

async function conversationFor(conversationId) {
  if (!conversationId) return null;
  if (conversationById.has(conversationId)) return conversationById.get(conversationId);
  const conversation = await databases.getDocument(DB_ID, 'conversations', conversationId).catch(() => null);
  conversationById.set(conversationId, conversation);
  return conversation;
}

// Resolve a Stripe connected account id to the owner's Appwrite account(s):
// coach → coaches.user_id; org → active org_owner/org_admin member accounts.
async function ownerAccountsForStripeAccount(stripeAccountId) {
  const key = String(stripeAccountId || '').trim();
  if (!key) return [];
  if (ownersByStripeAccount.has(key)) return ownersByStripeAccount.get(key);

  const accounts = [];
  const rows = await databases.listDocuments(DB_ID, 'stripe_connected_accounts', [
    Query.equal('stripe_account_id', key),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const connected = rows.documents[0];

  if (connected?.owner_type === 'coach') {
    const accountId = await accountForCoachId(connected.owner_id);
    if (accountId) accounts.push(accountId);
  } else if (connected?.owner_type === 'org') {
    const members = await databases.listDocuments(DB_ID, 'organization_members', [
      Query.equal('organization_id', connected.owner_id),
      Query.equal('role', ['org_owner', 'org_admin']),
      Query.equal('status', 'active'),
      Query.limit(50),
    ]).catch(() => ({ documents: [] }));
    for (const member of members.documents) {
      const accountId = await accountForProfileId(member.profile_id);
      if (accountId) accounts.push(accountId);
    }
  }

  ownersByStripeAccount.set(key, accounts);
  return accounts;
}

// --- Grant computation per collection -----------------------------------------

function readGrants(accountIds) {
  const unique = [...new Set(accountIds.filter(Boolean))];
  return unique.map((accountId) => Permission.read(Role.user(accountId)));
}

async function participantAccounts(conversation) {
  const emails = Array.isArray(conversation?.participant_emails) ? conversation.participant_emails : [];
  const accounts = [];
  for (const email of emails) {
    const accountId = await accountForEmail(email);
    if (accountId) accounts.push(accountId);
  }
  return accounts;
}

function parseMetadata(value) {
  if (!value) return {};
  try { return JSON.parse(String(value)); } catch { return {}; }
}

const COLLECTION_GRANTS = {
  // read: owner account
  profiles: async (doc) => readGrants([doc.account_id]),

  // read: client profile account + coach account
  sessions: async (doc) => readGrants([
    await accountForEmail(doc.client_email),
    await accountForCoachId(doc.coach_id),
  ]),

  // read: owner account (client_email → profile; client_profile_id fallback)
  session_credits: async (doc) => readGrants([
    (await accountForEmail(doc.client_email)) || (await accountForProfileId(doc.client_profile_id)),
  ]),

  // read: participants
  conversations: async (doc) => readGrants(await participantAccounts(doc)),

  // read: participants of the parent conversation
  messages: async (doc) => {
    const conversation = await conversationFor(doc.conversation_id);
    return readGrants(await participantAccounts(conversation));
  },

  // read: signer
  legal_agreements: async (doc) => readGrants([
    doc.signer_account_id || (await accountForProfileId(doc.signer_profile_id)),
  ]),

  // read: payer (checkout metadata)
  stripe_payment_records: async (doc) => {
    const metadata = parseMetadata(doc.metadata);
    const payer = metadata.client_account_id || (await accountForEmail(metadata.client_email));
    return readGrants([payer]);
  },

  // read: payee owner
  stripe_transfer_records: async (doc) =>
    readGrants(await ownerAccountsForStripeAccount(doc.destination_account_id)),

  // read: credit owner
  credit_ledger_entries: async (doc) => readGrants([
    (await accountForProfileId(doc.client_profile_id)) || (await accountForProfileId(doc.owner_profile_id)),
  ]),

  // read: credit owner
  credit_reservations: async (doc) => readGrants([
    await accountForProfileId(doc.owner_profile_id),
  ]),

  // read: payee owner
  payout_obligations: async (doc) => {
    if (doc.owner_type === 'coach') {
      const coach = await databases.getDocument(DB_ID, 'coaches', doc.owner_id).catch(() => null);
      return readGrants([coach?.user_id]);
    }
    return readGrants(await ownerAccountsForStripeAccount(doc.stripe_connected_account_id));
  },
};

// --- Backfill loop --------------------------------------------------------------

async function backfillCollection(coll, computeGrants) {
  console.log(`\n[Backfill] ${coll}${DRY_RUN ? ' (dry run)' : ''}`);
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let ungrantable = 0;
  let failed = 0;

  for await (const doc of listAll(coll)) {
    processed += 1;
    try {
      const desired = await computeGrants(doc);
      if (desired.length === 0) {
        // Owner not determinable (e.g. legacy row with no linked account).
        ungrantable += 1;
      } else {
        const existing = doc.$permissions || [];
        const missing = desired.filter((perm) => !existing.includes(perm));
        if (missing.length === 0) {
          skipped += 1; // already carries every desired grant
        } else if (DRY_RUN) {
          updated += 1;
          console.log(`  ~ would grant ${coll}/${doc.$id}: ${missing.join(', ')}`);
        } else {
          // Merge with existing grants; pass no data so the document is preserved.
          const merged = [...new Set([...existing, ...desired])];
          await databases.updateDocument(DB_ID, coll, doc.$id, undefined, merged);
          updated += 1;
        }
      }
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${coll}/${doc.$id}: ${err?.message || err}`);
    }
    if (processed % 200 === 0) {
      console.log(`  ... ${processed} processed (${updated} updated, ${skipped} already granted)`);
    }
  }

  console.log(`  done: ${processed} processed, ${updated} ${DRY_RUN ? 'would update' : 'updated'}, ${skipped} already granted, ${ungrantable} no resolvable owner, ${failed} failed`);
  return { coll, processed, updated, skipped, ungrantable, failed };
}

async function main() {
  console.log(`Per-document permission backfill${DRY_RUN ? ' — DRY RUN (no writes)' : ''}`);
  console.log('  endpoint:', ENDPOINT);
  console.log('  project: ', PROJECT);
  console.log('  database:', DB_ID);

  const results = [];
  for (const [coll, computeGrants] of Object.entries(COLLECTION_GRANTS)) {
    results.push(await backfillCollection(coll, computeGrants));
  }

  console.log('\n==================== BACKFILL SUMMARY ====================');
  for (const r of results) {
    console.log(`  ${r.coll}: ${r.processed} docs, ${r.updated} ${DRY_RUN ? 'would update' : 'updated'}, ${r.skipped} already granted, ${r.ungrantable} unresolved, ${r.failed} failed`);
  }
  const failures = results.reduce((sum, r) => sum + r.failed, 0);
  if (DRY_RUN) {
    console.log('\nDry run complete — re-run without --dry-run to apply.');
  }
  if (failures > 0) {
    console.error(`\n${failures} document(s) failed — inspect the log above and re-run (idempotent).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});
