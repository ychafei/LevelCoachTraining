import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfDay, isBefore } from 'date-fns';
import { sessionRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
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
import {
  formatInTz, formatTimeInTz, isSessionPast, slotsForDate,
  timezoneAbbreviation,
} from '@/lib/scheduleET';

// Sessions page — coach-side operational view of every booking. All lifecycle
// mutations route through the `booking` Appwrite Function via sessionRepo
// (complete / no_show / cancel / reschedule) — the server validates authority,
// policy windows, and credit restitution.

const STATUS_TABS = [
  { key: 'today',     label: 'Today' },
  { key: 'upcoming',  label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled / No-show' },
  { key: 'all',       label: 'All' },
];

function todayInTz(timezone = 'America/Detroit') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function statusMeta(s) {
  switch (s.status) {
    case 'pending':   return { icon: Clock,         color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' };
    case 'confirmed': return { icon: CheckCircle2,  color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' };
    case 'completed': return { icon: CheckCircle2,  color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Completed' };
    case 'no_show':   return { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'No-show' };
    case 'cancelled': return { icon: XCircle,       color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' };
    default:          return { icon: Clock,         color: 'bg-muted text-muted-foreground border-border', label: s.status || '—' };
  }
}

function paymentMeta(s) {
  if (s.payment_status === 'paid') return { tone: 'green', label: 'Paid' };
  if (s.payment_method === 'credits') return { tone: 'accent', label: 'Credits' };
  if (s.payment_method === 'electronic') return { tone: 'muted', label: 'Stripe' };
  return { tone: 'muted', label: s.payment_status || 'unpaid' };
}

const CANCELLED_STATUSES = new Set(['cancelled', 'no_show']);

export default function CoachSessions() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { coach, loading: coachLoading } = useMyCoach();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters --------------------------------------------------------------
  const [tab, setTab] = useState('today');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');     // all | paid | review
  const [fromDate, setFromDate] = useState('');                  // YYYY-MM-DD
  const [toDate, setToDate] = useState('');                      // YYYY-MM-DD

  // Reschedule dialog state ---------------------------------------------
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [busyAction, setBusyAction] = useState('');              // session id with in-flight action

  const coachTz = coach?.timezone || 'America/Detroit';

  useEffect(() => {
    if (coachLoading) return undefined;
    if (!coach?.id) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const ssns = await sessionRepo.filter({ coach_id: coach.id }, '-date');
        if (cancelled) return;
        setSessions(ssns || []);
      } catch (err) {
        console.error('CoachSessions load failed', err);
        toast.error('Could not load sessions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coach?.id, coachLoading]);

  // Derived: filter + bucket the sessions ------------------------------
  const filtered = useMemo(() => {
    const tToday = todayInTz(coachTz);
    const q = search.trim().toLowerCase();
    return sessions.filter(s => {
      switch (tab) {
        case 'today':
          if (s.date !== tToday || CANCELLED_STATUSES.has(s.status) || s.status === 'completed') return false;
          break;
        case 'upcoming':
          if (s.status === 'completed' || CANCELLED_STATUSES.has(s.status)) return false;
          if (s.date <= tToday) return false; // today is covered by its own tab
          break;
        case 'completed':
          if (s.status !== 'completed') return false;
          break;
        case 'cancelled':
          if (!CANCELLED_STATUSES.has(s.status)) return false;
          break;
        case 'all':
        default:
          break;
      }

      if (fromDate && s.date < fromDate) return false;
      if (toDate && s.date > toDate) return false;

      if (paymentFilter === 'paid' && s.payment_status !== 'paid') return false;
      if (paymentFilter === 'review' && s.payment_status === 'paid') return false;

      if (q) {
        const hay = `${s.client_name || ''} ${s.client_email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      const ascending = tab === 'today' || tab === 'upcoming';
      const ka = `${a.date} ${a.start_time || '00:00'}`;
      const kb = `${b.date} ${b.start_time || '00:00'}`;
      return ascending ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
  }, [sessions, tab, search, paymentFilter, fromDate, toDate, coachTz]);

  const counts = useMemo(() => {
    const t = todayInTz(coachTz);
    return {
      today:     sessions.filter(s => s.date === t && !CANCELLED_STATUSES.has(s.status) && s.status !== 'completed').length,
      upcoming:  sessions.filter(s => s.date > t && !CANCELLED_STATUSES.has(s.status) && s.status !== 'completed').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      cancelled: sessions.filter(s => CANCELLED_STATUSES.has(s.status)).length,
      all:       sessions.length,
    };
  }, [sessions, coachTz]);

  // Mutations — all via the booking function ------------------------------
  const patchSession = (id, patch) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const markCompleted = async (s) => {
    setBusyAction(s.id);
    try {
      const updated = await sessionRepo.complete(s.id);
      patchSession(s.id, updated || { status: 'completed' });
      toast.success('Session marked completed');
    } catch (err) {
      toast.error(err?.message || 'Could not mark as completed.');
    } finally {
      setBusyAction('');
    }
  };

  const markNoShow = async (s) => {
    const ok = await confirm({
      title: 'Mark as no-show?',
      description: `${s.client_name} · ${formatInTz(s.date, s.start_time, s.timezone || coachTz)}`,
      consequences: [
        'The session status becomes "no-show".',
        'The credit stays consumed — no automatic refund.',
      ],
      confirmLabel: 'Mark no-show',
      cancelLabel: 'Keep status',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyAction(s.id);
    try {
      const updated = await sessionRepo.noShow(s.id);
      patchSession(s.id, updated || { status: 'no_show' });
      toast.success('Marked as no-show');
    } catch (err) {
      toast.error(err?.message || 'Could not update the session.');
    } finally {
      setBusyAction('');
    }
  };

  const cancelSession = async (s) => {
    const ok = await confirm({
      title: 'Cancel this session?',
      description: `${s.client_name} · ${formatInTz(s.date, s.start_time, s.timezone || coachTz)}`,
      consequences: [
        'Because you are the coach, the client\'s session credit is restored automatically.',
        'Both sides are notified.',
      ],
      confirmLabel: 'Cancel session',
      cancelLabel: 'Keep session',
      variant: 'destructive',
    });
    if (!ok) return;

    setBusyAction(s.id);
    try {
      const { session: updated, credit_restored } = await sessionRepo.cancel(s.id, 'Cancelled by coach');
      patchSession(s.id, updated || { status: 'cancelled', cancellation_reason: 'Cancelled by coach' });
      toast.success(credit_restored ? 'Session cancelled — credit restored to the client' : 'Session cancelled');
    } catch (err) {
      toast.error(err?.message || 'Could not cancel the session.');
    } finally {
      setBusyAction('');
    }
  };

  // Reschedule ----------------------------------------------------------
  const startReschedule = async (s) => {
    setRescheduleSession(s);
    setRescheduleDate(null);
    setRescheduleTime('');
    setAvailability(null);
    setLoadingAvailability(true);
    try {
      const data = await callFn('getCoachAvailability', { coach_id: s.coach_id });
      setAvailability(data || null);
    } catch (err) {
      toast.error(err?.message || 'Could not load availability.');
      setRescheduleSession(null);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const openSlots = useMemo(() => {
    if (!rescheduleSession || !rescheduleDate || !availability) return [];
    const dateStr = format(rescheduleDate, 'yyyy-MM-dd');
    // Exclude the session being moved from the busy ranges so its current
    // slot stays selectable.
    const busy = (availability.busy || []).filter((range) => !(
      range.date === rescheduleSession.date
      && range.start_time === rescheduleSession.start_time
    ));
    return slotsForDate(
      { ...availability, busy },
      dateStr,
      Number(rescheduleSession.duration_minutes) || 60,
    );
  }, [availability, rescheduleDate, rescheduleSession]);

  const confirmReschedule = async () => {
    if (!rescheduleSession || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      const newDate = format(rescheduleDate, 'yyyy-MM-dd');
      const updated = await sessionRepo.reschedule({
        session_id: rescheduleSession.id,
        date: newDate,
        start_time: rescheduleTime,
      });
      patchSession(rescheduleSession.id, updated || { date: newDate, start_time: rescheduleTime });
      toast.success('Session rescheduled');
      setRescheduleSession(null);
    } catch (err) {
      toast.error(err?.message || 'Could not reschedule the session.');
    } finally {
      setRescheduling(false);
    }
  };

  // Render --------------------------------------------------------------
  if (loading || coachLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading sessions">
        <div className="h-9 w-48 animate-pulse rounded bg-secondary" />
        {[0, 1, 2].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-secondary/50" />
        ))}
      </div>
    );
  }

  if (!coach && isAdmin) {
    return (
      <div className="bg-card border border-accent/30 rounded-lg p-6">
        <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-2">Sessions</h2>
        <p className="text-sm text-muted-foreground">
          Your admin account isn't linked to a coach profile, so there are no sessions to show.
        </p>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">Coach Profile Not Linked</p>
          <p className="text-sm text-muted-foreground mt-1">Ask an admin to link your account to a coach record.</p>
        </div>
      </div>
    );
  }

  const tzAbbr = timezoneAbbreviation(coachTz);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Run your day — complete sessions, handle no-shows, cancel or reschedule.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto -mx-4 sm:mx-0">
        <div className="flex min-w-max px-4 sm:px-0" role="tablist" aria-label="Session buckets">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-display tracking-wider uppercase border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
          <label htmlFor="session-search" className="sr-only">Search client name or email</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="session-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search client name or email…"
              className="pl-9 bg-secondary border-border"
            />
          </div>
        </div>

        <div>
          <label htmlFor="session-payment" className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">Payment</label>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger id="session-payment" className="w-44 bg-secondary border-border h-9">
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
          <label htmlFor="session-from" className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">From</label>
          <Input
            id="session-from"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-secondary border-border h-9 w-40"
          />
        </div>
        <div>
          <label htmlFor="session-to" className="text-[10px] font-display tracking-widest uppercase text-muted-foreground block mb-1">To</label>
          <Input
            id="session-to"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-secondary border-border h-9 w-40"
          />
        </div>

        {(search || paymentFilter !== 'all' || fromDate || toDate) && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(''); setPaymentFilter('all'); setFromDate(''); setToDate(''); }}
            className="text-xs font-display tracking-wider uppercase"
          >
            <Filter className="w-3 h-3 mr-1" aria-hidden="true" /> Reset
          </Button>
        )}
      </div>

      {/* Result */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <CalendarIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {sessions.length === 0
              ? 'No sessions yet. Once clients book you, they show up here.'
              : 'No sessions match the current filters.'}
          </p>
          {sessions.length === 0 && !coach.published && (
            <Link to="/coach" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
              Finish setup and publish your profile
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <SessionCard
              key={s.id}
              s={s}
              coachTz={coachTz}
              busy={busyAction === s.id}
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
                Pick a new date and time for {rescheduleSession.client_name}. Times shown in {tzAbbr || coachTz}.
                The server re-validates the slot against your availability and conflicts.
              </DialogDescription>
            )}
          </DialogHeader>

          {rescheduleSession && (
            loadingAvailability ? (
              <div className="py-12 text-center" aria-busy="true">
                <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Loading availability…</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
                  <Calendar
                    mode="single"
                    selected={rescheduleDate}
                    onSelect={(d) => { setRescheduleDate(d); setRescheduleTime(''); }}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    className="rounded-lg border border-border bg-card p-4"
                  />
                </div>
                {rescheduleDate && (
                  <div>
                    <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">
                      Open Times ({tzAbbr || coachTz})
                    </p>
                    {openSlots.length === 0 ? (
                      <p className="text-sm text-muted-foreground border border-border rounded-lg p-4">
                        No open slots on this date — it may be blocked, fully booked, or outside your availability.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {openSlots.map((time) => (
                          <button
                            key={time}
                            onClick={() => setRescheduleTime(time)}
                            className={`p-2 rounded-md border text-xs font-display tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              rescheduleTime === time
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border bg-card hover:border-accent/30'
                            }`}
                            aria-pressed={rescheduleTime === time}
                          >
                            {formatTimeInTz(format(rescheduleDate, 'yyyy-MM-dd'), time, coachTz, { timeZoneName: undefined }) || time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
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

function SessionCard({ s, coachTz, busy, onMarkCompleted, onMarkNoShow, onCancel, onReschedule, onMessage }) {
  const sm = statusMeta(s);
  const StatusIcon = sm.icon;
  const pm = paymentMeta(s);
  const tz = s.timezone || coachTz;
  const past = isSessionPast(s.date, s.start_time, Date.now(), tz);
  // The booking function only mutates confirmed sessions.
  const canMarkComplete = s.status === 'confirmed';
  const canMarkNoShow = s.status === 'confirmed' && past;
  const canCancel = s.status === 'pending' || s.status === 'confirmed';
  const canReschedule = canCancel;
  const paymentTone =
    pm.tone === 'green' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
    pm.tone === 'accent' ? 'bg-accent/10 text-accent border-accent/20' :
    'bg-muted text-muted-foreground border-border';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="text-center flex-shrink-0 w-16">
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
              {new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
            <p className="font-display text-2xl font-bold text-foreground leading-none">
              {new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mt-1">
              {new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(new Date(`${s.date}T12:00:00Z`))}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display tracking-wider text-foreground text-base">
                {formatTimeInTz(s.date, s.start_time, tz)}
                <span className="text-muted-foreground"> · {s.duration_minutes} min</span>
              </p>
              <Badge className={`${sm.color} border text-[10px] font-display tracking-widest uppercase`}>
                <StatusIcon className="w-3 h-3 mr-1" aria-hidden="true" />{sm.label}
              </Badge>
              <Badge className={`${paymentTone} border text-[10px] font-display tracking-widest uppercase`}>
                {pm.label}
              </Badge>
            </div>

            <Link
              to={`/coach/clients/${encodeURIComponent(s.client_email || '')}`}
              className="block mt-1 hover:text-accent transition-colors"
            >
              <p className="text-sm text-foreground truncate">
                {s.client_name}
                {s.client_age ? <span className="text-muted-foreground font-normal"> · age {s.client_age}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground truncate">{s.client_email}</p>
            </Link>

            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
              {s.county && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{s.county} County</span>}
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
            disabled={busy}
            onClick={() => onMarkCompleted(s)}
            className="bg-green-600 text-white font-display tracking-wider uppercase text-xs hover:bg-green-700"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" /> Mark Completed
          </Button>
        )}
        {canMarkNoShow && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onMarkNoShow(s)}
            className="font-display tracking-wider uppercase text-xs text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-700"
          >
            <UserCheck className="w-3 h-3 mr-1" aria-hidden="true" /> No-show
          </Button>
        )}
        {canReschedule && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onReschedule(s)}
            className="font-display tracking-wider uppercase text-xs"
          >
            <CalendarClock className="w-3 h-3 mr-1" aria-hidden="true" /> Reschedule
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onCancel(s)}
            className="font-display tracking-wider uppercase text-xs text-destructive hover:text-destructive"
          >
            <XCircle className="w-3 h-3 mr-1" aria-hidden="true" /> Cancel
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onMessage}
          className="font-display tracking-wider uppercase text-xs"
        >
          <MessageSquare className="w-3 h-3 mr-1" aria-hidden="true" /> Message
        </Button>
        <Link to={`/coach/clients/${encodeURIComponent(s.client_email || '')}`}>
          <Button
            size="sm"
            variant="ghost"
            className="font-display tracking-wider uppercase text-xs"
          >
            <ExternalLink className="w-3 h-3 mr-1" aria-hidden="true" /> Client
          </Button>
        </Link>
      </div>
    </div>
  );
}
