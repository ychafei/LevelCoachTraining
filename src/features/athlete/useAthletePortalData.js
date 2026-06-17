import { useQuery, useQueryClient } from '@tanstack/react-query';
import { coachRepo, coachReviewRepo, sessionCreditRepo, sessionRepo, trainingRepo } from '@/api/repo';

// Data hooks for the athlete portal. Reads are direct Appwrite queries —
// per-document permissions already scope results to the caller, the extra
// client-side filters below are defense-in-depth + relevance filtering only.

const SESSION_REFRESH_MS = 15000;

function sameEmail(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

export function sessionBelongsToViewer(session, user, athleteIds) {
  return sameEmail(session.client_email, user?.email)
    || session.booked_by_profile_id === user?.id
    || (session.athlete_id && athleteIds.includes(session.athlete_id));
}

export function creditBelongsToViewer(credit, user) {
  return credit.client_profile_id
    ? credit.client_profile_id === user?.id
    : sameEmail(credit.client_email, user?.email);
}

function integerCents(value) {
  const cents = Number(value);
  return Number.isInteger(cents) ? cents : null;
}

export function creditRemainingCents(credit) {
  const remaining = integerCents(credit?.remaining_amount_cents);
  if (remaining !== null) return Math.max(0, remaining);
  const available = integerCents(credit?.available_amount_cents);
  if (available !== null) return Math.max(0, available);

  const total = Number(credit?.total_credits) || 0;
  const used = Number(credit?.used_credits) || 0;
  const left = Math.max(0, total - used);
  const perSession = integerCents(credit?.per_session_base_price_cents)
    ?? (total > 0 ? Math.floor((Number(credit?.amount_cents) || 0) / total) : 0);
  return left * Math.max(0, perSession);
}

export function creditReservedCents(credit) {
  return Math.max(0, integerCents(credit?.reserved_amount_cents) ?? 0);
}

export function creditSpentCents(credit) {
  return Math.max(0, integerCents(credit?.spent_amount_cents ?? credit?.earned_amount_cents) ?? 0);
}

export function creditsRemaining(credits) {
  return credits.reduce((sum, credit) => sum + creditRemainingCents(credit), 0);
}

export function creditCoachId(credit) {
  return credit?.coach_id || credit?.original_coach_id || credit?.originating_coach_id || '';
}

// All sessions readable by the caller + the coaches they reference.
export function useMySessions(user, athleteIds = []) {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['portal', 'sessions', user?.id],
    enabled: !!user?.id,
    queryFn: () => sessionRepo.list('-starts_at_utc'),
    refetchInterval: SESSION_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const sessions = (sessionsQuery.data || []).filter(
    (session) => sessionBelongsToViewer(session, user, athleteIds),
  );

  const coachIds = [...new Set(sessions.map((s) => s.coach_id).filter(Boolean))];
  const coachesQuery = useQuery({
    queryKey: ['portal', 'coaches', coachIds.join(',')],
    enabled: coachIds.length > 0,
    queryFn: () => coachRepo.filter({ id: coachIds }),
  });

  const coachesById = {};
  for (const coach of coachesQuery.data || []) coachesById[coach.id] = coach;

  return {
    sessions,
    coachesById,
    loading: sessionsQuery.isLoading && !!user?.id,
    coachesLoading: coachesQuery.isLoading && coachIds.length > 0,
    error: sessionsQuery.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['portal', 'sessions'] }),
  };
}

export function useMyCredits(user) {
  const query = useQuery({
    queryKey: ['portal', 'credits', user?.id],
    enabled: !!user?.id,
    queryFn: () => sessionCreditRepo.list('-created_date'),
  });
  const credits = (query.data || []).filter((credit) => creditBelongsToViewer(credit, user));
  const coachIds = [...new Set(credits.map(creditCoachId).filter(Boolean))];
  const coachesQuery = useQuery({
    queryKey: ['portal', 'creditCoaches', coachIds.join(',')],
    enabled: coachIds.length > 0,
    queryFn: () => coachRepo.filter({ id: coachIds }),
  });
  const coachesById = {};
  for (const coach of coachesQuery.data || []) coachesById[coach.id] = coach;
  return {
    credits,
    coachesById,
    remaining: creditsRemaining(credits),
    loading: query.isLoading && !!user?.id,
    coachesLoading: coachesQuery.isLoading && coachIds.length > 0,
  };
}

// Goals / plans / plan items / homework / assessments scoped to the athlete.
export function useMyTraining(user, athleteIds = []) {
  const queryClient = useQueryClient();
  const enabled = !!user?.id && athleteIds.length > 0;
  const key = athleteIds.join(',');

  const goalsQuery = useQuery({
    queryKey: ['portal', 'goals', key],
    enabled,
    queryFn: () => trainingRepo.listGoals({ athlete_id: athleteIds }),
  });
  const plansQuery = useQuery({
    queryKey: ['portal', 'plans', key],
    enabled,
    queryFn: () => trainingRepo.listPlans({ athlete_id: athleteIds }),
  });
  const planIds = (plansQuery.data || []).map((plan) => plan.id);
  const itemsQuery = useQuery({
    queryKey: ['portal', 'planItems', planIds.join(',')],
    enabled: planIds.length > 0,
    queryFn: () => trainingRepo.listPlanItems({ plan_id: planIds }, 'week'),
  });
  const homeworkQuery = useQuery({
    queryKey: ['portal', 'homework', key],
    enabled,
    queryFn: () => trainingRepo.listHomework({ athlete_id: athleteIds }),
  });
  const assessmentsQuery = useQuery({
    queryKey: ['portal', 'assessments', key],
    enabled,
    queryFn: () => trainingRepo.listAssessments({ athlete_id: athleteIds }),
  });

  return {
    goals: goalsQuery.data || [],
    plans: plansQuery.data || [],
    planItems: itemsQuery.data || [],
    homework: homeworkQuery.data || [],
    assessments: assessmentsQuery.data || [],
    loading: enabled && (goalsQuery.isLoading || plansQuery.isLoading || homeworkQuery.isLoading || assessmentsQuery.isLoading),
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'homework'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'goals'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'plans'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'planItems'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'assessments'] });
    },
  };
}

// Session ids the caller has already reviewed (published reviews are
// readable by anyone; per-doc grants cover the rest of the caller's own).
export function useMyReviewedSessionIds(user) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['portal', 'myReviews', user?.id],
    enabled: !!user?.id,
    queryFn: () => coachReviewRepo.filter({ reviewer_profile_id: user.id }).catch(() => []),
  });
  return {
    reviewedSessionIds: new Set((query.data || []).map((review) => review.session_id)),
    loading: query.isLoading && !!user?.id,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['portal', 'myReviews'] }),
  };
}
