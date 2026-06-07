import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PublicCoachCard from '@/components/public/PublicCoachCard';
import { matchesCoachSearch, normalizePublicCoach } from '@/lib/publicCoach';
import {
  coachDistanceMiles,
  findPlaceSuggestions,
  placeFromParams,
  resolvePlace,
} from '@/lib/metroDetroitPlaces';
import { rpc } from '@/lib/rpc';
import { pricingPackageRepo } from '@/api/repo';
import { DEMO_COACH_PROFILES } from '@/lib/demoCoachProfiles';
import { loadDemoCoachProfilesEnabled } from '@/lib/demoCoachSettings';

const SPORTS = ['All sports', 'Soccer', 'Basketball', 'Football', 'Baseball', 'Volleyball', 'Strength', 'Speed'];
const AVAILABILITY = ['Any time', 'This week', 'Evenings', 'Weekends'];
const RADII = ['10', '15', '25', '50'];

function valueFromParams(params, key, fallback) {
  return params.get(key) || fallback;
}

function radiusFromParams(params) {
  const raw = Number(params.get('radius') || params.get('location_radius') || 15);
  return Number.isFinite(raw) && raw > 0 ? String(raw) : '15';
}

function bookingParams(place, radius) {
  if (!place) return {};
  return {
    location_label: place.label,
    location_lat: String(place.lat),
    location_lng: String(place.lng),
    location_radius: String(radius || 15),
  };
}

export default function CoachSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    sport: valueFromParams(searchParams, 'sport', 'All sports'),
    location: valueFromParams(searchParams, 'location', valueFromParams(searchParams, 'location_label', '')),
    radius: radiusFromParams(searchParams),
    availability: valueFromParams(searchParams, 'availability', 'Any time'),
  });
  const [selectedPlace, setSelectedPlace] = useState(() => placeFromParams(searchParams));
  const [coaches, setCoaches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [coachResult, packageRows, demosEnabled] = await Promise.all([
          rpc.invoke('getPublicCoaches', {}).catch((err) => {
            console.warn('Public coaches unavailable; showing demo profiles if enabled.', err);
            return null;
          }),
          pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
          loadDemoCoachProfilesEnabled(),
        ]);
        if (cancelled) return;
        const liveCoaches = (coachResult?.data?.coaches || coachResult?.coaches || []).map(normalizePublicCoach);
        const list = demosEnabled
          ? [...liveCoaches, ...DEMO_COACH_PROFILES]
          : liveCoaches;
        setCoaches(list);
        setPackages(packageRows);
      } catch (err) {
        console.error('CoachSearch load failed', err);
        if (!cancelled) setError('Coach results could not load. Try again in a moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const nextPlace = placeFromParams(searchParams);
    setSelectedPlace(nextPlace);
    setFilters({
      sport: valueFromParams(searchParams, 'sport', 'All sports'),
      location: valueFromParams(searchParams, 'location', valueFromParams(searchParams, 'location_label', '')),
      radius: radiusFromParams(searchParams),
      availability: valueFromParams(searchParams, 'availability', 'Any time'),
    });
  }, [searchParams]);

  const activePlace = useMemo(
    () => selectedPlace || resolvePlace(filters.location),
    [selectedPlace, filters.location],
  );

  const locationSuggestions = useMemo(
    () => findPlaceSuggestions(filters.location),
    [filters.location],
  );

  const filteredCoaches = useMemo(
    () => coaches.filter((coach) => matchesCoachSearch(coach, { ...filters, place: activePlace })),
    [coaches, filters, activePlace],
  );

  const coachBookingParams = useMemo(
    () => bookingParams(activePlace, filters.radius),
    [activePlace, filters.radius],
  );

  const applyFilters = (event) => {
    event?.preventDefault?.();
    const appliedPlace = selectedPlace || resolvePlace(filters.location);
    const next = new URLSearchParams();
    if (filters.sport && filters.sport !== 'All sports') next.set('sport', filters.sport);
    if (appliedPlace) {
      next.set('location', appliedPlace.label);
      next.set('lat', String(appliedPlace.lat));
      next.set('lng', String(appliedPlace.lng));
      next.set('radius', String(filters.radius || 15));
      setSelectedPlace(appliedPlace);
      setFilters((prev) => ({ ...prev, location: appliedPlace.label }));
    } else if (filters.location) {
      next.set('location', filters.location);
      next.set('radius', String(filters.radius || 15));
    }
    if (filters.availability && filters.availability !== 'Any time') next.set('availability', filters.availability);
    setSearchParams(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Verified coaching marketplace</span>
              </div>
              <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                Find coaches near your athlete's training location.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Compare verified profiles, open availability, distance, training specialties, and intro-booking options.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Results</p>
              <p className="mt-1 font-display text-3xl font-bold text-slate-950">
                {loading ? '...' : filteredCoaches.length}
                <span className="ml-2 text-sm font-semibold text-slate-500">coach{filteredCoaches.length === 1 ? '' : 'es'}</span>
              </p>
            </div>
          </div>

          <form onSubmit={applyFilters} className="mt-7 rounded-lg border border-slate-200 bg-white p-3 shadow-xl shadow-blue-600/10">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1.35fr_0.75fr_1fr_auto]">
              <FilterSelect
                label="Sport"
                icon={Trophy}
                value={filters.sport}
                options={SPORTS}
                onChange={(value) => setFilters((prev) => ({ ...prev, sport: value }))}
              />
              <FilterInput
                label="Location"
                icon={MapPin}
                value={filters.location}
                suggestions={locationSuggestions}
                selectedPlaceLabel={selectedPlace?.label || ''}
                onChange={(value) => {
                  setFilters((prev) => ({ ...prev, location: value }));
                  if (selectedPlace && value !== selectedPlace.label) setSelectedPlace(null);
                }}
                onSelect={(place) => {
                  setSelectedPlace(place);
                  setFilters((prev) => ({ ...prev, location: place.label }));
                }}
              />
              <FilterSelect
                label="Radius"
                icon={MapPin}
                value={filters.radius}
                options={RADII}
                onChange={(value) => setFilters((prev) => ({ ...prev, radius: value }))}
              />
              <FilterSelect
                label="Availability"
                icon={CalendarDays}
                value={filters.availability}
                options={AVAILABILITY}
                onChange={(value) => setFilters((prev) => ({ ...prev, availability: value }))}
              />
              <Button className="h-14 rounded-lg bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                <Search className="h-4 w-4" />
                Find Coaches
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1480px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-blue-700" />
              <p className="font-display text-lg font-bold tracking-normal text-slate-950">Filters</p>
            </div>
            <div className="mt-4 space-y-3">
              <FilterPill label={filters.sport} active={filters.sport !== 'All sports'} />
              <FilterPill
                label={activePlace ? `${activePlace.label} within ${filters.radius} mi` : (filters.location || 'Any location')}
                active={!!filters.location}
              />
              <FilterPill label={filters.availability} active={filters.availability !== 'Any time'} />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Profiles are populated from coach data. Ratings, prices, sports, and organizations only appear when those fields exist.
            </p>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-xl font-bold tracking-normal text-slate-950">Best matches</p>
              <p className="text-sm text-slate-600">
                {loading
                  ? 'Loading verified coach profiles...'
                  : activePlace
                    ? `${filteredCoaches.length} result${filteredCoaches.length === 1 ? '' : 's'} within ${filters.radius} miles of ${activePlace.label}`
                    : `${filteredCoaches.length} result${filteredCoaches.length === 1 ? '' : 's'} for your search`}
              </p>
            </div>
            <Link to="/apply/private-training-coach" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
              Are you a coach?
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-white p-6 text-sm font-semibold text-red-700 shadow-sm">
              {error}
            </div>
          )}

          {!loading && !error && filteredCoaches.length > 0 && (
            <div className="space-y-3">
              {filteredCoaches.map((coach) => (
                <PublicCoachCard
                  key={coach.id}
                  coach={coach}
                  packages={packages}
                  distanceMiles={activePlace ? coachDistanceMiles(coach, activePlace) : null}
                  bookingParams={coachBookingParams}
                />
              ))}
            </div>
          )}

          {!loading && !error && filteredCoaches.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Search className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold text-slate-950">No coaches match those filters yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Try broadening the sport, location radius, or availability window. New coaches appear here as their profiles go live.
              </p>
              <Button
                className="mt-5 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700"
                onClick={() => {
                  setSelectedPlace(null);
                  setFilters({ sport: 'All sports', location: '', radius: '15', availability: 'Any time' });
                  setSearchParams(new URLSearchParams());
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterSelect({ label, icon: Icon, value, options, onChange }) {
  return (
    <label className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full bg-transparent text-sm font-bold text-slate-950 outline-none"
        >
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

function FilterInput({ label, icon: Icon, value, onChange, suggestions = [], selectedPlaceLabel = '', onSelect }) {
  const showSuggestions = value && suggestions.length > 0 && value !== selectedPlaceLabel;

  return (
    <div className="relative flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-auto border-0 bg-transparent p-0 text-sm font-bold text-slate-950 shadow-none outline-none focus-visible:ring-0"
          placeholder="City, county, or ZIP"
        />
      </span>
      {showSuggestions && (
        <span className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl shadow-slate-900/10">
          {suggestions.map((place) => (
            <button
              key={place.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect?.(place)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
            >
              <span>{place.label}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{place.type}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function FilterPill({ label, active }) {
  return (
    <span className={`inline-flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold ${
      active ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
    }`}>
      {label}
      {active && <span className="h-2 w-2 rounded-full bg-blue-600" />}
    </span>
  );
}
