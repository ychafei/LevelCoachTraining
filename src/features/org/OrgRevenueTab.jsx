import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { coachRepo, ledgerRepo, reportsRepo, stripeConnectedAccountRepo } from '@/api/repo';
import { createAccount, dashboardLink, onboardingLink, refresh as refreshConnect } from '@/lib/stripeConnect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/features/org/money';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return month || '—';
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export default function OrgRevenueTab({ organizationId, organization, isOrgAdmin }) {
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [coachBreakdown, setCoachBreakdown] = useState([]);
  const [connectAccount, setConnectAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    setReportError('');
    const [reportResult, ledgerResult, accountResult] = await Promise.allSettled([
      isOrgAdmin ? reportsRepo.orgRevenue({ organization_id: organizationId }) : Promise.resolve(null),
      ledgerRepo.filter({ owner_type: 'org', owner_id: organizationId }, '-created_date'),
      stripeConnectedAccountRepo.filter({ owner_type: 'org', owner_id: organizationId }),
    ]);
    if (reportResult.status === 'fulfilled') {
      setReport(reportResult.value);
    } else {
      setReport(null);
      setReportError(reportResult.reason?.message || 'Could not load the revenue report.');
    }
    if (ledgerResult.status === 'fulfilled') {
      // Per-coach breakdown computed from the org's own ledger legs (each org
      // payout leg carries the coach the payment originated from).
      const byCoach = new Map();
      for (const entry of ledgerResult.value) {
        if (!entry.coach_id) continue;
        const cents = Number(entry.amount_cents);
        if (!Number.isInteger(cents)) continue;
        byCoach.set(entry.coach_id, (byCoach.get(entry.coach_id) || 0) + cents);
      }
      const rows = [...byCoach.entries()]
        .map(([coachId, cents]) => ({ coach_id: coachId, total_cents: cents }))
        .sort((a, b) => b.total_cents - a.total_cents);
      if (rows.length > 0) {
        const coaches = await coachRepo.filter({ id: rows.map((row) => row.coach_id) }).catch(() => []);
        const names = {};
        coaches.forEach((coach) => {
          names[coach.id] = [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || coach.email;
        });
        rows.forEach((row) => { row.name = names[row.coach_id] || `Coach ${row.coach_id.slice(0, 8)}`; });
      }
      setCoachBreakdown(rows);
    }
    setConnectAccount(accountResult.status === 'fulfilled' ? (accountResult.value[0] || null) : null);
    setLoading(false);
  }, [organizationId, isOrgAdmin]);

  useEffect(() => { void load(); }, [load]);

  const stripeReady = !!connectAccount?.charges_enabled && !!connectAccount?.payouts_enabled;

  const startOnboarding = async () => {
    setBusy('onboard');
    try {
      if (!connectAccount) {
        await createAccount({ owner_type: 'org', owner_id: organizationId });
      }
      const link = await onboardingLink({ owner_type: 'org', owner_id: organizationId });
      if (link?.url) window.location.assign(link.url);
      else toast.error('Stripe did not return an onboarding link.');
    } catch (err) {
      toast.error(err?.message || 'Could not start Stripe onboarding.');
    } finally {
      setBusy('');
    }
  };

  const refreshStatus = async () => {
    setBusy('refresh');
    try {
      await refreshConnect({
        owner_type: 'org',
        owner_id: organizationId,
        stripe_account_id: connectAccount?.stripe_account_id,
      });
      await load();
      toast.success('Stripe status refreshed');
    } catch (err) {
      toast.error(err?.message || 'Could not refresh the Stripe status.');
    } finally {
      setBusy('');
    }
  };

  const openDashboard = async () => {
    setBusy('dashboard');
    try {
      const link = await dashboardLink({ owner_type: 'org', owner_id: organizationId });
      if (link?.url) window.open(link.url, '_blank', 'noopener');
      else toast.error('Stripe did not return a dashboard link.');
    } catch (err) {
      toast.error(err?.message || 'Could not open the Stripe dashboard.');
    } finally {
      setBusy('');
    }
  };

  const totals = report?.totals || null;
  const monthly = useMemo(() => [...(report?.monthly || [])].reverse(), [report]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading revenue">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stripe Connect */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Stripe Connect</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organization payouts require a ready Stripe Connect account before any organization share can transfer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!stripeReady && (
              <Button onClick={startOnboarding} disabled={!!busy || !isOrgAdmin} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy === 'onboard' ? 'Opening...' : connectAccount ? 'Continue onboarding' : 'Set up payouts'}
              </Button>
            )}
            {stripeReady && (
              <Button onClick={openDashboard} disabled={!!busy} variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy === 'dashboard' ? 'Opening...' : 'Stripe dashboard'}
              </Button>
            )}
            <Button variant="outline" onClick={refreshStatus} disabled={!connectAccount || !!busy}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {busy === 'refresh' ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Charges enabled', done: !!connectAccount?.charges_enabled },
            { label: 'Payouts enabled', done: !!connectAccount?.payouts_enabled },
            { label: 'Details submitted', done: !!connectAccount?.details_submitted },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              {item.done
                ? <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                : <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {reportError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {reportError}
        </p>
      )}

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Earned (ledger)', value: formatCents(totals.earned_cents) },
            { label: 'Transfers paid', value: formatCents(totals.transfers_paid_cents) },
            { label: 'Transfers pending', value: formatCents(totals.transfers_pending_cents) },
            { label: 'Transfers reversed', value: formatCents(totals.transfers_reversed_cents) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {totals && totals.earned_cents === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">No revenue recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue appears here once clients purchase sessions with your roster coaches
            {organization?.status !== 'active' ? ' — publish your organization first.' : '.'}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Monthly */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
              <TrendingUp className="h-4 w-4 text-accent" aria-hidden="true" /> Monthly revenue
            </h2>
          </div>
          {monthly.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No monthly activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {monthly.slice(0, 12).map((row) => (
                <li key={row.month} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground">{monthLabel(row.month)}</span>
                  <span className="font-display font-bold text-foreground">{formatCents(row.earned_cents || 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Per-coach */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Per-coach breakdown</h2>
            <p className="mt-1 text-xs text-muted-foreground">Organization share attributed to each roster coach.</p>
          </div>
          {coachBreakdown.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No coach-attributed revenue yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {coachBreakdown.map((row) => (
                <li key={row.coach_id} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-foreground">{row.name}</span>
                  <Badge variant="outline" className="font-display">{formatCents(row.total_cents)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
