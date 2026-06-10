// Phase 6 — admin operations & master-admin root of trust.
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

for (const file of [
  'functions/adminOps/src/main.js',
  'functions/grantAdminRole/src/main.js',
  'functions/bootstrapMasterAdmin/src/main.js',
  'src/pages/admin/AdminUsers.jsx',
  'src/pages/admin/AdminOrganizations.jsx',
  'src/pages/admin/AdminReconciliation.jsx',
  'src/pages/admin/AdminSafety.jsx',
]) check(existsSync(join(root, file)), `Missing required Phase 6 file: ${file}`);

// Role grants require the superadmin LABEL and the locked master profile.
includes('functions/grantAdminRole/src/main.js', ['superadmin', 'master_admin_locked']);

// Bootstrap is env-driven; no hardcoded identity anywhere server-side.
const bootstrap = read('functions/bootstrapMasterAdmin/src/main.js');
check(bootstrap.includes('MASTER_ADMIN_EMAIL'), 'bootstrap must read MASTER_ADMIN_EMAIL');
check(!bootstrap.includes('@gmail.com'), 'bootstrap must not hardcode an owner email');

// Admin operations are function-backed (bans, invites, credits, coach linking).
includes('functions/adminOps/src/main.js', ['inviteUser', 'banUser', 'grantCredits', 'linkCoachAccount', 'setCoachFee']);
includes('src/pages/admin/AdminUsers.jsx', ['adminOps']);

// The provisioner models the assignment trail.
includes('scripts/provision-appwrite.mjs', ["'master_admin_locked'", "'admin_assignments'", "'revoked_at'"]);

if (failures.length) {
  console.error('Phase 6 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 6 verification passed.');
