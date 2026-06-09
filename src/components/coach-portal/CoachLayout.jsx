import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { coachRepo } from '@/api/repo';

const COACH_PROFILE_UPDATED_EVENT = 'levelcoach:coach-profile-updated';

const sidebarTrend = [
  { value: 12 },
  { value: 24 },
  { value: 20 },
  { value: 37 },
  { value: 34 },
  { value: 58 },
  { value: 92 },
];

const navItems = [
  { label: 'Dashboard', to: '/coach', icon: LayoutDashboard, isActive: ({ pathname, hash }) => pathname === '/coach' && !hash },
  { label: 'Profile Builder', to: '/coach/profile', icon: UserRound, isActive: ({ pathname }) => pathname === '/coach/profile' },
  {
    label: 'Bookings',
    to: '/coach/sessions?view=bookings',
    icon: ClipboardList,
    isActive: ({ pathname, search }) => pathname === '/coach/sessions' && search.includes('bookings'),
  },
  { label: 'Calendar', to: '/coach/schedule', icon: CalendarDays, isActive: ({ pathname }) => pathname === '/coach/schedule' },
  {
    label: 'Sessions',
    to: '/coach/sessions',
    icon: CheckSquare,
    isActive: ({ pathname, search }) => pathname === '/coach/sessions' && !search.includes('bookings'),
  },
  { label: 'Athletes', to: '/coach/clients', icon: Users, isActive: ({ pathname }) => pathname.startsWith('/coach/clients') },
  { label: 'Messages', to: '/coach/messages', icon: MessageSquare, isActive: ({ pathname }) => pathname === '/coach/messages' },
  { label: 'Payments', to: '/coach/earnings', icon: DollarSign, isActive: ({ pathname }) => pathname === '/coach/earnings' },
  { label: 'Reviews', to: '/coach#reviews', icon: Star, isActive: ({ pathname, hash }) => pathname === '/coach' && hash === '#reviews' },
  { label: 'Settings', to: '/settings', icon: Settings, isActive: ({ pathname }) => pathname === '/settings' },
];

function getDisplayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
  return name || user?.full_name || 'Marcus Johnson';
}

function getInitials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function SidebarNav({ onSelect }) {
  const location = useLocation();

  return (
    <nav className="space-y-1.5">
      {navItems.map(({ icon: Icon, ...item }) => {
        const active = item.isActive(location);
        return (
          <Link
            key={item.label}
            to={item.to}
            onClick={onSelect}
            className={cn(
              'flex h-12 items-center gap-3 rounded-lg px-4 text-[15px] font-semibold transition-colors',
              active
                ? 'bg-blue-600 text-white shadow-[0_10px_28px_rgba(37,99,235,0.35)]'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onSelect }) {
  return (
    <div className="flex min-h-full flex-col px-4 py-5">
      <Link
        to="/coach"
        onClick={onSelect}
        className="mb-7 flex h-[64px] w-full items-center rounded-lg bg-white px-3 shadow-sm"
      >
        <img
          src="/levelcoach-wordmark.png"
          alt="LevelCoach Training"
          className="h-[42px] w-auto max-w-full object-contain"
        />
      </Link>

      <SidebarNav onSelect={onSelect} />

      <div className="mt-auto rounded-lg border border-white/15 bg-[#0b1c38] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
        <p className="text-xl font-extrabold text-blue-400">LEVEL UP</p>
        <p className="mt-2 text-[17px] font-semibold leading-snug text-white">
          Your coaching.
          <br />
          Your athletes.
          <br />
          Your legacy.
        </p>
        <div className="mt-5 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sidebarTrend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sidebarTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={3}
                fill="url(#sidebarTrendFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Topbar({ mobileOpen, setMobileOpen }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [coachProfile, setCoachProfile] = useState(null);
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const initials = getInitials(displayName);
  const avatarUrl = coachProfile?.photo_url || user?.photo_url || '';

  useEffect(() => {
    if (!user?.coach_id) {
      setCoachProfile(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const row = await coachRepo.get(user.coach_id);
        if (!cancelled) setCoachProfile(row);
      } catch (err) {
        console.warn('Coach topbar profile load failed', err?.message || err);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.coach_id, location.pathname]);

  useEffect(() => {
    if (!user?.coach_id) return undefined;

    const handleCoachProfileUpdated = (event) => {
      const nextCoach = event.detail?.coach;
      if (!nextCoach) return;
      const nextId = nextCoach.id || nextCoach.$id;
      if (nextId === user.coach_id) {
        setCoachProfile((prev) => ({ ...(prev || {}), ...nextCoach }));
      }
    };

    window.addEventListener(COACH_PROFILE_UPDATED_EVENT, handleCoachProfileUpdated);
    return () => window.removeEventListener(COACH_PROFILE_UPDATED_EVENT, handleCoachProfileUpdated);
  }, [user?.coach_id]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06142c] text-white">
      <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 text-white lg:hidden"
          aria-label={mobileOpen ? 'Close coach menu' : 'Open coach menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <label className="relative hidden w-full max-w-[520px] sm:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            className="h-12 w-full rounded-lg border border-white/20 bg-white/5 px-12 text-sm text-white placeholder:text-slate-300 outline-none transition focus:border-blue-400 focus:bg-white/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-slate-300 hover:text-white"
            >
              Clear
            </button>
          )}
        </label>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setProfileOpen(false);
              }}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
              aria-label="Open notifications"
            >
              <Bell className="h-6 w-6" />
              <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                3
              </span>
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-full mt-3 w-80 rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-xl">
                <p className="px-2 pb-2 text-sm font-bold">Notifications</p>
                {['Sarah confirmed Thursday at 8:00 AM', 'Stripe payout lands tomorrow', 'Ethan shared a progress note'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="block w-full rounded-md px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((open) => !open);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/10"
              aria-label="Open coach account menu"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-sm font-bold text-white">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-bold leading-5">{displayName}</span>
                <span className="block text-xs text-slate-300">Coach</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-300 sm:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-3 w-64 rounded-lg border border-slate-200 bg-white p-2 text-slate-950 shadow-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold">{displayName}</p>
                  <p className="text-xs text-slate-500">{user?.email || `${initials}@levelcoach.training`}</p>
                </div>
                <Link to="/coach/profile" className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950">
                  Profile Builder
                </Link>
                <Link to="/settings" className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950">
                  Account Settings
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default function CoachLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] border-r border-white/10 bg-[#06142c] text-white lg:block">
        <SidebarContent />
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <button
          type="button"
          aria-label="Close coach menu"
          className="absolute inset-0 bg-slate-950/55"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-[280px] bg-[#06142c] text-white shadow-2xl transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <SidebarContent onSelect={() => setMobileOpen(false)} />
        </aside>
      </div>

      <div className="lg:pl-[280px]">
        <Topbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
          <footer className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 LevelCoach Training</span>
            <div className="flex flex-wrap gap-6">
              <Link to="/terms" className="hover:text-blue-600">Terms of Service</Link>
              <Link to="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
              <Link to="/resources" className="hover:text-blue-600">Help Center</Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
