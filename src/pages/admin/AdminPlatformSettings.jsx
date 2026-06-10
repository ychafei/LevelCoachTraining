import React, { useEffect, useMemo, useState } from 'react';
import { siteContentRepo, organizationRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { SlidersHorizontal, Percent, Building2, Info, ShieldAlert } from 'lucide-react';

const DEFAULT_GLOBAL_BPS = '1500';
const MAX_FEE_PERCENT = 50; // 5000 bps cap, enforced server-side too.

// Basis points <-> percent. Fees are stored as integer bps; the UI works in
// percent for legibility. 1500 bps = 15.00%.
function bpsToPercent(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n) / 100);
}

// Parse a percent string to an integer bps in [0, 5000], or null when invalid.
function percentToBps(percent) {
  const n = Number(String(percent).trim());
  if (!Number.isFinite(n)) return null;
  const bps = Math.round(n * 100);
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000) return null;
  return bps;
}

function FeeExplainer() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
      <div className="space-y-2">
        <p>
          The platform fee is the platform&apos;s cut of each booking. It is resolved
          automatically at checkout in this order:
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>The coach&apos;s own override, if set.</li>
          <li>Otherwise, for bookings routed through an active organization, that org&apos;s override.</li>
          <li>Otherwise, this global platform fee.</li>
          <li>Otherwise, the server default (15%).</li>
        </ol>
        <p>
          Coaches and organizations set their own payout splits separately — this is only
          the platform&apos;s share.
        </p>
        <p className="text-xs">
          <span className="font-display uppercase tracking-wider text-foreground">Pricing philosophy:</span>{' '}
          Coach package prices stay publicly visible to buyers. The platform fee is a
          backend cut shown to coaches and orgs as their net payout — never surfaced to buyers.
        </p>
      </div>
    </div>
  );
}

function GlobalFeeCard({ isSuperAdmin }) {
  const [loading, setLoading] = useState(true);
  const [currentBps, setCurrentBps] = useState(null);
  const [percent, setPercent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    siteContentRepo.getValue('platform_fee_bps')
      .then((value) => {
        if (cancelled) return;
        const bps = Number.parseInt(value ?? DEFAULT_GLOBAL_BPS, 10);
        const safeBps = Number.isInteger(bps) ? bps : Number.parseInt(DEFAULT_GLOBAL_BPS, 10);
        setCurrentBps(safeBps);
        setPercent(bpsToPercent(safeBps));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const parsedBps = percentToBps(percent);
  const invalid = percent !== '' && parsedBps === null;
  const dirty = parsedBps !== null && parsedBps !== currentBps;

  const save = async () => {
    if (parsedBps === null) {
      toast.error(`Enter a platform fee between 0% and ${MAX_FEE_PERCENT}%.`);
      return;
    }
    setSaving(true);
    try {
      await siteContentRepo.setPlatformFee(parsedBps);
      setCurrentBps(parsedBps);
      setPercent(bpsToPercent(parsedBps));
      toast.success('Global platform fee updated. It applies to new bookings automatically.');
    } catch (err) {
      toast.error(err?.message || 'Could not update the platform fee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <Percent className="h-4 w-4 text-accent" aria-hidden="true" />
        <h2 className="font-display text-lg tracking-wider text-foreground">GLOBAL PLATFORM FEE</h2>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Applied to every booking that has no coach or organization override. Takes effect
        immediately for new checkouts.
      </p>

      {loading ? (
        <Skeleton className="h-10 w-full max-w-xs" />
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="global-fee-percent" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
              Platform fee (%)
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="global-fee-percent"
                type="number"
                inputMode="decimal"
                min="0"
                max={MAX_FEE_PERCENT}
                step="0.01"
                value={percent}
                disabled={!isSuperAdmin || saving}
                aria-invalid={invalid}
                aria-describedby="global-fee-hint"
                onChange={(e) => setPercent(e.target.value)}
                className="bg-secondary border-border"
              />
              <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
            </div>
            <p id="global-fee-hint" className="mt-1 text-xs text-muted-foreground">
              {invalid
                ? `Enter a value between 0% and ${MAX_FEE_PERCENT}%.`
                : `Current: ${bpsToPercent(currentBps)}% (${currentBps} bps).`}
            </p>
          </div>

          {isSuperAdmin ? (
            <Button
              onClick={save}
              disabled={saving || invalid || !dirty}
              className="bg-accent text-accent-foreground font-display uppercase tracking-wider hover:bg-accent/90"
            >
              {saving ? 'Saving…' : 'Save global fee'}
            </Button>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Only a super admin can change the global platform fee.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function OrgFeeRow({ org, globalBps, onSaved }) {
  const overrideBps = Number.isInteger(org.platform_fee_bps) ? org.platform_fee_bps : null;
  const [percent, setPercent] = useState(overrideBps === null ? '' : bpsToPercent(overrideBps));
  const [saving, setSaving] = useState(false);

  const parsedBps = percentToBps(percent);
  const cleared = percent.trim() === '';
  const invalid = !cleared && parsedBps === null;
  const effectiveBps = overrideBps ?? globalBps;
  const dirty = !invalid && !cleared && parsedBps !== overrideBps;

  const save = async () => {
    if (parsedBps === null) {
      toast.error(`Enter a fee between 0% and ${MAX_FEE_PERCENT}%.`);
      return;
    }
    setSaving(true);
    try {
      await organizationRepo.setPlatformFee(org.id, parsedBps);
      toast.success(`Override set for ${org.name}.`);
      onSaved(org.id, parsedBps);
    } catch (err) {
      toast.error(err?.message || 'Could not set the organization fee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{org.name}</p>
        <p className="text-xs text-muted-foreground">
          Effective fee: <span className="text-foreground">{bpsToPercent(effectiveBps)}%</span>
          {overrideBps === null ? ' (using global)' : ' (org override)'}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Label htmlFor={`org-fee-${org.id}`} className="sr-only">
            Platform fee override for {org.name} (percent)
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id={`org-fee-${org.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              max={MAX_FEE_PERCENT}
              step="0.01"
              placeholder={bpsToPercent(globalBps)}
              value={percent}
              disabled={saving}
              aria-invalid={invalid}
              onChange={(e) => setPercent(e.target.value)}
              className="bg-secondary border-border"
            />
            <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={save}
          disabled={saving || invalid || !dirty}
          className="bg-accent text-accent-foreground font-display uppercase tracking-wider hover:bg-accent/90"
        >
          {saving ? 'Saving…' : 'Set'}
        </Button>
      </div>
    </div>
  );
}

function OrgFeesCard({ globalBps }) {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    organizationRepo.list('name')
      .then((rows) => { if (!cancelled) setOrgs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onSaved = (orgId, bps) => {
    setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, platform_fee_bps: bps } : o)));
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-6">
        <div className="mb-1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="font-display text-lg tracking-wider text-foreground">PER-ORGANIZATION OVERRIDES</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          The platform&apos;s cut for bookings routed through an organization. Leave blank to
          inherit the global fee. Coach-level overrides still take precedence over these.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-muted-foreground">
          Organizations are not reachable right now. Confirm the{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-foreground">organizations</code>{' '}
          collection is provisioned.
        </div>
      ) : orgs.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No organizations yet. When orgs are created, set per-org platform fees here.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orgs.map((org) => (
            <OrgFeeRow key={org.id} org={org} globalBps={globalBps} onSaved={onSaved} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminPlatformSettings() {
  const { isAdmin, isSuperAdmin, loading } = useCurrentUser();
  const [globalBps, setGlobalBps] = useState(Number.parseInt(DEFAULT_GLOBAL_BPS, 10));

  useEffect(() => {
    let cancelled = false;
    siteContentRepo.getValue('platform_fee_bps').then((value) => {
      if (cancelled) return;
      const bps = Number.parseInt(value ?? DEFAULT_GLOBAL_BPS, 10);
      if (Number.isInteger(bps)) setGlobalBps(bps);
    });
    return () => { cancelled = true; };
  }, []);

  const heading = useMemo(() => (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-accent" aria-hidden="true" />
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          PLATFORM SETTINGS
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Platform fee and pricing controls for LevelCoach Training.
      </p>
    </div>
  ), []);

  if (loading) {
    return (
      <div className="py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Skeleton className="mb-8 h-9 w-64" />
          <Skeleton className="mb-6 h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;
  }

  return (
    <div className="py-12">
      <div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        {heading}
        <FeeExplainer />
        <GlobalFeeCard isSuperAdmin={isSuperAdmin} />
        <OrgFeesCard globalBps={globalBps} />
      </div>
    </div>
  );
}
