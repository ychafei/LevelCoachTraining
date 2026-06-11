import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Eye,
  FileSignature,
  Flag,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal, Stagger } from '@/features/marketing/MarketingMotion';
import { CANCEL_POLICY_COPY } from '@/lib/policies';
import { SUPPORT_EMAIL } from '@/lib/site';

// Everything on this page is a server-enforced platform rule, not policy
// prose. Each card states exactly what is checked or enforced — never more.
const SAFEGUARDS = [
  {
    title: 'Every coach application is reviewed by a person',
    body: 'Nobody self-publishes onto the marketplace. A coach applies with their experience and credentials, a human reviews the application, and only approved coaches can build a profile.',
    icon: UserCheck,
  },
  {
    title: 'Publishing has hard requirements',
    body: 'Before a coach profile can go live, the coach must verify their email with a server-issued code, sign the required legal packet, and complete Stripe payout onboarding. Profiles cannot publish half-ready.',
    icon: BadgeCheck,
  },
  {
    title: 'Guardian controls for athletes under 18',
    body: 'For any athlete under 18, booking and payment run through their parent or guardian, every waiver is guardian-signed, and coach messages are visible to the guardian. These rules are enforced on our servers for every booking.',
    icon: ShieldCheck,
  },
  {
    title: 'Signed waivers before training',
    body: 'The required legal packet — waiver, medical authorization, and policies — must be signed before a session can be booked. The server blocks checkout until it is complete.',
    icon: FileSignature,
  },
  {
    title: 'Payments never leave the platform',
    body: 'All payments are processed by Stripe — card details never touch LevelCoach servers — and coach payouts only flow to onboarded Stripe accounts. Anyone asking you to pay off-platform is breaking the rules: report it.',
    icon: CreditCard,
  },
  {
    title: 'Reviews come only from real sessions',
    body: 'Only clients who completed a session with a coach can leave a review, one per session. No imported ratings, no invented stars.',
    icon: Star,
  },
  {
    title: 'Messages stay visible to guardians',
    body: 'Coach–athlete messaging happens in the platform. When the athlete is under 18, the guardian can read the conversation — quiet side-channels are not part of the product.',
    icon: Eye,
  },
];

export default function Safety() {
  usePageMeta({
    title: 'Safety — How LevelCoach Protects Athletes & Families',
    description: 'Human-reviewed coach applications, hard publishing requirements, guardian-controlled booking for under-18 athletes, signed waivers, Stripe-protected payments, and reviews only from completed sessions.',
  });

  return (
    <div className="bg-white text-slate-950">
      <section className="texture-grain relative overflow-hidden bg-[radial-gradient(120%_120%_at_15%_0%,#102a5c_0%,#081226_55%,#05080f_100%)] px-4 py-14 text-white sm:px-6 lg:px-8">
        <Reveal className="relative mx-auto max-w-[1100px]">
          <p className="section-num text-slate-300 [&::after]:bg-white/20" data-num="01">Trust &amp; safety</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">
            Safety here is a system, not a promise
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Most of LevelCoach&rsquo;s protections are rules our servers enforce on every single
            booking — they are not optional settings, and no coach can switch them off. This
            page lists exactly what is checked and enforced, and nothing more.
          </p>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SAFEGUARDS.map(({ title, body, icon: Icon }) => (
            <Stagger.Item key={title} y={10}>
              <article className="h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-3 text-base font-bold text-slate-950">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            </Stagger.Item>
          ))}
        </Stagger>

        <Reveal className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-bold text-slate-950">Cancellations &amp; your money</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">{CANCEL_POLICY_COPY}</p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            The same policy appears at every booking button on the site, so there is never a
            surprise at checkout.
          </p>
        </Reveal>

        <Reveal className="mt-6 rounded-lg border border-amber-200 bg-amber-50/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <Flag className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">See something off? Tell us.</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-700">
                  Concerns about a coach, a session, or a message go straight to the team and
                  are reviewed ahead of everything else.
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

        <Reveal className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50/60 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Ready when you are</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Every safeguard above is already active on every coach you see.
            </p>
          </div>
          <Button asChild className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
            <Link to="/coaches">
              Find a coach
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </div>
  );
}
