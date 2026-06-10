// Creates any function declared in appwrite.json that does not yet exist on
// the Appwrite project. Purely additive — never deletes or modifies existing
// functions. Run before deploy-functions.mjs on a fresh/partial project.
import { Client, Functions, Query } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(join(projectRoot, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i < 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch { console.error('Could not read .env.local'); process.exit(1); }

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const fns = new Functions(client);
const config = JSON.parse(readFileSync(join(projectRoot, 'appwrite.json'), 'utf8'));

const existing = new Set();
let cursor = null;
do {
  const queries = [Query.limit(100)];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const page = await fns.list(queries);
  for (const f of page.functions) existing.add(f.$id);
  cursor = page.functions.length === 100 ? page.functions[page.functions.length - 1].$id : null;
} while (cursor);

let created = 0, skipped = 0, failed = 0;
for (const fn of config.functions) {
  if (existing.has(fn.$id)) { console.log(`= ${fn.$id} (exists)`); skipped++; continue; }
  try {
    await fns.create({
      functionId: fn.$id,
      name: fn.name || fn.$id,
      runtime: fn.runtime || 'node-22',
      execute: fn.execute || ['users'],
      events: fn.events || [],
      schedule: fn.schedule || '',
      timeout: fn.timeout || 30,
      enabled: fn.enabled !== false,
      logging: fn.logging !== false,
      entrypoint: fn.entrypoint || 'src/main.js',
      commands: fn.commands || 'npm install',
      scopes: fn.scopes || [],
      specification: fn.specification || undefined,
    });
    console.log(`+ ${fn.$id} created`);
    created++;
  } catch (err) {
    console.error(`✗ ${fn.$id}: ${err?.message || err}`);
    failed++;
  }
}
console.log(`\n${created} created, ${skipped} existed, ${failed} failed.`);
if (failed) process.exit(1);
