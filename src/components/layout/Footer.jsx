import React from 'react';
import { Link } from 'react-router-dom';
import LevelCoachLogo from '@/components/public/LevelCoachLogo';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="mb-4">
              <LevelCoachLogo />
            </div>
            <p className="text-slate-600 text-sm leading-6 max-w-md">
              A multi-tenant coaching platform for private coaches and training organizations managing athletes,
              sessions, progress, messages, and payments from one branded portal.
            </p>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold tracking-wider text-slate-950 mb-4">PLATFORM</h4>
            <div className="space-y-2">
              <Link to="/" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">Overview</Link>
              <Link to="/apply/private-training-coach" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">For Coaches</Link>
              <Link to="/coaches" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">View Demo</Link>
              <Link to="/resources" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">Resources</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold tracking-wider text-slate-950 mb-4">LEGAL</h4>
            <div className="space-y-2">
              <Link to="/terms" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">Terms of Service</Link>
              <Link to="/privacy" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">Privacy Policy</Link>
              <Link to="/unsubscribe" className="block text-sm text-slate-600 hover:text-blue-700 transition-colors">Unsubscribe</Link>
            </div>
          </div>
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
