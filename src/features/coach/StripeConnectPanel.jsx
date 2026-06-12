import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createAccount, onboardingLink, refresh, dashboardLink } from '@/lib/stripeConnect';

// Canonical onboarding state. Prefers the server-synced onboarding_status
// (written by stripeConnect/stripeConnectWebhook); derives the same value for
// rows written before that field existed.
export function connectStatus(account) {
  if (!account) return 'not_started';
  if (account.onboarding_status) return account.onboarding_status;
  if (account.charges_enabled && account.payouts_enabled) return 'active';
  if (!account.details_submitted) return 'incomplete';
  let due = [];
  try { due = JSON.parse(account.requirements_due || '[]'); } catch { due = []; }
  return (Array.isArray(due) && due.length > 0) || account.disabled_reason ? 'restricted' : 'in_review';
}

const STATUS_BADGES = {
  not_started: { label: 'Not connected', tone: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  incomplete: { label: 'Onboarding incomplete', tone: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  in_review: { label: 'In review', tone: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  restricted: { label: 'Action required', tone: 'bg-red-500/10 text-red-600 border-red-500/20' },
  active: { label: 'Payouts active', tone: 'bg-green-500/10 text-green-600 border-green-500/20' },
};

export function connectStatusLabel(account) {
  return STATUS_BADGES[connectStatus(account)] || STATUS_BADGES.not_started;
}

// What the primary button should say for each non-active state.
export const ONBOARD_CTA = {
  not_started: 'Connect with Stripe',
  incomplete: 'Finish Stripe setup',
  in_review: 'Finish Stripe setup',
  restricted: 'Update Stripe account',
};

function requirementsList(account) {
  try {
    const parsed = JSON.parse(account?.requirements_due || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Stripe Connect management panel for a coach. `account` is the
// stripe_connected_accounts row (or the refresh() result merged in);
// `onChanged` is invoked after a server mutation so the parent can reload.
export default function StripeConnectPanel({ coachId, account, onChanged }) {
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const handledStripeParams = useRef(false);

  const state = connectStatus(account);
  const status = STATUS_BADGES[state];
  const due = requirementsList(account);
  const ready = state === 'active';

  const startOnboarding = async () => {
    if (!coachId) return;
    setConnecting(true);
    try {
      if (!account) {
        await createAccount({ owner_type: 'coach', owner_id: coachId });
        await onChanged?.();
      }
      const link = await onboardingLink({ owner_type: 'coach', owner_id: coachId });
      if (link?.url) window.location.assign(link.url);
      else toast.error('Stripe did not return an onboarding link.');
    } catch (err) {
      toast.error(err?.message || 'Could not start Stripe onboarding.');
    } finally {
      setConnecting(false);
    }
  };

  const refreshStatus = async (silent = false) => {
    if (!coachId) return;
    setRefreshing(true);
    try {
      await refresh({
        owner_type: 'coach',
        owner_id: coachId,
        stripe_account_id: account?.stripe_account_id,
      });
      await onChanged?.();
      if (!silent) toast.success('Stripe status refreshed');
    } catch (err) {
      if (!silent) toast.error(err?.message || 'Could not refresh Stripe status.');
    } finally {
      setRefreshing(false);
    }
  };

  // Returning from Stripe-hosted onboarding:
  //   stripe_return=1  — the user finished (or exited) onboarding; pull fresh
  //                      status from Stripe instead of showing a stale panel.
  //   stripe_refresh=1 — Stripe sends users here when the onboarding link
  //                      expired; mint a fresh link and send them straight back.
  useEffect(() => {
    if (handledStripeParams.current) return;
    const returned = searchParams.get('stripe_return');
    const expired = searchParams.get('stripe_refresh');
    if (!returned && !expired) return;
    if (!coachId) return; // wait until the owner record has loaded
    handledStripeParams.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('stripe_return');
    next.delete('stripe_refresh');
    setSearchParams(next, { replace: true });
    if (returned) void refreshStatus(true);
    else void startOnboarding();
    // refreshStatus/startOnboarding are stable for a given coachId; the ref
    // guarantees this runs at most once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, searchParams, setSearchParams]);

  const openDashboard = async () => {
    if (!coachId) return;
    setOpeningDashboard(true);
    try {
      const link = await dashboardLink({ owner_type: 'coach', owner_id: coachId });
      if (link?.url) window.open(link.url, '_blank', 'noopener');
      else toast.error('Stripe did not return a dashboard link.');
    } catch (err) {
      toast.error(err?.message || 'Could not open the Stripe dashboard.');
    } finally {
      setOpeningDashboard(false);
    }
  };

  return (
    <section className="bg-card border border-border rounded-lg p-5" aria-labelledby="stripe-connect-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Wallet className="w-4 h-4 text-accent" aria-hidden="true" />
            <h2 id="stripe-connect-heading" className="text-lg font-bold tracking-[-0.01em] text-foreground">
              Stripe Connect
            </h2>
            <Badge className={`${status.tone} border text-xs font-semibold`}>{status.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Client card payments are collected by the platform and transferred to your Stripe payout account.
            Complete onboarding so payouts can flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!ready && (
            <Button
              onClick={startOnboarding}
              disabled={connecting}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
            >
              <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" />
              {connecting ? 'Opening…' : ONBOARD_CTA[state]}
            </Button>
          )}
          {ready && (
            <Button
              onClick={openDashboard}
              disabled={openingDashboard}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
            >
              <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" />
              {openingDashboard ? 'Opening…' : 'Open Stripe dashboard'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => refreshStatus()}
            disabled={!account || refreshing}
            className="font-semibold"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        {[
          { label: 'Charges enabled', done: !!account?.charges_enabled },
          { label: 'Payouts enabled', done: !!account?.payouts_enabled },
          { label: 'Details submitted', done: !!account?.details_submitted },
        ].map((item) => (
          <div key={item.label} className="border border-border rounded-lg p-3 flex items-center gap-2">
            {item.done
              ? <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden="true" />
              : <AlertTriangle className="w-4 h-4 text-yellow-600" aria-hidden="true" />}
            <span className="text-sm text-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {(due.length > 0 || account?.disabled_reason) && (
        <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-700">
          {account?.disabled_reason && <p className="font-medium">Stripe status: {account.disabled_reason}</p>}
          {due.length > 0 && <p className="mt-1">Outstanding requirements: {due.slice(0, 6).join(', ')}{due.length > 6 ? '…' : ''}</p>}
        </div>
      )}
    </section>
  );
}
