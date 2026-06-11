import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CreditCard,
  Flag,
  MessageCircle,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { CtaBand } from '@/features/marketing/MarketingBlocks';
import { Reveal, Stagger, GradientImage, HeroPattern } from '@/features/marketing/MarketingMotion';
import { MARKETING_IMAGES } from '@/features/marketing/heroImagery';

const MISSION_CARDS = [
  {
    title: 'For athletes',
    body: 'Make it easy to find the right coach for any sport and level, book with confidence, and see real progress over time.',
    icon: Trophy,
  },
  {
    title: 'For parents',
    body: 'Put guardians in control of training for minors — consent, bookings, payments, and message visibility included.',
    icon: UserCheck,
  },
  {
    title: 'For coaches',
    body: 'Give independent coaches a professional storefront, conflict-free scheduling, and automatic Stripe payouts.',
    icon: Users,
  },
  {
    title: 'For organizations',
    body: 'Let academies and clubs run whole rosters with branded pages and automated, secure payouts.',
    icon: Building2,
  },
];

const PRINCIPLES = [
  {
    title: 'Honest by default',
    body: 'Ratings come only from completed sessions. Profiles show what coaches actually entered. We don\'t invent numbers, reviews, or activity.',
    icon: ShieldCheck,
  },
  {
    title: 'Safety is enforced, not promised',
    body: 'Guardian gates for minors, signed waivers before training, verified coach emails, and in-platform messaging are server-side rules of the system.',
    icon: UserCheck,
  },
  {
    title: 'Money moves transparently',
    body: 'Payments are processed by Stripe, verified server-side, and every payout is recorded in an append-only ledger so nothing slips through the cracks.',
    icon: CreditCard,
  },
  {
    title: 'Communication stays accountable',
    body: 'Coach-athlete messaging lives inside the platform where it can be reviewed if something is reported.',
    icon: MessageCircle,
  },
];

export default function About() {
  usePageMeta({
    title: 'About',
    description: 'LevelCoach Training is a multi-sport coaching marketplace with Michigan roots — connecting athletes with coaches and giving coaches and organizations the tools to run their business.',
  });

  return (
    <div className="bg-white text-slate-950">
      {/* Dark editorial hero with imagery */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_15%_0%,#102a5c_0%,#081226_58%,#05080f_100%)] text-white">
        <HeroPattern className="text-white/[0.07]" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <Reveal as="div" y={20}>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-blue-100 backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-blue-300" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-[0.18em]">About LevelCoach Training</span>
              </div>

              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Great coaching should be easy to{' '}
                <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                  find, book, and trust
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                LevelCoach Training is a multi-sport coaching marketplace. Athletes and families find
                and book private coaches across 15 sports and training disciplines; coaches and
                training organizations get the tools to run their business — scheduling, clients,
                progress tracking, and Stripe-powered payouts — from one platform.
              </p>
            </Reveal>

            <Reveal as="div" y={24} delay={0.1} className="hidden lg:block">
              <GradientImage
                src={MARKETING_IMAGES.aboutTeam.src}
                alt={MARKETING_IMAGES.aboutTeam.alt}
                eager
                className="aspect-[5/4] rounded-3xl shadow-2xl shadow-blue-900/40 ring-1 ring-white/20"
                gradientClassName="bg-[linear-gradient(135deg,#0b2350_0%,#13357a_45%,#2563eb_100%)]"
                overlayClassName="bg-gradient-to-t from-slate-950/40 via-transparent to-transparent"
              />
            </Reveal>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
        {/* Mission */}
        <section aria-labelledby="mission-heading">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Our mission</p>
            <h2 id="mission-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950">
              One platform for everyone in training
            </h2>
          </Reveal>
          <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MISSION_CARDS.map(({ title, body, icon: Icon }) => (
              <Stagger.Item key={title}>
                <article className="group h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-display text-lg font-bold tracking-normal text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </article>
              </Stagger.Item>
            ))}
          </Stagger>
        </section>

        {/* Principles */}
        <section className="mt-12" aria-labelledby="principles-heading">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">What we believe</p>
            <h2 id="principles-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950">
              The principles behind the product
            </h2>
          </Reveal>
          <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(({ title, body, icon: Icon }) => (
              <Stagger.Item key={title}>
                <article className="flex h-full gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-normal text-slate-950">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
                  </div>
                </article>
              </Stagger.Item>
            ))}
          </Stagger>
        </section>

        {/* Roots */}
        <Reveal as="section" className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/60 p-6 shadow-sm sm:p-8" aria-labelledby="roots-heading">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
              <Flag className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h2 id="roots-heading" className="font-display text-2xl font-bold tracking-normal text-slate-950">
                Michigan roots, multi-sport ambition
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                LevelCoach Training started with private soccer coaching in Michigan and grew out of
                the day-to-day work of running real training sessions: scheduling around school and
                club calendars, keeping parents informed, and getting coaches paid fairly. Today the
                platform serves 15 sports and training disciplines — and everything we build still
                has to pass the same test it did on day one: would this make a real session, with a
                real coach and a real athlete, better?
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-lg border-blue-200 font-bold text-blue-700 hover:bg-blue-50">
                <Link to="/how-it-works">
                  See how the platform works
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <CtaBand
        title="Join LevelCoach Training"
        description="Whether you're chasing your next level or coaching others to theirs, there's a place for you here."
        primaryCta={{ to: '/create-account', label: 'Create free account' }}
        secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply to coach' }}
      />
    </div>
  );
}
