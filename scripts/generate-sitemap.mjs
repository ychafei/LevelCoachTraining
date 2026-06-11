// Regenerates public/sitemap.xml from the marketing route list + the sports
// catalog, so new sport pages never need hand-editing. Domain must match
// src/lib/site.js SITE_ORIGIN and public/robots.txt.
//
// Usage: node scripts/generate-sitemap.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.levelcoachtraining.com';

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
  '/blog',
  '/apply',
  '/apply/private-training-coach',
  '/apply/organization',
  '/create-account',
  '/sign-in',
  '/terms',
  '/privacy',
  '/unsubscribe',
];

// Sport keys parsed from the catalog source (no bundler available here).
const catalogSource = readFileSync(join(root, 'src/lib/sportsCatalog.js'), 'utf8');
const sportKeys = [...catalogSource.matchAll(/sport_key:\s*'([a-z_]+)'/g)].map((match) => match[1]);
if (sportKeys.length === 0) throw new Error('No sport keys parsed from sportsCatalog.js');

const urls = [
  ...STATIC_ROUTES,
  ...sportKeys.map((key) => `/sports/${key}`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join('\n')}\n</urlset>\n`;

writeFileSync(join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml written: ${urls.length} URLs (${sportKeys.length} sport pages).`);
