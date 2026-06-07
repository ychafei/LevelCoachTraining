// scripts/fix-attrs.mjs
//
// Diagnoses and fixes missing attributes on Appwrite collections.
// Lists current attributes per collection, then ensures the known-required
// ones exist. Re-runnable.
//
// Usage: node scripts/fix-attrs.mjs

import { Client, Databases } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
try {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error('Could not read .env.local'); process.exit(1);
}

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const databases = new Databases(client);
const DB = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'levelcoach';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listAttrs(coll) {
  const r = await databases.listAttributes(DB, coll);
  return new Set(r.attributes.map((a) => a.key));
}

async function safe(label, fn) {
  try { await fn(); console.log(`  + ${label}`); }
  catch (err) {
    if (err.code === 409 || /already exists/i.test(err.message || '')) {
      console.log(`  = ${label} (exists)`);
    } else {
      console.error(`  ✗ ${label}: ${err?.message || err}`);
    }
  }
}

// Definitions for known-missing attributes per collection. Easy to extend.
const FIXES = {
  profiles: [
    { key: 'matching_opted_in', fn: () => databases.createBooleanAttribute(DB, 'profiles', 'matching_opted_in', false, false) },
    { key: 'matching_age_group', fn: () => databases.createEnumAttribute(DB, 'profiles', 'matching_age_group', ['5-8', '9-12', '13+'], false) },
    { key: 'parent_consent_token', fn: () => databases.createStringAttribute(DB, 'profiles', 'parent_consent_token', 128, false) },
    { key: 'parent_consent_sent_at', fn: () => databases.createDatetimeAttribute(DB, 'profiles', 'parent_consent_sent_at', false) },
    { key: 'parent_consent_verified_at', fn: () => databases.createDatetimeAttribute(DB, 'profiles', 'parent_consent_verified_at', false) },
    { key: 'parent_consent_email', fn: () => databases.createEmailAttribute(DB, 'profiles', 'parent_consent_email', false) },
    { key: 'terms_accepted', fn: () => databases.createBooleanAttribute(DB, 'profiles', 'terms_accepted', false, false) },
    { key: 'media_release_accepted', fn: () => databases.createBooleanAttribute(DB, 'profiles', 'media_release_accepted', false, false) },
  ],
  conversations: [
    { key: 'participant_names', fn: () => databases.createStringAttribute(DB, 'conversations', 'participant_names', 200, false, null, true) },
  ],
  match_requests: [
    { key: 'target_name', fn: () => databases.createStringAttribute(DB, 'match_requests', 'target_name', 200, false) },
  ],
};

async function main() {
  console.log('Diagnosing collections in', DB);

  // Report current state of all 15 collections
  const allColls = ['profiles', 'coaches', 'sessions', 'session_credits', 'conversations', 'messages',
    'match_requests', 'coach_applications', 'coach_blocks', 'pricing_packages', 'blog_posts',
    'audit_logs', 'site_content', 'unsubscribe_records', 'user_bans'];

  for (const coll of allColls) {
    try {
      const attrs = await listAttrs(coll);
      console.log(`  ${coll}: ${attrs.size} attrs`);
    } catch (err) {
      console.log(`  ${coll}: ERROR — ${err?.message || err}`);
    }
  }

  // Apply fixes
  for (const [coll, fixes] of Object.entries(FIXES)) {
    console.log(`\n[fix] ${coll}`);
    const existing = await listAttrs(coll);
    for (const f of fixes) {
      if (existing.has(f.key)) {
        console.log(`  = ${coll}.${f.key} (exists)`);
      } else {
        await safe(`${coll}.${f.key}`, f.fn);
      }
    }
  }

  // Wait for any new attrs to become available
  console.log('\nWaiting for new attributes to become available…');
  await sleep(5000);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
