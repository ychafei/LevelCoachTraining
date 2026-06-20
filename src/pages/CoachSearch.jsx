import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  GraduationCap,
  Heart,
  LayoutList,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  PackageCheck,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tag,
  Trophy,
  Users,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PublicCoachCard from '@/components/public/PublicCoachCard';
import { normalizePublicCoach, publicCoachDisplay } from '@/lib/publicCoach';
import {
  coachDistanceMiles,
  coachServiceRadiusMiles,
  findPlaceSuggestions,
  placeFromParams,
  resolvePlace,
} from '@/lib/metroDetroitPlaces';
import { callFn } from '@/lib/rpc';
import { pricingPackageRepo } from '@/api/repo';
import SelectMenu from '@/components/forms/SelectMenu';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { useAuth } from '@/lib/AuthContext';
import { savedCoachIdsFromPrefs } from '@/lib/savedCoachPrefs';
import { formatCreditMoney, useCreditBalance } from '@/hooks/useCreditBalance';

const PAGE_SIZE = 12;
const MARKETPLACE_CONTAINER = 'mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8 2xl:px-10';
const RADII = ['10', '15', '25', '50', '100'];
const EXPANSION_RADII = [10, 15, 25, 50, 100];
const AVAILABILITY_OPTIONS = ['Any time', 'Has set availability', 'Weekends', 'Evenings'];
const AGE_GROUPS = ['Any age group', 'Youth', 'Middle School', 'High School', 'College', 'Adult'];
const PRICE_BANDS = [
  { value: 'any', label: 'Any price' },
  { value: 'under_50', label: 'Under $50', min: 0, max: 4999 },
  { value: '50_75', label: '$50 – $75', min: 5000, max: 7500 },
  { value: '75_100', label: '$75 – $100', min: 7501, max: 10000 },
  { value: 'over_100', label: '$100+', min: 10001, max: Infinity },
];
const SESSION_TYPES = [
  { value: 'any', label: 'Any session type' },
  { value: 'facility', label: 'Coach facility' },
  { value: 'travels', label: 'Coach travels' },
  { value: 'hybrid', label: 'Facility or travel' },
  { value: 'online', label: 'Online training' },
];
const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];
const LEVELS = ['Any level', ...Array.from(new Set(SPORTS_CATALOG.flatMap((sport) => sport.levels)))];

// Accepts a sport_key ("soccer") or a display name ("Soccer") so links from
// the landing page, sitemap, and older bookmarks all resolve.
function resolveSportFilter(value) {
  const term = String(value || '').trim().toLowerCase();
  if (!term || term === 'all' || term === 'all sports') return null;
  return SPORTS_CATALOG.find(
    (sport) => sport.sport_key === term || sport.display_name.toLowerCase() === term,
  ) || { sport_key: term, display_name: String(value).trim() };
}

function filtersFromParams(params) {
  return {
    sport: params.get('sport') || '',
    location: params.get('location') || params.get('location_label') || '',
    radius: (() => {
      const raw = Number(params.get('radius') || params.get('location_radius') || 15);
      return Number.isFinite(raw) && raw > 0 ? String(raw) : '15';
    })(),
    availability: params.get('availability') || 'Any time',
    level: params.get('level') || 'Any level',
    age: params.get('age') || 'Any age group',
    org: params.get('org') || 'any',
    price: params.get('price') || 'any',
    specialty: params.get('specialty') || '',
    type: params.get('type') || 'any',
    sort: params.get('sort') || 'featured',
  };
}

function haystackFor(model) {
  return [
    model.displayName,
    model.organizationName,
    model.primarySport,
    model.locationLabel,
    model.countyLabel,
    model.serviceCity,
    model.serviceState,
    model.serviceZip,
    model.serviceVenue,
    model.headline,
    model.bio,
    ...model.specializations,
    ...model.ageGroups,
    ...model.trainingFormats,
    ...model.sports,
    ...model.servedAreas,
  ].join(' ').toLowerCase();
}

function minutesOf(value) {
  const [h, m] = String(value || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function enabledDays(availability = {}) {
  return Object.keys(availability).filter((day) => availability[day]?.enabled);
}

function availabilityMatches(coach, option) {
  if (!option || option === 'Any time') return true;
  const availability = coach.availability || {};
  const days = enabledDays(availability);
  if (option === 'Has set availability') return days.length > 0;
  if (option === 'Weekends') return days.includes('Saturday') || days.includes('Sunday');
  if (option === 'Evenings') {
    return days.some((day) => {
      const slot = availability[day] || {};
      const start = minutesOf(slot.start);
      const end = minutesOf(slot.end);
      return (start !== null && start >= 15 * 60) || (end !== null && end >= 18 * 60);
    });
  }
  return true;
}

function locationMatches(coach, model, haystack, place, locationText, radius) {
  if (place) {
    const distance = coachDistanceMiles(coach, place);
    if (distance !== null) {
      const coachRadius = coachServiceRadiusMiles(coach) || 0;
      const travels = coach.service_type === 'travels' || coach.service_type === 'hybrid';
      const effective = travels ? Math.max(radius, coachRadius) : radius;
      return distance <= effective;
    }
    // No coordinates on the coach — fall back to text matching.
    const terms = [place.label, ...(place.aliases || [])].filter(Boolean);
    return terms.some((term) => haystack.includes(String(term).toLowerCase().replace(/, mi$/i, '').trim()));
  }
  if (locationText) {
    const loose = locationText.toLowerCase().replace(/\bmichigan\b/g, '').replace(/\bmi\b/g, '').replace(/[,\s]+/g, ' ').trim();
    return !loose || haystack.includes(loose) || haystack.includes(locationText.toLowerCase());
  }
  return true;
}

function reviewSummary(rows) {
  const totals = rows.reduce((acc, { coach }) => {
    const rating = Number(coach.rating_avg);
    const count = Number(coach.review_count);
    if (Number.isFinite(rating) && rating > 0 && Number.isFinite(count) && count > 0) {
      acc.reviews += count;
      acc.weighted += rating * count;
    }
    return acc;
  }, { reviews: 0, weighted: 0 });

  return {
    reviews: totals.reviews,
    rating: totals.reviews ? (totals.weighted / totals.reviews).toFixed(1) : '',
  };
}

function filterSummary(filters) {
  return [
    filters.sport,
    filters.location,
    filters.availability !== 'Any time' ? filters.availability : '',
    filters.level !== 'Any level' ? filters.level : '',
    filters.age !== 'Any age group' ? filters.age : '',
    filters.org !== 'any' ? filters.org : '',
    filters.price !== 'any' ? filters.price : '',
    filters.specialty,
    filters.type !== 'any' ? filters.type : '',
  ].filter(Boolean).length;
}

export default function CoachSearch() {
  usePageMeta({
    title: 'Find a Coach',
    description: 'Search published coaches by sport, location, level, availability, organization, price, and specialty. Compare real profiles and reviews, then book training.',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const [selectedPlace, setSelectedPlace] = useState(() => placeFromParams(searchParams));
  const [coaches, setCoaches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const { isAuthenticated, user, isAdmin, isCoach, isOrganizationAdmin } = useAuth();
  const showCreditBalance = isAuthenticated && !!user && !isAdmin && !isCoach && !isOrganizationAdmin;
  const creditBalance = useCreditBalance(user, showCreditBalance);
  const savedCoachIds = useMemo(
    () => new Set(savedCoachIdsFromPrefs(user?.notification_prefs)),
    [user?.notification_prefs],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // getPublicCoaches paginates server-side in batches of 100 (hard cap
      // 1,000 published coaches per response).
      const [coachResult, packageRows] = await Promise.all([
        callFn('getPublicCoaches', {}),
        pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
      ]);
      setCoaches((coachResult?.coaches || []).map(normalizePublicCoach));
      setPackages(packageRows);
    } catch (err) {
      console.error('CoachSearch load failed', err);
      setLoadError(err?.message || 'Coach results could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (showSavedOnly && (!isAuthenticated || savedCoachIds.size === 0)) {
      setShowSavedOnly(false);
    }
  }, [isAuthenticated, savedCoachIds, showSavedOnly]);

  // Keep state in sync when the URL changes (back/forward, inbound links).
  useEffect(() => {
    setFilters(filtersFromParams(searchParams));
    setSelectedPlace(placeFromParams(searchParams));
    setPage(Math.max(1, Number(searchParams.get('page')) || 1));
  }, [searchParams]);

  const activePlace = useMemo(
    () => selectedPlace || resolvePlace(filters.location),
    [selectedPlace, filters.location],
  );

  const locationSuggestions = useMemo(
    () => findPlaceSuggestions(filters.location),
    [filters.location],
  );

  const models = useMemo(
    () => coaches.map((coach) => {
      const model = publicCoachDisplay(coach, { searchPlace: activePlace });
      return { coach, model, haystack: haystackFor(model) };
    }),
    [coaches, activePlace],
  );

  const organizationOptions = useMemo(() => {
    const map = new Map();
    for (const { coach } of models) {
      if (coach.organization?.id && coach.organization?.name) {
        map.set(coach.organization.id, coach.organization.name);
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [models]);

  const specialtyOptions = useMemo(() => {
    const sport = resolveSportFilter(filters.sport);
    const catalogSpecialties = sport
      ? (SPORTS_CATALOG.find((item) => item.sport_key === sport.sport_key)?.specialties || [])
      : [];
    const coachSpecialties = models.flatMap(({ model }) => model.specializations);
    return Array.from(new Set([...catalogSpecialties, ...coachSpecialties])).sort();
  }, [models, filters.sport]);

  const filtered = useMemo(() => {
    const sport = resolveSportFilter(filters.sport);
    const baseRadius = Number(filters.radius) > 0 ? Number(filters.radius) : 15;
    const priceBand = PRICE_BANDS.find((band) => band.value === filters.price);

    const matchAt = (radius) => models.filter(({ coach, model, haystack }) => {
      if (showSavedOnly && !savedCoachIds.has(String(coach.id))) return false;
      if (sport) {
        const sportTerms = coach.sports.map((s) => String(s).toLowerCase());
        const matchesSport = sportTerms.includes(sport.sport_key)
          || sportTerms.includes(sport.display_name.toLowerCase())
          || haystack.includes(sport.display_name.toLowerCase());
        if (!matchesSport) return false;
      }
      if (!locationMatches(coach, model, haystack, activePlace, filters.location.trim(), radius)) return false;
      if (!availabilityMatches(coach, filters.availability)) return false;
      if (filters.level !== 'Any level' && !haystack.includes(filters.level.toLowerCase())) return false;
      if (filters.age !== 'Any age group' && !haystack.includes(filters.age.toLowerCase())) return false;
      if (filters.org !== 'any' && coach.organization?.id !== filters.org) return false;
      if (priceBand && priceBand.value !== 'any') {
        const cents = Number(coach.price_hint_cents);
        if (!Number.isFinite(cents) || cents <= 0) return false;
        if (cents < priceBand.min || cents > priceBand.max) return false;
      }
      if (filters.specialty) {
        const want = filters.specialty.toLowerCase();
        const hasSpecialty = model.specializations.some((item) => {
          const have = item.toLowerCase();
          return have.includes(want) || want.includes(have);
        });
        if (!hasSpecialty) return false;
      }
      if (filters.type !== 'any' && coach.service_type !== filters.type) return false;
      return true;
    });

    // If a place is set and nothing matched, widen the radius progressively
    // so the page suggests real nearby coaches instead of a dead end.
    let matches = matchAt(baseRadius);
    let effectiveRadius = baseRadius;
    let expanded = false;
    if (activePlace && matches.length === 0) {
      for (const radius of EXPANSION_RADII.filter((r) => r > baseRadius)) {
        const wider = matchAt(radius);
        if (wider.length > 0) {
          matches = wider;
          effectiveRadius = radius;
          expanded = true;
          break;
        }
      }
    }

    const sorted = [...matches];
    if (filters.sort === 'rating') {
      sorted.sort((a, b) => (Number(b.coach.rating_avg) || 0) - (Number(a.coach.rating_avg) || 0)
        || (Number(b.coach.review_count) || 0) - (Number(a.coach.review_count) || 0));
    } else if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
      const dir = filters.sort === 'price_asc' ? 1 : -1;
      sorted.sort((a, b) => {
        const pa = Number(a.coach.price_hint_cents);
        const pb = Number(b.coach.price_hint_cents);
        const va = Number.isFinite(pa) && pa > 0 ? pa : null;
        const vb = Number.isFinite(pb) && pb > 0 ? pb : null;
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * dir;
      });
    }

    return { rows: sorted, baseRadius, effectiveRadius, expanded };
  }, [models, filters, activePlace, showSavedOnly, savedCoachIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const reviewStats = useMemo(() => reviewSummary(models), [models]);
  const activeFilterCount = useMemo(() => filterSummary(filters), [filters]);

  const writeParams = (nextFilters, nextPage = 1, place = selectedPlace) => {
    const next = new URLSearchParams();
    if (nextFilters.sport) next.set('sport', nextFilters.sport);
    const appliedPlace = place || resolvePlace(nextFilters.location);
    if (appliedPlace && nextFilters.location.trim()) {
      next.set('location', appliedPlace.label);
      next.set('lat', String(appliedPlace.lat));
      next.set('lng', String(appliedPlace.lng));
      next.set('radius', nextFilters.radius);
    } else if (nextFilters.location.trim()) {
      next.set('location', nextFilters.location.trim());
      next.set('radius', nextFilters.radius);
    }
    if (nextFilters.availability !== 'Any time') next.set('availability', nextFilters.availability);
    if (nextFilters.level !== 'Any level') next.set('level', nextFilters.level);
    if (nextFilters.age !== 'Any age group') next.set('age', nextFilters.age);
    if (nextFilters.org !== 'any') next.set('org', nextFilters.org);
    if (nextFilters.price !== 'any') next.set('price', nextFilters.price);
    if (nextFilters.specialty) next.set('specialty', nextFilters.specialty);
    if (nextFilters.type !== 'any') next.set('type', nextFilters.type);
    if (nextFilters.sort !== 'featured') next.set('sort', nextFilters.sort);
    if (nextPage > 1) next.set('page', String(nextPage));
    setSearchParams(next);
  };

  const applyFilters = (event) => {
    event?.preventDefault?.();
    const appliedPlace = selectedPlace || resolvePlace(filters.location);
    if (appliedPlace && filters.location.trim()) setSelectedPlace(appliedPlace);
    writeParams(filters, 1, appliedPlace);
  };

  const clearFilters = () => {
    setSelectedPlace(null);
    setSearchParams(new URLSearchParams());
  };

  const goToPage = (nextPage) => {
    writeParams(filters, nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const bookingParams = activePlace
    ? {
      location_label: activePlace.label,
      location_lat: String(activePlace.lat),
      location_lng: String(activePlace.lng),
      location_radius: filters.radius,
    }
    : {};

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_38%,#f4f8ff_100%)] text-slate-950">
      <section className="relative overflow-hidden border-b border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_48%,#eaf3ff_100%)]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(70%_100%_at_50%_100%,rgba(37,99,235,0.12),transparent_70%)]" aria-hidden="true" />
        <div className={`${MARKETPLACE_CONTAINER} relative py-7 sm:py-9`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-3.5 py-1.5 shadow-sm shadow-blue-900/5">
                <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-700">Coaching marketplace</span>
              </div>
              <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                Find a coach
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                Connect with verified coaches. Transparent pricing, real reviews, and live booking.
              </p>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { title: 'Trusted coaches', body: 'Published, verified profiles', icon: ShieldCheck },
                { title: 'Safe booking', body: 'Secure checkout records', icon: LockKeyhole },
                { title: 'Clear pricing', body: 'Rates shown before you pay', icon: CircleDollarSign },
                { title: 'Flexible packages', body: 'Credits stay visible', icon: PackageCheck },
              ].map((item) => (
                <TrustMiniCard key={item.title} {...item} />
              ))}
            </div>
          </div>

          <form onSubmit={applyFilters} className="mt-6 rounded-[1.75rem] border border-blue-100 bg-white/95 p-3 shadow-2xl shadow-blue-900/10 backdrop-blur">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.18fr_0.9fr_0.94fr_180px]">
              <FilterSelect
                label="Sport"
                icon={Trophy}
                value={filters.sport}
                onChange={(value) => setFilters((prev) => ({ ...prev, sport: value, specialty: '' }))}
                options={[{ value: '', label: 'Select a sport' }, ...SPORTS_CATALOG.map((sport) => ({ value: sport.sport_key, label: sport.display_name }))]}
              />
              <LocationInput
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
                label="Price per session"
                icon={CircleDollarSign}
                value={filters.price}
                onChange={(value) => setFilters((prev) => ({ ...prev, price: value }))}
                options={PRICE_BANDS.map(({ value, label }) => ({ value, label }))}
              />
              <FilterSelect
                label="Availability"
                icon={CalendarDays}
                value={filters.availability}
                onChange={(value) => setFilters((prev) => ({ ...prev, availability: value }))}
                options={AVAILABILITY_OPTIONS.map((value) => ({ value, label: value }))}
              />
              <Button type="submit" className="h-16 rounded-2xl bg-blue-600 px-6 text-base font-extrabold text-white shadow-xl shadow-blue-600/25 hover:bg-blue-700">
                <Search className="h-5 w-5" aria-hidden="true" />
                Search coaches
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[0.72fr_0.72fr_0.82fr_0.82fr_0.92fr_0.92fr]">
              <FilterSelect
                label="Radius"
                icon={MapPin}
                value={filters.radius}
                onChange={(value) => setFilters((prev) => ({ ...prev, radius: value }))}
                options={RADII.map((value) => ({ value, label: `${value} mi` }))}
                compact
              />
              <FilterSelect
                label="Age group"
                icon={Users}
                value={filters.age}
                onChange={(value) => setFilters((prev) => ({ ...prev, age: value }))}
                options={AGE_GROUPS.map((value) => ({ value, label: value === 'Any age group' ? 'Any age' : value }))}
                compact
              />
              <FilterSelect
                label="Level"
                icon={GraduationCap}
                value={filters.level}
                onChange={(value) => setFilters((prev) => ({ ...prev, level: value }))}
                options={LEVELS.map((value) => ({ value, label: value }))}
                compact
              />
              <FilterSelect
                label="Session type"
                icon={SlidersHorizontal}
                value={filters.type}
                onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
                options={SESSION_TYPES.map(({ value, label }) => ({ value, label: value === 'any' ? 'Any session type' : label }))}
                compact
              />
              <FilterSelect
                label="Organization"
                icon={Building2}
                value={filters.org}
                onChange={(value) => setFilters((prev) => ({ ...prev, org: value }))}
                options={[{ value: 'any', label: 'Any organization' }, ...organizationOptions]}
                compact
              />
              <FilterSelect
                label="Specialty"
                icon={Tag}
                value={filters.specialty}
                onChange={(value) => setFilters((prev) => ({ ...prev, specialty: value }))}
                options={[{ value: '', label: 'Any specialty' }, ...specialtyOptions.map((value) => ({ value, label: value }))]}
                compact
              />
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-600">
                  {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'} applied.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-extrabold text-blue-700 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
          </form>
        </div>
      </section>

      <section className={`${MARKETPLACE_CONTAINER} py-6`}>
        <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-2xl font-extrabold tracking-normal text-slate-950">
              {loading ? 'Searching...' : `${filtered.rows.length} coach${filtered.rows.length === 1 ? '' : 'es'}`}
            </p>
            <p className="text-sm text-slate-600">
              {loading
                ? 'Loading published coach profiles.'
                : activePlace
                  ? `Across ${activePlace.label} within ${filtered.effectiveRadius} miles`
                  : 'Across all locations'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <Button
                type="button"
                variant={showSavedOnly ? 'default' : 'outline'}
                disabled={savedCoachIds.size === 0}
                onClick={() => setShowSavedOnly((value) => !value)}
                className={`inline-flex h-11 rounded-xl px-4 text-sm font-extrabold ${
                  showSavedOnly
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700'
                    : 'border-slate-200 bg-white text-slate-800 hover:bg-blue-50'
                }`}
              >
                <Heart className={`h-4 w-4 ${showSavedOnly ? 'fill-white text-white' : 'text-blue-600'}`} aria-hidden="true" />
                Saved coaches ({savedCoachIds.size})
              </Button>
            ) : (
              <Link
                to="/sign-in"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
              >
                <Heart className="h-4 w-4 text-blue-600" aria-hidden="true" />
                Saved coaches
              </Link>
            )}

            <div className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-blue-700 shadow-sm"
                aria-pressed="true"
              >
                <LayoutList className="h-4 w-4" aria-hidden="true" />
                List
              </button>
              <button
                type="button"
                disabled
                className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg px-3 text-sm font-extrabold text-slate-400"
                title="Map view is coming soon"
                aria-pressed="false"
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                Map
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <span>Sort</span>
              <SelectMenu
                value={filters.sort}
                onChange={(sort) => {
                  setFilters((prev) => ({ ...prev, sort }));
                  writeParams({ ...filters, sort }, 1);
                }}
                ariaLabel="Sort coaches"
                options={SORT_OPTIONS}
                triggerClassName="h-11 w-auto min-w-[160px] rounded-xl border-slate-200 bg-white text-sm font-bold text-slate-950 shadow-sm"
              />
            </div>

            <Link to="/for-coaches" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
              Are you a coach?
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {!loading && !loadError && filtered.expanded && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm shadow-sm">
            <p className="font-bold text-blue-900">
              No coaches matched within {filtered.baseRadius} miles{activePlace ? ` of ${activePlace.label}` : ''}.
            </p>
            <p className="mt-1 text-blue-800">
              Showing coaches within {filtered.effectiveRadius} miles instead.
            </p>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            {loading && (
              <div className="space-y-4" aria-busy="true" aria-label="Loading coaches">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-56 animate-pulse rounded-3xl border border-slate-200 bg-white" />
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
                <h2 className="font-display text-2xl font-bold text-slate-950">We could not load coaches</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {loadError} This is a loading problem on our side. Your filters are fine.
                </p>
                <Button onClick={load} className="mt-5 rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              </div>
            )}

            {!loading && !loadError && filters.price !== 'any' && PRICE_BANDS.some((band) => band.value === filters.price) && (
              <p className="mb-4 text-sm text-slate-500">
                Showing coaches with published rates. Coaches without rates are hidden by this filter.
              </p>
            )}

            {!loading && !loadError && pageRows.length > 0 && (
              <>
                <div className="space-y-4">
                  {pageRows.map(({ coach }) => (
                    <PublicCoachCard
                      key={coach.id}
                      coach={coach}
                      packages={packages}
                      distanceMiles={activePlace ? coachDistanceMiles(coach, activePlace) : null}
                      bookingParams={bookingParams}
                    />
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100">
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-extrabold">Public profiles are checked before they appear here.</p>
                      <p className="mt-1 text-blue-800/80">
                        Coaches must be published, email-verified, and eligible for booking before their cards show in search.
                      </p>
                    </div>
                  </div>
                  <Link to="/safety" className="inline-flex shrink-0 items-center gap-1 font-extrabold text-blue-700 hover:underline">
                    Safety standards
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>

                {totalPages > 1 && (
                  <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Search results pages">
                    <Button
                      variant="outline"
                      disabled={safePage <= 1}
                      onClick={() => goToPage(safePage - 1)}
                      className="h-10 rounded-lg border-slate-200 px-3 font-bold"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="px-3 text-sm font-bold text-slate-700">
                      Page {safePage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={safePage >= totalPages}
                      onClick={() => goToPage(safePage + 1)}
                      className="h-10 rounded-lg border-slate-200 px-3 font-bold"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </nav>
                )}
              </>
            )}

            {!loading && !loadError && filtered.rows.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Search className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-bold text-slate-950">No coaches match those filters yet</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Try broadening the sport, radius, or other filters. New coaches appear here the moment
                  their profiles are published.
                </p>
                <div className="mt-5 flex flex-col items-center justify-center gap-3">
                  <Button onClick={clearFilters} className="rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
                    Clear filters and browse all coaches
                  </Button>
                  <Link
                    to="/apply/private-training-coach"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-blue-700 hover:underline"
                  >
                    Coach here? Be the first in your area
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <MarketplaceSidebar
            creditBalance={creditBalance}
            showCreditBalance={showCreditBalance}
            isAuthenticated={isAuthenticated}
            reviewStats={reviewStats}
          />
        </div>
      </section>
    </div>
  );
}

function TrustMiniCard({ title, body, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white/85 p-3 shadow-sm shadow-blue-900/5">
      <div className="flex items-center gap-2 font-extrabold text-slate-950">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="truncate">{title}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function SidebarTrustItem({ title, body, icon: Icon }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="font-extrabold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
      </div>
    </div>
  );
}

function MarketplaceSidebar({ creditBalance, showCreditBalance, isAuthenticated, reviewStats }) {
  const hasCredits = showCreditBalance && creditBalance.remainingCents > 0;
  const reviewCopy = reviewStats.reviews > 0
    ? `${reviewStats.rating}/5 from ${reviewStats.reviews.toLocaleString()} public review${reviewStats.reviews === 1 ? '' : 's'}`
    : 'Public reviews appear after completed sessions';

  return (
    <aside className="space-y-4 self-start xl:sticky xl:top-28">
      <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-lg shadow-blue-900/5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <WalletCards className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">Training credit</p>
            <h2 className="font-display text-xl font-extrabold tracking-normal text-slate-950">
              {hasCredits
                ? `${formatCreditMoney(creditBalance.remainingCents)} ready`
                : isAuthenticated
                  ? 'No active credit yet'
                  : 'Sign in to see credits'}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Credits are applied during booking by value. If a coach costs less, the leftover stays in your balance; if a coach costs more, checkout shows the difference.
        </p>
        {showCreditBalance && (
          <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm text-blue-900">
            <div className="flex items-center justify-between gap-3 font-extrabold">
              <span>Available balance</span>
              <span>{creditBalance.loading ? '...' : formatCreditMoney(creditBalance.remainingCents)}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-blue-800/80">
              {creditBalance.remainingSessions} credit{creditBalance.remainingSessions === 1 ? '' : 's'} remaining from purchased packages
            </p>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">Why athletes choose LevelCoach</p>
        <div className="mt-5 space-y-4">
          <SidebarTrustItem
            icon={BadgeCheck}
            title="Verified public profiles"
            body="Coaches appear in search only after their public profile and required account checks are complete."
          />
          <SidebarTrustItem
            icon={CircleDollarSign}
            title="Transparent pricing"
            body="Single-session prices are shown up front, and final totals are confirmed before Stripe checkout."
          />
          <SidebarTrustItem
            icon={CalendarDays}
            title="Live booking paths"
            body="Availability, package choices, documents, and session credit flow through one guided booking path."
          />
          <SidebarTrustItem
            icon={Trophy}
            title="Progress focused"
            body="Sessions, goals, homework, wellness reports, and coach feedback stay connected to the athlete profile."
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
        <div className="flex items-center gap-2">
          <Star className={`h-5 w-5 ${reviewStats.reviews > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
          <p className="font-display text-lg font-extrabold tracking-normal text-slate-950">
            Marketplace reviews
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{reviewCopy}</p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          Parents and athletes can compare completed-session reviews, pricing, specialties, and next availability before booking.
        </div>
      </div>
    </aside>
  );
}

function FilterSelect({ label, icon: Icon, value, options, onChange, compact = false }) {
  return (
    <div className={`group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 transition hover:border-blue-200 hover:bg-white hover:shadow-md hover:shadow-blue-900/5 ${compact ? 'py-3' : 'py-4'}`}>
      <span className={`${compact ? 'h-9 w-9' : 'h-10 w-10'} grid shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white`}>
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <SelectMenu
          value={value}
          onChange={onChange}
          ariaLabel={label}
          options={options}
          triggerClassName={`${compact ? 'text-sm' : 'text-base'} mt-1 h-auto w-full justify-start gap-1.5 border-0 bg-transparent p-0 font-extrabold text-slate-950 shadow-none hover:border-0 focus:border-0 focus:ring-0`}
        />
      </span>
    </div>
  );
}

function LocationInput({ value, onChange, suggestions = [], selectedPlaceLabel = '', onSelect }) {
  const showSuggestions = value && suggestions.length > 0 && value !== selectedPlaceLabel;

  return (
    <div className="group relative flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-blue-200 hover:bg-white hover:shadow-md hover:shadow-blue-900/5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white">
        <MapPin className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">Location</span>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-auto border-0 bg-transparent p-0 text-base font-extrabold text-slate-950 shadow-none outline-none placeholder:text-slate-500 focus-visible:ring-0"
          placeholder="City, county, or ZIP"
          aria-label="Location"
        />
      </span>
      {showSuggestions && (
        <span className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl shadow-slate-900/10">
          {suggestions.map((place) => (
            <button
              key={place.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect?.(place)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
            >
              <span>{place.label}</span>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{place.type}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
