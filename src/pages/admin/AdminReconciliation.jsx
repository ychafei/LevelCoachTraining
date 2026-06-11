import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachRepo, organizationRepo, reportsRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/features/admin/money';
import {
  AlertTriangle, ArrowLeft, BookOpenText, DollarSign, RefreshCw, RotateCcw, Scale, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

const LEDGER_TONES = {
  charge: 'bg-green-500/10 text-green-500 border-green-500/20',
  platform_fee: 'bg-accent/10 text-accent border-accent/20',
  coach_payout: 'bg-primary/10 text-primary border-primary/20',
  org_payout: 'bg-primary/10 text-primary border-primary/20',
  refund: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  transfer_reversal: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  dispute: 'bg-destructive/10 text-destructive border-destructive/20',
};

// Display-only labels for stored ledger entry types.
const LEDGER_LABELS = {
  charge: 'Charge',
  platform_fee: 'Platform fee',
  coach_payout: 'Coach payout',
  org_payout: 'Org payout',
  refund: 'Refund',
  transfer_reversal: 'Transfer reversal',
  dispute: 'Dispute',
};

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return month || '—';
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export default function AdminReconciliation() {
  const { isAdmin } = useCurrentUser();
  const [report, setReport] = useState(null);
  const [coachNames, setCoachNames] = useState({});
  const [orgNames, setOrgNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsRepo.adminReconciliation();
      setReport(data);
      const [coaches, orgs] = await Promise.all([
        coachRepo.list().catch(() => []),
        organizationRepo.list().catch(() => []),
      ]);
      const coachMap = {};
      coaches.forEach((coach) => {
        coachMap[coach.id] = [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || coach.email;
      });
      const orgMap = {};
      orgs.forEach((org) => { orgMap[org.id] = org.name; });
      setCoachNames(coachMap);
      setOrgNames(orgMap);
    } catch (err) {
      setError(err?.message || 'Could not load the reconciliation report.');
      toast.error(err?.message || 'Could not load the reconciliation report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    void load();
     
  }, [isAdmin]);

  const monthly = useMemo(() => [...(report?.monthly || [])].reverse(), [report]);
  const totals = report?.totals || null;

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to admin
            </Link>
            <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Reconciliation</h1>
            <p className="text-muted-foreground">Platform-wide money flow from the payment ledger and Stripe records.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="font-semibold">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        </div>

        {error && (
          <p className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading reconciliation">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : totals && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Gross charges', value: formatCents(totals.gross_cents), icon: DollarSign, hint: `${totals.paid_payment_count} paid payments` },
                { label: 'Platform fee revenue', value: formatCents(totals.platform_fee_cents), icon: TrendingUp, hint: 'fee legs in ledger' },
                { label: 'Refunded', value: formatCents(totals.refunded_cents), icon: RotateCcw, hint: 'accumulated refund amounts' },
                { label: 'Disputes', value: totals.disputed_count, icon: AlertTriangle, hint: 'payments marked disputed' },
              ].map(({ label, value, icon: Icon, hint }) => (
                <div key={label} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Coach payouts</p>
                <p className="mt-2 font-display text-xl font-bold text-foreground">{formatCents(totals.coach_payout_cents)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Org payouts</p>
                <p className="mt-2 font-display text-xl font-bold text-foreground">{formatCents(totals.org_payout_cents)}</p>
              </div>
            </div>

            {totals.gross_cents === 0 && (
              <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
                <Scale className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-foreground">No ledger activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reconciliation data appears as soon as the first Stripe checkout completes.
                </p>
              </div>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* Monthly */}
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">Monthly</h2>
                </div>
                {monthly.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No monthly rows yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          <th scope="col" className="p-3">Month</th>
                          <th scope="col" className="p-3 text-right">Gross</th>
                          <th scope="col" className="p-3 text-right">Fees</th>
                          <th scope="col" className="p-3 text-right">Coach</th>
                          <th scope="col" className="p-3 text-right">Org</th>
                          <th scope="col" className="p-3 text-right">Refunds</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {monthly.slice(0, 18).map((row) => (
                          <tr key={row.month}>
                            <td className="p-3 text-muted-foreground">{monthLabel(row.month)}</td>
                            <td className="p-3 text-right text-foreground">{formatCents(row.charge_cents || 0)}</td>
                            <td className="p-3 text-right text-foreground">{formatCents(row.platform_fee_cents || 0)}</td>
                            <td className="p-3 text-right text-foreground">{formatCents(row.coach_payout_cents || 0)}</td>
                            <td className="p-3 text-right text-foreground">{formatCents(row.org_payout_cents || 0)}</td>
                            <td className="p-3 text-right text-foreground">{formatCents(row.refund_cents || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Recent ledger */}
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-foreground">
                    <BookOpenText className="h-4 w-4 text-accent" aria-hidden="true" /> Recent ledger
                  </h2>
                </div>
                {(report.recent_ledger || []).length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No ledger entries yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {report.recent_ledger.slice(0, 20).map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge className={`border text-[10px] ${LEDGER_TONES[entry.entry_type] || 'bg-secondary text-muted-foreground border-border'}`}>
                            {LEDGER_LABELS[entry.entry_type] || entry.entry_type || 'Entry'}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {entry.owner_type === 'coach' && (coachNames[entry.owner_id] || 'coach')}
                            {entry.owner_type === 'org' && (orgNames[entry.owner_id] || 'organization')}
                            {!['coach', 'org'].includes(entry.owner_type) && (entry.owner_type || 'platform')}
                            {entry.created_at ? ` · ${new Date(entry.created_at).toLocaleDateString()}` : ''}
                          </span>
                        </div>
                        <span className="font-display font-bold text-foreground">{formatCents(entry.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* Per coach */}
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">By coach</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Total payout-leg cents attributed to each coach.</p>
                </div>
                {(report.coaches || []).length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No coach payout legs yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {report.coaches.slice(0, 25).map((row) => (
                      <li key={row.owner_id} className="flex items-center justify-between gap-2 p-3 text-sm">
                        <span className="truncate text-foreground">{coachNames[row.owner_id] || `Coach ${String(row.owner_id).slice(0, 8)}`}</span>
                        <span className="font-display font-bold text-foreground">{formatCents(row.total_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Per org */}
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">By organization</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Total payout-leg cents attributed to each organization.</p>
                </div>
                {(report.orgs || []).length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No organization payout legs yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {report.orgs.slice(0, 25).map((row) => (
                      <li key={row.owner_id} className="flex items-center justify-between gap-2 p-3 text-sm">
                        <span className="truncate text-foreground">{orgNames[row.owner_id] || `Org ${String(row.owner_id).slice(0, 8)}`}</span>
                        <span className="font-display font-bold text-foreground">{formatCents(row.total_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
