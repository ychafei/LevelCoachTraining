import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileSignature,
  Globe,
  Rocket,
  Search,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { CtaBand } from '@/features/marketing/MarketingBlocks';

const JOURNEYS = [
  {
    id: 'athletes',
    eyebrow: 'Athletes & Parents',
    title: 'Book, train, track progress',
    accent: 'blue',
    icon: Trophy,
    cta: { to: '/coaches', label: 'Find a Coach' },
    steps: [
      {
        title: 'Search and compare',
        body: 'Filter published coaches by sport, location, level, availability, organization, price, and specialty. Reviews come only from completed sessions.',
        icon: Search,
      },
      {
        title: 'Sign once, book securely',
        body: 'Sign the participation waiver and policies one time (guardians sign for minors), buy credits through Stripe Checkout, and book a slot from the coach\'s live availability.',
        icon: FileSignature,
      },
      {
        title: 'Train and follow development',
        body: 'Message your coach in-app, complete sessions, and review goals, homework, and sport-specific skill assessments after each one.',
        icon: TrendingUp,
      },
    ],
  },
  {
    id: 'coaches',
    eyebrow: 'Coaches',
    title: 'Apply, get approved, get paid',
    accent: 'emerald',
    icon: Users,
    cta: { to: '/apply/private-training-coach', label: 'Apply to Coach' },
    steps: [
      {
        title: 'Apply and get reviewed',
        body: 'Submit your application with your sports, experience, and service area. Every application is reviewed before a coach account is created.',
        icon: ClipboardList,
      },
      {
        title: 'Complete the publish checklist',
        body: 'Build your profile, set availability, verify your email with a server-issued code, sign the coach legal packet, and connect Stripe. Publishing is blocked until all four are done.',
        icon: BadgeCheck,
      },
      {
        title: 'Get booked and paid via Stripe',
        body: 'Clients book inside your availability windows. When they pay, your share — 85% by default as a solo coach — transfers to your Stripe account automatically.',
        icon: CreditCard,
      },
    ],
  },
  {
    id: 'organizations',
    eyebrow: 'Organizations',
    title: 'Create, invite, split payouts',
    accent: 'violet',
    icon: Building2,
    cta: { to: '/apply/organization', label: 'Create an Organization' },
    steps: [
      {
        title: 'Create your organization',
        body: 'Set up your club or academy with branding, sports, and service area. You become the owner; add admins as needed.',
        icon: Globe,
      },
      {
        title: 'Invite coaches and set splits',
        body: 'Invite coaches to your roster and set a payout rule per link — default 60% coach / 25% organization / 15% platform, always totaling 100%.',
        icon: UserPlus,
      },
      {
        title: 'Publish and collect automatically',
        body: 'Once your agreement is signed and Stripe is ready, your public page goes live. Every paid session splits into separate Stripe transfers — no manual settlement.',
        icon: CircleDollarSign,
      },
    ],
  },
];

const ACCENTS = {
  blue: { chip: 'bg-blue-50 text-blue-700 ring-blue-100', step: 'bg-blue-600' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100', step: 'bg-emerald-600' },
  violet: { chip: 'bg-violet-50 text-violet-700 ring-violet-100', step: 'bg-violet-600' },
};

function JourneyCard({ journey }) {
  const accent = ACCENTS[journey.accent] || ACCENTS.blue;
  const Icon = journey.icon;
  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-lg ring-1 ${accent.chip}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{journey.eyebrow}</p>
          <h2 className="font-display text-2xl font-bold tracking-normal text-slate-950">{journey.title}</h2>
        </div>
      </div>

      <ol className="mt-6 space-y-5">
        {journey.steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${accent.step}`}>
                {index + 1}
              </span>
              {index < journey.steps.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden="true" />}
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <step.icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-bold text-slate-950 sm:text-base">{step.title}</h3>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-auto pt-5">
        <Button asChild variant="outline" className="w-full rounded-lg border-blue-200 font-bold text-blue-700 hover:bg-blue-50">
          <Link to={journey.cta.to}>
            {journey.cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

const GUARANTEES = [
  {
    title: 'Bookings are conflict-checked',
    body: 'Every booking is validated against the coach\'s full calendar — sessions, blocks, and blackouts — for the entire session duration.',
    icon: CalendarCheck,
  },
  {
    title: 'Payments are server-priced',
    body: 'Prices are computed on our servers from configured packages and charged through Stripe. The client always sees the exact amount first.',
    icon: CreditCard,
  },
  {
    title: 'Minors are guardian-gated',
    body: 'Athletes under 18 can only be booked by a linked guardian who has signed consent, and guardians can read their child\'s messages.',
    icon: ShieldCheck,
  },
  {
    title: 'Nothing publishes half-ready',
    body: 'Coach and organization pages only go public after verification, signed agreements, and Stripe payout readiness.',
    icon: Rocket,
  },
];

export default function HowItWorks() {
  usePageMeta({
    title: 'How It Works',
    description: 'Three journeys, one platform: athletes book and track progress, coaches apply and get paid via Stripe, organizations run rosters with automated payout splits.',
  });

  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_68%,#eef5ff_100%)] text-slate-950">
      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
            How LevelCoach works
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
            One marketplace, three journeys. Here's exactly what happens for athletes and parents,
            for coaches, and for training organizations.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {JOURNEYS.map((journey) => (
            <JourneyCard key={journey.id} journey={journey} />
          ))}
        </div>

        <section className="mt-10" aria-labelledby="guarantees-heading">
          <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Under the hood</p>
          <h2 id="guarantees-heading" className="mt-2 text-center font-display text-3xl font-bold tracking-normal text-slate-950">
            Rules the platform enforces for everyone
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map(({ title, body, icon: Icon }) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-slate-950">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <CtaBand
        title="Pick your journey"
        description="Athlete, parent, coach, or organization — start where you are."
        primaryCta={{ to: '/coaches', label: 'Find a Coach' }}
        secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply to Coach' }}
      />
    </div>
  );
}
