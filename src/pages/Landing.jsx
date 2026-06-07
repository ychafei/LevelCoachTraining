import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Dumbbell,
  Grid2X2,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LevelCoachWordmarkPlate } from '@/components/public/LevelCoachLogo';

const searchFields = [
  { label: 'Sport', value: 'Soccer', icon: Trophy },
  { label: 'Location', value: 'Detroit, MI', icon: MapPin },
  { label: 'Training goal', value: 'Speed & Agility', icon: Target },
  { label: 'Availability', value: 'This week', icon: CalendarDays },
];

const defaultCoachSearchHref = '/coaches?sport=Soccer&location=Detroit%2C+MI&goal=Speed+%26+Agility&availability=This+week';

const coaches = [
  {
    name: 'Lisa Rodriguez',
    org: 'LevelCoach Training',
    sport: 'Soccer',
    location: 'Rochester Hills, MI',
    rating: '5.0',
    reviews: '96',
    price: '$75',
    next: 'Tomorrow 4:00 PM',
    tags: ['Soccer', '1-on-1', 'College Prep'],
    initials: 'LR',
    avatarSrc: '/homepage-coach-lisa.png',
    avatarClass: 'from-sky-100 via-blue-50 to-emerald-100 text-blue-900',
  },
  {
    name: 'Marcus Thompson',
    org: 'Next Level Soccer Academy',
    sport: 'Soccer',
    location: 'Sterling Heights, MI',
    rating: '4.9',
    reviews: '87',
    price: '$65',
    next: 'Today 6:30 PM',
    tags: ['Soccer', 'Speed & Agility'],
    initials: 'MT',
    avatarSrc: '/homepage-coach-marcus.png',
    avatarClass: 'from-slate-200 via-blue-100 to-slate-50 text-slate-900',
  },
  {
    name: 'Jordan Williams',
    org: 'Elite Hoops Training',
    sport: 'Basketball',
    location: 'Detroit, MI',
    rating: '5.0',
    reviews: '128',
    price: '$60',
    next: 'Tomorrow 10:00 AM',
    tags: ['Basketball', 'Strength Training'],
    initials: 'JW',
    avatarSrc: '/homepage-coach-jordan.png',
    avatarClass: 'from-amber-100 via-white to-blue-100 text-slate-900',
  },
];

const stats = [
  { value: '500+', label: 'Verified Coaches', icon: Users },
  { value: '20+', label: 'Sports', icon: Trophy },
  { value: 'Verified Profiles', label: 'Background checked', icon: ShieldCheck },
  { value: 'Secure Payments', label: 'Powered by Stripe', icon: CreditCard },
];

const sportCategories = [
  { label: 'Soccer', icon: Trophy },
  { label: 'Basketball', icon: CircleDollarSign },
  { label: 'Football', icon: Target },
  { label: 'Baseball', icon: Trophy },
  { label: 'Volleyball', icon: Zap },
  { label: 'Strength & Conditioning', icon: Dumbbell },
  { label: 'Goalkeeper Training', icon: ShieldCheck },
  { label: 'Speed & Agility', icon: Zap },
  { label: 'College Prep', icon: Trophy },
  { label: 'View all sports', icon: Grid2X2 },
];

const howItWorks = [
  {
    title: 'Search',
    subtitle: 'by sport and location',
    body: 'Filter by goal, availability, training style, and budget.',
    icon: Search,
  },
  {
    title: 'Compare',
    subtitle: 'coaches and availability',
    body: 'View profiles, reviews, prices, and open times to find your best match.',
    icon: CalendarCheck,
  },
  {
    title: 'Book, train',
    subtitle: 'and track progress',
    body: 'Book sessions, message your coach, and track your improvement.',
    icon: Target,
  },
];

const coachPlatformFeatures = [
  'Create your branded coaching portal',
  'Manage athletes, sessions, and schedules',
  'Collect payments with Stripe',
  'Message clients and track progress',
  'Grow your business with insights',
];

function SearchField({ label, value, icon: Icon }) {
  return (
    <button
      type="button"
      className="group flex min-w-0 items-center gap-2 border-b border-slate-200 px-4 py-3 text-left transition hover:bg-blue-50/60 xl:border-b-0 xl:border-r xl:px-3 last:xl:border-r-0"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 xl:h-6 xl:w-6">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 xl:text-[8px]">
          {label}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-950 sm:text-sm xl:text-[11px]">
          <span className="truncate xl:overflow-visible xl:whitespace-nowrap">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
        </span>
      </span>
    </button>
  );
}

function AvatarBadge({ initials, avatarClass, avatarSrc, size = 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-[72px] w-[72px] text-xl';

  return (
    <div className="relative shrink-0">
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt=""
          className={`${sizeClass} rounded-full object-cover ring-1 ring-slate-200`}
        />
      ) : (
        <div
          className={`grid ${sizeClass} place-items-center rounded-full bg-gradient-to-br ${avatarClass} font-display font-bold tracking-normal ring-1 ring-slate-200`}
        >
          {initials}
        </div>
      )}
      <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
    </div>
  );
}

function CoachResultRow({ coach, compact = false }) {
  const visibleTags = compact ? coach.tags.slice(0, 2) : coach.tags;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 gap-3">
          <AvatarBadge {...coach} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-display text-lg font-bold tracking-normal text-slate-950 sm:text-xl">
                {coach.name}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck className="h-3 w-3" />
                Verified
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-700 sm:text-sm">{coach.org}</p>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-1 text-blue-700">
                {coach.sport}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                {coach.location}
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {coach.rating} ({coach.reviews})
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 lg:min-w-[195px] lg:border-t-0 lg:pt-0">
          <div>
            <p className="font-display text-xl font-bold tracking-normal text-slate-950">
              {coach.price}
              <span className="font-sans text-xs font-semibold normal-case text-slate-500"> / session</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Next available</p>
            <p className="text-xs font-bold text-blue-700">{coach.next}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/coaches">
              <Button variant="outline" className="h-8 w-full rounded-lg border-blue-200 bg-white text-[11px] font-bold text-blue-700 hover:bg-blue-50">
                View Profile
              </Button>
            </Link>
            <Link to="/coaches">
              <Button className="h-8 w-full rounded-lg bg-blue-600 text-[11px] font-bold text-white shadow-blue-600/20 hover:bg-blue-700">
                Book Intro
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function MarketplacePreview() {
  return (
    <div className="relative min-w-0 pb-20 lg:pb-0">
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-bold text-slate-950">
              Top demo coaches near Detroit, MI
              <span className="ml-2 text-sm font-semibold text-slate-500">25 sample profiles</span>
            </p>
          </div>
          <button className="inline-flex h-8 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
            Sort by: Best match
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-2">
          {[
            ['Soccer', Trophy],
            ['Within 15 miles', MapPin],
            ['This week', CalendarDays],
            ['Filters', SlidersHorizontal],
          ].map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              className="inline-flex h-7 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Icon className="h-3.5 w-3.5 text-blue-700" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-1.5 space-y-1.5">
          {coaches.map((coach) => (
            <CoachResultRow key={coach.name} coach={coach} compact />
          ))}
        </div>

        <Link to="/coaches" className="mx-auto mt-2 flex w-fit items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
          View all sample coaches
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="pointer-events-none absolute -right-28 top-[300px] z-30 hidden w-56 rounded-[34px] border-[7px] border-slate-950 bg-slate-950 shadow-[0_22px_55px_rgba(15,23,42,0.35)] xl:block 2xl:-right-32">
        <div className="overflow-hidden rounded-[22px] bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <img src="/levelcoach-wordmark.png" alt="" className="h-7 w-auto object-contain" />
            <Menu className="h-4 w-4 text-slate-700" />
          </div>
          <div className="p-3">
            <h3 className="font-display text-2xl font-bold leading-none tracking-normal text-slate-950">
              Find the right coach for your <span className="text-blue-600">next level</span>
            </h3>
            <p className="mt-2 text-[11px] leading-4 text-slate-600">
              Search verified private coaches by sport, location, schedule, and budget.
            </p>
            <div className="mt-3 space-y-2">
              {searchFields.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                  <Icon className="h-3.5 w-3.5 text-blue-700" />
                  <span className="text-[11px] font-bold text-slate-800">{value}</span>
                  <ChevronDown className="ml-auto h-3 w-3 text-slate-400" />
                </div>
              ))}
            </div>
            <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-xs font-bold text-white">
              <Search className="h-3.5 w-3.5" />
              Find Coaches
            </button>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-2">
                <AvatarBadge {...coaches[0]} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold tracking-normal text-slate-950">
                    Lisa Rodriguez
                  </p>
                  <p className="text-[10px] font-semibold text-blue-700">Soccer - Rochester Hills</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-700">$75 / session</span>
                <span className="text-blue-700">Tomorrow 4:00 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatStrip() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {stats.map(({ value, label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-2xl font-bold leading-none tracking-normal text-slate-950">{value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SportCategories() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-4 sm:px-6 lg:px-8">
      <div className="max-w-[1240px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-bold tracking-normal text-slate-950">
            Explore by sport & training
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5 lg:grid-cols-10">
          {sportCategories.map(({ label, icon: Icon }) => (
            <Link
              key={label}
              to={label === 'View all sports' ? '/coaches' : `/coaches?sport=${encodeURIComponent(label)}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Icon className="h-5 w-5 shrink-0 text-blue-700" />
              <span className="leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniDashboard() {
  const navItems = ['Overview', 'Sessions', 'Schedule', 'Clients'];
  const statCards = [
    ['3', "Today's Sessions"],
    ['24', 'Active Clients'],
    ['18', 'Completed'],
    ['$350', 'Pending Cash'],
  ];
  const schedule = [
    ['9:00', 'Marcus Johnson', 'Confirmed'],
    ['10:30', 'Dylan Smith', 'Pending'],
    ['12:00', 'Alex Williams', 'Confirmed'],
  ];

  return (
    <div className="flex h-full bg-slate-50 text-[8px] text-slate-900">
      <aside className="flex w-[22%] flex-col bg-[#061a3a] p-2 text-white">
        <LevelCoachWordmarkPlate
          className="rounded-md px-1 py-0.5"
          imageClassName="h-3.5 w-auto object-contain"
        />
        <div className="mt-4 space-y-1.5">
          {navItems.map((item, index) => (
            <div
              key={item}
              className={`flex items-center gap-1 rounded px-1.5 py-1 ${index === 0 ? 'bg-blue-600' : 'bg-white/0 text-blue-100'}`}
            >
              <span className="h-1.5 w-1.5 rounded-sm bg-current" />
              <span className="truncate font-bold">{item}</span>
            </div>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 font-bold">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-100 text-[6px] text-blue-700">EH</span>
            Elite Hoops Training
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <MessageCircle className="h-2.5 w-2.5" />
            <Bell className="h-2.5 w-2.5" />
            <span className="grid h-4 w-4 place-items-center rounded-full bg-amber-100 text-[6px] font-bold text-amber-800">J</span>
          </div>
        </div>

        <div className="mt-2">
          <p className="font-bold text-slate-500">Coach Portal</p>
          <h3 className="font-display text-lg font-bold leading-none tracking-normal text-slate-950">Coach Jordan</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">Visible to clients</span>
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700">Setup 92%</span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {statCards.map(([value, label]) => (
            <div key={label} className="rounded border border-slate-200 bg-white p-1.5">
              <p className="font-display text-base font-bold leading-none tracking-normal text-slate-950">{value}</p>
              <p className="mt-0.5 truncate text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1.15fr_0.85fr] gap-1.5">
          <div className="rounded border border-slate-200 bg-white p-1.5">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-bold">Today's Schedule</p>
              <span className="text-blue-700">View all</span>
            </div>
            <div className="space-y-1">
              {schedule.map(([time, name, status], index) => (
                <div key={name} className="flex items-center gap-1 rounded bg-slate-50 px-1 py-1">
                  <span className="w-5 font-bold">{time}</span>
                  <span className={`h-3.5 w-3.5 rounded-full ${index === 1 ? 'bg-amber-100' : 'bg-blue-100'}`} />
                  <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
                  <span className={`rounded px-1 py-0.5 font-bold ${status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-1.5">
            <div className="flex items-center justify-between">
              <p className="font-bold">Setup Checklist</p>
              <span className="rounded-full border-2 border-blue-600 px-1 py-0.5 font-bold text-blue-700">92%</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {['Availability', 'Photo', 'Payments', 'Profile'].map((item) => (
                <div key={item} className="flex items-center gap-1 rounded bg-slate-50 px-1 py-1">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                  <span className="truncate font-bold">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PhoneDashboard() {
  const clients = [
    ['Marcus Johnson', 'Today 9:00 AM', 'Confirmed'],
    ['Dylan Smith', '10:30 AM', 'Pending'],
    ['Alex Williams', '12:00 PM', 'Confirmed'],
  ];

  return (
    <div className="h-full bg-white text-[8px] text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-2 py-2">
        <img src="/levelcoach-wordmark.png" alt="" className="h-5 w-auto object-contain" />
        <Menu className="h-3.5 w-3.5 text-slate-700" />
      </div>
      <div className="p-2">
        <p className="font-bold text-slate-500">Coach Portal</p>
        <h3 className="font-display text-lg font-bold leading-none tracking-normal text-slate-950">Coach Jordan</h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {[
            ['3', 'Today'],
            ['24', 'Clients'],
          ].map(([value, label]) => (
            <div key={label} className="rounded border border-slate-200 bg-slate-50 p-1.5">
              <p className="font-display text-base font-bold leading-none tracking-normal text-slate-950">{value}</p>
              <p className="text-slate-500">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          {clients.map(([name, time, status]) => (
            <div key={name} className="rounded border border-slate-200 bg-white p-1.5">
              <div className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-blue-100" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-950">{name}</p>
                  <p className="text-slate-500">{time}</p>
                </div>
              </div>
              <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 font-bold ${status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                {status}
              </span>
            </div>
          ))}
        </div>
        <button className="mt-2 h-7 w-full rounded bg-blue-600 font-bold text-white">Add Session</button>
      </div>
    </div>
  );
}

function PortalDevicePreview({ compact = false }) {
  return (
    <div className={compact ? 'relative mx-auto min-h-[190px] w-full max-w-[300px] overflow-visible pt-2' : 'relative mx-auto min-h-[250px] w-full max-w-[520px] overflow-visible pt-3 sm:min-h-[300px]'}>
      <div className="relative mx-auto w-[88%]">
        <div className={compact ? 'rounded-t-[16px] border-[6px] border-slate-950 bg-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.22)]' : 'rounded-t-[20px] border-[8px] border-slate-950 bg-slate-950 shadow-[0_22px_55px_rgba(15,23,42,0.24)]'}>
          <div className="aspect-[16/10] overflow-hidden rounded-md bg-white">
            <MiniDashboard />
          </div>
        </div>
        <div className={compact ? 'mx-auto h-2 w-[108%] -translate-x-[4%] rounded-b-[18px] bg-gradient-to-b from-slate-300 to-slate-400 shadow-md' : 'mx-auto h-3 w-[108%] -translate-x-[4%] rounded-b-[24px] bg-gradient-to-b from-slate-300 to-slate-400 shadow-md'} />
        <div className={compact ? 'mx-auto h-1 w-[36%] rounded-b-full bg-slate-500/40' : 'mx-auto h-1.5 w-[36%] rounded-b-full bg-slate-500/40'} />
      </div>

      <div className={compact ? 'absolute bottom-0 right-0 w-[28%] min-w-[82px] rounded-[21px] border-[5px] border-slate-950 bg-slate-950 shadow-[0_14px_30px_rgba(15,23,42,0.32)]' : 'absolute bottom-0 right-0 w-[30%] min-w-[118px] rounded-[28px] border-[7px] border-slate-950 bg-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.36)] sm:w-[28%]'}>
        <div className={compact ? 'overflow-hidden rounded-[15px] bg-white' : 'overflow-hidden rounded-[20px] bg-white'}>
          <div className={compact ? 'mx-auto mt-1 h-1 w-7 rounded-full bg-slate-950' : 'mx-auto mt-1 h-1.5 w-10 rounded-full bg-slate-950'} />
          <div className={compact ? 'aspect-[9/16] overflow-hidden rounded-b-[14px]' : 'aspect-[9/16] overflow-hidden rounded-b-[18px]'}>
            <PhoneDashboard />
          </div>
        </div>
      </div>
    </div>
  );
}

function HowItWorksCard() {
  return (
    <article id="how-it-works" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">How it works</p>
      <div className="mt-5 grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
        {howItWorks.map((step, index) => (
          <div key={step.title} className="py-5 first:pt-0 last:pb-0 md:px-5 md:py-0 md:first:pl-0 md:last:pr-0">
            <div className="flex items-center gap-4 md:block">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <step.icon className="h-6 w-6" />
                </div>
              </div>
              <div className="md:mt-5">
                <h3 className="font-display text-2xl font-bold tracking-normal text-slate-950">{step.title}</h3>
                <p className="text-sm font-bold text-slate-800">{step.subtitle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function CoachPlatformTeaser() {
  return (
    <article id="for-coaches" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold tracking-normal text-slate-950">
            For coaches & training organizations
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Everything you need to run and grow your training business.
          </p>
          <div className="mt-4 space-y-2">
            {coachPlatformFeatures.map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-xs leading-5 text-slate-700">{feature}</p>
              </div>
            ))}
          </div>
          <Link to="/apply/private-training-coach" className="mt-4 inline-flex">
            <Button variant="outline" className="h-10 rounded-lg border-blue-300 bg-white px-5 text-xs font-bold text-blue-700 hover:bg-blue-50">
              Learn more about the platform
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <PortalDevicePreview compact />
      </div>
    </article>
  );
}

export default function Landing() {
  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      <section id="find-coach" className="relative overflow-visible border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto grid min-w-0 max-w-[1480px] grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-3 xl:grid-cols-[640px_670px]">
          <div className="flex min-w-0 flex-col justify-start">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Verified coaching marketplace</span>
            </div>

            <h1 className="mt-7 max-w-2xl font-display text-4xl font-bold leading-[1.02] tracking-normal text-slate-950 sm:text-6xl sm:leading-[0.94] lg:text-[3.25rem] xl:text-[4.05rem]">
              <span className="hidden whitespace-nowrap sm:block">Find the right coach</span>
              <span className="hidden whitespace-nowrap sm:block">for your <span className="text-blue-600">next level</span></span>
              <span className="block sm:hidden">Find the right</span>
              <span className="block sm:hidden">coach for your</span>
              <span className="block text-blue-600 sm:hidden">next level</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Search verified private coaches by sport, location, schedule, training style, and budget.
            </p>

            <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-blue-600/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[116px_134px_150px_110px_130px]">
                {searchFields.map((field) => (
                  <SearchField key={field.label} {...field} />
                ))}
                <div className="border-t border-slate-200 bg-slate-50 p-2 sm:col-span-2 xl:col-span-1 xl:border-t-0">
                  <Link to={defaultCoachSearchHref} className="block h-full">
                    <Button className="h-12 w-full rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 xl:h-full">
                      <Search className="h-4 w-4" />
                      Find Coaches
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <p className="mt-5 text-sm font-semibold text-slate-600">
              Are you a coach?{' '}
              <Link to="/apply/private-training-coach" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                Create a free coach account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </p>
          </div>

          <MarketplacePreview />
        </div>

        <div className="mx-auto max-w-[1480px] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="max-w-[1240px]">
            <StatStrip />
          </div>
        </div>
      </section>

      <SportCategories />

      <section className="mx-auto max-w-[1480px] px-4 pb-8 sm:px-6 lg:px-8">
        <div className="grid max-w-[1240px] grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <HowItWorksCard />
          <CoachPlatformTeaser />
        </div>
      </section>
    </div>
  );
}
