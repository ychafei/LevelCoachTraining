// scripts/create-fresh-role-accounts.mjs
//
// Creates never-logged-in Appwrite test accounts for launch QA. The default
// run is a dry run; real creation requires BOTH:
//
//   CONFIRM_CREATE_TEST_ACCOUNTS=1 node scripts/create-fresh-role-accounts.mjs --execute
//
// Default roles create five accounts total:
//   adult_athlete, parent, coach_applicant, organization, minor_athlete
//
// Optional:
//   --count=2
//   --roles=adult_athlete,parent
//   --email-domain=example.com

import { Client, Databases, ID, Permission, Query, Role, Users } from 'node-appwrite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env.local');

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
  console.error(`Could not read ${envPath}.`);
  process.exit(1);
}

const args = new Map(
  process.argv.slice(2).map((arg) => {
    if (!arg.startsWith('--')) return [arg, true];
    const [key, value] = arg.slice(2).split('=');
    return [key, value ?? true];
  }),
);

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing required env vars. Need VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY.');
  process.exit(1);
}

const EXECUTE = args.has('execute');
const COUNT = Math.max(1, Math.min(20, Number(args.get('count') || 1)));
const EMAIL_DOMAIN = String(args.get('email-domain') || process.env.FRESH_ACCOUNT_EMAIL_DOMAIN || 'lctrainings.test')
  .replace(/^@/, '')
  .toLowerCase();
const ROLE_KEYS = String(args.get('roles') || 'adult_athlete,parent,coach_applicant,organization,minor_athlete')
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean);

const ROLE_BUILDERS = {
  adult_athlete: (n) => ({
    first_name: `Fresh Athlete ${n}`,
    last_name: 'QA',
    dob: '2004-06-01T00:00:00.000Z',
    is_minor: false,
    onboarding_role: 'athlete',
    onboarding_status: 'complete',
    profile_setup_complete: true,
    terms_accepted: true,
    sports: ['Soccer'],
    skill_level: 'Beginner',
  }),
  parent: (n) => ({
    first_name: `Fresh Parent ${n}`,
    last_name: 'QA',
    onboarding_role: 'parent',
    onboarding_status: 'complete',
    profile_setup_complete: true,
    terms_accepted: true,
  }),
  coach_applicant: (n) => ({
    first_name: `Fresh Coach Applicant ${n}`,
    last_name: 'QA',
    onboarding_role: 'coach_applicant',
    onboarding_status: 'complete',
    profile_setup_complete: true,
    terms_accepted: true,
  }),
  organization: (n) => ({
    first_name: `Fresh Org ${n}`,
    last_name: 'Owner',
    onboarding_role: 'organization',
    onboarding_status: 'complete',
    profile_setup_complete: true,
    terms_accepted: true,
  }),
  minor_athlete: (n) => ({
    first_name: `Fresh Minor ${n}`,
    last_name: 'QA',
    dob: '2011-06-01T00:00:00.000Z',
    is_minor: true,
    parent_first_name: `Fresh Parent ${n}`,
    parent_last_name: 'QA',
    parent_email: `fresh-parent-reference-${n}@${EMAIL_DOMAIN}`,
    parent_relationship: 'Parent',
    onboarding_role: 'athlete',
    onboarding_status: 'complete',
    profile_setup_complete: true,
    sports: ['Soccer'],
    skill_level: 'Beginner',
  }),
};

for (const roleKey of ROLE_KEYS) {
  if (!ROLE_BUILDERS[roleKey]) {
    console.error(`Unknown role "${roleKey}". Known: ${Object.keys(ROLE_BUILDERS).join(', ')}`);
    process.exit(1);
  }
}

if (EXECUTE && process.env.CONFIRM_CREATE_TEST_ACCOUNTS !== '1') {
  console.error('Refusing to create accounts. Set CONFIRM_CREATE_TEST_ACCOUNTS=1 and pass --execute.');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const users = new Users(client);
const databases = new Databases(client);

function passwordFor(roleKey) {
  return `LC!${roleKey.replace(/[^a-z0-9]/gi, '')}${randomBytes(8).toString('hex')}9`;
}

async function profileExists(email) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', email),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return Boolean(rows.documents[0]);
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const planned = [];
for (const roleKey of ROLE_KEYS) {
  for (let i = 1; i <= COUNT; i += 1) {
    const email = `fresh-${roleKey.replace(/_/g, '-')}-${stamp}-${i}@${EMAIL_DOMAIN}`;
    planned.push({ roleKey, email, password: passwordFor(roleKey), profile: ROLE_BUILDERS[roleKey](i) });
  }
}

console.log(`Target Appwrite project: ${PROJECT}`);
console.log(`Database: ${DB_ID}`);
console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
console.log(`Accounts planned: ${planned.length}`);

if (!EXECUTE) {
  for (const account of planned) console.log(`- ${account.roleKey}: ${account.email}`);
  console.log('\nDry run only. Re-run with CONFIRM_CREATE_TEST_ACCOUNTS=1 and --execute to create them.');
  process.exit(0);
}

const created = [];
for (const accountPlan of planned) {
  if (await profileExists(accountPlan.email)) {
    throw new Error(`Profile already exists for ${accountPlan.email}`);
  }
  const account = await users.create(ID.unique(), accountPlan.email, undefined, accountPlan.password);
  const profile = await databases.createDocument(DB_ID, 'profiles', ID.unique(), {
    account_id: account.$id,
    role: 'user',
    email: accountPlan.email,
    ...accountPlan.profile,
  }, [Permission.read(Role.user(account.$id))]);

  created.push({
    role: accountPlan.roleKey,
    email: accountPlan.email,
    password: accountPlan.password,
    account_id: account.$id,
    profile_id: profile.$id,
  });
  console.log(`Created ${accountPlan.roleKey}: ${accountPlan.email}`);
}

mkdirSync(join(root, '.codex-qa'), { recursive: true });
const outputPath = join(root, '.codex-qa', `fresh-role-accounts-${stamp}.json`);
writeFileSync(outputPath, `${JSON.stringify({ project: PROJECT, database: DB_ID, created }, null, 2)}\n`, 'utf8');
console.log(`\nCredentials written to ${outputPath}`);
