import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, AlertCircle, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coachRepo } from '@/api/repo';
import { toast } from 'sonner';

// Real, state-aware onboarding checklist mirroring the server-side publish
// gate in the coachSelf function. Every signal comes from actual data:
// the coach record, the Stripe Connect row, and the signed legal packet.
// The 'Publish profile' action calls coachSelf.publish — the server is the
// source of truth and its gating errors are surfaced item by item.

const MISSING_LABELS = {
  legal_packet: 'Sign your coach legal packet',
  stripe_connect: 'Finish Stripe Connect onboarding',
  email_verification: 'Verify your contact email',
  bio: 'Your bio needs at least 80 characters',
  photo: 'Upload a profile photo',
  sport: 'Add at least one sport',
  availability: 'Set weekly availability',
  pricing: 'Create at least one active package',
};

function weeklyAvailabilitySet(coach) {
  const availability = coach?.availability;
  return !!availability && typeof availability === 'object'
    && Object.values(availability).some((d) => d?.enabled);
}

// extras: { connectReady?: boolean, hasSportProfiles?: boolean,
//           legalPacketSigned?: boolean|null, hasActivePackage?: boolean|null }
//           — null/undefined = unknown, never guessed.
export function computeChecklist(user, coach, extras = {}) {
  const items = [
    {
      key: 'linked',
      label: 'Coach profile linked to your account',
      blurb: 'An admin connects your user account to a Coach record. Clients cannot book you until this is done.',
      href: null,
      done: !!coach?.id,
      blocking: !coach?.id,
    },
    {
      key: 'bio',
      label: 'Write your bio (80+ characters)',
      blurb: 'Clients read this when choosing a coach. Publishing requires at least 80 characters.',
      href: '/coach/profile',
      done: String(coach?.bio || '').trim().length >= 80,
      blocking: false,
    },
    {
      key: 'photo',
      label: 'Upload a profile photo',
      blurb: 'Required to publish — coaches with photos get picked more often.',
      href: '/coach/profile',
      done: !!String(coach?.photo_url || '').trim(),
      blocking: false,
    },
    {
      key: 'sport',
      label: 'Add at least one sport',
      blurb: 'Pick your sports and set per-sport specialties so athletes can find you.',
      href: '/coach/profile',
      done: (Array.isArray(coach?.sports) && coach.sports.length > 0) || extras.hasSportProfiles === true,
      blocking: false,
    },
    {
      key: 'availability',
      label: 'Set weekly availability',
      blurb: 'Clients can only book when you have availability set.',
      href: '/coach/settings?section=availability',
      done: weeklyAvailabilitySet(coach),
      blocking: !weeklyAvailabilitySet(coach) && !!coach?.id,
    },
    {
      key: 'stripe_connect',
      label: 'Complete Stripe Connect onboarding',
      blurb: 'A ready Connect account (charges + payouts enabled) is required for payouts and publishing.',
      href: '/coach/earnings',
      done: extras.connectReady === true,
      blocking: false,
    },
    {
      key: 'email_verification',
      label: 'Verify your contact email',
      blurb: 'Confirms emails from clients will reach you.',
      href: '/coach/profile',
      done: !!coach?.email_verified_at,
      blocking: false,
    },
  ];

  // Pricing — publishing requires at least one active package (server
  // hasActivePackage gate). Only shown once known so we never guess.
  if (extras.hasActivePackage !== undefined && extras.hasActivePackage !== null) {
    items.push({
      key: 'pricing',
      label: 'Create at least one active package',
      blurb: 'Athletes book against your packages — at least one active package is required to publish.',
      href: '/coach/profile',
      done: extras.hasActivePackage === true,
      blocking: false,
    });
  }

  if (extras.legalPacketSigned !== undefined && extras.legalPacketSigned !== null) {
    items.push({
      key: 'legal_packet',
      label: 'Sign your coach legal packet',
      blurb: 'The coach agreement and payout acknowledgement must be signed before publishing.',
      href: null,
      done: extras.legalPacketSigned === true,
      blocking: false,
    });
  }

  const totalDone = items.filter((i) => i.done).length;
  const hasBlocking = items.some((i) => i.blocking);
  return {
    items,
    totalDone,
    total: items.length,
    hasBlocking,
    pct: Math.round((totalDone / items.length) * 100),
  };
}

export default function OnboardingChecklist({ user, coach, extras = {}, compact = false, onPublished }) {
  const [publishing, setPublishing] = useState(false);
  const [serverMissing, setServerMissing] = useState([]);

  // Active-package state mirrors the server's hasActivePackage publish gate.
  // Prefer a value supplied by the consumer; otherwise self-load it (tri-state:
  // null = unknown until the fetch resolves, so the item is never guessed).
  const consumerHasActivePackage = extras.hasActivePackage;
  const [loadedHasActivePackage, setLoadedHasActivePackage] = useState(null);

  useEffect(() => {
    if (consumerHasActivePackage !== undefined && consumerHasActivePackage !== null) return undefined;
    if (!coach?.id) { setLoadedHasActivePackage(null); return undefined; }
    let cancelled = false;
    coachRepo.listPackages()
      .then((pkgs) => {
        if (cancelled) return;
        setLoadedHasActivePackage((pkgs || []).some((p) => p?.is_active !== false));
      })
      .catch(() => { if (!cancelled) setLoadedHasActivePackage(null); });
    return () => { cancelled = true; };
  }, [coach?.id, consumerHasActivePackage]);

  const resolvedExtras = consumerHasActivePackage !== undefined && consumerHasActivePackage !== null
    ? extras
    : { ...extras, hasActivePackage: loadedHasActivePackage };

  const { items, totalDone, total, hasBlocking, pct } = computeChecklist(user, coach, resolvedExtras);

  const published = coach?.published === true;
  if (published && totalDone === total) return null; // fully set up + live → hide

  const firstIncomplete = items.find((i) => !i.done);

  const publish = async () => {
    setPublishing(true);
    setServerMissing([]);
    try {
      await coachRepo.publish();
      toast.success('Your profile is live on the marketplace.');
      onPublished?.();
    } catch (err) {
      const missing = Array.isArray(err?.data?.missing) ? err.data.missing : [];
      setServerMissing(missing);
      toast.error(err?.message || 'Could not publish your profile.');
    } finally {
      setPublishing(false);
    }
  };

  if (compact) {
    return (
      <Link
        to={firstIncomplete?.href || '/coach/profile'}
        className="block bg-card border border-accent/30 rounded-lg p-4 hover:border-accent/60 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Profile setup</p>
            <p className="text-sm text-foreground mt-1">
              {totalDone}/{total} complete
              {hasBlocking && <span className="ml-2 text-destructive">· Action needed</span>}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <span className="font-display text-sm font-bold text-accent">{pct}%</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">
            {published ? 'Profile checklist' : 'Get published'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {totalDone} of {total} complete
            {published && <span className="ml-2 text-green-600">· Live on the marketplace</span>}
          </p>
        </div>
        <span className="font-display text-xl font-bold text-accent">{pct}%</span>
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const flaggedByServer = serverMissing.includes(item.key);
          const Icon = item.done && !flaggedByServer
            ? CheckCircle2
            : item.blocking || flaggedByServer
              ? AlertCircle
              : Circle;
          const iconColor = item.done && !flaggedByServer
            ? 'text-green-500'
            : item.blocking || flaggedByServer
              ? 'text-destructive'
              : 'text-muted-foreground';

          const content = (
            <div className="flex items-start gap-3 py-2">
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.done && !flaggedByServer ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>
                  {item.label}
                </p>
                {(!item.done || flaggedByServer) && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.blurb}</p>
                )}
              </div>
            </div>
          );

          if ((item.done && !flaggedByServer) || !item.href) {
            return <li key={item.key} className="px-2 -mx-2 rounded-md">{content}</li>;
          }

          return (
            <li key={item.key}>
              <Link to={item.href} className="block px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
                {content}
              </Link>
            </li>
          );
        })}
        {serverMissing
          .filter((key) => !items.some((i) => i.key === key))
          .map((key) => (
            <li key={key} className="px-2 -mx-2 rounded-md">
              <div className="flex items-start gap-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-destructive" aria-hidden="true" />
                <p className="text-sm text-foreground font-medium">{MISSING_LABELS[key] || key}</p>
              </div>
            </li>
          ))}
      </ul>

      {!published && coach?.id && (
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground max-w-sm">
            Publishing makes your profile bookable on the marketplace. The server re-checks every requirement.
          </p>
          <Button
            onClick={publish}
            disabled={publishing}
            className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
          >
            <Rocket className="w-4 h-4 mr-2" aria-hidden="true" />
            {publishing ? 'Publishing…' : 'Publish profile'}
          </Button>
        </div>
      )}
    </div>
  );
}
