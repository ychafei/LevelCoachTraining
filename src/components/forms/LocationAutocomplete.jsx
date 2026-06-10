import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

// Nationwide location autocomplete backed by the free Photon (OpenStreetMap)
// geocoder — no API key. As the user types a city, state, or ZIP anywhere in
// the USA, suggestions appear; selecting one fills the label, county, state,
// ZIP, and coordinates. county is derived from the selected place.
//
// onSelect receives: { label, city, state, county, postcode, lat, lng }.

const PHOTON_URL = 'https://photon.komoot.io/api/';

function placeFromFeature(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];
  const city = p.city || p.name || p.town || p.village || '';
  const state = p.state || '';
  const county = p.county || '';
  const postcode = p.postcode || '';
  // A friendly one-line label. Prefer "City, State" then ZIP when present.
  const main = p.name && p.name !== city ? p.name : city;
  const parts = [main, state].filter(Boolean);
  let label = parts.join(', ');
  if (postcode && !label.includes(postcode)) label = label ? `${label} ${postcode}` : postcode;
  return {
    label: label || p.name || '',
    city,
    state,
    county,
    postcode,
    lat: Number(coords[1]),
    lng: Number(coords[0]),
  };
}

function dedupe(places) {
  const seen = new Set();
  const out = [];
  for (const place of places) {
    const key = `${place.label}|${place.county}`.toLowerCase();
    if (place.label && !seen.has(key)) { seen.add(key); out.push(place); }
  }
  return out;
}

export default function LocationAutocomplete({
  id,
  label,
  required = false,
  value = '',
  onSelect,
  onClear,
  error,
  disabled = false,
  placeholder = 'Start typing a city, state, or ZIP…',
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setSuggestions([]); setLoading(false); return undefined; }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=8&lang=en`, { signal: abortRef.current.signal });
        const data = await res.json();
        const usPlaces = (data.features || [])
          .filter((f) => (f.properties?.countrycode || '').toUpperCase() === 'US')
          .map(placeFromFeature);
        setSuggestions(dedupe(usPlaces).slice(0, 6));
        setOpen(true);
        setActive(-1);
      } catch (err) {
        if (err?.name !== 'AbortError') setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const choose = (place) => {
    setQuery(place.label);
    setOpen(false);
    setSuggestions([]);
    onSelect?.(place);
  };

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative" ref={boxRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
          {label}{required && <span className="text-destructive"> *</span>}
        </label>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); onClear?.(); }}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          className={`w-full h-11 rounded-md border bg-background pl-9 pr-9 text-sm outline-none focus:border-accent ${error ? 'border-destructive' : 'border-border'}`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {open && suggestions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          {suggestions.map((place, i) => (
            <li key={`${place.label}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(place)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-accent/10' : 'hover:bg-accent/5'}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <span className="font-medium text-foreground">{place.label}</span>
                  {place.county && <span className="block text-xs text-muted-foreground">{place.county}{place.county.toLowerCase().includes('county') ? '' : ' County'}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
