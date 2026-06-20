import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  FileText,
  Flag,
  HelpCircle,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal } from '@/features/marketing/MarketingMotion';

const SUPPORT_EMAIL = 'support@lctrainings.com';

// Every entry routes to a real page or a real inbox — no chat widgets,
// phone trees, or help-center shells that go nowhere.
const QUICK_HELP = [
  {
    title: 'Booking & scheduling',
    body: 'How sessions, credits, cancellations, and rescheduling work.',
    icon: CalendarDays,
    to: '/faq#athletes',
    label: 'Read the booking FAQ',
  },
  {
    title: 'Payments & refunds',
    body: 'Stripe checkout, session credits, cancellation windows, and where your money goes.',
    icon: CreditCard,
    to: '/faq#parents',
    label: 'Read the payments FAQ',
  },
  {
    title: 'Account & sign-in',
    body: 'Reset your password or get back into your account.',
    icon: KeyRound,
    to: '/forgot-password',
    label: 'Reset password',
  },
  {
    title: 'Find a coach',
    body: 'Search published coaches by sport, location, price, and availability.',
    icon: Search,
    to: '/coaches',
    label: 'Browse coaches',
  },
  {
    title: 'Coach payouts & publishing',
    body: 'Applications, profile publishing requirements, and Stripe payouts for coaches.',
    icon: Users,
    to: '/faq#coaches',
    label: 'Read the coach FAQ',
  },
  {
    title: 'Legal documents',
    body: 'Universal account terms, privacy notice, and the agreements signed before training.',
    icon: FileText,
    to: '/terms',
    label: 'Read the terms',
  },
];

export default function Support() {
  usePageMeta({
    title: 'Support — LevelCoach Training',
    description: 'Get help with booking, payments, accounts, coach publishing, and safety on LevelCoach Training. Real replies from the team by email.',
  });

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-12 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-[1100px]">
          <p className="section-num" data-num="01">Support</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Most questions are answered in the guides below. For everything else, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-blue-700 hover:underline">{SUPPORT_EMAIL}</a>{' '}
            — a person on the team reads and answers every message.
          </p>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_HELP.map(({ title, body, icon: Icon, to, label }) => (
            <Reveal key={title} as="article" className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-base font-bold text-slate-950">{title}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-600">{body}</p>
              <Link to={to} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
                {label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Reveal>
          ))}
        </div>

        {/* Safety has its own lane — it must never be buried in general support. */}
        <Reveal className="mt-8 rounded-lg border border-amber-200 bg-amber-50/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <Flag className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">Report a safety concern</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-700">
                  Concerned about a coach, a session, or a message? Tell us directly — safety
                  reports are reviewed first, ahead of everything else.
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0 rounded-lg bg-amber-600 px-5 font-bold text-white hover:bg-amber-700">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Safety concern')}`}>
                Report a concern
              </a>
            </Button>
          </div>
        </Reveal>

        <Reveal className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-950">Want the full picture first?</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The FAQ covers booking, money, vetting, and payouts in plain language.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-lg border-blue-200 px-5 font-bold text-blue-700 hover:bg-blue-50">
              <Link to="/faq">
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                Read the FAQ
              </Link>
            </Button>
            <Button asChild className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email support
              </a>
            </Button>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
