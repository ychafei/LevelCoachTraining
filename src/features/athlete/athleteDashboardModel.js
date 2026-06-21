import { format, startOfWeek, subWeeks } from 'date-fns';
import { sportDisplayName } from '@/features/athlete/sportMeta';
import {
  coachDisplayName,
  coachLocationLabel,
  isUpcomingSession,
  sessionStartMs,
} from '@/features/athlete/portalShared';
import {
  creditCoachId,
  creditRemainingCents,
  creditReservedCents,
  creditSpentCents,
} from '@/features/athlete/useAthletePortalData';

const OUTCOME_STATUSES = new Set(['completed', 'no_show', 'late_cancelled_chargeable']);
const COMPLETE_STATUSES = new Set(['completed']);
const ACTIVE_CREDIT_STATUSES = new Set(['active', 'available', 'partially_used', '']);

function safeDocMs(doc) {
  const ms = Date.parse(doc?.updated_date || doc?.created_date || '');
  return Number.isFinite(ms) ? ms : 0;
}

export function sortSessionsByStart(sessions, direction = 'asc') {
  return [...(sessions || [])].sort((a, b) => {
    const left = sessionStartMs(a) ?? safeDocMs(a);
    const right = sessionStartMs(b) ?? safeDocMs(b);
    return direction === 'desc' ? right - left : left - right;
  });
}

export function getNextSession(sessions, nowMs = Date.now()) {
  return sortSessionsByStart((sessions || []).filter((session) => isUpcomingSession(session, nowMs)))[0] || null;
}

export function getLatestSession(sessions) {
  return sortSessionsByStart(sessions || [], 'desc')[0] || null;
}

export function getPrimaryGoal(goals = []) {
  const visible = goals
    .filter((goal) => goal?.status !== 'archived')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      const aTarget = Date.parse(a.target_date || a.created_date || '') || Number.MAX_SAFE_INTEGER;
      const bTarget = Date.parse(b.target_date || b.created_date || '') || Number.MAX_SAFE_INTEGER;
      return aTarget - bTarget;
    });
  return visible[0] || null;
}

export function getCompletionRate(sessions = [], nowMs = Date.now()) {
  const now = new Date(nowMs);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const outcomes = sessions.filter((session) => {
    const start = sessionStartMs(session);
    return start !== null
      && start >= monthStart
      && start < monthEnd
      && start <= nowMs
      && OUTCOME_STATUSES.has(session.status);
  });
  const completed = outcomes.filter((session) => COMPLETE_STATUSES.has(session.status)).length;
  const total = outcomes.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

export function getFeedbackSessions(sessions = []) {
  return sortSessionsByStart(
    sessions.filter((session) => String(session.client_visible_notes || '').trim()),
    'desc',
  );
}

export function getCurrentCoach({ sessions = [], sessionCoachesById = {}, credits = [], creditCoachesById = {} }) {
  const next = getNextSession(sessions);
  const latest = getLatestSession(sessions);
  const sessionCoachId = next?.coach_id || latest?.coach_id || '';
  if (sessionCoachId && sessionCoachesById[sessionCoachId]) {
    return {
      coach: sessionCoachesById[sessionCoachId],
      coachId: sessionCoachId,
      source: next ? 'next_session' : 'latest_session',
    };
  }

  for (const credit of credits) {
    const coachId = creditCoachId(credit);
    if (coachId && creditCoachesById[coachId]) {
      return { coach: creditCoachesById[coachId], coachId, source: 'credit' };
    }
  }

  return null;
}

export function getCreditSummary(credits = []) {
  const active = credits.filter((credit) => {
    const status = String(credit.status || 'active');
    return ACTIVE_CREDIT_STATUSES.has(status) && creditRemainingCents(credit) > 0;
  });
  const all = credits || [];
  const original = all.reduce((sum, credit) => {
    const explicit = Number(credit.original_amount_cents ?? credit.amount_cents);
    if (Number.isInteger(explicit) && explicit > 0) return sum + explicit;
    return sum + creditRemainingCents(credit) + creditSpentCents(credit) + creditReservedCents(credit);
  }, 0);
  const remaining = all.reduce((sum, credit) => sum + creditRemainingCents(credit), 0);
  const reserved = all.reduce((sum, credit) => sum + creditReservedCents(credit), 0);
  const spent = all.reduce((sum, credit) => sum + creditSpentCents(credit), 0);
  const totalSessions = all.reduce((sum, credit) => sum + (Number(credit.total_credits) || 0), 0);
  const usedSessions = all.reduce((sum, credit) => sum + (Number(credit.used_credits) || 0), 0);
  const primary = active[0] || all[0] || null;

  return {
    active,
    primary,
    original,
    remaining,
    reserved,
    spent,
    totalSessions,
    usedSessions,
    remainingSessions: Math.max(0, totalSessions - usedSessions),
    progressPct: original > 0 ? Math.min(100, Math.round(((spent + reserved) / original) * 100)) : 0,
  };
}

export function getWeeklySessionActivity(sessions = [], nowMs = Date.now(), weeks = 4) {
  const base = startOfWeek(new Date(nowMs), { weekStartsOn: 1 });
  return Array.from({ length: weeks }).map((_, index) => {
    const weekStart = subWeeks(base, weeks - 1 - index);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const startMs = weekStart.getTime();
    const endMs = weekEnd.getTime();
    const completed = sessions.filter((session) => {
      const start = sessionStartMs(session);
      return start !== null && start >= startMs && start < endMs && session.status === 'completed';
    }).length;
    return {
      label: `${format(weekStart, 'MMM d')}–${format(new Date(endMs - 1), 'MMM d')}`,
      sessions: completed,
    };
  });
}

function docTime(doc) {
  return safeDocMs(doc);
}

function sessionActivityTime(session) {
  return safeDocMs(session) || sessionStartMs(session) || 0;
}

export function getRecentActivity({ sessions = [], goals = [], homework = [], payments = [] }) {
  const items = [];

  for (const session of sessions) {
    if (session.status === 'completed') {
      items.push({
        id: `session-completed-${session.id}`,
        type: 'session',
        title: 'Completed session',
        body: session.session_format_label || session.sport_key ? `${sportDisplayName(session.sport_key)} training` : 'Training session',
        at: sessionStartMs(session) || sessionActivityTime(session),
      });
    } else if (['pending', 'confirmed'].includes(session.status)) {
      items.push({
        id: `session-booked-${session.id}`,
        type: 'booking',
        title: 'Session booked',
        body: session.session_format_label || session.sport_key ? `${sportDisplayName(session.sport_key)} training` : 'Upcoming training session',
        at: sessionActivityTime(session),
      });
    }

    if (String(session.client_visible_notes || '').trim()) {
      items.push({
        id: `session-feedback-${session.id}`,
        type: 'feedback',
        title: 'Coach feedback added',
        body: String(session.client_visible_notes).trim(),
        at: sessionActivityTime(session),
      });
    }
  }

  for (const goal of goals.filter((item) => item.status !== 'archived')) {
    items.push({
      id: `goal-${goal.id}`,
      type: 'goal',
      title: goal.status === 'achieved' ? 'Goal achieved' : 'Goal updated',
      body: goal.title,
      at: docTime(goal),
    });
  }

  for (const item of homework) {
    items.push({
      id: `homework-${item.id}`,
      type: 'homework',
      title: item.status === 'submitted' ? 'Homework submitted' : 'Homework assigned',
      body: item.title,
      at: docTime(item),
    });
  }

  for (const payment of payments) {
    items.push({
      id: `payment-${payment.id}`,
      type: 'payment',
      title: 'Payment recorded',
      body: payment.description || payment.package_name || 'Training package payment',
      at: docTime(payment),
    });
  }

  return items
    .filter((item) => Number.isFinite(item.at) && item.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
}

export function getCoachSummaryLabel(coach) {
  if (!coach) return '';
  const sport = Array.isArray(coach.sports) && coach.sports.length > 0
    ? sportDisplayName(coach.sports[0])
    : sportDisplayName(coach.primary_sport || coach.sport);
  const title = coach.headline || coach.title || `${sport} coach`;
  return title || 'LevelCoach coach';
}

export function getCoachFocusAreas(coach, limit = 4) {
  const candidates = [
    ...(Array.isArray(coach?.specialties) ? coach.specialties : []),
    ...(Array.isArray(coach?.training_focuses) ? coach.training_focuses : []),
    ...(Array.isArray(coach?.tags) ? coach.tags : []),
  ];
  return [...new Set(candidates.filter(Boolean))].slice(0, limit);
}

export function coachProfileHref(coachId) {
  return coachId ? `/coaches/${coachId}` : '/coaches';
}

export function coachMessageHref() {
  return '/messages';
}

export { coachDisplayName, coachLocationLabel };
