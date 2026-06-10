import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  organizationCoachRepo,
  organizationRepo,
  payoutRuleRepo,
  reportsRepo,
  stripeConnectedAccountRepo,
} from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import StripeConnectPanel from '@/features/coach/StripeConnectPanel';
import { formatCents, formatMonthLabel, formatBps } from '@/features/coach/money';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const DEFAULT_PLATFORM_FEE_BPS = 1500; // ARCHITECTURE.md §4 default

const TYPE_LABELS = {
  coach_payout: 'Session payouts',
  org_payout: 'Organization payouts',
  platform_fee: 'Platform fees',
  charge: 'Charges',
  refund: 'Refunds',
  refund_reversal: 'Refund reversals',
  transfer_reversal: 'Transfer reversals',
};

function typeLabel(type) {
  return TYPE_LABELS[type] || String(type || 'other').replace(/_/g, ' ');
}

export default function CoachEarnings() {
  const { isAdmin } = useAuth();
  const { coach, loading: coachLoading } = useMyCoach();

  const [earnings, setEarnings] = useState(null);
  const [earningsError, setEarningsError] = useState('');
  const [connectAccount, setConnectAccount] = useState(null);
  const [orgLink, setOrgLink] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [payoutRule, setPayoutRule] = useState(null);
  const [loading, setLoading] = useState(true);

  const coachId = coach?.id || '';

  const load = useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    const [earn, accountRows, linkRows] = await Promise.all([
      reportsRepo.coachEarnings().catch((err) => {
        setEarningsError(err?.message || 'Could not load earnings.');
        return null;
      }),
      stripeConnectedAccountRepo.filter({ owner_type: 'coach', owner_id: coachId }).catch(() => []),
      organizationCoachRepo.filter({ coach_id: coachId, status: 'active' }).catch(() => []),
    ]);
    setEarnings(earn);
    setConnectAccount(accountRows?.[0] || null);

    const link = linkRows?.[0] || null;
    setOrgLink(link);
    if (link?.organization_id) {
      const [rules, org] = await Promise.all([
        payoutRuleRepo.filter({ organization_id: link.organization_id, coach_id: coachId }).catch(() => []),
        organizationRepo.get(link.organization_id).catch(() => null),
      ]);
      setPayoutRule(rules?.[0] || null);
      setOrgName(org?.name || '');
    } else {
      setPayoutRule(null);
      setOrgName('');
    }
    setLoading(false);
  }, [coachId]);

  useEffect(() => {
    if (coachLoading) return;
    if (!coachId) { setLoading(false); return; }
    void load();
  }, [coachId, coachLoading, load]);

  const monthly = useMemo(() => (earnings?.monthly || []).map((bucket) => ({
    month: bucket.month,
    label: formatMonthLabel(bucket.month),
    earned: (Number(bucket.earned_cents) || 0) / 100,
    sessions_completed: Number(bucket.sessions_completed) || 0,
  })), [earnings]);

  const byType = useMemo(() => {
    const map = earnings?.totals?.by_type;
    if (!map || typeof map !== 'object') return [];
    return Object.entries(map)
      .map(([type, cents]) => ({ type, cents: Number(cents) || 0 }))
      .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
  }, [earnings]);

  if (coachLoading || loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading earnings">
        <div className="h-9 w-44 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-secondary/50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border bg-secondary/50" />
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Your admin account is not linked to a coach record, so there are no earnings to show.'
              : 'Earnings need a linked coach record. Ask an admin to link your account.'}
          </p>
        </div>
      </div>
    );
  }

  const platformFeeBps = Number.isFinite(Number(coach.platform_fee_bps)) && coach.platform_fee_bps !== null && coach.platform_fee_bps !== undefined && coach.platform_fee_bps !== ''
    ? Number(coach.platform_fee_bps)
    : DEFAULT_PLATFORM_FEE_BPS;

  const totals = earnings?.totals || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Earnings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Computed server-side from the payment ledger and real Stripe transfers.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Earned',
            value: totals ? formatCents(totals.earned_cents) : '—',
            sub: 'ledger, all-time',
            icon: DollarSign,
          },
          {
            label: 'Paid Out',
            value: totals ? formatCents(totals.transfers_paid_cents) : '—',
            sub: totals && Number(totals.transfers_pending_cents) > 0
              ? `${formatCents(totals.transfers_pending_cents)} pending`
              : 'via Stripe transfers',
            icon: Wallet,
          },
          {
            label: 'Sessions Completed',
            value: totals ? totals.sessions_completed : '—',
            sub: 'all-time',
            icon: Receipt,
          },
          {
            label: 'Reversed',
            value: totals ? formatCents(totals.transfers_reversed_cents) : '—',
            sub: 'refund transfer reversals',
            icon: TrendingUp,
          },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4 text-accent" aria-hidden="true" />
              <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {earningsError && (
        <div className="bg-card border border-destructive/30 rounded-lg p-4 text-sm text-destructive break-words">
          {earningsError}
        </div>
      )}

      {/* Stripe Connect */}
      <StripeConnectPanel coachId={coachId} account={connectAccount} onChanged={load} />

      {/* Fee disclosure + org split */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">How You're Paid</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Platform fee: <span className="text-foreground font-semibold">{formatBps(platformFeeBps)}</span> of each
            client payment{coach.platform_fee_bps == null || coach.platform_fee_bps === '' ? ' (platform default)' : ' (set for your account)'}.
          </p>
          {orgLink && payoutRule ? (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <p className="text-foreground font-semibold mb-1">
                Organization split{orgName ? ` — ${orgName}` : ''}
              </p>
              <ul className="space-y-0.5">
                <li>Your share: <span className="text-foreground">{formatBps(payoutRule.coach_share_bps)}</span></li>
                <li>Organization share: <span className="text-foreground">{formatBps(payoutRule.org_share_bps)}</span></li>
                <li>Platform share: <span className="text-foreground">{formatBps(payoutRule.platform_share_bps)}</span></li>
              </ul>
            </div>
          ) : orgLink ? (
            <p>
              You're linked to an organization{orgName ? ` (${orgName})` : ''}, but no payout split has been set yet —
              the default org split applies until your organization admin configures one.
            </p>
          ) : (
            <p>You're a solo coach: you keep {formatBps(10000 - platformFeeBps)} of each payment.</p>
          )}
          <p className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />
            All splits are computed server-side at payment time and recorded in an append-only ledger.
          </p>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Monthly Earnings</h2>
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">from the ledger</span>
        </div>
        {monthly.length === 0 ? (
          <div className="py-12 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">No earnings recorded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Your monthly totals appear after your first paid session.</p>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly.slice(-12)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  formatter={(value) => [value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Earned']}
                />
                <Bar dataKey="earned" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Ledger breakdown by type */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">Ledger Breakdown</h2>
        {byType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ledger entries yet — entries are created when clients pay.</p>
        ) : (
          <div className="divide-y divide-border">
            {byType.map(({ type, cents }) => (
              <div key={type} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-foreground capitalize">{typeLabel(type)}</span>
                <span className={`font-display text-sm font-bold ${cents < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {formatCents(cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
