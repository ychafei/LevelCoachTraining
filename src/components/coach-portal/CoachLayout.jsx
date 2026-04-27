import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ClipboardList, Users, DollarSign, UserCircle, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

// Coach portal shell — rendered inside PublicLayout's main, so Navbar/Footer still wrap it.
// Left rail on desktop, horizontal scrolling tab row on mobile.

const NAV = [
  { to: '/coach',           label: 'Overview',  icon: LayoutDashboard, end: true },
  { to: '/coach/sessions',  label: 'Sessions',  icon: ClipboardList },
  { to: '/coach/schedule',  label: 'Schedule',  icon: CalendarDays },
  { to: '/coach/clients',   label: 'Clients',   icon: Users },
  { to: '/coach/earnings',  label: 'Earnings',  icon: DollarSign },
  { to: '/coach/messages',  label: 'Messages',  icon: MessageSquare },
  { to: '/coach/profile',   label: 'Profile',   icon: UserCircle },
];

function RailLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-oswald tracking-wider uppercase transition-colors ${
          isActive
            ? 'bg-accent/10 text-accent border border-accent/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

function TabLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-3 py-2 flex-shrink-0 text-[10px] font-oswald tracking-wider uppercase transition-colors ${
          isActive ? 'text-accent border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function CoachLayout() {
  const { user, isAdmin } = useAuth();
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || user?.email;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Portal header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-oswald tracking-[0.3em] uppercase text-accent">
            {isAdmin ? 'Admin · Coach Portal' : 'Coach Portal'}
          </p>
          <h1 className="font-oswald text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {displayName}
          </h1>
        </div>
      </div>

      {/* Mobile top-tabs */}
      <div className="md:hidden -mx-4 sm:-mx-6 mb-6 border-b border-border overflow-x-auto">
        <div className="flex min-w-max px-4 sm:px-6">
          {NAV.map(item => <TabLink key={item.to} {...item} />)}
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop left rail */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <nav className="sticky top-20 space-y-1">
            {NAV.map(item => <RailLink key={item.to} {...item} />)}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
