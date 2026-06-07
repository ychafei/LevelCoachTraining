import React from 'react';
import { Link } from 'react-router-dom';
import { Globe } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';

// Full-screen scaffold shared by the Sign In and Create Account pages.
// Renders the public top navigation, a centered two-column auth card
// (form on the left, brand panel on the right) and a slim auth footer.
// On screens below `lg` the brand panel is hidden so the form takes the
// full width — the pages stay real, responsive web pages (no device frame).
export default function AuthShell({ children, panel }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-950">
      <Navbar />

      <main className="flex-1 pt-20">
        <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12">
          <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.10)] lg:grid-cols-2">
            {/* Left: form */}
            <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
              <div className="mx-auto w-full max-w-md">{children}</div>
            </div>

            {/* Right: brand panel */}
            <div className="hidden p-3 lg:block">
              {panel}
            </div>
          </div>
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}

function AuthFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
        </p>
        <div className="flex items-center gap-5 text-xs">
          <Link to="/terms" className="text-slate-500 transition-colors hover:text-blue-700">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-slate-500 transition-colors hover:text-blue-700">
            Privacy Policy
          </Link>
          <Link to="/resources" className="text-slate-500 transition-colors hover:text-blue-700">
            Support
          </Link>
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Globe className="h-3.5 w-3.5" />
            English
          </span>
        </div>
      </div>
    </footer>
  );
}
