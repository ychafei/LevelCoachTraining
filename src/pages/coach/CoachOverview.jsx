import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  MessageSquare,
  Star,
  AlertTriangle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  coachReviewRepo,
  coachSportProfileRepo,
  conversationRepo,
  legalAgreementRepo,
  legalTemplateRepo,
  reportsRepo,
  sessionRepo,
  stripeConnectedAccountRepo,
} from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { formatCents, formatMonthLabel } from '@/features/coach/money';
import OnboardingChecklist from '@/components/coach-portal/OnboardingChecklist';
import PendingOrgInvites from '@/features/coach/PendingOrgInvites';
import { connectStatusLabel } from '@/features/coach/StripeConnectPanel';
import { formatInTz, formatInstantInTz } from '@/lib/scheduleET';
import { cn } from '@/lib/utils';

// Display-only labels for the upcoming-session status pill.
const UPCOMING_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
};

function todayInTz(timezone = 'America/Detroit') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function monthPrefix() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(new Date());
}

function Card({ className, children, ...props }) {
  return (
    <section {...props} className={cn('rounded-lg border border-border bg-card', className)}>
      {children}
    </section>
  );
}

function SectionHeader({ title, action, href }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-base font-bold tracking-[-0.01em] text-foreground">{title}</h2>
      {action && href && (
        <Link to={href} className="text-sm font-semibold text-accent hover:underline">
          {action}
        </Link>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, href, action, icon: Icon, loading = false }) {
  return (
    <Card className="flex flex-col justify-between p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold leading-snug text-foreground">{label}</p>
      </div>
      <div className="mt-4">
        {loading ? (
          <div role="status" aria-label="Loading">
            <div className="h-8 w-16 animate-pulse rounded bg-secondary/60" />
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
          <>
            <p className="font-display text-2xl font-extrabold text-foreground truncate">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>}
            {href && action && (
              <Link to={href} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
                {action}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function RatingStars({ rating }) {
  const rounded = Math.round(Number(rating) || 0);
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn('h-4 w-4', star <= rounded ? 'fill-current' : 'text-muted-foreground/30')} aria-hidden="true" />
      ))}
    </span>
  );
}

function SkeletonRows({ count = 3 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/70" />
      ))}
    </div>
  );
}

// Mirrors the server's legal-packet check closely enough for checklist display:
// active required coach templates each matched by a signed agreement.
function legalPacketComplete(templates, agreements, coachId) {
  const now = Date.now();
  const active = (templates || []).filter((t) => {
    if (!t.required) return false;
    if (t.retired_at && new Date(t.retired_at).getTime() <= now) return false;
    if (t.effective_at && new Date(t.effective_at).getTime() > now) return false;
    return true;
  });
  if (active.length === 0) return null; // unknown — don't fabricate a verdict
  return active.every((t) => (agreements || []).some((a) =>
    a.status === 'signed'
    && (!a.coach_id || a.coach_id === coachId)
    && (a.template_id === t.id
      || (a.template_key === t.template_key && a.template_version === t.version))
  ));
}

function listComplete(value) {
  return Array.isArray(value) && value.some((item) => String(item || '').trim());
}

function sportProfileComplete(row) {
  return listComplete(row?.specialties) && listComplete(row?.levels) && listComplete(row?.session_types);
}

export default function CoachOverview() {
  const { user, isAdmin } = useAuth();
  const { coach, loading: coachLoading, reload: reloadCoach } = useMyCoach();

  const [sessions, setSessions] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [connectAccount, setConnectAccount] = useState(null);
  const [hasSportProfiles, setHasSportProfiles] = useState(false);
  const [legalSigned, setLegalSigned] = useState(null);

  const coachId = coach?.id || '';

  const loadAll = useCallback(async () => {
    if (!coachId) return;
    const [ssns, earn, revs, convos, connectRows, sportRows, templates, agreements] = await Promise.all([
      sessionRepo.filter({ coach_id: coachId }, '-date').catch(() => []),
      reportsRepo.coachEarnings().catch(() => null),
      coachReviewRepo.listPublished(coachId).catch(() => []),
      conversationRepo.list('-last_message_at').catch(() => []),
      stripeConnectedAccountRepo.filter({ owner_type: 'coach', owner_id: coachId }).catch(() => []),
      coachSportProfileRepo.filter({ coach_id: coachId }).catch(() => []),
      legalTemplateRepo.filter({ role: 'coach', required: true }).catch(() => []),
      user?.id
        ? legalAgreementRepo.filter({ signer_profile_id: user.id, status: 'signed' }).catch(() => [])
        : Promise.resolve([]),
    ]);
    setSessions(ssns || []);
    setEarnings(earn);
    setReviews(revs || []);
    setConversations((convos || []).filter((c) => !c.is_archived
      && (c.coach_id === coachId || c.participant_emails?.includes(user?.email))));
    setConnectAccount(connectRows?.[0] || null);
    setHasSportProfiles((sportRows || []).some(sportProfileComplete));
    setLegalSigned(legalPacketComplete(templates, agreements, coachId));
  }, [coachId, user?.id, user?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAll();
    })();
    return () => { cancelled = true; };
  }, [loadAll]);

  // ── Derived metrics (real data only) ───────────────────────────────────────
  const tz = coach?.timezone || 'America/Detroit';
  const today = todayInTz(tz);
  const month = monthPrefix();

  const upcoming = useMemo(() => (sessions || [])
    .filter((s) => (s.status === 'pending' || s.status === 'confirmed') && s.date >= today)
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`)), [sessions, today]);

  const completedThisMonth = useMemo(
    () => (sessions || []).filter((s) => s.status === 'completed' && typeof s.date === 'string' && s.date.startsWith(month)).length,
    [sessions, month],
  );

  const monthlyEarnings = useMemo(() => (earnings?.monthly || []).map((bucket) => ({
    month: bucket.month,
    label: formatMonthLabel(bucket.month),
    earned: (Number(bucket.earned_cents) || 0) / 100,
    sessions_completed: Number(bucket.sessions_completed) || 0,
  })), [earnings]);

  const status = connectStatusLabel(connectAccount);
  const connectReady = !!connectAccount?.charges_enabled && !!connectAccount?.payouts_enabled;

  // ── No coach record states ──────────────────────────────────────────────────
  if (coachLoading) {
    return (
      <div className="mx-auto max-w-[1240px] space-y-4">
        <div className="h-9 w-64 animate-pulse rounded bg-secondary" aria-hidden="true" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-secondary/70" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="mx-auto max-w-[860px]">
        <Card className={cn('p-6', isAdmin ? 'border-accent/30' : 'border-destructive/30')}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={cn('w-5 h-5 flex-shrink-0 mt-0.5', isAdmin ? 'text-accent' : 'text-destructive')} aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold tracking-[-0.01em] text-foreground">No coach profile linked</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdmin
                  ? 'Your admin account is not linked to a coach record, so there is nothing to show here. Link an account from the admin coaches page if you also coach.'
                  : 'Your account has coach access but no Coach record is linked yet. An admin links your account to a coach record — usually right after your application is approved. If this is taking long, contact support.'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Coach dashboard</h1>
        <p className="text-muted-foreground">Your business at a glance — all numbers are live.</p>
      </div>

      <div id="org-invites">
        <PendingOrgInvites
          coachId={coachId}
          profileId={user?.id}
          onChange={() => { void reloadCoach(); }}
        />
      </div>

      <OnboardingChecklist
        user={user}
        coach={coach}
        extras={{ connectReady, hasSportProfiles, legalPacketSigned: legalSigned }}
        onPublished={() => { void reloadCoach(); }}
      />

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Upcoming sessions"
          value={upcoming.length}
          loading={sessions === null}
          href="/coach/schedule"
          action="View schedule"
          icon={CalendarDays}
        />
        <StatCard
          label="Completed this month"
          value={completedThisMonth}
          loading={sessions === null}
          href="/coach/sessions"
          action="View sessions"
          icon={CheckCircle2}
        />
        <StatCard
          label="Total earned"
          value={earnings ? formatCents(earnings.totals?.earned_cents) : '—'}
          sub={earnings ? `${formatCents(earnings.totals?.transfers_paid_cents)} paid out` : 'Earnings appear after your first paid session'}
          loading={sessions === null}
          href="/coach/earnings"
          action="View earnings"
          icon={DollarSign}
        />
        <StatCard
          label="Stripe payouts"
          value={status.label}
          sub={connectAccount?.stripe_account_id || 'Connect account required'}
          loading={sessions === null}
          href="/coach/earnings"
          action="Manage"
          icon={DollarSign}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Upcoming sessions */}
        <Card className="p-5">
          <SectionHeader title="Upcoming sessions" action="View all" href="/coach/sessions" />
          {sessions === null ? (
            <SkeletonRows />
          ) : upcoming.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No upcoming sessions.</p>
              {!coach.published && (
                <p className="mt-1 text-xs text-muted-foreground">Publish your profile so clients can book you.</p>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/coach/clients/${encodeURIComponent(s.client_email || '')}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:border-accent/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{s.client_name || s.client_email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatInTz(s.date, s.start_time, s.timezone || tz)} · {s.duration_minutes} min
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      {UPCOMING_STATUS_LABELS[s.status] || s.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Earnings */}
        <Card className="p-5">
          <SectionHeader title="Earnings" action="Full report" href="/coach/earnings" />
          {earnings === null ? (
            <SkeletonRows />
          ) : monthlyEarnings.length === 0 ? (
            <div className="py-8 text-center">
              <DollarSign className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No earnings recorded yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Your monthly earnings appear here after your first paid session.</p>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyEarnings.slice(-12)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                    formatter={(value, name) => (name === 'earned'
                      ? [value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Earned']
                      : [value, name])}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="earned" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Recent reviews */}
        <Card id="reviews" className="p-5">
          <SectionHeader title="Recent reviews" />
          {reviews === null ? (
            <SkeletonRows />
          ) : reviews.length === 0 ? (
            <div className="py-8 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No published reviews yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Clients can leave a review after a completed session.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Number(coach.review_count) > 0 && Number(coach.rating_avg) > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RatingStars rating={coach.rating_avg} />
                  <span className="font-semibold text-foreground">{Number(coach.rating_avg).toFixed(1)}</span>
                  <span>· {coach.review_count} review{Number(coach.review_count) === 1 ? '' : 's'}</span>
                </div>
              )}
              {reviews.slice(0, 3).map((review) => (
                <div key={review.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{review.reviewer_name || 'Client'}</p>
                    <RatingStars rating={review.rating} />
                  </div>
                  {review.comment && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{review.comment}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{formatInstantInTz(review.created_date, tz, { hour: undefined, minute: undefined, timeZoneName: undefined })}</p>
                  {review.coach_response && (
                    <div className="mt-2 rounded border border-accent/20 bg-accent/5 p-2">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your response</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{review.coach_response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent messages */}
        <Card className="p-5">
          <SectionHeader title="Recent messages" action="Open inbox" href="/coach/messages" />
          {conversations === null ? (
            <SkeletonRows />
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Messages with your clients will show up here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {conversations.slice(0, 5).map((convo) => {
                const otherIdx = convo.participant_emails?.findIndex((e) => e !== user?.email) ?? -1;
                const otherName = convo.participant_names?.[otherIdx]
                  || convo.participant_emails?.[otherIdx]
                  || 'Conversation';
                return (
                  <li key={convo.id}>
                    <Link
                      to="/coach/messages"
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{otherName}</p>
                        {convo.last_message && <p className="truncate text-xs text-muted-foreground">{convo.last_message}</p>}
                      </div>
                      {convo.last_message_at && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">
                          {formatInstantInTz(convo.last_message_at, tz, { weekday: undefined, timeZoneName: undefined })}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
