import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createAccount, onboardingLink, refresh, dashboardLink } from '@/lib/stripeConnect';

export function connectStatusLabel(account) {
  if (!account) return { label: 'Not connected', tone: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' };
  if (account.charges_enabled && account.payouts_enabled) {
    return { label: 'Ready', tone: 'bg-green-500/10 text-green-600 border-green-500/20' };
  }
  if (account.details_submitted) return { label: 'In review', tone: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
  return { label: 'Onboarding needed', tone: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' };
}

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

  const status = connectStatusLabel(account);
  const due = requirementsList(account);
  const ready = !!account?.charges_enabled && !!account?.payouts_enabled;

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

  const refreshStatus = async () => {
    if (!coachId) return;
    setRefreshing(true);
    try {
      await refresh({
        owner_type: 'coach',
        owner_id: coachId,
        stripe_account_id: account?.stripe_account_id,
      });
      await onChanged?.();
      toast.success('Stripe status refreshed');
    } catch (err) {
      toast.error(err?.message || 'Could not refresh Stripe status.');
    } finally {
      setRefreshing(false);
    }
  };

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
              {connecting ? 'Opening…' : account ? 'Continue onboarding' : 'Set up payouts'}
            </Button>
          )}
          {ready && (
            <Button
              onClick={openDashboard}
              disabled={openingDashboard}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
            >
              <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" />
              {openingDashboard ? 'Opening…' : 'View payouts in Stripe'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={refreshStatus}
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
