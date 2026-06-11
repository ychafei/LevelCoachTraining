import { CANCEL_POLICY_COPY } from '@/lib/policies';

// Canonical FAQ — every answer states what the platform actually enforces
// (see docs/DESIGN_SYSTEM.md voice rules: never claim what isn't enforced).
// Rendered on /faq; individual marketing pages keep their own short lists.
export const FAQ_GROUPS = [
  {
    id: 'athletes',
    label: 'Athletes & booking',
    items: [
      {
        q: 'How do payments work?',
        a: 'You buy session credits through Stripe Checkout — card details never touch LevelCoach servers. Credits unlock booking with your coach, and every charge is visible in your account. LevelCoach never asks you to pay a coach directly or off-platform.',
      },
      {
        q: 'What if I need to cancel or reschedule?',
        a: `${CANCEL_POLICY_COPY} Rescheduling moves your session to a new time that fits your coach's calendar.`,
      },
      {
        q: 'Are the reviews real?',
        a: 'Yes — only clients who completed a session with a coach can leave a review, one per session. There are no imported or invented ratings anywhere on the platform.',
      },
      {
        q: 'What does "Email verified" on a coach profile mean?',
        a: 'Exactly what it says: the coach confirmed their email address with a server-issued code. Before any coach can publish, they must also sign the required legal packet and complete Stripe payout onboarding. We label each check for what it is rather than using a vague "verified" badge.',
      },
      {
        q: 'How do prices work?',
        a: 'Coaches set their own rates and package pricing. You see the starting price on every coach card and profile before you ever enter checkout, and the exact total before you pay.',
      },
      {
        q: "I'm under 18 — can I use LevelCoach?",
        a: 'Absolutely — with your parent or guardian alongside. They sign your training waivers, approve and pay for bookings, and can see your coach messages. You still get your own login, your own progress tracking, and your own training portal.',
      },
    ],
  },
  {
    id: 'parents',
    label: 'Parents & guardians',
    items: [
      {
        q: 'What do I control as a parent?',
        a: 'For athletes under 18, booking and payment run through your parent account, you sign every waiver, and coach messages are visible to you. These rules are enforced on our servers for every booking — they are not optional settings a coach can turn off.',
      },
      {
        q: 'Can I manage more than one child?',
        a: 'Yes. One parent account manages every athlete in your family — sessions, documents, payments, and messages in one place.',
      },
      {
        q: 'How are coaches vetted?',
        a: 'Every coach application is reviewed by a person before a coach account is created. Published coaches have a verified email, a signed legal packet, and completed Stripe payout onboarding. Reviews come only from completed sessions, so ratings reflect real training.',
      },
      {
        q: 'Where does my payment go?',
        a: 'Payments are processed by Stripe and held to the platform rules: coach payouts only flow to onboarded Stripe accounts. If a session is cancelled in time, your credit is restored automatically.',
      },
    ],
  },
  {
    id: 'coaches',
    label: 'Coaches',
    items: [
      {
        q: 'How do I get listed?',
        a: 'Apply with your experience and credentials. A person reviews every application; once approved you build your profile, set availability and pricing, sign the legal packet, and connect Stripe payouts. Publishing unlocks when all of it is complete — nothing goes live half-ready.',
      },
      {
        q: 'How and when do I get paid?',
        a: 'Through Stripe. When a client pays, your share transfers to your connected Stripe account automatically — no invoicing, no manual settlement, no chasing payments.',
      },
      {
        q: 'What does LevelCoach cost?',
        a: 'Listing is free. LevelCoach applies a platform fee to each marketplace booking — you set your own rates and keep the rest. The exact split is visible in your earnings dashboard for every session.',
      },
      {
        q: 'Do I control my own schedule and pricing?',
        a: 'Completely. You define your availability windows, blackout dates, session packages, and rates. Bookings are conflict-checked against your full calendar so you are never double-booked.',
      },
    ],
  },
  {
    id: 'organizations',
    label: 'Organizations',
    items: [
      {
        q: 'What does an organization get?',
        a: 'A branded workspace: your coach roster bookable through the marketplace, team members with role-based access, revenue splits per coach, compliance tracking, and a public organization page.',
      },
      {
        q: 'How do revenue splits work?',
        a: 'You set a payout rule per roster coach. When a client books one of your coaches, Stripe routes each share automatically — coach, organization, and platform — with every movement recorded in a ledger you can audit.',
      },
      {
        q: 'Who can create an organization?',
        a: 'Clubs, academies, school programs, and independent training businesses. You create the workspace free, build your roster, and publish when your legal packet and Stripe payouts are in place.',
      },
    ],
  },
];
