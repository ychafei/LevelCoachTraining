import { useEffect } from 'react';

const SITE_NAME = 'LevelCoach Training';
const DEFAULT_DESCRIPTION = 'Find verified sports coaches, book private training sessions, and track athlete progress. Built for athletes, parents, coaches, and training organizations.';

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Tiny per-page SEO hook (no dependencies). Sets document.title, the meta
// description, and matching OpenGraph tags. Values reset to the site defaults
// when the component unmounts so navigation never leaks stale metadata.
export function usePageMeta({ title, description } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const desc = description || DEFAULT_DESCRIPTION;

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);

    return () => {
      document.title = SITE_NAME;
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertMeta('property', 'og:title', SITE_NAME);
      upsertMeta('property', 'og:description', DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}

export default usePageMeta;
