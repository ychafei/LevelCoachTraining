import React from 'react';
import {
  Building2,
  CircleDollarSign,
  FileSignature,
  Globe,
  Rocket,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  BenefitGrid,
  CtaBand,
  FaqSection,
  MarketingHero,
  StepStrip,
} from '@/features/marketing/MarketingBlocks';
import { usePageMeta } from '@/features/marketing/usePageMeta';

const BENEFITS = [
  {
    title: 'One roster, every coach',
    body: 'Invite coaches to your organization, manage their status, and see your whole roster in the organization portal. Published coaches show your affiliation on their public profiles.',
    icon: Users,
  },
  {
    title: 'Automated payout splits',
    body: 'Set a payout rule per coach link — for example 60% coach / 25% organization / 15% platform. Splits are validated to total 100% and paid out as separate Stripe transfers on every session.',
    icon: CircleDollarSign,
  },
  {
    title: 'A branded public page',
    body: 'Your organization gets a public page at its own URL with your logo, description, sports, service area, and bookable coach roster.',
    icon: Globe,
  },
  {
    title: 'Compliance built in',
    body: 'Your organization signs its own legal agreement, every coach signs the coach packet, and publishing is gated on those signatures plus Stripe payout readiness — enforced server-side.',
    icon: FileSignature,
  },
];

const STEPS = [
  {
    title: 'Create your organization',
    body: 'Set up your organization with its name, sports, service area, and branding. You become the owner with full admin control.',
    icon: Building2,
  },
  {
    title: 'Invite your coaches',
    body: 'Invite coaches by email, set each link\'s payout rule, and manage roles for your admin team.',
    icon: UserPlus,
  },
  {
    title: 'Publish and get paid',
    body: 'Once your legal agreement is signed and Stripe is connected, publish your page. Client payments split automatically between coach, organization, and platform.',
    icon: Rocket,
  },
];

const FAQ = [
  {
    q: 'How do payout splits work?',
    a: 'Each organization-coach link carries a payout rule in percentages that must total 100%. The default is 60% to the coach, 25% to the organization, and 15% to the platform. When a client pays, Stripe transfers each share to the right account from that charge — there is no manual settlement.',
  },
  {
    q: 'Can we change the split per coach?',
    a: 'Yes. Organization owners and admins set the payout rule per coach link, so different coaches can have different splits.',
  },
  {
    q: 'What does the organization page show publicly?',
    a: 'Your logo, name, description, sports, service area, optional website link, and your published coach roster. Internal data — members, payout rules, finances — is never public.',
  },
  {
    q: 'What is required before we can publish?',
    a: 'A signed organization agreement and a ready Stripe Connect account. The publish action is blocked server-side until both are in place, so funds are never trapped.',
  },
  {
    q: 'Do our coaches need their own accounts?',
    a: 'Yes. Each coach applies or accepts your invitation, completes their own profile, email verification, legal packet, and Stripe onboarding. That keeps payouts and accountability per-coach.',
  },
];

export default function ForOrganizations() {
  usePageMeta({
    title: 'For Organizations',
    description: 'Run your academy or club on LevelCoach: coach roster management, automated Stripe payout splits (e.g. 60/25/15), branded public pages, and built-in compliance.',
  });

  return (
    <div className="bg-white text-slate-950">
      <MarketingHero
        eyebrow="For Organizations"
        eyebrowIcon={Building2}
        title="Your academy,"
        highlight="running on autopilot"
        description="Bring your coach roster to LevelCoach: branded public pages, automated payout splits on every session, and compliance gates that protect your club and your athletes."
        primaryCta={{ to: '/apply/organization', label: 'Create an Organization' }}
        secondaryCta={{ to: '/organizations', label: 'See Active Organizations' }}
      />

      <BenefitGrid
        eyebrow="Built for clubs and academies"
        title="Everything an organization needs"
        items={BENEFITS}
        columns={2}
      />

      <StepStrip title="How organizations launch" steps={STEPS} />

      {/* Worked example of the default split — illustrative math, real mechanics. */}
      <section className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-6 lg:px-8" aria-labelledby="split-example-heading">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Example: default payout rule</p>
          <h2 id="split-example-heading" className="mt-2 font-display text-2xl font-bold tracking-normal text-slate-950">
            A $100 session under the default 60 / 25 / 15 split
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Coach receives', '$60', 'bg-blue-50 text-blue-700 ring-blue-100'],
              ['Organization receives', '$25', 'bg-emerald-50 text-emerald-700 ring-emerald-100'],
              ['Platform fee', '$15', 'bg-slate-50 text-slate-700 ring-slate-200'],
            ].map(([label, amount, tone]) => (
              <div key={label} className={`rounded-lg p-4 ring-1 ${tone}`}>
                <p className="text-xs font-bold uppercase tracking-[0.14em]">{label}</p>
                <p className="mt-1 font-display text-3xl font-bold">{amount}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Splits are configured per coach link by your organization admins and validated to total
            100%. Each leg is a real Stripe transfer recorded in the platform ledger.
          </p>
        </div>
      </section>

      <FaqSection items={FAQ} />

      <CtaBand
        title="Bring your organization to LevelCoach"
        description="Create your organization, invite your coaches, and let the platform handle scheduling, payments, and splits."
        primaryCta={{ to: '/apply/organization', label: 'Create an Organization' }}
        secondaryCta={{ to: '/for-coaches', label: 'Coaching Solo Instead?' }}
      />
    </div>
  );
}
