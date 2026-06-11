import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { CheckCircle2, FileSignature, ShieldCheck, UserPlus, Users } from 'lucide-react';

/**
 * Parent / guardian consent — explanatory flow.
 *
 * The old self-serve token link was forgeable and the server no longer accepts
 * client-side consent writes. A minor's participation is now authorized by the
 * guardian signing the legal packet from THEIR OWN parent account: the
 * `family` function links the athlete, and `signLegalAgreement` requires a
 * guardian-linked athlete_id for every guardian signing.
 */
export default function ParentConsent() {
  const { isAuthenticated, isGuardian } = useAuth();

  const steps = [
    {
      icon: UserPlus,
      title: '1. Create a parent account (or sign in)',
      body: 'Consent must come from your own parent/guardian account — not from your child\'s login or an email link.',
    },
    {
      icon: Users,
      title: '2. Link your athletes',
      body: 'Add each child athlete to your family account. This creates a verified guardian link with booking, payment, and messaging controls.',
    },
    {
      icon: FileSignature,
      title: '3. Sign the guardian legal packet',
      body: 'Sign the guardian authority, participation waiver, medical, media, and safety documents per athlete. Each signature is recorded with the document version and checksum.',
    },
    {
      icon: CheckCircle2,
      title: '4. Your athlete is authorized',
      body: 'Once signed, booking and protected features unlock for that athlete. You can review signed copies anytime from your parent portal.',
    },
  ];

  return (
    <div className="min-h-[80vh] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
            <ShieldCheck className="h-7 w-7 text-accent" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-[-0.01em] text-foreground sm:text-4xl">
            Parent / guardian consent
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Athletes under 18 participate on LevelCoach Training only with verified parent or
            guardian authorization. Email consent links are no longer used — authorization happens
            by signing the guardian legal packet from your own parent account.
          </p>
        </div>

        <ol className="mt-8 space-y-3">
          {steps.map((step) => (
            <li key={step.title} className="flex items-start gap-4 rounded-lg border border-border bg-card p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                <step.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-foreground">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {isAuthenticated && isGuardian ? (
            <Link
              to="/parent"
              className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Open your parent portal
            </Link>
          ) : (
            <>
              <Link
                to="/create-account/parent"
                className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Create a parent account
              </Link>
              <Link
                to="/login?next=%2Fparent"
                className="rounded-lg border border-border bg-card px-6 py-3 text-center text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Sign in to an existing account
              </Link>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          You can revoke an athlete's permissions anytime from your parent portal. Questions? Email{' '}
          <a href="mailto:contact@levelcoachtraining.com" className="text-accent underline">
            contact@levelcoachtraining.com
          </a>.
        </p>
      </div>
    </div>
  );
}
