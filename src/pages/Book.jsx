import React, { useState, useEffect } from 'react';
import {
  athleteAvailabilityPreferenceRepo,
  pricingPackageRepo,
  sessionCreditRepo,
  sessionRepo,
} from '@/api/repo';
import { auth } from '@/lib/auth';
import { rpc } from '@/lib/rpc';
import {
  formatAvailabilityTime,
  normalizePublicCoach,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Link, Navigate } from 'react-router-dom';
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
} from 'lucide-react';
import { format, isBefore, startOfDay, parseISO, isWithinInterval } from 'date-fns';
import useCurrentUser from '@/hooks/useCurrentUser';
import StripeCheckout from '@/components/StripeCheckout';
import OnboardingModal from '@/components/OnboardingModal';
import BookingSummaryCard from '@/components/booking/BookingSummaryCard';
import { DEMO_COACH_PROFILES } from '@/lib/demoCoachProfiles';
import { loadDemoCoachProfilesEnabled } from '@/lib/demoCoachSettings';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { legalSignerRoleForUser } from '@/lib/legal';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { placeFromParams } from '@/lib/metroDetroitPlaces';

const DURATIONS = [
  { label: '1 Hour',    minutes: 60,  hours: 1,   discount: 0 },
  { label: '1.5 Hours', minutes: 90,  hours: 1.5, discount: 0.10 },
  { label: '2 Hours',   minutes: 120, hours: 2,   discount: 0.15 },
  { label: '2.5 Hours', minutes: 150, hours: 2.5, discount: 0.18 },
  { label: '3 Hours',   minutes: 180, hours: 3,   discount: 0.20 },
];

const TIME_SLOTS = [];
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

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

// Steps: 0=County, 1=Coach, 2=Package, 3=Duration, 4=Availability, 5=Checkout
const STEPS = ['County', 'Coach', 'Package', 'Duration', 'Availability', 'Checkout'];

function calcPrice(pkg, dur) {
  if (!pkg || !dur) return null;
  const perSessionBase = pkg.price / (pkg.sessions || 1);
  return Math.round(perSessionBase * dur.hours * (1 - dur.discount));
}

export default function Book() {
  const urlParams = new URLSearchParams(window.location.search);
  const preCounty = urlParams.get('county');
  const preCoachId = urlParams.get('coach_id');
  const preCreditId = urlParams.get('credit_id');
  const stripeSuccess = urlParams.get('stripe_success');
  const queryPlace = placeFromParams(urlParams);
  const { user, refetch } = useCurrentUser();
  const [showProfileGate, setShowProfileGate] = useState(false);
  const signerRole = user ? legalSignerRoleForUser(user) : '';
  const legalStatus = useLegalPacketStatus({
    user,
    signerRole,
    coachId: signerRole === 'coach' ? user?.coach_id || '' : '',
    organizationId: signerRole === 'organization_admin' ? user?.primary_organization_id || '' : '',
  });

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('lc_booking') || 'null'); } catch { return null; } })();
  const hasSelectedBookingContext = !!preCoachId
    || !!preCreditId
    || stripeSuccess === '1'
    || urlParams.get('stripe_cancel') === '1'
    || !!saved?.coach?.id;

  const [step, setStep]                       = useState(saved?.step ?? (preCounty ? 1 : 0));
  const [county, setCounty]                   = useState(saved?.county || preCounty || '');
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
    return {
      label: queryPlace?.label || urlParams.get('location_label') || '',
      lat: queryPlace?.lat ?? (urlParams.get('location_lat') ? Number(urlParams.get('location_lat')) : null),
      lng: queryPlace?.lng ?? (urlParams.get('location_lng') ? Number(urlParams.get('location_lng')) : null),
      radius: Number.isFinite(radius) && radius > 0 ? radius : 15,
    };
  });
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [skipToSchedule, setSkipToSchedule] = useState(false);
  const [creditRecord, setCreditRecord]       = useState(null);
  const [stripeCheckoutMessage, setStripeCheckoutMessage] = useState('');

  // Schedule later state
  const [scheduling, setScheduling]           = useState(false); // true = user chose "Schedule Now"
  const [blocks, setBlocks]                   = useState([]);
  const [existingSessions, setExistingSessions] = useState([]);
  const [selectedDate, setSelectedDate]       = useState(saved?.selectedDate ? parseISO(saved.selectedDate) : null);
  const [selectedTime, setSelectedTime]       = useState(saved?.selectedTime || '');
  const [submitting, setSubmitting]           = useState(false);
  const [sessionBooked, setSessionBooked]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [coachRes, packageRows, demosEnabled] = await Promise.all([
          rpc.invoke('getPublicCoaches', {}).catch((err) => {
            console.warn('Public coaches unavailable; booking will fall back to demo profiles if enabled.', err);
            return null;
          }),
          pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
          loadDemoCoachProfilesEnabled(),
        ]);
        if (cancelled) return;
        const liveCoaches = (coachRes?.data?.coaches || coachRes?.coaches || []).map(normalizePublicCoach);
        setCoaches(demosEnabled ? [...liveCoaches, ...DEMO_COACH_PROFILES] : liveCoaches);
        setPackages(packageRows);
      } catch (err) {
        console.error('Book public data load failed', err);
      } finally {
        if (!cancelled) setPublicDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // One-shot: pre-select coach from /coaches/:id "Book with this coach" link.
  useEffect(() => {
    if (!preCoachId || coaches.length === 0) return;
    const picked = coaches.find(c => c.id === preCoachId);
    if (!picked) return;
    setCoach(picked);
    if (!county) setCounty(picked.county);
    setStep(prev => Math.max(prev, 2));
    // Intentionally not depending on `coach`/`county` so this only fires once per coach list load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preCoachId, coaches]);

  useEffect(() => {
    if (preCoachId) return; // pre-selected — don't override
    if (county && coaches.length > 0) {
      const headCoach = coaches.find(c => c.county === county && c.is_head_coach);
      if (headCoach) { setCoach(headCoach); if (preCounty) setStep(2); }
      else setCoach(null);
    }
  }, [county, coaches, preCounty, preCoachId]);

  useEffect(() => {
    if (coach) {
      if (coach.is_demo) {
        setBlocks([]);
        setExistingSessions([]);
        return;
      }
      rpc.invoke('getCoachAvailability', { coach_id: coach.id }).then(res => {
        setBlocks(res.data.blocks || []);
        setExistingSessions(res.data.sessions || []);
      }).catch((err) => {
        console.warn('Coach availability unavailable', err);
        setBlocks([]);
        setExistingSessions([]);
      });
    }
  }, [coach]);

  useEffect(() => {
    if (user) {
      sessionCreditRepo.filter({ client_email: user.email }).then(credits => {
        // If coming from Dashboard with a specific credit_id, use that one
        let active;
        if (preCreditId) {
          active = credits.find(c => c.id === preCreditId && (c.total_credits - c.used_credits) > 0);
        }
        if (!active) {
          active = credits.find(c => (c.total_credits - c.used_credits) > 0);
        }
        setExistingCredit(active || null);
        setUseExistingCredit(!!active);

        // Auto-skip to scheduling when arriving from Dashboard with a valid credit
        if (preCreditId && active) {
          setCreditRecord(active);
          setPaymentConfirmed(true);
          setSkipToSchedule(true);
          if (active.session_duration_minutes) {
            const creditDur = DURATIONS.find(d => d.minutes === active.session_duration_minutes);
            if (creditDur) setDuration(creditDur);
          }
          setScheduling(true);
          // Jump to county selection (step 0) so they pick coach → schedule
          setStep(0);
        }
      });
    }
  }, [user]);

  // Detect Stripe Checkout success redirect
  useEffect(() => {
    if (stripeSuccess === '1' && user) {
      let cancelled = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_success');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname);
      setStep(5);
      setStripeCheckoutMessage('Payment received. Waiting for Stripe to finish issuing your training credits.');

      (async () => {
        let active = null;
        for (let i = 0; i < 8; i += 1) {
          const credits = await sessionCreditRepo.filter({ client_email: user.email });
          active = credits.find(c => (c.total_credits - c.used_credits) > 0 && c.payment_processor === 'stripe');
          if (active || cancelled) break;
          await new Promise(r => setTimeout(r, 1500));
        }
        if (cancelled) return;
        if (active) {
          setExistingCredit(active);
          setUseExistingCredit(true);
          setCreditRecord(active);
          if (active.session_duration_minutes) {
            const creditDur = DURATIONS.find(d => d.minutes === active.session_duration_minutes);
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
  }, [stripeSuccess, user]);

  const isDateBlocked = (date) => {
    const d = startOfDay(date);
    return blocks.some(b => {
      if (!b.block_all_day) return false;
      const start = startOfDay(parseISO(b.start_date));
      const end   = startOfDay(parseISO(b.end_date));
      return isWithinInterval(d, { start, end });
    });
  };

  const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const isTimeSlotTaken = (time) => {
    if (!selectedDate) return false;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart + 30;
    return existingSessions.some(s => {
      if (s.date !== dateStr) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd   = sStart + (s.duration_minutes || 60);
      return slotStart < sEnd && slotEnd > sStart;
    });
  };

  const isTimeSlotOutsideAvailability = (time) => {
    if (!selectedDate || !coach?.availability) return false;
    const dayAvail = coach.availability[format(selectedDate, 'EEEE')];
    if (!dayAvail || !dayAvail.enabled) return true;
    const slotMins  = timeToMinutes(time);
    return slotMins < timeToMinutes(dayAvail.start) || slotMins >= timeToMinutes(dayAvail.end);
  };

  const sessionPrice = calcPrice(selectedPackage, duration);
  const legalReadyForBooking = !user || legalStatus.complete;
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

  const saveBookingIntent = (extra = {}) => {
    sessionStorage.setItem('lc_booking', JSON.stringify({
      step,
      county,
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

  const persistAvailabilityPreference = async () => {
    if (!user || availabilityMode !== 'flexible') return null;
    if (!flexibleAvailabilityValid) {
      throw new Error('Select preferred days, time of day, and a valid start window before checkout.');
    }
    return athleteAvailabilityPreferenceRepo.create({
      athlete_id: user.id,
      flexible: true,
      date_window: JSON.stringify({ preset: availabilityPreference.dateWindow }),
      preferred_days: availabilityPreference.preferredDays,
      time_of_day: availabilityPreference.timeOfDay,
      earliest_start: availabilityPreference.earliestStart,
      latest_start: availabilityPreference.latestStart,
      location_radius: Number(bookingLocation.radius || 15),
    });
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

  const handleUseExistingCredits = async () => {
    if (!user) {
      saveBookingIntent();
      auth.signIn(window.location.href);
      return;
    }
    if (!legalStatus.complete) {
      setStep(5);
      alert('Please complete the required legal packet before payment or scheduling.');
      return;
    }
    setSubmitting(true);
    try {
      await persistAvailabilityPreference();
    } catch (err) {
      setSubmitting(false);
      alert(err?.message || 'Please finish your availability preferences before continuing.');
      return;
    }
    sessionStorage.removeItem('lc_booking');
    if (useExistingCredit && existingCredit) {
      setCreditRecord(existingCredit);
      setPaymentConfirmed(true);
    } else {
      alert('No active credit package is available yet.');
    }
    setSubmitting(false);
  };

  // Book a specific session after credits are awarded
  const handleBookSession = async () => {
    if (!selectedDate || !selectedTime || !coach) return;
    if (!legalStatus.complete) {
      setStep(5);
      alert('Please complete the required legal packet before confirming a session.');
      return;
    }
    setSubmitting(true);
    const sessionGoals = goals.trim();
    const pmMethod = useExistingCredit ? 'credits' : 'electronic';
    const durationMinutes = duration?.minutes ?? 60;
    const clientAge = user.dob ? Math.floor((Date.now() - new Date(user.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    // Deduct 1 credit from the active credit record.
    const activeCredit = creditRecord || existingCredit;
    if (!activeCredit) {
      setSubmitting(false);
      alert('No active credit package is available yet. Please wait for Stripe to finish processing your payment.');
      return;
    }
    if (activeCredit) {
      const remaining = activeCredit.total_credits - activeCredit.used_credits;
      if (remaining < 1) {
        setSubmitting(false);
        alert('No sessions remaining on this credit package.');
        return;
      }
      const updatedUsed = activeCredit.used_credits + 1;
      await sessionCreditRepo.update(activeCredit.id, {
        used_credits: updatedUsed,
      });
      const updatedCredit = { ...activeCredit, used_credits: updatedUsed };
      setCreditRecord(updatedCredit);
      setExistingCredit((activeCredit.total_credits - updatedUsed) > 0 ? updatedCredit : null);
    }

    const clientFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
    await sessionRepo.create({
      coach_id: coach.id,
      client_email: user.email,
      client_name: clientFullName,
      client_age: clientAge,
      date: format(selectedDate, 'yyyy-MM-dd'),
      start_time: selectedTime,
      duration_minutes: durationMinutes,
      status: 'confirmed',
      payment_status: 'paid',
      payment_method: pmMethod,
      county,
      session_goals: sessionGoals,
      total_price: sessionPrice ?? 0,
      credit_id: activeCredit?.id || null,
    });

    await rpc.invoke('sendBookingEmails', {
      clientEmail: user.email,
      clientName: clientFullName,
      coachEmail: coach.email,
      coachName: `${coach.first_name} ${coach.last_name}`,
      dateStr: format(selectedDate, 'EEEE, MMMM d, yyyy'),
      time: selectedTime,
      durationLabel: duration?.label ?? `${durationMinutes} min`,
      county,
      sessionGoals,
      origin: window.location.origin,
    });

    // Reload coach availability so time slots update for next booking
    if (coach) {
      const res = await rpc.invoke('getCoachAvailability', { coach_id: coach.id });
      setBlocks(res.data.blocks || []);
      setExistingSessions(res.data.sessions || []);
    }

    setSubmitting(false);
    setSessionBooked(true);
    setSelectedDate(null);
    setSelectedTime('');
  };

  // ── Payment confirmed screen ──────────────────────────────────────────────
  if (paymentConfirmed || skipToSchedule) {
    if (sessionBooked) {
      const remainingOnCredit = creditRecord ? creditRecord.total_credits - creditRecord.used_credits : 0;
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
              <CheckCircle2 className="w-8 h-8 text-accent" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight mb-4">SESSION BOOKED!</h1>
            <p className="text-muted-foreground mb-2">
              Your session has been confirmed{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.
            </p>
            <p className="text-sm text-muted-foreground mb-6">A confirmation email has been sent.</p>

            {remainingOnCredit > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
                <p className="font-display text-sm font-bold tracking-wider text-accent uppercase mb-1">
                  {remainingOnCredit} session{remainingOnCredit !== 1 ? 's' : ''} remaining
                </p>
                <p className="text-xs text-muted-foreground">
                  {creditRecord.package_name}{creditRecord.session_duration_minutes ? ` · ${creditRecord.session_duration_minutes / 60} hr${creditRecord.session_duration_minutes > 60 ? 's' : ''} each` : ''}
                </p>
              </div>
            )}

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
      // If coach not yet selected (e.g. Stripe redirect / credit flow), show county + coach picker first
      if (!coach) {
        return (
          <div className="min-h-[80vh] py-12">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <h2 className="font-display text-3xl font-bold tracking-tight mb-8">SELECT YOUR COUNTY & COACH</h2>
              <p className="text-muted-foreground text-sm mb-6">Choose your county to see available coaches.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {['Oakland', 'Macomb', 'Wayne'].map((c) => (
                  <button key={c} onClick={() => setCounty(c)}
                    className={`p-6 rounded-lg border text-center transition-all ${county === c ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    <MapPin className={`w-5 h-5 mx-auto mb-2 ${county === c ? 'text-accent' : 'text-muted-foreground'}`} />
                    <span className="font-display text-base font-bold tracking-wider">{c.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {county && (() => {
                const countyCoaches = coaches.filter(c => c.county === county);
                if (countyCoaches.length === 0) return <p className="text-muted-foreground text-sm">No coaches available in {county} County.</p>;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {countyCoaches.map((c) => (
                      <button key={c.id} onClick={() => setCoach(c)}
                        className="p-6 rounded-lg border text-left transition-all flex items-center gap-4 border-border bg-card hover:border-accent/30">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                          {c.photo_url ? <img src={c.photo_url} alt={c.first_name} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="font-display text-lg font-bold tracking-wider">{c.first_name} {c.last_name}</p>
                          {c.is_head_coach && <p className="text-xs text-accent font-display tracking-wider uppercase">Head Coach</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[80vh] py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SCHEDULE YOUR SESSION</h2>
            <p className="text-muted-foreground text-sm mb-8">Pick a date and time{coach ? ` with ${coach.first_name} ${coach.last_name}` : ''}.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
                <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate}
                  disabled={(date) => isBefore(date, startOfDay(new Date())) || isDateBlocked(date)}
                  className="rounded-lg border border-border bg-card p-4" />
              </div>
              {selectedDate && (
                <div>
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Time</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_SLOTS.map((time) => {
                      const taken    = isTimeSlotTaken(time);
                      const outside  = isTimeSlotOutsideAvailability(time);
                      const disabled = taken || outside;
                      return (
                        <button key={time} onClick={() => !disabled && setSelectedTime(time)} disabled={disabled}
                          className={`p-2 rounded-md border text-xs font-display tracking-wide transition-all ${disabled ? 'border-border bg-secondary/50 text-muted-foreground/40 line-through cursor-not-allowed' : selectedTime === time ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}>
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

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

    // Payment confirmed — choose to schedule now or later
    const confirmedCredit = creditRecord || existingCredit;
    const confirmedRemaining = confirmedCredit ? confirmedCredit.total_credits - confirmedCredit.used_credits : (selectedPackage?.sessions || 1);
    const confirmedDuration = confirmedCredit?.session_duration_minutes || duration?.minutes || 60;
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
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
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
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
    const demoOrCoachPrice = Number(coach.intro_price || coach.session_rate || coach.price || 0);
    const introPrice = introPackage ? calcPrice(introPackage, introDuration) : (demoOrCoachPrice || null);

    return (
      <LoggedOutBookIntro
        coach={coach}
        packages={packages}
        introPackage={introPackage}
        introDuration={introDuration}
        introPrice={introPrice}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        goals={goals}
        setGoals={setGoals}
        isDateBlocked={isDateBlocked}
        isTimeSlotTaken={isTimeSlotTaken}
        isTimeSlotOutsideAvailability={isTimeSlotOutsideAvailability}
        saveBookingIntent={saveBookingIntent}
      />
    );
  }

  const canProceed = () => {
    switch (step) {
      case 0: return !!county;
      case 1: return !!coach;
      case 2: return !!selectedPackage;
      case 3: return !!duration;
      case 4: return (!user || user.profile_setup_complete) && flexibleAvailabilityValid;
      case 5: return true;
      default: return false;
    }
  };

  const summaryProps = {
    county,
    coach,
    pkg: selectedPackage,
    duration,
    sessionPrice,
    packageTotal: sessionPrice != null ? sessionPrice * (selectedPackage?.sessions || 1) : null,
    usingCredit: useExistingCredit,
    creditRemaining: existingCredit ? existingCredit.total_credits - existingCredit.used_credits : null,
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
        {/* Progress */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-display tracking-widest uppercase text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
            <span className="text-xs font-display tracking-widest uppercase text-accent">{STEPS[step]}</span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {/* Step 0: County */}
        {step === 0 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-8">SELECT YOUR COUNTY</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Oakland', 'Macomb', 'Wayne'].map((c) => (
                <button key={c} onClick={() => setCounty(c)}
                  className={`p-8 rounded-lg border text-center transition-all ${county === c ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                  <MapPin className={`w-6 h-6 mx-auto mb-3 ${county === c ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className="font-display text-lg font-bold tracking-wider">{c.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Coach */}
        {step === 1 && (() => {
          const countyCoaches = coaches.filter(c => c.county === county);
          if (countyCoaches.length === 0) return (
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight mb-8">YOUR COACH</h2>
              <p className="text-muted-foreground">No coaches available in {county} County at this time.</p>
            </div>
          );
          if (countyCoaches.length === 1 || coach) {
            const displayCoach = coach || countyCoaches[0];
            if (!coach) setCoach(displayCoach);
            return (
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight mb-8">YOUR COACH</h2>
                <div className="bg-card border border-accent/30 rounded-lg p-6 flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {displayCoach.photo_url ? <img src={displayCoach.photo_url} alt={displayCoach.first_name} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold tracking-wider">{displayCoach.first_name} {displayCoach.last_name}</h3>
                    <p className="text-sm text-accent font-display tracking-wider uppercase">{county} County — {displayCoach.is_head_coach ? 'Head Coach' : 'Coach'}</p>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight mb-8">SELECT YOUR COACH</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {countyCoaches.map((c) => (
                  <button key={c.id} onClick={() => setCoach(c)}
                    className={`p-6 rounded-lg border text-left transition-all flex items-center gap-4 ${coach?.id === c.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {c.photo_url ? <img src={c.photo_url} alt={c.first_name} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-display text-lg font-bold tracking-wider">{c.first_name} {c.last_name}</p>
                      {c.is_head_coach && <p className="text-xs text-accent font-display tracking-wider uppercase">Head Coach</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Step 2: Package */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SELECT A PACKAGE</h2>
            <p className="text-muted-foreground text-sm mb-8">Multi-session packages give you credits to schedule sessions whenever you're ready.</p>

            {existingCredit && (
              <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-primary font-display tracking-wider text-sm uppercase mb-1">You have existing sessions!</p>
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>{existingCredit.total_credits - existingCredit.used_credits}</strong> session(s) remaining on <strong>{existingCredit.package_name}</strong>
                  {existingCredit.session_duration_minutes ? ` · ${existingCredit.session_duration_minutes / 60} hr each` : ''}.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setUseExistingCredit(true);
                      setSkipToSchedule(true);
                      setPaymentConfirmed(true);
                      setCreditRecord(existingCredit);
                      // Auto-set duration from the credit record
                      if (existingCredit.session_duration_minutes) {
                        const creditDur = DURATIONS.find(d => d.minutes === existingCredit.session_duration_minutes);
                        if (creditDur) setDuration(creditDur);
                      }
                      setScheduling(true);
                    }}
                    className="px-4 py-2 rounded-md border text-xs font-display tracking-wide uppercase transition-all border-accent bg-accent/10 text-accent hover:bg-accent/20">
                    ✓ Use Existing Sessions → Schedule Now
                  </button>
                  <button onClick={() => setUseExistingCredit(false)}
                    className={`px-4 py-2 rounded-md border text-xs font-display tracking-wide uppercase transition-all ${!useExistingCredit ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
                    Buy New Package
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packages.map((pkg) => {
                const perSession = Math.round(pkg.price / (pkg.sessions || 1));
                const isSelected = selectedPackage?.id === pkg.id;
                return (
                  <button key={pkg.id} onClick={() => { setSelectedPackage(pkg); setUseExistingCredit(false); }}
                    className={`p-6 rounded-lg border text-left transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    {pkg.badge && (
                      <span className="absolute top-3 right-3 text-xs font-display tracking-wide bg-accent text-accent-foreground px-2 py-0.5 rounded">{pkg.badge}</span>
                    )}
                    <Package className={`w-5 h-5 mb-3 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
                    <p className="font-display text-xl font-bold tracking-wider">{pkg.name.toUpperCase()}</p>
                    <p className="text-2xl font-display font-bold text-accent mt-1">${pkg.price}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pkg.sessions > 1 ? `${pkg.sessions} sessions · $${perSession}/session` : `1 session · $${perSession}/hr base`}
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

        {/* Step 3: Duration */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight mb-2">SESSION DURATION</h2>
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
                    <Timer className={`w-5 h-5 mx-auto mb-2 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
                    <span className="font-display text-lg font-bold tracking-wider block">{d.label}</span>
                    {price !== null && (
                      <span className={`text-sm font-display font-bold mt-1 block ${isSelected ? 'text-accent' : 'text-muted-foreground'}`}>${price}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Availability */}
        {step === 4 && (
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
                  {bookingLocation.label ? ` from ${bookingLocation.label}` : ' from your selected training area'}
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
              setStep(5);
            }}
          />
        )}

        {/* Step 5: Checkout */}
        {step === 5 && (
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
                  ['Coach', `${coach?.first_name} ${coach?.last_name}`],
                  ['County', county],
                  ['Location', bookingLocation.label ? `${bookingLocation.label} (${bookingLocation.radius || 15} mi)` : 'Coach training area'],
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
            </div>

            {user && (
              <div className="mb-6">
                <LegalSignaturePanel
                  signerRole={signerRole}
                  coachId={signerRole === 'coach' ? user?.coach_id || '' : ''}
                  organizationId={signerRole === 'organization_admin' ? user?.primary_organization_id || '' : ''}
                  title="Legal Packet Required"
                  description="Complete the current required documents before paying for or scheduling training."
                  compact={legalStatus.complete}
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
                    {!legalReadyForBooking && (
                      <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
                        Stripe Checkout unlocks after the required legal packet is complete.
                      </p>
                    )}
                    {stripeCheckoutMessage && (
                      <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                        {stripeCheckoutMessage}
                      </p>
                    )}
                    <div className="border-t border-border pt-4">
                      <StripeCheckout
                        packageId={selectedPackage?.id}
                        coachId={coach?.id}
                        sessionDurationMinutes={duration?.minutes}
                        extraPayload={checkoutExtraPayload}
                        onBeforeCheckout={persistAvailabilityPreference}
                        disabled={!legalReadyForBooking || !selectedPackage?.id || !coach?.id}
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
                <Button onClick={handleUseExistingCredits} disabled={submitting || !legalReadyForBooking}
                  className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90 h-12 text-base">
                  {submitting ? 'Preparing Credits...' : 'Use My Credits & Continue'}
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
        {step < 5 && (
          <div className="flex justify-between mt-6 lg:mt-10">
            <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              className="font-display tracking-wider uppercase">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}
        {step === 5 && (
          <div className="flex mt-6">
            <Button variant="outline" onClick={() => setStep(4)} className="font-display tracking-wider uppercase">
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

function LoggedOutBookIntro({
  coach,
  packages,
  introPackage,
  introDuration,
  introPrice,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  goals,
  setGoals,
  isDateBlocked,
  isTimeSlotTaken,
  isTimeSlotOutsideAvailability,
  saveBookingIntent,
}) {
  const model = publicCoachDisplay(coach, { packages });
  const enabledDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .filter((day) => coach.availability?.[day]?.enabled);

  const saveIntroIntent = (nextStep = introPackage ? 4 : 2) => {
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
                  disabled={(date) => isBefore(date, startOfDay(new Date())) || isDateBlocked(date)}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                />

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Available times</p>
                  {selectedDate ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {TIME_SLOTS.map((time) => {
                        const taken = isTimeSlotTaken(time);
                        const outside = isTimeSlotOutsideAvailability(time);
                        const disabled = taken || outside;
                        return (
                          <button
                            key={time}
                            type="button"
                            onClick={() => !disabled && setSelectedTime(time)}
                            disabled={disabled}
                            className={`h-10 rounded-lg border text-xs font-bold transition ${
                              disabled
                                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 line-through'
                                : selectedTime === time
                                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            {formatAvailabilityTime(time)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                      Select a date to preview open times from {model.firstName}'s saved availability.
                    </div>
                  )}

                  {enabledDays.length > 0 && (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Usual days: {enabledDays.map((day) => day.slice(0, 3)).join(', ')}
                    </p>
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
            <SummaryRow label="Time" value={selectedTime ? formatAvailabilityTime(selectedTime) : 'Choose a time'} />
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
