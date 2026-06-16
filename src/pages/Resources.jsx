import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  LifeBuoy,
  Mail,
  Search,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal, HeroPattern } from '@/features/marketing/MarketingMotion';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

const audiences = [
  { id: 'athletes', label: 'Athletes', icon: Trophy },
  { id: 'parents', label: 'Parents', icon: UserCheck },
  { id: 'coaches', label: 'Coaches', icon: LifeBuoy },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
];

// Every destination below is a real page on this site — no dead-end guides,
// phone lines, or chat widgets.
const resourcesByAudience = {
  athletes: [
    {
      title: 'Find a coach',
      description: 'Search published coaches by sport, location, level, availability, and specialty.',
      icon: Search,
      href: '/coaches',
    },
    {
      title: 'How booking works',
      description: 'The full athlete journey: search, sign once, book with credits, train, and track progress.',
      icon: ClipboardList,
      href: '/how-it-works',
    },
    {
      title: 'Training for athletes',
      description: 'What you get on LevelCoach: real reviews, live availability, and skill assessments.',
      icon: Trophy,
      href: '/for-athletes',
    },
    {
      title: 'Blog',
      description: 'Training articles and platform updates from the LevelCoach team.',
      icon: BookOpen,
      href: '/blog',
    },
    {
      title: 'Terms',
      description: 'Booking, credits, cancellation windows, and conduct rules in plain language.',
      icon: FileText,
      href: '/terms',
    },
  ],
  parents: [
    {
      title: 'Safety for parents',
      description: 'Guardian-controlled booking, signed waivers, and message visibility for athletes under 18.',
      icon: ShieldCheck,
      href: '/for-parents',
    },
    {
      title: 'Find a coach for your athlete',
      description: 'Compare coaches by sport, age group, location, and reviews from completed sessions.',
      icon: Search,
      href: '/coaches',
    },
    {
      title: 'Browse organizations',
      description: 'Academies and clubs with published coach rosters you can book from.',
      icon: Building2,
      href: '/organizations',
    },
    {
      title: 'How it works',
      description: 'Step-by-step: create a parent account, sign once per child, book and follow progress.',
      icon: ClipboardList,
      href: '/how-it-works',
    },
    {
      title: 'Privacy Notice',
      description: 'What we collect, how athlete data is protected, and your data rights.',
      icon: FileText,
      href: '/privacy',
    },
  ],
  coaches: [
    {
      title: 'Coaching on LevelCoach',
      description: 'Marketplace visibility, scheduling, client tools, and Stripe Connect payouts.',
      icon: Users,
      href: '/for-coaches',
    },
    {
      title: 'How getting paid works',
      description: 'Set your own rates and get paid securely to your bank through Stripe Connect — automatically, every session.',
      icon: CreditCard,
      href: '/for-coaches#coach-pricing',
    },
    {
      title: 'Apply to coach',
      description: 'Submit your application — sports, experience, and service area. Every application is reviewed.',
      icon: ClipboardList,
      href: '/apply/private-training-coach',
    },
    {
      title: 'The coach journey',
      description: 'Apply, complete the publish checklist, go live, and get paid — explained end to end.',
      icon: CalendarDays,
      href: '/how-it-works',
    },
    {
      title: 'Blog',
      description: 'Training articles and platform updates from the LevelCoach team.',
      icon: BookOpen,
      href: '/blog',
    },
  ],
  organizations: [
    {
      title: 'Organizations on LevelCoach',
      description: 'Roster management, automated secure payouts, branded pages, and compliance gates.',
      icon: Building2,
      href: '/for-organizations',
    },
    {
      title: 'Create an organization',
      description: 'Set up your academy or club, invite coaches, and configure payout rules.',
      icon: ClipboardList,
      href: '/apply/organization',
    },
    {
      title: 'See active organizations',
      description: 'Browse the public directory of organizations already running on the platform.',
      icon: Search,
      href: '/organizations',
    },
    {
      title: 'Payouts explained',
      description: 'How flexible, configurable payouts work and how each share is paid out securely via Stripe.',
      icon: CreditCard,
      href: '/for-organizations',
    },
    {
      title: 'How It Works',
      description: 'The full organization journey from creation to automated payouts.',
      icon: CalendarDays,
      href: '/how-it-works',
    },
  ],
};

const quickLinks = [
  { title: 'How LevelCoach works', description: 'Understand the platform', icon: ClipboardList, href: '/how-it-works' },
  { title: 'Find a coach', description: 'Search the marketplace', icon: Search, href: '/coaches' },
  { title: 'How getting paid works', description: 'Coach payouts via Stripe', icon: CreditCard, href: '/for-coaches#coach-pricing' },
  { title: 'Blog', description: 'Articles & updates', icon: BookOpen, href: '/blog' },
  { title: 'Terms', description: 'Platform rules', icon: FileText, href: '/terms' },
  { title: 'Privacy Notice', description: 'Your data rights', icon: ShieldCheck, href: '/privacy' },
];

function ResourceCard({ resource }) {
  return (
    <Link
      to={resource.href}
      className="group flex min-h-[144px] gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10 focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm transition group-hover:bg-blue-600 group-hover:text-white">
        <resource.icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <span className="min-w-0 pt-1">
        <span className="block font-display text-base font-bold tracking-normal text-slate-950">
          {resource.title}
        </span>
        <span className="mt-2 block line-clamp-3 text-sm leading-5 text-slate-600">{resource.description}</span>
        <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-600">
          Open
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

function AudienceTabs({ activeAudience, onChange }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-4" role="tablist" aria-label="Resource audience">
      {audiences.map((audience) => (
        <button
          key={audience.id}
          type="button"
          role="tab"
          aria-selected={activeAudience === audience.id}
          onClick={() => onChange(audience.id)}
          className={`flex min-h-[50px] items-center justify-center gap-3 border-slate-200 px-4 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-blue-600 md:border-r md:last:border-r-0 ${
            activeAudience === audience.id
              ? 'border border-blue-400 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)] md:border-blue-400'
              : 'text-slate-950 hover:bg-slate-50 hover:text-blue-700'
          }`}
        >
          <audience.icon className="h-5 w-5" aria-hidden="true" />
          {audience.label}
        </button>
      ))}
    </div>
  );
}

export default function Resources() {
  usePageMeta({
    title: 'Resources',
    description: 'Guides to finding a coach, booking safely, coaching on LevelCoach, and running a training organization — plus the blog and support contact.',
  });

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
    <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_60%,#eef5ff_100%)] text-slate-950">
      {/* Dark hero band */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_15%_0%,#102a5c_0%,#081226_60%,#05080f_100%)] text-white">
        <HeroPattern className="text-white/[0.07]" />
        <div className="relative mx-auto max-w-[1380px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <Reveal className="max-w-[720px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-blue-100 backdrop-blur">
              <BookOpen className="h-4 w-4 text-blue-300" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Resource center</span>
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Resources for better{' '}
              <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                training decisions
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Everything here links to a real page on LevelCoach — platform guides, the marketplace,
              legal documents, and the blog.
            </p>
          </Reveal>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.73fr)_minmax(300px,0.27fr)]">
          <main>
            <label className="relative block max-w-[650px]">
              <span className="sr-only">Search resources</span>
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resources"
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
                <p className="font-display text-lg font-bold tracking-normal text-slate-950">
                  No resources found
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Try a different search or choose another audience tab.
                </p>
              </div>
            )}
          </main>

          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="Quick links">
              <h2 className="font-display text-xl font-bold tracking-normal text-slate-950">
                Quick links
              </h2>
              <div className="mt-4 space-y-3">
                {quickLinks.map((link) => (
                  <Link
                    key={link.title}
                    to={link.href}
                    className="group flex items-center gap-4 rounded-lg p-1 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-blue-600">
                      <link.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-950">{link.title}</span>
                      <span className="block text-xs text-slate-600">{link.description}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-600" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>

            <section id="support" className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 shadow-sm" aria-label="Contact support">
              <h2 className="font-display text-xl font-bold tracking-normal text-slate-950">
                Contact support
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-700">
                Questions about bookings, accounts, payments, or safety? Email us and a member of
                the team will get back to you.
              </p>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-4 flex items-center gap-3 break-all text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                {SUPPORT_EMAIL}
              </a>

              <Button
                asChild
                className="mt-4 h-10 w-full rounded-lg bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700"
              >
                <a href={`mailto:${SUPPORT_EMAIL}`}>Email support</a>
              </Button>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
