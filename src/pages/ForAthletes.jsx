import React from 'react';
import {
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  MessageCircle,
  Search,
  Star,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  BenefitGrid,
  CtaBand,
  FaqSection,
  MarketingHero,
  StepStrip,
} from '@/features/marketing/MarketingBlocks';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { MARKETING_IMAGES } from '@/features/marketing/heroImagery';

const BENEFITS = [
  {
    title: 'Coaches for your sport and level',
    body: 'Search 15 sports and training types — from soccer and basketball to speed & agility and strength work — and filter by specialty, level, and location.',
    icon: Search,
  },
  {
    title: 'Book around your schedule',
    body: 'Coaches publish real availability windows. You see open times, pick a slot, and the platform blocks conflicts automatically.',
    icon: CalendarCheck,
  },
  {
    title: 'Honest reviews from real sessions',
    body: 'Only clients who completed a session with a coach can leave a review — one per session. No imported or invented ratings.',
    icon: Star,
  },
  {
    title: 'Track your development',
    body: 'Work through goals, training plans, homework, and sport-specific skill assessments your coach updates session by session.',
    icon: TrendingUp,
  },
  {
    title: 'Message your coach in-app',
    body: 'Coordinate sessions and get feedback inside LevelCoach — no need to share personal contact details.',
    icon: MessageCircle,
  },
  {
    title: 'Pay securely with Stripe',
    body: 'Buy session credits through Stripe Checkout. Credits sit on your account and are applied when you book.',
    icon: CreditCard,
  },
];

const STEPS = [
  {
    title: 'Create a free account',
    body: 'Tell us your sport, position, and goals. If you are under 18, a parent or guardian links to your account and signs for you.',
    icon: ClipboardList,
  },
  {
    title: 'Find and book a coach',
    body: 'Compare published profiles, reviews, and live availability. Sign the participation waiver once, then book your session.',
    icon: Search,
  },
  {
    title: 'Train and improve',
    body: 'Complete sessions, get assessed on a 1-10 skill scale built for your sport, and watch your progress add up.',
    icon: Target,
  },
];

const FAQ = [
  {
    q: 'How do I pay for training?',
    a: 'Securely through Stripe Checkout. You confirm everything before anything is charged, and LevelCoach never asks you to pay a coach directly or off-platform.',
  },
  {
    q: 'Are the coaches verified?',
    a: 'Coaches must verify their email address with a server-issued code, sign the coach legal packet, and connect a Stripe payout account before their profile can be published. Profiles that completed email verification carry a verified badge.',
  },
  {
    q: 'What if I am under 18?',
    a: 'A parent or legal guardian must link to your account, sign the waiver and consent forms on your behalf, and book or approve your sessions. Guardians can also read your in-app messages.',
  },
  {
    q: 'Can I cancel or reschedule a session?',
    a: 'Yes. Sessions more than 24 hours away can be rescheduled at no cost, and the cancellation policy is enforced automatically when you cancel — credits are restored according to the policy windows.',
  },
  {
    q: 'How do reviews work?',
    a: 'Reviews can only be submitted by clients who completed a session with that coach, limited to one review per session. Coaches can respond publicly.',
  },
];

export default function ForAthletes() {
  usePageMeta({
    title: 'For Athletes',
    description: 'Find a coach for your sport and level, book sessions around your schedule, pay securely with Stripe, and track goals and skill assessments over time.',
  });

  return (
    <div className="bg-white text-slate-950">
      <MarketingHero
        eyebrow="For Athletes"
        eyebrowIcon={Trophy}
        title="Train with a coach who fits"
        highlight="your game"
        description="Search published coaches across 15 sports, compare real reviews and availability, and book sessions that move you toward your goals."
        primaryCta={{ to: '/coaches', label: 'Find a Coach' }}
        secondaryCta={{ to: '/create-account/athlete', label: 'Create Athlete Account' }}
        image={{
          ...MARKETING_IMAGES.athletesHero,
          badge: {
            icon: Star,
            title: 'Reviews from real sessions',
            subtitle: 'Only completed-session clients can rate',
          },
        }}
        highlights={[
          { label: '15 sports & training types', icon: Trophy },
          { label: 'Live coach availability', icon: CalendarCheck },
          { label: 'Verified coach profiles', icon: BadgeCheck },
        ]}
      />

      <BenefitGrid
        eyebrow="Why athletes use LevelCoach"
        title="Everything between you and your next level"
        items={BENEFITS}
      />

      <StepStrip title="How it works for athletes" steps={STEPS} />

      <FaqSection items={FAQ} />

      <CtaBand
        title="Find your coach today"
        description="Browse the marketplace free — create an account when you're ready to book."
        primaryCta={{ to: '/coaches', label: 'Browse Coaches' }}
        secondaryCta={{ to: '/create-account/athlete', label: 'Create Free Account' }}
      />
    </div>
  );
}
