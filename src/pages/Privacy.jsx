import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { usePageMeta } from '@/features/marketing/usePageMeta';

const SUPPORT_EMAIL = 'support@lctrainings.com';

export default function Privacy() {
  usePageMeta({
    title: 'Privacy Policy',
    description: 'How LevelCoach Training collects, uses, and protects personal information — including athlete data, guardian visibility for minors, Stripe payments, and your data rights.',
  });

  return (
    <div className="py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div
          className="mb-8 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
          role="note"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          {/* Deliberately shouting: this is an operational tripwire, not UI voice —
              verify-phase2 asserts the caps marker until counsel signs off. */}
          <p className="text-sm font-bold leading-6">
            OPERATIONAL PLACEHOLDER — ATTORNEY REVIEW REQUIRED. This document describes how the
            platform actually operates but has not yet been reviewed by legal counsel.
          </p>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <p>Last updated: June 10, 2026</p>

          <h2 className="text-foreground">Information we collect</h2>
          <p>
            We collect information you provide when creating an account, booking sessions, signing
            legal agreements, or messaging through the platform. Depending on your role this can
            include name, email, phone number, date of birth, athlete sport and training details,
            guardian-athlete relationships, and uploaded files such as profile photos. Payment card
            details are collected and processed by Stripe, not stored by LevelCoach Training.
          </p>

          <h2 className="text-foreground">How we use information</h2>
          <p>
            Your information is used to operate the marketplace: matching and displaying published
            coach profiles, booking and conflict-checking sessions, processing payments and payouts,
            recording signed agreements, enabling in-platform messaging, and sending transactional
            emails about bookings and account activity. You can unsubscribe from non-essential
            email at any time.
          </p>

          <h2 className="text-foreground">What is public and what is not</h2>
          <p>
            Coach and organization profiles are public once published — that is their purpose.
            Client and athlete profiles are private. Athlete records, sessions, credits, messages,
            and signed agreements are protected with per-account access controls so they are only
            readable by the people involved (for example: the athlete, their coach, and a linked
            guardian).
          </p>

          <h2 className="text-foreground">Minors</h2>
          <p>
            Athletes under 18 use the platform through a linked parent or legal guardian. Guardians
            sign consent and waiver documents on the minor's behalf, control booking and payment
            permissions, and receive read access to the minor's in-platform conversations. We do
            not display minors' personal details publicly.
          </p>

          <h2 className="text-foreground">Sharing & processors</h2>
          <p>
            We do not sell your personal information. We share data only with service providers that
            run the platform: Stripe (payment processing and payouts), our cloud database and
            hosting providers, and our transactional email provider. Coaches see the client
            information necessary to deliver booked sessions.
          </p>

          <h2 className="text-foreground">Messaging review</h2>
          <p>
            Messages sent through the platform may be reviewed for safety and policy enforcement,
            including when a participant files a report. Guardian visibility for minors is described
            above.
          </p>

          <h2 className="text-foreground">Data retention & security</h2>
          <p>
            We retain records needed for legal, payment, and safety purposes — including signed
            agreements, payment and payout records, and audit logs. Access to data is restricted by
            per-account permissions, and administrative actions are logged.
          </p>

          <h2 className="text-foreground">Your data rights</h2>
          <p>
            You may request access to, correction of, or deletion of your personal information,
            subject to records we must keep (such as payment and legal-agreement records). Contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">{SUPPORT_EMAIL}</a>{' '}
            and we will respond to verified requests.
          </p>

          <h2 className="text-foreground">Email preferences</h2>
          <p>
            You can unsubscribe from marketing email via the link in our emails or the{' '}
            <a href="/unsubscribe" className="text-accent underline">unsubscribe page</a>.
            Transactional emails (booking confirmations, receipts, account notices) are sent as part
            of operating the Services.
          </p>

          <h2 className="text-foreground">Contact</h2>
          <p>
            <strong className="text-foreground">LevelCoach Training</strong><br />
            Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
