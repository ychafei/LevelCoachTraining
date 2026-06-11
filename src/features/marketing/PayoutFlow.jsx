import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CreditCard, Landmark, ShieldCheck } from 'lucide-react';

// Animated payout-flow diagram for the For Coaches page: a payment travels
// booking → Stripe → the coach's bank as a small amber dot, on loop. The
// point is to make "you get paid automatically" legible at a glance.
// Qualitative only — no amounts, fees, or percentages (those live in the
// checkout funnel). Reduced-motion users get the same diagram, static.

const STOPS = [
  {
    title: 'Client books & pays',
    body: 'Checkout happens on-platform — the client sees the exact amount first.',
    icon: CreditCard,
  },
  {
    title: 'Stripe processes',
    body: 'Stripe Connect handles the charge and splits your earnings from it.',
    icon: ShieldCheck,
  },
  {
    title: 'Your bank',
    body: 'Your share lands in your own connected account. No invoicing.',
    icon: Landmark,
  },
];

function Connector({ delay, reduce }) {
  return (
    <div
      className="relative mx-auto h-8 w-px shrink-0 bg-slate-200 sm:mx-0 sm:h-px sm:w-full sm:self-center"
      aria-hidden="true"
    >
      {reduce ? (
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />
      ) : (
        <>
          {/* vertical traveler (stacked layout) */}
          <motion.span
            className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,166,35,0.7)] sm:hidden"
            initial={{ top: '0%', opacity: 0 }}
            animate={{ top: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, delay, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
          />
          {/* horizontal traveler (row layout) */}
          <motion.span
            className="absolute top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,166,35,0.7)] sm:block"
            initial={{ left: '0%', opacity: 0 }}
            animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, delay, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
          />
        </>
      )}
    </div>
  );
}

export default function PayoutFlow() {
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto mt-7 max-w-[1080px] rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
      <div className="flex flex-col sm:grid sm:grid-cols-[1fr_minmax(2rem,0.35fr)_1fr_minmax(2rem,0.35fr)_1fr] sm:items-stretch sm:gap-0">
        {STOPS.map(({ title, body, icon: Icon }, index) => (
          <React.Fragment key={title}>
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-display text-base font-bold tracking-normal text-slate-950">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">{body}</p>
            </div>
            {index < STOPS.length - 1 && (
              // Stagger the two legs so one payment appears to flow end-to-end.
              <Connector delay={index * 1.4} reduce={reduce} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
