// scripts/provision-appwrite.mjs
//
// Provisioner v2 — production permission cutover for the LevelCoach Training
// Appwrite project. Implements the permission matrix in docs/ARCHITECTURE.md §2.
//
// Idempotent and re-runnable. On every run it:
//   - creates missing collections/attributes/indexes/buckets, AND
//   - enforces the target permissions + documentSecurity/fileSecurity on
//     EXISTING collections and buckets (updateCollection/updateBucket) —
//     this is the cutover step for already-provisioned deployments.
//
// After running this, run `node scripts/backfill-permissions.mjs` to apply
// per-document grants to pre-existing documents.
//
// Usage:
//   node scripts/provision-appwrite.mjs
//
// Env (read from .env.local):
//   VITE_APPWRITE_ENDPOINT    e.g. https://nyc.cloud.appwrite.io/v1
//   VITE_APPWRITE_PROJECT_ID  e.g. 69efb263000fe1c34344
//   APPWRITE_API_KEY          server-side key (no VITE_ prefix)
//   APPWRITE_DATABASE_ID      optional, defaults to "lctraining"

import { Client, Databases, Storage, Permission, Role, Query } from 'node-appwrite';
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
const storage   = new Storage(client);

const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';

// --- Permission presets (docs/ARCHITECTURE.md §2) ----------------------------
//
// "server-only" = empty permission list: clients get nothing; Appwrite
// Functions use the API key, which bypasses collection permissions.
// documentSecurity ON = per-document grants written by functions at write time
// (and by scripts/backfill-permissions.mjs for pre-existing documents).

const ADMIN = Role.label('admin');

const ADMIN_READ              = [Permission.read(ADMIN)];
const ADMIN_READ_CREATE       = [Permission.read(ADMIN), Permission.create(ADMIN)];
const ADMIN_READ_UPDATE       = [Permission.read(ADMIN), Permission.update(ADMIN)];
const ADMIN_FULL              = [
  Permission.read(ADMIN),
  Permission.create(ADMIN),
  Permission.update(ADMIN),
  Permission.delete(ADMIN),
];
const PUBLIC_READ_ONLY        = [Permission.read(Role.any())];
const USERS_READ_ONLY         = [Permission.read(Role.users())];
const PUBLIC_READ_ADMIN_WRITE = [
  Permission.read(Role.any()),
  Permission.create(ADMIN),
  Permission.update(ADMIN),
  Permission.delete(ADMIN),
];
const SERVER_ONLY             = [];

// Bucket presets. Private buckets carry NO bucket-level user permissions —
// files are created server-side (or with explicit per-file permissions).
const PUBLIC_BUCKET = [
  Permission.read(Role.any()),
  Permission.create(Role.users()),
  Permission.update(ADMIN),
  Permission.delete(ADMIN),
];
const PRIVATE_BUCKET = [];

// Collected as collections/buckets are ensured; printed at the end.
const CUTOVER_SUMMARY = { collections: [], buckets: [] };

// --- Idempotent helpers -----------------------------------------------------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function safe(label, fn) {
  try {
    const result = await fn();
    console.log(`  ✓ ${label}`);
    return result;
  } catch (err) {
    if (err && (err.code === 409 || /already exists/i.test(err.message || ''))) {
      console.log(`  = ${label} (exists)`);
      return null;
    }
    console.error(`  ✗ ${label}: ${err?.message || err}`);
    throw err;
  }
}

async function ensureDatabase() {
  console.log(`\n[Database] ${DB_ID}`);
  await safe(`database "${DB_ID}"`, () => databases.create(DB_ID, 'LevelCoach Training'));
}

async function ensureCollection(id, name, permissions, documentSecurity) {
  await safe(`collection "${id}"`, () =>
    databases.createCollection(DB_ID, id, name, permissions, documentSecurity)
  );
  // Cutover: ALWAYS enforce the target permissions + documentSecurity, so
  // permissions converge on existing deployments, not only fresh ones.
  await safe(`collection "${id}" permissions (docSec=${documentSecurity ? 'on' : 'off'})`, () =>
    databases.updateCollection(DB_ID, id, name, permissions, documentSecurity, true)
  );
  CUTOVER_SUMMARY.collections.push({ id, documentSecurity, permissions });
}

const attributeKeysByCollection = new Map();

async function getAttributeKeys(coll) {
  if (attributeKeysByCollection.has(coll)) return attributeKeysByCollection.get(coll);
  const res = await databases.listAttributes(DB_ID, coll, [Query.limit(100)]);
  const keys = new Set(res.attributes.map((attribute) => attribute.key));
  attributeKeysByCollection.set(coll, keys);
  return keys;
}

async function ensureAttribute(label, coll, key, create) {
  const keys = await getAttributeKeys(coll);
  if (keys.has(key)) {
    console.log(`  = ${label} (exists)`);
    return null;
  }
  const result = await safe(label, create);
  keys.add(key);
  return result;
}

// Attribute creators — Appwrite Node SDK signatures
async function attrString(coll, key, size, required = false, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} string(${size})`, coll, key, () =>
    databases.createStringAttribute(DB_ID, coll, key, size, required, def, array)
  );
}
async function attrInt(coll, key, required = false, min = null, max = null, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} int`, coll, key, () =>
    databases.createIntegerAttribute(DB_ID, coll, key, required, min, max, def, array)
  );
}
async function attrFloat(coll, key, required = false, min = null, max = null, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} float`, coll, key, () =>
    databases.createFloatAttribute(DB_ID, coll, key, required, min, max, def, array)
  );
}
async function attrBool(coll, key, required = false, def = false, array = false) {
  await ensureAttribute(`  ${coll}.${key} bool`, coll, key, () =>
    databases.createBooleanAttribute(DB_ID, coll, key, required, def, array)
  );
}
async function attrDatetime(coll, key, required = false, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} datetime`, coll, key, () =>
    databases.createDatetimeAttribute(DB_ID, coll, key, required, def, array)
  );
}
async function attrEnum(coll, key, elements, required = false, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} enum[${elements.join(',')}]`, coll, key, () =>
    databases.createEnumAttribute(DB_ID, coll, key, elements, required, def, array)
  );
}

// Widen an existing enum attribute to include new elements (no-op when the
// attribute already covers them). Appwrite allows updating enum elements in
// place; if the call fails (older server, in-flight attribute) we warn so the
// operator can widen it from the console instead of silently shipping a schema
// that rejects new values.
async function widenEnum(coll, key, elements, required = false, def = null) {
  try {
    const attr = await databases.getAttribute(DB_ID, coll, key);
    const current = Array.isArray(attr?.elements) ? attr.elements : [];
    const missing = elements.filter((el) => !current.includes(el));
    if (missing.length === 0) return;
    await databases.updateEnumAttribute(DB_ID, coll, key, elements, required, def);
    console.log(`  ~ ${coll}.${key} enum widened (+${missing.join(',+')})`);
  } catch (err) {
    console.warn(`  ! ${coll}.${key} enum could not be widened automatically (${err?.message || err}). Update its elements to [${elements.join(', ')}] in the Appwrite console.`);
  }
}
async function attrEmail(coll, key, required = false, def = null, array = false) {
  await ensureAttribute(`  ${coll}.${key} email`, coll, key, () =>
    databases.createEmailAttribute(DB_ID, coll, key, required, def, array)
  );
}

// Enums cannot be safely rewritten in place. When an existing enum drifts from
// the target element list, warn so the operator can migrate it in the console.
async function warnIfEnumDiffers(coll, key, expected) {
  const keys = await getAttributeKeys(coll);
  if (!keys.has(key)) return;
  const attr = await databases.getAttribute(DB_ID, coll, key).catch(() => null);
  const elements = attr?.elements || [];
  const missing = expected.filter((el) => !elements.includes(el));
  if (missing.length > 0) {
    console.warn(`  ! ${coll}.${key} enum is [${elements.join(',')}] but target is [${expected.join(',')}] — a manual update in the Appwrite console may be needed.`);
  }
}

// Wait until every attribute on a collection reports status "available".
// Appwrite creates attributes asynchronously; indexes need them ready first.
async function waitAttributesReady(coll, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await databases.listAttributes(DB_ID, coll);
    const pending = list.attributes.filter(a => a.status !== 'available');
    if (pending.length === 0) return;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for attributes in collection "${coll}"`);
}

async function ensureIndex(coll, key, type, attributes, orders = []) {
  await safe(`  ${coll} index ${key} (${type} on ${attributes.join(',')})`, () =>
    databases.createIndex(DB_ID, coll, key, type, attributes, orders)
  );
}

async function ensureBucket(id, name, perms, opts = {}) {
  const {
    fileSecurity = false,
    enabled = true,
    maximumFileSize = 30 * 1024 * 1024, // 30 MB default
    allowedFileExtensions = [],
    encryption = true,
    antivirus = true,
  } = opts;
  await safe(`bucket "${id}"`, () =>
    storage.createBucket(
      id, name, perms, fileSecurity, enabled,
      maximumFileSize, allowedFileExtensions, undefined, encryption, antivirus
    )
  );
  // Cutover: ALWAYS enforce permissions/fileSecurity on existing buckets too.
  await safe(`bucket "${id}" permissions (fileSecurity=${fileSecurity ? 'on' : 'off'})`, () =>
    storage.updateBucket(
      id, name, perms, fileSecurity, enabled,
      maximumFileSize, allowedFileExtensions, undefined, encryption, antivirus
    )
  );
  CUTOVER_SUMMARY.buckets.push({ id, fileSecurity, permissions: perms });
}

// --- Collection definitions -------------------------------------------------

async function provisionProfiles() {
  console.log('\n[Collection] profiles');
  await ensureCollection('profiles', 'Profiles', ADMIN_READ, true);
  await attrString('profiles', 'account_id', 64);                      // links to Appwrite Account.$id
  await attrEnum('profiles', 'role', ['user', 'coach', 'admin', 'super_admin'], false, 'user');
  await attrString('profiles', 'first_name', 100);
  await attrString('profiles', 'last_name', 100);
  await attrEmail('profiles', 'email');
  await attrString('profiles', 'phone', 30);
  await attrDatetime('profiles', 'dob');
  await attrBool('profiles', 'is_minor', false, false);
  await attrString('profiles', 'parent_first_name', 100);
  await attrString('profiles', 'parent_last_name', 100);
  await attrEmail('profiles', 'parent_email');
  await attrString('profiles', 'parent_phone', 30);
  await attrString('profiles', 'parent_relationship', 100);
  await attrEnum('profiles', 'position',
    ['Goalkeeper', 'Defender', 'Midfielder', 'Striker', 'Winger', 'Center Back', 'Fullback', 'Other']);
  await attrEnum('profiles', 'skill_level', ['Beginner', 'Intermediate', 'Advanced', 'Competitive']);
  await attrString('profiles', 'bio', 20000); // > 16384 → stored as TEXT (excluded from row-size limit)
  await attrString('profiles', 'photo_url', 1000);
  await attrString('profiles', 'coach_id', 64);
  await attrBool('profiles', 'profile_setup_complete', false, false);
  await attrBool('profiles', 'matching_opted_in', false, false);
  await attrEnum('profiles', 'matching_age_group', ['5-8', '9-12', '13+']);
  await attrString('profiles', 'parent_consent_token', 128);
  await attrDatetime('profiles', 'parent_consent_sent_at');
  await attrDatetime('profiles', 'parent_consent_verified_at');
  await attrEmail('profiles', 'parent_consent_email');
  await attrBool('profiles', 'terms_accepted', false, false);
  await attrBool('profiles', 'media_release_accepted', false, false);
  await attrString('profiles', 'onboarding_role', 60);
  await attrEnum('profiles', 'onboarding_status', ['incomplete', 'complete', 'blocked'], false, 'incomplete');
  await attrString('profiles', 'primary_organization_id', 64);
  await attrBool('profiles', 'master_admin_locked', false, false);
  await attrDatetime('profiles', 'master_admin_bootstrapped_at');
  await attrString('profiles', 'notification_prefs', 2000);            // JSON-serialized
  await attrBool('profiles', 'suspended', false, false);
  await attrString('profiles', 'location_label', 500);
  await attrFloat('profiles', 'location_lat');
  await attrFloat('profiles', 'location_lng');

  await waitAttributesReady('profiles');
  await ensureIndex('profiles', 'idx_email',          'unique', ['email']);
  await ensureIndex('profiles', 'idx_account_id',     'key',    ['account_id']);
  await ensureIndex('profiles', 'idx_coach_id',       'key',    ['coach_id']);
  await ensureIndex('profiles', 'idx_primary_org',    'key',    ['primary_organization_id']);
  await ensureIndex('profiles', 'idx_matching',       'key',    ['matching_opted_in']);
  await ensureIndex('profiles', 'idx_parent_consent', 'key',    ['parent_consent_token']);
}

async function provisionCoaches() {
  console.log('\n[Collection] coaches');
  await ensureCollection('coaches', 'Coaches', PUBLIC_READ_ONLY, true);
  await attrString('coaches', 'first_name', 100, true);
  await attrString('coaches', 'last_name',  100, true);
  await attrEmail('coaches',  'email');
  await attrDatetime('coaches', 'email_verified_at');
  await attrString('coaches', 'phone', 30);
  // Deprecated enum generalized: NEW deployments get an optional free-form
  // string; existing deployments keep the legacy enum attribute untouched.
  await attrString('coaches', 'county', 80);
  await attrString('coaches', 'training_area', 255);
  await attrString('coaches', 'service_city', 120);
  await attrString('coaches', 'service_state', 30);
  await attrString('coaches', 'service_zip', 20);
  await attrInt('coaches',    'service_radius_miles', false, 0, 250, 25);
  await attrEnum('coaches',   'service_type', ['facility', 'travels', 'hybrid', 'online'], false, 'hybrid');
  await attrString('coaches', 'service_venue', 500);
  await attrString('coaches', 'service_counties', 100, false, null, true);
  await attrFloat('coaches',  'location_lat');
  await attrFloat('coaches',  'location_lng');
  await attrString('coaches', 'bio', 20000); // TEXT
  await attrString('coaches', 'quote', 1000);
  await attrString('coaches', 'photo_url', 1000);
  await attrString('coaches', 'specializations', 100, false, null, true); // string[]
  await attrString('coaches', 'availability', 20000);                    // JSON-serialized; TEXT
  await attrBool('coaches',   'is_active', false, true);
  await attrBool('coaches',   'is_head_coach', false, false);
  await attrInt('coaches',    'display_order', false, null, null, 0);
  await attrEnum('coaches',   'platform_fee_type', ['none', 'percent', 'fixed'], false, 'none');
  await attrFloat('coaches',  'platform_fee_value', false, null, null, 0);
  await attrString('coaches', 'user_id', 64);                            // link to profiles.account_id
  await attrString('coaches', 'stripe_account_id', 128);
  // Multi-sport / production cutover additions
  await attrString('coaches', 'timezone', 64, false, 'America/Detroit'); // IANA tz for availability
  await attrString('coaches', 'sports', 120, false, null, true);         // string[] of sport_keys
  await attrString('coaches', 'booking_rules', 20000);                   // JSON: min-notice/buffer/max-advance
  await attrFloat('coaches',  'rating_avg');
  await attrInt('coaches',    'review_count');
  await attrBool('coaches',   'published', false, false);
  await attrInt('coaches',    'platform_fee_bps');                       // nullable admin override (basis points)
  await attrString('coaches', 'intro_video_url', 1000);
  await attrInt('coaches',    'price_hint_cents');

  await waitAttributesReady('coaches');
  await ensureIndex('coaches', 'idx_is_active',     'key', ['is_active']);
  await ensureIndex('coaches', 'idx_county',        'key', ['county']);
  await ensureIndex('coaches', 'idx_service_city',  'key', ['service_city']);
  await ensureIndex('coaches', 'idx_service_state', 'key', ['service_state']);
  await ensureIndex('coaches', 'idx_display_order', 'key', ['display_order']);
  await ensureIndex('coaches', 'idx_user_id',       'key', ['user_id']);
  await ensureIndex('coaches', 'idx_published',     'key', ['published']);
}

async function provisionSessions() {
  console.log('\n[Collection] sessions');
  await ensureCollection('sessions', 'Sessions', ADMIN_READ, true);
  await attrString('sessions', 'coach_id', 64, true);
  await attrEmail('sessions',  'client_email', true);
  await attrString('sessions', 'client_name', 200, true);
  await attrInt('sessions',    'client_age');                             // optional, denormalized
  await attrString('sessions', 'date', 10, true);                         // YYYY-MM-DD
  await attrString('sessions', 'start_time', 5, true);                    // HH:MM
  await attrInt('sessions',    'duration_minutes', true);
  await attrEnum('sessions',   'status', ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'], false, 'pending');
  // Existing deployments created the enum before 'no_show' existed — widen it.
  await widenEnum('sessions', 'status', ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'], false, 'pending');
  await attrFloat('sessions',  'total_price');
  await attrEnum('sessions',   'payment_status', ['unpaid', 'paid'], false, 'unpaid');
  await attrEnum('sessions',   'payment_method', ['electronic', 'credits']);
  await attrEnum('sessions',   'county', ['Oakland', 'Macomb', 'Wayne']);
  await attrString('sessions', 'notes', 20000);                          // TEXT
  await attrString('sessions', 'session_goals', 1000);
  await attrString('sessions', 'cancellation_reason', 500);
  await attrString('sessions', 'credit_id', 64);                          // link to session_credits
  await attrString('sessions', 'homework', 20000);                       // TEXT
  await attrString('sessions', 'client_visible_notes', 20000);           // TEXT
  // Production cutover additions
  await attrString('sessions', 'athlete_id', 64);                         // the athlete the session is for
  await attrString('sessions', 'booked_by_profile_id', 64);               // who actually booked (guardian/self)
  await attrString('sessions', 'timezone', 64);                           // copied from coach at booking
  await attrDatetime('sessions', 'starts_at_utc');                        // derived, for sorting/conflicts

  await waitAttributesReady('sessions');
  await ensureIndex('sessions', 'idx_coach_id',      'key', ['coach_id']);
  await ensureIndex('sessions', 'idx_client_email',  'key', ['client_email']);
  await ensureIndex('sessions', 'idx_date',          'key', ['date']);
  await ensureIndex('sessions', 'idx_status',        'key', ['status']);
  await ensureIndex('sessions', 'idx_credit_id',     'key', ['credit_id']);
  await ensureIndex('sessions', 'idx_athlete_id',    'key', ['athlete_id']);
  await ensureIndex('sessions', 'idx_starts_at_utc', 'key', ['starts_at_utc']);
}

async function provisionSessionCredits() {
  console.log('\n[Collection] session_credits');
  await ensureCollection('session_credits', 'Session Credits', ADMIN_READ, true);
  await attrEmail('session_credits',  'client_email', true);
  await attrString('session_credits', 'client_name', 200);
  await attrString('session_credits', 'package_id', 64, true);
  await attrString('session_credits', 'package_name', 200);
  await attrInt('session_credits',    'total_credits', true);
  await attrInt('session_credits',    'used_credits', false, null, null, 0);
  await attrInt('session_credits',    'session_duration_minutes');
  await attrFloat('session_credits',  'per_session_base_price');
  await attrEnum('session_credits',   'payment_processor',
    ['stripe', 'admin_grant']);
  // Production cutover additions — money is always integer cents
  await attrInt('session_credits',    'amount_cents');
  await attrInt('session_credits',    'per_session_base_price_cents');
  await attrString('session_credits', 'coach_id', 64);
  await attrString('session_credits', 'client_profile_id', 64);

  await waitAttributesReady('session_credits');
  await ensureIndex('session_credits', 'idx_client_email',   'key', ['client_email']);
  await ensureIndex('session_credits', 'idx_package_id',     'key', ['package_id']);
  await ensureIndex('session_credits', 'idx_coach_id',       'key', ['coach_id']);
  await ensureIndex('session_credits', 'idx_client_profile', 'key', ['client_profile_id']);
}

async function provisionConversations() {
  console.log('\n[Collection] conversations');
  await ensureCollection('conversations', 'Conversations', ADMIN_READ, true);
  await attrEnum('conversations',   'type', ['coach_client', 'client_match'], false, 'coach_client');
  await attrEmail('conversations',  'participant_emails', false, null, true);
  await attrString('conversations', 'participant_names', 200, false, null, true);
  await attrString('conversations', 'coach_id', 64);
  await attrString('conversations', 'session_id', 64);
  await attrString('conversations', 'match_request_id', 64);
  await attrString('conversations', 'last_message', 20000);              // TEXT
  await attrDatetime('conversations', 'last_message_at');
  await attrBool('conversations',   'is_archived', false, false);

  await waitAttributesReady('conversations');
  await ensureIndex('conversations', 'idx_coach_id',         'key', ['coach_id']);
  await ensureIndex('conversations', 'idx_last_message_at',  'key', ['last_message_at']);
  await ensureIndex('conversations', 'idx_match_request_id', 'key', ['match_request_id']);
}

async function provisionMessages() {
  console.log('\n[Collection] messages');
  await ensureCollection('messages', 'Messages', ADMIN_READ, true);
  await attrString('messages', 'conversation_id', 64, true);
  await attrEmail('messages',  'sender_email', true);
  await attrString('messages', 'sender_name', 200);
  await attrString('messages', 'content', 20000, true);                  // TEXT
  await attrString('messages', 'file_url', 1000);
  await attrString('messages', 'file_name', 500);
  await attrString('messages', 'file_type', 100);
  await attrBool('messages',   'is_deleted', false, false);
  await attrEmail('messages',  'read_by', false, null, true);

  await waitAttributesReady('messages');
  await ensureIndex('messages', 'idx_conversation_id', 'key', ['conversation_id']);
}

async function provisionMatchRequests() {
  console.log('\n[Collection] match_requests');
  await ensureCollection('match_requests', 'Match Requests', ADMIN_READ, true);
  await attrEmail('match_requests',  'requester_email', true);
  await attrString('match_requests', 'requester_name', 200);
  await attrInt('match_requests',    'requester_player_age');
  await attrEmail('match_requests',  'target_email', true);
  await attrString('match_requests', 'target_name', 200);
  await attrInt('match_requests',    'target_player_age');
  await attrEnum('match_requests',   'status', ['pending', 'accepted', 'declined'], false, 'pending');
  await attrString('match_requests', 'conversation_id', 64);

  await waitAttributesReady('match_requests');
  await ensureIndex('match_requests', 'idx_requester_email', 'key', ['requester_email']);
  await ensureIndex('match_requests', 'idx_target_email',    'key', ['target_email']);
  await ensureIndex('match_requests', 'idx_status',          'key', ['status']);
}

async function provisionCoachApplications() {
  console.log('\n[Collection] coach_applications');
  await ensureCollection('coach_applications', 'Coach Applications', ADMIN_READ_UPDATE, true);
  await attrString('coach_applications', 'first_name', 100, true);
  await attrString('coach_applications', 'last_name',  100, true);
  await attrEmail('coach_applications',  'email', true);
  await attrString('coach_applications', 'phone', 30);
  await attrDatetime('coach_applications', 'dob');
  await attrEnum('coach_applications',   'county', ['Oakland', 'Macomb', 'Wayne']);
  await attrString('coach_applications', 'coaching_background', 20000); // TEXT
  await attrString('coach_applications', 'resume_url', 1000);
  await attrBool('coach_applications',   'background_check_consent', false, false);
  await attrEnum('coach_applications',   'status', ['pending', 'reviewed', 'accepted', 'rejected'], false, 'pending');

  await waitAttributesReady('coach_applications');
  await ensureIndex('coach_applications', 'idx_status', 'key', ['status']);
  await ensureIndex('coach_applications', 'idx_email',  'key', ['email']);
}

async function provisionCoachBlocks() {
  console.log('\n[Collection] coach_blocks');
  await ensureCollection('coach_blocks', 'Coach Blocks', USERS_READ_ONLY, false);
  await attrString('coach_blocks', 'coach_id', 64, true);
  await attrString('coach_blocks', 'label', 200);
  await attrString('coach_blocks', 'start_date', 10, true);
  await attrString('coach_blocks', 'end_date', 10, true);
  await attrBool('coach_blocks',   'block_all_day', false, true);
  await attrString('coach_blocks', 'blocked_start_time', 5);
  await attrString('coach_blocks', 'blocked_end_time', 5);
  await attrBool('coach_blocks',   'is_active', false, true);

  await waitAttributesReady('coach_blocks');
  await ensureIndex('coach_blocks', 'idx_coach_id',  'key', ['coach_id']);
  await ensureIndex('coach_blocks', 'idx_is_active', 'key', ['is_active']);
}

async function provisionPricingPackages() {
  console.log('\n[Collection] pricing_packages');
  await ensureCollection('pricing_packages', 'Pricing Packages', PUBLIC_READ_ADMIN_WRITE, false);
  await attrString('pricing_packages', 'name', 200, true);
  await attrInt('pricing_packages',    'sessions');
  await attrFloat('pricing_packages',  'price', true);
  await attrString('pricing_packages', 'badge', 100);
  await attrString('pricing_packages', 'description', 1000);
  await attrString('pricing_packages', 'includes', 500, false, null, true); // string[]
  await attrInt('pricing_packages',    'display_order', false, null, null, 0);
  await attrBool('pricing_packages',   'is_visible', false, true);

  await waitAttributesReady('pricing_packages');
  await ensureIndex('pricing_packages', 'idx_is_visible',    'key', ['is_visible']);
  await ensureIndex('pricing_packages', 'idx_display_order', 'key', ['display_order']);
}

async function provisionBlogPosts() {
  console.log('\n[Collection] blog_posts');
  // docSec ON: a "read any" per-document grant is added when a post publishes.
  await ensureCollection('blog_posts', 'Blog Posts', ADMIN_READ_CREATE, true);
  await attrString('blog_posts', 'title', 300, true);
  await attrString('blog_posts', 'slug',  300, true);
  await attrString('blog_posts', 'cover_image', 1000);
  await attrString('blog_posts', 'video_url', 1000);
  await attrString('blog_posts', 'body', 100000);
  await attrString('blog_posts', 'tags', 100, false, null, true);  // string[]
  await attrEnum('blog_posts',   'status', ['draft', 'published'], false, 'draft');
  await attrString('blog_posts', 'author_name', 200);
  await attrString('blog_posts', 'excerpt', 1000);
  await attrString('blog_posts', 'seo_description', 500);
  await attrString('blog_posts', 'seo_keywords', 500);

  await waitAttributesReady('blog_posts');
  await ensureIndex('blog_posts', 'idx_slug',   'unique', ['slug']);
  await ensureIndex('blog_posts', 'idx_status', 'key',    ['status']);
}

async function provisionAuditLogs() {
  console.log('\n[Collection] audit_logs');
  // Append-only: read+create for admin label, no update/delete for anyone.
  await ensureCollection('audit_logs', 'Audit Logs', ADMIN_READ_CREATE, false);
  await attrEmail('audit_logs',  'actor_email', true);
  await attrEnum('audit_logs',   'actor_role', ['admin', 'super_admin']);
  await attrString('audit_logs', 'action', 200, true);
  await attrString('audit_logs', 'entity_type', 100);
  await attrString('audit_logs', 'entity_id', 64);
  await attrString('audit_logs', 'before', 20000);   // JSON-serialized; TEXT
  await attrString('audit_logs', 'after',  20000);   // JSON-serialized; TEXT
  await attrString('audit_logs', 'reason', 1000);
  await attrString('audit_logs', 'metadata', 20000); // JSON-serialized; TEXT

  await waitAttributesReady('audit_logs');
  await ensureIndex('audit_logs', 'idx_actor_email', 'key', ['actor_email']);
  await ensureIndex('audit_logs', 'idx_action',      'key', ['action']);
  await ensureIndex('audit_logs', 'idx_entity_id',   'key', ['entity_id']);
}

async function provisionSiteContent() {
  console.log('\n[Collection] site_content');
  await ensureCollection('site_content', 'Site Content', PUBLIC_READ_ADMIN_WRITE, false);
  await attrString('site_content', 'key', 100, true);
  await attrString('site_content', 'value', 100000, true);
  await attrEnum('site_content',   'content_type', ['text', 'richtext', 'image', 'json'], false, 'text');

  await waitAttributesReady('site_content');
  await ensureIndex('site_content', 'idx_key', 'unique', ['key']);
}

async function provisionUnsubscribeRecords() {
  console.log('\n[Collection] unsubscribe_records');
  // Server-only: public unsubscribe goes through the emailDispatch function.
  await ensureCollection('unsubscribe_records', 'Unsubscribe Records', SERVER_ONLY, false);
  await attrEmail('unsubscribe_records',  'email', true);
  await attrString('unsubscribe_records', 'reason', 500);
  await attrBool('unsubscribe_records',   'resubscribed', false, false);
  await attrString('unsubscribe_records', 'notes', 1000);

  await waitAttributesReady('unsubscribe_records');
  await ensureIndex('unsubscribe_records', 'idx_email', 'key', ['email']);
}

async function provisionUserBans() {
  console.log('\n[Collection] user_bans');
  await ensureCollection('user_bans', 'User Bans', ADMIN_FULL, false);
  await attrEmail('user_bans',  'banned_email', true);
  await attrEmail('user_bans',  'banned_by_email');
  await attrString('user_bans', 'reason', 1000, true);
  await attrBool('user_bans',   'is_permanent', false, true);
  await attrBool('user_bans',   'is_active', false, true);
  await attrEmail('user_bans',  'unbanned_by_email');
  await attrDatetime('user_bans', 'unbanned_at');

  await waitAttributesReady('user_bans');
  await ensureIndex('user_bans', 'idx_banned_email', 'key', ['banned_email']);
  await ensureIndex('user_bans', 'idx_is_active',    'key', ['is_active']);
}

// --- Production foundation collections -------------------------------------

const PRODUCTION_COLLECTIONS = [
  {
    id: 'organizations',
    name: 'Organizations',
    perms: PUBLIC_READ_ADMIN_WRITE, // writes otherwise server-only via orgAdmin fn
    docSec: false,
    attrs: [
      { type: 'string', key: 'name', size: 200, required: true },
      { type: 'string', key: 'slug', size: 160, required: true },
      { type: 'string', key: 'type', size: 120 },
      { type: 'enum', key: 'status', elements: ['draft', 'pending_review', 'active', 'suspended', 'archived'], def: 'draft' },
      { type: 'string', key: 'service_area_label', size: 500 },
      { type: 'float', key: 'lat' },
      { type: 'float', key: 'lng' },
      { type: 'string', key: 'geohash', size: 32 },
      { type: 'float', key: 'radius_miles', def: 15 },
      { type: 'string', key: 'logo_file_id', size: 128 },
      { type: 'string', key: 'brand_color', size: 20 },
      { type: 'string', key: 'stripe_account_id', size: 128 },
      { type: 'enum', key: 'payout_model', elements: ['organization', 'coach', 'split'], def: 'organization' },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
      { type: 'email', key: 'contact_email' },
      { type: 'string', key: 'contact_phone', size: 30 },
      { type: 'string', key: 'website_url', size: 1000 },
      { type: 'string', key: 'instagram_handle', size: 80 },
      { type: 'string', key: 'primary_sports', size: 1000 },
      { type: 'string', key: 'coach_count_label', size: 80 },
      { type: 'string', key: 'description', size: 20000 },
      { type: 'bool', key: 'updates_opt_in', def: false },
    ],
    indexes: [
      { key: 'idx_slug', type: 'unique', attrs: ['slug'] },
      { key: 'idx_status', type: 'key', attrs: ['status'] },
      { key: 'idx_created_by', type: 'key', attrs: ['created_by_profile_id'] },
      { key: 'idx_org_geo', type: 'key', attrs: ['geohash'] },
    ],
  },
  {
    id: 'organization_members',
    name: 'Organization Members',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'organization_id', size: 64, required: true },
      { type: 'string', key: 'profile_id', size: 64, required: true },
      { type: 'enum', key: 'role', elements: ['org_owner', 'org_admin', 'org_billing', 'org_coach_manager', 'org_viewer'], required: true },
      { type: 'enum', key: 'status', elements: ['invited', 'active', 'suspended', 'removed'], def: 'invited' },
      { type: 'string', key: 'invited_by', size: 64 },
      { type: 'datetime', key: 'accepted_at' },
    ],
    indexes: [
      { key: 'idx_org_member_org', type: 'key', attrs: ['organization_id'] },
      { key: 'idx_org_member_profile', type: 'key', attrs: ['profile_id'] },
      { key: 'idx_org_member_status', type: 'key', attrs: ['status'] },
    ],
  },
  {
    id: 'organization_coaches',
    name: 'Organization Coaches',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'organization_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'enum', key: 'status', elements: ['invited', 'active', 'suspended', 'removed'], def: 'invited' },
      { type: 'string', key: 'public_title', size: 160 },
      { type: 'string', key: 'sports', size: 120, array: true },
      { type: 'string', key: 'org_rate_overrides', size: 20000 },
      { type: 'enum', key: 'payout_recipient', elements: ['coach', 'org'], def: 'org' },
      { type: 'string', key: 'approved_by', size: 64 },
    ],
    indexes: [
      { key: 'idx_org_coach_org', type: 'key', attrs: ['organization_id'] },
      { key: 'idx_org_coach_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_org_coach_status', type: 'key', attrs: ['status'] },
    ],
  },
  {
    id: 'athlete_profiles',
    name: 'Athlete Profiles',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'profile_id', size: 64 },
      { type: 'string', key: 'parent_profile_id', size: 64 },
      { type: 'string', key: 'first_name', size: 100, required: true },
      { type: 'string', key: 'last_name', size: 100, required: true },
      { type: 'datetime', key: 'dob' },
      { type: 'string', key: 'gender_optional', size: 80 },
      { type: 'string', key: 'sports', size: 120, array: true },
      { type: 'string', key: 'skill_level', size: 100 },
      { type: 'string', key: 'emergency_contact', size: 20000 },
      { type: 'string', key: 'health_notes', size: 20000 },
      { type: 'float', key: 'location_lat' },
      { type: 'float', key: 'location_lng' },
      { type: 'string', key: 'location_label', size: 500 },
    ],
    indexes: [
      { key: 'idx_ath_profile', type: 'key', attrs: ['profile_id'] },
      { key: 'idx_ath_parent', type: 'key', attrs: ['parent_profile_id'] },
    ],
  },
  {
    id: 'guardian_athletes',
    name: 'Guardian Athletes',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'guardian_profile_id', size: 64, required: true },
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'relationship', size: 100 },
      { type: 'datetime', key: 'authority_attested_at' },
      { type: 'bool', key: 'can_book', def: true },
      { type: 'bool', key: 'can_pay', def: true },
      { type: 'bool', key: 'can_message', def: true },
    ],
    indexes: [
      { key: 'idx_guardian', type: 'key', attrs: ['guardian_profile_id'] },
      { key: 'idx_guardian_athlete', type: 'key', attrs: ['athlete_id'] },
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    perms: PUBLIC_READ_ADMIN_WRITE,
    docSec: false,
    attrs: [
      { type: 'string', key: 'sport_key', size: 100, required: true },
      { type: 'string', key: 'display_name', size: 160, required: true },
      { type: 'string', key: 'category', size: 100 },
      { type: 'string', key: 'icon', size: 100 },
      { type: 'bool', key: 'active', def: true },
      { type: 'string', key: 'recommended_specialties', size: 120, array: true },
      { type: 'string', key: 'profile_schema', size: 20000 },
      { type: 'string', key: 'positions', size: 20000 },                  // JSON
      { type: 'string', key: 'specialties', size: 20000 },                // JSON
      { type: 'string', key: 'levels', size: 2000 },                      // JSON
      { type: 'string', key: 'assessment_template', size: 100000 },       // JSON: categories → skills, 1–10 scale
    ],
    indexes: [
      { key: 'idx_sport_key', type: 'unique', attrs: ['sport_key'] },
      { key: 'idx_sport_active', type: 'key', attrs: ['active'] },
    ],
  },
  {
    id: 'coach_sport_profiles',
    name: 'Coach Sport Profiles',
    perms: PUBLIC_READ_ONLY, // writes server-only via coachSelf
    docSec: false,
    attrs: [
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'sport_key', size: 100, required: true },
      { type: 'string', key: 'specialties', size: 120, array: true },
      { type: 'string', key: 'levels', size: 120, array: true },
      { type: 'string', key: 'positions', size: 120, array: true },
      { type: 'string', key: 'credentials', size: 20000 },
      { type: 'string', key: 'session_types', size: 120, array: true },
      { type: 'string', key: 'pricing_rules', size: 20000 },
      { type: 'string', key: 'profile_sections', size: 20000 },
    ],
    indexes: [
      { key: 'idx_csp_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_csp_sport', type: 'key', attrs: ['sport_key'] },
    ],
  },
  {
    id: 'availability_blocks',
    name: 'Availability Blocks',
    perms: PUBLIC_READ_ONLY, // writes server-only via coachSelf
    docSec: false,
    attrs: [
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'organization_id', size: 64 },
      { type: 'enum', key: 'block_type', elements: ['recurring', 'date', 'blackout'], def: 'recurring' },
      { type: 'string', key: 'day', size: 20 },
      { type: 'string', key: 'date', size: 10 },
      { type: 'string', key: 'start_time', size: 5 },
      { type: 'string', key: 'end_time', size: 5 },
      { type: 'string', key: 'location', size: 1000 },
      { type: 'int', key: 'capacity', def: 1 },
      { type: 'string', key: 'session_type', size: 120 },
      { type: 'bool', key: 'active', def: true },
    ],
    indexes: [
      { key: 'idx_avail_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_avail_org', type: 'key', attrs: ['organization_id'] },
      { key: 'idx_avail_active', type: 'key', attrs: ['active'] },
    ],
  },
  {
    id: 'athlete_availability_preferences',
    name: 'Athlete Availability Preferences',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'bool', key: 'flexible', def: false },
      { type: 'string', key: 'date_window', size: 20000 },
      { type: 'string', key: 'preferred_days', size: 20, array: true },
      { type: 'string', key: 'time_of_day', size: 40, array: true },
      { type: 'string', key: 'earliest_start', size: 5 },
      { type: 'string', key: 'latest_start', size: 5 },
      { type: 'float', key: 'location_radius', def: 15 },
    ],
    indexes: [
      { key: 'idx_pref_athlete', type: 'key', attrs: ['athlete_id'] },
    ],
  },
  {
    id: 'legal_templates',
    name: 'Legal Templates',
    perms: USERS_READ_ONLY, // writes server-only
    docSec: false,
    attrs: [
      { type: 'string', key: 'template_key', size: 160, required: true },
      { type: 'enum', key: 'role', elements: ['athlete', 'guardian', 'coach', 'organization', 'admin', 'platform'], required: true },
      { type: 'string', key: 'version', size: 60, required: true },
      { type: 'string', key: 'title', size: 300, required: true },
      { type: 'string', key: 'body', size: 100000, required: true },
      { type: 'bool', key: 'required', def: true },
      { type: 'datetime', key: 'effective_at' },
      { type: 'datetime', key: 'retired_at' },
      { type: 'string', key: 'jurisdiction', size: 120 },
      { type: 'string', key: 'checksum', size: 128 },
    ],
    indexes: [
      { key: 'idx_legal_template_key', type: 'key', attrs: ['template_key'] },
      { key: 'idx_legal_role', type: 'key', attrs: ['role'] },
      { key: 'idx_legal_required', type: 'key', attrs: ['required'] },
    ],
  },
  {
    id: 'legal_agreements',
    name: 'Legal Agreements',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'template_id', size: 64, required: true },
      { type: 'string', key: 'template_key', size: 160 },
      { type: 'string', key: 'template_version', size: 60 },
      { type: 'string', key: 'template_checksum', size: 128 },
      { type: 'string', key: 'signer_profile_id', size: 64, required: true },
      { type: 'string', key: 'signer_account_id', size: 64 },
      { type: 'email', key: 'signer_email' },
      { type: 'enum', key: 'signer_role', elements: ['athlete', 'guardian', 'coach', 'organization_admin', 'admin'], required: true },
      { type: 'string', key: 'signer_relationship', size: 120 },
      { type: 'string', key: 'typed_legal_name', size: 200 },
      { type: 'string', key: 'athlete_id', size: 64 },
      { type: 'string', key: 'coach_id', size: 64 },
      { type: 'string', key: 'organization_id', size: 64 },
      { type: 'enum', key: 'status', elements: ['signed', 'superseded', 'voided'], def: 'signed' },
      { type: 'datetime', key: 'signed_at' },
      { type: 'string', key: 'ip_address', size: 80 },
      { type: 'string', key: 'user_agent', size: 1000 },
      { type: 'string', key: 'pdf_file_id', size: 128 },
      { type: 'string', key: 'signature_hash', size: 128 },
      { type: 'string', key: 'affirmations_json', size: 20000 },
      { type: 'enum', key: 'signature_method', elements: ['typed', 'drawn', 'typed_and_drawn'], def: 'typed' },
      { type: 'string', key: 'drawn_signature_hash', size: 128 },
    ],
    indexes: [
      { key: 'idx_agreement_signer', type: 'key', attrs: ['signer_profile_id'] },
      { key: 'idx_agreement_account', type: 'key', attrs: ['signer_account_id'] },
      { key: 'idx_agreement_signer_role', type: 'key', attrs: ['signer_role'] },
      { key: 'idx_agreement_template', type: 'key', attrs: ['template_id'] },
      { key: 'idx_agreement_status', type: 'key', attrs: ['status'] },
      { key: 'idx_agreement_org', type: 'key', attrs: ['organization_id'] },
      { key: 'idx_agreement_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_agreement_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_agreement_hash', type: 'key', attrs: ['signature_hash'] },
    ],
  },
  {
    id: 'legal_admin_notes',
    name: 'Legal Admin Notes',
    perms: ADMIN_READ_CREATE,
    docSec: false,
    attrs: [
      { type: 'string', key: 'agreement_id', size: 64, required: true },
      { type: 'string', key: 'admin_profile_id', size: 64, required: true },
      { type: 'string', key: 'note', size: 20000, required: true },
      { type: 'enum', key: 'visibility', elements: ['admin_only', 'master_admin'], def: 'admin_only' },
    ],
    indexes: [
      { key: 'idx_legal_note_agreement', type: 'key', attrs: ['agreement_id'] },
    ],
  },
  {
    id: 'stripe_connected_accounts',
    name: 'Stripe Connected Accounts',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'enum', key: 'owner_type', elements: ['coach', 'org'], required: true },
      { type: 'string', key: 'owner_id', size: 64, required: true },
      { type: 'string', key: 'stripe_account_id', size: 128, required: true },
      { type: 'string', key: 'account_mode', size: 80 },
      { type: 'bool', key: 'charges_enabled', def: false },
      { type: 'bool', key: 'payouts_enabled', def: false },
      { type: 'bool', key: 'details_submitted', def: false },
      { type: 'string', key: 'requirements_due', size: 20000 },
      { type: 'string', key: 'disabled_reason', size: 500 },
      { type: 'datetime', key: 'last_synced_at' },
    ],
    indexes: [
      { key: 'idx_sca_owner', type: 'key', attrs: ['owner_type', 'owner_id'] },
      // Unique guard: one connected account per owner (prevents duplicate
      // Stripe accounts from concurrent createAccount calls).
      { key: 'uniq_sca_owner', type: 'unique', attrs: ['owner_type', 'owner_id'] },
      { key: 'idx_sca_account', type: 'unique', attrs: ['stripe_account_id'] },
    ],
  },
  {
    id: 'stripe_payment_records',
    name: 'Stripe Payment Records',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'booking_id', size: 64 },
      { type: 'string', key: 'credit_id', size: 64 },
      { type: 'string', key: 'checkout_session_id', size: 160 },
      { type: 'string', key: 'payment_intent_id', size: 160 },
      { type: 'string', key: 'charge_id', size: 160 },
      { type: 'string', key: 'currency', size: 12 },
      { type: 'int', key: 'amount' },
      { type: 'int', key: 'application_fee' },
      { type: 'string', key: 'transfer_destination', size: 128 },
      { type: 'enum', key: 'status', elements: ['created', 'paid', 'failed', 'refunded', 'cancelled'], def: 'created' },
      // Granular payment state (e.g. partially_refunded/disputed) — the legacy
      // status enum cannot be extended in place, so a free-form state is added.
      { type: 'string', key: 'state', size: 40 },
      { type: 'string', key: 'refund_id', size: 160 },
      { type: 'int', key: 'refunded_amount' },
      { type: 'string', key: 'failure_reason', size: 1000 },
      { type: 'datetime', key: 'webhook_processed_at' },
      { type: 'string', key: 'metadata', size: 20000 },
    ],
    indexes: [
      { key: 'idx_pay_checkout', type: 'key', attrs: ['checkout_session_id'] },
      { key: 'idx_pay_intent', type: 'key', attrs: ['payment_intent_id'] },
      { key: 'idx_pay_charge', type: 'key', attrs: ['charge_id'] },
      { key: 'idx_pay_booking', type: 'key', attrs: ['booking_id'] },
      { key: 'idx_pay_status', type: 'key', attrs: ['status'] },
    ],
  },
  {
    id: 'stripe_transfer_records',
    name: 'Stripe Transfer Records',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'payment_record_id', size: 64, required: true },
      { type: 'string', key: 'destination_account_id', size: 128 },
      { type: 'int', key: 'amount' },
      { type: 'enum', key: 'status', elements: ['pending', 'paid', 'failed', 'reversed'], def: 'pending' },
      { type: 'string', key: 'transfer_id', size: 160 },
      { type: 'string', key: 'reversal_id', size: 160 },
    ],
    indexes: [
      { key: 'idx_transfer_payment', type: 'key', attrs: ['payment_record_id'] },
      { key: 'idx_transfer_dest', type: 'key', attrs: ['destination_account_id'] },
    ],
  },
  {
    id: 'stripe_webhook_events',
    name: 'Stripe Webhook Events',
    perms: ADMIN_READ, // server-only writes
    docSec: false,
    attrs: [
      { type: 'string', key: 'stripe_event_id', size: 160, required: true },
      { type: 'string', key: 'type', size: 160 },
      { type: 'enum', key: 'status', elements: ['processing', 'processed', 'ignored', 'failed'], def: 'processing' },
      { type: 'datetime', key: 'processed_at' },
      { type: 'string', key: 'error', size: 2000 },
      { type: 'string', key: 'payload', size: 100000 },
    ],
    indexes: [
      { key: 'idx_webhook_event', type: 'unique', attrs: ['stripe_event_id'] },
      { key: 'idx_webhook_status', type: 'key', attrs: ['status'] },
      { key: 'idx_webhook_type', type: 'key', attrs: ['type'] },
    ],
  },
  {
    id: 'admin_assignments',
    name: 'Admin Assignments',
    perms: ADMIN_READ, // server-only writes
    docSec: false,
    attrs: [
      { type: 'string', key: 'profile_id', size: 64, required: true },
      { type: 'enum', key: 'scope', elements: ['platform', 'org'], required: true },
      { type: 'string', key: 'organization_id', size: 64 },
      { type: 'enum', key: 'role', elements: ['admin', 'super_admin', 'org_owner', 'org_admin', 'org_billing', 'org_coach_manager', 'org_viewer'], required: true },
      { type: 'string', key: 'granted_by_master_admin_id', size: 64 },
      { type: 'datetime', key: 'granted_at' },
      { type: 'datetime', key: 'revoked_at' },
    ],
    indexes: [
      { key: 'idx_admin_profile', type: 'key', attrs: ['profile_id'] },
      { key: 'idx_admin_scope', type: 'key', attrs: ['scope'] },
      { key: 'idx_admin_org', type: 'key', attrs: ['organization_id'] },
    ],
  },
];

// --- New cutover collections (docs/ARCHITECTURE.md §2, "new") ---------------

const NEW_COLLECTIONS = [
  {
    id: 'coach_link_requests',
    name: 'Coach Link Requests',
    perms: ADMIN_READ, // server-only writes
    docSec: false,
    attrs: [
      { type: 'string', key: 'token', size: 128, required: true },
      { type: 'email', key: 'email', required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'enum', key: 'status', elements: ['pending', 'verified', 'expired', 'revoked'], def: 'pending' },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
      { type: 'int', key: 'attempts', def: 0 },
      { type: 'datetime', key: 'expires_at' },
    ],
    indexes: [
      { key: 'idx_link_token', type: 'key', attrs: ['token'] },
      { key: 'idx_link_email', type: 'key', attrs: ['email'] },
      { key: 'idx_link_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_link_status', type: 'key', attrs: ['status'] },
    ],
  },
  {
    id: 'payment_ledger_entries',
    name: 'Payment Ledger Entries',
    perms: ADMIN_READ, // append-only, server-authored; per-doc read for payee owner
    docSec: true,
    attrs: [
      { type: 'string', key: 'payment_record_id', size: 64, required: true },
      { type: 'enum', key: 'type', elements: ['charge', 'platform_fee', 'coach_payout', 'org_payout', 'refund', 'transfer_reversal', 'dispute'], required: true },
      { type: 'int', key: 'amount_cents', required: true },
      { type: 'string', key: 'currency', size: 12, def: 'usd' },
      { type: 'enum', key: 'owner_type', elements: ['platform', 'coach', 'org', 'client'], required: true },
      { type: 'string', key: 'owner_id', size: 64 },
      { type: 'string', key: 'stripe_ref', size: 160 },
      { type: 'string', key: 'coach_id', size: 64 },
      { type: 'string', key: 'organization_id', size: 64 },
      { type: 'string', key: 'metadata', size: 20000 },
    ],
    indexes: [
      { key: 'idx_ledger_payment', type: 'key', attrs: ['payment_record_id'] },
      { key: 'idx_ledger_owner', type: 'key', attrs: ['owner_type', 'owner_id'] },
      { key: 'idx_ledger_type', type: 'key', attrs: ['type'] },
      { key: 'idx_ledger_ref', type: 'key', attrs: ['stripe_ref'] },
    ],
  },
  {
    id: 'payout_rules',
    name: 'Payout Rules',
    perms: ADMIN_READ, // per org-coach link; per-doc read for org admins + coach
    docSec: true,
    attrs: [
      { type: 'string', key: 'organization_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'int', key: 'coach_share_bps', required: true, min: 0, max: 10000 },
      { type: 'int', key: 'org_share_bps', required: true, min: 0, max: 10000 },
      { type: 'int', key: 'platform_share_bps', required: true, min: 0, max: 10000 },
      { type: 'bool', key: 'active', def: true },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
    ],
    indexes: [
      { key: 'idx_payout_org_coach', type: 'key', attrs: ['organization_id', 'coach_id'] },
    ],
  },
  {
    id: 'notifications',
    name: 'Notifications',
    perms: ADMIN_READ, // per-doc read+update (mark-read) for the recipient
    docSec: true,
    attrs: [
      { type: 'string', key: 'recipient_profile_id', size: 64, required: true },
      { type: 'string', key: 'recipient_account_id', size: 64 },
      { type: 'string', key: 'type', size: 60 },
      { type: 'string', key: 'title', size: 200 },
      { type: 'string', key: 'body', size: 2000 },
      { type: 'string', key: 'link', size: 500 },
      { type: 'bool', key: 'read', def: false },
      { type: 'string', key: 'data', size: 2000 },
      { type: 'string', key: 'metadata', size: 2000 },
    ],
    indexes: [
      { key: 'idx_notif_recipient', type: 'key', attrs: ['recipient_profile_id', 'read'] },
    ],
  },
  {
    id: 'coach_reviews',
    name: 'Coach Reviews',
    perms: ADMIN_READ, // writes server-only via reviews fn; read-any granted on publish
    docSec: true,
    attrs: [
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'session_id', size: 64, required: true },
      { type: 'string', key: 'reviewer_profile_id', size: 64, required: true },
      { type: 'string', key: 'reviewer_name', size: 120 },
      { type: 'int', key: 'rating', required: true, min: 1, max: 5 },
      { type: 'string', key: 'comment', size: 5000 },
      { type: 'enum', key: 'status', elements: ['published', 'unpublished', 'rejected'], def: 'published' },
      { type: 'string', key: 'coach_response', size: 2000 },
      { type: 'datetime', key: 'responded_at' },
    ],
    indexes: [
      { key: 'idx_review_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_review_session', type: 'unique', attrs: ['session_id'] }, // one review per session
      { key: 'idx_review_status', type: 'key', attrs: ['status'] },
    ],
  },
  {
    id: 'athlete_goals',
    name: 'Athlete Goals',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64 },
      { type: 'string', key: 'sport_key', size: 100 },
      { type: 'string', key: 'title', size: 200, required: true },
      { type: 'string', key: 'description', size: 5000 },
      { type: 'datetime', key: 'target_date' },
      { type: 'enum', key: 'status', elements: ['active', 'achieved', 'paused', 'archived'], def: 'active' },
      { type: 'int', key: 'progress_pct', min: 0, max: 100, def: 0 },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
    ],
    indexes: [
      { key: 'idx_goal_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_goal_coach', type: 'key', attrs: ['coach_id'] },
    ],
  },
  {
    id: 'training_plans',
    name: 'Training Plans',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'sport_key', size: 100 },
      { type: 'string', key: 'title', size: 200, required: true },
      { type: 'string', key: 'description', size: 20000 },
      { type: 'enum', key: 'status', elements: ['draft', 'active', 'completed', 'archived'], def: 'draft' },
      { type: 'string', key: 'starts_on', size: 10 }, // YYYY-MM-DD
      { type: 'string', key: 'ends_on', size: 10 },   // YYYY-MM-DD
      { type: 'string', key: 'created_by_profile_id', size: 64 },
    ],
    indexes: [
      { key: 'idx_plan_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_plan_coach', type: 'key', attrs: ['coach_id'] },
    ],
  },
  {
    id: 'training_plan_items',
    name: 'Training Plan Items',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'plan_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64 },
      { type: 'string', key: 'athlete_id', size: 64 },
      { type: 'string', key: 'title', size: 200, required: true },
      { type: 'string', key: 'description', size: 20000 },
      { type: 'int', key: 'week' },
      { type: 'int', key: 'day' },
      { type: 'enum', key: 'status', elements: ['planned', 'in_progress', 'completed', 'skipped'], def: 'planned' },
      { type: 'int', key: 'position', def: 0 },
    ],
    indexes: [
      { key: 'idx_item_plan', type: 'key', attrs: ['plan_id'] },
    ],
  },
  {
    id: 'homework_assignments',
    name: 'Homework Assignments',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'session_id', size: 64 },
      { type: 'string', key: 'sport_key', size: 100 },
      { type: 'string', key: 'title', size: 200, required: true },
      { type: 'string', key: 'instructions', size: 20000 },
      { type: 'datetime', key: 'due_date' },
      { type: 'enum', key: 'status', elements: ['assigned', 'submitted', 'reviewed', 'archived'], def: 'assigned' },
      { type: 'string', key: 'athlete_notes', size: 5000 },
      { type: 'string', key: 'coach_feedback', size: 5000 },
      { type: 'datetime', key: 'submitted_at' },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
    ],
    indexes: [
      { key: 'idx_hw_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_hw_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_hw_session', type: 'key', attrs: ['session_id'] },
    ],
  },
  {
    id: 'athlete_assessments',
    name: 'Athlete Assessments',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64, required: true },
      { type: 'string', key: 'sport_key', size: 100 },
      { type: 'string', key: 'template_version', size: 60 },
      { type: 'string', key: 'scores', size: 20000 }, // JSON: categories → skills → 1–10
      { type: 'string', key: 'summary', size: 5000 },
      { type: 'string', key: 'notes', size: 20000 },
      { type: 'datetime', key: 'assessed_at' },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
    ],
    indexes: [
      { key: 'idx_assess_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_assess_coach', type: 'key', attrs: ['coach_id'] },
      { key: 'idx_assess_sport', type: 'key', attrs: ['sport_key'] },
    ],
  },
  {
    id: 'session_check_ins',
    name: 'Session Check-Ins',
    perms: ADMIN_READ,
    docSec: true,
    attrs: [
      { type: 'string', key: 'athlete_id', size: 64, required: true },
      { type: 'string', key: 'session_id', size: 64, required: true },
      { type: 'string', key: 'coach_id', size: 64 },
      { type: 'int', key: 'energy', min: 1, max: 10 },
      { type: 'int', key: 'soreness', min: 1, max: 10 },
      { type: 'int', key: 'mood', min: 1, max: 10 },
      { type: 'string', key: 'notes', size: 5000 },
      { type: 'bool', key: 'injury_flag', def: false },
      { type: 'string', key: 'created_by_profile_id', size: 64 },
      { type: 'string', key: 'created_by_role', size: 20 },
    ],
    indexes: [
      { key: 'idx_checkin_athlete', type: 'key', attrs: ['athlete_id'] },
      { key: 'idx_checkin_session', type: 'key', attrs: ['session_id'] },
    ],
  },
  {
    id: 'safety_reports',
    name: 'Safety Reports',
    perms: ADMIN_READ, // per-doc: reporter read only
    docSec: true,
    attrs: [
      { type: 'string', key: 'reporter_profile_id', size: 64, required: true },
      { type: 'string', key: 'reporter_account_id', size: 64 },
      { type: 'enum', key: 'subject_type', elements: ['coach', 'user', 'organization', 'message', 'conversation'] },
      { type: 'string', key: 'subject_id', size: 64 },
      { type: 'string', key: 'conversation_id', size: 64 },
      { type: 'string', key: 'message_id', size: 64 },
      { type: 'string', key: 'category', size: 60 },
      { type: 'string', key: 'detail', size: 20000 },
      { type: 'enum', key: 'status', elements: ['open', 'reviewing', 'resolved', 'dismissed'], def: 'open' },
      { type: 'string', key: 'resolution_notes', size: 5000 },
    ],
    indexes: [
      { key: 'idx_report_status', type: 'key', attrs: ['status'] },
      { key: 'idx_report_subject', type: 'key', attrs: ['subject_type', 'subject_id'] },
    ],
  },
];

async function attrFromDef(coll, defn) {
  const required = defn.required ?? false;
  const array = defn.array ?? false;
  switch (defn.type) {
    case 'string':
      return attrString(coll, defn.key, defn.size, required, defn.def ?? null, array);
    case 'int':
      return attrInt(coll, defn.key, required, defn.min ?? null, defn.max ?? null, defn.def ?? null, array);
    case 'float':
      return attrFloat(coll, defn.key, required, defn.min ?? null, defn.max ?? null, defn.def ?? null, array);
    case 'bool':
      return attrBool(coll, defn.key, required, defn.def ?? false, array);
    case 'datetime':
      return attrDatetime(coll, defn.key, required, defn.def ?? null, array);
    case 'enum':
      return attrEnum(coll, defn.key, defn.elements, required, defn.def ?? null, array);
    case 'email':
      return attrEmail(coll, defn.key, required, defn.def ?? null, array);
    default:
      throw new Error(`Unknown attribute type "${defn.type}" for ${coll}.${defn.key}`);
  }
}

async function provisionFromDefs(collections) {
  for (const coll of collections) {
    console.log(`\n[Collection] ${coll.id}`);
    await ensureCollection(coll.id, coll.name, coll.perms, coll.docSec);
    for (const attr of coll.attrs) {
      await attrFromDef(coll.id, attr);
    }
    // Pre-cutover deployments carry the old payout_model enum; warn if so.
    if (coll.id === 'organizations') {
      await warnIfEnumDiffers('organizations', 'payout_model', ['organization', 'coach', 'split']);
    }
    await waitAttributesReady(coll.id);
    for (const index of coll.indexes || []) {
      await ensureIndex(coll.id, index.key, index.type, index.attrs, index.orders || []);
    }
  }
}

// --- Storage buckets --------------------------------------------------------

async function provisionBuckets() {
  console.log('\n[Storage] buckets');

  // Public buckets — read any, own uploads by users, admin moderation.
  await ensureBucket('coach-photos',   'Coach Photos',   PUBLIC_BUCKET, {
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  });
  await ensureBucket('blog-media',     'Blog Media',     PUBLIC_BUCKET, {
    maximumFileSize: 20 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  });
  await ensureBucket('site-content',   'Site Content',   PUBLIC_BUCKET, {
    maximumFileSize: 20 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
  });
  await ensureBucket('org-logos', 'Organization Logos', PUBLIC_BUCKET, {
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
  });

  // Private buckets — fileSecurity ON, NO bucket-level user permissions.
  // Files are created server-side or with explicit per-file grants.
  // client-photos becomes private: athlete photos may depict minors.
  await ensureBucket('client-photos',  'Client Photos',  PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  });
  await ensureBucket('coach-resumes',  'Coach Resumes',  PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['pdf', 'doc', 'docx'],
  });
  await ensureBucket('message-attachments', 'Message Attachments', PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 25 * 1024 * 1024,
  });
  await ensureBucket('legal-documents', 'Legal Documents', PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 30 * 1024 * 1024,
    allowedFileExtensions: ['pdf'],
  });
  await ensureBucket('coach-documents', 'Coach Documents', PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 30 * 1024 * 1024,
    allowedFileExtensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
  });
  await ensureBucket('generated-receipts', 'Generated Receipts', PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['pdf'],
  });
  await ensureBucket('progress-media', 'Progress Media', PRIVATE_BUCKET, {
    fileSecurity: true,
    maximumFileSize: 100 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'],
  });
}

// --- Cutover summary ----------------------------------------------------------

function describePerms(permissions) {
  return permissions.length ? permissions.join('  ') : '(server-only — no client permissions)';
}

function printCutoverSummary() {
  console.log('\n================== PERMISSION CUTOVER SUMMARY ==================');
  console.log('\nCollections (docSec ON = per-document grants written by functions');
  console.log('and by scripts/backfill-permissions.mjs for pre-existing data):\n');
  for (const coll of CUTOVER_SUMMARY.collections) {
    console.log(`  ${coll.documentSecurity ? '[docSec ON ]' : '[docSec off]'} ${coll.id}`);
    console.log(`               ${describePerms(coll.permissions)}`);
  }
  console.log('\nBuckets (fileSecurity ON = per-file grants only):\n');
  for (const bucket of CUTOVER_SUMMARY.buckets) {
    console.log(`  ${bucket.fileSecurity ? '[fileSec ON ]' : '[fileSec off]'} ${bucket.id}`);
    console.log(`               ${describePerms(bucket.permissions)}`);
  }
  console.log('\nNext steps:');
  console.log('  1. node scripts/backfill-permissions.mjs --dry-run   (preview per-document grants)');
  console.log('  2. node scripts/backfill-permissions.mjs             (apply per-document grants)');
  console.log('================================================================');
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('Appwrite provisioner v2 (permission cutover)');
  console.log('  endpoint:', ENDPOINT);
  console.log('  project: ', PROJECT);

  await ensureDatabase();

  await provisionProfiles();
  await provisionCoaches();
  await provisionSessions();
  await provisionSessionCredits();
  await provisionConversations();
  await provisionMessages();
  await provisionMatchRequests();
  await provisionCoachApplications();
  await provisionCoachBlocks();
  await provisionPricingPackages();
  await provisionBlogPosts();
  await provisionAuditLogs();
  await provisionSiteContent();
  await provisionUnsubscribeRecords();
  await provisionUserBans();
  await provisionFromDefs(PRODUCTION_COLLECTIONS);
  await provisionFromDefs(NEW_COLLECTIONS);

  await provisionBuckets();

  printCutoverSummary();
  console.log(`\nDone. ${CUTOVER_SUMMARY.collections.length} collections + ${CUTOVER_SUMMARY.buckets.length} buckets ensured, permissions enforced.`);
}

main().catch((err) => {
  console.error('\nProvisioning failed:', err);
  process.exit(1);
});
