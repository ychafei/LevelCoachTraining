import React from 'react';
import {
  CalendarCheck,
  CreditCard,
  Eye,
  FileSignature,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
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
    title: 'You control bookings for minors',
    body: 'Athletes under 18 can only be booked by — or with the approval of — a linked guardian. That rule is enforced on our servers, not just in the app.',
    icon: ShieldCheck,
  },
  {
    title: 'Consent and waivers, signed by you',
    body: 'Minors cannot sign their own waivers. The participation waiver, medical authorization, and consent forms are signed by the guardian and stored against each child.',
    icon: FileSignature,
  },
  {
    title: 'Visibility into messages',
    body: 'When your child messages a coach, you get read access to the conversation automatically. Communication stays inside the platform.',
    icon: Eye,
  },
  {
    title: 'One account, all your kids',
    body: 'Add each child to your guardian account, manage their profiles and permissions (booking, payment, messaging), and see every upcoming session in one place.',
    icon: Users,
  },
  {
    title: 'Payments you can audit',
    body: 'Every payment runs through Stripe Checkout and shows up on your account. Session credits are tracked per athlete, and the cancellation policy is applied automatically.',
    icon: CreditCard,
  },
  {
    title: 'Real progress, not vibes',
    body: 'Coaches record goals, session notes, and sport-specific skill assessments you can review after every session.',
    icon: TrendingUp,
  },
];

const STEPS = [
  {
    title: 'Create a parent account',
    body: 'Sign up as a parent or guardian and add your child or children — their age, sport, and level.',
    icon: UserPlus,
  },
  {
    title: 'Sign once, book anywhere',
    body: 'Sign the legal packet for each child one time. Then compare coaches and book sessions on their behalf.',
    icon: CalendarCheck,
  },
  {
    title: 'Stay in the loop',
    body: 'Follow sessions, messages, and assessments from your parent portal as your athlete develops.',
    icon: UserCheck,
  },
];

const FAQ = [
  {
    q: 'Can my child book a session without me?',
    a: 'Not if they are under 18. Bookings for minors must be made or approved by a linked guardian whose legal packet is signed. This check happens server-side on every booking.',
  },
  {
    q: "Can I read my child's messages with a coach?",
    a: 'Yes. When a minor participates in a conversation, their linked guardian is granted read access to that conversation automatically.',
  },
  {
    q: 'How are coaches vetted?',
    a: 'Before a coach can publish a public profile, they must verify their email address, sign the coach legal packet (including a background-check consent and code of conduct), and complete Stripe payout onboarding. Email-verified coaches show a verified badge.',
  },
  {
    q: 'What happens if a session is cancelled?',
    a: 'The cancellation policy is enforced automatically: sessions cancelled outside the cutoff window restore the session credit to your account. If a coach cancels, credits are restored.',
  },
  {
    q: "Is my child's information public?",
    a: 'No. Athlete profiles are private. Coach profiles are the only public profiles on the platform. Athlete photos and records are stored with per-account access controls.',
  },
];

export default function ForParents() {
  usePageMeta({
    title: 'For Parents',
    description: 'Guardian-controlled booking, signed waivers, message visibility, and Stripe-protected payments — private training for minors with the safeguards built in.',
  });

  return (
    <div className="bg-white text-slate-950">
      <MarketingHero
        eyebrow="For Parents & Guardians"
        eyebrowIcon={ShieldCheck}
        title="Private training for your athlete,"
        highlight="with you in control"
        description="LevelCoach is built so minors never train without guardian consent: you sign the waivers, you book or approve every session, and you can see their messages."
        primaryCta={{ to: '/create-account/parent', label: 'Create Parent Account' }}
        secondaryCta={{ to: '/coaches', label: 'Browse Coaches First' }}
        image={{
          ...MARKETING_IMAGES.parentsHero,
          badge: {
            icon: ShieldCheck,
            title: 'Guardian-gated bookings',
            subtitle: 'Enforced server-side for every minor',
          },
        }}
        highlights={[
          { label: 'You sign every waiver', icon: FileSignature },
          { label: 'Read your child’s messages', icon: Eye },
          { label: 'Stripe-protected payments', icon: CreditCard },
        ]}
      />

      <BenefitGrid
        eyebrow="Safety by design"
        title="Safeguards that are enforced, not promised"
        description="Each of these protections is a server-side rule of the platform — they cannot be skipped by a coach or an athlete."
        items={BENEFITS}
      />

      <StepStrip title="How it works for parents" steps={STEPS} />

      <FaqSection items={FAQ} />

      <CtaBand
        title="Set up your family account"
        description="Add your athletes, sign once, and book with coaches who fit your family's schedule."
        primaryCta={{ to: '/create-account/parent', label: 'Create Parent Account' }}
        secondaryCta={{ to: '/coaches', label: 'Find a Coach' }}
      />
    </div>
  );
}
