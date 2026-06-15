import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { pricingPackageRepo, sessionCreditRepo } from '@/api/repo';
import { auth } from '@/lib/auth';
import { rpc } from '@/lib/rpc';
import {
  formatAvailabilityTime,
  normalizePublicCoach,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import {
  dateHasOpenSlots,
  formatInTz,
  slotsForDate,
  timezoneAbbreviation,
} from '@/lib/scheduleET';
import { Button } from '@/components/ui/button';
import SelectMenu from '@/components/forms/SelectMenu';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns';
import useCurrentUser from '@/hooks/useCurrentUser';
import StripeCheckout from '@/components/StripeCheckout';
import OnboardingModal from '@/components/OnboardingModal';
import BookingSummaryCard from '@/components/booking/BookingSummaryCard';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { legalSignerRoleForUser } from '@/lib/legal';
import { CANCEL_POLICY_COPY } from '@/lib/policies';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { useMyAthlete } from '@/features/athlete/useMyAthlete';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';

// Display-only estimates; createStripeCheckout recomputes the charge in cents
// from pricing_packages on the server using this same duration table.
const DURATIONS = [
  { label: '1 Hour',    minutes: 60,  hours: 1,   discount: 0 },
  { label: '1.5 Hours', minutes: 90,  hours: 1.5, discount: 0.10 },
  { label: '2 Hours',   minutes: 120, hours: 2,   discount: 0.15 },
  { label: '2.5 Hours', minutes: 150, hours: 2.5, discount: 0.18 },
  { label: '3 Hours',   minutes: 180, hours: 3,   discount: 0.20 },
];

const AVAILABILITY_RANGE_DAYS = 30;

const DATE_WINDOWS = [
  { value: 'next_7_days', label: 'Next 7 days' },
  { value: 'next_14_days', label: 'Next 14 days' },
  { value: 'next_30_days', label: 'Next 30 days' },
  { value: 'this_month', label: 'This month' },
];

const PREFERRED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

const DEFAULT_AVAILABILITY_PREFERENCE = {
  dateWindow: 'next_14_days',
  preferredDays: [],
  timeOfDay: [],
  earliestStart: '09:00',
  latestStart: '19:00',
};

const STEP_COACH = 0;
const STEP_ATHLETE = 1;
const STEP_SPORT = 2;
const STEP_FORMAT = 3;
const STEP_PACKAGE = 4;
const STEP_CHECKOUT = 5;

const STEP_LABELS = {
  [STEP_COACH]: 'Coach',
  [STEP_ATHLETE]: 'Athlete',
  [STEP_SPORT]: 'Sport',
  [STEP_FORMAT]: 'Location',
  [STEP_PACKAGE]: 'Package',
  [STEP_CHECKOUT]: 'Checkout',
};

const SPORT_LABELS = new Map(SPORTS_CATALOG.map((sport) => [sport.sport_key, sport.display_name]));

const LOCATION_FORMAT_OPTIONS = [
  { value: 'training_facility', label: 'Training facility', body: 'Meet at the coach or facility location configured in their portal.' },
  { value: 'coach_travels', label: 'Coach travels to you', body: 'Train at a client-side location within the coach service area.' },
  { value: 'online', label: 'Online', body: 'Meet virtually for remote training, film review, or coaching.' },
  { value: 'organization_facility', label: 'Organization/facility location', body: 'Train at the coach organization or partner facility.' },
  { value: 'hybrid', label: 'Hybrid options', body: 'Coordinate the best mix of facility, travel, or remote work after booking.' },
];

// A self-contained per-coach package carries its own total (price_cents) and
// session length (duration_minutes); the legacy per-hour multiplier no longer
// applies to it.
function packagePriceCents(pkg) {
  const pc = Number(pkg?.price_cents);
  return Number.isInteger(pc) && pc > 0 ? pc : null;
}
function isSelfContained(pkg) {
  return packagePriceCents(pkg) != null;
}
function packageDurationMinutes(pkg) {
  const d = Number(pkg?.duration_minutes);
  return Number.isInteger(d) && d >= 15 ? d : null;
}
function durationLabel(minutes) {
  if (minutes % 60 === 0) return `${minutes / 60} Hour${minutes > 60 ? 's' : ''}`;
  return `${minutes} Minutes`;
}
// DURATIONS entry for a given minute length, or a synthetic one (used for
// per-coach packages whose length isn't in the legacy table).
function durationFromMinutes(minutes) {
  if (!minutes) return null;
  return DURATIONS.find(d => d.minutes === minutes)
    || { label: durationLabel(minutes), minutes, hours: minutes / 60, discount: 0 };
}

// Per-session price in dollars (for display only — the server is authoritative).
function calcPrice(pkg, dur) {
  if (!pkg) return null;
  const pc = packagePriceCents(pkg);
  if (pc != null) return Math.round(pc / (pkg.sessions || 1)) / 100;
  if (!dur) return null;
  const perSessionBase = pkg.price / (pkg.sessions || 1);
  return Math.round(perSessionBase * dur.hours * (1 - dur.discount));
}

function remainingCredits(credit) {
  if (!credit) return 0;
  const remainingCents = Number(credit.remaining_amount_cents);
  if (Number.isInteger(remainingCents)) return remainingCents > 0 ? 1 : 0;
  const availableCents = Number(credit.available_amount_cents);
  if (Number.isInteger(availableCents)) return availableCents > 0 ? 1 : 0;
  return (Number(credit.total_credits) || 0) - (Number(credit.used_credits) || 0);
}

function remainingCreditBalance(credit) {
  const remainingCents = Number(credit?.remaining_amount_cents);
  if (Number.isInteger(remainingCents)) return Math.max(0, remainingCents) / 100;
  const availableCents = Number(credit?.available_amount_cents);
  return Number.isInteger(availableCents) ? Math.max(0, availableCents) / 100 : null;
}

function remainingCreditBalanceCents(credit) {
  const remainingCents = Number(credit?.remaining_amount_cents);
  if (Number.isInteger(remainingCents)) return Math.max(0, remainingCents);
  const availableCents = Number(credit?.available_amount_cents);
  if (Number.isInteger(availableCents)) return Math.max(0, availableCents);
  return null;
}

// Whole dollars stay clean ($75); fractional amounts always show two
// decimals ($75.50, never $75.5).
function formatMoney(amount) {
  const value = Number(amount) || 0;
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cleanKey(value) {
  return String(value || '').trim().toLowerCase();
}

function sportLabel(value) {
  return SPORT_LABELS.get(value) || String(value || '').replace(/_/g, ' ') || 'Sport';
}

function formatLabel(value) {
  return LOCATION_FORMAT_OPTIONS.find((option) => option.value === value)?.label || String(value || '').replace(/_/g, ' ');
}

function packageApplies(pkg, { sportKey = '', sessionFormat = '' } = {}) {
  const sportKeys = Array.isArray(pkg?.sport_keys) ? pkg.sport_keys.filter(Boolean) : [];
  if (sportKeys.length && (!sportKey || !sportKeys.includes(sportKey))) return false;
  const locationFormats = Array.isArray(pkg?.location_formats) ? pkg.location_formats.filter(Boolean) : [];
  if (locationFormats.length && (!sessionFormat || !locationFormats.includes(sessionFormat))) return false;
  return true;
}

function coachFormatOptions(coach, orgName = '') {
  const serviceType = cleanKey(coach?.service_type);
  const values = new Set();
  if (serviceType === 'facility') values.add('training_facility');
  if (serviceType === 'travels') values.add('coach_travels');
  if (serviceType === 'online') values.add('online');
  if (serviceType === 'hybrid') {
    values.add('training_facility');
    values.add('coach_travels');
    values.add('hybrid');
  }
  if (coach?.service_venue || coach?.organization?.id) values.add('organization_facility');
  return [...values].map((value) => {
    const base = LOCATION_FORMAT_OPTIONS.find((option) => option.value === value) || { value, label: formatLabel(value), body: '' };
    if (value === 'training_facility' && coach?.service_venue) {
      return { ...base, body: coach.service_venue };
    }
    if (value === 'organization_facility' && orgName) {
      return { ...base, body: orgName };
    }
    return base;
  });
}

export default function Book() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const preCoachId = urlParams.get('coach_id');
  const preCreditId = urlParams.get('credit_id');
  const stripeSuccess = urlParams.get('stripe_success');
  const { user, refetch } = useCurrentUser();
  const [showProfileGate, setShowProfileGate] = useState(false);

  // Arriving from a coach profile (/book?coach_id=X) locks the coach: the
  // wizard never shows the coach-selection step (step 0). The effective minimum
  // step is 1, and "Back" on step 1 returns to that coach's profile.
  const coachLocked = !!preCoachId;
  const minStep = coachLocked ? STEP_ATHLETE : STEP_COACH;

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('lc_booking') || 'null'); } catch { return null; } })();
  const hasSelectedBookingContext = !!preCoachId
    || !!preCreditId
    || stripeSuccess === '1'
    || urlParams.get('stripe_cancel') === '1'
    || !!saved?.coach?.id;

  const [step, setStep]                       = useState(Math.max(saved?.step ?? STEP_COACH, minStep));
  const [coach, setCoach]                     = useState(saved?.coach ? normalizePublicCoach(saved.coach) : null);
  const [coaches, setCoaches]                 = useState([]);
  const [packages, setPackages]               = useState([]);
  const [publicDataLoaded, setPublicDataLoaded] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(saved?.selectedPackage || null);
  const [existingCredit, setExistingCredit]   = useState(null);
  const [useExistingCredit, setUseExistingCredit] = useState(false);
  const [duration, setDuration]               = useState(saved?.duration || null);
  const [goals, setGoals]                     = useState(saved?.goals || '');
  const [availabilityMode, setAvailabilityMode] = useState(saved?.availabilityMode || 'exact');
  const [availabilityPreference, setAvailabilityPreference] = useState(() => {
    const merged = {
      ...DEFAULT_AVAILABILITY_PREFERENCE,
      ...(saved?.availabilityPreference || {}),
    };
    return {
      ...merged,
      preferredDays: Array.isArray(merged.preferredDays) ? merged.preferredDays : [],
      timeOfDay: Array.isArray(merged.timeOfDay) ? merged.timeOfDay : [],
    };
  });
  const [bookingLocation] = useState(() => {
    if (saved?.bookingLocation) return saved.bookingLocation;
    const radius = Number(urlParams.get('location_radius') || urlParams.get('radius') || 15);
    const lat = urlParams.get('location_lat');
    const lng = urlParams.get('location_lng');
    return {
      label: urlParams.get('location_label') || '',
      lat: lat !== null && lat !== '' ? Number(lat) : null,
      lng: lng !== null && lng !== '' ? Number(lng) : null,
      radius: Number.isFinite(radius) && radius > 0 ? radius : 15,
    };
  });
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [skipToSchedule, setSkipToSchedule] = useState(false);
  const [creditRecord, setCreditRecord]       = useState(null);
  const [stripeCheckoutMessage, setStripeCheckoutMessage] = useState('');

  // Scheduling state
  const [scheduling, setScheduling]           = useState(false);
  const [availability, setAvailability]       = useState(null); // {windows, busy, availability, timezone, start_date, end_date}
  const [selectedDate, setSelectedDate]       = useState(saved?.selectedDate ? parseISO(saved.selectedDate) : null);
  const [selectedTime, setSelectedTime]       = useState(saved?.selectedTime || '');
  const [submitting, setSubmitting]           = useState(false);
  const [sessionBooked, setSessionBooked]     = useState(false);
  const [lastBookedSession, setLastBookedSession] = useState(null);
  const [bookingError, setBookingError]       = useState('');

  // Guardian-managed athletes (family function). '' = booking for myself.
  const [familyAthletes, setFamilyAthletes]   = useState([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [selectedSport, setSelectedSport] = useState(saved?.selectedSport || urlParams.get('sport') || '');
  const [selectedSessionFormat, setSelectedSessionFormat] = useState(saved?.selectedSessionFormat || urlParams.get('session_format') || '');

  // Legal gates. Checkout uses the profile-level signer role (mirrors
  // createStripeCheckout); credit booking mirrors the booking function:
  // guardian when booking for a linked athlete, athlete otherwise.
  const checkoutSignerRole = user ? legalSignerRoleForUser(user) : '';
  const checkoutLegalStatus = useLegalPacketStatus({
    user,
    signerRole: checkoutSignerRole,
    coachId: checkoutSignerRole === 'coach' ? user?.coach_id || '' : '',
    organizationId: checkoutSignerRole === 'organization_admin' ? user?.primary_organization_id || '' : '',
  });
  const bookingSignerRole = user ? (selectedAthleteId ? 'guardian' : 'athlete') : '';
  const bookingLegalStatus = useLegalPacketStatus({
    user,
    signerRole: bookingSignerRole,
    athleteId: selectedAthleteId,
  });

  // The buyer's own athlete identity (athlete_profiles row id, falling back to
  // the profiles row id for self-managed adults). createStripeCheckout now
  // requires an athlete_id and verifies that athlete's legal consent, mirroring
  // the booking function. For a guardian buying for a child the SELECTED child's
  // athlete id is authoritative; otherwise the buyer's own athlete id is sent.
  const { athleteProfile: myAthleteProfile } = useMyAthlete(user);
  const checkoutAthleteId = selectedAthleteId || myAthleteProfile?.id || user?.id || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coachRes = await rpc.invoke('getPublicCoaches', {}).catch((err) => {
          console.warn('Public coaches unavailable', err);
          return null;
        });
        if (cancelled) return;
        setCoaches((coachRes?.data?.coaches || []).map(normalizePublicCoach));
      } catch (err) {
        console.error('Book public data load failed', err);
      } finally {
        if (!cancelled) setPublicDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Packages are per-coach: load the selected coach's own packages (falling
  // back to platform-default templates only if the coach has none). This is the
  // marketplace model — each coach sets their own prices. When the coach has an
  // active organization affiliation, that org's packages are loaded too and
  // shown alongside the coach's own (each tagged with its source so the UI can
  // label org packages "From {Org}"). createStripeCheckout independently
  // validates that an org package is bookable for this coach.
  const coachOrgId = coach?.organization?.id || '';
  const coachOrgName = coach?.organization?.name || '';
  useEffect(() => {
    let cancelled = false;
    if (!coach?.id) { setPackages([]); return undefined; }
    (async () => {
      let coachRows = await pricingPackageRepo.listForCoach(coach.id).catch(() => []);
      if (!coachRows.length) coachRows = await pricingPackageRepo.listPlatformDefaults().catch(() => []);
      const orgRows = coachOrgId
        ? await pricingPackageRepo.listForOrg(coachOrgId).catch(() => [])
        : [];
      if (cancelled) return;
      const tagged = [
        ...coachRows.map((p) => ({ ...p, source: 'coach' })),
        ...orgRows.map((p) => ({ ...p, source: 'org', org_name: coachOrgName })),
      ];
      setPackages(tagged);
      // Drop a stale package selection that doesn't belong to this coach/org.
      setSelectedPackage(prev => (prev && tagged.some(r => r.id === prev.id) ? prev : null));
    })();
    return () => { cancelled = true; };
  }, [coach?.id, coachOrgId, coachOrgName]);

  // One-shot: pre-select coach from /coaches/:id "Book with this coach" link.
  useEffect(() => {
    if (!preCoachId || coaches.length === 0) return;
    const picked = coaches.find(c => c.id === preCoachId);
    if (!picked) return;
    setCoach(picked);
    setStep(prev => Math.max(prev, STEP_ATHLETE));
    // Intentionally not depending on `coach` so this only fires once per coach list load.
     
  }, [preCoachId, coaches]);

  // Availability: opaque busy ranges + bookable windows only — never sessions.
  const loadAvailability = useCallback(async (coachId) => {
    if (!coachId) {
      setAvailability(null);
      return;
    }
    try {
      const res = await rpc.invoke('getCoachAvailability', {
        coach_id: coachId,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(addDays(new Date(), AVAILABILITY_RANGE_DAYS), 'yyyy-MM-dd'),
      });
      setAvailability(res.data || null);
    } catch (err) {
      console.warn('Coach availability unavailable', err);
      setAvailability(null);
    }
  }, []);

  useEffect(() => {
    loadAvailability(coach?.id);
  }, [coach?.id, loadAvailability]);

  // Credits the signed-in user can read (own + guardian-granted documents).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const credits = await sessionCreditRepo.list().catch(() => []);
      if (cancelled) return;
      let active;
      if (preCreditId) {
        active = credits.find(c => c.id === preCreditId && remainingCredits(c) > 0);
      }
      if (!active) {
        active = credits.find(c => remainingCredits(c) > 0);
      }
      setExistingCredit(active || null);
      setUseExistingCredit(!!active);

      // Arriving with a credit preselects that balance, but still walks through
      // sport/location/package so the selected coach price is clear before
      // scheduling.
      if (preCreditId && active) {
        setCreditRecord(active);
        if (active.session_duration_minutes) {
          const creditDur = durationFromMinutes(active.session_duration_minutes);
          if (creditDur) setDuration(creditDur);
        }
      }
    })();
    return () => { cancelled = true; };
     
  }, [user?.id]);

  // Guardian-managed athletes for the athlete selector.
  useEffect(() => {
    if (!user || user.is_minor === true) return;
    let cancelled = false;
    rpc.invoke('family', { action: 'listFamily' })
      .then((res) => {
        if (cancelled) return;
        const rows = [
          ...(res.data?.children || []),
          ...(res.data?.linked_athletes || []),
        ];
        setFamilyAthletes(rows.map((athlete) => ({
          id: athlete.$id || athlete.id,
          name: [athlete.first_name, athlete.last_name].filter(Boolean).join(' ').trim() || 'Athlete',
        })).filter((athlete) => athlete.id));
      })
      .catch(() => {});
    return () => { cancelled = true; };
     
  }, [user?.id, user?.is_minor]);

  // Detect Stripe Checkout success redirect.
  useEffect(() => {
    if (stripeSuccess === '1' && user) {
      let cancelled = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_success');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname);
      setStep(STEP_CHECKOUT);
      setStripeCheckoutMessage('Payment received. Waiting for Stripe to finish issuing your training credits.');

      (async () => {
        let active = null;
        for (let i = 0; i < 8; i += 1) {
          const credits = await sessionCreditRepo.list().catch(() => []);
          active = credits.find(c => remainingCredits(c) > 0 && c.payment_processor === 'stripe');
          if (active || cancelled) break;
          await new Promise(r => setTimeout(r, 1500));
        }
        if (cancelled) return;
        if (active) {
          setExistingCredit(active);
          setUseExistingCredit(true);
          setCreditRecord(active);
          if (active.session_duration_minutes) {
            const creditDur = durationFromMinutes(active.session_duration_minutes);
            if (creditDur) setDuration(creditDur);
          }
          setStripeCheckoutMessage('');
          setPaymentConfirmed(true);
        } else {
          setStripeCheckoutMessage('Stripe confirmed the checkout, but the credit package is still processing. Refresh this page in a moment or check your dashboard.');
        }
      })();
      return () => { cancelled = true; };
    }
     
  }, [stripeSuccess, user?.id]);

  const coachModel = coach ? publicCoachDisplay(coach, { packages }) : null;
  const coachTimezone = availability?.timezone || coach?.timezone || '';
  const tzAbbr = timezoneAbbreviation(coachTimezone);
  const slotDurationMinutes = duration?.minutes
    || creditRecord?.session_duration_minutes
    || existingCredit?.session_duration_minutes
    || 60;

  const isDateDisabled = (date) => {
    if (isBefore(date, startOfDay(new Date()))) return true;
    const dateStr = format(date, 'yyyy-MM-dd');
    if (availability?.start_date && dateStr < availability.start_date) return true;
    if (availability?.end_date && dateStr > availability.end_date) return true;
    return !dateHasOpenSlots(availability, dateStr, slotDurationMinutes);
  };

  const openSlots = selectedDate
    ? slotsForDate(availability, format(selectedDate, 'yyyy-MM-dd'), slotDurationMinutes)
    : [];

  const coachSports = (Array.isArray(coach?.sports) ? coach.sports : [])
    .map(cleanKey)
    .filter(Boolean);
  const uniqueCoachSports = [...new Set(coachSports)];
  const formatOptions = coach ? coachFormatOptions(coach, coachOrgName) : [];
  const needsAthleteStep = familyAthletes.length > 1;
  const needsSportStep = uniqueCoachSports.length > 1;
  const needsFormatStep = formatOptions.length > 1;
  const effectiveSport = selectedSport || (!needsSportStep ? uniqueCoachSports[0] || '' : '');
  const effectiveFormat = selectedSessionFormat || (!needsFormatStep ? formatOptions[0]?.value || '' : '');
  const filteredPackages = useMemo(
    () => packages.filter((pkg) => packageApplies(pkg, { sportKey: effectiveSport, sessionFormat: effectiveFormat })),
    [packages, effectiveSport, effectiveFormat],
  );
  const visibleSteps = useMemo(() => {
    const steps = [];
    if (!coachLocked) steps.push(STEP_COACH);
    if (needsAthleteStep) steps.push(STEP_ATHLETE);
    if (needsSportStep) steps.push(STEP_SPORT);
    if (needsFormatStep) steps.push(STEP_FORMAT);
    steps.push(STEP_PACKAGE, STEP_CHECKOUT);
    return steps;
  }, [coachLocked, needsAthleteStep, needsSportStep, needsFormatStep]);

  useEffect(() => {
    if (familyAthletes.length === 1 && !selectedAthleteId) {
      setSelectedAthleteId(familyAthletes[0].id);
    }
  }, [familyAthletes, selectedAthleteId]);

  useEffect(() => {
    if (uniqueCoachSports.length === 1 && selectedSport !== uniqueCoachSports[0]) {
      setSelectedSport(uniqueCoachSports[0]);
    }
    if (uniqueCoachSports.length > 1 && selectedSport && !uniqueCoachSports.includes(selectedSport)) {
      setSelectedSport('');
    }
  }, [selectedSport, uniqueCoachSports]);

  useEffect(() => {
    if (formatOptions.length === 1 && selectedSessionFormat !== formatOptions[0].value) {
      setSelectedSessionFormat(formatOptions[0].value);
    }
    if (formatOptions.length > 1 && selectedSessionFormat && !formatOptions.some((option) => option.value === selectedSessionFormat)) {
      setSelectedSessionFormat('');
    }
  }, [formatOptions, selectedSessionFormat]);

  useEffect(() => {
    if (selectedPackage && !filteredPackages.some((pkg) => pkg.id === selectedPackage.id)) {
      setSelectedPackage(null);
    }
  }, [filteredPackages, selectedPackage]);

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      const nextVisible = visibleSteps.find((candidate) => candidate > step) || visibleSteps[0] || STEP_PACKAGE;
      setStep(nextVisible);
    }
  }, [step, visibleSteps]);

  const sessionPrice = calcPrice(selectedPackage, duration);
  // Total actually charged today (display-only — the server recomputes the
  // charge in cents from pricing_packages).
  const packageTotal = packagePriceCents(selectedPackage) != null
    ? packagePriceCents(selectedPackage) / 100
    : (sessionPrice != null ? sessionPrice * (selectedPackage?.sessions || 1) : null);
  const sessionPriceCents = sessionPrice != null ? Math.round(sessionPrice * 100) : null;
  const existingCreditRemainingCents = existingCredit ? remainingCreditBalanceCents(existingCredit) : null;
  const existingCreditAmountDueCents = useExistingCredit && sessionPriceCents != null && existingCreditRemainingCents != null
    ? Math.max(0, sessionPriceCents - existingCreditRemainingCents)
    : 0;
  const selectedAthleteName = selectedAthleteId
    ? familyAthletes.find((athlete) => athlete.id === selectedAthleteId)?.name || 'Selected athlete'
    : [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'Myself';
  // createStripeCheckout now verifies per-athlete legal consent (mirroring
  // booking), so the pay action is gated on BOTH the buyer's profile-level
  // packet AND — when buying for a SELECTED child — that child's athlete-scoped
  // consent. A guardian who picks an unconsented child sees checkout disabled.
  const selectedAthleteConsentReady = !selectedAthleteId
    || bookingLegalStatus.loading
    || bookingLegalStatus.complete;
  const legalReadyForCheckout = !user
    || (checkoutLegalStatus.complete && selectedAthleteConsentReady);
  const flexibleAvailabilityValid = availabilityMode !== 'flexible'
    || (
      availabilityPreference.preferredDays.length > 0
      && availabilityPreference.timeOfDay.length > 0
      && availabilityPreference.earliestStart
      && availabilityPreference.latestStart
      && availabilityPreference.earliestStart < availabilityPreference.latestStart
    );
  const checkoutExtraPayload = {
    // Who the credits/sessions are for: the SELECTED child's athlete id when a
    // guardian buys for a child, else the buyer's own athlete id. The server
    // requires this for guardian/parent buyers and checks its legal consent.
    athlete_id: checkoutAthleteId,
    sport_key: effectiveSport,
    session_format: effectiveFormat,
    session_format_label: formatLabel(effectiveFormat),
    booking_location_label: bookingLocation.label || '',
    booking_location_lat: bookingLocation.lat ?? '',
    booking_location_lng: bookingLocation.lng ?? '',
    booking_location_radius: bookingLocation.radius || 15,
    availability_mode: availabilityMode,
    availability_preference: availabilityPreference,
    client_notes: goals.trim(),
  };

  if (!hasSelectedBookingContext) {
    return <Navigate to="/coaches" replace />;
  }

  if (coachLocked && !coach) {
    if (!publicDataLoaded) {
      return (
        <div className="min-h-[70vh] bg-slate-50 px-4 py-24 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Loading booking options...</p>
        </div>
      );
    }
    return (
      <div className="min-h-[70vh] bg-slate-50 px-4 py-24">
        <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="font-display text-2xl font-bold text-slate-950">Coach not found</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">That coach profile is no longer available.</p>
          <Button asChild className="mt-5 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700">
            <Link to="/coaches">Find another coach</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Minors never book directly — a linked parent/guardian books for them.
  if (user?.is_minor === true) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-accent" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-4">Ask a parent or guardian</h1>
          <p className="text-muted-foreground text-sm leading-6 mb-6">
            Because you're under 18, sessions have to be booked by your parent or guardian from
            their own account. Ask them to sign in, link your athlete profile, and book for you.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="font-semibold">
              <Link to="/coaches">Keep browsing coaches</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const saveBookingIntent = (extra = {}) => {
    sessionStorage.setItem('lc_booking', JSON.stringify({
      step,
      coach,
      selectedPackage,
      duration,
      selectedSport: effectiveSport,
      selectedSessionFormat: effectiveFormat,
      goals,
      bookingLocation,
      availabilityMode,
      availabilityPreference,
      selectedDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
      selectedTime,
      ...extra,
    }));
  };

  const ensureFlexiblePreferenceValid = async () => {
    if (availabilityMode === 'flexible' && !flexibleAvailabilityValid) {
      throw new Error('Select preferred days, time of day, and a valid start window before checkout.');
    }
  };

  const toggleAvailabilityArray = (key, value) => {
    setAvailabilityPreference((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  };

  const handleUseExistingCredits = () => {
    if (!user) {
      saveBookingIntent();
      auth.signIn(window.location.href);
      return;
    }
    sessionStorage.removeItem('lc_booking');
    if (useExistingCredit && existingCredit) {
      setCreditRecord(existingCredit);
      setPaymentConfirmed(true);
    }
  };

  // Credit booking goes through the booking function — the server validates
  // availability, conflicts, legal packet, guardianship, and decrements the
  // credit atomically. No client-side session writes.
  const handleBookSession = async () => {
    if (!selectedDate || !selectedTime || !coach) return;
    const activeCredit = creditRecord || existingCredit;
    if (!activeCredit) {
      setBookingError('No active credit package is available yet. Please wait for Stripe to finish processing your payment.');
      return;
    }
    setSubmitting(true);
    setBookingError('');
    try {
      const res = await rpc.invoke('booking', {
        action: 'book',
        coach_id: coach.id,
        credit_id: activeCredit.id,
        ...(selectedPackage?.id ? { package_id: selectedPackage.id } : {}),
        sport_key: effectiveSport,
        session_format: effectiveFormat,
        session_format_label: formatLabel(effectiveFormat),
        date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime,
        duration_minutes: slotDurationMinutes,
        ...(selectedAthleteId ? { athlete_id: selectedAthleteId } : {}),
        ...(goals.trim() ? { notes: goals.trim() } : {}),
      });

      const fresh = await sessionCreditRepo.get(activeCredit.id).catch(() => null);
      const updatedCredit = fresh || {
        ...activeCredit,
        used_credits: (Number(activeCredit.used_credits) || 0) + 1,
      };
      setCreditRecord(updatedCredit);
      setExistingCredit(remainingCredits(updatedCredit) > 0 ? updatedCredit : null);

      await loadAvailability(coach.id);
      setLastBookedSession(res.data?.session || null);
      setSessionBooked(true);
      setSelectedDate(null);
      setSelectedTime('');
    } catch (err) {
      // Server validation messages are user-friendly — surface them verbatim.
      if (err?.data?.requires_top_up && Number.isInteger(Number(err.data.top_up_amount_cents))) {
        setBookingError(`This coach costs $${formatMoney(Number(err.data.top_up_amount_cents) / 100)} more than your available credit balance. Add a top-up before booking.`);
      } else {
        setBookingError(err?.data?.error || 'Could not book the session. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Payment confirmed / scheduling screens ────────────────────────────────
  if (paymentConfirmed || skipToSchedule) {
    if (sessionBooked) {
      const remainingOnCredit = remainingCredits(creditRecord);
      const remainingBalance = remainingCreditBalance(creditRecord);
      const bookedWhen = lastBookedSession
        ? formatInTz(lastBookedSession.date, lastBookedSession.start_time, lastBookedSession.timezone)
        : '';
      const handleScheduleAnother = () => {
        setSessionBooked(false);
        setSelectedDate(null);
        setSelectedTime('');
        setScheduling(true);
      };
      return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-accent" aria-hidden="true" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-4">Session booked</h1>
            <p className="text-muted-foreground mb-2">
              Your session has been confirmed{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.
            </p>
            {bookedWhen && (
              <p className="text-sm font-semibold text-foreground mb-2">{bookedWhen}</p>
            )}
            <p className="text-sm text-muted-foreground mb-6">A confirmation email has been sent.</p>

            {remainingOnCredit > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-accent mb-1">
                  {remainingBalance != null
                    ? `$${formatMoney(remainingBalance)} credit balance remaining`
                    : `${remainingOnCredit} session${remainingOnCredit !== 1 ? 's' : ''} remaining`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {creditRecord.package_name}{creditRecord.session_duration_minutes ? ` · ${creditRecord.session_duration_minutes / 60} hr${creditRecord.session_duration_minutes > 60 ? 's' : ''} each` : ''}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-5 mb-6">{CANCEL_POLICY_COPY}</p>

            <div className="flex flex-col gap-3">
              {remainingOnCredit > 0 && (
                <Button onClick={handleScheduleAnother}
                  className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
                  Schedule another session
                </Button>
              )}
              <Button variant={remainingOnCredit > 0 ? 'outline' : 'default'}
                onClick={() => window.location.href = '/dashboard'}
                className={remainingOnCredit > 0 ? 'font-semibold' : 'bg-accent text-accent-foreground font-semibold'}>
                Go to dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (scheduling) {
      // Coach not yet selected (e.g. Stripe redirect / credit flow) — pick one first.
      if (!coach) {
        return (
          <div className="min-h-[80vh] py-12">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Select your coach</h2>
              <p className="text-muted-foreground text-sm mb-8">Choose the coach you want to train with.</p>
              {coaches.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {publicDataLoaded ? 'No coaches are accepting bookings right now.' : 'Loading coaches...'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {coaches.map((c) => (
                    <CoachPickButton key={c.id} coach={c} selected={false} onSelect={() => setCoach(c)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[80vh] py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Schedule your session</h2>
            <p className="text-muted-foreground text-sm mb-2">
              Pick a date and time{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.
              {tzAbbr ? ` Times are shown in the coach's timezone (${tzAbbr}).` : ''}
            </p>
            <p className="text-xs text-muted-foreground mb-8">{CANCEL_POLICY_COPY}</p>

            {familyAthletes.length > 0 && (
              <div className="mb-6 rounded-lg border border-border bg-card p-4">
                <label htmlFor="book-athlete" className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Who is this session for?
                </label>
                <div className="mt-2">
                  <SelectMenu
                    id="book-athlete"
                    value={selectedAthleteId}
                    onChange={setSelectedAthleteId}
                    ariaLabel="Who is this session for?"
                    options={[
                      { value: '', label: 'Myself' },
                      ...familyAthletes.map((athlete) => ({ value: athlete.id, label: athlete.name })),
                    ]}
                    triggerClassName="h-11 text-sm font-semibold"
                  />
                </div>
                {selectedAthleteId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Booking for a linked athlete uses your parent/guardian legal packet.
                  </p>
                )}
              </div>
            )}

            {user && !bookingLegalStatus.loading && !bookingLegalStatus.complete && (
              <div className="mb-6">
                <LegalSignaturePanel
                  signerRole={bookingSignerRole}
                  athleteId={selectedAthleteId}
                  title="Legal packet required"
                  description="Complete the current required documents before confirming a session. The server enforces this on every booking."
                  onStatusChange={(status) => {
                    if (status?.complete && !bookingLegalStatus.complete) void bookingLegalStatus.refresh();
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Pick a date</p>
                <Calendar mode="single" selected={selectedDate}
                  onSelect={(date) => { setSelectedDate(date); setSelectedTime(''); }}
                  disabled={isDateDisabled}
                  className="rounded-lg border border-border bg-card p-4" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing availability for the next {AVAILABILITY_RANGE_DAYS + 1} days.
                </p>
              </div>
              {selectedDate && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                    Pick a time{tzAbbr ? ` (${tzAbbr})` : ''}
                  </p>
                  {openSlots.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                      No open times on this date. Try another day.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {openSlots.map((time) => (
                        <button key={time} type="button" onClick={() => setSelectedTime(time)}
                          aria-pressed={selectedTime === time}
                          className={`p-2 rounded-md border text-xs font-semibold transition-all ${selectedTime === time ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}>
                          {formatAvailabilityTime(time)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {bookingError && (
              <p role="alert" className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {bookingError}
              </p>
            )}

            <div className="flex gap-3 mt-8">
              <Button variant="outline" onClick={() => setScheduling(false)} className="font-semibold">
                Back
              </Button>
              <Button onClick={handleBookSession} disabled={!selectedDate || !selectedTime || submitting}
                className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
                {submitting ? 'Booking...' : 'Confirm session'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Payment confirmed — choose to schedule now or later.
    const confirmedCredit = creditRecord || existingCredit;
    const confirmedRemaining = confirmedCredit ? remainingCredits(confirmedCredit) : (selectedPackage?.sessions || 1);
    const confirmedRemainingBalance = confirmedCredit ? remainingCreditBalance(confirmedCredit) : packageTotal;
    const confirmedDuration = confirmedCredit?.session_duration_minutes || duration?.minutes || 60;
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-4">Payment confirmed</h1>
          <div className="bg-card border border-border rounded-lg p-4 mb-8">
            <p className="text-lg font-semibold mb-1">
              {confirmedCredit?.package_name || selectedPackage?.name}
            </p>
            <p className="text-muted-foreground text-sm">
              {confirmedRemainingBalance !== null
                ? `$${formatMoney(confirmedRemainingBalance)} credit balance available`
                : `${confirmedRemaining} session${confirmedRemaining !== 1 ? 's' : ''} available`}
              {confirmedDuration ? ` · ${confirmedDuration / 60} hr${confirmedDuration > 60 ? 's' : ''} each` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setScheduling(true)}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
              Schedule first session
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard'}
              className="font-semibold">
              Schedule later from dashboard
            </Button>
            <Button asChild variant="outline" className="font-semibold">
              <Link to="/messages">Message the coach</Link>
            </Button>
            <Button asChild variant="outline" className="font-semibold">
              <Link to={checkoutSignerRole === 'guardian' ? '/parent/settings?section=children' : '/athlete/settings'}>
                Complete athlete notes/preferences
              </Link>
            </Button>
            <Button asChild variant="ghost" className="font-semibold">
              <Link to="/dashboard">View remaining credit balance</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canProceed = () => {
    switch (step) {
      case STEP_COACH: return !!coach;
      case STEP_ATHLETE: return !!selectedAthleteId;
      case STEP_SPORT: return !!effectiveSport;
      case STEP_FORMAT: return !!effectiveFormat;
      case STEP_PACKAGE: return !!selectedPackage;
      case STEP_CHECKOUT: return true;
      default: return false;
    }
  };
  const currentVisibleStepIndex = Math.max(0, visibleSteps.indexOf(step));
  const goNextStep = () => {
    const next = visibleSteps[currentVisibleStepIndex + 1];
    if (next !== undefined) setStep(next);
  };
  const goBackStep = () => {
    if (currentVisibleStepIndex <= 0) {
      if (coachLocked && preCoachId) navigate(`/coaches/${preCoachId}`);
      return;
    }
    setStep(visibleSteps[currentVisibleStepIndex - 1]);
  };

  const summaryProps = {
    coach,
    coachLocationLabel: coachModel?.locationLabel || '',
    pkg: selectedPackage,
    duration,
    sessionPrice,
    packageTotal,
    usingCredit: useExistingCredit,
    creditRemaining: existingCredit ? remainingCredits(existingCredit) : null,
    creditRemainingBalance: existingCreditRemainingCents != null ? formatMoney(existingCreditRemainingCents / 100) : null,
    creditDurationMinutes: existingCredit?.session_duration_minutes ?? null,
    creditPackageName: existingCredit?.package_name ?? null,
    sportLabel: effectiveSport ? sportLabel(effectiveSport) : (coachModel?.primarySport || 'Any sport'),
    sessionFormatLabel: effectiveFormat ? formatLabel(effectiveFormat) : (coachModel?.serviceTypeLabel || 'Coach training area'),
  };

  return (
    <div className="min-h-[80vh] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
        {/* Progress — hidden steps are omitted so the user only sees choices
            that are actually needed for this coach/package flow. */}
        {(() => {
          const displayIndex = Math.max(0, visibleSteps.indexOf(step));
          return (
            <div className="mb-12">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Step {displayIndex + 1} of {visibleSteps.length}</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{STEP_LABELS[step]}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((displayIndex + 1) / visibleSteps.length) * 100}%` }} />
              </div>
            </div>
          );
        })()}

        {/* Step 0: Coach */}
        {step === STEP_COACH && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-8">Select your coach</h2>
            {coaches.length === 0 ? (
              publicDataLoaded ? (
                <p className="text-muted-foreground">No coaches are accepting bookings right now.</p>
              ) : (
                <div role="status" aria-label="Loading coaches" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="p-6 rounded-lg border border-border bg-card flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-full bg-secondary shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-2/3 rounded bg-secondary" />
                        <div className="h-3 w-1/2 rounded bg-secondary" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading coaches...</span>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {coaches.map((c) => (
                  <CoachPickButton key={c.id} coach={c} selected={coach?.id === c.id} onSelect={() => setCoach(c)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Athlete */}
        {step === STEP_ATHLETE && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Choose athlete</h2>
            <p className="text-muted-foreground text-sm mb-8">Select which athlete this credit and future session are for.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {familyAthletes.map((athlete) => {
                const selected = selectedAthleteId === athlete.id;
                return (
                  <button
                    key={athlete.id}
                    type="button"
                    onClick={() => setSelectedAthleteId(athlete.id)}
                    aria-pressed={selected}
                    className={`rounded-lg border p-5 text-left transition-all ${selected ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}
                  >
                    <Users className="mb-3 h-5 w-5" aria-hidden="true" />
                    <p className="text-lg font-semibold text-foreground">{athlete.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Credits and scheduling will be tied to this athlete.</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Sport */}
        {step === STEP_SPORT && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Choose sport</h2>
            <p className="text-muted-foreground text-sm mb-8">
              {coach ? `${coach.first_name || 'This coach'} offers multiple sports. Pick the one you want to train.` : 'Pick a sport to train.'}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {uniqueCoachSports.map((sport) => {
                const selected = effectiveSport === sport;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setSelectedSport(sport)}
                    aria-pressed={selected}
                    className={`rounded-lg border p-5 text-left transition-all ${selected ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}
                  >
                    <Sparkles className="mb-3 h-5 w-5" aria-hidden="true" />
                    <p className="text-lg font-semibold text-foreground">{sportLabel(sport)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Package options will be filtered to this sport.</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Location / format */}
        {step === STEP_FORMAT && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Choose location or format</h2>
            <p className="text-muted-foreground text-sm mb-8">Only the formats configured by this coach are shown.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {formatOptions.map((option) => {
                const selected = effectiveFormat === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedSessionFormat(option.value)}
                    aria-pressed={selected}
                    className={`rounded-lg border p-5 text-left transition-all ${selected ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}
                  >
                    <MapPin className="mb-3 h-5 w-5" aria-hidden="true" />
                    <p className="text-lg font-semibold text-foreground">{option.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.body}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Package */}
        {step === STEP_PACKAGE && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-2">Select a package</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Packages create prepaid LevelCoach credit. You can schedule now after checkout, schedule later, or use remaining credit with another published coach.
            </p>

            {existingCredit && (
              <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-sm font-bold text-primary mb-1">You have existing credit</p>
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>
                    {remainingCreditBalance(existingCredit) !== null
                      ? `$${formatMoney(remainingCreditBalance(existingCredit))}`
                      : `${remainingCredits(existingCredit)} session${remainingCredits(existingCredit) === 1 ? '' : 's'}`}
                  </strong>
                  {' '}remaining on <strong>{existingCredit.package_name || 'your prepaid balance'}</strong>.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setUseExistingCredit(true);
                      setCreditRecord(existingCredit);
                      if (existingCredit.session_duration_minutes) {
                        const creditDur = durationFromMinutes(existingCredit.session_duration_minutes);
                        if (creditDur) setDuration(creditDur);
                      }
                    }}
                    className={`px-4 py-2 rounded-md border text-xs font-semibold transition-all ${useExistingCredit ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
                    Use existing balance
                  </button>
                  <button onClick={() => setUseExistingCredit(false)}
                    className={`px-4 py-2 rounded-md border text-xs font-semibold transition-all ${!useExistingCredit ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
                    Buy new package
                  </button>
                </div>
              </div>
            )}

            {filteredPackages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {coach ? `${coach.name || 'This coach'} has no packages for this sport and format yet.` : 'Select a coach to see their packages.'}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredPackages.map((pkg) => {
                const totalCents = packagePriceCents(pkg);
                const totalLabel = totalCents != null
                  ? `$${(totalCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                  : `$${pkg.price}`;
                const perSession = totalCents != null
                  ? Math.round(totalCents / (pkg.sessions || 1)) / 100
                  : Math.round(pkg.price / (pkg.sessions || 1));
                const pkgDuration = packageDurationMinutes(pkg);
                const isSelected = selectedPackage?.id === pkg.id;
                return (
                  <button key={pkg.id} onClick={() => {
                    setSelectedPackage(pkg);
                    setUseExistingCredit(false);
                    // Packages carry the session length; legacy packages fall
                    // back to a standard 60-minute session.
                    setDuration(durationFromMinutes(pkgDuration || 60));
                  }}
                    className={`p-6 rounded-lg border text-left transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    {pkg.badge && (
                      <span className="absolute top-3 right-3 text-xs font-semibold bg-accent text-accent-foreground px-2 py-0.5 rounded">{pkg.badge}</span>
                    )}
                    {pkg.source === 'org' && pkg.org_name && (
                      <span className="inline-block mb-2 text-xs font-bold uppercase tracking-[0.18em] bg-primary/15 text-primary px-2 py-0.5 rounded">
                        From {pkg.org_name}
                      </span>
                    )}
                    <Package className={`w-5 h-5 mb-3 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
                    <p className="text-xl font-semibold">{pkg.name}</p>
                    <p className="text-2xl font-display font-bold text-accent mt-1">{totalLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pkg.sessions > 1 ? `${pkg.sessions} sessions · $${perSession}/session` : '1 session'}
                      {pkgDuration != null ? ` · ${pkgDuration} min` : ''}
                      {pkg.session_type ? ` · ${String(pkg.session_type).replace('_', ' ')}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {Array.isArray(pkg.sport_keys) && pkg.sport_keys.length ? pkg.sport_keys.map(sportLabel).join(', ') : 'All selected sports'}
                      {' · '}
                      {Array.isArray(pkg.location_formats) && pkg.location_formats.length ? pkg.location_formats.map(formatLabel).join(', ') : 'All selected formats'}
                    </p>
                    {pkg.description && <p className="text-sm text-muted-foreground mt-3">{pkg.description}</p>}
                    {pkg.includes?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {pkg.includes.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-accent inline-block" />{item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showProfileGate && user && (
          <OnboardingModal
            user={user}
            onComplete={() => {
              setShowProfileGate(false);
              refetch();
              setStep(STEP_CHECKOUT);
            }}
          />
        )}

        {/* Step 5: Checkout */}
        {step === STEP_CHECKOUT && (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em] mb-8">Checkout</h2>

            {/* Order Summary */}
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Order summary</p>
              <div className="space-y-1">
                {[
                  ['Athlete', selectedAthleteName],
                  ['Sport', effectiveSport ? sportLabel(effectiveSport) : 'Any sport'],
                  ['Location / format', effectiveFormat ? formatLabel(effectiveFormat) : (coachModel?.serviceTypeLabel || 'Coach training area')],
                  ['Package', selectedPackage?.name],
                  ['Sessions', selectedPackage?.sessions > 1 ? `${selectedPackage.sessions} sessions` : '1 session'],
                  ['Session duration', duration?.label],
                  ['Coach', coach ? `${coach.first_name} ${coach.last_name}` : ''],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-muted-foreground text-sm">{label}</span>
                    <span className="font-semibold text-sm">{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 mt-2 border-t border-border">
                <span className="text-sm font-semibold">Total charged today</span>
                <span className="proof-number text-3xl sm:text-4xl text-foreground">
                  {useExistingCredit
                    ? (existingCreditAmountDueCents > 0 ? `$${formatMoney(existingCreditAmountDueCents / 100)}` : '$0')
                    : (packageTotal != null ? `$${formatMoney(packageTotal)}` : '—')}
                </span>
              </div>
              {useExistingCredit ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    Selected session price: <span className="font-semibold text-foreground">{sessionPriceCents != null ? `$${formatMoney(sessionPriceCents / 100)}` : 'Calculated at booking'}</span>
                  </p>
                  <p>
                    Existing balance: <span className="font-semibold text-foreground">{existingCreditRemainingCents != null ? `$${formatMoney(existingCreditRemainingCents / 100)}` : `${remainingCredits(existingCredit)} session${remainingCredits(existingCredit) === 1 ? '' : 's'}`}</span>
                    {existingCredit?.package_name ? ` on ${existingCredit.package_name}` : ''}
                  </p>
                  {existingCreditAmountDueCents > 0 ? (
                    <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-yellow-600">
                      This balance is short by {`$${formatMoney(existingCreditAmountDueCents / 100)}`}. Top-up checkout will be required before this session can be confirmed.
                    </p>
                  ) : (
                    <p>Covered by your existing LevelCoach credit. Any cheaper-session leftover stays on the credit balance.</p>
                  )}
                </div>
              ) : (
                <>
                  {selectedPackage?.sessions > 1 && sessionPrice != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${sessionPrice} per session × {selectedPackage.sessions} sessions
                    </p>
                  )}
                  {duration?.discount > 0 && (
                    <p className="text-xs text-green-400 mt-2">{Math.round(duration.discount * 100)}% multi-hour discount applied</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Final pricing is computed securely at checkout from the platform package catalog.
                  </p>
                </>
              )}
            </div>

            {user && !user.profile_setup_complete && (
              <div className="mb-6 rounded-lg border border-accent/30 bg-accent/10 p-4">
                <p className="text-sm font-bold text-accent mb-1">Profile setup required</p>
                <p className="text-xs text-muted-foreground mb-3">Complete your profile before checkout or credit booking.</p>
                <Button
                  onClick={() => setShowProfileGate(true)}
                  size="sm"
                  className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
                >
                  Set up profile
                </Button>
              </div>
            )}

            {user && (
              <div className="mb-6">
                <LegalSignaturePanel
                  signerRole={checkoutSignerRole}
                  coachId={checkoutSignerRole === 'coach' ? user?.coach_id || '' : ''}
                  organizationId={checkoutSignerRole === 'organization_admin' ? user?.primary_organization_id || '' : ''}
                  title="Legal packet required"
                  description="Complete the current required documents before paying for or scheduling training."
                  compact={checkoutLegalStatus.complete}
                  onStatusChange={(status) => {
                    if (status?.complete && !checkoutLegalStatus.complete) void checkoutLegalStatus.refresh();
                  }}
                />
              </div>
            )}

            {/* Payment Options */}
            {!useExistingCredit && (
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Payment</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Pay <strong className="proof-number text-foreground">{packageTotal != null ? `$${formatMoney(packageTotal)}` : ''}</strong> securely through Stripe Checkout.
                </p>
                {!user ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-4">You must be signed in to complete your purchase.</p>
                    <Button
                      className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
                      onClick={() => {
                        saveBookingIntent();
                        auth.signIn(window.location.href);
                      }}
                    >
                      Sign in to pay
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!legalReadyForCheckout && (
                      <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
                        {checkoutLegalStatus.complete && selectedAthleteId && !selectedAthleteConsentReady
                          ? 'Stripe Checkout unlocks after you complete the legal packet for the selected athlete.'
                          : 'Stripe Checkout unlocks after the required legal packet is complete.'}
                      </p>
                    )}
                    {stripeCheckoutMessage && (
                      <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                        {stripeCheckoutMessage}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Checkout requires the coach to be fully set up for payouts. If the coach isn't
                      ready yet, you'll see a clear message here instead of being charged.
                    </p>
                    <div className="border-t border-border pt-4">
                      <StripeCheckout
                        packageId={selectedPackage?.id}
                        coachId={coach?.id}
                        sessionDurationMinutes={duration?.minutes}
                        extraPayload={checkoutExtraPayload}
                        onBeforeCheckout={ensureFlexiblePreferenceValid}
                        disabled={!legalReadyForCheckout || !user.profile_setup_complete || !selectedPackage?.id || !coach?.id}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-4 border-t border-border pt-4 space-y-2">
                  <p className="text-xs text-muted-foreground leading-5">{CANCEL_POLICY_COPY}</p>
                  <p className="text-xs text-muted-foreground leading-5">
                    Payments are processed by Stripe — your card details never touch LevelCoach servers.
                  </p>
                </div>
              </div>
            )}

            {useExistingCredit && (
              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent mb-1">Credit package available</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Use your active training credits to schedule this session.
                </p>
                <Button onClick={handleUseExistingCredits} disabled={submitting || !existingCredit || !user?.profile_setup_complete || existingCreditAmountDueCents > 0}
                  className="w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90 h-12 text-base">
                  Use my credits & continue
                </Button>
                {existingCreditAmountDueCents > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Add a top-up for {`$${formatMoney(existingCreditAmountDueCents / 100)}`} before this credit can reserve the selected coach's session.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobile summary — collapsible card just above nav buttons */}
        <div className="mt-8 lg:hidden">
          <BookingSummaryCard {...summaryProps} />
        </div>

        {/* Navigation */}
        {step !== STEP_CHECKOUT && (
          <div className="flex justify-between mt-6 lg:mt-10">
            <Button
              variant="outline"
              onClick={() => {
                goBackStep();
              }}
              disabled={!coachLocked && currentVisibleStepIndex === 0}
              className="font-semibold"
            >
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
            <Button onClick={goNextStep} disabled={!canProceed()}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}
        {step === STEP_CHECKOUT && (
          <div className="flex mt-6">
            <Button variant="outline" onClick={goBackStep} className="font-semibold">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
          </div>
        )}
          </div>

          {/* Desktop summary sidebar */}
          <div className="lg:col-span-1">
            <BookingSummaryCard {...summaryProps} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachPickButton({ coach, selected, onSelect }) {
  const model = publicCoachDisplay(coach);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`p-6 rounded-lg border text-left transition-all flex items-center gap-4 ${selected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}
    >
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
        {model.photoUrl
          ? <img src={model.photoUrl} alt={model.displayName} className="w-full h-full object-cover" />
          : <User className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold flex items-center gap-2">
          <span className="truncate">{model.displayName}</span>
          {model.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Email verified" />}
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent truncate">{model.primarySport}</p>
        <p className="text-xs text-muted-foreground truncate">{model.locationLabel}</p>
      </div>
    </button>
  );
}

function LoggedOutBookIntro({
  coach,
  packages,
  introPackage,
  introDuration,
  introPrice,
  availability,
  tzAbbr,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  goals,
  setGoals,
  isDateDisabled,
  saveBookingIntent,
}) {
  const model = publicCoachDisplay(coach, { packages });
  const introSlots = selectedDate
    ? slotsForDate(availability, format(selectedDate, 'yyyy-MM-dd'), introDuration?.minutes || 60)
    : [];

  const saveIntroIntent = (nextStep = introPackage ? 3 : 1) => {
    saveBookingIntent({
      step: nextStep,
      selectedPackage: introPackage,
      duration: introDuration,
      intro: true,
    });
  };

  const createAccount = () => {
    saveIntroIntent();
    window.location.assign(`/create-account/athlete?next=${encodeURIComponent(window.location.href)}`);
  };

  const signIn = () => {
    saveIntroIntent();
    auth.signIn(window.location.href);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
          <Link to={model.profileHref} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-blue-700 ring-1 ring-blue-100">
                <Sparkles className="h-3.5 w-3.5" />
                Intro session preview
              </div>
              <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                Book an intro with {model.firstName}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Pick a time, add optional notes, then create a free athlete account to confirm the booking safely.
              </p>

              <div className="mt-6 flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                  {model.photoUrl ? (
                    <img src={model.photoUrl} alt={model.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center font-display text-xl font-bold text-blue-900">{model.initials}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-2xl font-bold text-slate-950">{model.displayName}</p>
                    {model.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 ring-1 ring-emerald-100">
                        <BadgeCheck className="h-3 w-3" />
                        Email verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{model.organizationName}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-blue-600" />{model.locationLabel}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{model.availability}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <IntroStat icon={Clock} label="Duration" value={introDuration?.label || '1 Hour'} />
                <IntroStat
                  icon={Package}
                  label="Intro price"
                  value={introPrice != null ? `$${introPrice}` : model.rateLabel || 'Shown after account'}
                />
                <IntroStat icon={ShieldCheck} label="Booking" value="Account required" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Choose a time</p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">Preview availability</h2>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                  Logged out
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[320px_1fr]">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedTime('');
                  }}
                  disabled={isDateDisabled}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                />

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Available times{tzAbbr ? ` (${tzAbbr})` : ''}
                  </p>
                  {selectedDate ? (
                    introSlots.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                        No open times on this date. Try another day.
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {introSlots.map((time) => (
                          <button
                            key={time}
                            type="button"
                            onClick={() => setSelectedTime(time)}
                            aria-pressed={selectedTime === time}
                            className={`h-10 rounded-lg border text-xs font-bold transition ${
                              selectedTime === time
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            {formatAvailabilityTime(time)}
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                      Select a date to preview open times from {model.firstName}'s saved availability.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1480px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Intro notes</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">Anything the coach should know?</h2>
          <Textarea
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            placeholder="Anything the coach should know before your intro?"
            className="mt-4 min-h-28 border-slate-200 bg-slate-50"
          />
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Intro summary</p>
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="Coach" value={model.displayName} />
            <SummaryRow label="Date" value={selectedDate ? format(selectedDate, 'EEE, MMM d') : 'Choose a date'} />
            <SummaryRow label="Time" value={selectedTime ? `${formatAvailabilityTime(selectedTime)}${tzAbbr ? ` ${tzAbbr}` : ''}` : 'Choose a time'} />
            <SummaryRow label="Duration" value={introDuration?.label || '1 Hour'} />
            <SummaryRow label="Price" value={introPrice != null ? `$${introPrice}` : 'Shown after account'} />
          </div>

          <div className="mt-5 rounded-lg bg-blue-50 p-4 ring-1 ring-blue-100">
            <p className="text-sm font-bold text-slate-950">Account required to confirm</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              This keeps athlete details, payment, reminders, and coach messages inside LevelCoach.
            </p>
            {selectedDate && selectedTime && (
              <p className="mt-2 text-xs font-semibold leading-5 text-blue-700">
                Your selected time is saved — it will be here after you sign in.
              </p>
            )}
          </div>

          <Button
            onClick={createAccount}
            disabled={!selectedDate || !selectedTime}
            className="mt-4 h-11 w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
          >
            Create free account
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={signIn}
            className="mt-2 h-11 w-full rounded-lg border-blue-200 bg-white font-bold text-blue-700 hover:bg-blue-50"
          >
            Sign in instead
          </Button>
          {(!selectedDate || !selectedTime) && (
            <p className="mt-3 text-center text-xs font-semibold text-slate-500">Pick a date and time to continue.</p>
          )}
        </aside>
      </section>
    </div>
  );
}

function IntroStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold text-slate-950">{value}</span>
    </div>
  );
}
