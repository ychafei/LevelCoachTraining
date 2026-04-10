import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, ArrowRight, MapPin, User, Clock, Timer, CheckCircle2, Package, ExternalLink } from 'lucide-react';
import { format, isBefore, startOfDay, parseISO, isWithinInterval } from 'date-fns';
import useCurrentUser from '@/hooks/useCurrentUser';
import PayPalCheckout from '@/components/PayPalCheckout';

const DURATIONS = [
  { label: '1 Hour',    minutes: 60,  hours: 1,   discount: 0 },
  { label: '1.5 Hours', minutes: 90,  hours: 1.5, discount: 0.10 },
  { label: '2 Hours',   minutes: 120, hours: 2,   discount: 0.15 },
  { label: '2.5 Hours', minutes: 150, hours: 2.5, discount: 0.18 },
  { label: '3 Hours',   minutes: 180, hours: 3,   discount: 0.20 },
];

const GOAL_TAGS = ['Ball Control', 'Shooting', 'Passing', 'Speed & Agility', 'Positioning', 'Game IQ', 'Fitness', 'Defending'];

const TIME_SLOTS = [];
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

// Steps: 0=County, 1=Coach, 2=Package, 3=Duration, 4=Goals, 5=Checkout
const STEPS = ['County', 'Coach', 'Package', 'Duration', 'Goals', 'Checkout'];

function calcPrice(pkg, dur) {
  if (!pkg || !dur) return null;
  const perSessionBase = pkg.price / (pkg.sessions || 1);
  return Math.round(perSessionBase * dur.hours * (1 - dur.discount));
}

export default function Book() {
  const urlParams = new URLSearchParams(window.location.search);
  const preCounty = urlParams.get('county');
  const { user } = useCurrentUser();

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('lc_booking') || 'null'); } catch { return null; } })();

  const [step, setStep]                       = useState(saved?.step ?? (preCounty ? 1 : 0));
  const [county, setCounty]                   = useState(saved?.county || preCounty || '');
  const [coach, setCoach]                     = useState(saved?.coach || null);
  const [coaches, setCoaches]                 = useState([]);
  const [packages, setPackages]               = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(saved?.selectedPackage || null);
  const [existingCredit, setExistingCredit]   = useState(null);
  const [useExistingCredit, setUseExistingCredit] = useState(false);
  const [duration, setDuration]               = useState(saved?.duration || null);
  const [goals, setGoals]                     = useState(saved?.goals || '');
  const [selectedTags, setSelectedTags]       = useState(saved?.selectedTags || []);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [skipToSchedule, setSkipToSchedule] = useState(false);
  const [creditRecord, setCreditRecord]       = useState(null);

  // Schedule later state
  const [paymentMethod, setPaymentMethod]      = useState(null); // 'paypal' | 'cash'
  const [scheduling, setScheduling]           = useState(false); // true = user chose "Schedule Now"
  const [blocks, setBlocks]                   = useState([]);
  const [existingSessions, setExistingSessions] = useState([]);
  const [selectedDate, setSelectedDate]       = useState(null);
  const [selectedTime, setSelectedTime]       = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [sessionBooked, setSessionBooked]     = useState(false);

  useEffect(() => {
    base44.functions.invoke('getPublicCoaches', {}).then(res => setCoaches(res.data.coaches || []));
    base44.entities.PricingPackage.filter({ is_visible: true }, 'display_order').then(setPackages);
  }, []);

  useEffect(() => {
    if (county && coaches.length > 0) {
      const headCoach = coaches.find(c => c.county === county && c.is_head_coach);
      if (headCoach) { setCoach(headCoach); if (preCounty) setStep(2); }
      else setCoach(null);
    }
  }, [county, coaches, preCounty]);

  useEffect(() => {
    if (coach) {
      base44.functions.invoke('getCoachAvailability', { coach_id: coach.id }).then(res => {
        setBlocks(res.data.blocks || []);
        setExistingSessions(res.data.sessions || []);
      });
    }
  }, [coach]);

  useEffect(() => {
    if (user) {
      base44.entities.SessionCredit.filter({ client_email: user.email }).then(credits => {
        // Find any active credit with > 0.5 hours remaining
        const active = credits.find(c => (c.total_credits - c.used_credits) > 0.5);
        setExistingCredit(active || null);
        setUseExistingCredit(!!active);
      });
    }
  }, [user]);

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

  const paypalHandle = coach?.paypal?.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//, '');
  const paypalUrl = paypalHandle
    ? `https://paypal.me/${paypalHandle}${sessionPrice ? '/' + sessionPrice : ''}`
    : null;

  // Called after user confirms payment
  const handlePaymentConfirmed = async (method) => {
    if (!user) {
      sessionStorage.setItem('lc_booking', JSON.stringify({ step, county, coach, selectedPackage, duration, goals, selectedTags }));
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    sessionStorage.removeItem('lc_booking');
    setSubmitting(true);

    let credit;
    if (useExistingCredit && existingCredit) {
      const hoursUsed = duration.hours;
      credit = await base44.entities.SessionCredit.update(existingCredit.id, {
        used_credits: existingCredit.used_credits + hoursUsed
      });
      setCreditRecord({ ...existingCredit, used_credits: existingCredit.used_credits + hoursUsed });
    } else {
      credit = await base44.entities.SessionCredit.create({
        client_email: user.email,
        client_name: user.full_name || user.email,
        package_id: selectedPackage.id,
        package_name: selectedPackage.name,
        total_credits: (selectedPackage.sessions || 1) * 1,
        used_credits: 0,
        per_session_base_price: Math.round(selectedPackage.price / (selectedPackage.sessions || 1)),
      });
      setCreditRecord(credit);
    }

    setPaymentMethod(method);
    setSubmitting(false);
    setPaymentConfirmed(true);
  };

  // Book a specific session after credits are awarded
  const handleBookSession = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    const sessionGoals = [...selectedTags, goals].filter(Boolean).join(', ');
    const pmMethod = useExistingCredit ? 'credits' : paymentMethod === 'cash' ? 'cash' : 'electronic';
    const durationMinutes = duration?.minutes ?? 60;
    await base44.entities.Session.create({
      coach_id: coach.id,
      client_email: user.email,
      client_name: user.full_name || user.email,
      date: format(selectedDate, 'yyyy-MM-dd'),
      start_time: selectedTime,
      duration_minutes: durationMinutes,
      status: 'pending',
      payment_status: pmMethod === 'cash' ? 'unpaid' : 'paid',
      payment_method: pmMethod,
      county,
      session_goals: sessionGoals,
      total_price: sessionPrice ?? 0,
    });

    await base44.functions.invoke('sendBookingEmails', {
      clientEmail: user.email,
      clientName: user.full_name || user.email,
      coachEmail: coach.email,
      coachName: `${coach.first_name} ${coach.last_name}`,
      dateStr: format(selectedDate, 'EEEE, MMMM d, yyyy'),
      time: selectedTime,
      durationLabel: duration.label,
      county,
      sessionGoals,
      origin: window.location.origin,
    });

    setSubmitting(false);
    setSessionBooked(true);
  };

  // ── Payment confirmed screen ──────────────────────────────────────────────
  if (paymentConfirmed || skipToSchedule) {
    const remainingCredits = parseFloat(((creditRecord?.total_credits || selectedPackage?.sessions || 1) - (creditRecord?.used_credits ?? duration?.hours ?? 1)).toFixed(2));

    if (sessionBooked) {
      return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-accent" />
            </div>
            <h1 className="font-oswald text-3xl font-bold tracking-tight mb-4">SESSION BOOKED!</h1>
            <p className="text-muted-foreground mb-2">
              {format(selectedDate, 'EEEE, MMMM d')} at {selectedTime} with {coach.first_name} {coach.last_name}
            </p>
            <p className="text-sm text-muted-foreground mb-8">A confirmation email has been sent.</p>
            <Button onClick={() => window.location.href = '/dashboard'} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase">
              Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }

    if (scheduling) {
      return (
        <div className="min-h-[80vh] py-12">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-2">SCHEDULE YOUR SESSION</h2>
            <p className="text-muted-foreground text-sm mb-8">Pick a date and time with {coach.first_name} {coach.last_name}.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
                <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate}
                  disabled={(date) => isBefore(date, startOfDay(new Date())) || isDateBlocked(date)}
                  className="rounded-lg border border-border bg-card p-4" />
              </div>
              {selectedDate && (
                <div>
                  <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pick a Time</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_SLOTS.map((time) => {
                      const taken    = isTimeSlotTaken(time);
                      const outside  = isTimeSlotOutsideAvailability(time);
                      const disabled = taken || outside;
                      return (
                        <button key={time} onClick={() => !disabled && setSelectedTime(time)} disabled={disabled}
                          className={`p-2 rounded-md border text-xs font-oswald tracking-wide transition-all ${disabled ? 'border-border bg-secondary/50 text-muted-foreground/40 line-through cursor-not-allowed' : selectedTime === time ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card hover:border-accent/30'}`}>
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <Button variant="outline" onClick={() => setScheduling(false)} className="font-oswald tracking-wider uppercase">
                Back
              </Button>
              <Button onClick={handleBookSession} disabled={!selectedDate || !selectedTime || submitting}
                className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
                {submitting ? 'Booking...' : 'Confirm Session'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Payment confirmed — choose to schedule now or later
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="font-oswald text-3xl font-bold tracking-tight mb-4">PAYMENT CONFIRMED!</h1>
          <p className="text-muted-foreground mb-2">
            Your <strong>{selectedPackage?.name}</strong> package is active.
          </p>
          <div className="bg-card border border-border rounded-lg p-4 mb-8">
            <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-2">Your Credit Hours</p>
            <p className="font-oswald text-4xl font-bold text-accent">{remainingCredits}</p>
            <p className="text-sm text-muted-foreground">credit hour{remainingCredits !== 1 ? 's' : ''} remaining</p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setScheduling(true)}
              className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
              Schedule Now
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard'}
              className="font-oswald tracking-wider uppercase">
              Schedule Later from Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canProceed = () => {
    switch (step) {
      case 0: return !!county;
      case 1: return !!coach;
      case 2: return !!selectedPackage;
      case 3: return !!duration;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-[80vh] py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Progress */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-oswald tracking-widest uppercase text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
            <span className="text-xs font-oswald tracking-widest uppercase text-accent">{STEPS[step]}</span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {/* Step 0: County */}
        {step === 0 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">SELECT YOUR COUNTY</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Oakland', 'Macomb', 'Wayne'].map((c) => (
                <button key={c} onClick={() => setCounty(c)}
                  className={`p-8 rounded-lg border text-center transition-all ${county === c ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                  <MapPin className={`w-6 h-6 mx-auto mb-3 ${county === c ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className="font-oswald text-lg font-bold tracking-wider">{c.toUpperCase()}</span>
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
              <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">YOUR COACH</h2>
              <p className="text-muted-foreground">No coaches available in {county} County at this time.</p>
            </div>
          );
          if (countyCoaches.length === 1 || coach) {
            const displayCoach = coach || countyCoaches[0];
            if (!coach) setCoach(displayCoach);
            return (
              <div>
                <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">YOUR COACH</h2>
                <div className="bg-card border border-accent/30 rounded-lg p-6 flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {displayCoach.photo_url ? <img src={displayCoach.photo_url} alt={displayCoach.first_name} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div>
                    <h3 className="font-oswald text-xl font-bold tracking-wider">{displayCoach.first_name} {displayCoach.last_name}</h3>
                    <p className="text-sm text-accent font-oswald tracking-wider uppercase">{county} County — {displayCoach.is_head_coach ? 'Head Coach' : 'Coach'}</p>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div>
              <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">SELECT YOUR COACH</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {countyCoaches.map((c) => (
                  <button key={c.id} onClick={() => setCoach(c)}
                    className={`p-6 rounded-lg border text-left transition-all flex items-center gap-4 ${coach?.id === c.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {c.photo_url ? <img src={c.photo_url} alt={c.first_name} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-oswald text-lg font-bold tracking-wider">{c.first_name} {c.last_name}</p>
                      {c.is_head_coach && <p className="text-xs text-accent font-oswald tracking-wider uppercase">Head Coach</p>}
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
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-2">SELECT A PACKAGE</h2>
            <p className="text-muted-foreground text-sm mb-8">Multi-session packages give you credits to schedule sessions whenever you're ready.</p>

            {existingCredit && (
              <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-primary font-oswald tracking-wider text-sm uppercase mb-1">You have existing credits!</p>
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>{parseFloat((existingCredit.total_credits - existingCredit.used_credits).toFixed(2))}</strong> credit hour(s) remaining on <strong>{existingCredit.package_name}</strong>.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setUseExistingCredit(true);
                      setSkipToSchedule(true);
                      setPaymentConfirmed(true);
                      setCreditRecord(existingCredit);
                      setScheduling(true);
                    }}
                    className="px-4 py-2 rounded-md border text-xs font-oswald tracking-wide uppercase transition-all border-accent bg-accent/10 text-accent hover:bg-accent/20">
                    ✓ Use Existing Credits → Schedule Now
                  </button>
                  <button onClick={() => setUseExistingCredit(false)}
                    className={`px-4 py-2 rounded-md border text-xs font-oswald tracking-wide uppercase transition-all ${!useExistingCredit ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
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
                  <button key={pkg.id} onClick={() => setSelectedPackage(pkg)}
                    className={`p-6 rounded-lg border text-left transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    {pkg.badge && (
                      <span className="absolute top-3 right-3 text-xs font-oswald tracking-wide bg-accent text-accent-foreground px-2 py-0.5 rounded">{pkg.badge}</span>
                    )}
                    <Package className={`w-5 h-5 mb-3 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
                    <p className="font-oswald text-xl font-bold tracking-wider">{pkg.name.toUpperCase()}</p>
                    <p className="text-2xl font-oswald font-bold text-accent mt-1">${pkg.price}</p>
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
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-2">SESSION DURATION</h2>
            <p className="text-muted-foreground text-sm mb-8">Longer sessions get a discount off the hourly rate.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {DURATIONS.map((d) => {
                const price = calcPrice(selectedPackage, d);
                const isSelected = duration?.minutes === d.minutes;
                return (
                  <button key={d.minutes} onClick={() => setDuration(d)}
                    className={`p-6 rounded-lg border text-center transition-all relative ${isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'}`}>
                    {d.discount > 0 && (
                      <span className="absolute top-2 right-2 text-xs font-oswald bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                        -{Math.round(d.discount * 100)}%
                      </span>
                    )}
                    <Timer className={`w-5 h-5 mx-auto mb-2 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
                    <span className="font-oswald text-lg font-bold tracking-wider block">{d.label}</span>
                    {price !== null && (
                      <span className={`text-sm font-oswald font-bold mt-1 block ${isSelected ? 'text-accent' : 'text-muted-foreground'}`}>${price}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Goals */}
        {step === 4 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">SESSION GOALS</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {GOAL_TAGS.map((tag) => (
                <button key={tag}
                  onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`px-4 py-2 rounded-full border text-sm font-oswald tracking-wide uppercase transition-all ${selectedTags.includes(tag) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}>
                  {tag}
                </button>
              ))}
            </div>
            <Textarea placeholder="Any additional goals or notes for your sessions..."
              value={goals} onChange={(e) => setGoals(e.target.value)}
              className="bg-card border-border" rows={4} />
          </div>
        )}

        {/* Step 5: Checkout */}
        {step === 5 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight mb-8">CHECKOUT</h2>

            {/* Order Summary */}
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
              <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-4">Order Summary</p>
              <div className="space-y-1">
                {[
                  ['Package', selectedPackage?.name],
                  ['Sessions', selectedPackage?.sessions > 1 ? `${selectedPackage.sessions} sessions` : '1 session'],
                  ['Session Duration', duration?.label],
                  ['Coach', `${coach?.first_name} ${coach?.last_name}`],
                  ['County', county],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-muted-foreground text-sm">{label}</span>
                    <span className="font-oswald tracking-wider text-sm">{val}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 mt-2 border-t border-border">
                <span className="font-oswald text-lg font-bold tracking-wider">PER SESSION TOTAL</span>
                <span className="font-oswald text-2xl font-bold text-accent">${sessionPrice}</span>
              </div>
              {duration?.discount > 0 && (
                <p className="text-xs text-green-400 mt-2">{Math.round(duration.discount * 100)}% multi-hour discount applied</p>
              )}
              {selectedPackage?.sessions > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Package total: ${selectedPackage.price} for {selectedPackage.sessions} sessions
                </p>
              )}
            </div>

            {/* Payment Options */}
            {!useExistingCredit && (
              <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-4">Payment</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Pay <strong className="text-foreground">${sessionPrice}</strong> securely.
                </p>
                {!user ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-4">You must be signed in to complete your purchase.</p>
                    <Button
                      className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
                      onClick={() => {
                        sessionStorage.setItem('lc_booking', JSON.stringify({ step, county, coach, selectedPackage, duration, goals, selectedTags }));
                        base44.auth.redirectToLogin(window.location.href);
                      }}
                    >
                      Sign In to Pay
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pay Online</p>
                      <PayPalCheckout
                        amount={sessionPrice}
                        packageId={selectedPackage?.id}
                        packageName={selectedPackage?.name}
                        packageSessions={selectedPackage?.sessions || 1}
                        sessionDurationMinutes={duration?.minutes}
                        onSuccess={() => handlePaymentConfirmed('electronic')}
                      />
                    </div>
                    <div className="border-t border-border pt-4">
                      <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pay with Cash</p>
                      <p className="text-xs text-muted-foreground mb-3">Bring exact cash to your session. Your coach will collect payment at the time of training.</p>
                      <Button
                        onClick={() => handlePaymentConfirmed('cash')}
                        className="w-full bg-secondary border border-border text-foreground font-oswald tracking-wider uppercase hover:bg-secondary/80 h-12"
                      >
                        💵 Pay with Cash at Session
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirm button (existing credits only) */}
            <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 mb-6">
              <p className="text-xs text-accent font-oswald tracking-wide uppercase mb-1">After completing payment</p>
              <p className="text-xs text-muted-foreground">
                Click below once you've sent the payment. Your credits will be activated and you can schedule sessions whenever you're ready.
              </p>
            </div>

            {useExistingCredit && (
              <Button onClick={() => handlePaymentConfirmed('credits')} disabled={submitting}
                className="w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90 h-12 text-base">
                {submitting ? 'Activating Credits...' : 'Use My Credits & Continue'}
              </Button>
            )}
          </div>
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="flex justify-between mt-10">
            <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              className="font-oswald tracking-wider uppercase">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}
              className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}
        {step === 5 && (
          <div className="flex mt-6">
            <Button variant="outline" onClick={() => setStep(4)} className="font-oswald tracking-wider uppercase">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}