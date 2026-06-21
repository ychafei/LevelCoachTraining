import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Baby,
  CalendarDays,
  CreditCard,
  MessageSquareQuote,
  NotebookPen,
  Settings,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { greetingName } from '@/lib/displayName';
import { positionLabelFor, sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import { Reveal, isUpcomingSession, usd } from '@/features/athlete/portalShared';
import {
  getCompletionRate,
  getFeedbackSessions,
  getNextSession,
  getPrimaryGoal,
} from '@/features/athlete/athleteDashboardModel';
import { formatInTz, formatInstantInTz } from '@/lib/scheduleET';

// Sport pills with icon + (optional) position/level, rendered from real athlete
// profile data. Falls back gracefully while the profile is still loading.
function SportIdentity({ athlete }) {
  if (athlete.loading) {
    return <div className="h-7 w-52 animate-pulse rounded-full bg-blue-100" aria-hidden="true" />;
  }
  if (athlete.sports.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Add your sport in{' '}
        <Link to="/athlete/settings?section=sport" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
          settings
        </Link>{' '}
        to personalize your training.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Your sports">
      {athlete.sports.map((sport) => {
        const Icon = sportIconFor(sport);
        const position = positionLabelFor(sport, athlete.position);
        return (
          <Badge
            key={sport}
            variant="outline"
            className="gap-1.5 border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800"
          >
            <Icon className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            {sportDisplayName(sport)}
            {position && <span className="text-blue-600/70">· {position}</span>}
          </Badge>
        );
      })}
      {athlete.skillLevel && (
        <Badge variant="outline" className="border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          {athlete.skillLevel}
        </Badge>
      )}
    </div>
  );
}

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ icon: Icon, label, value, sub, loading, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }[tone] || 'bg-blue-50 text-blue-700 ring-blue-100';

  return (
    <div className="group flex min-h-[132px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-400 transition-colors group-hover:border-blue-200 group-hover:text-blue-600">
          <span className="sr-only">Open {label}</span>
          <span aria-hidden="true">›</span>
        </span>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-2 h-8 w-20 animate-pulse rounded bg-slate-100" aria-hidden="true" />
        ) : (
          <p className="mt-1 line-clamp-2 break-words text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
        )}
        {sub && !loading && <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// Warm welcome header + a hero row of real-data stat tiles. All metrics
// are derived from the live portal data hooks, never fabricated.
export default function AthletePortalHeader({
  user,
  athlete,
  sessionsData,
  creditsData,
  trainingData,
}) {
  const upcomingCount = useMemo(
    () => sessionsData.sessions.filter((s) => isUpcomingSession(s)).length,
    [sessionsData.sessions],
  );

  const nextSession = useMemo(() => getNextSession(sessionsData.sessions), [sessionsData.sessions]);

  const primaryGoal = useMemo(
    () => getPrimaryGoal(trainingData.goals),
    [trainingData.goals],
  );

  const activeGoals = useMemo(
    () => trainingData.goals.filter((g) => g.status !== 'archived' && g.status !== 'achieved').length,
    [trainingData.goals],
  );

  const homeworkDue = useMemo(
    () => trainingData.homework.filter((h) => h.status === 'assigned').length,
    [trainingData.homework],
  );

  const completion = useMemo(
    () => getCompletionRate(sessionsData.sessions),
    [sessionsData.sessions],
  );

  const feedbackCount = useMemo(
    () => getFeedbackSessions(sessionsData.sessions).length,
    [sessionsData.sessions],
  );

  return (
    <header>
      <Reveal className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(37,99,235,0.08),transparent_42%),repeating-linear-gradient(135deg,rgba(37,99,235,0.08)_0,rgba(37,99,235,0.08)_1px,transparent_1px,transparent_13px)]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-blue-50/80 to-transparent" aria-hidden="true" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Athlete portal</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-slate-950 sm:text-4xl">
              {greetingPrefix()}, {greetingName(user)}.
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
              Stay consistent. Keep improving. Your training, credits, feedback, and next steps are all pulled from live account data.
            </p>
            <div className="mt-4">
              <SportIdentity athlete={athlete} />
            </div>
          </div>

          <Link
            to="/athlete/settings"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </Reveal>

      {user?.is_minor === true && (
        <Reveal
          as="div"
          delay={0.05}
          className="mt-4 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4"
          role="note"
        >
          <Baby className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">Heads up:</span> because you&apos;re under 18, booking and
            payments run through your parent or guardian. You can still see your sessions, do your homework, check in,
            and track your progress right here.
          </p>
        </Reveal>
      )}

      <Reveal
        as="div"
        delay={0.1}
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <StatCard
          icon={CalendarDays}
          label="Upcoming sessions"
          value={upcomingCount}
          sub={nextSession ? `Next: ${formatInTz(nextSession.date, nextSession.start_time, nextSession.timezone)}` : 'Nothing booked yet'}
          loading={sessionsData.loading}
          tone="blue"
        />
        <StatCard
          icon={CreditCard}
          label="Credits remaining"
          value={usd(creditsData.remaining)}
          sub={creditsData.remaining === 0 ? 'Buy a package to book' : 'Transferable by value'}
          loading={creditsData.loading}
          tone={creditsData.remaining === 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon={Target}
          label="Current training goal"
          value={primaryGoal?.title || (activeGoals > 0 ? `${activeGoals} active` : 'No goal yet')}
          sub={primaryGoal?.target_date ? `Target: ${formatInstantInTz(primaryGoal.target_date, undefined, { hour: undefined, minute: undefined, timeZoneName: undefined })}` : 'Goals appear after your coach adds one'}
          loading={trainingData.loading}
          tone="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Session completion rate"
          value={completion.percent === null ? '—' : `${completion.percent}%`}
          sub={completion.total > 0 ? `This month · ${completion.completed} of ${completion.total} sessions` : 'Starts after completed sessions'}
          loading={sessionsData.loading}
          tone="violet"
        />
        <StatCard
          icon={feedbackCount > 0 ? MessageSquareQuote : NotebookPen}
          label="Coach feedback"
          value={feedbackCount}
          sub={homeworkDue > 0 ? `${homeworkDue} homework item${homeworkDue === 1 ? '' : 's'} due` : 'Shared notes appear here'}
          loading={sessionsData.loading || trainingData.loading}
          tone={feedbackCount > 0 ? 'blue' : 'amber'}
        />
      </Reveal>
    </header>
  );
}
