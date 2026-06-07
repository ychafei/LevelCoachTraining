import React from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Search,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';

const audienceCards = [
  {
    title: 'For Athletes & Parents',
    color: 'blue',
    image: '/how-athletes-parents.png',
    imageAlt: 'Athlete and parent using LevelCoach',
    items: [
      'Find the right coach for your goals',
      'Book sessions that fit your schedule',
      'Track progress and stay motivated',
      'Communicate securely in one place',
    ],
  },
  {
    title: 'For Coaches & Organizations',
    color: 'emerald',
    image: '/how-coach-laptop.png',
    imageAlt: 'Coach managing training from a laptop',
    items: [
      'Manage your coaching business',
      'Organize sessions and availability',
      'Message clients securely',
      'Track athlete progress and payments',
    ],
  },
];

const platformSteps = [
  {
    title: 'Search',
    body: 'Search verified coaches by sport, location, availability, training style, and budget.',
    icon: Search,
  },
  {
    title: 'Compare',
    body: 'Compare profiles, reviews, specialties, pricing, and availability to find the right fit.',
    icon: CalendarCheck,
  },
  {
    title: 'Book',
    body: 'Book sessions instantly, choose a time, and pay securely through the platform.',
    icon: CalendarPlus,
  },
  {
    title: 'Track Progress',
    body: 'Manage sessions, message your coach, and track your progress toward your goals.',
    icon: BarChart3,
  },
];

const flowCards = [
  {
    title: 'For Athletes & Parents (Client Flow)',
    accent: 'blue',
    image: '/how-client-flow-preview.png',
    imageAlt: 'Client flow showing coach search and booking previews',
    steps: [
      { label: 'Create a free account', icon: UserPlus },
      { label: 'Search and compare coaches', icon: Search },
      { label: 'Book and pay securely', icon: CalendarCheck },
      { label: 'Message securely and stay on track', icon: MessageCircle },
    ],
  },
  {
    title: 'For Coaches & Organizations (Coach Flow)',
    accent: 'emerald',
    image: '/how-coach-flow-preview.png',
    imageAlt: 'Coach flow showing dashboard and earnings previews',
    steps: [
      { label: 'Create a free account', icon: UserPlus },
      { label: 'Set availability and services', icon: CalendarCheck },
      { label: 'Manage sessions and clients', icon: Users },
      { label: 'View progress and earnings', icon: BarChart3 },
    ],
  },
];

function AudienceCard({ card }) {
  const isCoach = card.color === 'emerald';
  const headingColor = isCoach ? 'text-emerald-700' : 'text-blue-700';
  const iconColor = isCoach ? 'text-emerald-700' : 'text-blue-700';
  const cardTint = isCoach
    ? 'border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fffb_100%)]'
    : 'border-blue-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)]';

  return (
    <article className={`relative min-h-[188px] overflow-hidden rounded-lg border p-6 shadow-sm ${cardTint}`}>
      <div className="relative z-10 max-w-[64%] sm:max-w-[58%]">
        <h2 className={`font-sans text-xl font-bold normal-case tracking-normal ${headingColor}`}>
          {card.title}
        </h2>
        <div className="mt-4 space-y-3">
          {card.items.map((item) => (
            <div key={item} className="flex items-start gap-3">
              <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
              <p className="text-sm font-medium leading-5 text-slate-800">{item}</p>
            </div>
          ))}
        </div>
      </div>
      <img
        src={card.image}
        alt={card.imageAlt}
        className="absolute bottom-0 right-0 h-[88%] max-w-[48%] object-contain object-bottom"
      />
    </article>
  );
}

function PlatformStep({ step, index }) {
  return (
    <div className="relative min-w-0 p-4 md:p-5">
      {index > 0 && (
        <ArrowRight className="absolute -left-5 top-16 hidden h-8 w-8 text-slate-300 lg:block" />
      )}
      <div className="flex items-start gap-4 lg:block">
        <div className="flex shrink-0 items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/20">
            {index + 1}
          </span>
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <step.icon className="h-7 w-7" />
          </span>
        </div>
        <div className="min-w-0 lg:mt-6">
          <h3 className="font-sans text-lg font-bold normal-case tracking-normal text-slate-950">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{step.body}</p>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ step, accent, isLast }) {
  const Icon = step.icon;
  const accentClass = accent === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : 'bg-blue-50 text-blue-700 ring-blue-100';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${accentClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="min-w-0 text-[11px] font-bold leading-4 text-slate-800">{step.label}</p>
      {!isLast && <ArrowRight className="hidden h-5 w-5 shrink-0 text-slate-300 sm:block" />}
    </div>
  );
}

function FlowCard({ flow }) {
  const titleColor = flow.accent === 'emerald' ? 'text-emerald-700' : 'text-blue-700';

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className={`font-sans text-base font-bold normal-case tracking-normal ${titleColor}`}>
        {flow.title}
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:items-center">
        {flow.steps.map((step, index) => (
          <FlowStep
            key={step.label}
            step={step}
            accent={flow.accent}
            isLast={index === flow.steps.length - 1}
          />
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white">
        <img
          src={flow.image}
          alt={flow.imageAlt}
          className="mx-auto h-auto w-full object-contain"
        />
      </div>
    </article>
  );
}

export default function HowItWorks() {
  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_68%,#eef5ff_100%)] text-slate-950">
      <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8 lg:py-6">
        <div className="text-center">
          <h1 className="font-sans text-4xl font-bold leading-tight normal-case tracking-normal text-slate-950 sm:text-5xl">
            How LevelCoach Works
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-700 sm:text-lg">
            Find the right coach, book with confidence, and manage training from one account.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {audienceCards.map((card) => (
            <AudienceCard key={card.title} card={card} />
          ))}
        </div>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
            {platformSteps.map((step, index) => (
              <PlatformStep key={step.title} step={step} index={index} />
            ))}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {flowCards.map((flow) => (
            <FlowCard key={flow.title} flow={flow} />
          ))}
        </section>

      </section>
    </div>
  );
}
