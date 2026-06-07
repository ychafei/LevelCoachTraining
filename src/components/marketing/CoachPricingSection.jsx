import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    monthly: '$29',
    yearly: '$24',
    period: '/ month',
    description: 'Everything you need to get started and run your coaching business.',
    action: 'Start free',
    href: '/apply/private-training-coach',
  },
  {
    name: 'Growth',
    monthly: '$79',
    yearly: '$66',
    period: '/ month',
    description: 'Advanced tools to grow your business and manage more clients.',
    action: 'Start free',
    href: '/apply/private-training-coach',
    popular: true,
  },
  {
    name: 'Academy',
    monthly: 'Custom',
    yearly: 'Custom',
    description: 'Built for training organizations with multiple coaches.',
    action: 'Talk to us',
    href: '/for-coaches',
  },
];

const features = [
  { label: 'Coach profile', icon: User, starter: true, growth: true, academy: true },
  { label: 'Bookings', icon: CalendarDays, starter: true, growth: true, academy: true },
  { label: 'Availability', icon: Clock, starter: true, growth: true, academy: true },
  { label: 'Client roster', icon: Users, starter: true, growth: true, academy: true },
  { label: 'Stripe payments', icon: CreditCard, starter: false, growth: true, academy: true },
  { label: 'Organization portal', icon: Building2, starter: false, growth: true, academy: true },
  { label: 'Multiple coaches', icon: Users, starter: false, growth: 'Up to 5', academy: 'Unlimited' },
];

function BillingToggle({ yearly, onChange }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`text-base font-bold transition ${yearly ? 'text-slate-950' : 'text-blue-700'}`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange(!yearly)}
        role="switch"
        aria-checked={yearly}
        className="relative h-9 w-[58px] rounded-full bg-blue-600 shadow-inner shadow-blue-900/20 transition focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
      >
        <span
          className={`absolute top-1 grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm transition ${
            yearly ? 'left-[26px]' : 'left-1'
          }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`text-base font-bold transition ${yearly ? 'text-blue-700' : 'text-slate-950'}`}
      >
        Yearly
      </button>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
        Save 17%
      </span>
    </div>
  );
}

function PlanCard({ plan, yearly }) {
  const price = yearly ? plan.yearly : plan.monthly;

  return (
    <article
      className={`relative flex min-h-[248px] flex-col items-center justify-between rounded-lg border bg-white px-7 py-6 text-center shadow-sm ${
        plan.popular
          ? 'border-blue-300 bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] shadow-blue-600/10'
          : 'border-slate-200'
      }`}
    >
      {plan.popular && (
        <span className="absolute -top-3 rounded-md bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white shadow-sm">
          Popular
        </span>
      )}
      <div className="w-full">
        <h3 className="font-sans text-xl font-bold normal-case tracking-normal text-slate-950">
          {plan.name}
        </h3>
        <p className="mt-4 text-4xl font-bold leading-none text-blue-600 sm:text-[2.75rem]">
          {price}
          {price !== 'Custom' && (
            <span className="ml-2 align-middle text-base font-semibold text-slate-500">{plan.period}</span>
          )}
        </p>
        <div className="mx-auto mt-4 h-px w-full max-w-[250px] bg-slate-200" />
        <p className="mx-auto mt-3 max-w-[280px] text-sm leading-6 text-slate-600">{plan.description}</p>
      </div>
      <Link to={plan.href} className="mt-5 w-full max-w-[240px]">
        <Button
          variant={plan.popular ? 'default' : 'outline'}
          className={`h-11 w-full rounded-lg font-bold ${
            plan.popular
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700'
              : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
          }`}
        >
          {plan.action}
        </Button>
      </Link>
    </article>
  );
}

function FeatureValue({ value }) {
  if (value === true) {
    return (
      <span className="mx-auto grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white">
        <Check className="h-3.5 w-3.5 stroke-[3]" />
      </span>
    );
  }

  if (!value) {
    return <span className="text-lg font-semibold text-slate-400">-</span>;
  }

  return <span className="text-base font-bold text-blue-700">{value}</span>;
}

function FeatureTable() {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] border-b border-slate-200 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        <div className="px-4 py-2.5 sm:px-8">Features</div>
        <div className="px-3 py-2.5 text-center">Starter</div>
        <div className="rounded-t-lg bg-blue-50/70 px-3 py-2.5 text-center text-blue-700">Growth</div>
        <div className="px-3 py-2.5 text-center">Academy</div>
      </div>

      {features.map((feature) => (
        <div key={feature.label} className="grid min-h-[34px] grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] border-b border-slate-200 last:border-b-0">
          <div className="flex items-center gap-3 px-4 py-1.5 sm:px-8">
            <feature.icon className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">{feature.label}</span>
          </div>
          <div className="flex items-center justify-center border-l border-slate-200 px-3 py-1.5">
            <FeatureValue value={feature.starter} />
          </div>
          <div className="flex items-center justify-center border-l border-slate-200 bg-blue-50/70 px-3 py-1.5">
            <FeatureValue value={feature.growth} />
          </div>
          <div className="flex items-center justify-center border-l border-slate-200 px-3 py-1.5">
            <FeatureValue value={feature.academy} />
          </div>
        </div>
      ))}
    </section>
  );
}

function MobileFeatureCards() {
  return (
    <section className="mt-7 space-y-3 lg:hidden">
      {features.map((feature) => (
        <article key={feature.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <feature.icon className="h-5 w-5 text-slate-500" />
            <h3 className="font-sans text-sm font-bold normal-case tracking-normal text-slate-800">
              {feature.label}
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-600">
            <div className="rounded-md bg-slate-50 p-2">
              <p className="mb-2 uppercase tracking-wider text-slate-400">Starter</p>
              <FeatureValue value={feature.starter} />
            </div>
            <div className="rounded-md bg-blue-50 p-2">
              <p className="mb-2 uppercase tracking-wider text-blue-700">Growth</p>
              <FeatureValue value={feature.growth} />
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <p className="mb-2 uppercase tracking-wider text-slate-400">Academy</p>
              <FeatureValue value={feature.academy} />
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

export default function CoachPricingSection() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="coach-pricing" className="mt-8 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm scroll-mt-24 sm:p-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Coach Pricing</p>
        <h2 className="mt-2 font-sans text-3xl font-bold leading-tight normal-case tracking-normal text-slate-950 sm:text-4xl">
          Start Free. Upgrade When You're Ready.
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Create a free coach account first. Choose a plan when you're ready to publish your portal,
          accept bookings, and operate as a coach or training organization.
        </p>
        <BillingToggle yearly={yearly} onChange={setYearly} />
      </div>

      <section className="mx-auto mt-4 grid max-w-[1080px] grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} yearly={yearly} />
        ))}
      </section>

      <div className="hidden lg:block">
        <FeatureTable />
      </div>
      <MobileFeatureCards />

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
              <ShieldCheck className="h-7 w-7" />
            </span>
            <div>
              <h3 className="font-sans text-lg font-bold normal-case tracking-normal text-slate-950">
                Secure payments powered by Stripe
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Accept payments, manage subscriptions, and get paid securely.
                <br className="hidden sm:block" />
                Trusted by millions of businesses worldwide.
              </p>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
