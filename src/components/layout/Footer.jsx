import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import LevelCoachLogo from '@/components/public/LevelCoachLogo';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

const COLUMNS = [
  {
    heading: 'MARKETPLACE',
    links: [
      { label: 'Find a Coach', to: '/coaches' },
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
    heading: 'LEGAL',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Unsubscribe', to: '/unsubscribe' },
    ],
  },
];

export default function Footer() {
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
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row">
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
