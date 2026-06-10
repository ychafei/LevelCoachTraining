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
import { MARKETING_IMAGES } from '@/features/marketing/heroImagery';

const BENEFITS = [
  {
    title: 'One roster, every coach',
    body: 'Invite coaches to your organization, manage their status, and see your whole roster in the organization portal. Published coaches show your affiliation on their public profiles.',
    icon: Users,
  },
  {
    title: 'Flexible payout controls',
    body: 'Configure how every paid session is divided between your coaches and your organization. Each share is paid out as its own secure Stripe transfer — automatically, with no manual settlement.',
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
    body: 'Invite coaches by email, configure how each coach link is paid out, and manage roles for your admin team.',
    icon: UserPlus,
  },
  {
    title: 'Publish and get paid',
    body: 'Once your legal agreement is signed and Stripe is connected, publish your page. Client payments are divided and paid out automatically — no manual settlement.',
    icon: Rocket,
  },
];

const FAQ = [
  {
    q: 'How are payouts handled?',
    a: 'You configure how each paid session is divided between your coaches and your organization. When a client pays, Stripe transfers each share to the right account from that charge — there is no manual settlement.',
  },
  {
    q: 'Can we configure payouts per coach?',
    a: 'Yes. Organization owners and admins control the payout configuration for each coach link, so different coaches can be set up differently.',
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
    description: 'Run your academy or club on LevelCoach: coach roster management, flexible automated Stripe payout controls, branded public pages, and built-in compliance.',
  });

  return (
    <div className="bg-white text-slate-950">
      <MarketingHero
        eyebrow="For Organizations"
        eyebrowIcon={Building2}
        title="Your academy,"
        highlight="running on autopilot"
        description="Bring your coach roster to LevelCoach: branded public pages, automated payouts on every session, and compliance gates that protect your club and your athletes."
        primaryCta={{ to: '/apply/organization', label: 'Create an Organization' }}
        secondaryCta={{ to: '/organizations', label: 'See Active Organizations' }}
        image={{
          ...MARKETING_IMAGES.organizationsHero,
          badge: {
            icon: CircleDollarSign,
            title: 'Automated payouts',
            subtitle: 'Configurable per coach link',
          },
        }}
        highlights={[
          { label: 'Branded public page', icon: Globe },
          { label: 'One roster, every coach', icon: Users },
          { label: 'Secure Stripe transfers', icon: CircleDollarSign },
        ]}
      />

      <BenefitGrid
        eyebrow="Built for clubs and academies"
        title="Everything an organization needs"
        items={BENEFITS}
        columns={2}
      />

      <StepStrip title="How organizations launch" steps={STEPS} />

      {/* Qualitative payout controls — no figures, real mechanics. */}
      <section className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-6 lg:px-8" aria-labelledby="payout-controls-heading">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Payout controls you configure</p>
          <h2 id="payout-controls-heading" className="mt-2 font-display text-2xl font-bold tracking-normal text-slate-950">
            You decide how each session is paid out
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Every coach link in your organization carries its own payout configuration, set by your
            owners and admins. When a client pays, each share is paid out automatically — no spreadsheets,
            no chasing transfers.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Pays each coach', body: 'Coaches receive their earnings directly in their own connected Stripe account.', tone: 'bg-blue-50 text-blue-700 ring-blue-100', icon: Users },
              { label: 'Funds your organization', body: 'Your organization\'s share lands in your connected account on the same charge.', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100', icon: Building2 },
              { label: 'Recorded automatically', body: 'Every transfer is a real Stripe transfer, recorded in the platform ledger.', tone: 'bg-slate-50 text-slate-700 ring-slate-200', icon: FileSignature },
            ].map(({ label, body, tone, icon: Icon }) => (
              <div key={label} className={`rounded-lg p-4 ring-1 ${tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em]">{label}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
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
