import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Trophy,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const audiences = [
  { id: 'athletes', label: 'Athletes', icon: Users },
  { id: 'parents', label: 'Parents', icon: UserCheck },
  { id: 'coaches', label: 'Coaches', icon: LifeBuoy },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
];

const resourcesByAudience = {
  athletes: [
    {
      title: 'Training Guides',
      description: 'Step-by-step guides to improve your training, set goals, and maximize your potential.',
      icon: ClipboardList,
      href: '/blog',
    },
    {
      title: 'Coach Hiring Checklist',
      description: 'Use our checklist to find, evaluate, and hire the right coach for your goals.',
      icon: CheckSquare,
      href: '/how-it-works',
    },
    {
      title: 'Youth Safety',
      description: 'Learn how we verify coaches and prioritize safety for young athletes and families.',
      icon: ShieldCheck,
      href: '/parent-consent',
    },
    {
      title: 'Payments & Booking',
      description: 'How payments, packages, and booking work on the LevelCoach platform.',
      icon: CreditCard,
      href: '/for-coaches#coach-pricing',
    },
    {
      title: 'Platform Help',
      description: 'Find answers to common questions and get the most out of LevelCoach.',
      icon: HelpCircle,
      href: '#support',
    },
    {
      title: 'Growing a Training Business',
      description: 'Resources and best practices for coaches and training organizations.',
      icon: TrendingUp,
      href: '/for-coaches',
    },
  ],
  parents: [
    {
      title: 'Choosing a Coach',
      description: 'Questions to ask before booking private training for a young athlete.',
      icon: CheckSquare,
      href: '/how-it-works',
    },
    {
      title: 'Parent Account Setup',
      description: 'How parent profiles, athlete details, and booking communication should work.',
      icon: UserCheck,
      href: '/dashboard',
    },
    {
      title: 'Youth Safety',
      description: 'Understand verification, consent, and safer training expectations.',
      icon: ShieldCheck,
      href: '/parent-consent',
    },
    {
      title: 'Packages & Payments',
      description: 'A simple overview of packages, refunds, credits, and secure payment flow.',
      icon: CreditCard,
      href: '/for-coaches#coach-pricing',
    },
    {
      title: 'Training Progress',
      description: 'How to track notes, messages, and progress after each session.',
      icon: TrendingUp,
      href: '/how-it-works',
    },
    {
      title: 'Support Center',
      description: 'Get help with bookings, account setup, billing, and safety questions.',
      icon: LifeBuoy,
      href: '#support',
    },
  ],
  coaches: [
    {
      title: 'Coach Profile Guide',
      description: 'Build a clear public coaching profile with training types, locations, and bio.',
      icon: ClipboardList,
      href: '/apply/private-training-coach',
    },
    {
      title: 'Availability Setup',
      description: 'Plan weekly availability, session windows, and booking readiness.',
      icon: CalendarDays,
      href: '/apply/private-training-coach',
    },
    {
      title: 'Verification Basics',
      description: 'What coaches should prepare before publishing publicly or coaching youth athletes.',
      icon: ShieldCheck,
      href: '/apply/private-training-coach',
    },
    {
      title: 'Getting Paid',
      description: 'How subscriptions, paid bookings, and Stripe readiness fit together.',
      icon: BadgeDollarSign,
      href: '/for-coaches#coach-pricing',
    },
    {
      title: 'Client Management',
      description: 'Organize athletes, sessions, messages, notes, and progress from one portal.',
      icon: Users,
      href: '/for-coaches',
    },
    {
      title: 'Growth Playbook',
      description: 'Best practices for building a private training business on LevelCoach.',
      icon: TrendingUp,
      href: '/for-coaches',
    },
  ],
  organizations: [
    {
      title: 'Organization Portal',
      description: 'See how branded portals help academies manage coaches, athletes, and operations.',
      icon: Building2,
      href: '/for-coaches',
    },
    {
      title: 'Coach Roster Setup',
      description: 'Prepare staff roles, visibility, service areas, and coaching profiles.',
      icon: Users,
      href: '/for-coaches',
    },
    {
      title: 'Branding Checklist',
      description: 'Logo, color, slug, service area, and public profile items to prepare.',
      icon: CheckSquare,
      href: '/apply/private-training-coach',
    },
    {
      title: 'Payments & Payouts',
      description: 'Understand subscription plans, Stripe readiness, and operating requirements.',
      icon: CreditCard,
      href: '/for-coaches#coach-pricing',
    },
    {
      title: 'Program Operations',
      description: 'Coordinate sessions, packages, messages, and athlete pipeline management.',
      icon: CalendarDays,
      href: '/for-coaches',
    },
    {
      title: 'Academy Growth',
      description: 'Resources for scaling training programs across multiple coaches and locations.',
      icon: Trophy,
      href: '/for-coaches',
    },
  ],
};

const quickLinks = [
  {
    title: 'How LevelCoach Works',
    description: 'Understand the platform',
    icon: ClipboardList,
    href: '/how-it-works',
  },
  {
    title: 'Coach Verification',
    description: 'Our vetting process',
    icon: ShieldCheck,
    href: '#support',
  },
  {
    title: 'Fees & Pricing',
    description: 'Transparent and simple',
    icon: BadgeDollarSign,
    href: '/for-coaches#coach-pricing',
  },
  {
    title: 'Platform Updates',
    description: "What's new",
    icon: CalendarDays,
    href: '/blog',
  },
];

const trustItems = [
  {
    title: 'Trusted & Secure',
    description: 'Verified coaches and secure platform',
    icon: ShieldCheck,
  },
  {
    title: 'Built for Every Athlete',
    description: 'All sports, all levels, all goals',
    icon: Users,
  },
  {
    title: 'Backed by Coaches',
    description: 'Designed by training professionals',
    icon: Trophy,
  },
];

function ResourceCard({ resource }) {
  return (
    <Link
      to={resource.href}
      className="group flex min-h-[144px] gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/10"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
        <resource.icon className="h-7 w-7" />
      </span>
      <span className="min-w-0 pt-1">
        <span className="block font-sans text-base font-bold normal-case tracking-normal text-slate-950">
          {resource.title}
        </span>
        <span className="mt-2 block line-clamp-3 text-sm leading-5 text-slate-600">{resource.description}</span>
        <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-600">
          Explore
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  );
}

function AudienceTabs({ activeAudience, onChange }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-4">
      {audiences.map((audience) => (
        <button
          key={audience.id}
          type="button"
          onClick={() => onChange(audience.id)}
          className={`flex min-h-[50px] items-center justify-center gap-3 border-slate-200 px-4 text-sm font-bold transition md:border-r md:last:border-r-0 ${
            activeAudience === audience.id
              ? 'border border-blue-400 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)] md:border-blue-400'
              : 'text-slate-950 hover:bg-slate-50 hover:text-blue-700'
          }`}
          aria-pressed={activeAudience === audience.id}
        >
          <audience.icon className="h-5 w-5" />
          {audience.label}
        </button>
      ))}
    </div>
  );
}

export default function Resources() {
  const [activeAudience, setActiveAudience] = useState('athletes');
  const [query, setQuery] = useState('');

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const resources = resourcesByAudience[activeAudience];

    if (!normalized) return resources;

    return resources.filter((resource) =>
      `${resource.title} ${resource.description}`.toLowerCase().includes(normalized)
    );
  }, [activeAudience, query]);

  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_48%,#eef5ff_100%)] text-slate-950">
      <section className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.54fr_0.46fr]">
          <div>
            <div className="mb-7 inline-flex items-center gap-3 text-xl font-semibold text-slate-800">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white">
                <BookOpen className="h-3.5 w-3.5" />
              </span>
              Resources
            </div>
            <h1 className="max-w-[680px] font-sans text-4xl font-bold leading-[1.08] normal-case tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
              Resources for better training decisions
            </h1>
            <p className="mt-6 max-w-[650px] text-lg leading-8 text-slate-600">
              Expert guides, checklists, and tools to help you find the right coach,
              improve your training, and grow your business.
            </p>
          </div>
          <div className="hidden justify-end lg:flex">
            <img
              src="/resources-hero-preview.png"
              alt="LevelCoach help center and payments preview"
              className="w-full max-w-[520px] object-contain"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,0.73fr)_minmax(300px,0.27fr)]">
          <main>
            <label className="relative block max-w-[650px]">
              <span className="sr-only">Search guides, articles, and help</span>
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search guides, articles, and help"
                className="h-[50px] w-full rounded-lg border border-slate-200 bg-white pl-14 pr-5 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="mt-5">
              <AudienceTabs activeAudience={activeAudience} onChange={setActiveAudience} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredResources.map((resource) => (
                <ResourceCard key={resource.title} resource={resource} />
              ))}
            </div>

            {filteredResources.length === 0 && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="font-sans text-lg font-bold normal-case tracking-normal text-slate-950">
                  No resources found
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Try a different search or choose another audience tab.
                </p>
              </div>
            )}

            <section className="mt-5 grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-3">
              {trustItems.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center gap-4 border-b border-slate-200 px-6 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  <item.icon className="h-7 w-7 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-sans text-base font-bold normal-case tracking-normal text-slate-950">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-sans text-xl font-bold normal-case tracking-normal text-slate-950">
                Quick Links
              </h2>
              <div className="mt-4 space-y-3">
                {quickLinks.map((link) => (
                  <Link
                    key={link.title}
                    to={link.href}
                    className="group flex items-center gap-4 rounded-lg transition hover:bg-slate-50"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-blue-600">
                      <link.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-950">{link.title}</span>
                      <span className="block text-xs text-slate-600">{link.description}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                  </Link>
                ))}
              </div>
            </section>

            <section id="support" className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <h2 className="font-sans text-xl font-bold normal-case tracking-normal text-slate-950">
                Contact Support
              </h2>
              <p className="mt-1.5 max-w-[280px] text-xs leading-5 text-slate-700">
                Our team is here to help you every step of the way.
              </p>

              <div className="mt-4 space-y-3 text-sm font-medium text-blue-700">
                <a href="mailto:support@levelcoach.com" className="flex items-center gap-3 hover:text-blue-800">
                  <Mail className="h-5 w-5" />
                  support@levelcoach.com
                </a>
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5" />
                  <span>Live chat</span>
                  <span className="ml-1 flex items-center gap-2 text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Available
                  </span>
                </div>
                <a href="tel:2485550123" className="flex items-center gap-3 hover:text-blue-800">
                  <Phone className="h-5 w-5" />
                  (248) 555-0123
                </a>
              </div>

              <Button
                asChild
                className="mt-4 h-10 w-full rounded-lg bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700"
              >
                <a href="mailto:support@levelcoach.com">Contact Support</a>
              </Button>
              <p className="mt-3 text-center text-xs text-slate-600">Mon - Fri, 9:00 AM - 6:00 PM ET</p>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
