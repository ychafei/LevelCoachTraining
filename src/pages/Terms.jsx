import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { usePageMeta } from '@/features/marketing/usePageMeta';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

export default function Terms() {
  usePageMeta({
    title: 'Terms of Service',
    description: 'Terms of Service for the LevelCoach Training multi-sport coaching marketplace: accounts, bookings, payments via Stripe, guardian consent for minors, and conduct rules.',
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

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <p>Last updated: June 10, 2026</p>

          <h2 className="text-foreground">1. Agreement to Terms</h2>
          <p>
            By accessing or using the LevelCoach Training website and services (collectively, the
            "Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not
            agree, you may not access or use the Services. We may update these Terms; continued use
            after changes constitutes acceptance.
          </p>

          <h2 className="text-foreground">2. Description of Services</h2>
          <p>
            LevelCoach Training is a multi-sport coaching marketplace connecting athletes and their
            families with independent coaches and training organizations. The Services include:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>A public directory of published coach and organization profiles</li>
            <li>Online session booking, scheduling, and credit-based session packages</li>
            <li>In-platform messaging between clients, coaches, and (for minors) guardians</li>
            <li>Training tools such as goals, plans, homework, and skill assessments</li>
            <li>Payment processing and coach/organization payouts via Stripe</li>
            <li>Blog and educational content</li>
          </ul>
          <p>
            Coaches on LevelCoach Training are independent contractors, not employees or agents of
            LevelCoach Training.
          </p>

          <h2 className="text-foreground">3. Accounts & registration</h2>
          <p>
            You must provide accurate, current information when creating an account and keep it up
            to date. You are responsible for safeguarding your credentials and for activity under
            your account. Coach accounts require an approved application; coach profiles are only
            published after email verification, signature of the coach legal packet, and completion
            of Stripe payout onboarding.
          </p>

          <h2 className="text-foreground">4. Minors & guardian consent</h2>
          <p>
            Participants under 18 may only use the Services through a linked parent or legal
            guardian account. Guardians must sign all waivers and consent documents on the minor's
            behalf — minors cannot sign their own waivers. Sessions for minors can only be booked
            by, or with the approval of, the linked guardian, and guardians receive read access to
            the minor's in-platform conversations. These controls are enforced by the platform.
          </p>

          <h2 className="text-foreground">5. Booking, credits & cancellation</h2>
          <p>
            Sessions are booked through the platform against each coach's published availability and
            are validated for conflicts, notice periods, and booking windows. Session packages grant
            credits that are deducted when you book. Bookings require a signed legal packet
            (participation waiver, medical authorization, and platform policies).
          </p>
          <p>
            Cancellation and rescheduling policies are enforced automatically: sessions outside the
            cancellation cutoff window restore credits when cancelled; cancellations inside the
            window and no-shows may forfeit the credit. Coach-initiated cancellations restore the
            client's credit.
          </p>

          <h2 className="text-foreground">6. Payments, fees & refunds</h2>
          <p>
            All payments are processed by Stripe. Prices are computed server-side from configured
            session packages and shown before checkout; all amounts are in US Dollars. LevelCoach
            Training charges coaches and organizations a platform fee (15% of the session price by
            default) which is deducted before payouts; payouts are made via Stripe Connect transfers
            to each coach's or organization's connected account.
          </p>
          <p>
            Refund requests are reviewed case by case and, when approved, are processed back to the
            original payment method with corresponding adjustments to session credits. Contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">{SUPPORT_EMAIL}</a>{' '}
            for refund requests.
          </p>

          <h2 className="text-foreground">7. Assumption of risk</h2>
          <p>
            Athletic training involves inherent physical risks, including but not limited to muscle
            strains, sprains, fractures, concussions, and other injuries. By participating in
            sessions booked through the Services, you (or your guardian, where applicable)
            acknowledge and voluntarily assume those risks and represent that the participant is in
            adequate physical condition to participate. A separate participation waiver and
            assumption-of-risk agreement must be signed before any session.
          </p>

          <h2 className="text-foreground">8. Communication & safety</h2>
          <p>
            Coach-client communication should remain within the platform's messaging system, which
            may be reviewed for safety and policy enforcement, including when a report is filed.
            Guardians of minor participants have visibility into their child's conversations. Do
            not use messaging to send inappropriate, threatening, or harassing content; violations
            may result in suspension or a permanent ban.
          </p>

          <h2 className="text-foreground">9. Code of conduct</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Treat coaches, athletes, families, and staff with respect.</li>
            <li>Arrive on time and prepared for scheduled sessions.</li>
            <li>Provide accurate information during registration and booking.</li>
            <li>Follow safety instructions given by coaches during training.</li>
            <li>Do not attempt to move bookings, payments, or communication off-platform to circumvent these Terms.</li>
          </ul>
          <p>
            Users who violate these Terms may be warned, suspended, or banned. Banned accounts lose
            access to the Services.
          </p>

          <h2 className="text-foreground">10. Reviews</h2>
          <p>
            Reviews may only be submitted by clients after a completed session with the reviewed
            coach, limited to one review per session. We may moderate reviews that violate these
            Terms. Coaches may post public responses.
          </p>

          <h2 className="text-foreground">11. Intellectual property</h2>
          <p>
            All platform content — text, graphics, logos, and software — is the property of
            LevelCoach Training or its licensors. You may not reproduce, distribute, or create
            derivative works without prior written consent.
          </p>

          <h2 className="text-foreground">12. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, LevelCoach Training and its affiliates shall not
            be liable for indirect, incidental, special, consequential, or punitive damages arising
            out of your use of the Services, including injuries during training delivered by
            independent coaches. Our total liability for any claim shall not exceed the amounts you
            paid through the Services in the 12 months preceding the claim.
          </p>

          <h2 className="text-foreground">13. Privacy</h2>
          <p>
            Your use of the Services is also governed by our{' '}
            <a href="/privacy" className="text-accent underline">Privacy Policy</a>.
          </p>

          <h2 className="text-foreground">14. Termination</h2>
          <p>
            We may suspend or terminate accounts for conduct that violates these Terms or harms
            other users, coaches, or the platform. Upon termination, your right to use the Services
            ceases immediately.
          </p>

          <h2 className="text-foreground">15. Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of Michigan, without regard to its
            conflict of law provisions.
          </p>

          <h2 className="text-foreground">16. Contact</h2>
          <p>
            <strong className="text-foreground">LevelCoach Training</strong><br />
            Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
