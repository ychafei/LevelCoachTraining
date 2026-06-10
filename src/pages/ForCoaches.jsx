import React from 'react';
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  MessageCircle,
  Rocket,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  BenefitGrid,
  CtaBand,
  FaqSection,
  MarketingHero,
  StepStrip,
} from '@/features/marketing/MarketingBlocks';
import CoachPricingSection from '@/components/marketing/CoachPricingSection';
import { usePageMeta } from '@/features/marketing/usePageMeta';

const BENEFITS = [
  {
    title: 'Get discovered in the marketplace',
    body: 'Your published profile appears in search with your sports, specialties, service area, availability, and reviews from completed sessions.',
    icon: Search,
  },
  {
    title: 'Scheduling that protects your time',
    body: 'Set recurring weekly windows, date-specific availability, and blackouts. Bookings are validated against your full calendar — no double-booking.',
    icon: CalendarDays,
  },
  {
    title: 'Paid through Stripe Connect',
    body: 'Onboard once with Stripe Express. When clients pay, your share is transferred to your account automatically — see every payout in your earnings view.',
    icon: CreditCard,
  },
  {
    title: 'Manage clients in one portal',
    body: 'Sessions, client roster, in-app messaging, and session notes live in your coach portal — on desktop or your phone.',
    icon: Users,
  },
  {
    title: 'Coach with structure',
    body: 'Build goals, training plans, homework, and sport-specific 1-10 skill assessments for each athlete and update them session by session.',
    icon: TrendingUp,
  },
  {
    title: 'Reviews you can stand behind',
    body: 'Only clients who completed a session with you can review you — one per session — and you can respond publicly.',
    icon: BadgeCheck,
  },
];

const STEPS = [
  {
    title: 'Apply',
    body: 'Submit your coaching application — sports, experience, and service area. Our team reviews every application.',
    icon: ClipboardList,
  },
  {
    title: 'Get set up',
    body: 'Once approved: build your profile, set availability, verify your email, sign the coach legal packet, and connect Stripe.',
    icon: MessageCircle,
  },
  {
    title: 'Publish and get booked',
    body: 'Publishing is gated on those checks, so the moment you go live you can take bookings and get paid.',
    icon: Rocket,
  },
];

const FAQ = [
  {
    q: 'How much does it cost to join?',
    a: 'Nothing. Applying and maintaining a profile is free. The platform takes a percentage of paid sessions — 15% by default — and the rest is transferred to your Stripe account.',
  },
  {
    q: 'How and when do I get paid?',
    a: 'Through Stripe Connect. When a client completes checkout, your share is transferred to your connected Stripe account from that charge. You can open your Stripe Express dashboard from the coach portal at any time.',
  },
  {
    q: 'What do I need before I can publish my profile?',
    a: 'Four things, enforced at publish time: a complete profile, a verified email address, the signed coach legal packet (including background-check consent and code of conduct), and a ready Stripe payout account.',
  },
  {
    q: 'Can I coach under an academy or club?',
    a: 'Yes. Organizations on LevelCoach invite coaches to their roster and set a payout split for the link (default 60% coach / 25% organization / 15% platform). Your profile shows the affiliation.',
  },
  {
    q: 'Who sets my session prices?',
    a: 'Session packages are configured with you when your profile is set up, and prices are computed server-side at checkout — clients always see the exact amount before paying.',
  },
  {
    q: 'What about coaching minors?',
    a: 'Bookings for athletes under 18 must come from a linked guardian who has signed consent, and guardians can read their child\'s messages with you. These rules are enforced automatically.',
  },
];

export default function ForCoaches() {
  usePageMeta({
    title: 'For Coaches',
    description: 'Run your coaching business on LevelCoach: marketplace visibility, conflict-free scheduling, client management, and Stripe Connect payouts with a transparent 15% platform fee.',
  });

  return (
    <div className="bg-white text-slate-950">
      <MarketingHero
        eyebrow="For Coaches"
        eyebrowIcon={Users}
        title="Run your coaching business from"
        highlight="one portal"
        description="Get discovered by athletes, manage your schedule and clients, and get paid automatically through Stripe — with one transparent platform fee and no subscription."
        primaryCta={{ to: '/apply/private-training-coach', label: 'Apply to Coach' }}
        secondaryCta={{ to: '/coaches', label: 'See the Marketplace' }}
      />

      <BenefitGrid
        eyebrow="What you get"
        title="The tools, the clients, and the payouts"
        items={BENEFITS}
      />

      <StepStrip title="From application to first booking" steps={STEPS} />

      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <CoachPricingSection />
      </div>

      <FaqSection items={FAQ} />

      <CtaBand
        title="Ready to grow your coaching business?"
        description="Apply in minutes. Once approved, you control your profile, your schedule, and your prices."
        primaryCta={{ to: '/apply/private-training-coach', label: 'Apply to Coach' }}
        secondaryCta={{ to: '/how-it-works', label: 'How It Works' }}
      />
    </div>
  );
}
