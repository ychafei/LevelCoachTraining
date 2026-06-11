import React, { useMemo, useState } from 'react';
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
  Sparkles,
  Target,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import SelectMenu from '@/components/forms/SelectMenu';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';
import { sportIcon } from '@/features/marketing/sportIcons';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { CtaBand } from '@/features/marketing/MarketingBlocks';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { Reveal, Stagger, HeroPattern } from '@/features/marketing/MarketingMotion';

const HOW_IT_WORKS = [
  {
    title: 'Search',
    body: 'Filter published coaches by sport, location, availability, level, and specialty.',
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
    accent: 'from-blue-500/12 to-blue-600/0',
  },
  {
    title: 'Parents',
    body: 'Guardian accounts, signed waivers, and booking controls built for training young athletes safely.',
    to: '/for-parents',
    icon: UserCheck,
    accent: 'from-emerald-500/12 to-emerald-600/0',
  },
  {
    title: 'Coaches',
    body: 'A coaching portal with scheduling, client management, and Stripe payouts.',
    to: '/for-coaches',
    icon: Users,
    accent: 'from-violet-500/12 to-violet-600/0',
  },
  {
    title: 'Organizations',
    body: 'Run a roster of coaches with branded pages and automated, secure payouts.',
    to: '/for-organizations',
    icon: Building2,
    accent: 'from-amber-500/12 to-amber-600/0',
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
    title: 'Guardian controls for under-18s',
    body: 'Athletes under 18 train only with a linked guardian account: guardians sign consent, approve bookings, and can read their child’s messages.',
    icon: ShieldCheck,
  },
];

const HERO_HIGHLIGHTS = [
  { label: '15 sports & training types', icon: Trophy },
  { label: 'Reviews only from completed sessions', icon: BadgeCheck },
  { label: 'Stripe-protected checkout', icon: ShieldCheck },
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
      className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-900/15 ring-1 ring-white/40 transition-[box-shadow,transform] duration-300 focus-within:ring-4 focus-within:ring-blue-400/40 focus-within:shadow-[0_30px_70px_rgba(37,99,235,0.35)] motion-safe:focus-within:-translate-y-0.5"
      role="search"
      aria-label="Find a coach"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto]">
        <label className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <Trophy className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Sport</span>
            <SelectMenu
              value={sport}
              onChange={setSport}
              ariaLabel="Sport"
              options={[
                { value: '', label: 'All sports' },
                ...SPORTS_CATALOG.map((item) => ({ value: item.sport_key, label: item.display_name })),
              ]}
              triggerClassName="mt-0.5 h-auto w-full justify-start gap-1.5 border-0 bg-transparent p-0 text-sm font-bold text-slate-950 shadow-none hover:border-0 focus:ring-0 focus:border-0"
            />
          </span>
        </label>

        <label className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Location</span>
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
          <MagneticButton
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:translate-y-px sm:h-full"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Find coaches
          </MagneticButton>
        </div>
      </div>
    </form>
  );
}

// One magnetic primary CTA (motion spec): the button leans toward the pointer
// and springs back. Mouse-only and motion-safe — touch and reduced-motion
// users get a plain button.
function MagneticButton({ children, className = '', ...props }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 320, damping: 22 });
  const springY = useSpring(y, { stiffness: 320, damping: 22 });

  if (reduce) {
    return <button className={className} {...props}>{children}</button>;
  }
  return (
    <motion.button
      style={{ x: springX, y: springY }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - rect.left) / rect.width - 0.5) * 12);
        y.set(((event.clientY - rect.top) / rect.height - 0.5) * 10);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// Kinetic amber underline drawn under the headline's key phrase — the brand
// accent doing the work a gradient blob would fake.
function KineticUnderline() {
  const reduce = useReducedMotion();
  return (
    <svg
      className="absolute -bottom-2 left-0 h-3 w-full"
      viewBox="0 0 220 12"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <motion.path
        d="M4 9 C 60 3, 150 2.5, 216 7"
        fill="none"
        stroke="hsl(38 92% 50%)"
        strokeWidth="5"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }}
      />
    </svg>
  );
}

// Signature moment: the sport icon system arranged as an interactive
// constellation over an abstract training-field diagram. Deterministic
// positions (prerender-stable), idle drift, amber inversion on hover. Each
// node deep-links to its sport landing page.
const CONSTELLATION = [
  ['soccer', 44, 4, true, 8],
  ['football', 10, 12, false, 9],
  ['basketball', 76, 13, true, 10],
  ['golf', 27, 30, false, 11],
  ['lacrosse', 60, 32, false, 9],
  ['baseball', 5, 44, false, 10],
  ['tennis', 87, 42, true, 8],
  ['track_field', 22, 62, true, 11],
  ['volleyball', 68, 62, false, 9],
  ['strength_conditioning', 8, 82, false, 8],
  ['swimming', 46, 84, true, 10],
  ['hockey', 86, 80, false, 11],
];

function IconConstellation() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-[5/6] w-full max-w-[460px]" aria-label="Browse sports">
      {/* Abstract training-field line work */}
      <svg viewBox="0 0 400 480" className="absolute inset-0 h-full w-full text-white/[0.13]" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="24" y="8" width="352" height="464" rx="18" strokeWidth="1.5" />
        <line x1="24" y1="240" x2="376" y2="240" strokeWidth="1.5" />
        <circle cx="200" cy="240" r="58" strokeWidth="1.5" />
        <circle cx="200" cy="240" r="3" fill="currentColor" stroke="none" />
        <rect x="120" y="8" width="160" height="62" strokeWidth="1.5" />
        <rect x="120" y="410" width="160" height="62" strokeWidth="1.5" />
        <path d="M156 70 A 52 52 0 0 0 244 70" strokeWidth="1.5" />
        <path d="M156 410 A 52 52 0 0 1 244 410" strokeWidth="1.5" />
      </svg>

      {CONSTELLATION.map(([key, left, top, big, drift], index) => {
        const sport = SPORTS_CATALOG.find((item) => item.sport_key === key);
        if (!sport) return null;
        const Icon = sportIcon(sport.icon);
        // The soccer node is the amber focal point; everything else inverts
        // to amber on hover. Real ball/equipment glyphs do the talking.
        const focal = key === 'soccer';
        const node = (
          <Link
            to={`/sports/${key}`}
            aria-label={`${sport.display_name} coaching`}
            className={`group grid place-items-center rounded-2xl border shadow-lg shadow-blue-950/40 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-proof ${
              focal
                ? 'border-transparent bg-proof text-slate-950'
                : 'border-white/15 bg-white/[0.09] text-white hover:border-transparent hover:bg-proof hover:text-slate-950'
            } ${big ? 'h-[4.25rem] w-[4.25rem]' : 'h-[3.25rem] w-[3.25rem]'}`}
          >
            <Icon
              className={`transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 ${big ? 'h-9 w-9' : 'h-6 w-6'}`}
              aria-hidden="true"
            />
          </Link>
        );
        return (
          <motion.div
            key={key}
            className="absolute"
            style={{ left: `${left}%`, top: `${top}%` }}
            animate={reduce ? undefined : { y: [0, index % 2 ? -7 : -5, 0] }}
            transition={reduce ? undefined : { duration: drift, repeat: Infinity, ease: 'easeInOut' }}
          >
            {node}
          </motion.div>
        );
      })}
    </div>
  );
}

function SportsGrid() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="sports-heading">
      <Reveal className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-num" data-num="01">15 sports &amp; training types</p>
          <h2 id="sports-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.01em] text-slate-950 sm:text-4xl">
            Explore by sport
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link to="/sports" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
            All sports
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/coaches" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
            Browse all coaches
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
      <Stagger className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SPORTS_CATALOG.map((sport) => {
          const Icon = sportIcon(sport.icon);
          return (
            <Stagger.Item key={sport.sport_key} y={12}>
              {/* Cards link to the sport LANDING pages (the SEO surface), not a
                  pre-filtered search — the search lives one click deeper. */}
              <Link
                to={`/sports/${sport.sport_key}`}
                className="group flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {/* Real sport glyphs on navy squircles; the chip flips to the
                    amber accent on hover — the icon system as identity. */}
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#13357a_0%,#0b2350_100%)] text-white shadow-sm ring-1 ring-blue-900/20 transition-all duration-200 group-hover:bg-[linear-gradient(135deg,#f5a623_0%,#e3920c_100%)] group-hover:text-slate-950 group-hover:shadow-md">
                  <Icon className="h-6 w-6 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6" aria-hidden="true" />
                </span>
                <span className="leading-tight">{sport.display_name}</span>
              </Link>
            </Stagger.Item>
          );
        })}
      </Stagger>
    </section>
  );
}

export default function Landing() {
  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LevelCoach Training',
    url: 'https://www.levelcoachtraining.com/',
    logo: 'https://www.levelcoachtraining.com/levelcoach-mark.png',
    email: 'contact@levelcoachtraining.com',
    description: 'Multi-sport coaching marketplace: athletes and families find and book vetted coaches; coaches and training organizations run sessions, progress, messaging, and Stripe payouts from one platform.',
  }), []);

  usePageMeta({
    title: 'Find Verified Sports Coaches & Book Private Training',
    description: 'Search verified coaches across 15 sports, compare real reviews and availability, and book private training with Stripe-protected payments and guardian controls for athletes under 18.',
    jsonLd,
  });

  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      {/* Hero — dark editorial split with imagery + working search */}
      <section className="texture-grain relative overflow-hidden bg-[radial-gradient(120%_120%_at_15%_0%,#102a5c_0%,#081226_55%,#05080f_100%)] text-white">
        <HeroPattern className="text-white/[0.07]" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <Reveal as="div" y={20} duration={0.5}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2">
                <Sparkles className="h-4 w-4 text-proof" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Multi-sport coaching marketplace</span>
              </div>

              <h1 className="mt-7 font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
                Find the right coach
                <br />
                for your{' '}
                <span className="relative inline-block whitespace-nowrap">
                  next level
                  <KineticUnderline />
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                Search published coaches across 15 sports and training types. Compare real profiles,
                reviews, and availability — then book and pay securely in one place.
              </p>

              <HeroSearch />

              <p className="mt-4">
                <Link
                  to="/create-account"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-slate-400 transition hover:text-slate-200 hover:underline"
                >
                  Create a free account
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </p>

              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                {HERO_HIGHLIGHTS.map(({ label, icon: Icon }) => (
                  <li key={label} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Icon className="h-4 w-4 text-blue-300" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm font-semibold text-slate-300">
                Are you a coach?{' '}
                <Link to="/for-coaches" className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200 hover:underline">
                  See how LevelCoach works for coaches
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </p>
            </Reveal>

            <Reveal as="div" y={24} delay={0.08} duration={0.5} className="hidden lg:block">
              <IconConstellation />
            </Reveal>
          </div>
        </div>
        {/* Smooth transition into the white sports section */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>

      <SportsGrid />

      {/* Trust — real platform mechanics only, on a rich dark band */}
      <section className="texture-grain relative overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,#102a5c_0%,#081226_60%,#05080f_100%)] text-white" aria-labelledby="trust-heading">
        <HeroPattern className="text-white/[0.06]" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="section-num text-slate-300 [&::after]:bg-white/20" data-num="02">Trust &amp; safety</p>
            <h2 id="trust-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.01em] text-white sm:text-4xl">
              Safeguards built into every booking
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              These are platform rules enforced on our servers — not marketing promises.
            </p>
          </Reveal>
          <Stagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TRUST_ITEMS.map(({ title, body, icon: Icon }) => (
              <Stagger.Item key={title}>
                <article className="flex h-full gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-lg backdrop-blur transition hover:bg-white/[0.09]">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-normal text-white">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-300">{body}</p>
                  </div>
                </article>
              </Stagger.Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-slate-50" aria-labelledby="how-heading">
        <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-num" data-num="03">How it works</p>
              <h2 id="how-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.01em] text-slate-950 sm:text-4xl">
                Three steps to better training
              </h2>
            </div>
            <Link to="/how-it-works" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
              See the full journeys
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
          <Stagger className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <Stagger.Item key={step.title}>
                <article className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{index + 1}</span>
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                      <step.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
                </article>
              </Stagger.Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Audience cards */}
      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="audience-heading">
        <Reveal>
          <p className="section-num" data-num="04">Built for everyone in training</p>
          <h2 id="audience-heading" className="mt-2 font-display text-3xl font-bold tracking-[-0.01em] text-slate-950 sm:text-4xl">
            One platform, four roles
          </h2>
        </Reveal>
        <Stagger className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map(({ title, body, to, icon: Icon, accent }) => (
            <Stagger.Item key={title}>
              <Link
                to={to}
                className={`group relative block h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10 focus-visible:ring-2 focus-visible:ring-blue-600`}
              >
                <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${accent} blur-2xl`} aria-hidden="true" />
                <span className="relative grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="relative mt-4 font-display text-xl font-bold tracking-normal text-slate-950">For {title}</h3>
                <p className="relative mt-2 text-sm leading-6 text-slate-600">{body}</p>
                <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </Stagger.Item>
          ))}
        </Stagger>
      </section>

      <div className="pt-12">
        <CtaBand
          title="Ready to start training?"
          description="Create a free account to search coaches, book sessions, and follow progress — or apply to coach on LevelCoach."
          primaryCta={{ to: '/create-account', label: 'Create free account' }}
          secondaryCta={{ to: '/apply/private-training-coach', label: 'Apply as a coach' }}
        />
      </div>
    </div>
  );
}
