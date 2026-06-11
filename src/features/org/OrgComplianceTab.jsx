import React, { useCallback, useEffect, useState } from 'react';
import { organizationRepo, stripeConnectedAccountRepo } from '@/api/repo';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { orgStatusLabel, orgStatusTone } from '@/features/org/orgStatus';
import { AlertTriangle, CheckCircle2, Megaphone, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const GATE_LABELS = {
  legal_packet: 'Organization legal packet signed by an active owner',
  stripe_connect: 'Stripe Connect charges and payouts enabled',
};

// The org's Stripe Connect row (or null) — the same signal the server's
// publish gate checks. Exported so the overview checklist reuses it instead
// of duplicating the query shape.
export async function fetchOrgConnectAccount(organizationId) {
  if (!organizationId) return null;
  const rows = await stripeConnectedAccountRepo
    .filter({ owner_type: 'org', owner_id: organizationId })
    .catch(() => []);
  return rows[0] || null;
}

export function connectAccountReady(account) {
  return !!account?.charges_enabled && !!account?.payouts_enabled;
}

export default function OrgComplianceTab({ organizationId, organization, isOwner, onPublished }) {
  const [legalStatus, setLegalStatus] = useState(null);
  const [connectAccount, setConnectAccount] = useState(null);
  const [publishing, setPublishing] = useState(false);
  // Server-reported unmet publish requirements from the last attempt.
  const [missing, setMissing] = useState(null);

  const loadConnect = useCallback(async () => {
    if (!organizationId) return;
    setConnectAccount(await fetchOrgConnectAccount(organizationId));
  }, [organizationId]);

  useEffect(() => { void loadConnect(); }, [loadConnect]);

  const stripeReady = connectAccountReady(connectAccount);
  const isPublished = organization?.status === 'active';

  const publish = async () => {
    if (!isOwner || publishing) return;
    setPublishing(true);
    setMissing(null);
    try {
      const result = await organizationRepo.publish(organizationId);
      toast.success('Organization published');
      setMissing(null);
      onPublished?.(result?.organization || null);
    } catch (err) {
      const serverMissing = Array.isArray(err?.data?.missing) ? err.data.missing : null;
      if (serverMissing) setMissing(serverMissing);
      toast.error(err?.message || 'Could not publish the organization.');
    } finally {
      setPublishing(false);
    }
  };

  const gates = [
    {
      key: 'legal_packet',
      done: missing ? !missing.includes('legal_packet') : !!legalStatus?.complete,
    },
    {
      key: 'stripe_connect',
      done: missing ? !missing.includes('stripe_connect') : stripeReady,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Publish status</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Publishing lists your organization publicly and enables payment routing to your roster.
              The server re-verifies every requirement on publish.
            </p>
          </div>
          <Badge className={`border text-xs ${orgStatusTone(organization?.status)}`}>
            {orgStatusLabel(organization?.status)}
          </Badge>
        </div>

        <ul className="mt-4 space-y-2" aria-label="Publish requirements">
          {gates.map((gate) => (
            <li key={gate.key} className="flex items-start gap-2 text-sm">
              {gate.done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
                : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
              <span className={gate.done ? 'text-foreground' : 'text-muted-foreground'}>
                {GATE_LABELS[gate.key]}
              </span>
            </li>
          ))}
        </ul>

        {missing && missing.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            The server reported unmet requirements on the last publish attempt. Complete the items above and try again.
          </p>
        )}

        {!isPublished && (
          <div className="mt-5 border-t border-border pt-4">
            <Button
              onClick={publish}
              disabled={!isOwner || publishing}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
            >
              <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
              {publishing ? 'Publishing...' : 'Publish organization'}
            </Button>
            {!isOwner && (
              <p className="mt-2 text-xs text-muted-foreground">Only the organization owner can publish.</p>
            )}
          </div>
        )}
      </div>

      <LegalSignaturePanel
        signerRole="organization_admin"
        organizationId={organizationId}
        title="Organization legal packet"
        description="Sign the organization agreement, authority, safety, and payout documents before publishing."
        onStatusChange={setLegalStatus}
      />
    </div>
  );
}
