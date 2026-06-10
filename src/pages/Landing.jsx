import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  CreditCard,
  FileSignature,
  MapPin,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';
import { sportIcon } from '@/features/marketing/sportIcons';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { CtaBand } from '@/features/marketing/MarketingBlocks';

const HOW_IT_WORKS = [
  {
    title: 'Search',
    body: 'Filter published coaches by sport, location, availability, specialty, and price.',
    icon: Search,
  },
  {
    title: 'Compare & book',
    body: 'Review real profiles and published reviews, then book a session that fits your schedule.',
    icon: CalendarCheck,
  },
  {
    title: 'Train & track',
    body: 'Message your coach, complete sessions, and follow goals and assessments over time.',
    icon: Target,
  },
];

const AUDIENCES = [
  {
    title: 'Athletes',
    body: 'Find a coach for your sport and level, book sessions, and track your development.',
    to: '/for-athletes',
    icon: Trophy,
  },
  {
    title: 'Parents',
    body: 'Guardian accounts, signed waivers, and booking controls built for training minors safely.',
    to: '/for-parents',
    icon: UserCheck,
  },
  {
    title: 'Coaches',
    body: 'A coaching portal with scheduling, client management, and Stripe payouts.',
    to: '/for-coaches',
    icon: Users,
  },
  {
    title: 'Organizations',
    body: 'Run a roster of coaches with branded pages and automated payout splits.',
    to: '/for-organizations',
    icon: Building2,
  },
];

const TRUST_ITEMS = [
  {
    title: 'Verified coach emails',
    body: 'Coaches confirm their email with a server-issued code before their profile can be published. Verified profiles carry a badge.',
    icon: BadgeCheck,
  },
  {
    title: 'Stripe-protected payments',
    body: 'Every payment is processed by Stripe. Coach payouts only flow to onboarded Stripe accounts — money never changes hands off-platform.',
    icon: CreditCard,
  },
  {
    title: 'Signed waivers before training',
    body: 'Bookings require the legal packet — waiver, medical authorization, and policies — to be signed before a session is confirmed.',
    icon: FileSignature,
  },
  {
    title: 'Guardian controls for minors',
    body: 'Minors train only with a linked guardian account: guardians sign consent, approve bookings, and can read their child’s messages.',
    icon: ShieldCheck,
  },
];

function HeroSearch() {
  const navigate = useNavigate();
  const [sport, setSport] = useState('');
  const [locationText, setLocationText] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (sport) params.set('sport', sport);
    if (locationText.trim()) {
      params.set('location', locationText.trim());
      params.set('radius', '15');
    }
    navigate(params.toString() ? `/coaches?${params.toString()}` : '/coaches');
  };

  return (
    <form
      onSubmit={submit}
      className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-blue-600/10"
      role="search"
      aria-label="Find a coach"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto]">
        <label className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <Trophy className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Sport</span>
            <select
              value={sport}
              onChange={(event) => setSport(event.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-bold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Sport"
            >
              <option value="">All sports</option>
              {SPORTS_CATALOG.map((item) => (
                <option key={item.sport_key} value={item.sport_key}>{item.display_name}</option>
              ))}
            </select>
          </span>
        </label>

        <label className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Location</span>
            <input
              type="text"
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              placeholder="City, county, or ZIP"
              className="mt-1 w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:font-semibold placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Location"
            />
          </span>
        </label>

        <div className="bg-slate-50 p-2">
          <Button type="submit" className="h-12 w-full rounded-lg bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 sm:h-full">
            <Search className="h-4 w-4" aria-hidden="true" />
            Find Coaches
          </Button>
        </div>
      </div>
    </form>
  );
}

function SportsGrid() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="sports-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">15 sports & training types</p>
          <h2 id="sports-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
            Explore by sport
          </h2>
        </div>
        <Link to="/coaches" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
          Browse all coaches
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SPORTS_CATALOG.map((sport) => {
          const Icon = sportIcon(sport.icon);
          return (
            <Link
              key={sport.sport_key}
              to={`/coaches?sport=${encodeURIComponent(sport.sport_key)}`}
              className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Icon className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
              <span className="leading-tight">{sport.display_name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Landing() {
  usePageMeta({
    title: 'Find Verified Sports Coaches & Book Private Training',
    description: 'Search verified coaches across 15 sports, compare real reviews and availability, and book private training with Stripe-protected payments and guardian controls for minors.',
  });

  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      {/* Hero */}
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Multi-sport coaching marketplace</span>
            </div>

            <h1 className="mt-7 font-display text-4xl font-bold leading-[1.04] tracking-normal text-slate-950 sm:text-6xl">
              Find the right coach for your <span className="text-blue-600">next level</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Search published coaches across 15 sports and training types. Compare real profiles,
              reviews, and availability — then book and pay securely in one place.
            </p>

            <HeroSearch />

            <p className="mt-5 text-sm font-semibold text-slate-600">
              Are you a coach?{' '}
              <Link to="/for-coaches" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                See how LevelCoach works for coaches
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </p>
          </div>
        </div>
      </section>

      <SportsGrid />

      {/* How it works */}
      <section className="border-y border-slate-200 bg-slate-50" aria-labelledby="how-heading">
        <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">How it works</p>
              <h2 id="how-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
                Three steps to better training
              </h2>
            </div>
            <Link to="/how-it-works" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
              See the full journeys
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <article key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{index + 1}</span>
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Audience cards */}
      <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="audience-heading">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Built for everyone in training</p>
        <h2 id="audience-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
          One platform, four roles
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map(({ title, body, to, icon: Icon }) => (
            <Link
              key={title}
              to={to}
              className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/10 focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">For {title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
                Learn more
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trust — real platform mechanics only */}
      <section className="border-y border-slate-200 bg-slate-50" aria-labelledby="trust-heading">
        <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Trust & safety</p>
          <h2 id="trust-heading" className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
            Safeguards built into every booking
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            These are platform rules enforced on our servers — not marketing promises.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TRUST_ITEMS.map(({ title, body, icon: Icon }) => (
              <article key={title} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold tracking-normal text-slate-950">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="pt-12">
        <CtaBand
          title="Ready to start training?"
          description="Create a free account to search coaches, book sessions, and follow progress — or apply to coach on LevelCoach."
          primaryCta={{ to: '/create-account', label: 'Create Free Account' }}
          secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply as a Coach' }}
        />
      </div>
    </div>
  );
}
