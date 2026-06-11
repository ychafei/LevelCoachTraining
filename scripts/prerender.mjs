// Post-build prerender: snapshots the marketing routes of the built SPA into
// static HTML files under dist/, so crawlers receive real content instead of
// an empty shell (the #1 SEO finding in the redesign plan).
//
// How it works: serves dist/ with `vite preview`, drives headless Chromium
// over each route, and writes the rendered DOM to dist/<route>/index.html.
// Vercel serves static files before applying the SPA rewrite, so prerendered
// routes get the snapshot and everything else falls through to index.html.
//
// Usage:  npm run build:seo     (vite build + sitemap + this script)
// Local:  uses installed Google Chrome or the Playwright chromium cache.
// CI:     requires a Chromium binary — run `npx playwright install chromium`
//         in the build step, or run build:seo locally and deploy the output.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

// Marketing routes only — app/auth routes stay client-rendered on purpose.
const STATIC_ROUTES = [
  '/',
  '/coaches',
  '/sports',
  '/organizations',
  '/how-it-works',
  '/for-athletes',
  '/for-parents',
  '/for-coaches',
  '/for-organizations',
  '/resources',
  '/faq',
  '/support',
  '/safety',
  '/about',
  '/terms',
  '/privacy',
];

const catalogSource = readFileSync(join(root, 'src/lib/sportsCatalog.js'), 'utf8');
const sportKeys = [...catalogSource.matchAll(/sport_key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
const ROUTES = [...STATIC_ROUTES, ...sportKeys.map((key) => `/sports/${key}`)];

function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    // Fall back to Playwright's cached chromium (any platform).
    const out = execSync(
      'node -e "console.log(require(\'playwright-core\').chromium.executablePath())"',
      { cwd: root, encoding: 'utf8' },
    ).trim();
    if (out && existsSync(out)) return out;
  } catch { /* not available */ }
  return null;
}

// On CI (Vercel) the prerender is a best-effort enhancement: a Chromium
// problem must never fail the deploy — the plain SPA build still works, it
// just loses the crawler-visible HTML until the next successful run. Locally
// we fail loudly so the gap can't go unnoticed.
const FAIL_SOFT = !!process.env.VERCEL || !!process.env.CI;
function bail(message) {
  if (FAIL_SOFT) {
    console.warn(`prerender: SKIPPED — ${message} (deploying plain SPA build)`);
    process.exit(0);
  }
  console.error(`prerender: ${message}`);
  process.exit(1);
}

const executablePath = chromiumPath();
if (!executablePath) {
  bail('no Chromium found. Install Chrome, set CHROMIUM_PATH, or `npx playwright install chromium`.');
}

const { chromium } = await import('playwright-core').catch(async () => {
  bail('playwright-core is not installed. Run `npm i -D playwright-core`.');
});

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  detached: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
  }
  throw new Error('vite preview did not start');
}

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  let written = 0;
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Let lazy chunks/fonts settle; marketing pages have no auth-gated data.
    await page.waitForTimeout(400);
    let html = await page.content();
    // The snapshot serializes the DOM after the font stylesheet's onload
    // flipped media to "all" — restore the non-render-blocking print-swap
    // pattern so the static HTML stays fast for first paint.
    html = html.replace(
      /(<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*?)media="all"/g,
      '$1media="print"',
    );
    // Drop the modulepreload links Vite injected at RUNTIME while the page
    // rendered (they carry as="script"; build-time entry preloads don't).
    // Baked into the head they make the browser fetch every lazy-route dep
    // before first paint — the opposite of their purpose.
    html = html.replace(/<link rel="modulepreload" as="script"[^>]*>/g, '');
    const outDir = route === '/' ? join(root, 'dist') : join(root, 'dist', route.slice(1));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>\n${html.replace(/^<!DOCTYPE html>/i, '')}`);
    written += 1;
    process.stdout.write(`prerendered ${route}\n`);
  }
  await browser.close();
  console.log(`prerender complete: ${written}/${ROUTES.length} routes.`);
} catch (err) {
  // A half-written dist/ is fine: each route file is complete when written,
  // and un-prerendered routes fall through to the SPA shell.
  bail(`failed mid-run — ${err?.message || err}`);
} finally {
  try { process.kill(-server.pid); } catch { try { server.kill(); } catch { /* gone */ } }
}
