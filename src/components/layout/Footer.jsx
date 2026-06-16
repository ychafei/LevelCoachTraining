import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import LevelCoachLogo from '@/components/public/LevelCoachLogo';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

const COLUMNS = [
  {
    heading: 'PLATFORM',
    links: [
      { label: 'Find a Coach', to: '/coaches' },
      { label: 'Sports', to: '/sports' },
      { label: 'Organizations', to: '/organizations' },
      { label: 'How It Works', to: '/how-it-works' },
      { label: 'Resources', to: '/resources' },
      { label: 'Blog', to: '/blog' },
      { label: 'About', to: '/about' },
    ],
  },
  {
    heading: 'FOR YOU',
    links: [
      { label: 'For Athletes', to: '/for-athletes' },
      { label: 'For Parents', to: '/for-parents' },
      { label: 'For Coaches', to: '/for-coaches' },
      { label: 'For Organizations', to: '/for-organizations' },
    ],
  },
  {
    heading: 'GET STARTED',
    links: [
      { label: 'Create Free Account', to: '/create-account' },
      { label: 'Apply to Coach', to: '/apply/private-training-coach' },
      { label: 'Create an Organization', to: '/apply/organization' },
      { label: 'Sign In', to: '/sign-in' },
    ],
  },
  {
    heading: 'TRUST & SUPPORT',
    links: [
      { label: 'Safety', to: '/safety' },
      { label: 'FAQ', to: '/faq' },
      { label: 'Support', to: '/support' },
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy Notice', to: '/privacy' },
      { label: 'Unsubscribe', to: '/unsubscribe' },
    ],
  },
];

// Internal-linking strip for the sport landing pages (the SEO surface).
const POPULAR_SPORTS = [
  { label: 'Soccer', to: '/sports/soccer' },
  { label: 'Basketball', to: '/sports/basketball' },
  { label: 'Football', to: '/sports/football' },
  { label: 'Baseball', to: '/sports/baseball' },
  { label: 'Volleyball', to: '/sports/volleyball' },
  { label: 'Tennis', to: '/sports/tennis' },
  { label: 'Speed & Agility', to: '/sports/speed_agility' },
  { label: 'Strength', to: '/sports/strength_conditioning' },
];

export default function Footer() {
  const { isAuthenticated } = useAuth();

  // Signed-in surfaces get a minimal footer: no marketing columns or
  // "Create Free Account" / "Sign In" prompts that make a member feel logged
  // out. During the session check we render the guest footer — it must match
  // the prerendered snapshot byte-for-byte or hydration bails and the LCP
  // win from build:seo is lost. (Members see the marketing footer for the
  // ~half second the check takes; that trade buys every visitor a fast LCP.)
  if (isAuthenticated) {
    return (
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <LevelCoachLogo />
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 break-all text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              Support: {SUPPORT_EMAIL}
            </a>
          </div>
          <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
            </p>
            <div className="flex items-center gap-5 text-xs font-semibold text-muted-foreground">
              <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <Link to="/unsubscribe" className="transition-colors hover:text-foreground">Unsubscribe</Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative border-t border-slate-200 bg-white">
      {/* Brand accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-500" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="mb-4">
              <LevelCoachLogo />
            </div>
            <p className="text-slate-600 text-sm leading-6 max-w-md">
              A multi-sport coaching marketplace: athletes and families find and book verified
              coaches; coaches and training organizations run sessions, progress, messaging, and
              Stripe payouts from one platform.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-5 inline-flex items-center gap-2 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              {SUPPORT_EMAIL}
            </a>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.16em] text-slate-900 mb-4">{column.heading}</h4>
              <div className="space-y-2.5">
                {column.links.map((link) => (
                  <Link
                    key={link.to + link.label}
                    to={link.to}
                    className="block text-sm text-slate-600 transition-colors hover:text-blue-700"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>
        {/* Popular-sport strip: internal links into the sport landing pages. */}
        <nav aria-label="Popular sports" className="mt-10 border-t border-slate-200 pt-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Popular sports</span>
            {POPULAR_SPORTS.map((sport) => (
              <Link key={sport.to} to={sport.to} className="text-xs font-semibold text-slate-600 transition-colors hover:text-blue-700">
                {sport.label}
              </Link>
            ))}
            <Link to="/sports" className="text-xs font-bold text-blue-700 hover:underline">All sports</Link>
          </div>
        </nav>
        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row">
          <p className="text-center text-xs text-slate-500 sm:text-left">
            © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs font-semibold text-slate-500">
            <Link to="/terms" className="transition-colors hover:text-blue-700">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-blue-700">Privacy</Link>
            <Link to="/unsubscribe" className="transition-colors hover:text-blue-700">Unsubscribe</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
