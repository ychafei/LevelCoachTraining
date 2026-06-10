// Phase 1 — roles, portals, routing.
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
const excludes = (path, snippets) => {
  const content = read(path);
  for (const s of snippets) check(!content.includes(s), `${path} must NOT contain: ${s}`);
};

for (const file of [
  'src/lib/roles.js',
  'src/pages/onboarding/OnboardingCompletion.jsx',
  'src/pages/athlete/AthletePortal.jsx',
  'src/pages/parent/ParentPortal.jsx',
  'src/pages/organization/OrganizationPortal.jsx',
  'src/pages/master-admin/MasterAdminPortal.jsx',
  'functions/bootstrapMasterAdmin/src/main.js',
  'functions/grantAdminRole/src/main.js',
  'functions/accountProfile/src/main.js',
]) check(existsSync(join(root, file)), `Missing required Phase 1 file: ${file}`);

includes('src/App.jsx', [
  'RequireOnboardingComplete',
  'RequireMasterAdmin',
  'RequireOrganizationAdmin',
  'RequireGuardianOfAthlete',
  'RequireAthlete',
  'path="/onboarding"',
  'path="/athlete"',
  'path="/parent"',
  'path="/organization"',
  'path="/master-admin"',
  'path="/organizations"',
  'path="/for-athletes"',
  'path="/for-parents"',
  'path="/for-organizations"',
]);

// Authorization is server-derived; no hardcoded owner identity in the client.
// (Comments may mention the MASTER_ADMIN_EMAIL env var; actual addresses may not appear.)
excludes('src/components/guards/RouteGuards.jsx', ['@gmail.com']);
excludes('src/lib/roleHome.js', ['@gmail.com']);

// Profiles are server-managed: the client never creates profile documents.
excludes('src/lib/auth.js', ['createDocument(']);
includes('src/lib/auth.js', ["'accountProfile'"]);

if (failures.length) {
  console.error('Phase 1 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 1 verification passed.');
