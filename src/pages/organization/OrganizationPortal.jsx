import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, CreditCard, ExternalLink, FileCheck2, RefreshCw, Users } from 'lucide-react';
import { organizationRepo, stripeConnectedAccountRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { toast } from 'sonner';
import {
  createStripeConnectAccount,
  createStripeConnectOnboarding,
  refreshStripeConnectAccount,
} from '@/lib/stripeConnect';

export default function OrganizationPortal() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [connectAccount, setConnectAccount] = useState(null);
  const [legalStatus, setLegalStatus] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const orgId = user?.primary_organization_id || user?.organization_memberships?.[0]?.organization_id;
    if (!orgId) return;
    organizationRepo.get(orgId).then(setOrganization).catch(() => setOrganization(null));
    stripeConnectedAccountRepo.filter({ owner_type: 'org', owner_id: orgId })
      .then(rows => setConnectAccount(rows[0] || null))
      .catch(() => setConnectAccount(null));
  }, [user]);

  const orgName = organization?.name || 'Organization workspace';
  const orgId = organization?.id || user?.primary_organization_id || user?.organization_memberships?.[0]?.organization_id || '';
  const stripeReady = !!connectAccount?.charges_enabled && !!connectAccount?.payouts_enabled;

  const requestPublishing = async () => {
    if (!organization?.id || !legalStatus?.complete) return;
    setPublishing(true);
    try {
      const updated = await organizationRepo.update(organization.id, { status: 'pending_review' });
      setOrganization(updated);
      toast.success('Organization submitted for publishing review');
    } catch (err) {
      toast.error(err?.message || 'Could not request publishing review.');
    } finally {
      setPublishing(false);
    }
  };

  const reloadConnectAccount = async () => {
    if (!orgId) return;
    const rows = await stripeConnectedAccountRepo.filter({ owner_type: 'org', owner_id: orgId }).catch(() => []);
    setConnectAccount(rows[0] || null);
  };

  const startOnboarding = async () => {
    if (!orgId) return;
    setConnecting(true);
    try {
      if (!connectAccount) {
        await createStripeConnectAccount({
          ownerType: 'org',
          ownerId: orgId,
          email: organization?.contact_email || user?.email,
        });
        await reloadConnectAccount();
      }
      const link = await createStripeConnectOnboarding({ ownerType: 'org', ownerId: orgId });
      if (link?.url) window.location.href = link.url;
      else toast.error('Stripe did not return an onboarding link.');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not start Stripe onboarding');
    } finally {
      setConnecting(false);
    }
  };

  const refreshStatus = async () => {
    if (!orgId) return;
    setRefreshing(true);
    try {
      await refreshStripeConnectAccount({
        ownerType: 'org',
        ownerId: orgId,
        stripeAccountId: connectAccount?.stripe_account_id,
      });
      await reloadConnectAccount();
      toast.success('Stripe status refreshed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not refresh Stripe status');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Organization Portal</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">{orgName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage organization profile, coach roster, compliance, branding, and payout readiness.
            </p>
          </div>
          <Building2 className="h-10 w-10 text-accent" />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <PortalCard icon={Users} label="Coach roster" body="Roster invitations and org coach approvals will land here." />
          <PortalCard icon={FileCheck2} label="Legal status" body={legalStatus?.complete ? 'Organization documents are current.' : 'Organization documents must be signed before publishing.'} />
          <PortalCard icon={CreditCard} label="Stripe status" body={stripeReady ? 'Stripe Connect payouts are ready.' : connectAccount ? 'Stripe Connect needs attention.' : 'Create a Stripe Connect account for payouts.'} />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Stripe Connect</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Organization payouts require a connected Stripe account before published coaches can receive routed card payments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startOnboarding} disabled={connecting || !orgId} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <ExternalLink className="mr-2 h-4 w-4" />
                {connectAccount ? 'Continue Onboarding' : 'Create Account'}
              </Button>
              <Button variant="outline" onClick={refreshStatus} disabled={!connectAccount || refreshing}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Charges', done: !!connectAccount?.charges_enabled },
              { label: 'Payouts', done: !!connectAccount?.payouts_enabled },
              { label: 'Details', done: !!connectAccount?.details_submitted },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                {item.done ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <LegalSignaturePanel
            signerRole="organization_admin"
            organizationId={orgId}
            title="Organization Legal Packet"
            description="Sign organization authority, roster, privacy, safety, payout, and platform documents before publishing."
            onStatusChange={setLegalStatus}
          />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Tenant Scope</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your active memberships are limited to {user?.organization_memberships?.length || 0} organization scope{(user?.organization_memberships?.length || 0) === 1 ? '' : 's'}.
          </p>
          <Link to="/coaches" className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline">
            View public coach marketplace
          </Link>
          {organization?.status !== 'active' && (
            <div className="mt-5 border-t border-border pt-4">
              <Button
                onClick={requestPublishing}
                disabled={!legalStatus?.complete || publishing || organization?.status === 'pending_review'}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {publishing ? 'Submitting...' : organization?.status === 'pending_review' ? 'Publishing Review Pending' : 'Request Publishing Review'}
              </Button>
              {!legalStatus?.complete && (
                <p className="mt-2 text-xs text-muted-foreground">Complete the organization legal packet before requesting publishing review.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalCard({ icon: Icon, label, body }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <Icon className="h-5 w-5 text-accent" />
      <h2 className="mt-3 text-sm font-semibold text-foreground">{label}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
