// One-off repair (2026-06-11): the master admin's coach record was created via
// the old half-link path — profiles.coach_id was set, but coaches.user_id and
// the 'coach' account label were never written, so every coachSelf call
// returned 403 "Coach access required." This applies linkCoachAccount
// semantics to that pair: reverse user_id link + stacked coach label
// (admin/superadmin preserved) + audit row. Idempotent: aborts if anything
// no longer matches the diagnosed state. Safe to delete after running.
//
// Usage: node scripts/repair-link-master-coach.mjs
import { Client, Users, Databases, ID } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const users = new Users(client);
const databases = new Databases(client);
const DB = env.APPWRITE_DATABASE_ID || 'lctraining';

const ACCOUNT_ID = '69f083d1002d87ac5d85';
const COACH_ID = '69f079600025b3f99325';
const PROFILE_ID = '69f081ed00315ffc730e';

// Safety: confirm the documents still match the diagnosed state.
const account = await users.get(ACCOUNT_ID);
const profile = await databases.getDocument(DB, 'profiles', PROFILE_ID);
const coach = await databases.getDocument(DB, 'coaches', COACH_ID);
if (account.email !== env.MASTER_ADMIN_EMAIL) throw new Error('account email mismatch — aborting');
if (profile.account_id !== ACCOUNT_ID || profile.coach_id !== COACH_ID) throw new Error('profile linkage mismatch — aborting');
if (coach.user_id) throw new Error(`coach.user_id already set to ${coach.user_id} — nothing to repair`);

await databases.updateDocument(DB, 'coaches', COACH_ID, { user_id: ACCOUNT_ID });
const nextLabels = [...new Set([...(account.labels || []), 'coach'])];
await users.updateLabels(ACCOUNT_ID, nextLabels);
await databases.createDocument(DB, 'audit_logs', ID.unique(), {
  actor_email: env.MASTER_ADMIN_EMAIL,
  actor_role: 'super_admin',
  action: 'coach.link_account',
  entity_type: 'Coach',
  entity_id: COACH_ID,
  before: JSON.stringify({ user_id: '', labels: account.labels || [] }),
  after: JSON.stringify({ user_id: ACCOUNT_ID, labels: nextLabels }),
  metadata: JSON.stringify({ profile_id: PROFILE_ID, note: 'manual repair: stacked coach label + reverse link onto master admin (half-linked coach record)' }),
}).catch((e) => console.log('audit write skipped:', e.message));

const after = await users.get(ACCOUNT_ID);
const coachAfter = await databases.getDocument(DB, 'coaches', COACH_ID);
console.log('DONE. labels:', JSON.stringify(after.labels), '| coach.user_id:', coachAfter.user_id);
console.log('Sign out and back in (or hard-refresh) for the coach portal to pick up the new label.');
