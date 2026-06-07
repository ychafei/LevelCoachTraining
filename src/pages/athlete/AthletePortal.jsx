import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, FileText, MessageSquare, Search, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';

const actions = [
  { label: 'Find coaches', href: '/coaches', icon: Search },
  { label: 'Book training', href: '/coaches', icon: CalendarCheck },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Signed documents', href: '/settings', icon: FileText },
];

export default function AthletePortal() {
  const { user } = useAuth();
  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Athlete Portal</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
              {user?.first_name ? `Welcome, ${user.first_name}` : 'Your training dashboard'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage booking, messages, profile details, and your required document status from one place.
            </p>
          </div>
          <UserRound className="h-10 w-10 text-accent" />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <Link key={action.href} to={action.href} className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-accent/50">
              <action.icon className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">{action.label}</p>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <LegalSignaturePanel
            signerRole="athlete"
            title="Athlete Legal Packet"
            description="Sign the current athlete participation, safety, and platform documents before booking training."
          />
        </div>
      </div>
    </div>
  );
}
