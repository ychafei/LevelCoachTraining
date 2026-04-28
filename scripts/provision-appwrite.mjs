// scripts/provision-appwrite.mjs
//
// One-shot, idempotent provisioner for the LCTraining Appwrite project.
// Creates the database, 15 collections (with attributes + indexes), and 6
// storage buckets. Safe to re-run — collections/attributes/indexes/buckets
// that already exist are skipped.
//
// Usage:
//   node scripts/provision-appwrite.mjs
//
// Env (read from .env.local):
//   VITE_APPWRITE_ENDPOINT    e.g. https://nyc.cloud.appwrite.io/v1
//   VITE_APPWRITE_PROJECT_ID  e.g. 69efb263000fe1c34344
//   APPWRITE_API_KEY          server-side key (no VITE_ prefix)

import { Client, Databases, Storage, Permission, Role } from 'node-appwrite';
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

const DB_ID = 'lctraining';

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
  await safe(`database "${DB_ID}"`, () => databases.create(DB_ID, 'LCTraining'));
}

// Collection-level permissions used during provisioning.
// Permissive enough for development; tighten per-document at cutover.
const PUBLIC_READ_AUTH_WRITE = [
  Permission.read(Role.any()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

const AUTH_ONLY = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

async function ensureCollection(id, name, perms = AUTH_ONLY) {
  await safe(`collection "${id}"`, () => databases.createCollection(DB_ID, id, name, perms));
}

// Attribute creators — Appwrite Node SDK signatures
async function attrString(coll, key, size, required = false, def = null, array = false) {
  await safe(`  ${coll}.${key} string(${size})`, () =>
    databases.createStringAttribute(DB_ID, coll, key, size, required, def, array)
  );
}
async function attrInt(coll, key, required = false, min = null, max = null, def = null, array = false) {
  await safe(`  ${coll}.${key} int`, () =>
    databases.createIntegerAttribute(DB_ID, coll, key, required, min, max, def, array)
  );
}
async function attrFloat(coll, key, required = false, min = null, max = null, def = null, array = false) {
  await safe(`  ${coll}.${key} float`, () =>
    databases.createFloatAttribute(DB_ID, coll, key, required, min, max, def, array)
  );
}
async function attrBool(coll, key, required = false, def = false, array = false) {
  await safe(`  ${coll}.${key} bool`, () =>
    databases.createBooleanAttribute(DB_ID, coll, key, required, def, array)
  );
}
async function attrDatetime(coll, key, required = false, def = null, array = false) {
  await safe(`  ${coll}.${key} datetime`, () =>
    databases.createDatetimeAttribute(DB_ID, coll, key, required, def, array)
  );
}
async function attrEnum(coll, key, elements, required = false, def = null, array = false) {
  await safe(`  ${coll}.${key} enum[${elements.join(',')}]`, () =>
    databases.createEnumAttribute(DB_ID, coll, key, elements, required, def, array)
  );
}
async function attrEmail(coll, key, required = false, def = null, array = false) {
  await safe(`  ${coll}.${key} email`, () =>
    databases.createEmailAttribute(DB_ID, coll, key, required, def, array)
  );
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

async function ensureBucket(id, name, perms = AUTH_ONLY, opts = {}) {
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
}

// --- Collection definitions -------------------------------------------------

async function provisionProfiles() {
  console.log('\n[Collection] profiles');
  await ensureCollection('profiles', 'Profiles');
  await attrString('profiles', 'account_id', 64);                      // links to Appwrite Account.$id at cutover
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

  await waitAttributesReady('profiles');
  await ensureIndex('profiles', 'idx_email',          'unique', ['email']);
  await ensureIndex('profiles', 'idx_account_id',     'key',    ['account_id']);
  await ensureIndex('profiles', 'idx_coach_id',       'key',    ['coach_id']);
  await ensureIndex('profiles', 'idx_matching',       'key',    ['matching_opted_in']);
  await ensureIndex('profiles', 'idx_parent_consent', 'key',    ['parent_consent_token']);
}

async function provisionCoaches() {
  console.log('\n[Collection] coaches');
  await ensureCollection('coaches', 'Coaches', PUBLIC_READ_AUTH_WRITE);
  await attrString('coaches', 'first_name', 100, true);
  await attrString('coaches', 'last_name',  100, true);
  await attrEmail('coaches',  'email');
  await attrDatetime('coaches', 'email_verified_at');
  await attrString('coaches', 'phone', 30);
  await attrEnum('coaches',   'county', ['Oakland', 'Macomb', 'Wayne'], true);
  await attrString('coaches', 'training_area', 255);
  await attrString('coaches', 'bio', 20000); // TEXT
  await attrString('coaches', 'quote', 1000);
  await attrString('coaches', 'photo_url', 1000);
  await attrString('coaches', 'specializations', 100, false, null, true); // string[]
  await attrString('coaches', 'venmo', 100);
  await attrString('coaches', 'zelle', 100);
  await attrString('coaches', 'cashapp', 100);
  await attrString('coaches', 'paypal', 200);
  await attrBool('coaches',   'cash_accepted', false, false);
  await attrString('coaches', 'availability', 20000);                    // JSON-serialized; TEXT
  await attrBool('coaches',   'is_active', false, true);
  await attrBool('coaches',   'is_head_coach', false, false);
  await attrInt('coaches',    'display_order', false, null, null, 0);
  await attrEnum('coaches',   'platform_fee_type', ['none', 'percent', 'fixed'], false, 'none');
  await attrFloat('coaches',  'platform_fee_value', false, null, null, 0);
  await attrString('coaches', 'user_id', 64);                            // link to profiles.account_id

  await waitAttributesReady('coaches');
  await ensureIndex('coaches', 'idx_is_active',     'key', ['is_active']);
  await ensureIndex('coaches', 'idx_county',        'key', ['county']);
  await ensureIndex('coaches', 'idx_display_order', 'key', ['display_order']);
  await ensureIndex('coaches', 'idx_user_id',       'key', ['user_id']);
}

async function provisionSessions() {
  console.log('\n[Collection] sessions');
  await ensureCollection('sessions', 'Sessions');
  await attrString('sessions', 'coach_id', 64, true);
  await attrEmail('sessions',  'client_email', true);
  await attrString('sessions', 'client_name', 200, true);
  await attrInt('sessions',    'client_age');                             // optional, denormalized
  await attrString('sessions', 'date', 10, true);                         // YYYY-MM-DD
  await attrString('sessions', 'start_time', 5, true);                    // HH:MM
  await attrInt('sessions',    'duration_minutes', true);
  await attrEnum('sessions',   'status', ['pending', 'confirmed', 'cancelled', 'completed'], false, 'pending');
  await attrFloat('sessions',  'total_price');
  await attrEnum('sessions',   'payment_status', ['unpaid', 'paid'], false, 'unpaid');
  await attrEnum('sessions',   'payment_method', ['electronic', 'cash', 'credits']);
  await attrEnum('sessions',   'county', ['Oakland', 'Macomb', 'Wayne']);
  await attrString('sessions', 'notes', 20000);                          // TEXT
  await attrString('sessions', 'session_goals', 1000);
  await attrString('sessions', 'cancellation_reason', 500);
  await attrString('sessions', 'credit_id', 64);                          // link to session_credits
  await attrString('sessions', 'homework', 20000);                       // TEXT
  await attrString('sessions', 'client_visible_notes', 20000);           // TEXT

  await waitAttributesReady('sessions');
  await ensureIndex('sessions', 'idx_coach_id',     'key', ['coach_id']);
  await ensureIndex('sessions', 'idx_client_email', 'key', ['client_email']);
  await ensureIndex('sessions', 'idx_date',         'key', ['date']);
  await ensureIndex('sessions', 'idx_status',       'key', ['status']);
  await ensureIndex('sessions', 'idx_credit_id',    'key', ['credit_id']);
}

async function provisionSessionCredits() {
  console.log('\n[Collection] session_credits');
  await ensureCollection('session_credits', 'Session Credits');
  await attrEmail('session_credits',  'client_email', true);
  await attrString('session_credits', 'client_name', 200);
  await attrString('session_credits', 'package_id', 64, true);
  await attrString('session_credits', 'package_name', 200);
  await attrInt('session_credits',    'total_credits', true);
  await attrInt('session_credits',    'used_credits', false, null, null, 0);
  await attrInt('session_credits',    'session_duration_minutes');
  await attrFloat('session_credits',  'per_session_base_price');
  await attrEnum('session_credits',   'payment_processor',
    ['paypal', 'stripe', 'admin_grant', 'cash_pending']);

  await waitAttributesReady('session_credits');
  await ensureIndex('session_credits', 'idx_client_email', 'key', ['client_email']);
  await ensureIndex('session_credits', 'idx_package_id',   'key', ['package_id']);
}

async function provisionConversations() {
  console.log('\n[Collection] conversations');
  await ensureCollection('conversations', 'Conversations');
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
  await ensureCollection('messages', 'Messages');
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
  await ensureCollection('match_requests', 'Match Requests');
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
  await ensureCollection('coach_applications', 'Coach Applications');
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
  await ensureCollection('coach_blocks', 'Coach Blocks', PUBLIC_READ_AUTH_WRITE);
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
  await ensureCollection('pricing_packages', 'Pricing Packages', PUBLIC_READ_AUTH_WRITE);
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
  await ensureCollection('blog_posts', 'Blog Posts', PUBLIC_READ_AUTH_WRITE);
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
  await ensureCollection('audit_logs', 'Audit Logs');
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
  await ensureCollection('site_content', 'Site Content', PUBLIC_READ_AUTH_WRITE);
  await attrString('site_content', 'key', 100, true);
  await attrString('site_content', 'value', 100000, true);
  await attrEnum('site_content',   'content_type', ['text', 'richtext', 'image', 'json'], false, 'text');

  await waitAttributesReady('site_content');
  await ensureIndex('site_content', 'idx_key', 'unique', ['key']);
}

async function provisionUnsubscribeRecords() {
  console.log('\n[Collection] unsubscribe_records');
  await ensureCollection('unsubscribe_records', 'Unsubscribe Records');
  await attrEmail('unsubscribe_records',  'email', true);
  await attrString('unsubscribe_records', 'reason', 500);
  await attrBool('unsubscribe_records',   'resubscribed', false, false);
  await attrString('unsubscribe_records', 'notes', 1000);

  await waitAttributesReady('unsubscribe_records');
  await ensureIndex('unsubscribe_records', 'idx_email', 'key', ['email']);
}

async function provisionUserBans() {
  console.log('\n[Collection] user_bans');
  await ensureCollection('user_bans', 'User Bans');
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

// --- Storage buckets --------------------------------------------------------

async function provisionBuckets() {
  console.log('\n[Storage] buckets');

  // Public-read buckets — used for visible profile/CMS images.
  const publicPerms = [
    Permission.read(Role.any()),
    Permission.create(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];

  await ensureBucket('coach-photos',   'Coach Photos',   publicPerms, {
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  });
  await ensureBucket('client-photos',  'Client Photos',  publicPerms, {
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  });
  await ensureBucket('blog-media',     'Blog Media',     publicPerms, {
    maximumFileSize: 20 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  });
  await ensureBucket('site-content',   'Site Content',   publicPerms, {
    maximumFileSize: 20 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
  });

  // Private buckets — accessed via signed URLs only.
  await ensureBucket('coach-resumes',  'Coach Resumes',  AUTH_ONLY, {
    maximumFileSize: 10 * 1024 * 1024,
    allowedFileExtensions: ['pdf', 'doc', 'docx'],
  });
  await ensureBucket('message-attachments', 'Message Attachments', AUTH_ONLY, {
    maximumFileSize: 25 * 1024 * 1024,
  });
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('Appwrite provisioner');
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

  await provisionBuckets();

  console.log('\nDone. 15 collections + 6 buckets ensured in Appwrite.');
}

main().catch((err) => {
  console.error('\nProvisioning failed:', err);
  process.exit(1);
});
