import React from 'react';
import {
  Building2,
  CreditCard,
  Flag,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';

const platformStats = [
  { value: '500+', label: 'Verified Coaches', icon: Users },
  { value: '20+', label: 'Sports', icon: Trophy },
  { value: '50,000+', label: 'Athletes Served', icon: ShieldCheck },
  { value: '$25M+', label: 'Payments Processed', icon: CreditCard },
];

const missionCards = [
  {
    title: 'For athletes',
    body: 'We help athletes find the right coach, book sessions, and reach their goals with confidence.',
    icon: UserCheck,
  },
  {
    title: 'For coaches',
    body: 'We give coaches the tools to manage clients, run sessions, get paid, and grow their business.',
    icon: Users,
  },
  {
    title: 'For organizations',
    body: 'We power training organizations with multi-tenant management, reporting, and streamlined operations.',
    icon: Building2,
  },
];

const safetyItems = [
  {
    title: 'Verified profiles',
    body: 'All coaches go through our verification and background check process.',
    icon: ShieldCheck,
  },
  {
    title: 'Youth safety',
    body: 'We promote a safe, respectful environment for every athlete.',
    icon: Users,
  },
  {
    title: 'Secure payments',
    body: 'All payments are processed securely through Stripe.',
    icon: CreditCard,
  },
  {
    title: 'Multi-tenant platform',
    body: 'Built to support individual coaches and large training organizations.',
    icon: Building2,
  },
];

const journey = [
  {
    year: '2019',
    title: 'Built for Coaches',
    body: 'Started as an internal tool to manage private training and clients.',
    icon: Flag,
  },
  {
    year: '2021',
    title: 'Opening the Platform',
    body: 'Began connecting athletes with verified coaches across sports.',
    icon: Users,
  },
  {
    year: '2023',
    title: 'Organizations Join',
    body: 'Launched multi-tenant platform for academies and training teams.',
    icon: Building2,
  },
  {
    year: 'Today & Beyond',
    title: 'Today & Beyond',
    body: 'Continuing to innovate and support the future of coaching.',
    icon: Rocket,
  },
];

function StatItem({ stat }) {
  return (
    <div className="flex items-center justify-center gap-5 border-b border-slate-200 px-4 py-4 last:border-b-0 sm:justify-start md:border-b-0 md:border-r md:last:border-r-0">
      <stat.icon className="h-9 w-9 shrink-0 text-blue-600" />
      <div>
        <p className="text-xl font-bold leading-none text-slate-950">{stat.value}</p>
        <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
      </div>
    </div>
  );
}

function SmallCard({ item }) {
  return (
    <article className="flex gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
        <item.icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-sans text-sm font-bold normal-case tracking-normal text-slate-950">
          {item.title}
        </h3>
        <p className="mt-2 text-xs leading-4 text-slate-700">{item.body}</p>
      </div>
    </article>
  );
}

function JourneyStep({ step, index }) {
  const Icon = step.icon;

  return (
    <div className="relative flex flex-col items-center text-center">
      <span className="relative z-10 grid h-10 w-10 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-2 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-blue-100" />
      {index < journey.length - 1 && (
        <span className="absolute left-1/2 top-[56px] hidden h-px w-full bg-blue-200 lg:block" />
      )}
      <p className="mt-2 text-xs font-bold text-slate-950">{step.year}</p>
      <h3 className="mt-2 font-sans text-sm font-bold normal-case tracking-normal text-slate-950">
        {step.title}
      </h3>
      <p className="mt-1 max-w-[170px] text-xs leading-4 text-slate-600">{step.body}</p>
    </div>
  );
}

export default function About() {
  return (
    <div
      className="text-slate-950"
      style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 56%, #eef5ff 100%)' }}
    >
      <section className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-3 rounded-full bg-blue-50 px-4 py-2 text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-widest">About LevelCoach Training</span>
            </div>

            <h1 className="mt-6 max-w-[700px] font-display text-5xl font-bold uppercase leading-tight tracking-normal text-slate-950 sm:text-6xl xl:text-7xl">
              Built to make private coaching easier to{' '}
              <span className="text-blue-600">find, manage, and grow</span>
            </h1>

            <p className="mt-5 max-w-[650px] text-base leading-7 text-slate-700 sm:text-lg">
              LevelCoach Training is the verified platform connecting athletes with great coaches,
              and giving coaches and organizations the tools to run their business with confidence.
            </p>
          </div>

          <div className="hidden min-w-0 justify-end lg:flex">
            <img
              src="/about-product-preview.png"
              alt="LevelCoach coach portal and mobile profile preview"
              className="h-auto w-full max-w-2xl object-contain"
            />
          </div>
        </div>

        <section className="mt-2 grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-4">
          {platformStats.map((stat) => (
            <StatItem key={stat.label} stat={stat} />
          ))}
        </section>

        <section className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-blue-600">Our Mission</p>
            <div className="grid gap-4 md:grid-cols-3">
              {missionCards.map((item) => (
                <SmallCard key={item.title} item={item} />
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-blue-600">
              Trust & Safety First
            </p>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {safetyItems.map((item) => (
                <SmallCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-5">
          <article className="flex flex-col items-start gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center lg:col-span-2">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <TrendingUp className="h-12 w-12" />
            </span>
            <div>
              <h2 className="font-sans text-xl font-bold leading-8 normal-case tracking-normal text-slate-950">
                LevelCoach Training started as a private training workflow and is growing into a
                platform for every serious coach and athlete.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                From solo coaches to large academies, our mission is to simplify coaching so you can
                focus on what matters most: developing athletes.
              </p>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Our Journey</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {journey.map((step, index) => (
                <JourneyStep key={`${step.year}-${step.title}`} step={step} index={index} />
              ))}
            </div>
          </article>
        </section>
      </section>
    </div>
  );
}
