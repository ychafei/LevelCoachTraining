import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarDays,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PayoutFlow from '@/features/marketing/PayoutFlow';

// Qualitative "how getting paid works" + trust section. Intentionally carries
// no rates, fees, or percentages — those live in the booking/checkout funnel,
// not on public marketing pages.

const PAYOUT_POINTS = [
  {
    title: 'You set your own rates',
    body: 'Your session packages are configured with you when your profile goes live. You stay in control of how you price your training — clients always see the exact amount before they pay.',
    icon: SlidersHorizontal,
  },
  {
    title: 'Secure payouts to your bank',
    body: 'Onboard once with Stripe Express and connect your own bank account. When a client pays, your share is transferred straight to your connected account — no invoicing, no chasing payments.',
    icon: Landmark,
  },
  {
    title: 'You keep what you earn',
    body: 'Every payment is processed by Stripe and recorded in the platform ledger. What you earn is yours, transferred automatically session after session.',
    icon: Banknote,
  },
];

const WHY_COACHES = [
  {
    title: 'Get discovered',
    body: 'Your published profile appears in marketplace search with your sports, specialties, service area, and availability.',
    icon: Users,
  },
  {
    title: 'Protect your time',
    body: 'Recurring windows, date-specific availability, and blackouts keep every booking conflict-free.',
    icon: CalendarDays,
  },
  {
    title: 'Build real trust',
    body: 'A verified-email badge and reviews from completed sessions show clients you are the real thing.',
    icon: BadgeCheck,
  },
];

export default function CoachPricingSection() {
  return (
    <section id="coach-pricing" className="mt-8 scroll-mt-24 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm sm:p-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">How getting paid works</p>
        <h2 className="mt-2 font-display text-3xl font-bold leading-tight tracking-normal text-slate-950 sm:text-4xl">
          Set your rates. Get paid securely.
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Creating an account and applying is free. You decide how you price your training, and Stripe
          moves your earnings straight to your bank — automatically, every session.
        </p>
      </div>

      <PayoutFlow />

      <div className="mx-auto mt-7 grid max-w-[1080px] grid-cols-1 gap-5 md:grid-cols-3">
        {PAYOUT_POINTS.map(({ title, body, icon: Icon }) => (
          <article key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </article>
        ))}
      </div>

      <section className="mx-auto mt-5 max-w-[1080px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[0.34fr_0.04fr_0.62fr]">
          <div className="flex items-center justify-center">
            <img
              src="/pricing-stripe-wordmark.png"
              alt="Stripe"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="hidden h-14 w-px bg-slate-200 md:block" />
          <div className="flex items-center gap-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold tracking-normal text-slate-950">
                Payouts powered by Stripe Connect
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                You onboard once with Stripe Express. Client payments are processed by Stripe and your
                earnings are transferred to your own connected account — money never changes hands
                off-platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-5 max-w-[1080px]">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Why coaches choose LevelCoach</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {WHY_COACHES.map(({ title, body, icon: Icon }) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="font-display text-base font-bold tracking-normal text-slate-950">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Button asChild className="h-11 rounded-lg bg-blue-600 px-6 font-bold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700">
          <Link to="/apply/private-training-coach">
            Apply to coach
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
