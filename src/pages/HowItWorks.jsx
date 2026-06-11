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
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { CtaBand } from '@/features/marketing/MarketingBlocks';
import { Reveal, Stagger, GradientImage, HeroPattern } from '@/features/marketing/MarketingMotion';
import { MARKETING_IMAGES } from '@/features/marketing/heroImagery';

const JOURNEYS = [
  {
    id: 'athletes',
    eyebrow: 'Athletes & Parents',
    title: 'Book, train, track progress',
    accent: 'blue',
    icon: Trophy,
    cta: { to: '/coaches', label: 'Find a coach' },
    steps: [
      {
        title: 'Search and compare',
        body: 'Filter published coaches by sport, location, level, availability, organization, and specialty. Reviews come only from completed sessions.',
        icon: Search,
      },
      {
        title: 'Sign once, book securely',
        body: 'Sign the participation waiver and policies one time (parents sign for athletes under 18), buy credits through Stripe Checkout, and book a slot from the coach\'s live availability.',
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
    cta: { to: '/apply/private-training-coach', label: 'Apply to coach' },
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
        body: 'Clients book inside your availability windows. You set your own rates, and when they pay, your earnings transfer to your Stripe account automatically.',
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
    cta: { to: '/apply/organization', label: 'Create an organization' },
    steps: [
      {
        title: 'Create your organization',
        body: 'Set up your club or academy with branding, sports, and service area. You become the owner; add admins as needed.',
        icon: Globe,
      },
      {
        title: 'Invite coaches and configure payouts',
        body: 'Invite coaches to your roster and configure how each coach link is paid out between coach and organization.',
        icon: UserPlus,
      },
      {
        title: 'Publish and collect automatically',
        body: 'Once your agreement is signed and Stripe is ready, your public page goes live. Every paid session is paid out as secure Stripe transfers — no manual settlement.',
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

// The line between step numbers draws itself top-down as the card scrolls
// into view — the journey literally traces forward. Static for reduced motion.
function StepConnector({ delay }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden="true" />;
  }
  return (
    <motion.span
      className="mt-1 w-px flex-1 origin-top bg-slate-300"
      aria-hidden="true"
      initial={{ scaleY: 0 }}
      whileInView={{ scaleY: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    />
  );
}

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
              {index < journey.steps.length - 1 && <StepConnector delay={0.15 + index * 0.25} />}
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
        {/* Each journey card carries its audience's real next step — these are
            the page's primary CTAs, not footnotes. */}
        <Button asChild className="w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700">
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
    title: 'Payments are Stripe-secured',
    body: 'Every payment is verified on our servers and processed through Stripe. The client always confirms the full amount before anything is charged.',
    icon: CreditCard,
  },
  {
    title: 'Under-18s are guardian-gated',
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
    description: 'Three journeys, one platform: athletes book and track progress, coaches apply and get paid via Stripe, organizations run rosters with automated payouts.',
  });

  return (
    <div className="bg-white text-slate-950">
      {/* Dark editorial hero with an action image band */}
      <section className="texture-grain relative overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,#102a5c_0%,#081226_58%,#05080f_100%)] text-white">
        <HeroPattern className="text-white/[0.07]" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
              <Rocket className="h-4 w-4 text-blue-300" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">The full picture</span>
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
              How{' '}
              <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                LevelCoach
              </span>{' '}
              works
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              One marketplace, three journeys. Here&apos;s exactly what happens for athletes and parents,
              for coaches, and for training organizations.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mx-auto mt-10 max-w-4xl">
            <GradientImage
              src={MARKETING_IMAGES.trackStart.src}
              alt={MARKETING_IMAGES.trackStart.alt}
              eager
              className="aspect-[21/9] rounded-3xl shadow-2xl shadow-blue-900/40 ring-1 ring-white/20"
              gradientClassName="bg-[linear-gradient(135deg,#0b2350_0%,#13357a_45%,#2563eb_100%)]"
              overlayClassName="bg-gradient-to-t from-slate-950/45 via-transparent to-transparent"
            />
          </Reveal>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
        <Stagger className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {JOURNEYS.map((journey) => (
            <Stagger.Item key={journey.id} className="flex">
              <JourneyCard journey={journey} />
            </Stagger.Item>
          ))}
        </Stagger>

        <section className="mt-12" aria-labelledby="guarantees-heading">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Under the hood</p>
            <h2 id="guarantees-heading" className="mt-2 text-center font-display text-3xl font-bold tracking-normal text-slate-950">
              Rules the platform enforces for everyone
            </h2>
          </Reveal>
          <Stagger className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map(({ title, body, icon: Icon }) => (
              <Stagger.Item key={title}>
                <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-slate-950">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{body}</p>
                </article>
              </Stagger.Item>
            ))}
          </Stagger>
        </section>
      </section>

      <CtaBand
        title="Pick your journey"
        description="Athlete, parent, coach, or organization — start where you are."
        primaryCta={{ to: '/coaches', label: 'Find a coach' }}
        secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply to coach' }}
      />
    </div>
  );
}
