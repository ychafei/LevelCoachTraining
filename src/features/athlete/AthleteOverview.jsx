import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  ListChecks,
  MapPin,
  MessageSquareQuote,
  NotebookPen,
  PartyPopper,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { notificationRepo } from '@/api/repo';
import { formatInTz, formatInstantInTz, formatRangeInTz } from '@/lib/scheduleET';
import {
  EmptyState,
  SectionCard,
  SkeletonRows,
  coachDisplayName,
  coachLocationLabel,
  isUpcomingSession,
  sessionStartMs,
} from '@/features/athlete/portalShared';

function NextSessionCard({ sessions, coachesById, loading, onGoToSessions }) {
  const next = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((session) => isUpcomingSession(session, now))
      .sort((a, b) => (sessionStartMs(a) ?? 0) - (sessionStartMs(b) ?? 0))[0] || null;
  }, [sessions]);

  return (
    <SectionCard
      title="Next session"
      icon={CalendarDays}
      action={next && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-accent" onClick={onGoToSessions}>
          Manage <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    >
      {loading ? (
        <SkeletonRows rows={1} />
      ) : !next ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar yet"
          body="Book a session with a coach to get your next training on the schedule."
          cta={{ href: '/coaches', label: 'Find a coach' }}
          compact
        />
      ) : (
        <div>
          <p className="font-display text-xl font-bold tracking-tight text-foreground">
            {formatInTz(next.date, next.start_time, next.timezone)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {formatRangeInTz(next.date, next.start_time, next.duration_minutes, next.timezone)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {coachDisplayName(coachesById[next.coach_id])}
            </span>
            {coachLocationLabel(coachesById[next.coach_id]) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {coachLocationLabel(coachesById[next.coach_id])}
              </span>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function CreditsCard({ credits, remaining, loading }) {
  return (
    <SectionCard title="Session credits" icon={CreditCard}>
      {loading ? (
        <SkeletonRows rows={1} />
      ) : credits.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No session credits yet"
          body="Purchase a training package to start booking sessions."
          cta={{ href: '/book', label: 'Buy sessions' }}
          compact
        />
      ) : (
        <div>
          <p className="font-display text-3xl font-bold text-foreground">
            {remaining}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              session{remaining === 1 ? '' : 's'} remaining
            </span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {credits.slice(0, 4).map((credit) => {
              const left = Math.max(0, (Number(credit.total_credits) || 0) - (Number(credit.used_credits) || 0));
              return (
                <li key={credit.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{credit.package_name || 'Training package'}</span>
                  <span className="shrink-0 font-semibold text-foreground">{left} left</span>
                </li>
              );
            })}
          </ul>
          <Button asChild size="sm" variant="outline" className="mt-4 h-8 text-xs">
            <Link to="/book">Buy more sessions</Link>
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function NotificationsCard({ user }) {
  const queryClient = useQueryClient();
  const [markingAll, setMarkingAll] = useState(false);
  const query = useQuery({
    queryKey: ['portal', 'notifications', user?.id],
    enabled: !!user?.id,
    queryFn: () => notificationRepo.listMine(user.id),
  });

  const notifications = query.data || [];
  const unread = notifications.filter((n) => !n.read);

  const markRead = async (notification) => {
    try {
      await notificationRepo.markRead(notification.id);
      queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    } catch (err) {
      toast.error(err?.message || 'Could not mark this notification as read.');
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await Promise.all(unread.map((n) => notificationRepo.markRead(n.id)));
      queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    } catch (err) {
      toast.error(err?.message || 'Could not mark notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <SectionCard
      title={`Notifications${unread.length > 0 ? ` (${unread.length} unread)` : ''}`}
      icon={Bell}
      action={unread.length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-accent" disabled={markingAll} onClick={markAllRead}>
          {markingAll ? 'Marking…' : 'Mark all read'}
        </Button>
      )}
    >
      {query.isLoading ? (
        <SkeletonRows rows={2} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="You're all caught up"
          body="Booking confirmations, cancellations, and coach updates will appear here."
          compact
        />
      ) : (
        <ul className="space-y-2">
          {notifications.slice(0, 6).map((notification) => (
            <li
              key={notification.id}
              className={`flex items-start justify-between gap-3 rounded-md border p-3 ${notification.read ? 'border-border bg-background/30' : 'border-accent/30 bg-accent/5'}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{notification.title || 'Update'}</p>
                {(notification.body || notification.message) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.body || notification.message}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {formatInstantInTz(notification.created_date)}
                </p>
              </div>
              {!notification.read && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs text-accent"
                  onClick={() => markRead(notification)}
                  aria-label={`Mark "${notification.title || 'notification'}" as read`}
                >
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function FeedbackCard({ sessions, coachesById, loading }) {
  const feedback = useMemo(() => (
    sessions
      .filter((session) => session.client_visible_notes)
      .sort((a, b) => (sessionStartMs(b) ?? 0) - (sessionStartMs(a) ?? 0))
      .slice(0, 3)
  ), [sessions]);

  return (
    <SectionCard title="Recent coach feedback" icon={MessageSquareQuote}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : feedback.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No feedback yet"
          body="After sessions, notes your coach shares with you will show up here."
          compact
        />
      ) : (
        <ul className="space-y-3">
          {feedback.map((session) => (
            <li key={session.id} className="rounded-md border border-border bg-background/40 p-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{session.client_visible_notes}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {coachDisplayName(coachesById[session.coach_id])} · {formatInTz(session.date, session.start_time, session.timezone, { hour: undefined, minute: undefined, timeZoneName: undefined })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// "What should I do next?" — every action below is derived from real state.
function buildActions({ legalStatus, remaining, creditsLoaded, homework, sessions, reviewedSessionIds, goTab }) {
  const actions = [];

  if (!legalStatus.loading && legalStatus.hasTemplates && !legalStatus.complete) {
    actions.push({
      key: 'legal',
      icon: ShieldCheck,
      title: 'Sign your required documents',
      body: `${legalStatus.missing.length} document${legalStatus.missing.length === 1 ? '' : 's'} still need your signature before you can book.`,
      onClick: () => goTab('documents'),
      label: 'Go to documents',
    });
  }

  const dueHomework = homework
    .filter((h) => h.status === 'assigned')
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  if (dueHomework.length > 0) {
    actions.push({
      key: 'homework',
      icon: NotebookPen,
      title: `Finish your homework (${dueHomework.length} open)`,
      body: dueHomework[0].due_date
        ? `"${dueHomework[0].title}" is due ${formatInstantInTz(dueHomework[0].due_date, undefined, { hour: undefined, minute: undefined, timeZoneName: undefined })}.`
        : `"${dueHomework[0].title}" is waiting on you.`,
      onClick: () => goTab('training'),
      label: 'Open training',
    });
  }

  const hasUpcoming = sessions.some((session) => isUpcomingSession(session));
  if (creditsLoaded && remaining === 0) {
    actions.push({
      key: 'credits',
      icon: CreditCard,
      title: 'Get session credits',
      body: 'You have no remaining credits. Browse coaches or buy a package to keep training.',
      href: '/coaches',
      label: 'Browse coaches',
    });
  } else if (creditsLoaded && remaining > 0 && !hasUpcoming) {
    actions.push({
      key: 'book',
      icon: CalendarDays,
      title: 'Book your next session',
      body: `You have ${remaining} credit${remaining === 1 ? '' : 's'} ready to use — get the next session on the calendar.`,
      href: '/book',
      label: 'Book now',
    });
  }

  const unreviewed = sessions.filter(
    (session) => session.status === 'completed' && !reviewedSessionIds.has(session.id),
  );
  if (unreviewed.length > 0) {
    actions.push({
      key: 'review',
      icon: Star,
      title: 'Review your last session',
      body: 'Leaving a quick rating helps your coach and other athletes.',
      onClick: () => goTab('sessions'),
      label: 'Leave a review',
    });
  }

  return actions;
}

function NextActionsCard({ actions, loading }) {
  return (
    <SectionCard title="Recommended next steps" icon={ListChecks}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : actions.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-green-500/20 bg-green-500/10 p-4">
          <PartyPopper className="h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />
          <p className="text-sm text-foreground">You&apos;re all set — documents signed, sessions booked, homework done. Keep it up!</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
              <div className="flex min-w-0 items-start gap-3">
                <action.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.body}</p>
                </div>
              </div>
              {action.href ? (
                <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs">
                  <Link to={action.href}>{action.label}</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={action.onClick}>
                  {action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default function AthleteOverview({
  user,
  sessionsData,
  creditsData,
  trainingData,
  reviewedSessionIds,
  legalStatus,
  goTab,
}) {
  const actions = buildActions({
    legalStatus,
    remaining: creditsData.remaining,
    creditsLoaded: !creditsData.loading,
    homework: trainingData.homework,
    sessions: sessionsData.sessions,
    reviewedSessionIds,
    goTab,
  });

  const actionsLoading = sessionsData.loading || creditsData.loading || legalStatus.loading;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NextSessionCard
        sessions={sessionsData.sessions}
        coachesById={sessionsData.coachesById}
        loading={sessionsData.loading}
        onGoToSessions={() => goTab('sessions')}
      />
      <CreditsCard credits={creditsData.credits} remaining={creditsData.remaining} loading={creditsData.loading} />
      <NextActionsCard actions={actions} loading={actionsLoading} />
      <NotificationsCard user={user} />
      <div className="lg:col-span-2">
        <FeedbackCard
          sessions={sessionsData.sessions}
          coachesById={sessionsData.coachesById}
          loading={sessionsData.loading}
        />
      </div>
      {!actionsLoading && legalStatus.complete && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground lg:col-span-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
          Your athlete legal packet is signed and current.
        </p>
      )}
    </div>
  );
}
