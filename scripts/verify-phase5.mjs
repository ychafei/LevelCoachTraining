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

function excludes(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) ok(`${path} excludes ${snippet}`);
    else fail(`${path} still contains ${snippet}`);
  }
}

const requiredFiles = [
  'src/pages/onboarding/OnboardingCompletion.jsx',
  'src/pages/CreateAccount.jsx',
  'src/pages/Login.jsx',
  'src/lib/roles.js',
  'src/lib/roleHome.js',
];

for (const file of requiredFiles) {
  if (existsSync(join(root, file))) ok(`${file} exists`);
  else fail(`${file} is missing`);
}

includes('src/lib/roles.js', [
  "user.profile_setup_complete === true ? 'athlete' : ''",
  '&& !!profileRole(user)',
]);

includes('src/lib/roleHome.js', [
  'onboardingPath',
  'postAuthRedirectPath',
  'isMasterAdminBootstrapAccount',
  "return '/master-admin'",
  "requestedNext?.startsWith('/onboarding')",
]);

includes('src/pages/Login.jsx', [
  'postAuthRedirectPath',
  'navigate(postAuthRedirectPath(fresh, safeNext)',
]);

includes('src/pages/CreateAccount.jsx', [
  'ParentSignup',
  "'/create-account/parent'",
  "onboardingPath(getSafeNextPath(explicitNext) || '', 'athlete')",
  "onboardingPath(getSafeNextPath(explicitNext) || '', 'parent')",
  "onboarding_role: 'parent'",
]);

includes('src/App.jsx', [
  'ParentSignup',
  'RoleHomeRoute',
  'path="/dashboard" element={<RoleHomeRoute />}',
  'path="/create-account/parent"',
]);

includes('src/pages/onboarding/OnboardingCompletion.jsx', [
  "params.get('role')",
  'Resume setup',
  'continueSpecializedFlow',
  "'coach_applicant'",
  "'organization'",
  'required legal packet appears',
]);
excludes('src/pages/onboarding/OnboardingCompletion.jsx', [
  'Legal packet completion will be enforced in Phase 2.',
]);

includes('src/pages/apply/ApplyPrivateTrainingCoach.jsx', [
  "onboardingPath('/apply/private-training-coach', 'coach_applicant')",
]);

includes('src/pages/CreateOrganization.jsx', [
  "onboardingPath('/create-organization', 'organization')",
]);

if (failures > 0) {
  console.error(`Phase 5 verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Phase 5 verification passed.');
