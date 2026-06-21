import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  CreditCard,
  FileCheck2,
  ListChecks,
  MapPin,
  MessageSquare,
  MessageSquareQuote,
  NotebookPen,
  PartyPopper,
  Receipt,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Trophy,
  UserRound,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { notificationRepo, stripePaymentRecordRepo } from '@/api/repo';
import { formatInTz, formatInstantInTz, formatRangeInTz } from '@/lib/scheduleET';
import { cn } from '@/lib/utils';
import {
  SkeletonRows,
  coachDisplayName,
  coachLocationLabel,
  sessionStartMs,
  usd,
} from '@/features/athlete/portalShared';
import {
  creditCoachId,
  creditRemainingCents,
} from '@/features/athlete/useAthletePortalData';
import {
  coachMessageHref,
  coachProfileHref,
  getCoachFocusAreas,
  getCoachSummaryLabel,
  getCompletionRate,
  getCreditSummary,
  getCurrentCoach,
  getFeedbackSessions,
  getNextSession,
  getPrimaryGoal,
  getRecentActivity,
  getWeeklySessionActivity,
} from '@/features/athlete/athleteDashboardModel';

const dateOnly = { hour: undefined, minute: undefined, timeZoneName: undefined };

function DashboardCard({ title, icon: Icon, action, description, children, className }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon && (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <h2 className="text-base font-extrabold tracking-[-0.01em] text-slate-950">{title}</h2>
            </div>
            {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function CompactEmpty({ icon: Icon, title, body, cta }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
      {Icon && (
        <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-bold text-slate-950">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{body}</p>}
      {cta && (
        <Button asChild size="sm" className="mt-4 bg-blue-600 text-white shadow-sm hover:bg-blue-700">
          <Link to={cta.href}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}

function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" role="img" aria-label={label || `${pct}% complete`}>
      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

function avatarInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || 'LC';
}

function CoachAvatar({ coach, size = 'lg' }) {
  const name = coachDisplayName(coach);
  const photo = coach?.photo_url || '';
  const sizeClass = size === 'sm' ? 'h-11 w-11 text-sm' : 'h-16 w-16 text-lg';
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-50 font-extrabold text-blue-800 ring-1 ring-blue-100', sizeClass)}>
      {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : avatarInitials(name)}
    </span>
  );
}

function formatDateOnly(value) {
  return formatInstantInTz(value, undefined, dateOnly) || '';
}

function formatActivityTime(ms) {
  if (!ms) return '';
  return formatInstantInTz(new Date(ms), undefined, dateOnly) || '';
}

function activityIcon(type) {
  return {
    booking: CalendarDays,
    feedback: MessageSquareQuote,
    goal: Target,
    homework: NotebookPen,
    payment: Receipt,
    session: CheckCircle2,
  }[type] || Activity;
}

function creditBookHref(credit) {
  const params = new URLSearchParams();
  const coachId = creditCoachId(credit);
  if (coachId) params.set('coach_id', coachId);
  if (credit?.id) params.set('credit_id', credit.id);
  if (coachId && credit?.id) params.set('schedule', '1');
  return params.toString() ? `/book?${params.toString()}` : '/coaches';
}

function creditCoachName(credit, coachesById) {
  return coachDisplayName(coachesById[creditCoachId(credit)]);
}

function NextSessionCard({ sessions, coachesById, loading, onGoToSessions }) {
  const next = useMemo(() => getNextSession(sessions), [sessions]);
  const coach = next ? coachesById[next.coach_id] : null;

  return (
    <DashboardCard
      title="Next session"
      icon={CalendarDays}
      action={next && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-700 hover:bg-blue-50" onClick={onGoToSessions}>
          Manage <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    >
      {loading ? (
        <SkeletonRows rows={1} />
      ) : !next ? (
        <CompactEmpty
          icon={CalendarDays}
          title="Nothing on the calendar yet"
          body="Book a session with a coach to get your next training on the schedule."
          cta={{ href: '/coaches', label: 'Find a coach' }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="grid h-20 w-16 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                  {formatInTz(next.date, next.start_time, next.timezone, { month: 'short', weekday: undefined, day: undefined, hour: undefined, minute: undefined, timeZoneName: undefined })}
                </p>
                <p className="text-3xl font-extrabold text-slate-950">
                  {formatInTz(next.date, next.start_time, next.timezone, { weekday: undefined, month: undefined, hour: undefined, minute: undefined, timeZoneName: undefined })}
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-950">
                {next.session_format_label || next.sport_key ? `${next.session_format_label || 'Training session'}` : 'Training session'}
              </h3>
              <div className="mt-2 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  {formatRangeInTz(next.date, next.start_time, next.duration_minutes, next.timezone)}
                </p>
                {coachLocationLabel(coach) && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    {coachLocationLabel(coach)}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <CoachAvatar coach={coach} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Coach</p>
              <p className="truncate text-sm font-bold text-slate-950">{coachDisplayName(coach)}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50" onClick={onGoToSessions}>
            View session details
          </Button>
        </div>
      )}
    </DashboardCard>
  );
}

function CurrentCoachCard({ sessionsData, creditsData, loading }) {
  const current = useMemo(() => getCurrentCoach({
    sessions: sessionsData.sessions,
    sessionCoachesById: sessionsData.coachesById,
    credits: creditsData.credits,
    creditCoachesById: creditsData.coachesById || {},
  }), [sessionsData.sessions, sessionsData.coachesById, creditsData.credits, creditsData.coachesById]);

  const coach = current?.coach || null;
  const coachId = current?.coachId || '';
  const rating = Number(coach?.rating_avg || coach?.rating || 0);
  const reviewCount = Number(coach?.review_count || coach?.reviews_count || 0);
  const focusAreas = getCoachFocusAreas(coach);

  return (
    <DashboardCard title="Current coach" icon={UserRound}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : !coach ? (
        <CompactEmpty
          icon={UserRound}
          title="No coach relationship yet"
          body="Once you book or buy credits, your coach details and quick actions will appear here."
          cta={{ href: '/coaches', label: 'Find a coach' }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <CoachAvatar coach={coach} />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-extrabold text-slate-950">{coachDisplayName(coach)}</h3>
              <p className="text-sm text-slate-500">{getCoachSummaryLabel(coach)}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                {rating > 0 ? `${rating.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount} reviews)` : ''}` : 'No reviews yet'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Link to={coachMessageHref()}>
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Message
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Link to={coachProfileHref(coachId)}>
                <UserRound className="h-4 w-4" aria-hidden="true" />
                View profile
              </Link>
            </Button>
          </div>
          {focusAreas.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Focus areas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {focusAreas.map((area) => (
                  <span key={area} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

function RecentActivityCard({ activities, loading }) {
  return (
    <DashboardCard
      title="Recent activity"
      icon={Activity}
      action={activities.length > 0 && <span className="text-xs font-semibold text-blue-700">Live</span>}
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : activities.length === 0 ? (
        <CompactEmpty
          icon={Activity}
          title="No activity yet"
          body="Bookings, feedback, goals, homework, and payments will appear here as they happen."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {activities.slice(0, 4).map((item) => {
            const Icon = activityIcon(item.type);
            return (
              <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{item.body}</p>
                  {item.at > 0 && <p className="mt-1 text-[11px] text-slate-400">{formatActivityTime(item.at)}</p>}
                </div>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

function TrainingActivityCard({ sessions, loading }) {
  const data = useMemo(() => getWeeklySessionActivity(sessions), [sessions]);
  const hasData = data.some((item) => item.sessions > 0);

  return (
    <DashboardCard
      title="Training activity"
      icon={TrendingUp}
      description="Completed sessions over the last 4 weeks."
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : !hasData ? (
        <CompactEmpty
          icon={TrendingUp}
          title="No completed sessions yet"
          body="Your training trend appears after completed sessions are recorded."
        />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                formatter={(value) => [`${value} completed`, 'Sessions']}
                contentStyle={{
                  border: '1px solid #dbeafe',
                  borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
                }}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardCard>
  );
}

function CreditsPackageCard({ credits, coachesById, loading }) {
  const summary = useMemo(() => getCreditSummary(credits), [credits]);
  const primary = summary.primary;
  const coachName = primary ? creditCoachName(primary, coachesById) : 'Coach';

  return (
    <DashboardCard
      title="Credits & packages"
      icon={CreditCard}
      action={summary.remaining > 0 && (
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-blue-700 hover:bg-blue-50">
          <Link to="/coaches">Compare coaches</Link>
        </Button>
      )}
    >
      {loading ? (
        <SkeletonRows rows={2} />
      ) : credits.length === 0 ? (
        <CompactEmpty
          icon={CreditCard}
          title="No session credits yet"
          body="Purchase a package to start booking. Credits stay value-based and can be applied to another published coach."
          cta={{ href: '/coaches', label: 'Browse coaches' }}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-slate-950">{usd(summary.remaining)}</p>
              <p className="mt-1 text-sm text-slate-500">Transferable credit remaining</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-extrabold text-slate-950">{primary?.package_name || 'Training credit'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.totalSessions > 0
                  ? `${summary.usedSessions} used · ${summary.remainingSessions} remaining from ${summary.totalSessions} purchased`
                  : `${usd(summary.spent)} spent · ${usd(summary.reserved)} reserved`}
              </p>
              <div className="mt-3">
                <ProgressBar value={summary.progressPct} label={`${summary.progressPct}% of credit value used or reserved`} />
              </div>
            </div>
          </div>
          {primary && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="text-xs leading-5 text-blue-900">
                {coachName !== 'Coach'
                  ? `Transferable credit from ${coachName} - use with any published coach.`
                  : 'Transferable credit - use with any published coach.'}
              </p>
              {creditRemainingCents(primary) > 0 && (
                <Button asChild size="sm" className="bg-blue-600 text-white shadow-sm hover:bg-blue-700">
                  <Link to={creditBookHref(primary)}>Book session</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

function DevelopmentPlanCard({ goals, loading, goTab }) {
  const activeGoals = useMemo(() => goals.filter((goal) => goal.status !== 'archived').slice(0, 3), [goals]);

  return (
    <DashboardCard
      title="Development plan"
      icon={Target}
      action={activeGoals.length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-700 hover:bg-blue-50" onClick={() => goTab('training')}>
          View full plan
        </Button>
      )}
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : activeGoals.length === 0 ? (
        <CompactEmpty
          icon={Target}
          title="No development goals yet"
          body="Goals your coach creates will show progress here and in My Training."
        />
      ) : (
        <ul className="space-y-4">
          {activeGoals.map((goal) => {
            const pct = Math.max(0, Math.min(100, Number(goal.progress_pct) || 0));
            return (
              <li key={goal.id} className="grid gap-3 sm:grid-cols-[1fr_120px_88px] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{goal.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {goal.target_date ? `Target: ${formatDateOnly(goal.target_date)}` : goal.description || 'Progress tracked by your coach'}
                  </p>
                </div>
                <ProgressBar value={pct} label={`${goal.title}: ${pct}% complete`} />
                <span className={cn(
                  'justify-self-start rounded-full px-2.5 py-1 text-xs font-bold capitalize sm:justify-self-end',
                  goal.status === 'achieved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-blue-50 text-blue-700',
                )}
                >
                  {goal.status === 'achieved' ? 'Achieved' : `${pct}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

function buildRequiredActions({ legalStatus, remaining, credits, creditCoachesById, creditsLoaded, homework, sessions, reviewedSessionIds, goTab }) {
  const actions = [];

  if (!legalStatus.loading && legalStatus.hasTemplates && !legalStatus.complete) {
    actions.push({
      key: 'legal',
      icon: ShieldCheck,
      status: 'needs_action',
      title: 'Sign required documents',
      body: `${legalStatus.missing.length} document${legalStatus.missing.length === 1 ? '' : 's'} needed before protected booking actions.`,
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
      status: 'needs_action',
      title: `Homework due (${dueHomework.length})`,
      body: dueHomework[0].title || 'Open assignment waiting on you.',
      onClick: () => goTab('training'),
      label: 'Open training',
    });
  }

  const unreviewed = sessions.filter((session) => session.status === 'completed' && !reviewedSessionIds.has(session.id));
  if (unreviewed.length > 0) {
    actions.push({
      key: 'review',
      icon: Star,
      status: 'needs_action',
      title: 'Review your last session',
      body: 'A quick rating helps your coach and future athletes.',
      onClick: () => goTab('sessions'),
      label: 'Leave review',
    });
  }

  const hasUpcoming = sessions.some((session) => ['pending', 'confirmed'].includes(session.status) && (sessionStartMs(session) || 0) > Date.now());
  if (creditsLoaded && remaining > 0 && !hasUpcoming) {
    const credit = credits.find((item) => creditRemainingCents(item) > 0);
    const coachName = creditCoachName(credit, creditCoachesById);
    actions.push({
      key: 'book',
      icon: CalendarDays,
      status: 'recommended',
      title: 'Book your next session',
      body: `You have ${usd(remaining)} in credit ready to use${coachName !== 'Coach' ? ` with ${coachName} or another coach` : ''}.`,
      href: credit ? creditBookHref(credit) : '/coaches',
      label: 'Book session',
    });
  }

  if (creditsLoaded && remaining === 0) {
    actions.push({
      key: 'credits',
      icon: CreditCard,
      status: 'recommended',
      title: 'Get session credits',
      body: 'Buy or compare packages when you are ready to train again.',
      href: '/coaches',
      label: 'Browse coaches',
    });
  }

  return actions;
}

function RequiredActionsCard({ actions, loading }) {
  return (
    <DashboardCard title="Required actions" icon={ListChecks}>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : actions.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-slate-950">You&apos;re all caught up</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">No required documents, reviews, or training tasks are waiting right now.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {actions.slice(0, 5).map((action) => (
            <li key={action.key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <span className={cn(
                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1',
                action.status === 'needs_action'
                  ? 'bg-amber-50 text-amber-700 ring-amber-100'
                  : 'bg-blue-50 text-blue-700 ring-blue-100',
              )}
              >
                <action.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-950">{action.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{action.body}</p>
              </div>
              {action.href ? (
                <Button asChild variant="outline" size="sm" className="h-8 shrink-0 border-blue-200 text-xs text-blue-700 hover:bg-blue-50">
                  <Link to={action.href}>{action.label}</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 shrink-0 border-blue-200 text-xs text-blue-700 hover:bg-blue-50" onClick={action.onClick}>
                  {action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function PaymentHistoryCard({ payments, loading }) {
  return (
    <DashboardCard
      title="Payment history"
      icon={Receipt}
      action={payments.length > 3 && <span className="text-xs font-semibold text-blue-700">Latest 3</span>}
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : payments.length === 0 ? (
        <CompactEmpty
          icon={Receipt}
          title="No payments on record"
          body="Receipts for training packages will appear here after checkout."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {payments.slice(0, 3).map((payment) => {
            const state = payment.state || payment.status || 'created';
            const refunded = Number(payment.refunded_amount || 0);
            return (
              <li key={payment.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{payment.description || payment.package_name || 'Training package'}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatInstantInTz(payment.created_date, undefined, dateOnly)}
                    {refunded > 0 && ` · ${usd(refunded)} refunded`}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-950">
                  {Number.isFinite(Number(payment.amount)) ? usd(payment.amount) : 'Payment'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold capitalize text-emerald-700">
                  {String(state).replace(/_/g, ' ')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
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
    <DashboardCard
      title={`Notifications${unread.length > 0 ? ` (${unread.length})` : ''}`}
      icon={Bell}
      action={unread.length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-700 hover:bg-blue-50" disabled={markingAll} onClick={markAllRead}>
          {markingAll ? 'Marking…' : 'Mark all read'}
        </Button>
      )}
    >
      {query.isLoading ? (
        <SkeletonRows rows={3} />
      ) : notifications.length === 0 ? (
        <CompactEmpty
          icon={BellOff}
          title="You're all caught up"
          body="Booking confirmations, cancellations, and coach updates will appear here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {notifications.slice(0, 4).map((notification) => (
            <li key={notification.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn(
                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1',
                notification.read ? 'bg-slate-50 text-slate-400 ring-slate-100' : 'bg-blue-50 text-blue-700 ring-blue-100',
              )}
              >
                {notification.read ? <Circle className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-950">{notification.title || 'Update'}</p>
                {(notification.body || notification.message) && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{notification.body || notification.message}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">{formatInstantInTz(notification.created_date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {notification.link && (
                  <Button asChild variant="outline" size="sm" className="h-8 border-blue-200 text-xs text-blue-700 hover:bg-blue-50">
                    <Link to={notification.link}>Open</Link>
                  </Button>
                )}
                {!notification.read && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-700 hover:bg-blue-50" onClick={() => markRead(notification)}>
                    Read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function CoachFeedbackCard({ sessions, coachesById, loading }) {
  const feedback = useMemo(() => getFeedbackSessions(sessions).slice(0, 3), [sessions]);

  return (
    <DashboardCard title="Coach feedback" icon={MessageSquareQuote} className="lg:col-span-2 xl:col-span-3">
      {loading ? (
        <SkeletonRows rows={2} />
      ) : feedback.length === 0 ? (
        <CompactEmpty
          icon={MessageSquareQuote}
          title="No feedback yet"
          body="After sessions, notes your coach shares with you will show up here."
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-3">
          {feedback.map((session) => (
            <li key={session.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{session.client_visible_notes}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {coachDisplayName(coachesById[session.coach_id])} · {formatInTz(session.date, session.start_time, session.timezone, dateOnly)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
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
  const paymentsQuery = useQuery({
    queryKey: ['portal', 'athletePayments', user?.id],
    enabled: !!user?.id,
    queryFn: () => stripePaymentRecordRepo.list('-created_date').catch(() => []),
  });
  const payments = paymentsQuery.data || [];

  const activities = useMemo(() => getRecentActivity({
    sessions: sessionsData.sessions,
    goals: trainingData.goals,
    homework: trainingData.homework,
    payments,
  }), [sessionsData.sessions, trainingData.goals, trainingData.homework, payments]);

  const primaryGoal = useMemo(() => getPrimaryGoal(trainingData.goals), [trainingData.goals]);
  const completion = useMemo(() => getCompletionRate(sessionsData.sessions), [sessionsData.sessions]);

  const actions = buildRequiredActions({
    legalStatus,
    remaining: creditsData.remaining,
    credits: creditsData.credits,
    creditCoachesById: creditsData.coachesById || {},
    creditsLoaded: !creditsData.loading,
    homework: trainingData.homework,
    sessions: sessionsData.sessions,
    reviewedSessionIds,
    goTab,
  });

  const loading = sessionsData.loading || creditsData.loading || legalStatus.loading;

  return (
    <div className="space-y-4">
      {(primaryGoal || completion.total > 0) && (
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-2">
          {primaryGoal && (
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-blue-700 ring-1 ring-blue-100">
                <Trophy className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Current focus</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{primaryGoal.title}</p>
              </div>
            </div>
          )}
          {completion.total > 0 && (
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">This month</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{completion.completed} of {completion.total} completed sessions</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <NextSessionCard
          sessions={sessionsData.sessions}
          coachesById={sessionsData.coachesById}
          loading={sessionsData.loading}
          onGoToSessions={() => goTab('sessions')}
        />
        <CurrentCoachCard
          sessionsData={sessionsData}
          creditsData={creditsData}
          loading={sessionsData.loading || sessionsData.coachesLoading || creditsData.loading || creditsData.coachesLoading}
        />
        <RecentActivityCard
          activities={activities}
          loading={sessionsData.loading || trainingData.loading || paymentsQuery.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <TrainingActivityCard sessions={sessionsData.sessions} loading={sessionsData.loading} />
        <CreditsPackageCard
          credits={creditsData.credits}
          coachesById={creditsData.coachesById || {}}
          loading={creditsData.loading || creditsData.coachesLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <DevelopmentPlanCard goals={trainingData.goals} loading={trainingData.loading} goTab={goTab} />
        <RequiredActionsCard actions={actions} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentHistoryCard payments={payments} loading={paymentsQuery.isLoading} />
        <NotificationsCard user={user} />
      </div>

      <CoachFeedbackCard
        sessions={sessionsData.sessions}
        coachesById={sessionsData.coachesById}
        loading={sessionsData.loading}
      />

      {!loading && legalStatus.complete && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <FileCheck2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Your athlete legal packet is signed and current.
        </p>
      )}
    </div>
  );
}
