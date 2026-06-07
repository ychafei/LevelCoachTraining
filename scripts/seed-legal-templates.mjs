import { Client, Databases, ID, Query } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_TEMPLATE_SEED, templateIdentity } from '../src/lib/legalTemplateDefinitions.js';

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
const PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing required env vars. Need: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

function checksum(template) {
  return createHash('sha256').update(templateIdentity(template)).digest('hex');
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

console.log(`Seeding legal templates into ${DB_ID}`);

const existing = await databases.listDocuments(DB_ID, 'legal_templates', [
  Query.limit(500),
]).catch((err) => {
  console.error(`Could not list legal_templates: ${err?.message || err}`);
  process.exit(1);
});

for (const template of LEGAL_TEMPLATE_SEED) {
  const found = existing.documents.find((doc) =>
    doc.template_key === template.template_key && doc.version === template.version
  );
  const payload = {
    ...template,
    effective_at: template.effective_at || new Date().toISOString(),
    checksum: checksum(template),
  };

  if (found) {
    await databases.updateDocument(DB_ID, 'legal_templates', found.$id, payload);
    console.log(`  updated ${template.template_key} v${template.version}`);
  } else {
    await databases.createDocument(DB_ID, 'legal_templates', ID.unique(), payload);
    console.log(`  created ${template.template_key} v${template.version}`);
  }
}

console.log('Legal template seed complete. Have counsel review final text before production launch.');
