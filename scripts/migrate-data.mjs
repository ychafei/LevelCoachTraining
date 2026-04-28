// scripts/migrate-data.mjs
//
// Phase 3 — One-shot, idempotent data migration from Base44 → Appwrite.
//
// Reads every record from each Base44 entity, transforms it to match the
// Appwrite collection schema, and inserts it into the corresponding
// Appwrite collection. Each Appwrite document stores the original Base44
// record id in a `legacy_id` attribute so re-runs skip already-migrated
// records.
//
// User accounts (login auth) are NOT migrated here — only profile data.
// Phase 4 reconciles `profiles.account_id` with Appwrite Accounts.
//
// Usage:
//   node scripts/migrate-data.mjs
//
// Required env (in .env.local):
//   VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY
//   VITE_BASE44_APP_ID, VITE_BASE44_APP_BASE_URL, VITE_BASE44_FUNCTIONS_VERSION
//   BASE44_TOKEN

import { Client as AwClient, Databases, Query, ID } from 'node-appwrite';
import { createClient as createBase44 } from '@base44/sdk';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Env loading -----------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
try {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

const required = [
  'VITE_APPWRITE_ENDPOINT', 'VITE_APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY',
  'VITE_BASE44_APP_ID', 'BASE44_TOKEN',
];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

// --- Clients ---------------------------------------------------------------

const aw = new AwClient()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(aw);

const base44 = createBase44({
  appId: process.env.VITE_BASE44_APP_ID,
  token: process.env.BASE44_TOKEN,
  functionsVersion: process.env.VITE_BASE44_FUNCTIONS_VERSION || '',
  appBaseUrl: process.env.VITE_BASE44_APP_BASE_URL || '',
  // serverUrl omitted — SDK defaults to https://base44.app, which is correct in Node.
  // (In the browser the app uses an empty serverUrl + Vite proxy. We don't have a proxy here.)
  requiresAuth: false,
});

const DB_ID = 'lctraining';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Helpers ---------------------------------------------------------------

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function jsonStringOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return null; }
}

const VALID_COUNTIES = ['Oakland', 'Macomb', 'Wayne'];
const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const safeEmail = (e) => (isValidEmail(e) ? e : undefined);
const safeCounty = (c) => (VALID_COUNTIES.includes(c) ? c : 'Oakland');

async function ensureLegacyIdAttr(coll) {
  try {
    await databases.createStringAttribute(DB_ID, coll, 'legacy_id', 64, false);
    process.stdout.write(`  + ${coll}.legacy_id ... `);
    // Wait for it to become available
    for (let i = 0; i < 30; i++) {
      const list = await databases.listAttributes(DB_ID, coll);
      const attr = list.attributes.find((a) => a.key === 'legacy_id');
      if (attr?.status === 'available') {
        console.log('available');
        return;
      }
      await sleep(1000);
    }
    console.log('timeout (continuing)');
  } catch (err) {
    if (err.code === 409 || /already exists/i.test(err.message || '')) {
      // attribute already exists — fine
      return;
    }
    throw err;
  }
}

async function getExistingLegacyIds(coll) {
  const ids = new Set();
  let cursor = null;
  while (true) {
    const queries = [Query.limit(100), Query.select(['$id', 'legacy_id'])];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, coll, queries);
    } catch (err) {
      if (/select/i.test(err.message || '')) {
        // Older Appwrite may not support Query.select on documents
        const qs = [Query.limit(100)];
        if (cursor) qs.push(Query.cursorAfter(cursor));
        res = await databases.listDocuments(DB_ID, coll, qs);
      } else {
        throw err;
      }
    }
    for (const doc of res.documents) {
      if (doc.legacy_id) ids.add(doc.legacy_id);
    }
    if (res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return ids;
}

async function listFromBase44(entityName) {
  const Entity = base44.entities[entityName];
  if (!Entity) throw new Error(`Base44 entity not found: ${entityName}`);
  // Base44 .list() returns all rows in one call (no native pagination on the SDK).
  // Limit is implicit; for very large tables we'd need to paginate, but for
  // LCTraining's volume a single fetch is fine.
  const result = await Entity.list();
  return Array.isArray(result) ? result : (result?.data || []);
}

async function migrate(entityDef) {
  const { base44: name, appwrite: coll, transform } = entityDef;
  console.log(`\n[${name} → ${coll}]`);

  // Make sure legacy_id attribute exists (idempotent)
  await ensureLegacyIdAttr(coll);

  // Fetch source rows
  let rows;
  try {
    rows = await listFromBase44(name);
  } catch (err) {
    console.error(`  ✗ failed to read Base44 ${name}: ${err.message || err}`);
    return;
  }
  console.log(`  Found ${rows.length} in Base44`);

  // Skip already-migrated rows
  const existing = await getExistingLegacyIds(coll);
  console.log(`  ${existing.size} already in Appwrite`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.id) { skipped++; continue; }
    if (existing.has(row.id)) { skipped++; continue; }

    let payload;
    try {
      payload = transform(row);
    } catch (err) {
      console.error(`  ✗ transform error on ${row.id}: ${err.message || err}`);
      errors++;
      continue;
    }
    payload.legacy_id = row.id;
    payload = clean(payload);

    try {
      await databases.createDocument(DB_ID, coll, ID.unique(), payload);
      created++;
    } catch (err) {
      errors++;
      console.error(`  ✗ create failed for ${row.id}: ${err.message || err}`);
    }
  }

  console.log(`  ${created} created, ${skipped} skipped, ${errors} errors`);
}

// --- Entity definitions ----------------------------------------------------

const ENTITIES = [
  {
    base44: 'PricingPackage',
    appwrite: 'pricing_packages',
    transform: (r) => ({
      name: r.name || '',
      sessions: r.sessions ?? null,
      price: r.price ?? 0,
      badge: r.badge,
      description: r.description,
      includes: Array.isArray(r.includes) ? r.includes : [],
      display_order: r.display_order ?? 0,
      is_visible: r.is_visible ?? true,
    }),
  },
  {
    base44: 'SiteContent',
    appwrite: 'site_content',
    transform: (r) => ({
      key: r.key,
      value: r.value || '',
      content_type: r.content_type || 'text',
    }),
  },
  {
    base44: 'BlogPost',
    appwrite: 'blog_posts',
    transform: (r) => ({
      title: r.title || '',
      slug: r.slug || '',
      cover_image: r.cover_image,
      video_url: r.video_url,
      body: r.body,
      tags: Array.isArray(r.tags) ? r.tags : [],
      status: r.status || 'draft',
      author_name: r.author_name,
      excerpt: r.excerpt,
      seo_description: r.seo_description,
      seo_keywords: r.seo_keywords,
    }),
  },
  {
    base44: 'UnsubscribeRecord',
    appwrite: 'unsubscribe_records',
    transform: (r) => ({
      email: r.email,
      reason: r.reason,
      resubscribed: r.resubscribed ?? false,
      notes: r.notes,
    }),
  },
  {
    base44: 'Coach',
    appwrite: 'coaches',
    transform: (r) => ({
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      email: safeEmail(r.email),
      email_verified_at: r.email_verified_at || null,
      phone: r.phone,
      county: safeCounty(r.county),
      training_area: r.training_area,
      bio: r.bio,
      quote: r.quote,
      photo_url: r.photo_url,
      specializations: Array.isArray(r.specializations) ? r.specializations : [],
      venmo: r.venmo,
      zelle: r.zelle,
      cashapp: r.cashapp,
      paypal: r.paypal,
      cash_accepted: r.cash_accepted ?? false,
      availability: jsonStringOrNull(r.availability),
      is_active: r.is_active ?? true,
      is_head_coach: r.is_head_coach ?? false,
      display_order: r.display_order ?? 0,
      platform_fee_type: r.platform_fee_type ?? 'none',
      platform_fee_value: r.platform_fee_value ?? 0,
    }),
  },
  {
    base44: 'User',
    appwrite: 'profiles',
    transform: (r) => ({
      // role: collapse role + is_super_admin into a single enum
      role: r.is_super_admin ? 'super_admin' : (r.role || 'user'),
      first_name: r.first_name,
      last_name: r.last_name,
      email: safeEmail(r.email),
      phone: r.phone,
      dob: r.dob || null,
      is_minor: r.is_minor ?? false,
      parent_first_name: r.parent_first_name,
      parent_last_name: r.parent_last_name,
      parent_email: safeEmail(r.parent_email),
      parent_phone: r.parent_phone,
      parent_relationship: r.parent_relationship,
      position: r.position || null,
      skill_level: r.skill_level || null,
      bio: r.bio,
      photo_url: r.photo_url,
      coach_id: r.coach_id,
      profile_setup_complete: r.profile_setup_complete ?? false,
      matching_opted_in: r.matching_opted_in ?? false,
      matching_age_group: r.matching_age_group || null,
      parent_consent_token: r.parent_consent_token,
      parent_consent_sent_at: r.parent_consent_sent_at || null,
      parent_consent_verified_at: r.parent_consent_verified_at || null,
      parent_consent_email: safeEmail(r.parent_consent_email),
      terms_accepted: r.terms_accepted ?? false,
      media_release_accepted: r.media_release_accepted ?? false,
      // account_id is left null; Phase 4 reconciles with Appwrite Accounts.
    }),
  },
  {
    base44: 'CoachBlock',
    appwrite: 'coach_blocks',
    transform: (r) => ({
      coach_id: r.coach_id,
      label: r.label,
      start_date: r.start_date,
      end_date: r.end_date,
      block_all_day: r.block_all_day ?? true,
      blocked_start_time: r.blocked_start_time,
      blocked_end_time: r.blocked_end_time,
      is_active: r.is_active ?? true,
    }),
  },
  {
    base44: 'CoachApplication',
    appwrite: 'coach_applications',
    transform: (r) => ({
      first_name: r.first_name,
      last_name: r.last_name,
      email: safeEmail(r.email),
      phone: r.phone,
      dob: r.dob || null,
      county: VALID_COUNTIES.includes(r.county) ? r.county : undefined,
      coaching_background: r.coaching_background,
      resume_url: r.resume_url,
      background_check_consent: r.background_check_consent ?? false,
      status: r.status || 'pending',
    }),
  },
  {
    base44: 'SessionCredit',
    appwrite: 'session_credits',
    transform: (r) => ({
      client_email: safeEmail(r.client_email),
      client_name: r.client_name,
      package_id: r.package_id,
      package_name: r.package_name,
      total_credits: r.total_credits ?? 0,
      used_credits: r.used_credits ?? 0,
      session_duration_minutes: r.session_duration_minutes ?? null,
      per_session_base_price: r.per_session_base_price ?? null,
      payment_processor: r.payment_processor || null,
    }),
  },
  {
    base44: 'Session',
    appwrite: 'sessions',
    transform: (r) => ({
      coach_id: r.coach_id,
      client_email: safeEmail(r.client_email),
      client_name: r.client_name,
      client_age: r.client_age ?? null,
      date: r.date,
      start_time: r.start_time,
      duration_minutes: r.duration_minutes,
      status: r.status || 'pending',
      total_price: r.total_price ?? null,
      payment_status: r.payment_status || 'unpaid',
      payment_method: r.payment_method || null,
      county: VALID_COUNTIES.includes(r.county) ? r.county : undefined,
      notes: r.notes,
      session_goals: r.session_goals,
      cancellation_reason: r.cancellation_reason,
      credit_id: r.credit_id,
      homework: r.homework,
      client_visible_notes: r.client_visible_notes,
    }),
  },
  {
    base44: 'Conversation',
    appwrite: 'conversations',
    transform: (r) => ({
      type: r.type || 'coach_client',
      participant_emails: Array.isArray(r.participant_emails) ? r.participant_emails : [],
      participant_names: Array.isArray(r.participant_names) ? r.participant_names : [],
      coach_id: r.coach_id,
      session_id: r.session_id,
      match_request_id: r.match_request_id,
      last_message: r.last_message,
      last_message_at: r.last_message_at || null,
      is_archived: r.is_archived ?? false,
    }),
  },
  {
    base44: 'Message',
    appwrite: 'messages',
    transform: (r) => ({
      conversation_id: r.conversation_id,
      sender_email: safeEmail(r.sender_email),
      sender_name: r.sender_name,
      content: r.content,
      file_url: r.file_url,
      file_name: r.file_name,
      file_type: r.file_type,
      is_deleted: r.is_deleted ?? false,
      read_by: Array.isArray(r.read_by) ? r.read_by.filter(isValidEmail) : [],
    }),
  },
  {
    base44: 'MatchRequest',
    appwrite: 'match_requests',
    transform: (r) => ({
      requester_email: safeEmail(r.requester_email),
      requester_name: r.requester_name,
      requester_player_age: r.requester_player_age ?? null,
      target_email: safeEmail(r.target_email),
      target_name: r.target_name,
      target_player_age: r.target_player_age ?? null,
      status: r.status || 'pending',
      conversation_id: r.conversation_id,
    }),
  },
  {
    base44: 'AuditLog',
    appwrite: 'audit_logs',
    transform: (r) => ({
      actor_email: safeEmail(r.actor_email),
      actor_role: r.actor_role,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      before: jsonStringOrNull(r.before),
      after: jsonStringOrNull(r.after),
      reason: r.reason,
      metadata: jsonStringOrNull(r.metadata),
    }),
  },
  {
    base44: 'UserBan',
    appwrite: 'user_bans',
    transform: (r) => ({
      banned_email: safeEmail(r.banned_email),
      banned_by_email: safeEmail(r.banned_by_email),
      reason: r.reason,
      is_permanent: r.is_permanent ?? true,
      is_active: r.is_active ?? true,
      unbanned_by_email: safeEmail(r.unbanned_by_email),
      unbanned_at: r.unbanned_at || null,
    }),
  },
];

// --- Main ------------------------------------------------------------------

async function main() {
  console.log('Migrating Base44 → Appwrite');
  console.log('  Base44 app:', process.env.VITE_BASE44_APP_ID);
  console.log('  Appwrite project:', process.env.VITE_APPWRITE_PROJECT_ID);

  for (const def of ENTITIES) {
    try {
      await migrate(def);
    } catch (err) {
      console.error(`Fatal error migrating ${def.base44}: ${err.message || err}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
