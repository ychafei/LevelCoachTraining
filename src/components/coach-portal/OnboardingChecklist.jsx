import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

// Real, state-aware checklist. Drives coach onboarding from actual data
// rather than a static 3-step list. Each step has a resolver function
// that reads from user + coach and returns { done, blocking }.

export function computeChecklist(user, coach) {
  const items = [
    {
      key: 'linked',
      label: 'Coach profile linked to your account',
      blurb: 'An admin connects your user account to a Coach record. Clients cannot book you until this is done.',
      href: null,
      done: !!user?.coach_id && !!coach?.id,
      blocking: !user?.coach_id,
    },
    {
      key: 'bio',
      label: 'Write your bio',
      blurb: 'Clients read this when choosing a coach.',
      href: '/coach/profile',
      done: !!(coach?.bio && coach.bio.trim().length > 20),
      blocking: false,
    },
    {
      key: 'photo',
      label: 'Upload a profile photo',
      blurb: 'Coaches with photos get picked more often.',
      href: '/coach/profile',
      done: !!coach?.photo_url,
      blocking: false,
    },
    {
      key: 'training_area',
      label: 'Set your training area',
      blurb: 'Where do you train clients?',
      href: '/coach/profile',
      done: !!(coach?.training_area && coach.training_area.trim().length > 0),
      blocking: false,
    },
    {
      key: 'availability',
      label: 'Set weekly availability',
      blurb: 'Clients can only book when you have availability set.',
      href: '/coach/schedule',
      done: !!coach?.availability && Object.values(coach.availability).some(d => d?.enabled),
      blocking: !(!!coach?.availability && Object.values(coach?.availability || {}).some(d => d?.enabled)),
    },
    {
      key: 'payment',
      label: 'Add at least one payment method',
      blurb: 'Venmo / Zelle / Cash App / PayPal / Cash accepted.',
      href: '/coach/profile',
      done: !!(coach?.venmo || coach?.zelle || coach?.cashapp || coach?.paypal || coach?.cash_accepted),
      blocking: false,
    },
    {
      key: 'email_verified',
      label: 'Verify your contact email',
      blurb: 'Confirms emails from clients will reach you.',
      href: '/coach/profile',
      done: !!coach?.email_verified_at,
      blocking: false,
    },
  ];
  const totalDone = items.filter(i => i.done).length;
  const hasBlocking = items.some(i => i.blocking);
  return { items, totalDone, total: items.length, hasBlocking, pct: Math.round((totalDone / items.length) * 100) };
}

export default function OnboardingChecklist({ user, coach, compact = false }) {
  const { items, totalDone, total, hasBlocking, pct } = computeChecklist(user, coach);
  if (totalDone === total) return null; // fully set up → hide

  const firstIncomplete = items.find(i => !i.done);

  if (compact) {
    return (
      <Link
        to={firstIncomplete?.href || '/coach/profile'}
        className="block bg-card border border-accent/30 rounded-lg p-4 hover:border-accent/60 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-display tracking-widest uppercase text-accent">Profile Setup</p>
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Finish Your Profile</h2>
          <p className="text-xs text-muted-foreground">{totalDone} of {total} complete</p>
        </div>
        <span className="font-display text-xl font-bold text-accent">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {items.map(item => {
          const Icon = item.done
            ? CheckCircle2
            : item.blocking
              ? AlertCircle
              : Circle;
          const iconColor = item.done
            ? 'text-green-400'
            : item.blocking
              ? 'text-destructive'
              : 'text-muted-foreground';

          const content = (
            <div className="flex items-start gap-3 py-2">
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>
                  {item.label}
                </p>
                {!item.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.blurb}</p>
                )}
              </div>
            </div>
          );

          if (item.done || !item.href) {
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
      </ul>
    </div>
  );
}
