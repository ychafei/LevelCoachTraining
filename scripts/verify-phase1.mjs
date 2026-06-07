import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    assert(content.includes(snippet), `${path} is missing: ${snippet}`);
  }
}

const requiredFiles = [
  'src/lib/roles.js',
  'src/pages/onboarding/OnboardingCompletion.jsx',
  'src/pages/athlete/AthletePortal.jsx',
  'src/pages/parent/ParentPortal.jsx',
  'src/pages/organization/OrganizationPortal.jsx',
  'src/pages/master-admin/MasterAdminPortal.jsx',
  'functions/bootstrapMasterAdmin/src/main.js',
  'functions/grantAdminRole/src/main.js',
];

for (const file of requiredFiles) {
  assert(existsSync(join(root, file)), `Missing required Phase 1 file: ${file}`);
}

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
]);

includes('src/components/guards/RouteGuards.jsx', [
  'MASTER_ADMIN_EMAIL',
  'canBootstrapMasterAdmin',
  'isGuardian',
  'isOrganizationAdmin',
  'This feature is for athlete client accounts.',
]);

includes('src/pages/CreateOrganization.jsx', [
  'organizationRepo.create',
  'organizationMemberRepo.create',
  "storage.uploadFile('org-logos'",
  "onboarding_role: 'organization'",
  "onboarding_status: 'complete'",
  'primary_organization_id: organization.id',
]);

includes('src/pages/apply/ApplyPrivateTrainingCoach.jsx', [
  'usingExistingAccount',
  "onboarding_role: 'coach'",
  "onboarding_status: 'complete'",
]);

includes('src/pages/admin/AdminUsers.jsx', [
  'isMasterAdmin',
  'auth.grantAdminRole',
  'Only the locked master admin',
]);

includes('functions/grantAdminRole/src/main.js', [
  "new Set(['user', 'coach', 'admin', 'super_admin'])",
  'actor?.master_admin_locked !== true',
  "action: isPlatformAdminRole ? 'admin_assignment.grant' : 'admin_assignment.revoke'",
]);

includes('scripts/provision-appwrite.mjs', [
  "'primary_organization_id'",
  "'contact_email'",
  "'contact_phone'",
  "'website_url'",
  "'instagram_handle'",
  "'primary_sports'",
  "'coach_count_label'",
  "'updates_opt_in'",
]);

console.log('Phase 1 verification passed.');
