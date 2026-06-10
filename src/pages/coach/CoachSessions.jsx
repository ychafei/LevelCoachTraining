import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfDay, parseISO, isBefore, isWithinInterval } from 'date-fns';
import { coachRepo, sessionRepo, sessionCreditRepo } from '@/api/repo';
import { rpc } from '@/lib/rpc';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon, CalendarClock, Clock, CheckCircle2, XCircle,
  MessageSquare, MapPin, Search, AlertTriangle, UserCheck, ExternalLink,
  Filter,
} from 'lucide-react';
import { formatTimeET, formatLongDateET } from '@/lib/formatInET';
import { isSessionPast, isWithinHoursFromNow } from '@/lib/scheduleET';

// Sessions page — coach-side operational view of every booking. Mirrors the
// Dashboard reschedule flow but adds completion / no-show / cancel actions in
// one place.

const STATUS_TABS = [
  { key: 'today',     label: 'Today' },
  { key: 'upcoming',  label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled / No-show' },
  { key: 'all',       label: 'All' },
];

const NO_SHOW_PREFIX = 'No-show';

function todayET() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function isNoShow(s) {
  return s.status === 'cancelled' && (s.cancellation_reason || '').startsWith(NO_SHOW_PREFIX);
}

function statusMeta(s) {
  if (isNoShow(s)) {
    return { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', label: 'No-show' };
  }
  switch (s.status) {
    case 'pending':   return { icon: Clock,        color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' };
    case 'confirmed': return { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' };
    case 'completed': return { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Completed' };
    case 'cancelled': return { icon: XCircle,      color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' };
    default:          return { icon: Clock,        color: 'bg-muted text-muted-foreground border-border', label: s.status || '—' };
  }
}

function paymentMeta(s) {
  if (s.payment_status === 'paid') {
    return { tone: 'green', label: 'Paid' };
  }
  if (s.payment_method === 'credits') {
    return { tone: 'accent', label: 'Credits' };
  }
  if (s.payment_method === 'electronic') {
    return { tone: 'muted', label: 'Stripe review' };
  }
  return { tone: 'muted', label: s.payment_status || 'unknown' };
}

const TIME_SLOTS = (() => {
  const out = [];
  for (let h = 8; h <= 20; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 20) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function CoachSessions() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [sessions, setSessions] = useState([]);
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters --------------------------------------------------------------
  const [tab, setTab] = useState('today');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');     // all | paid | review
  const [countyFilter, setCountyFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');                  // YYYY-MM-DD
  const [toDate, setToDate] = useState('');                      // YYYY-MM-DD

  // Reschedule dialog state ---------------------------------------------
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleBlocks, setRescheduleBlocks] = useState([]);
  const [rescheduleExisting, setRescheduleExisting] = useState([]);
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    if (!user?.coach_id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [coachRow, ssns] = await Promise.all([
          coachRepo.filter({ id: user.coach_id }).then(r => r[0] || null),
          sessionRepo.filter({ coach_id: user.coach_id }, '-date'),
        ]);
        if (cancelled) return;
        setCoach(coachRow);
        setSessions(ssns || []);
      } catch (err) {
        console.error('CoachSessions load failed', err);
        toast.error('Could not load sessions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Derived: filter + bucket the sessions ------------------------------
  const filtered = useMemo(() => {
    const tToday = todayET();
    const q = search.trim().toLowerCase();
    return sessions.filter(s => {
      // Bucket
      switch (tab) {
        case 'today':
          if (s.date !== tToday || s.status === 'cancelled' || s.status === 'completed') return false;
          break;
        case 'upcoming':
          if (s.status === 'completed' || s.status === 'cancelled') return false;
          if (s.date < tToday) return false;
          if (s.date === tToday) return false; // covered by today tab
          break;
        case 'completed':
          if (s.status !== 'completed') return false;
          break;
        case 'cancelled':
          if (s.status !== 'cancelled') return false;
          break;
        case 'all':
        default:
          break;
      }

      // Date range
      if (fromDate && s.date < fromDate) return false;
      if (toDate && s.date > toDate) return false;

      // County
      if (countyFilter !== 'all' && s.county !== countyFilter) return false;

      // Payment
      if (paymentFilter === 'paid' && s.payment_status !== 'paid') return false;
      if (paymentFilter === 'review' && s.payment_status === 'paid') return false;

      // Search by client name/email
      if (q) {
        const hay = `${s.client_name || ''} ${s.client_email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      // Today/upcoming: ascending (soonest first); past: descending (most recent first)
      const ascending = tab === 'today' || tab === 'upcoming';
      const ka = `${a.date} ${a.start_time || '00:00'}`;
      const kb = `${b.date} ${b.start_time || '00:00'}`;
      return ascending ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
  }, [sessions, tab, search, paymentFilter, countyFilter, fromDate, toDate]);

  const counts = useMemo(() => {
    const t = todayET();
    return {
      today:     sessions.filter(s => s.date === t && s.status !== 'cancelled' && s.status !== 'completed').length,
      upcoming:  sessions.filter(s => s.date > t && s.status !== 'cancelled' && s.status !== 'completed').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      cancelled: sessions.filter(s => s.status === 'cancelled').length,
      all:       sessions.length,
    };
  }, [sessions]);

  // Mutations -----------------------------------------------------------
  const patchSession = (id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const markCompleted = async (s) => {
    try {
      await sessionRepo.update(s.id, { status: 'completed' });
      patchSession(s.id, { status: 'completed' });
      toast.success('Session marked completed');
    } catch (err) {
      console.error(err);
      toast.error('Could not mark as completed');
    }
  };

  const markNoShow = async (s) => {
    const ok = await confirm({
      title: 'Mark as no-show?',
      description: `${s.client_name} · ${formatLongDateET(s.date)} ${formatTimeET(s.date, s.start_time)}`,
      consequences: [
        'Status will be set to "cancelled" with reason "No-show — marked by coach".',
        'No automatic credit refund. Use the Earnings or Credits page if a refund is appropriate.',
      ],
      confirmLabel: 'Mark no-show',
      cancelLabel: 'Keep status',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const reason = `${NO_SHOW_PREFIX} — marked by coach`;
      await sessionRepo.update(s.id, { status: 'cancelled', cancellation_reason: reason });
      patchSession(s.id, { status: 'cancelled', cancellation_reason: reason });
      toast.success('Marked as no-show');
    } catch (err) {
      console.error(err);
      toast.error('Could not update session');
    }
  };

  const cancelSession = async (s) => {
    const isLate = isWithinHoursFromNow(s.date, s.start_time, 24);
    const ok = await confirm({
      title: isLate ? 'Late cancellation — within 24 hours' : 'Cancel this session?',
      description: `${s.client_name} · ${formatLongDateET(s.date)} ${formatTimeET(s.date, s.start_time)}`,
      consequences: isLate
        ? ['The client\'s session credit will NOT be returned automatically.', 'They will need to contact support for an exception.']
        : ['The session credit will be returned to the client automatically (if linked).', 'They can reschedule whenever they\'re ready.'],
      confirmLabel: isLate ? 'Cancel anyway' : 'Cancel session',
      cancelLabel: 'Keep session',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      await sessionRepo.update(s.id, { status: 'cancelled', cancellation_reason: 'Cancelled by coach' });
      patchSession(s.id, { status: 'cancelled', cancellation_reason: 'Cancelled by coach' });

      // Refund credit if not late and a credit is linked.
      if (!isLate && s.credit_id) {
        try {
          const credits = await sessionCreditRepo.filter({ id: s.credit_id });
          const credit = credits[0];
          if (credit && credit.used_credits > 0) {
            await sessionCreditRepo.update(credit.id, {
              used_credits: Math.max(0, credit.used_credits - 1),
            });
          }
        } catch (err) {
          console.warn('credit refund failed', err);
        }
      }

      toast.success(isLate ? 'Session cancelled (no credit returned)' : 'Session cancelled');
    } catch (err) {
      console.error(err);
      toast.error('Could not cancel session');
    }
  };

  // Reschedule ----------------------------------------------------------
  const startReschedule = async (s) => {
    setRescheduleSession(s);
    setRescheduleDate(null);
    setRescheduleTime('');
    try {
      const res = await rpc.invoke('getCoachAvailability', { coach_id: s.coach_id });
      const data = res?.data ?? res;
      setRescheduleBlocks(data?.blocks || []);
      setRescheduleExisting(data?.sessions || []);
    } catch (err) {
      console.error(err);
      toast.error('Could not load availability');
      setRescheduleSession(null);
    }
  };

  const isRescheduleDateBlocked = (date) => {
    const d = startOfDay(date);
    return rescheduleBlocks.some(b => {
      if (!b.block_all_day) return false;
      const start = startOfDay(parseISO(b.start_date));
      const end = startOfDay(parseISO(b.end_date));
      return isWithinInterval(d, { start, end });
    });
  };

  const isRescheduleTimeSlotTaken = (time) => {
    if (!rescheduleDate) return false;
    const dateStr = format(rescheduleDate, 'yyyy-MM-dd');
    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart + 30;
    return rescheduleExisting.some(s => {
      if (s.date !== dateStr) return false;
      if (s.id === rescheduleSession?.id) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd = sStart + (s.duration_minutes || 60);
      return slotStart < sEnd && slotEnd > sStart;
    });
  };

  const isRescheduleTimeOutside = (time) => {
    if (!rescheduleDate || !coach?.availability) return false;
    const dayName = format(rescheduleDate, 'EEEE');
    const dayAvail = coach.availability[dayName];
    if (!dayAvail || !dayAvail.enabled) return true;
    const mins = timeToMinutes(time);
    return mins < timeToMinutes(dayAvail.start) || mins >= timeToMinutes(dayAvail.end);
  };

  const confirmReschedule = async () => {
    if (!rescheduleSession || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      const newDate = format(rescheduleDate, 'yyyy-MM-dd');
      await sessionRepo.update(rescheduleSession.id, {
        date: newDate,
        start_time: rescheduleTime,
      });
      patchSession(rescheduleSession.id, { date: newDate, start_time: rescheduleTime });

      // Reschedule notification emails are sent server-side by the booking
      // function — the open-relay client email helper was removed.

      toast.success('Session rescheduled');
      setRescheduleSession(null);
    } catch (err) {
      console.error(err);
      toast.error('Could not reschedule');
    } finally {
      setRescheduling(false);
    }
  };

  // Render --------------------------------------------------------------
  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!user?.coach_id && isAdmin) {
    return (
      <div className="bg-card border border-accent/30 rounded-lg p-6">
        <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-2">Sessions</h2>
        <p className="text-sm text-muted-foreground">
          Your admin account isn't linked to a coach profile, so there are no sessions to show.
        </p>
      </div>
    );
  }

  if (!user?.coach_id) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">Coach Profile Not Linked</p>
          <p className="text-sm text-muted-foreground mt-1">Ask an admin to link your account to a coach record.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Run your day — mark completed, take payment, handle no-shows.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto -mx-4 sm:mx-0">
        <div className="flex min-w-max px-4 sm:px-0">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-display tracking-wider uppercase border-b-2 transition-colors ${
                tab === t.key
                  ? 'text-accent border-accent'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-muted-foreground/70">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search client name or email…"
              className="pl-9 bg-secondary border-border"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">Payment</label>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-44 bg-secondary border-border h-9">
              <SelectValue />
            </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="review">Needs review</SelectItem>
              </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">County</label>
          <Select value={countyFilter} onValueChange={setCountyFilter}>
            <SelectTrigger className="w-36 bg-secondary border-border h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All counties</SelectItem>
              <SelectItem value="Oakland">Oakland</SelectItem>
              <SelectItem value="Macomb">Macomb</SelectItem>
              <SelectItem value="Wayne">Wayne</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">From</label>
          <Input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-secondary border-border h-9 w-40"
          />
        </div>
        <div>
          <label className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">To</label>
          <Input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-secondary border-border h-9 w-40"
          />
        </div>

        {(search || paymentFilter !== 'all' || countyFilter !== 'all' || fromDate || toDate) && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(''); setPaymentFilter('all'); setCountyFilter('all'); setFromDate(''); setToDate(''); }}
            className="text-xs font-display tracking-wider uppercase"
          >
            <Filter className="w-3 h-3 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Result */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <CalendarIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No sessions match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <SessionCard
              key={s.id}
              s={s}
              onMarkCompleted={markCompleted}
              onMarkNoShow={markNoShow}
              onCancel={cancelSession}
              onReschedule={startReschedule}
              onMessage={() => navigate('/coach/messages')}
            />
          ))}
        </div>
      )}

      {/* Reschedule dialog */}
      <Dialog
        open={!!rescheduleSession}
        onOpenChange={(open) => { if (!open) setRescheduleSession(null); }}
      >
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold tracking-tight uppercase">Reschedule Session</DialogTitle>
            {rescheduleSession && (
              <DialogDescription>
                Pick a new date and time for {rescheduleSession.client_name}. All times shown in ET.
              </DialogDescription>
            )}
          </DialogHeader>

          {rescheduleSession && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  disabled={(date) => isBefore(date, startOfDay(new Date())) || isRescheduleDateBlocked(date)}
                  className="rounded-lg border border-border bg-card p-4"
                />
              </div>
              {rescheduleDate && (
                <div>
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Time (ET)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_SLOTS.map((time) => {
                      const taken = isRescheduleTimeSlotTaken(time);
                      const outside = isRescheduleTimeOutside(time);
                      const disabled = taken || outside;
                      return (
                        <button
                          key={time}
                          onClick={() => !disabled && setRescheduleTime(time)}
                          disabled={disabled}
                          className={`p-2 rounded-md border text-xs font-display tracking-wide transition-all ${
                            disabled
                              ? 'border-border bg-secondary/50 text-muted-foreground/40 line-through cursor-not-allowed'
                              : rescheduleTime === time
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border bg-card hover:border-accent/30'
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleSession(null)} className="font-display tracking-wider uppercase">
              Cancel
            </Button>
            <Button
              onClick={confirmReschedule}
              disabled={!rescheduleDate || !rescheduleTime || rescheduling}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
            >
              {rescheduling ? 'Rescheduling…' : 'Confirm Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}

// ----- Session card --------------------------------------------------------

function SessionCard({ s, onMarkCompleted, onMarkNoShow, onCancel, onReschedule, onMessage }) {
  const sm = statusMeta(s);
  const StatusIcon = sm.icon;
  const pm = paymentMeta(s);
  const past = isSessionPast(s.date, s.start_time);
  const canCancel = s.status !== 'cancelled' && s.status !== 'completed';
  const canReschedule = s.status !== 'cancelled' && s.status !== 'completed';
  const canMarkComplete = (s.status === 'pending' || s.status === 'confirmed');
  const canMarkNoShow = canMarkComplete && past;
  const paymentTone =
    pm.tone === 'green' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
    pm.tone === 'yellow' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
    pm.tone === 'accent' ? 'bg-accent/10 text-accent border-accent/20' :
    'bg-muted text-muted-foreground border-border';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left side: when + client + meta */}
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="text-center flex-shrink-0 w-16">
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
              {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', weekday: 'short' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
            <p className="font-display text-2xl font-bold text-foreground leading-none">
              {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', day: 'numeric' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mt-1">
              {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'short' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display tracking-wider text-foreground text-base">
                {formatTimeET(s.date, s.start_time).replace(' ET', '')}
                <span className="text-muted-foreground"> · {s.duration_minutes} min</span>
              </p>
              <Badge className={`${sm.color} border text-[10px] font-display tracking-widest uppercase`}>
                <StatusIcon className="w-3 h-3 mr-1" />{sm.label}
              </Badge>
              <Badge className={`${paymentTone} border text-[10px] font-display tracking-widest uppercase`}>
                {pm.label}
              </Badge>
            </div>

            <Link
              to={`/coach/clients/${encodeURIComponent(s.client_email)}`}
              className="block mt-1 hover:text-accent transition-colors"
            >
              <p className="text-sm text-foreground truncate">
                {s.client_name}
                {s.client_age ? <span className="text-muted-foreground font-normal"> · age {s.client_age}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground truncate">{s.client_email}</p>
            </Link>

            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
              {s.county && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.county} County</span>}
              {s.payment_method && <span>{s.payment_method === 'credits' ? 'Credits' : 'Stripe'}</span>}
            </div>
            {s.session_goals && (
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Goals: </span>
                {s.session_goals}
              </p>
            )}
            {s.cancellation_reason && (
              <p className="text-xs text-destructive mt-1">Reason: {s.cancellation_reason}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
        {canMarkComplete && (
          <Button
            size="sm"
            onClick={() => onMarkCompleted(s)}
            className="bg-green-600 text-white font-display tracking-wider uppercase text-xs hover:bg-green-700"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Completed
          </Button>
        )}
        {canMarkNoShow && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMarkNoShow(s)}
            className="font-display tracking-wider uppercase text-xs text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-300"
          >
            <UserCheck className="w-3 h-3 mr-1" /> No-show
          </Button>
        )}
        {canReschedule && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReschedule(s)}
            className="font-display tracking-wider uppercase text-xs"
          >
            <CalendarClock className="w-3 h-3 mr-1" /> Reschedule
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCancel(s)}
            className="font-display tracking-wider uppercase text-xs text-destructive hover:text-destructive"
          >
            <XCircle className="w-3 h-3 mr-1" /> Cancel
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onMessage}
          className="font-display tracking-wider uppercase text-xs"
        >
          <MessageSquare className="w-3 h-3 mr-1" /> Message
        </Button>
        <Link to={`/coach/clients/${encodeURIComponent(s.client_email)}`}>
          <Button
            size="sm"
            variant="ghost"
            className="font-display tracking-wider uppercase text-xs"
          >
            <ExternalLink className="w-3 h-3 mr-1" /> Client
          </Button>
        </Link>
      </div>
    </div>
  );
}
