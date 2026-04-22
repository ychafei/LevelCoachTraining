import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, MessageSquare, Settings, Shield, Clock, CheckCircle2, XCircle, Zap, CalendarClock, AlertTriangle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay, parseISO, isBefore, isWithinInterval } from 'date-fns';
import PaymentHandles from '@/components/shared/PaymentHandles';
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
          allSessions = await base44.entities.Session.filter({ coach_id: user.coach_id }, '-date');
        } else {
          allSessions = await base44.entities.Session.filter({ client_email: user.email }, '-date');
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
            await Promise.all(overdue.map(s => base44.entities.Session.update(s.id, { status: 'completed' })));
            overdue.forEach(s => { s.status = 'completed'; });
          }
          try { localStorage.setItem(todayKey, '1'); } catch {}
        }

        if (cancelled) return;
        setSessions(allSessions);

        const coachList = await base44.entities.Coach.list();
        if (cancelled) return;
        const map = {};
        coachList.forEach(c => { map[c.id] = c; });
        setCoaches(map);

        const userCredits = await base44.entities.SessionCredit.filter({ client_email: user.email });
        if (cancelled) return;
        setCredits(userCredits);

        // Targeted unread count — only my conversations and their messages.
        // NOTE: Base44 SDK doesn't expose an OR filter on arrays, so we fetch
        // conversations where I'm a participant by scanning; see risks section.
        const convos = await base44.entities.Conversation.filter({});
        const myConvos = convos.filter(c => c.participant_emails?.includes(user.email));
        let unread = 0;
        if (myConvos.length > 0) {
          // One query per conversation is bounded by myConvos.length, usually small.
          const msgBatches = await Promise.all(
            myConvos.map(c => base44.entities.Message.filter({ conversation_id: c.id }))
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

    await base44.entities.Session.update(session.id, { status: 'cancelled', cancellation_reason: `Cancelled by ${cancelledBy}` });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'cancelled' } : s));

    let creditRefunded = false;
    // Refund 1 credit if not a late cancel and session is linked to a credit record
    if (!isLateCancel && session.credit_id) {
      const clientEmail = isCoach ? session.client_email : user.email;
      let creditToRefund = null;

      // If the session has a credit_id, refund to that specific credit record
      if (session.credit_id) {
        const clientCredits = await base44.entities.SessionCredit.filter({ client_email: clientEmail });
        creditToRefund = clientCredits.find(c => c.id === session.credit_id && c.used_credits > 0);
      }

      // Fallback: find the most recently used credit record
      if (!creditToRefund) {
        const clientCredits = await base44.entities.SessionCredit.filter({ client_email: clientEmail });
        creditToRefund = clientCredits
          .filter(c => c.used_credits > 0)
          .sort((a, b) => b.used_credits - a.used_credits)[0];
      }

      if (creditToRefund) {
        await base44.entities.SessionCredit.update(creditToRefund.id, {
          used_credits: Math.max(0, creditToRefund.used_credits - 1)
        });
        creditRefunded = true;
      }

      // Refresh credits display for clients
      if (!isCoach) {
        const updated = await base44.entities.SessionCredit.filter({ client_email: user.email });
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
      emails.push(base44.integrations.Core.SendEmail({
        to: session.client_email,
        subject: `Session Cancelled — ${dateLabel}`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #D4A843;">Session Cancelled</h2>
            <p>Hi ${clientFullName},</p>
            <p>Your ${durLabel} session with <strong>${coachFullName}</strong> on <strong>${dateLabel}</strong> (${timeRange}) has been successfully cancelled.</p>
            ${creditRefunded
              ? `<p style="padding:12px; background:#1f3a1f; border-left:4px solid #4ade80; color:#e5e7eb;"><strong>Good news:</strong> Your session credit has been returned to your account. You can reschedule whenever you're ready.</p>`
              : (isLateCancel
                  ? `<p style="padding:12px; background:#3a1f1f; border-left:4px solid #f87171; color:#e5e7eb;"><strong>Please note:</strong> This cancellation was within the 24-hour window, so no session credit was returned. Contact support if you believe this is an exception.</p>`
                  : `<p>No credit was returned for this session.</p>`)
            }
            <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#D4A843; color:#000; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">Go to Dashboard</a></p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">LC Training — Private Soccer Coaching<br/>${window.location.origin}</p>
          </div>
        `,
      }));

      // Coach email
      if (coach?.email) {
        emails.push(base44.integrations.Core.SendEmail({
          to: coach.email,
          subject: `Session Cancelled — ${clientFullName} on ${dateLabel}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #D4A843;">Session Cancelled</h2>
              <p>Hi ${coach.first_name},</p>
              <p>The ${durLabel} session with <strong>${clientFullName}</strong> on <strong>${dateLabel}</strong> (${timeRange}) in ${session.county} County was cancelled by ${cancelledByLabel}.</p>
              ${creditRefunded
                ? `<p>The client's session credit has been returned automatically.</p>`
                : (isLateCancel ? `<p>This was a late cancellation (within 24 hours) — no credit was returned to the client.</p>` : '')
              }
              <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#D4A843; color:#000; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Dashboard</a></p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">LC Training — Coach Portal<br/>${window.location.origin}</p>
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
    const res = await base44.functions.invoke('getCoachAvailability', { coach_id: session.coach_id });
    setRescheduleBlocks(res.data.blocks || []);
    setRescheduleExistingSessions(res.data.sessions || []);
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleSession || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    const oldDate = rescheduleSession.date;
    const oldTime = rescheduleSession.start_time;
    const newDate = format(rescheduleDate, 'yyyy-MM-dd');
    await base44.entities.Session.update(rescheduleSession.id, {
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
      emails.push(base44.integrations.Core.SendEmail({
        to: rescheduleSession.client_email,
        subject: `Session Rescheduled — ${formatLongDateET(newDate)}`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #D4A843;">Session Rescheduled</h2>
            <p>Hi ${clientFullName},</p>
            <p>Your ${durLabel} session with <strong>${coachFullName}</strong> has been successfully rescheduled.</p>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
              <tr>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; width:40%;"><strong>Previous:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; text-decoration:line-through; color:#888;">${oldWhen}</td>
              </tr>
              <tr>
                <td style="padding:10px; border:1px solid #ddd;"><strong>New:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; color:#D4A843;"><strong>${newWhen}</strong></td>
              </tr>
              <tr>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;"><strong>Location:</strong></td>
                <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;">${rescheduleSession.county} County</td>
              </tr>
            </table>
            <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#D4A843; color:#000; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Session</a></p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">LC Training — Private Soccer Coaching<br/>${window.location.origin}</p>
          </div>
        `,
      }));

      // Coach email
      if (coach?.email) {
        emails.push(base44.integrations.Core.SendEmail({
          to: coach.email,
          subject: `Session Rescheduled — ${clientFullName}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #D4A843;">Session Rescheduled</h2>
              <p>Hi ${coach.first_name},</p>
              <p><strong>${clientFullName}</strong> has rescheduled their ${durLabel} session.</p>
              <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; width:40%;"><strong>Previous:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8; text-decoration:line-through; color:#888;">${oldWhen}</td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #ddd;"><strong>New:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; color:#D4A843;"><strong>${newWhen}</strong></td>
                </tr>
                <tr>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;"><strong>County:</strong></td>
                  <td style="padding:10px; border:1px solid #ddd; background:#f8f8f8;">${rescheduleSession.county}</td>
                </tr>
              </table>
              <p style="margin-top:20px;"><a href="${window.location.origin}/dashboard" style="background:#D4A843; color:#000; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">View Dashboard</a></p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">LC Training — Coach Portal<br/>${window.location.origin}</p>
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

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  const upcoming = sessions.filter(s => s.status === 'pending' || s.status === 'confirmed');
  const past = sessions.filter(s => s.status === 'completed' || s.status === 'cancelled');

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
            <h1 className="font-oswald text-4xl font-bold tracking-tight text-foreground">DASHBOARD</h1>
            <p className="text-muted-foreground mt-1">
              {isCoach ? 'Manage your coaching sessions' : 'Track your training sessions'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/messages">
              <Button variant="outline" className="font-oswald tracking-wider uppercase text-xs relative">
                <MessageSquare className="w-4 h-4 mr-2" /> Messages
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="font-oswald tracking-wider uppercase text-xs">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                  <Shield className="w-4 h-4 mr-2" /> Admin Panel
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Available Sessions (clients only) */}
        {!isCoach && (() => {
          const activeCredits = credits.filter(c => (c.total_credits - c.used_credits) > 0);
          if (activeCredits.length === 0) return null;
          return (
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
                        <p className="font-oswald text-lg font-bold text-foreground tracking-wider">
                          {credit.package_name || 'Session'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {remaining} of {credit.total_credits} session{credit.total_credits !== 1 ? 's' : ''} remaining{durationLabel ? ` · ${durationLabel}` : ''}
                        </p>
                      </div>
                    </div>
                    <Link to={`/book?credit_id=${credit.id}`}>
                      <Button className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90 whitespace-nowrap">
                        Schedule {credit.package_name || ''} Session
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Upcoming', value: upcoming.length, icon: CalendarIcon },
            { label: 'Total Sessions', value: sessions.length, icon: Clock },
            { label: 'Role', value: user?.role?.toUpperCase() || 'USER', icon: Shield },
            { label: 'Unread', value: unreadCount, icon: MessageSquare },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-accent" />
                <span className="text-xs font-oswald tracking-widest uppercase text-muted-foreground">{label}</span>
              </div>
              <span className="font-oswald text-2xl font-bold">{value}</span>
            </div>
          ))}
        </div>

        {/* Coach setup prompt */}
        {isCoach && user?.coach_id && !user?.profile_setup_complete && (
          <Link to="/coach-setup" className="block mb-8 p-4 bg-accent/10 border border-accent/20 rounded-lg hover:bg-accent/15 transition-colors">
            <p className="text-accent font-oswald tracking-wider uppercase text-sm">Complete Your Coach Profile →</p>
            <p className="text-xs text-muted-foreground mt-1">Set up your availability, payment handles, and bio.</p>
          </Link>
        )}

        {/* New user welcome prompt */}
        {!isCoach && !isAdmin && sessions.length === 0 && credits.length === 0 && (
          <div className="mb-8 p-5 bg-primary/10 border border-primary/20 rounded-lg">
            <h3 className="font-oswald text-lg font-bold tracking-wider text-foreground mb-1">WELCOME TO LC TRAINING!</h3>
            <p className="text-sm text-muted-foreground mb-4">You're all set. Here's what you can do to get started:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/book">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-oswald tracking-wider text-sm text-foreground">Book a Session</p>
                  <p className="text-xs text-muted-foreground mt-1">Choose a package and pick your coach.</p>
                </div>
              </Link>
              <Link to="/settings">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-oswald tracking-wider text-sm text-foreground">Complete Your Profile</p>
                  <p className="text-xs text-muted-foreground mt-1">Add your info and preferences.</p>
                </div>
              </Link>
              <Link to="/matching">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors cursor-pointer">
                  <p className="font-oswald tracking-wider text-sm text-foreground">Find a Training Partner</p>
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
              <h2 className="font-oswald text-xl font-bold tracking-wider text-foreground mb-4">UPCOMING SESSIONS</h2>
              {upcoming.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <CalendarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming sessions.</p>
                  {!isCoach && (
                    <Link to="/book">
                      <Button className="mt-4 bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                        Book a Session
                      </Button>
                    </Link>
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
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-oswald text-lg font-bold tracking-wider">
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
                              <p className="text-sm text-muted-foreground mt-1">Coach: {coach.first_name} {coach.last_name}</p>
                            ) : null}
                            {!isCoach && session.payment_method && (
                              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-oswald tracking-wide uppercase ${
                                session.payment_method === 'cash' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                session.payment_method === 'credits' ? 'bg-primary/10 text-primary border border-primary/20' :
                                'bg-green-500/10 text-green-400 border border-green-500/20'
                              }`}>
                                {session.payment_method === 'cash' ? '💵 Cash' : session.payment_method === 'credits' ? '⚡ Credits' : '💳 Electronic'}
                              </span>
                            )}
                            {session.payment_method === 'cash' && session.payment_status === 'unpaid' && (
                              <div className="mt-2 flex items-start gap-2 text-xs text-yellow-400/90 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>
                                  Cash is paid directly to your coach at the session.
                                  {session.total_price ? <> Bring <strong>${session.total_price}</strong>.</> : null}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${sc?.color} border`}>
                              <Icon className="w-3 h-3 mr-1" />{sc?.label}
                            </Badge>
                            {session.payment_status === 'unpaid' && session.payment_method === 'cash' && (
                              <Badge className="bg-accent/10 text-accent border-accent/20 border">Unpaid</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          {isCoach && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancel(session)}
                                className="font-oswald tracking-wider uppercase text-xs text-destructive hover:text-destructive"
                              >
                                Cancel
                              </Button>
                              {session.payment_method === 'cash' && session.payment_status === 'unpaid' && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    await base44.entities.Session.update(session.id, { payment_status: 'paid' });
                                    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, payment_status: 'paid' } : s));
                                  }}
                                  className="bg-green-600 text-white font-oswald tracking-wider uppercase text-xs hover:bg-green-700"
                                >
                                  Confirm Cash
                                </Button>
                              )}
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
                                      className="font-oswald tracking-wider uppercase text-xs"
                                    >
                                      <CalendarClock className="w-3 h-3 mr-1" /> Reschedule
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCancel(session)}
                                    className="font-oswald tracking-wider uppercase text-xs text-destructive hover:text-destructive"
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
                <h2 className="font-oswald text-xl font-bold tracking-wider text-foreground mb-4">PAST SESSIONS</h2>
                <div className="space-y-3">
                  {past.slice(0, 10).map(session => {
                    const coach = coaches[session.coach_id];
                    const sc = statusConfig[session.status];
                    return (
                      <div key={session.id} className="bg-card border border-border rounded-lg p-4 opacity-75">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-oswald tracking-wider text-sm">
                               {format(new Date(session.date + 'T00:00:00'), 'MMM d, yyyy')} · {formatTimeET(session.date, session.start_time)} · {session.duration_minutes} min
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isCoach ? session.client_name : coach ? `${coach.first_name} ${coach.last_name}` : ''}
                            </p>
                            {session.cancellation_reason && (
                              <p className="text-xs text-destructive mt-1">Reason: {session.cancellation_reason}</p>
                            )}
                          </div>
                          <Badge className={`${sc?.color} border`}>{sc?.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Coach payment handles (for coaches) */}
            {isCoach && user?.coach_id && coaches[user.coach_id] && (
              <PaymentHandles coach={coaches[user.coach_id]} />
            )}

            {/* Quick actions */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-oswald text-sm font-bold tracking-widest uppercase text-muted-foreground mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {!isCoach && (
                  <Link to="/book" className="block">
                    <Button variant="ghost" className="w-full justify-start text-sm">
                      <CalendarIcon className="w-4 h-4 mr-2" /> Book a Session
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
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Reschedule Modal */}
      <Dialog open={!!rescheduleSession} onOpenChange={(open) => { if (!open) setRescheduleSession(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-oswald text-2xl font-bold tracking-tight uppercase">Reschedule Session</DialogTitle>
            {rescheduleSession && (
              <DialogDescription>
                Pick a new date and time with {coaches[rescheduleSession.coach_id]?.first_name} {coaches[rescheduleSession.coach_id]?.last_name}. All times shown in ET.
              </DialogDescription>
            )}
          </DialogHeader>

          {rescheduleSession && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pick a Date</p>
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
                  <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">Pick a Time (ET)</p>
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
                          className={`p-2 rounded-md border text-xs font-oswald tracking-wide transition-all ${
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
              className="font-oswald tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={!rescheduleDate || !rescheduleTime || rescheduling}
              className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
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