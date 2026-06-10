import { Client, Databases, ID, Query } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPORTS_CATALOG } from '../src/lib/sportsCatalog.js';

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

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

console.log(`Seeding ${SPORTS_CATALOG.length} sports into ${DB_ID}`);

const existing = await databases.listDocuments(DB_ID, 'sports', [
  Query.limit(500),
]).catch((err) => {
  console.error(`Could not list sports: ${err?.message || err}`);
  process.exit(1);
});

for (const sport of SPORTS_CATALOG) {
  const found = existing.documents.find((doc) => doc.sport_key === sport.sport_key);
  const payload = {
    sport_key: sport.sport_key,
    display_name: sport.display_name,
    category: sport.category,
    icon: sport.icon,
    active: true,
    positions: JSON.stringify(sport.positions),
    specialties: JSON.stringify(sport.specialties),
    levels: JSON.stringify(sport.levels),
    assessment_template: JSON.stringify(sport.assessment_template),
    recommended_specialties: sport.specialties,
  };

  try {
    if (found) {
      await databases.updateDocument(DB_ID, 'sports', found.$id, payload);
      console.log(`  updated ${sport.sport_key}`);
    } else {
      await databases.createDocument(DB_ID, 'sports', ID.unique(), payload);
      console.log(`  created ${sport.sport_key}`);
    }
  } catch (err) {
    const message = err?.message || String(err);
    if (/unknown attribute/i.test(message)) {
      console.error(`  failed ${sport.sport_key}: ${message}`);
      console.error('  The sports collection is missing attributes (positions, specialties, levels, assessment_template). Run the provisioner first.');
      process.exit(1);
    }
    throw err;
  }
}

console.log('Sports seed complete.');
