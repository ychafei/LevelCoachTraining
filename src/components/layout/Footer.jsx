import React from 'react';
import { Link } from 'react-router-dom';
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
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-6">
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
              className="mt-4 inline-block break-all text-sm font-semibold text-blue-700 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h4 className="font-display text-sm font-semibold tracking-wider text-slate-950 mb-4">{column.heading}</h4>
              <div className="space-y-2">
                {column.links.map((link) => (
                  <Link
                    key={link.to + link.label}
                    to={link.to}
                    className="block text-sm text-slate-600 hover:text-blue-700 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-slate-200">
          <p className="text-center text-xs text-slate-500">
            © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
