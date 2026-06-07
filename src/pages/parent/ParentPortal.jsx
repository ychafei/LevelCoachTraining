import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, MessageSquare, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';

const actions = [
  { label: 'Create child profile', href: '/settings', icon: UserPlus },
  { label: 'Review bookings', href: '/dashboard', icon: Users },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Family documents', href: '/settings', icon: FileText },
];

export default function ParentPortal() {
  const { user } = useAuth();
  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Parent Portal</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
              {user?.first_name ? `${user.first_name}'s family workspace` : 'Family workspace'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage child profiles, approvals, payments, monitored messages, emergency details, and signed documents.
            </p>
          </div>
          <ShieldCheck className="h-10 w-10 text-accent" />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <Link key={action.href} to={action.href} className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-accent/50">
              <action.icon className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">{action.label}</p>
            </Link>
          ))}
        </div>

        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Child Profiles</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Phase 4 will expand this area into full parent-managed athlete profiles and guardian permissions.
          </p>
        </section>

        <div className="mt-6">
          <LegalSignaturePanel
            signerRole="guardian"
            title="Parent / Guardian Legal Packet"
            description="Sign the current guardian authority, minor athlete, medical, media, and safety documents before approving bookings."
          />
        </div>
      </div>
    </div>
  );
}
