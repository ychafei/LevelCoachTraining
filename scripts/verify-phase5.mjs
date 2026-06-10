// Phase 5 — role-specific onboarding & applications.
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
  'functions/applications/src/main.js',
  'functions/family/src/main.js',
  'src/pages/CreateAccount.jsx',
  'src/pages/onboarding/OnboardingCompletion.jsx',
  'src/pages/CreateOrganization.jsx',
  'src/pages/apply/ApplyPrivateTrainingCoach.jsx',
]) check(existsSync(join(root, file)), `Missing required Phase 5 file: ${file}`);

// Coach applications: anonymous-capable, abuse-resistant, consent-gated.
includes('functions/applications/src/main.js', [
  'website',                   // honeypot
  'background_check_consent',
]);

// Parent onboarding creates structured children via the family function.
includes('functions/family/src/main.js', ['addChild', 'guardian_athletes', 'authority_attested_at']);
includes('src/features/onboarding/ParentAthletesStep.jsx', ["'family'", 'addChild']);
includes('src/pages/CreateAccount.jsx', ['guardian']);

// Role selection + completion flow via the server profile function.
includes('src/pages/onboarding/OnboardingCompletion.jsx', ['onboarding_role']);

// Org creation is server-backed (no direct organizations writes).
const org = read('src/pages/CreateOrganization.jsx');
check(org.includes('orgAdmin') || org.includes("organizationRepo.create"), 'CreateOrganization must create orgs via the orgAdmin function path');
check(!org.includes('createDocument('), 'CreateOrganization must not write collections directly');

if (failures.length) {
  console.error('Phase 5 verification failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 5 verification passed.');
