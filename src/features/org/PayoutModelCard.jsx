import React, { useState } from 'react';
import { organizationRepo } from '@/api/repo';
import { Badge } from '@/components/ui/badge';
import { Split, Building2, UserRound, Check } from 'lucide-react';
import { toast } from 'sonner';

// The three ways money can flow to coaches on org-affiliated bookings. The
// platform fee (default 15%) is always taken first, server-side.
const MODELS = [
  {
    value: 'split',
    icon: Split,
    title: 'Automatic split (recommended)',
    blurb: 'Stripe pays each coach and your organization their share at the moment of payment — no manual disbursing, full ledger transparency. Set each coach’s split in the Roster tab.',
    tag: 'Most efficient',
  },
  {
    value: 'organization',
    icon: Building2,
    title: 'Organization collects everything',
    blurb: 'Your org’s Stripe account receives the full balance (minus the platform fee). You pay your coaches yourself (payroll, etc.). Best if you already run coach payroll.',
    tag: 'You disburse',
  },
  {
    value: 'coach',
    icon: UserRound,
    title: 'Pay coaches directly',
    blurb: 'Each coach is paid straight to their own Stripe account; the organization takes nothing from bookings.',
    tag: 'Hands-off',
  },
];

export default function PayoutModelCard({ organizationId, organization, isOrgAdmin, onUpdated }) {
  const [model, setModel] = useState(organization?.payout_model || 'split');
  const [saving, setSaving] = useState(false);

  const choose = async (value) => {
    if (value === model || saving) return;
    const previous = model;
    setModel(value);
    setSaving(true);
    try {
      await organizationRepo.update(organizationId, { payout_model: value });
      toast.success('Payout model updated');
      onUpdated?.(value);
    } catch (err) {
      setModel(previous);
      toast.error(err?.message || 'Could not update the payout model.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Payout model</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How coaches get paid for sessions booked through your organization. The platform fee is always taken first.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {MODELS.map((m) => {
          const Icon = m.icon;
          const active = model === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => choose(m.value)}
              disabled={!isOrgAdmin || saving}
              aria-pressed={active}
              className={`text-left rounded-lg border p-4 transition-all disabled:opacity-60 ${
                active ? 'border-accent bg-accent/10 ring-1 ring-accent/30' : 'border-border bg-secondary/40 hover:border-accent/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${active ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
                {active ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : <Badge variant="secondary" className="text-[10px]">{m.tag}</Badge>}
              </div>
              <p className="mt-2 font-semibold text-foreground text-sm">{m.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{m.blurb}</p>
            </button>
          );
        })}
      </div>
      {!isOrgAdmin && (
        <p className="mt-3 text-xs text-muted-foreground">Only organization owners and admins can change the payout model.</p>
      )}
      {model === 'organization' && (
        <p className="mt-3 text-xs text-yellow-600 dark:text-yellow-500">
          Heads up: when your organization collects everything, you are responsible for paying your coaches off-platform.
          Many states regulate handling other people’s money — automatic split avoids that entirely.
        </p>
      )}
    </div>
  );
}
