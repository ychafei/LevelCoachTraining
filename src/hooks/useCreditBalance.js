import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sessionCreditRepo } from '@/api/repo';

function sameEmail(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

function integerCents(value) {
  const cents = Number(value);
  return Number.isInteger(cents) ? cents : null;
}

function creditBelongsToViewer(credit, user) {
  return credit?.client_profile_id
    ? credit.client_profile_id === user?.id
    : sameEmail(credit?.client_email, user?.email);
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

export function creditRemainingSessionCount(credit) {
  const total = Number(credit?.total_credits);
  const used = Number(credit?.used_credits);
  if (Number.isFinite(total) && total > 0) {
    return Math.max(0, total - (Number.isFinite(used) && used > 0 ? used : 0));
  }
  return creditRemainingCents(credit) > 0 ? 1 : 0;
}

export function formatCreditMoney(cents) {
  const safe = Number.isFinite(Number(cents)) ? Math.max(0, Number(cents)) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: safe % 100 === 0 ? 0 : 2,
  }).format(safe / 100);
}

export function useCreditBalance(user, enabled = true) {
  const query = useQuery({
    queryKey: ['creditBalance', user?.id],
    enabled: !!user?.id && enabled,
    queryFn: () => sessionCreditRepo.list('-created_date').catch(() => []),
    staleTime: 30000,
  });

  return useMemo(() => {
    const credits = (query.data || []).filter((credit) => creditBelongsToViewer(credit, user));
    const activeCredits = credits.filter((credit) => (credit.status || 'active') === 'active');
    const remainingCents = activeCredits.reduce((sum, credit) => sum + creditRemainingCents(credit), 0);
    const remainingSessions = activeCredits.reduce((sum, credit) => sum + creditRemainingSessionCount(credit), 0);

    return {
      credits: activeCredits,
      remainingCents,
      remainingSessions,
      loading: query.isLoading && !!user?.id && enabled,
      error: query.error,
      refetch: query.refetch,
    };
  }, [enabled, query.data, query.error, query.isLoading, query.refetch, user]);
}
