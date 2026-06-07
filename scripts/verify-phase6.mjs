import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

let failures = 0;

function ok(message) {
  console.log(`ok - ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`not ok - ${message}`);
}

function includes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    if (content.includes(snippet)) ok(`${path} includes ${snippet}`);
    else fail(`${path} is missing ${snippet}`);
  }
}

const requiredFiles = [
  'functions/bootstrapMasterAdmin/src/main.js',
  'functions/grantAdminRole/src/main.js',
  'src/pages/master-admin/MasterAdminPortal.jsx',
  'src/components/guards/RouteGuards.jsx',
  'src/pages/admin/AdminUsers.jsx',
];

for (const file of requiredFiles) {
  if (existsSync(join(root, file))) ok(`${file} exists`);
  else fail(`${file} is missing`);
}

includes('functions/bootstrapMasterAdmin/src/main.js', [
  'MASTER_ADMIN_EMAIL',
  'account.emailVerification !== true',
  'master_admin_locked: true',
  "action: 'master_admin.bootstrap'",
]);

includes('functions/grantAdminRole/src/main.js', [
  "actor?.master_admin_locked !== true",
  'openPlatformAssignments',
  'revokeOpenAssignments',
  'revoked_assignment_ids',
  "if (target.master_admin_locked)",
  "action: isPlatformAdminRole ? 'admin_assignment.grant' : 'admin_assignment.revoke'",
]);

includes('src/pages/master-admin/MasterAdminPortal.jsx', [
  'adminAssignmentRepo',
  'auditLogRepo',
  'auth.grantAdminRole',
  'masterEmailVerified',
  'Resend verification email',
  'Grant Access',
  'Revoke',
  'Delegation audit trail',
  'Only this locked master-admin route can grant platform admin access.',
]);

includes('src/lib/auth.js', [
  'email_verified',
  'emailVerification',
  'data.detail || data.error',
]);

includes('src/components/guards/RouteGuards.jsx', [
  'RequireMasterAdmin',
  'canBootstrapMasterAdmin',
  'master_admin_locked',
  'Master Admin Only',
]);

includes('src/pages/admin/AdminUsers.jsx', [
  'isMasterAdmin',
  'auth.grantAdminRole',
  'Only the locked master admin can change platform admin roles.',
  'Only the locked master admin can invite new admins.',
]);

includes('scripts/provision-appwrite.mjs', [
  "'master_admin_locked'",
  "'master_admin_bootstrapped_at'",
  "'admin_assignments'",
  "'revoked_at'",
]);

if (failures > 0) {
  console.error(`Phase 6 verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Phase 6 verification passed.');
