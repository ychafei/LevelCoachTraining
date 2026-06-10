import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CircleDollarSign, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Honest fee model only — no subscription tiers, no invented plan pricing.
// The numbers below mirror the server-side split resolution: the platform fee
// defaults to 15% (PLATFORM_FEE_BPS = 1500 basis points) and org-affiliated
// coaches use a configurable per-link payout rule (default 60/25/15).

function SplitBar({ segments }) {
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-slate-200" role="img" aria-label={segments.map((s) => `${s.label} ${s.pct}%`).join(', ')}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={segment.color}
            style={{ width: `${segment.pct}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className={`h-2.5 w-2.5 rounded-full ${segment.color}`} aria-hidden="true" />
            {segment.label} · {segment.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CoachPricingSection() {
  return (
    <section id="coach-pricing" className="mt-8 scroll-mt-24 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm sm:p-6">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Fees & payouts</p>
        <h2 className="mt-2 font-display text-3xl font-bold leading-tight tracking-normal text-slate-950 sm:text-4xl">
          No subscriptions. One transparent platform fee.
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Creating an account and applying is free. When a client pays for training, the platform
          fee — 15% by default — is deducted and the rest is transferred to your Stripe account.
        </p>
      </div>

      <div className="mx-auto mt-7 grid max-w-[1080px] grid-cols-1 gap-5 md:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <User className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold tracking-normal text-slate-950">Independent coach</h3>
              <p className="text-xs font-semibold text-slate-500">Default split on every paid session</p>
            </div>
          </div>
          <div className="mt-5">
            <SplitBar
              segments={[
                { label: 'You', pct: 85, color: 'bg-blue-600' },
                { label: 'Platform', pct: 15, color: 'bg-slate-300' },
              ]}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            You keep everything except the platform fee. Payouts are real Stripe transfers tied to
            the client's charge — no invoicing, no chasing payments.
          </p>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold tracking-normal text-slate-950">Organization-affiliated coach</h3>
              <p className="text-xs font-semibold text-slate-500">Default split — configurable per organization</p>
            </div>
          </div>
          <div className="mt-5">
            <SplitBar
              segments={[
                { label: 'Coach', pct: 60, color: 'bg-blue-600' },
                { label: 'Organization', pct: 25, color: 'bg-emerald-500' },
                { label: 'Platform', pct: 15, color: 'bg-slate-300' },
              ]}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Coaching for an academy or club? Your organization sets the payout rule for your link
            (the shares always total 100%), and each leg is paid out automatically per session.
          </p>
        </article>
      </div>

      <div className="mx-auto mt-5 max-w-[1080px] rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
          <p className="text-sm leading-6 text-slate-600">
            Session prices are set up with you when your profile goes live and are always shown to
            clients before checkout. All amounts are computed server-side — what the client sees is
            exactly what's charged.
          </p>
        </div>
      </div>

      <section className="mx-auto mt-6 max-w-[1080px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
                You onboard once with Stripe Express. Client payments are processed by Stripe and
                your share is transferred to your own connected account.
              </p>
            </div>
          </div>
        </div>
      </section>

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
