import React, { useCallback, useEffect, useState } from 'react';
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
  Timer,
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
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';

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

const CANCEL_POLICY_COPY =
  'Cancel 24 or more hours before a session starts and your credit is restored automatically. '
  + 'Cancellations inside 24 hours forfeit the credit, unless the coach cancels.';

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

// Steps: 0=Coach, 1=Package, 2=Duration, 3=Preferences, 4=Checkout
const STEPS = ['Coach', 'Package', 'Duration', 'Preferences', 'Checkout'];

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
  return (Number(credit.total_credits) || 0) - (Number(credit.used_credits) || 0);
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
  const minStep = coachLocked ? 1 : 0;

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('lc_booking') || 'null'); } catch { return null; } })();
  const hasSelectedBookingContext = !!preCoachId
    || !!preCreditId
    || stripeSuccess === '1'
    || urlParams.get('stripe_cancel') === '1'
    || !!saved?.coach?.id;

  const [step, setStep]                       = useState(Math.max(saved?.step ?? 0, coachLocked ? 1 : 0));
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
    setStep(prev => Math.max(prev, 1));
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

      // Auto-skip to scheduling when arriving from Dashboard with a valid credit.
      if (preCreditId && active) {
        setCreditRecord(active);
        setPaymentConfirmed(true);
        setSkipToSchedule(true);
        if (active.session_duration_minutes) {
          const creditDur = durationFromMinutes(active.session_duration_minutes);
          if (creditDur) setDuration(creditDur);
        }
        setScheduling(true);
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
      setStep(4);
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

  const sessionPrice = calcPrice(selectedPackage, duration);
  const legalReadyForCheckout = !user || checkoutLegalStatus.complete;
  const flexibleAvailabilityValid = availabilityMode !== 'flexible'
    || (
      availabilityPreference.preferredDays.length > 0
      && availabilityPreference.timeOfDay.length > 0
      && availabilityPreference.earliestStart
      && availabilityPreference.latestStart
      && availabilityPreference.earliestStart < availabilityPreference.latestStart
    );
  const checkoutExtraPayload = {
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

  // Minors never book directly — a linked parent/guardian books for them.
  if (user?.is_minor === true) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-accent" aria-hidden="true" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mb-4">ASK A PARENT OR GUARDIAN</h1>
          <p className="text-muted-foreground text-sm leading-6 mb-6">
            Because you're under 18, sessions have to be booked by your parent or guardian from
            their own account. Ask them to sign in, link your athlete profile, and book for you.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="font-display tracking-wider uppercase">
              <Link to="/coaches">Keep Browsing Coaches</Link>
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
      setBookingError(err?.data?.error || 'Could not book the session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Payment confirmed / scheduling screens ────────────────────────────────
  if (paymentConfirmed || skipToSchedule) {
    if (sessionBooked) {
      const remainingOnCredit = remainingCredits(creditRecord);
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
            <h1 className="font-display text-3xl font-bold tracking-tight mb-4">SESSION BOOKED!</h1>
            <p className="text-muted-foreground mb-2">
              Your session has been confirmed{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.
            </p>
            {bookedWhen && (
              <p className="text-sm font-display tracking-wider text-foreground mb-2">{bookedWhen}</p>
            )}
            <p className="text-sm text-muted-foreground mb-6">A confirmation email has been sent.</p>

            {remainingOnCredit > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-4">
                <p className="font-display text-sm font-bold tracking-wider text-accent uppercase mb-1">
                  {remainingOnCredit} session{remainingOnCredit !== 1 ? 's' : ''} remaining
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
                  className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
                  Schedule Another Session
                </Button>
              )}
              <Button variant={remainingOnCredit > 0 ? 'outline' : 'default'}
                onClick={() => window.location.href = '/dashboard'}
                className={remainingOnCredit > 0 ? 'font-display tracking-wider uppercase' : 'bg-accent text-accent-foreground font-display tracking-wider uppercase'}>
                Go to Dashboard
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
              <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SELECT YOUR COACH</h2>
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
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SCHEDULE YOUR SESSION</h2>
            <p className="text-muted-foreground text-sm mb-2">
              Pick a date and time{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.
              {tzAbbr ? ` Times are shown in the coach's timezone (${tzAbbr}).` : ''}
            </p>
            <p className="text-xs text-muted-foreground mb-8">{CANCEL_POLICY_COPY}</p>

            {familyAthletes.length > 0 && (
              <div className="mb-6 rounded-lg border border-border bg-card p-4">
                <label htmlFor="book-athlete" className="text-xs font-display tracking-widest uppercase text-muted-foreground">
                  Who is this session for?
                </label>
                <select
                  id="book-athlete"
                  value={selectedAthleteId}
                  onChange={(event) => setSelectedAthleteId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent"
                >
                  <option value="">Myself</option>
                  {familyAthletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>{athlete.name}</option>
                  ))}
                </select>
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
                  title="Legal Packet Required"
                  description="Complete the current required documents before confirming a session. The server enforces this on every booking."
                  onStatusChange={(status) => {
                    if (status?.complete && !bookingLegalStatus.complete) void bookingLegalStatus.refresh();
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
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
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">
                    Pick a Time{tzAbbr ? ` (${tzAbbr})` : ''}
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
                          className={`p-2 rounded-md border text-xs font-display tracking-wide transition-all ${selectedTime === time ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}>
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
              <Button variant="outline" onClick={() => setScheduling(false)} className="font-display tracking-wider uppercase">
                Back
              </Button>
              <Button onClick={handleBookSession} disabled={!selectedDate || !selectedTime || submitting}
                className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
                {submitting ? 'Booking...' : 'Confirm Session'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Payment confirmed — choose to schedule now or later.
    const confirmedCredit = creditRecord || existingCredit;
    const confirmedRemaining = confirmedCredit ? remainingCredits(confirmedCredit) : (selectedPackage?.sessions || 1);
    const confirmedDuration = confirmedCredit?.session_duration_minutes || duration?.minutes || 60;
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" aria-hidden="true" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight mb-4">PAYMENT CONFIRMED!</h1>
          <div className="bg-card border border-border rounded-lg p-4 mb-8">
            <p className="font-display text-lg font-bold tracking-wider mb-1">
              {confirmedCredit?.package_name || selectedPackage?.name}
            </p>
            <p className="text-muted-foreground text-sm">
              {confirmedRemaining} session{confirmedRemaining !== 1 ? 's' : ''} available
              {confirmedDuration ? ` · ${confirmedDuration / 60} hr${confirmedDuration > 60 ? 's' : ''} each` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setScheduling(true)}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              Schedule Now
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard'}
              className="font-display tracking-wider uppercase">
              Schedule Later from Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (preCoachId && !user) {
    if (!coach && !publicDataLoaded) {
      return (
        <div className="min-h-[70vh] bg-slate-50 px-4 py-24 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Loading intro booking...</p>
        </div>
      );
    }

    if (!coach) {
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

    const introPackage = packages.find((pkg) => Number(pkg.sessions) === 1) || packages[0] || null;
    const introDuration = duration || DURATIONS[0];
    const introPrice = introPackage ? calcPrice(introPackage, introDuration) : null;

    return (
      <LoggedOutBookIntro
        coach={coach}
        packages={packages}
        introPackage={introPackage}
        introDuration={introDuration}
        introPrice={introPrice}
        availability={availability}
        tzAbbr={tzAbbr}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        goals={goals}
        setGoals={setGoals}
        isDateDisabled={isDateDisabled}
        saveBookingIntent={saveBookingIntent}
      />
    );
  }

  const canProceed = () => {
    switch (step) {
      case 0: return !!coach;
      case 1: return !!selectedPackage;
      case 2: return !!duration;
      case 3: return (!user || user.profile_setup_complete) && flexibleAvailabilityValid;
      case 4: return true;
      default: return false;
    }
  };

  const summaryProps = {
    coach,
    coachLocationLabel: coachModel?.locationLabel || '',
    pkg: selectedPackage,
    duration,
    sessionPrice,
    packageTotal: packagePriceCents(selectedPackage) != null
      ? packagePriceCents(selectedPackage) / 100
      : (sessionPrice != null ? sessionPrice * (selectedPackage?.sessions || 1) : null),
    usingCredit: useExistingCredit,
    creditRemaining: existingCredit ? remainingCredits(existingCredit) : null,
    creditDurationMinutes: existingCredit?.session_duration_minutes ?? null,
    creditPackageName: existingCredit?.package_name ?? null,
    bookingLocation,
    availabilityMode,
  };

  return (
    <div className="min-h-[80vh] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
        {/* Progress — when the coach is locked, the Coach step is hidden so the
            indicator never invites returning to coach-selection. */}
        {(() => {
          const visibleSteps = coachLocked ? STEPS.slice(1) : STEPS;
          const displayIndex = coachLocked ? step - 1 : step;
          return (
            <div className="mb-12">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-display tracking-widest uppercase text-muted-foreground">Step {displayIndex + 1} of {visibleSteps.length}</span>
                <span className="text-xs font-display tracking-widest uppercase text-accent">{STEPS[step]}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((displayIndex + 1) / visibleSteps.length) * 100}%` }} />
              </div>
            </div>
          );
        })()}

        {/* Step 0: Coach */}
        {step === 0 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-8">SELECT YOUR COACH</h2>
            {coaches.length === 0 ? (
              <p className="text-muted-foreground">
                {publicDataLoaded ? 'No coaches are accepting bookings right now.' : 'Loading coaches...'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {coaches.map((c) => (
                  <CoachPickButton key={c.id} coach={c} selected={coach?.id === c.id} onSelect={() => setCoach(c)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Package */}
        {step === 1 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SELECT A PACKAGE</h2>
            <p className="text-muted-foreground text-sm mb-8">Multi-session packages give you credits to schedule sessions whenever you're ready.</p>

            {existingCredit && (
              <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-primary font-display tracking-wider text-sm uppercase mb-1">You have existing sessions!</p>
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>{remainingCredits(existingCredit)}</strong> session(s) remaining on <strong>{existingCredit.package_name}</strong>
                  {existingCredit.session_duration_minutes ? ` · ${existingCredit.session_duration_minutes / 60} hr each` : ''}.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setUseExistingCredit(true);
                      setSkipToSchedule(true);
                      setPaymentConfirmed(true);
                      setCreditRecord(existingCredit);
                      if (existingCredit.session_duration_minutes) {
                        const creditDur = durationFromMinutes(existingCredit.session_duration_minutes);
                        if (creditDur) setDuration(creditDur);
                      }
                      setScheduling(true);
                    }}
                    className="px-4 py-2 rounded-md border text-xs font-display tracking-wide uppercase transition-all border-accent bg-accent/10 text-accent hover:bg-accent/20">
                    Use Existing Sessions — Schedule Now
                  </button>
                  <button onClick={() => setUseExistingCredit(false)}
                    className={`px-4 py-2 rounded-md border text-xs font-display tracking-wide uppercase transition-all ${!useExistingCredit ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
                    Buy New Package
                  </button>
                </div>
              </div>
            )}

            {packages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {coach ? `${coach.name || 'This coach'} hasn't published any packages yet.` : 'Select a coach to see their packages.'}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packages.map((pkg) => {
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
                    // A self-contained package fixes the session length; pre-set
                    // it so the Duration step becomes a confirmation.
                    setDuration(pkgDuration != null ? durationFromMinutes(pkgDuration) : null);
                  }}
                    className={`p-6 rounded-lg border text-left transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    {pkg.badge && (
                      <span className="absolute top-3 right-3 text-xs font-display tracking-wide bg-accent text-accent-foreground px-2 py-0.5 rounded">{pkg.badge}</span>
                    )}
                    {pkg.source === 'org' && pkg.org_name && (
                      <span className="inline-block mb-2 text-[10px] font-display tracking-wide uppercase bg-primary/15 text-primary px-2 py-0.5 rounded">
                        From {pkg.org_name}
                      </span>
                    )}
                    <Package className={`w-5 h-5 mb-3 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
                    <p className="font-display text-xl font-bold tracking-wider">{(pkg.name || '').toUpperCase()}</p>
                    <p className="text-2xl font-display font-bold text-accent mt-1">{totalLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pkg.sessions > 1 ? `${pkg.sessions} sessions · $${perSession}/session` : '1 session'}
                      {pkgDuration != null ? ` · ${pkgDuration} min` : ''}
                      {pkg.session_type ? ` · ${String(pkg.session_type).replace('_', ' ')}` : ''}
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

        {/* Step 2: Duration */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SESSION DURATION</h2>
            {isSelfContained(selectedPackage) ? (
              <>
                <p className="text-muted-foreground text-sm mb-8">
                  This package sets the session length. Confirm and continue.
                </p>
                <div className="rounded-lg border border-accent bg-accent/10 p-6 max-w-sm">
                  <Timer className="w-5 h-5 text-accent mb-2" aria-hidden="true" />
                  <p className="font-display text-lg font-bold tracking-wider">
                    {duration?.label || `${packageDurationMinutes(selectedPackage)} Minutes`}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPackage?.sessions > 1 ? `${selectedPackage.sessions} sessions · ` : ''}
                    ${(packagePriceCents(selectedPackage) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} total
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm mb-8">Longer sessions get a discount off the hourly rate.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {DURATIONS.map((d) => {
                    const price = calcPrice(selectedPackage, d);
                    const isSelected = duration?.minutes === d.minutes;
                    return (
                      <button key={d.minutes} onClick={() => setDuration(d)}
                        className={`p-6 rounded-lg border text-center transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                        {d.discount > 0 && (
                          <span className="absolute top-2 right-2 text-xs font-display bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                            -{Math.round(d.discount * 100)}%
                          </span>
                        )}
                        <Timer className={`w-5 h-5 mx-auto mb-2 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
                        <span className="font-display text-lg font-bold tracking-wider block">{d.label}</span>
                        {price !== null && (
                          <span className={`text-sm font-display font-bold mt-1 block ${isSelected ? 'text-accent' : 'text-muted-foreground'}`}>${price}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Preferences */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">AVAILABILITY & NOTES</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Choose a specific scheduling path or share a flexible window the coach can work with.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ['exact', 'Choose exact times', 'Pick session times after checkout using the coach calendar.'],
                ['flexible', 'I am flexible', 'Share date windows, preferred days, and start-time preferences.'],
              ].map(([value, title, body]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAvailabilityMode(value)}
                  className={`rounded-lg border p-5 text-left transition-all ${
                    availabilityMode === value
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-accent/30'
                  }`}
                >
                  <p className="font-display text-lg font-bold tracking-wider uppercase">{title}</p>
                  <p className="mt-2 text-sm leading-6">{body}</p>
                </button>
              ))}
            </div>

            {availabilityMode === 'flexible' && (
              <div className="mt-6 rounded-lg border border-border bg-card p-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-display tracking-widest uppercase text-muted-foreground">Date Window</span>
                    <select
                      value={availabilityPreference.dateWindow}
                      onChange={(event) => setAvailabilityPreference((prev) => ({ ...prev, dateWindow: event.target.value }))}
                      className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent"
                    >
                      {DATE_WINDOWS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className="text-xs font-display tracking-widest uppercase text-muted-foreground">Start Window</span>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <input
                        type="time"
                        value={availabilityPreference.earliestStart}
                        onChange={(event) => setAvailabilityPreference((prev) => ({ ...prev, earliestStart: event.target.value }))}
                        className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent"
                        aria-label="Earliest start"
                      />
                      <input
                        type="time"
                        value={availabilityPreference.latestStart}
                        onChange={(event) => setAvailabilityPreference((prev) => ({ ...prev, latestStart: event.target.value }))}
                        className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent"
                        aria-label="Latest start"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground">Preferred Days</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PREFERRED_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleAvailabilityArray('preferredDays', day)}
                        aria-pressed={availabilityPreference.preferredDays.includes(day)}
                        className={`rounded-full border px-3 py-2 text-xs font-bold transition-all ${
                          availabilityPreference.preferredDays.includes(day)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-muted-foreground hover:border-accent/30'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground">Time of Day</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {TIME_OF_DAY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleAvailabilityArray('timeOfDay', option.value)}
                        aria-pressed={availabilityPreference.timeOfDay.includes(option.value)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${
                          availabilityPreference.timeOfDay.includes(option.value)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-muted-foreground hover:border-accent/30'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
                  Location radius: <span className="font-bold text-foreground">{bookingLocation.radius || 15} miles</span>
                  {bookingLocation.label ? ` from ${bookingLocation.label}` : (coachModel?.locationLabel ? ` from ${coachModel.locationLabel}` : ' from the coach service area')}
                </div>

                {!flexibleAvailabilityValid && (
                  <p className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600">
                    Select at least one preferred day, one time of day, and a valid start window.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6">
              <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-2">Optional Notes</p>
              <Textarea
                placeholder="Anything the coach should know before the first session?"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="bg-card border-border"
                rows={4}
              />
            </div>

            {user && !user.profile_setup_complete && (
              <div className="mt-6 p-4 rounded-lg bg-accent/10 border border-accent/30">
                <p className="text-accent font-display tracking-wider uppercase text-sm mb-1">Profile Setup Required</p>
                <p className="text-xs text-muted-foreground mb-3">Complete your profile before proceeding to checkout.</p>
                <Button
                  onClick={() => setShowProfileGate(true)}
                  size="sm"
                  className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
                >
                  Set Up Profile
                </Button>
              </div>
            )}
          </div>
        )}

        {showProfileGate && user && (
          <OnboardingModal
            user={user}
            onComplete={() => {
              setShowProfileGate(false);
              refetch();
              setStep(4);
            }}
          />
        )}

        {/* Step 4: Checkout */}
        {step === 4 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-8">CHECKOUT</h2>

            {/* Order Summary */}
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
              <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-4">Order Summary</p>
              <div className="space-y-1">
                {[
                  ['Package', selectedPackage?.name],
                  ['Sessions', selectedPackage?.sessions > 1 ? `${selectedPackage.sessions} sessions` : '1 session'],
                  ['Session Duration', duration?.label],
                  ['Coach', coach ? `${coach.first_name} ${coach.last_name}` : ''],
                  ['Location', bookingLocation.label
                    ? `${bookingLocation.label} (${bookingLocation.radius || 15} mi)`
                    : (coachModel?.locationLabel || 'Coach training area')],
                  ['Availability', availabilityMode === 'flexible' ? 'Flexible window' : 'Exact scheduling'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-muted-foreground text-sm">{label}</span>
                    <span className="font-display tracking-wider text-sm">{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 mt-2 border-t border-border">
                <span className="font-display text-lg font-bold tracking-wider">PER SESSION TOTAL</span>
                <span className="font-display text-2xl font-bold text-accent">${sessionPrice}</span>
              </div>
              {duration?.discount > 0 && (
                <p className="text-xs text-green-400 mt-2">{Math.round(duration.discount * 100)}% multi-hour discount applied</p>
              )}
              {selectedPackage?.sessions > 1 && sessionPrice && (
                <p className="text-xs text-muted-foreground mt-1">
                  Package total: ${sessionPrice * selectedPackage.sessions} for {selectedPackage.sessions} sessions
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Final pricing is computed securely at checkout from the platform package catalog.
              </p>
            </div>

            {user && (
              <div className="mb-6">
                <LegalSignaturePanel
                  signerRole={checkoutSignerRole}
                  coachId={checkoutSignerRole === 'coach' ? user?.coach_id || '' : ''}
                  organizationId={checkoutSignerRole === 'organization_admin' ? user?.primary_organization_id || '' : ''}
                  title="Legal Packet Required"
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
                <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-4">Payment</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Pay <strong className="text-foreground">${sessionPrice * (selectedPackage?.sessions || 1)}</strong> securely through Stripe Checkout.
                </p>
                {!user ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-4">You must be signed in to complete your purchase.</p>
                    <Button
                      className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
                      onClick={() => {
                        saveBookingIntent();
                        auth.signIn(window.location.href);
                      }}
                    >
                      Sign In to Pay
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!legalReadyForCheckout && (
                      <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
                        Stripe Checkout unlocks after the required legal packet is complete.
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
                        disabled={!legalReadyForCheckout || !selectedPackage?.id || !coach?.id}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {useExistingCredit && (
              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 mb-6">
                <p className="text-xs text-accent font-display tracking-wide uppercase mb-1">Credit package available</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Use your active training credits to schedule this session.
                </p>
                <Button onClick={handleUseExistingCredits} disabled={submitting || !existingCredit}
                  className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90 h-12 text-base">
                  Use My Credits & Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Mobile summary — collapsible card just above nav buttons */}
        <div className="mt-8 lg:hidden">
          <BookingSummaryCard {...summaryProps} />
        </div>

        {/* Navigation */}
        {step < 4 && (
          <div className="flex justify-between mt-6 lg:mt-10">
            <Button
              variant="outline"
              onClick={() => {
                // When the coach is locked and we're on the first usable step,
                // "Back" returns to the coach's profile rather than the
                // coach-selection list the user never chose from.
                if (coachLocked && step === minStep) {
                  navigate(`/coaches/${preCoachId}`);
                  return;
                }
                setStep(Math.max(minStep, step - 1));
              }}
              disabled={!coachLocked && step === 0}
              className="font-display tracking-wider uppercase"
            >
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}
        {step === 4 && (
          <div className="flex mt-6">
            <Button variant="outline" onClick={() => setStep(3)} className="font-display tracking-wider uppercase">
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
        <p className="font-display text-lg font-bold tracking-wider flex items-center gap-2">
          <span className="truncate">{model.displayName}</span>
          {model.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Verified" />}
        </p>
        <p className="text-xs text-accent font-display tracking-wider uppercase truncate">{model.primarySport}</p>
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
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 ring-1 ring-blue-100">
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
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
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
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
          </div>

          <Button
            onClick={createAccount}
            disabled={!selectedDate || !selectedTime}
            className="mt-4 h-11 w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
          >
            Create Free Account
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={signIn}
            className="mt-2 h-11 w-full rounded-lg border-blue-200 bg-white font-bold text-blue-700 hover:bg-blue-50"
          >
            Sign In Instead
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
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
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
