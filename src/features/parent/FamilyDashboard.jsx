import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CreditCard,
  FilePenLine,
  Phone,
  ShieldCheck,
  Users,
  UserPlus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sessionCreditRepo } from '@/api/repo';
import { formatInTz } from '@/lib/scheduleET';
import { sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import ChildForm from '@/features/parent/ChildForm';
import {
  EmptyState,
  SectionCard,
  SessionStatusBadge,
  SkeletonRows,
  ageFromDob,
  coachDisplayName,
  isUpcomingSession,
  parseJsonObject,
  sessionStartMs,
  usd,
} from '@/features/athlete/portalShared';
import { creditRemainingCents } from '@/features/athlete/useAthletePortalData';

const EASE = [0.16, 1, 0.3, 1];

// Animated reveal that collapses to a no-op under prefers-reduced-motion.
function Reveal({ children, delay = 0, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

function StatTile({ icon: Icon, label, value, sub, tone = 'accent', delay = 0 }) {
  const toneRing = tone === 'warning'
    ? 'bg-yellow-500/10 text-yellow-600'
    : 'bg-accent/10 text-accent';
  return (
    <Reveal delay={delay}>
      <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneRing}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold leading-tight text-muted-foreground">{label}</p>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </Reveal>
  );
}

function useFamilyCredits(user) {
  const query = useQuery({
    queryKey: ['portal', 'credits', user?.id],
    enabled: !!user?.id,
    queryFn: () => sessionCreditRepo.list('-created_date').catch(() => []),
  });
  const credits = query.data || [];
  const remaining = credits.reduce((sum, c) => sum + creditRemainingCents(c), 0);
  return { remaining, loading: query.isLoading && !!user?.id };
}

function ChildCard({ child, link, nextSession, coachesById, onView, onEdit }) {
  const age = ageFromDob(child.dob);
  const sports = Array.isArray(child.sports) ? child.sports : [];
  const contact = parseJsonObject(child.emergency_contact);
  const hasEmergency = !!(contact && (contact.name || contact.phone));

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onView(child)}
          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          <h3 className="truncate text-base font-bold tracking-[-0.01em] text-foreground">
            {[child.first_name, child.last_name].filter(Boolean).join(' ') || 'Athlete'}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {age !== null ? `${age} years old` : 'Age not set'}
            {child.skill_level && ` · ${child.skill_level}`}
          </p>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs text-accent"
          onClick={() => onEdit(child)}
        >
          Edit
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {sports.length === 0 ? (
          <span className="text-xs text-muted-foreground">No sports yet</span>
        ) : (
          sports.slice(0, 4).map((sport) => {
            const Icon = sportIconFor(sport);
            return (
              <Badge key={sport} variant="outline" className="gap-1 border-accent/40 bg-accent/5 text-[11px] text-foreground">
                <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
                {sportDisplayName(sport)}
              </Badge>
            );
          })
        )}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-background/40 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <CalendarDays className="h-3 w-3 text-accent" aria-hidden="true" /> Next session
        </p>
        {nextSession ? (
          <p className="mt-1 text-xs text-foreground">
            {formatInTz(nextSession.date, nextSession.start_time, nextSession.timezone, { timeZoneName: undefined })}
            <span className="block text-muted-foreground">
              with {coachDisplayName(coachesById[nextSession.coach_id])}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No sessions booked yet.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
          hasEmergency
            ? 'border-green-500/30 bg-green-500/10 text-green-600'
            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600'
        }`}
        >
          <Phone className="h-2.5 w-2.5" aria-hidden="true" />
          {hasEmergency ? 'Emergency info set' : 'Add emergency info'}
        </span>
        {link && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-muted-foreground">
            <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
            {[link.can_book !== false && 'Book', link.can_pay !== false && 'Pay', link.can_message !== false && 'Message']
              .filter(Boolean).join(' · ') || 'No permissions'}
          </span>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="mt-3 h-8 w-full justify-between text-xs"
        onClick={() => onView(child)}
      >
        Open athlete
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </article>
  );
}

// Family command center: stat tiles, an upcoming feed across every child, and
// per-child cards. All figures come from real data passed in by the portal.
export default function FamilyDashboard({
  family,
  sessionsData,
  user,
  guardianLegal,
  onViewChild,
  onGoTab,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const credits = useFamilyCredits(user);

  const openAdd = () => { setEditingChild(null); setFormOpen(true); };
  const openEdit = (child) => { setEditingChild(child); setFormOpen(true); };

  // Upcoming, sorted, across every linked athlete (and the guardian's own).
  const upcoming = useMemo(() => (sessionsData.sessions || [])
    .filter((s) => isUpcomingSession(s))
    .sort((a, b) => (sessionStartMs(a) || 0) - (sessionStartMs(b) || 0)), [sessionsData.sessions]);

  // Soonest upcoming session per child for the per-child cards.
  const nextByChild = useMemo(() => {
    const map = {};
    for (const session of upcoming) {
      const id = session.athlete_id;
      if (id && !map[id]) map[id] = session;
    }
    return map;
  }, [upcoming]);

  const childCount = family.children.length;
  const docsTone = guardianLegal.childrenNeedingDocs > 0 ? 'warning' : 'accent';

  if (family.loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary/50" aria-hidden="true" />
          ))}
        </div>
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (family.error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {family.error?.message || 'Could not load your family right now.'}
      </p>
    );
  }

  if (childCount === 0) {
    return (
      <SectionCard
        title="Your family"
        icon={Users}
        description="Add your first athlete to unlock sessions, training, documents, and monitored messaging."
      >
        <EmptyState
          icon={UserPlus}
          title="Let's set up your family"
          body="Add your child to manage their training, sign their documents, and book sessions on their behalf — all in one safe place."
          cta={{ onClick: openAdd, label: 'Add your first child' }}
        />
        <ChildForm open={formOpen} onOpenChange={setFormOpen} child={editingChild} onSaved={family.refresh} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Athletes in your family"
          value={childCount}
          sub={childCount === 1 ? '1 child' : `${childCount} children`}
          delay={0}
        />
        <StatTile
          icon={CalendarDays}
          label="Upcoming sessions"
          value={sessionsData.loading ? '…' : upcoming.length}
          sub="Across all your athletes"
          delay={0.05}
        />
        <StatTile
          icon={CreditCard}
          label="Credit balance"
          value={credits.loading ? '…' : usd(credits.remaining)}
          sub={credits.remaining === 0 ? 'Buy a package to book' : 'Ready to book'}
          delay={0.1}
        />
        <StatTile
          icon={FilePenLine}
          label="Documents to sign"
          value={guardianLegal.loading || !guardianLegal.known ? '…' : guardianLegal.childrenNeedingDocs}
          sub={guardianLegal.known
            ? (guardianLegal.childrenNeedingDocs > 0 ? 'Child packets need attention' : 'All packets complete')
            : 'Checking your packets'}
          tone={docsTone}
          delay={0.15}
        />
      </div>

      {/* Documents call-to-action when something needs signing */}
      {guardianLegal.known && guardianLegal.childrenNeedingDocs > 0 && (
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
            <div className="flex items-start gap-3">
              <FilePenLine className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {guardianLegal.childrenNeedingDocs === 1
                    ? 'One athlete still needs their guardian packet signed'
                    : `${guardianLegal.childrenNeedingDocs} athletes still need their guardian packets signed`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Booking unlocks once each child&apos;s required documents are signed.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90"
              onClick={() => onGoTab('documents')}
            >
              Sign documents
            </Button>
          </div>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Per-child cards */}
        <Reveal delay={0.05}>
          <SectionCard
            title="Your athletes"
            icon={Users}
            action={(
              <Button size="sm" onClick={openAdd} className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90">
                <UserPlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add child
              </Button>
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {family.children.map((child) => (
                <ChildCard
                  key={child.id}
                  child={child}
                  link={family.linkByAthleteId[child.id] || null}
                  nextSession={nextByChild[child.id] || null}
                  coachesById={sessionsData.coachesById}
                  onView={onViewChild}
                  onEdit={openEdit}
                />
              ))}
            </div>
          </SectionCard>
        </Reveal>

        {/* Upcoming feed across all children */}
        <Reveal delay={0.1}>
          <SectionCard
            title="What's next"
            icon={CalendarDays}
            description="Every athlete's upcoming sessions, in each session's own timezone."
            action={(
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-accent"
                onClick={() => onGoTab('calendar')}
              >
                Calendar <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          >
            {sessionsData.loading ? (
              <SkeletonRows rows={3} />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing on the calendar yet"
                body="Book a session with a coach and it will show up here for the whole family."
                cta={{ href: '/coaches', label: 'Find a coach' }}
                compact
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 6).map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {family.childNamesById[session.athlete_id] || session.client_name || 'You'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatInTz(session.date, session.start_time, session.timezone)}
                        {' · '}
                        {coachDisplayName(sessionsData.coachesById[session.coach_id])}
                      </p>
                    </div>
                    <SessionStatusBadge status={session.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </Reveal>
      </div>

      <ChildForm open={formOpen} onOpenChange={setFormOpen} child={editingChild} onSaved={family.refresh} />
    </div>
  );
}
