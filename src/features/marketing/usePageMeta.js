import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_NAME, SITE_ORIGIN } from '@/lib/site';

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

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

const JSONLD_ID = 'page-jsonld';

function setJsonLd(data) {
  let el = document.getElementById(JSONLD_ID);
  if (!data) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = JSONLD_ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

// Tiny per-page SEO hook (no dependencies). Sets document.title, the meta
// description, matching OpenGraph tags, a canonical URL on the single
// canonical domain, and optional page-level JSON-LD. Values reset to the
// site defaults on unmount so navigation never leaks stale metadata.
export function usePageMeta({ title, description, jsonLd } = {}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const desc = description || DEFAULT_DESCRIPTION;
    const canonical = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}`;

    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:url', canonical);
    upsertCanonical(canonical);
    setJsonLd(jsonLd || null);

    return () => {
      document.title = SITE_NAME;
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertMeta('property', 'og:title', SITE_NAME);
      upsertMeta('property', 'og:description', DEFAULT_DESCRIPTION);
      setJsonLd(null);
    };
  }, [title, description, jsonLd, pathname]);
}

export default usePageMeta;
