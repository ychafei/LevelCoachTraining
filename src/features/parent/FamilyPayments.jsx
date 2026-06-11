import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, CreditCard, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sessionCreditRepo, stripePaymentRecordRepo } from '@/api/repo';
import { formatInstantInTz } from '@/lib/scheduleET';
import { EmptyState, SectionCard, SkeletonRows, usd } from '@/features/athlete/portalShared';

const PAYMENT_BADGES = {
  paid: 'border-green-500/20 bg-green-500/10 text-green-500',
  created: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  refunded: 'border-border bg-secondary/50 text-muted-foreground',
  partially_refunded: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  disputed: 'border-destructive/20 bg-destructive/10 text-destructive',
  failed: 'border-destructive/20 bg-destructive/10 text-destructive',
  cancelled: 'border-border bg-secondary/50 text-muted-foreground',
};

// Display-only labels for raw payment states — never written back.
const PAYMENT_LABELS = {
  paid: 'Paid',
  created: 'Created',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  disputed: 'Disputed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function CreditsCard({ user }) {
  const query = useQuery({
    queryKey: ['portal', 'credits', user?.id],
    enabled: !!user?.id,
    queryFn: () => sessionCreditRepo.list('-created_date'),
  });

  const credits = query.data || [];
  const remaining = credits.reduce(
    (sum, credit) => sum + Math.max(0, (Number(credit.total_credits) || 0) - (Number(credit.used_credits) || 0)),
    0,
  );

  return (
    <SectionCard
      title="Session credits"
      icon={CreditCard}
      description="Credits you can read here include your own purchases and packages granted for your athletes."
      action={(
        <Button asChild size="sm" className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90">
          <Link to="/book">Buy sessions</Link>
        </Button>
      )}
    >
      {query.isLoading ? (
        <SkeletonRows rows={2} />
      ) : credits.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No session credits yet"
          body="Purchase a training package to book sessions for your athletes."
          cta={{ href: '/book', label: 'Buy sessions' }}
          compact
        />
      ) : (
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {remaining}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              session{remaining === 1 ? '' : 's'} remaining across {credits.length} package{credits.length === 1 ? '' : 's'}
            </span>
          </p>
          <ul className="mt-3 space-y-2">
            {credits.map((credit) => {
              const left = Math.max(0, (Number(credit.total_credits) || 0) - (Number(credit.used_credits) || 0));
              return (
                <li key={credit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{credit.package_name || 'Training package'}</p>
                    <p className="text-xs text-muted-foreground">
                      {credit.session_duration_minutes ? `${credit.session_duration_minutes}-minute sessions` : 'Sessions'}
                      {Number.isFinite(Number(credit.amount_cents)) && credit.amount_cents !== null && ` · ${usd(credit.amount_cents)}`}
                      {credit.client_email && ` · ${credit.client_email}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-foreground">
                    {left} of {Number(credit.total_credits) || 0} left
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function PaymentHistoryCard({ user }) {
  // Payment records carry a per-document read grant for the payer where
  // known; older records may not be readable at all — tolerate empty.
  const query = useQuery({
    queryKey: ['portal', 'payments', user?.id],
    enabled: !!user?.id,
    queryFn: () => stripePaymentRecordRepo.list('-created_date').catch(() => []),
  });

  const payments = query.data || [];

  return (
    <SectionCard
      title="Payment history"
      icon={Receipt}
      description="Card payments processed through LevelCoach Training."
    >
      {query.isLoading ? (
        <SkeletonRows rows={2} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CircleDollarSign}
          title="No payments on record"
          body="Receipts for packages you purchase will appear here after checkout."
          compact
        />
      ) : (
        <ul className="space-y-2">
          {payments.map((payment) => {
            const state = payment.state || payment.status || 'created';
            return (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {Number.isFinite(Number(payment.amount)) ? usd(payment.amount) : 'Payment'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatInstantInTz(payment.created_date)}
                    {Number(payment.refunded_amount) > 0 && ` · ${usd(payment.refunded_amount)} refunded`}
                  </p>
                </div>
                <Badge className={PAYMENT_BADGES[state] || PAYMENT_BADGES.created}>
                  {PAYMENT_LABELS[state] || String(state).replace(/_/g, ' ')}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export default function FamilyPayments({ user }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CreditsCard user={user} />
      <PaymentHistoryCard user={user} />
    </div>
  );
}
