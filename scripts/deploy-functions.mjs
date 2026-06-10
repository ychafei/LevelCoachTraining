// scripts/deploy-functions.mjs
//
// Deploys all functions defined in appwrite.json to the Appwrite project.
// Tarballs each function directory and creates+activates a deployment.
//
// Avoids the interactive `appwrite push` CLI prompts.
//
// Usage:
//   node scripts/deploy-functions.mjs           # deploy all
//   node scripts/deploy-functions.mjs <id>...   # deploy specific function ids

import { Client, Functions } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { execSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Load .env.local
try {
  const content = readFileSync(join(projectRoot, '.env.local'), 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT  = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY  = process.env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY');
  process.exit(1);
}

const config = JSON.parse(readFileSync(join(projectRoot, 'appwrite.json'), 'utf8'));
const requested = process.argv.slice(2);
const fnList = requested.length
  ? config.functions.filter((f) => requested.includes(f.$id))
  : config.functions;

if (!fnList.length) {
  console.error('No matching functions to deploy.');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const fns = new Functions(client);

console.log(`Deploying ${fnList.length} function(s) to project ${PROJECT}\n`);

let okCount = 0;
let failCount = 0;

for (const fn of fnList) {
  const fnDir = join(projectRoot, fn.path);
  if (!existsSync(fnDir)) {
    console.error(`[${fn.$id}] ✗ source dir missing: ${fnDir}`);
    failCount++;
    continue;
  }

  const tmp = mkdtempSync(join(tmpdir(), `aw-${fn.$id}-`));
  const tarPath = join(tmp, 'code.tar.gz');
  try {
    // Tar the function dir contents, excluding node_modules + dotfiles. -C
    // changes into the dir so paths inside the tarball are relative to it.
    // NB: do NOT add --exclude='.*' here. On BSD tar (macOS) that glob also
    // matches the '.' root entry and produces an EMPTY archive, which Appwrite
    // rejects at build time ("package.json not found"). Function dirs carry no
    // dotfiles, so excluding node_modules is sufficient.
    execSync(
      `tar --exclude=node_modules -czf '${tarPath}' -C '${fnDir}' .`,
      { stdio: 'pipe' },
    );

    process.stdout.write(`[${fn.$id}] uploading...`);
    const dep = await fns.createDeployment({
      functionId: fn.$id,
      code: InputFile.fromPath(tarPath, 'code.tar.gz'),
      activate: true,
      entrypoint: fn.entrypoint,
      commands: fn.commands,
    });
    console.log(` ✓ deployment ${dep.$id}`);
    okCount++;
  } catch (err) {
    console.log(` ✗ ${err?.message || err}`);
    failCount++;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`\n${okCount} ok, ${failCount} failed.`);
if (failCount > 0) process.exit(1);
