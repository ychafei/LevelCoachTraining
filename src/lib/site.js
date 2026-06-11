// Single source of truth for the canonical web origin. Two domains exist
// (lctrainings.com and levelcoachtraining.com); robots.txt and sitemap.xml
// already point at levelcoachtraining.com, so code follows that choice —
// every canonical tag, OG URL, JSON-LD url, and sitemap entry derives from
// this constant. If the business picks the other domain, change it HERE and
// in public/robots.txt + scripts/generate-sitemap.mjs, then 301 the loser.
export const SITE_ORIGIN = 'https://www.levelcoachtraining.com';
export const SITE_NAME = 'LevelCoach Training';
export const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';
