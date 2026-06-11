import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import SelectMenu from '@/components/forms/SelectMenu';
import { US_STATES, toStateCode, stateName } from '@/lib/usStates';

// Reusable US location entry used across every role for consistency:
//  - STATE: dropdown of all 50 states + DC
//  - CITY:  autocomplete as you type (Photon/OpenStreetMap), biased to the
//           chosen state; selecting a city fills state + ZIP + county + coords
//  - ZIP:   on a 5-digit entry, resolves the matching city/state automatically
//
// value: { city, state, zip, county?, lat?, lng? }
// onChange(patch): called with the changed subset (merge into your form state).
// fields: which inputs to render + order (default ['city','state','zip']).
const PHOTON = 'https://photon.komoot.io/api/';

function inputClass(error) {
  return `w-full h-11 rounded-md border bg-background px-3 text-sm outline-none focus:border-accent ${error ? 'border-destructive' : 'border-border'}`;
}

function featureToPlace(f) {
  const p = f.properties || {};
  const coords = f.geometry?.coordinates || [];
  return {
    city: p.city || p.name || p.town || p.village || '',
    state: toStateCode(p.state || ''),
    zip: p.postcode || '',
    county: p.county || '',
    lat: Number(coords[1]),
    lng: Number(coords[0]),
  };
}

async function photonSearch(query, signal) {
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(query)}&limit=8&lang=en`, { signal });
  const data = await res.json();
  return (data.features || [])
    .filter((f) => (f.properties?.countrycode || '').toUpperCase() === 'US')
    .map(featureToPlace);
}

function CityAutocomplete({ id, value, state, error, disabled, onPick, onType }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const q = String(value || '').trim();
    if (q.length < 3) { setSuggestions([]); setLoading(false); return undefined; }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        // Bias the query to the chosen state so suggestions stay relevant.
        const query = state ? `${q} ${stateName(state)}` : q;
        let places = await photonSearch(query, abortRef.current.signal);
        if (state) {
          const inState = places.filter((p) => p.state === state);
          if (inState.length) places = inState;
        }
        const seen = new Set();
        const deduped = places.filter((p) => {
          if (!p.city) return false;
          const key = `${p.city}|${p.state}|${p.zip}`;
          if (seen.has(key)) return false; seen.add(key); return true;
        }).slice(0, 6);
        setSuggestions(deduped);
        setOpen(true); setActive(-1);
      } catch (err) {
        if (err?.name !== 'AbortError') setSuggestions([]);
      } finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(handle);
  }, [value, state]);

  const choose = (place) => { onPick(place); setOpen(false); setSuggestions([]); };

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          value={value || ''}
          disabled={disabled}
          placeholder="Start typing a city…"
          onChange={(e) => onType(e.target.value)}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || !suggestions.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          className={`${inputClass(error)} pl-9 pr-9`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
          {suggestions.map((place, i) => (
            <li key={`${place.city}-${place.zip}-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(place)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-accent/10' : 'hover:bg-accent/5'}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <span className="font-medium text-foreground">{place.city}{place.state ? `, ${place.state}` : ''}</span>
                  {place.zip && <span className="text-xs text-muted-foreground"> · {place.zip}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function USLocationFields({
  value = {},
  onChange,
  fields = ['city', 'state', 'zip'],
  required = false,
  disabled = false,
  idPrefix = 'loc',
  errors = {},
  labels = {},
  columns = 'grid grid-cols-1 sm:grid-cols-2 gap-4',
}) {
  const city = value.city || '';
  const state = toStateCode(value.state || '');
  const zip = value.zip || '';
  const zipTimer = useRef(null);

  const req = (k) => required && (k === 'city' || k === 'state');

  const onZip = (raw) => {
    const z = raw.replace(/[^\d-]/g, '').slice(0, 10);
    onChange({ zip: z });
    if (zipTimer.current) clearTimeout(zipTimer.current);
    if (/^\d{5}$/.test(z)) {
      zipTimer.current = setTimeout(async () => {
        try {
          const places = await photonSearch(z);
          const hit = places.find((p) => p.zip === z) || places[0];
          if (hit) onChange({ city: hit.city || city, state: hit.state || state, county: hit.county, lat: hit.lat, lng: hit.lng });
        } catch { /* ignore */ }
      }, 350);
    }
  };

  const labelEl = (key, text) => (
    <label htmlFor={`${idPrefix}-${key}`} className="block text-sm font-medium text-foreground mb-1">
      {labels[key] || text}{req(key) && <span className="text-destructive"> *</span>}
    </label>
  );

  const render = {
    city: (
      <div key="city">
        {labelEl('city', 'City')}
        <CityAutocomplete
          id={`${idPrefix}-city`}
          value={city}
          state={state}
          error={errors.city}
          disabled={disabled}
          onType={(v) => onChange({ city: v })}
          onPick={(place) => onChange({
            city: place.city,
            state: place.state || state,
            zip: place.zip || zip,
            county: place.county,
            lat: place.lat,
            lng: place.lng,
          })}
        />
        {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
      </div>
    ),
    state: (
      <div key="state">
        {labelEl('state', 'State')}
        <SelectMenu
          id={`${idPrefix}-state`}
          value={state}
          disabled={disabled}
          onChange={(next) => onChange({ state: next })}
          ariaLabel="State"
          placeholder="Select a state"
          options={[
            { value: '', label: 'Select a state' },
            ...US_STATES.map((s) => ({ value: s.code, label: s.name })),
          ]}
          triggerClassName={`${inputClass(errors.state)} justify-between font-normal shadow-none`}
        />
        {errors.state && <p className="mt-1 text-xs text-destructive">{errors.state}</p>}
      </div>
    ),
    zip: (
      <div key="zip">
        {labelEl('zip', 'ZIP')}
        <input
          id={`${idPrefix}-zip`}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          value={zip}
          disabled={disabled}
          placeholder="ZIP code"
          onChange={(e) => onZip(e.target.value)}
          className={inputClass(errors.zip)}
        />
        {errors.zip && <p className="mt-1 text-xs text-destructive">{errors.zip}</p>}
      </div>
    ),
  };

  return <div className={columns}>{fields.map((f) => render[f])}</div>;
}
