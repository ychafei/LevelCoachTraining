import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  PlayCircle,
  Rocket,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CoachPricingSection from '@/components/marketing/CoachPricingSection';

const heroFeatures = [
  'Manage your schedule, availability, and sessions',
  'Communicate with athletes and track progress',
  'Collect payments securely with Stripe',
  'Build your brand and get discovered',
  'Powerful tools for individual and team coaches',
];

const demoCards = [
  {
    title: 'Coach Portal',
    subtitle: 'Manage your day-to-day coaching business.',
    icon: User,
    image: '/for-coaches-coach-portal.png',
    imageAlt: 'Coach portal dashboard preview',
  },
  {
    title: 'Organization Admin',
    subtitle: 'Run your training organization with powerful admin tools.',
    icon: Building2,
    image: '/for-coaches-org-admin.png',
    imageAlt: 'Organization admin portal preview',
  },
  {
    title: 'Client Management',
    subtitle: 'Keep athletes engaged and track their progress.',
    icon: Users,
    image: '/for-coaches-client-management.png',
    imageAlt: 'Client management dashboard preview',
  },
];

const setupSteps = [
  {
    title: 'Profile',
    body: 'Add your bio, sports, experience, and rates.',
    icon: User,
  },
  {
    title: 'Availability',
    body: 'Set your schedule and session preferences.',
    icon: CalendarDays,
  },
  {
    title: 'Stripe',
    body: 'Connect Stripe to start accepting payments.',
    icon: CreditCard,
    chip: 'Stripe connected',
  },
  {
    title: 'Publish',
    body: 'Go live and start getting booked by athletes.',
    icon: Rocket,
  },
];

function FeatureItem({ children }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <p className="text-sm font-medium leading-6 text-slate-700">{children}</p>
    </div>
  );
}

function DemoCard({ card }) {
  const Icon = card.icon;

  return (
    <article id={card.title === 'Coach Portal' ? 'platform-demo' : undefined} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-base font-bold normal-case tracking-normal text-slate-950">
            {card.title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{card.subtitle}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img
          src={card.image}
          alt={card.imageAlt}
          className="h-auto w-full object-contain"
        />
      </div>
    </article>
  );
}

function SetupStep({ step, isLast }) {
  const Icon = step.icon;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-sm font-bold normal-case tracking-normal text-slate-950">
          {step.title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">{step.body}</p>
        {step.chip && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
            <BadgeCheck className="h-3 w-3" />
            {step.chip}
          </span>
        )}
      </div>
      {!isLast && <ArrowRight className="ml-auto hidden h-6 w-6 shrink-0 text-slate-300 lg:block" />}
    </div>
  );
}

export default function ForCoaches() {
  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_64%,#eef5ff_100%)] text-slate-950">
      <section className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.43fr_0.57fr]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700">
              <Users className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">For Coaches</span>
            </div>

            <h1 className="mt-7 max-w-2xl font-sans text-5xl font-bold leading-[1.08] normal-case tracking-normal text-slate-950 sm:text-6xl lg:text-[4rem]">
              Run your coaching business from <span className="text-blue-600">one portal</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
              LevelCoach Training gives you everything you need to manage athletes, sessions, payments, and grow your coaching business.
            </p>

            <div className="mt-6 space-y-3">
              {heroFeatures.map((feature) => (
                <FeatureItem key={feature}>{feature}</FeatureItem>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/apply/private-training-coach">
                <Button className="h-11 w-full rounded-lg bg-blue-600 px-6 font-bold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700 sm:w-auto">
                  Create a free coach account
                </Button>
              </Link>
              <a href="#platform-demo">
                <Button variant="outline" className="h-11 w-full rounded-lg border-blue-200 bg-white px-6 font-bold text-blue-700 hover:bg-blue-50 sm:w-auto">
                  <PlayCircle className="h-4 w-4" />
                  View platform demo
                </Button>
              </a>
            </div>
          </div>

          <div className="relative min-w-0">
            <img
              src="/for-coaches-hero-devices.png"
              alt="Responsive coach portal laptop and mobile previews"
              className="mx-auto h-auto w-full max-w-[812px] object-contain drop-shadow-[0_22px_44px_rgba(15,23,42,0.14)]"
            />
          </div>
        </div>

        <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {demoCards.map((card) => (
            <DemoCard key={card.title} card={card} />
          ))}
        </section>

        <section className="mt-7 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.22fr_1fr_0.13fr] lg:items-center">
            <div>
              <h2 className="font-sans text-lg font-bold normal-case tracking-normal text-slate-950">
                Get set up in minutes
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Everything you need to launch and grow your coaching business.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:flex lg:items-center lg:gap-6">
              {setupSteps.map((step, index) => (
                <SetupStep key={step.title} step={step} isLast={index === setupSteps.length - 1} />
              ))}
            </div>

            <div className="flex justify-start lg:justify-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                <Eye className="h-4 w-4" />
                Visible to clients
              </span>
            </div>
          </div>
        </section>

        <CoachPricingSection />
      </section>
    </div>
  );
}
