import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, CreditCard, Receipt, Repeat2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pricingPackageRepo, sessionCreditRepo, stripePaymentRecordRepo } from '@/api/repo';
import { formatInstantInTz } from '@/lib/scheduleET';
import { EmptyState, SectionCard, SkeletonRows, usd } from '@/features/athlete/portalShared';
import { creditRemainingCents, creditReservedCents, creditSpentCents } from '@/features/athlete/useAthletePortalData';
import { callFn } from '@/lib/rpc';
import { normalizePublicCoach } from '@/lib/publicCoach';

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

function coachName(coach) {
  if (!coach) return 'Coach';
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || coach.name || 'Coach';
}

function packageSessionPriceCents(pkg) {
  const total = Number(pkg?.price_cents);
  if (!Number.isInteger(total) || total <= 0) return null;
  const sessions = Math.max(1, Number(pkg?.sessions) || 1);
  return Math.max(1, Math.floor(total / sessions));
}

function priceForCredit(packages, credit) {
  const active = (packages || [])
    .filter((pkg) => pkg?.is_active !== false && pkg?.is_visible !== false)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || (packageSessionPriceCents(a) || 0) - (packageSessionPriceCents(b) || 0));
  const duration = Number(credit?.session_duration_minutes) || 0;
  const exact = duration
    ? active.find((pkg) => Number(pkg.duration_minutes) === duration)
    : null;
  const pkg = exact || active[0] || null;
  const price = packageSessionPriceCents(pkg);
  return pkg && price ? { pkg, price_cents: price, exact_duration: !!exact || !duration } : null;
}

function UseAnotherCoachDialog({ credit, coaches, onClose }) {
  const navigate = useNavigate();
  const [coachId, setCoachId] = useState('');
  const selectedCoach = coaches.find((coach) => coach.id === coachId) || null;
  const packagesQuery = useQuery({
    queryKey: ['portal', 'coach-packages', coachId],
    enabled: !!coachId,
    queryFn: () => pricingPackageRepo.listForCoach(coachId).catch(() => []),
  });
  const price = priceForCredit(packagesQuery.data || [], credit);
  const remaining = creditRemainingCents(credit);
  const amountDue = price ? Math.max(0, price.price_cents - remaining) : 0;
  const canUse = !!price && amountDue === 0 && credit.status === 'active';
  const bookHref = coachId ? `/book?coach_id=${encodeURIComponent(coachId)}&credit_id=${encodeURIComponent(credit.id)}` : '/book';

  const continueToBooking = () => {
    if (!coachId) return;
    navigate(bookHref);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Use credit with another coach</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choose coach</p>
            <Select value={coachId} onValueChange={setCoachId}>
              <SelectTrigger className="mt-2 w-full border-border bg-secondary">
                <SelectValue placeholder="Select a published coach" />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((coach) => (
                  <SelectItem key={coach.id} value={coach.id}>
                    {coachName(coach)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Your available balance</span>
              <span className="font-bold text-foreground">{usd(remaining)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {selectedCoach ? `${coachName(selectedCoach)} session price` : 'Selected coach price'}
              </span>
              <span className="font-bold text-foreground">
                {packagesQuery.isLoading ? 'Loading...' : price ? usd(price.price_cents) : 'No published price'}
              </span>
            </div>
            {price && !price.exact_duration && (
              <p className="mt-2 text-xs text-yellow-600">
                This coach does not have a matching {credit.session_duration_minutes}-minute package; the booking flow will re-check the exact package.
              </p>
            )}
          </div>

          {coachId && !packagesQuery.isLoading && (
            price ? (
              <p className={`rounded-md border px-3 py-2 text-sm ${
                canUse
                  ? 'border-green-500/20 bg-green-500/10 text-green-600'
                  : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700'
              }`}
              >
                {canUse
                  ? `Covered. ${usd(Math.max(0, remaining - price.price_cents))} will remain after this booking.`
                  : `Top-up needed: ${usd(amountDue)} before this session can be reserved.`}
              </p>
            ) : (
              <p className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                This coach does not have an active published package yet.
              </p>
            )
          )}

          <Button
            onClick={continueToBooking}
            disabled={!coachId || !price}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {canUse ? 'Book with this coach' : 'Continue to top-up checkout'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreditsCard({ user }) {
  const [transferTarget, setTransferTarget] = useState(null);
  const query = useQuery({
    queryKey: ['portal', 'credits', user?.id],
    enabled: !!user?.id,
    queryFn: () => sessionCreditRepo.list('-created_date'),
  });
  const coachesQuery = useQuery({
    queryKey: ['portal', 'published-coaches'],
    queryFn: async () => {
      const res = await callFn('getPublicCoaches', {}).catch(() => ({ coaches: [] }));
      return (res?.coaches || []).map(normalizePublicCoach);
    },
  });

  const credits = query.data || [];
  const coaches = useMemo(() => coachesQuery.data || [], [coachesQuery.data]);
  const coachById = useMemo(() => {
    const map = {};
    (coachesQuery.data || []).forEach((coach) => { map[coach.id] = coach; });
    return map;
  }, [coachesQuery.data]);
  const remaining = credits.reduce((sum, credit) => sum + creditRemainingCents(credit), 0);

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
            {usd(remaining)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              remaining across {credits.length} credit lot{credits.length === 1 ? '' : 's'}
            </span>
          </p>
          <ul className="mt-3 space-y-2">
            {credits.map((credit) => {
              const left = creditRemainingCents(credit);
              const reserved = creditReservedCents(credit);
              const spent = creditSpentCents(credit);
              const originalCoachId = credit.original_coach_id || credit.originating_coach_id || credit.coach_id || '';
              const originalCoach = coachById[originalCoachId];
              return (
                <li key={credit.id} className="rounded-md border border-border bg-background/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{credit.package_name || 'Training package'}</p>
                      <p className="text-xs text-muted-foreground">
                        Original coach: {originalCoach ? coachName(originalCoach) : (originalCoachId ? 'Coach record' : 'Any coach')}
                        {credit.session_duration_minutes ? ` · ${credit.session_duration_minutes}-minute sessions` : ''}
                        {credit.client_email && ` · ${credit.client_email}`}
                      </p>
                    </div>
                    <Badge className={credit.status === 'active' ? 'border-green-500/20 bg-green-500/10 text-green-600' : 'border-border bg-secondary text-muted-foreground'}>
                      {credit.status || 'active'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Remaining</p>
                      <p className="font-bold text-foreground">{usd(left)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Reserved</p>
                      <p className="font-bold text-foreground">{usd(reserved)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Completed/spent</p>
                      <p className="font-bold text-foreground">{usd(spent)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {Number.isInteger(Number(credit.original_amount_cents))
                        ? `${usd(credit.original_amount_cents)} original value`
                        : `${Number(credit.total_credits) || 0} original session credits`}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setTransferTarget(credit)}
                      disabled={left <= 0 || credit.status !== 'active'}
                    >
                      <Repeat2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Use with another coach
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {transferTarget && (
            <UseAnotherCoachDialog
              credit={transferTarget}
              coaches={coaches}
              onClose={() => setTransferTarget(null)}
            />
          )}
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
