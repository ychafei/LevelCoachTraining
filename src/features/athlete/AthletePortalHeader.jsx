import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Baby,
  CalendarDays,
  CreditCard,
  NotebookPen,
  Settings,
  Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { greetingName } from '@/lib/displayName';
import { positionLabelFor, sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import { Reveal, StatTile, isUpcomingSession } from '@/features/athlete/portalShared';

// Sport pills with icon + (optional) position/level, rendered from real athlete
// profile data. Falls back gracefully while the profile is still loading.
function SportIdentity({ athlete }) {
  if (athlete.loading) {
    return <div className="h-7 w-52 animate-pulse rounded-full bg-white/15" aria-hidden="true" />;
  }
  if (athlete.sports.length === 0) {
    return (
      <p className="text-sm text-blue-100/80">
        Add your sport in{' '}
        <Link to="/athlete/settings?section=sport" className="font-semibold text-white underline-offset-2 hover:underline">
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
            className="gap-1.5 border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white"
          >
            <Icon className="h-3.5 w-3.5 text-blue-200" aria-hidden="true" />
            {sportDisplayName(sport)}
            {position && <span className="text-blue-100/70">· {position}</span>}
          </Badge>
        );
      })}
      {athlete.skillLevel && (
        <Badge variant="outline" className="border-white/20 px-3 py-1 text-xs text-blue-100/80">
          {athlete.skillLevel}
        </Badge>
      )}
    </div>
  );
}

// Warm welcome header + a hero row of real-data stat tiles. All four metrics
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

  const activeGoals = useMemo(
    () => trainingData.goals.filter((g) => g.status !== 'archived' && g.status !== 'achieved').length,
    [trainingData.goals],
  );

  const homeworkDue = useMemo(
    () => trainingData.homework.filter((h) => h.status === 'assigned').length,
    [trainingData.homework],
  );

  return (
    <header>
      <Reveal className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-[linear-gradient(135deg,#06142c_0%,#0e2a63_52%,#1d4ed8_100%)] px-5 py-6 shadow-lg sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-200">Athlete Portal</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Welcome, {greetingName(user)}
            </h1>
            <p className="mt-1.5 text-sm text-blue-100/80">
              Here&apos;s your training at a glance — every number below is live.
            </p>
            <div className="mt-4">
              <SportIdentity athlete={athlete} />
            </div>
          </div>

          <Link
            to="/athlete/settings"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatTile
          icon={CalendarDays}
          label="Upcoming sessions"
          value={upcomingCount}
          sub={upcomingCount === 0 ? 'Nothing booked yet' : 'On your calendar'}
          loading={sessionsData.loading}
          tone="accent"
        />
        <StatTile
          icon={CreditCard}
          label="Session credits"
          value={creditsData.remaining}
          sub={creditsData.remaining === 0 ? 'Buy a package to book' : 'Ready to use'}
          loading={creditsData.loading}
          tone={creditsData.remaining === 0 ? 'amber' : 'green'}
        />
        <StatTile
          icon={Target}
          label="Active goals"
          value={activeGoals}
          loading={trainingData.loading}
          tone="blue"
        />
        <StatTile
          icon={NotebookPen}
          label="Homework due"
          value={homeworkDue}
          sub={homeworkDue > 0 ? 'Tap to open training' : 'All caught up'}
          loading={trainingData.loading}
          tone={homeworkDue > 0 ? 'amber' : 'green'}
          action={homeworkDue > 0 ? 'Do it now' : undefined}
          href={homeworkDue > 0 ? '/athlete?tab=training' : undefined}
        />
      </Reveal>
    </header>
  );
}
