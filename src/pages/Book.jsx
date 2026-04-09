import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, MapPin, User, Calendar as CalendarIcon, Clock, Timer, Target, CheckCircle2 } from 'lucide-react';
import { format, isBefore, startOfDay, parseISO, addDays, isWithinInterval } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import useCurrentUser from '@/hooks/useCurrentUser';

const STEPS = ['County', 'Coach', 'Date', 'Time', 'Duration', 'Goals', 'Review'];
const DURATIONS = [
  { label: '1 Hour', minutes: 60 },
  { label: '1.5 Hours', minutes: 90 },
  { label: '2 Hours', minutes: 120 },
  { label: '2.5 Hours', minutes: 150 },
  { label: '3 Hours', minutes: 180 },
];
const GOAL_TAGS = ['Ball Control', 'Shooting', 'Passing', 'Speed & Agility', 'Positioning', 'Game IQ', 'Fitness', 'Defending'];
const TIME_SLOTS = [];
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

export default function Book() {
  const urlParams = new URLSearchParams(window.location.search);
  const preCounty = urlParams.get('county');

  const { user } = useCurrentUser();
  const [step, setStep] = useState(preCounty ? 1 : 0);
  const [county, setCounty] = useState(preCounty || '');
  const [coach, setCoach] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(null);
  const [goals, setGoals] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [existingSessions, setExistingSessions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);

  // Load coaches
  useEffect(() => {
    base44.entities.Coach.filter({ is_active: true }).then(setCoaches);
  }, []);

  // Auto-select head coach when county changes
  useEffect(() => {
    if (county && coaches.length > 0) {
      const headCoach = coaches.find(c => c.county === county && c.is_head_coach);
      if (headCoach) {
        setCoach(headCoach);
        if (preCounty) setStep(2);
      } else {
        // No head coach — let user pick from available coaches
        setCoach(null);
      }
    }
  }, [county, coaches, preCounty]);

  // Load blocks & sessions when coach selected
  useEffect(() => {
    if (coach) {
      base44.entities.CoachBlock.filter({ coach_id: coach.id, is_active: true }).then(setBlocks);
      base44.entities.Session.filter({ coach_id: coach.id }).then(res => {
        setExistingSessions(res.filter(s => s.status === 'pending' || s.status === 'confirmed'));
      });
    }
  }, [coach]);

  const isDateBlocked = (date) => {
    const d = startOfDay(date);
    return blocks.some(b => {
      if (!b.block_all_day) return false;
      const start = startOfDay(parseISO(b.start_date));
      const end = startOfDay(parseISO(b.end_date));
      return isWithinInterval(d, { start, end });
    });
  };

  const timeToMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const isTimeSlotTaken = (time) => {
    if (!selectedDate) return false;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart + 30; // each slot is 30 min wide
    return existingSessions.some(s => {
      if (s.date !== dateStr) return false;
      const sessionStart = timeToMinutes(s.start_time);
      const sessionEnd = sessionStart + (s.duration_minutes || 60);
      // block the slot if it overlaps with the session window at all
      return slotStart < sessionEnd && slotEnd > sessionStart;
    });
  };

  const isTimeSlotOutsideAvailability = (time) => {
    if (!selectedDate || !coach?.availability) return false;
    const dayName = format(selectedDate, 'EEEE'); // e.g. "Monday"
    const dayAvail = coach.availability[dayName];
    if (!dayAvail || !dayAvail.enabled) return true;
    const slotMins = timeToMinutes(time);
    const startMins = timeToMinutes(dayAvail.start);
    const endMins = timeToMinutes(dayAvail.end);
    return slotMins < startMins || slotMins >= endMins;
  };

  const handleSubmit = async () => {
    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    setSubmitting(true);
    const sessionGoals = [...selectedTags, goals].filter(Boolean).join(', ');
    const session = {
      coach_id: coach.id,
      client_email: user.email,
      client_name: user.full_name || user.email,
      date: format(selectedDate, 'yyyy-MM-dd'),
      start_time: selectedTime,
      duration_minutes: duration.minutes,
      status: 'pending',
      payment_status: 'unpaid',
      county,
      session_goals: sessionGoals,
    };

    await base44.entities.Session.create(session);

    // Send confirmation emails via Resend (bypasses unsubscribe suppression)
    const coachName = `${coach.first_name} ${coach.last_name}`;
    const dateStr = format(selectedDate, 'EEEE, MMMM d, yyyy');

    await base44.functions.invoke('sendBookingEmails', {
      clientEmail: user.email,
      clientName: user.full_name || user.email,
      coachEmail: coach.email,
      coachName,
      dateStr,
      time: selectedTime,
      durationLabel: duration.label,
      county,
      sessionGoals,
      origin: window.location.origin,
    });

    setSubmitting(false);
    setBookingComplete(true);
  };

  if (bookingComplete) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-accent" />
          </div>
          <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-4">BOOKING CONFIRMED</h1>
          <p className="text-muted-foreground mb-2">
            Your session with {coach.first_name} {coach.last_name} on {format(selectedDate, 'EEEE, MMMM d')} at {selectedTime} is booked.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            A confirmation email has been sent. Please complete payment directly with your coach.
          </p>
          <PaymentHandlesDisplay coach={coach} />
          <div className="flex gap-3 justify-center mt-8">
            <Button onClick={() => window.location.href = '/dashboard'} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase">
              Go to Dashboard
            </Button>
            <Button onClick={() => window.location.href = '/pay'} variant="outline" className="font-oswald tracking-wider uppercase">
              View Receipt
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canProceed = () => {
    switch(step) {
      case 0: return !!county;
      case 1: return !!coach;
      case 2: return !!selectedDate;
      case 3: return !!selectedTime;
      case 4: return !!duration;
      case 5: return true;
      case 6: return true;
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
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">SELECT YOUR COUNTY</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Oakland', 'Macomb', 'Wayne'].map((c) => (
                <button
                  key={c}
                  onClick={() => setCounty(c)}
                  className={`p-8 rounded-lg border text-center transition-all ${
                    county === c ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'
                  }`}
                >
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
          if (countyCoaches.length === 0) {
            return (
              <div>
                <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">YOUR COACH</h2>
                <p className="text-muted-foreground">No coaches available in {county} County at this time. Please check back soon.</p>
              </div>
            );
          }
          if (countyCoaches.length === 1 || coach) {
            const displayCoach = coach || countyCoaches[0];
            if (!coach) setCoach(displayCoach);
            return (
              <div>
                <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">YOUR COACH</h2>
                <div className="bg-card border border-accent/30 rounded-lg p-6 flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {displayCoach.photo_url ? (
                      <img src={displayCoach.photo_url} alt={displayCoach.first_name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-muted-foreground" />
                    )}
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
              <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">SELECT YOUR COACH</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {countyCoaches.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCoach(c)}
                    className={`p-6 rounded-lg border text-left transition-all flex items-center gap-4 ${
                      coach?.id === c.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {c.photo_url ? (
                        <img src={c.photo_url} alt={c.first_name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
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

        {/* Step 2: Date */}
        {step === 2 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">PICK A DATE</h2>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => isBefore(date, startOfDay(new Date())) || isDateBlocked(date)}
                className="rounded-lg border border-border bg-card p-4"
              />
            </div>
          </div>
        )}

        {/* Step 3: Time */}
        {step === 3 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">CHOOSE A TIME</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {TIME_SLOTS.map((time) => {
                const taken = isTimeSlotTaken(time);
                const outside = isTimeSlotOutsideAvailability(time);
                const disabled = taken || outside;
                return (
                  <button
                    key={time}
                    onClick={() => !disabled && setSelectedTime(time)}
                    disabled={disabled}
                    className={`p-3 rounded-md border text-sm font-oswald tracking-wide transition-all ${
                      disabled
                        ? 'border-border bg-secondary/50 text-muted-foreground/40 line-through cursor-not-allowed'
                        : selectedTime === time
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-card text-foreground hover:border-accent/30'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Duration */}
        {step === 4 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">SESSION DURATION</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  onClick={() => setDuration(d)}
                  className={`p-6 rounded-lg border text-center transition-all ${
                    duration?.minutes === d.minutes ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/30'
                  }`}
                >
                  <Timer className={`w-5 h-5 mx-auto mb-2 ${duration?.minutes === d.minutes ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className="font-oswald text-lg font-bold tracking-wider">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Goals */}
        {step === 5 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">SESSION GOALS</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {GOAL_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`px-4 py-2 rounded-full border text-sm font-oswald tracking-wide uppercase transition-all ${
                    selectedTags.includes(tag) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Any additional goals or notes for your session..."
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              className="bg-card border-border"
              rows={4}
            />
          </div>
        )}

        {/* Step 6: Review */}
        {step === 6 && (
          <div>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">REVIEW & CONFIRM</h2>
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">County</span>
                <span className="font-oswald tracking-wider">{county}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">Coach</span>
                <span className="font-oswald tracking-wider">{coach?.first_name} {coach?.last_name}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">Date</span>
                <span className="font-oswald tracking-wider">{selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">Time</span>
                <span className="font-oswald tracking-wider">{selectedTime}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">Duration</span>
                <span className="font-oswald tracking-wider">{duration?.label}</span>
              </div>
              {(selectedTags.length > 0 || goals) && (
                <div className="py-3 border-b border-border">
                  <span className="text-muted-foreground text-sm block mb-2">Goals</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTags.map(t => <Badge key={t} className="bg-accent/10 text-accent border-accent/20">{t}</Badge>)}
                  </div>
                  {goals && <p className="text-sm text-foreground mt-2">{goals}</p>}
                </div>
              )}
            </div>

            {/* Cancellation Policy */}
            <div className="mt-6 p-4 rounded-lg bg-accent/5 border border-accent/20">
              <p className="text-sm text-accent font-oswald tracking-wide uppercase mb-1">Cancellation Policy</p>
              <p className="text-xs text-muted-foreground">
                Sessions cancelled with less than 24 hours notice may incur a late-cancellation fee at the coach's discretion.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="font-oswald tracking-wider uppercase"
          >
            <ArrowLeft className="mr-2 w-4 h-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
            >
              Next <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          ) : (
            user ? (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
              >
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <Button
                  onClick={() => base44.auth.redirectToLogin(window.location.href)}
                  className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
                >
                  Sign In to Confirm
                </Button>
                <p className="text-xs text-muted-foreground">You need an account to complete your booking</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentHandlesDisplay({ coach }) {
  const handles = [];
  if (coach.venmo) handles.push({ name: 'Venmo', value: coach.venmo });
  if (coach.zelle) handles.push({ name: 'Zelle', value: coach.zelle });
  if (coach.cashapp) handles.push({ name: 'Cash App', value: coach.cashapp });
  if (coach.paypal) handles.push({ name: 'PayPal', value: coach.paypal });
  if (coach.cash_accepted) handles.push({ name: 'Cash', value: 'Accepted' });

  if (handles.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Payment Methods</p>
      <div className="space-y-2">
        {handles.map(h => (
          <div key={h.name} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{h.name}</span>
            <span className="text-foreground font-medium">{h.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}