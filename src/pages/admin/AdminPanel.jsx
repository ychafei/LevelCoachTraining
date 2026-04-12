import React from 'react';
import { Link } from 'react-router-dom';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Users, Calendar, FileText, DollarSign, Briefcase, PenTool, MessageSquare, Shield, MailX, Zap } from 'lucide-react';

const adminLinks = [
  { label: 'Coaches', path: '/admin/coaches', icon: Users, desc: 'Manage coach profiles' },
  { label: 'Bookings', path: '/admin/bookings', icon: Calendar, desc: 'View all sessions' },
  { label: 'Credits', path: '/admin/credits', icon: Zap, desc: 'View & edit session credits' },
  { label: 'Content', path: '/admin/content', icon: FileText, desc: 'Edit site content' },
  { label: 'Pricing', path: '/admin/pricing', icon: DollarSign, desc: 'Manage packages' },
  { label: 'Applications', path: '/admin/applications', icon: Briefcase, desc: 'Review applications' },
  { label: 'Blog', path: '/admin/blog', icon: PenTool, desc: 'Create & edit posts' },
  { label: 'Users', path: '/admin/users', icon: Shield, desc: 'Manage users & roles' },
  { label: 'Messages', path: '/admin/messages', icon: MessageSquare, desc: 'View conversations' },
  { label: 'Unsubscribes', path: '/admin/unsubscribes', icon: MailX, desc: 'Manage unsubscribes' },
];

export default function AdminPanel() {
  const { isAdmin } = useCurrentUser();

  if (!isAdmin) {
    return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;
  }

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-4xl font-bold tracking-tight text-foreground mb-2">ADMIN PANEL</h1>
        <p className="text-muted-foreground mb-10">Manage your LC Training platform.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminLinks.map(({ label, path, icon: Icon, desc }) => (
            <Link
              key={path}
              to={path}
              className="bg-card border border-border rounded-lg p-6 hover:border-accent/30 transition-all group"
            >
              <Icon className="w-6 h-6 text-accent mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-oswald text-lg tracking-wider text-foreground">{label.toUpperCase()}</h3>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}