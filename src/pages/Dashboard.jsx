import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { sessionRepo, sessionCreditRepo, coachRepo, conversationRepo, messageRepo } from '@/api/repo';
import { rpc } from '@/lib/rpc';
import { email as emailLib } from '@/lib/email';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, MessageSquare, Settings, Shield, Clock, CheckCircle2, XCircle, Zap, CalendarClock, TrendingUp, Target, User as UserIcon, Repeat, Receipt, LifeBuoy, Sparkles, BookOpen } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay, parseISO, isBefore, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { formatTimeET, formatLongDateET, formatSessionRangeET } from '@/lib/formatInET';
import { isSessionPast, isWithinHoursFromNow } from '@/lib/scheduleET';

export default function Dashboard() {
  const { user, isAdmin, isCoach } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [coaches, setCoaches] = useState({});
  const [credits, setCredits] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleBlocks, setRescheduleBlocks] = useState([]);
  const [rescheduleExistingSessions, setRescheduleExistingSessions] = useState([]);
  const [rescheduling, setRescheduling] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const TIME_SLOTS = [];
  for (let h = 8; h <= 20; h++) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
  }

  const timeToMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  useEffect(() => {
    // Defensive: Route guard ensures user is present, but if it ever isn't,
    // don't sit on a spinner forever — flip loading to false and render the empty state.
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        let allSessions;
        if (isCoach && user.coach_id) {
          allSessions = await sessionRepo.filter({ coach_id: user.coach_id }, '-date');
        } else {
          allSessions = await sessionRepo.filter({ client_email: user.email }, '-date');
        }

        // Auto-complete past sessions (once per day per user, client-side gate).
        // Uses ET-aware comparison so a user in any timezone sees the same "past" cutoff.
        const todayKey = `autocomplete_${user.email}_${new Date().toISOString().slice(0, 10)}`;
        if (!localStorage.getItem(todayKey)) {
          const overdue = allSessions.filter(s =>
            (s.status === 'pending' || s.status === 'confirmed') &&
            isSessionPast(s.date, s.start_time)
          );
          if (overdue.length > 0) {
            await Promise.all(overdue.map(s => sessionRepo.update(s.id, { status: 'completed' })));
            overdue.forEach(s => { s.status = 'completed'; });
          }
          try { localStorage.setItem(todayKey, '1'); } catch {}
        }

        if (cancelled) return;
        setSessions(allSessions);

        const coachList = await coachRepo.list();
        if (cancelled) return;
        const map = {};
        coachList.forEach(c => { map[c.id] = c; });
        setCoaches(map);

        const userCredits = await sessionCreditRepo.filter({ client_email: user.email });
        if (cancelled) return;
        setCredits(userCredits);

        // Targeted unread count — only my conversations and their messages.
        // NOTE: legacy SDK doesn't expose an OR filter on arrays, so we fetch
        // conversations where I'm a participant by scanning; see risks section.
        const convos = await conversationRepo.filter({});
        const myConvos = convos.filter(c => c.participant_emails?.includes(user.email));
        let unread = 0;
        if (myConvos.length > 0) {
          // One query per conversation is bounded by myConvos.length, usually small.
          const msgBatches = await Promise.all(
            myConvos.map(c => messageRepo.filter({ conversation_id: c.id }))
          );
          msgBatches.forEach(msgs => {
            msgs.forEach(m => {
              if (m.sender_email !== user.email && !m.read_by?.includes(user.email)) unread++;
            });
          });
        }
        if (cancelled) return;
        setUnreadCount(unread);
      } catch (err) {
        console.error('Dashboard load failed:', err);
        if (!cancelled) toast.error('Could not load your dashboard. Please refresh.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user, isCoach]);

  const handleCancel = async (session) => {
    const isLateCancel = isWithinHoursFromNow(session.date, session.start_time, 24);
    const cancelledBy = isCoach ? 'coach' : 'client';

    const title = isLateCancel ? 'Late cancellation — within 24 hours' : 'Cancel this session?';
    const description = isLateCancel
      ? 'This session is within 24 hours of the scheduled start time.'
      : 'The session will be cancelled.';
    const consequences = isCoach
      ? (isLateCancel
          ? ["The client's session credit will NOT be returned.", 'They will need to contact support for an exception.']
          : ['The session credit will be returned to the client automatically.', 'They can reschedule whenever they are ready.'])
      : (isLateCancel
          ? ['This session is non-refundable.', 'Your credit will NOT be returned.']
          : ['Your session credit will be returned to your account.', 'You can reschedule whenever you are ready.']);

    const ok = await confirm({
      title,
      description,
      consequences,
      confirmLabel: isLateCancel ? 'Cancel anyway' : 'Cancel session',
      cancelLabel: 'Keep session',
      variant: 'destructive',
    });
    if (!ok) return;

    await sessionRepo.update(session.id, { status: 'cancelled', cancellation_reason: `Cancelled by ${cancelledBy}` });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'cancelled' } : s));

    let creditRefunded = false;
    // Refund 1 credit if not a late cancel and session is linked to a credit record
    if (!isLateCancel && session.credit_id) {
      const clientEmail = isCoach ? session.client_email : user.email;
      let creditToRefund = null;

      // If the session has a credit_id, refund to that specific credit record
      if (session.credit_id) {
        const clientCredits = await sessionCreditRepo.filter({ client_email: clientEmail });
        creditToRefund = clientCredits.find(c => c.id === session.credit_id && c.used_credits > 0);
      }

      // Fallback: find the most recently used credit record
      if (!creditToRefund) {
        const clientCredits = await sessionCreditRepo.filter({ client_email: clientEmail });
        creditToRefund = clientCredits
          .filter(c => c.used_credits > 0)
          .sort((a, b) => b.used_credits - a.used_credits)[0];
      }

      if (creditToRefund) {
        await sessionCreditRepo.update(creditToRefund.id, {
          used_credits: Math.max(0, creditToRefund.used_credits - 1)
        });
        creditRefunded = true;
      }

      // Refresh credits display for clients
      if (!isCoach) {
        const updated = await sessionCreditRepo.filter({ client_email: user.email });
        setCredits(updated);
      }
    }

    // Notify coach + client by email
    try {
      const coach = coaches[session.coach_id];
      const dateLabel = formatLongDateET(session.date);
      const timeRange = formatSessionRangeET(session.date, session.start_time, session.duration_minutes);
      const durLabel = session.duration_minutes >= 60
        ? `${session.duration_minutes / 60} hour${session.duration_minutes === 60 ? '' : 's'}`
        : `${session.duration_minutes} min`;
      const coachFullName = coach ? `${coach.first_name} ${coach.last_name}` : 'your coach';
      const clientFullName = session.client_name || session.client_email;
      const cancelledByLabel = cancelledBy === 'coach' ? 'the coach' : 'the client';

      const emails = [];

      // Client email
      emails.push(emailLib.send({
        to: session.client_email,
        subject: `Session Cancelled — ${dateLabel}`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #2563EB;">Session Cancelled</h2>
            <p>Hi ${clientFullName},</p>
            <p>Your ${durLabel} session with <strong>${coachFullName}</strong> on <strong>${dateLabel}</strong> (${timeRange}) has been successfully cancelled.</p>
            ${creditRefunded
              ? `<p style="padding:12px; background:#1f3a1f; border-left:4px solid #4ade80; color:#e5e7eb;"><strong>Good news:</strong> Your session credit has been returned to your account. You can reschedule whenever you're ready.</p>`
              : (isLateCancel
                  ? `<p style="padding:12px; background:#3a1f1f; border-left:4px solid #f87171; color:#e5e7eb;"><strong>Please note:</strong> This cancellation was within the 24-hour window, so no session credit was returned. Contact support if you believe this is an exception.</p>`
                  : `<p>No credit was returned for this session.</p>`)
            }
            <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#2563EB; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">Go to Dashboard</a></p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">LevelCoach Training — Private Soccer Coaching<br/>${window.location.origin}</p>
          </div>
        `,
      }));

      // Coach email
      if (coach?.email) {
        emails.push(emailLib.send({
          to: coach.email,
          subject: `Session Cancelled — ${clientFullName} on ${dateLabel}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #2563EB;">Session Cancelled</h2>
              <p>Hi ${coach.first_name},</p>
              <p>The ${durLabel} session with <strong>${clientFullName}</strong> on <strong>${dateLabel}</strong> (${timeRange}) in ${session.county} County was cancelled by ${cancelledByLabel}.</p>
              ${creditRefunded
                ? `<p>The client's session credit has been returned automatically.</p>`
                : (isLateCancel ? `<p>This was a late cancellation (within 24 hours) — no credit was returned to the client.</p>` : '')
              }
              <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#2563EB; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Dashboard</a></p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">LevelCoach Training — Coach Portal<br/>${window.location.origin}</p>
            </div>
          `,
        }));
      }

      await Promise.all(emails);
    } catch {
      // Email failure shouldn't block the cancellation
    }

    if (creditRefunded) {
      toast.success('Session cancelled. Your credit has been returned — schedule again whenever you\'re ready.');
    } else if (isLateCancel) {
      toast('Session cancelled. This was a late cancellation — no credit was returned.', { icon: '⚠️' });
    } else {
      toast.success('Session cancelled.');
    }
  };

  const handleStartReschedule = async (session) => {
    setRescheduleSession(session);
    setRescheduleDate(null);
    setRescheduleTime('');
    const res = await rpc.invoke('getCoachAvailability', { coach_id: session.coach_id });
    setRescheduleBlocks(res.data.blocks || []);
    setRescheduleExistingSessions(res.data.sessions || []);
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleSession || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    const oldDate = rescheduleSession.date;
    const oldTime = rescheduleSession.start_time;
    const newDate = format(rescheduleDate, 'yyyy-MM-dd');
    await sessionRepo.update(rescheduleSession.id, {
      date: newDate,
      start_time: rescheduleTime,
    });

    try {
      const coach = coaches[rescheduleSession.coach_id];
      const durationMinutes = rescheduleSession.duration_minutes;
      const durLabel = durationMinutes >= 60
        ? `${durationMinutes / 60} hour${durationMinutes === 60 ? '' : 's'}`
        : `${durationMinutes} min`;
      const coachFullName = coach ? `${coach.first_name} ${coach.last_name}` : 'your coach';
      const clientFullName = rescheduleSession.client_name || rescheduleSession.client_email;
      const oldWhen = `${formatLongDateET(oldDate)} · ${formatSessionRangeET(oldDate, oldTime, durationMinutes)}`;
      const newWhen = `${formatLongDateET(newDate)} · ${formatSessionRangeET(newDate, rescheduleTime, durationMinutes)}`;

      const emails = [];

      // Client email
      emails.push(emailLib.send({
        to: rescheduleSession.client_email,
        subject: `Session Rescheduled — ${formatLongDateET(newDate)}`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #2563EB;">Session Rescheduled</h2>
            <p>Hi ${clientFullName},</p>
            <p>Your ${durLabel} session with <strong>${coachFullName}</strong> has been successfully rescheduled.</p>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
              <tr>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; width:40%;"><strong>Previous:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; text-decoration:line-through; color:#888;">${oldWhen}</td>
              </tr>
              <tr>
                <td style="padding:10px; border:1px solid #ddd;"><strong>New:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; color:#2563EB;"><strong>${newWhen}</strong></td>
              </tr>
              <tr>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;"><strong>Location:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;">${rescheduleSession.county} County</td>
              </tr>
            </table>
            <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#2563EB; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Session</a></p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">LevelCoach Training — Private Soccer Coaching<br/>${window.location.origin}</p>
          </div>
        `,
      }));

      // Coach email
      if (coach?.email) {
        emails.push(emailLib.send({
          to: coach.email,
          subject: `Session Rescheduled — ${clientFullName}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #2563EB;">Session Rescheduled</h2>
              <p>Hi ${coach.first_name},</p>
              <p><strong>${clientFullName}</strong> has rescheduled their ${durLabel} session.</p>
              <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; width:40%;"><strong>Previous:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; text-decoration:line-through; color:#888;">${oldWhen}</td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #ddd;"><strong>New:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; color:#2563EB;"><strong>${newWhen}</strong></td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;"><strong>County:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;">${rescheduleSession.county}</td>
                </tr>
              </table>
              <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#2563EB; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Dashboard</a></p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">LevelCoach Training — Coach Portal<br/>${window.location.origin}</p>
            </div>
          `,
        }));
      }

      await Promise.all(emails);
    } catch {
      // Email failure shouldn't block the reschedule
    }

    setSessions(prev => prev.map(s => s.id === rescheduleSession.id ? { ...s, date: newDate, start_time: rescheduleTime } : s));
    setRescheduleSession(null);
    setRescheduling(false);
    toast.success('Session rescheduled! Confirmation emails have been sent.');
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
    return rescheduleExistingSessions.some(s => {
      if (s.date !== dateStr) return false;
      if (s.id === rescheduleSession?.id) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd = sStart + (s.duration_minutes || 60);
      return slotStart < sEnd && slotEnd > sStart;
    });
  };

  const isRescheduleTimeOutsideAvailability = (time) => {
    if (!rescheduleDate || !rescheduleSession) return false;
    const coach = coaches[rescheduleSession.coach_id];
    if (!coach?.availability) return false;
    const dayAvail = coach.availability[format(rescheduleDate, 'EEEE')];
    if (!dayAvail || !dayAvail.enabled) return true;
    const slotMins = timeToMinutes(time);
    return slotMins < timeToMinutes(dayAvail.start) || slotMins >= timeToMinutes(dayAvail.end);
  };

  // Hooks must run unconditionally — keep useMemo above the early returns below.
  const upcoming = useMemo(
    () => sessions.filter(s => s.status === 'pending' || s.status === 'confirmed'),
    [sessions]
  );
  const past = useMemo(
    () => sessions.filter(s => s.status === 'completed' || s.status === 'cancelled'),
    [sessions]
  );

  const progress = useMemo(() => {
    const completed = sessions.filter(s => s.status === 'completed');
    const totalCompleted = completed.length;

    const sortedActive = [...sessions]
      .filter(s => s.status !== 'cancelled')
      .sort((a, b) => `${b.date} ${b.start_time || ''}`.localeCompare(`${a.date} ${a.start_time || ''}`));
    const lastCoachId = sortedActive[0]?.coach_id || null;
    const lastCoach = lastCoachId ? coaches[lastCoachId] || null : null;

    const goalCounts = {};
    completed.forEach(s => {
      (s.session_goals || '')
        .split(',')
        .map(g => g.trim())
        .filter(Boolean)
        .forEach(g => { goalCounts[g] = (goalCounts[g] || 0) + 1; });
    });
    const topGoals = Object.entries(goalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([g]) => g);

    const nextSession = [...upcoming]
      .sort((a, b) => `${a.date} ${a.start_time || ''}`.localeCompare(`${b.date} ${b.start_time || ''}`))[0] || null;

    const remainingCredits = credits.reduce(
      (sum, c) => sum + Math.max(0, (c.total_credits || 0) - (c.used_credits || 0)),
      0
    );

    return { totalCompleted, lastCoach, topGoals, nextSession, remainingCredits };
  }, [sessions, coaches, credits, upcoming]);

  const activeCredits = useMemo(
    () => credits.filter(c => (c.total_credits - c.used_credits) > 0),
    [credits]
  );
  const firstActiveCredit = activeCredits[0] || null;
  const inactiveCredits = useMemo(
    () => credits.filter(c => (c.total_credits - c.used_credits) <= 0),
    [credits]
  );

  // Coaches and admins use the dedicated Coach Portal.
  // /dashboard is the client-only experience.
  if (isCoach) return <Navigate to="/coach" replace />;

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  const statusConfig = {
    pending: { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' },
    confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' },
    completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Completed' },
    cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' },
  };

  return (
    <div className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">DASHBOARD</h1>
            <p className="text-muted-foreground mt-1">
              {isCoach ? 'Manage your coaching sessions' : 'Track your training sessions'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/messages">
              <Button variant="outline" className="font-display tracking-wider uppercase text-xs relative">
                <MessageSquare className="w-4 h-4 mr-2" /> Messages
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="font-display tracking-wider uppercase text-xs">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
                  <Shield className="w-4 h-4 mr-2" /> Admin Panel
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Available Sessions (clients only) */}
        {!isCoach && activeCredits.length > 0 && (
          <div className="mb-6 space-y-3">
            {activeCredits.map(credit => {
              const remaining = credit.total_credits - credit.used_credits;
              const durationLabel = credit.session_duration_minutes
                ? `${credit.session_duration_minutes >= 60 ? `${credit.session_duration_minutes / 60} hr${credit.session_duration_minutes > 60 ? 's' : ''}` : `${credit.session_duration_minutes} min`} each`
                : '';
              return (
                <div key={credit.id} className="bg-accent/10 border border-accent/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-accent flex-shrink-0" />
                    <div>
                      <p className="font-display text-lg font-bold text-foreground tracking-wider">
                        {credit.package_name || 'Session'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">{remaining}</strong> of {credit.total_credits} session{credit.total_credits !== 1 ? 's' : ''} remaining{durationLabel ? ` · ${durationLabel}` : ''}
                      </p>
                    </div>
                  </div>
                  <Link to={`/book?credit_id=${credit.id}`}>
                    <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90 whitespace-nowrap">
                      Schedule Remaining Session{remaining === 1 ? '' : 's'}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Training Progress (clients only) */}
        {!isCoach && sessions.length > 0 && (
          <div className="mb-10 bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground">Training Progress</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Completed */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Sessions Completed</span>
                </div>
                <p className="font-display text-3xl font-bold text-foreground">{progress.totalCompleted}</p>
                <p className="text-xs text-muted-foreground mt-1">Lifetime</p>
              </div>

              {/* Recent coach */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <UserIcon className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Most Recent Coach</span>
                </div>
                {progress.lastCoach ? (
                  <Link to={`/coaches/${progress.lastCoach.id}`} className="flex items-center gap-2 hover:opacity-80">
                    <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden flex items-center justify-center flex-shrink-0">
                      {progress.lastCoach.photo_url
                        ? <img src={progress.lastCoach.photo_url} alt="" className="w-full h-full object-cover" />
                        : <UserIcon className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display tracking-wider text-foreground text-sm truncate">{progress.lastCoach.first_name} {progress.lastCoach.last_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{progress.lastCoach.county} County</p>
                    </div>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Book your first session to set this.</p>
                )}
              </div>

              {/* Top goals */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Most Common Goals</span>
                </div>
                {progress.topGoals.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {progress.topGoals.map(g => (
                      <Badge key={g} variant="secondary" className="text-[10px] font-display tracking-wide uppercase bg-secondary">{g}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Pick goals when you book to track focus areas.</p>
                )}
              </div>

              {/* Next + remaining */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Up Next</span>
                </div>
                {progress.nextSession ? (
                  <div>
                    <p className="font-display tracking-wider text-foreground text-sm">{formatLongDateET(progress.nextSession.date).split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground">{formatTimeET(progress.nextSession.date, progress.nextSession.start_time)}</p>
                  </div>
                ) : progress.remainingCredits > 0 ? (
                  <Link to={firstActiveCredit ? `/book?credit_id=${firstActiveCredit.id}` : '/coaches'} className="text-sm font-display tracking-wider text-accent hover:underline">
                    {progress.remainingCredits} credit{progress.remainingCredits === 1 ? '' : 's'} → schedule →
                  </Link>
                ) : (
                  <Link to="/coaches" className="text-sm font-display tracking-wider text-accent hover:underline">
                    Book a session →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Coach-role branches here are dead code — coaches redirect to /coach
            before this renders. Kept only the client-facing sections below. */}

        {/* New user welcome prompt */}
        {!isCoach && !isAdmin && sessions.length === 0 && credits.length === 0 && (
          <div className="mb-8 p-5 bg-primary/10 border border-primary/20 rounded-lg">
            <h3 className="font-display text-lg font-bold tracking-wider text-foreground mb-1">WELCOME TO LC TRAINING!</h3>
            <p className="text-sm text-muted-foreground mb-4">You're all set. Here's what you can do to get started:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/coaches">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-display tracking-wider text-sm text-foreground">Book a Session</p>
                  <p className="text-xs text-muted-foreground mt-1">Choose a package and pick your coach.</p>
                </div>
              </Link>
              <Link to="/settings">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-display tracking-wider text-sm text-foreground">Complete Your Profile</p>
                  <p className="text-xs text-muted-foreground mt-1">Add your info and preferences.</p>
                </div>
              </Link>
              <Link to="/matching">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-display tracking-wider text-sm text-foreground">Find a Training Partner</p>
                  <p className="text-xs text-muted-foreground mt-1">Connect with other players in your area.</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sessions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming */}
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="font-display text-xl font-bold tracking-wider text-foreground">UPCOMING SESSIONS</h2>
                {!isCoach && progress.lastCoach && progress.remainingCredits === 0 && upcoming.length > 0 && (
                  <Link to={`/book?coach_id=${progress.lastCoach.id}&county=${encodeURIComponent(progress.lastCoach.county || '')}`}>
                    <Button variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs">
                      <Repeat className="w-3 h-3 mr-1.5" /> Rebook with {progress.lastCoach.first_name}
                    </Button>
                  </Link>
                )}
              </div>
              {upcoming.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <CalendarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming sessions.</p>
                  {!isCoach && (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {progress.remainingCredits > 0 ? (
                        <Link to={firstActiveCredit ? `/book?credit_id=${firstActiveCredit.id}` : '/coaches'}>
                          <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
                            <CalendarClock className="w-3 h-3 mr-1.5" /> Schedule {progress.remainingCredits} Credit{progress.remainingCredits === 1 ? '' : 's'}
                          </Button>
                        </Link>
                      ) : (
                        <Link to="/coaches">
                          <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
                            Book a Session
                          </Button>
                        </Link>
                      )}
                      {progress.lastCoach && (
                        <Link to={`/book?coach_id=${progress.lastCoach.id}&county=${encodeURIComponent(progress.lastCoach.county || '')}`}>
                          <Button variant="outline" className="font-display tracking-wider uppercase text-xs">
                            <Repeat className="w-3 h-3 mr-1.5" /> Rebook with {progress.lastCoach.first_name}
                          </Button>
                        </Link>
                      )}
                      {user && !user.profile_setup_complete && (
                        <Link to="/settings">
                          <Button variant="ghost" className="font-display tracking-wider uppercase text-xs">
                            Finish profile →
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(session => {
                    const coach = coaches[session.coach_id];
                    const sc = statusConfig[session.status];
                    const Icon = sc?.icon || Clock;
                    return (
                      <div key={session.id} className="bg-card border border-border rounded-lg p-5">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {!isCoach && coach && (
                              <Link to={`/coaches/${coach.id}`} className="flex-shrink-0">
                                <div className="w-12 h-12 rounded-full bg-secondary overflow-hidden flex items-center justify-center">
                                  {coach.photo_url
                                    ? <img src={coach.photo_url} alt={`Coach ${coach.first_name}`} className="w-full h-full object-cover" />
                                    : <UserIcon className="w-5 h-5 text-muted-foreground" />}
                                </div>
                              </Link>
                            )}
                            <div className="min-w-0">
                              <h3 className="font-display text-lg font-bold tracking-wider">
                                {formatLongDateET(session.date)}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {formatTimeET(session.date, session.start_time)} · {session.duration_minutes} min · {session.county}
                              </p>
                            {isCoach ? (
                              <div>
                                <p className="text-sm text-muted-foreground mt-1">Client: {session.client_name}{session.client_age ? ` · Age ${session.client_age}` : ''}</p>
                                {session.session_goals && <p className="text-xs text-muted-foreground mt-0.5">Goals: {session.session_goals}</p>}
                              </div>
                            ) : coach ? (
                              <Link to={`/coaches/${coach.id}`} className="text-sm text-muted-foreground mt-1 inline-block hover:text-accent transition-colors">
                                Coach: <span className="text-foreground">{coach.first_name} {coach.last_name}</span>
                              </Link>
                            ) : null}
                            {!isCoach && session.payment_method && (
                              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-display tracking-wide uppercase ${
                                session.payment_method === 'credits' ? 'bg-primary/10 text-primary border border-primary/20' :
                                'bg-green-500/10 text-green-400 border border-green-500/20'
                              }`}>
                                {session.payment_method === 'credits' ? 'Credits' : 'Stripe'}
                              </span>
                            )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${sc?.color} border`}>
                              <Icon className="w-3 h-3 mr-1" />{sc?.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Coach-shared content (client visible) */}
                        {!isCoach && (session.client_visible_notes || session.homework) && (
                          <div className="mt-4 border-t border-border pt-3 space-y-2">
                            <p className="text-[10px] font-display tracking-widest uppercase text-accent flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> From your coach
                            </p>
                            {session.homework && (
                              <div className="bg-secondary/40 border border-border rounded p-3">
                                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground flex items-center gap-1 mb-1">
                                  <BookOpen className="w-3 h-3" /> Homework
                                </p>
                                <p className="text-sm text-foreground whitespace-pre-line">{session.homework}</p>
                              </div>
                            )}
                            {session.client_visible_notes && (
                              <div className="bg-secondary/40 border border-border rounded p-3">
                                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm text-foreground whitespace-pre-line">{session.client_visible_notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          {isCoach && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancel(session)}
                                className="font-display tracking-wider uppercase text-xs text-destructive hover:text-destructive"
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                          {!isCoach && (() => {
                            const isOver24Hours = !isWithinHoursFromNow(session.date, session.start_time, 24);
                            return (
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-2 items-center">
                                  {isOver24Hours && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleStartReschedule(session)}
                                      className="font-display tracking-wider uppercase text-xs"
                                    >
                                      <CalendarClock className="w-3 h-3 mr-1" /> Reschedule
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCancel(session)}
                                    className="font-display tracking-wider uppercase text-xs text-destructive hover:text-destructive"
                                  >
                                    <XCircle className="w-3 h-3 mr-1" /> Cancel
                                  </Button>
                                </div>
                                {!isOver24Hours && (
                                  <p className="text-xs text-destructive/70">
                                    Within 24 hours — cancellation is non-refundable. Credit will not be returned.
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Past */}
            {past.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold tracking-wider text-foreground mb-4">PAST SESSIONS</h2>
                <div className="space-y-3">
                  {past.slice(0, 10).map(session => {
                    const coach = coaches[session.coach_id];
                    const sc = statusConfig[session.status];
                    const hasShared = !isCoach && (session.client_visible_notes || session.homework);
                    return (
                      <div key={session.id} className="bg-card border border-border rounded-lg p-4">
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {!isCoach && coach && (
                              <Link to={`/coaches/${coach.id}`} className="flex-shrink-0">
                                <div className="w-9 h-9 rounded-full bg-secondary overflow-hidden flex items-center justify-center">
                                  {coach.photo_url
                                    ? <img src={coach.photo_url} alt="" className="w-full h-full object-cover" />
                                    : <UserIcon className="w-4 h-4 text-muted-foreground" />}
                                </div>
                              </Link>
                            )}
                            <div className="min-w-0">
                              <p className="font-display tracking-wider text-sm">
                                 {format(new Date(session.date + 'T00:00:00'), 'MMM d, yyyy')} · {formatTimeET(session.date, session.start_time)} · {session.duration_minutes} min
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isCoach ? session.client_name : coach ? `${coach.first_name} ${coach.last_name}` : ''}
                              </p>
                              {session.cancellation_reason && (
                                <p className="text-xs text-destructive mt-1">Reason: {session.cancellation_reason}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={`${sc?.color} border`}>{sc?.label}</Badge>
                        </div>
                        {hasShared && (
                          <div className="mt-3 pt-3 border-t border-border space-y-2">
                            {session.homework && (
                              <div>
                                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground flex items-center gap-1 mb-0.5">
                                  <BookOpen className="w-3 h-3" /> Homework
                                </p>
                                <p className="text-sm text-foreground whitespace-pre-line">{session.homework}</p>
                              </div>
                            )}
                            {session.client_visible_notes && (
                              <div>
                                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-0.5">Coach notes</p>
                                <p className="text-sm text-foreground whitespace-pre-line">{session.client_visible_notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Packages / receipts (clients only) */}
            {!isCoach && credits.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-accent" /> Your Packages
                </h3>
                <div className="space-y-3">
                  {[...activeCredits, ...inactiveCredits].slice(0, 6).map(c => {
                    const remaining = Math.max(0, (c.total_credits || 0) - (c.used_credits || 0));
                    const used = c.used_credits || 0;
                    const total = c.total_credits || 0;
                    const durLabel = c.session_duration_minutes
                      ? `${c.session_duration_minutes >= 60 ? `${c.session_duration_minutes / 60} hr${c.session_duration_minutes > 60 ? 's' : ''}` : `${c.session_duration_minutes} min`}`
                      : null;
                    const methodLabel = c.payment_processor === 'stripe' ? 'Paid · Stripe'
                      : c.payment_processor ? `Paid · ${c.payment_processor}`
                      : null;
                    return (
                      <div key={c.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display tracking-wider text-foreground text-sm truncate">{c.package_name || 'Session credit'}</p>
                          {remaining === 0 ? (
                            <Badge variant="secondary" className="text-[10px] font-display tracking-widest uppercase">Used up</Badge>
                          ) : (
                            <span className="text-[10px] font-display tracking-widest uppercase text-accent flex-shrink-0">{remaining} left</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {used} / {total} session{total === 1 ? '' : 's'}{durLabel ? ` · ${durLabel}` : ''}
                        </p>
                        {methodLabel && (
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">{methodLabel}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                  Receipts for electronic payments are emailed by the processor. Need a copy or a billing fix?{' '}
                  <a href="mailto:support@levelcoach.com" className="text-accent hover:underline">Contact support</a>.
                </p>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {!isCoach && (
                  <Link to="/coaches" className="block">
                    <Button variant="ghost" className="w-full justify-start text-sm">
                      <CalendarIcon className="w-4 h-4 mr-2" /> Book a Session
                    </Button>
                  </Link>
                )}
                {!isCoach && progress.lastCoach && (
                  <Link to={`/book?coach_id=${progress.lastCoach.id}&county=${encodeURIComponent(progress.lastCoach.county || '')}`} className="block">
                    <Button variant="ghost" className="w-full justify-start text-sm">
                      <Repeat className="w-4 h-4 mr-2" /> Rebook with {progress.lastCoach.first_name}
                    </Button>
                  </Link>
                )}
                <Link to="/messages" className="block">
                  <Button variant="ghost" className="w-full justify-start text-sm">
                    <MessageSquare className="w-4 h-4 mr-2" /> Messages
                  </Button>
                </Link>
                <Link to="/settings" className="block">
                  <Button variant="ghost" className="w-full justify-start text-sm">
                    <Settings className="w-4 h-4 mr-2" /> Settings
                  </Button>
                </Link>
                <a href="mailto:support@levelcoach.com" className="block">
                  <Button variant="ghost" className="w-full justify-start text-sm">
                    <LifeBuoy className="w-4 h-4 mr-2" /> Contact Support
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Reschedule Modal */}
      <Dialog open={!!rescheduleSession} onOpenChange={(open) => { if (!open) setRescheduleSession(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold tracking-tight uppercase">Reschedule Session</DialogTitle>
            {rescheduleSession && (
              <DialogDescription>
                Pick a new date and time with {coaches[rescheduleSession.coach_id]?.first_name} {coaches[rescheduleSession.coach_id]?.last_name}. All times shown in ET.
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
                      const outside = isRescheduleTimeOutsideAvailability(time);
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
            <Button
              variant="outline"
              onClick={() => setRescheduleSession(null)}
              className="font-display tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={!rescheduleDate || !rescheduleTime || rescheduling}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
            >
              {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
