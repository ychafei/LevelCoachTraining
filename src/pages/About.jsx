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
    body: 'Let academies and clubs run whole rosters with branded pages and automated payout splits.',
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
    body: 'Payments are processed by Stripe, prices are computed server-side, and every payout split is recorded in an append-only ledger.',
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
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_56%,#eef5ff_100%)] text-slate-950">
      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-3 rounded-full bg-blue-50 px-4 py-2 text-blue-700 ring-1 ring-blue-100">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-widest">About LevelCoach Training</span>
          </div>

          <h1 className="mt-6 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
            Great coaching should be easy to{' '}
            <span className="text-blue-600">find, book, and trust</span>
          </h1>

          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            LevelCoach Training is a multi-sport coaching marketplace. Athletes and families find
            and book private coaches across 15 sports and training disciplines; coaches and
            training organizations get the tools to run their business — scheduling, clients,
            progress tracking, and Stripe-powered payouts — from one platform.
          </p>
        </div>

        {/* Mission */}
        <section className="mt-10" aria-labelledby="mission-heading">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Our mission</p>
          <h2 id="mission-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950">
            One platform for everyone in training
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MISSION_CARDS.map(({ title, body, icon: Icon }) => (
              <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 font-display text-lg font-bold tracking-normal text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="mt-10" aria-labelledby="principles-heading">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">What we believe</p>
          <h2 id="principles-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950">
            The principles behind the product
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(({ title, body, icon: Icon }) => (
              <article key={title} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold tracking-normal text-slate-950">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Roots */}
        <section className="mt-10 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="roots-heading">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
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
        </section>
      </section>

      <CtaBand
        title="Join LevelCoach Training"
        description="Whether you're chasing your next level or coaching others to theirs, there's a place for you here."
        primaryCta={{ to: '/create-account', label: 'Create Free Account' }}
        secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply to Coach' }}
      />
    </div>
  );
}
