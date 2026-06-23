import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { fullName, initialsOf } from '@/lib/displayName';
import { coachRepo } from '@/api/repo';
import { LevelCoachWordmarkPlate } from '@/components/public/LevelCoachLogo';
import NotificationsBell from '@/features/coach/NotificationsBell';

const COACH_PROFILE_UPDATED_EVENT = 'levelcoach:coach-profile-updated';

const navItems = [
  { label: 'Dashboard', to: '/coach', icon: LayoutDashboard, isActive: ({ pathname, hash }) => pathname === '/coach' && !hash },
  { label: 'Profile builder', to: '/coach/profile', icon: UserRound, isActive: ({ pathname }) => pathname === '/coach/profile' },
  {
    label: 'Bookings',
    to: '/coach/sessions?view=bookings',
    icon: ClipboardList,
    isActive: ({ pathname, search }) => pathname === '/coach/sessions' && search.includes('bookings'),
  },
  { label: 'Schedule', to: '/coach/schedule', icon: CalendarDays, isActive: ({ pathname }) => pathname === '/coach/schedule' },
  {
    label: 'Sessions',
    to: '/coach/sessions',
    icon: CheckSquare,
    isActive: ({ pathname, search }) => pathname === '/coach/sessions' && !search.includes('bookings'),
  },
  { label: 'Athletes', to: '/coach/clients', icon: Users, isActive: ({ pathname }) => pathname.startsWith('/coach/clients') },
  { label: 'Messages', to: '/coach/messages', icon: MessageSquare, isActive: ({ pathname }) => pathname === '/coach/messages' },
  { label: 'Payments', to: '/coach/earnings', icon: DollarSign, isActive: ({ pathname }) => pathname === '/coach/earnings' },
  { label: 'Reviews', to: '/coach/reviews', icon: Star, isActive: ({ pathname }) => pathname === '/coach/reviews' },
  { label: 'Settings', to: '/coach/settings', icon: Settings, isActive: ({ pathname }) => pathname === '/coach/settings' },
];

// Coach display name: prefer a real first/last name, then `name`. The email is
// never used as the name here — it stays on the small secondary line only.
function getDisplayName(user) {
  const name = fullName(user);
  return name === 'Member' ? 'Coach' : name;
}

function SidebarNav({ onSelect }) {
  const location = useLocation();

  return (
    <nav className="space-y-1.5" aria-label="Coach portal">
      {navItems.map(({ icon: Icon, ...item }) => {
        const active = item.isActive(location);
        return (
          <Link
            key={item.label}
            to={item.to}
            onClick={onSelect}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-12 items-center gap-3 rounded-lg px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active
                ? 'bg-blue-600 text-white shadow-[0_10px_28px_rgba(37,99,235,0.35)]'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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
      <Link to="/coach" onClick={onSelect} className="mb-7 block">
        {/* Shared wordmark on its white plate — the wordmark itself is dark ink,
            so the plate keeps it legible on the dark sidebar. */}
        <LevelCoachWordmarkPlate
          className="h-[64px] w-full"
          imageClassName="h-[42px] w-auto max-w-full object-contain"
        />
      </Link>

      <SidebarNav onSelect={onSelect} />
    </div>
  );
}

function Topbar({ mobileOpen, setMobileOpen }) {
  const { user, clearViewAs, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [coachProfile, setCoachProfile] = useState(null);
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const initials = initialsOf(user);
  const avatarUrl = coachProfile?.photo_url || user?.photo_url || '';
  const accountId = user?.account_id || '';
  const coachId = user?.coach_id || '';
  const showMasterAdminReturn = user?.master_admin_locked === true
    && user?.is_super_admin === true
    && Boolean(coachId || coachProfile?.id);

  useEffect(() => {
    if (!accountId && !coachId) {
      setCoachProfile(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        // Owner-only read first (coach merged with private contact fields);
        // fall back to the direct read so the topbar still resolves a photo.
        let row = await coachRepo.getSelf().catch(() => null);
        if (!row) {
          if (accountId) {
            const rows = await coachRepo.filter({ user_id: accountId }).catch(() => []);
            row = rows[0] || null;
          }
          if (!row && coachId) row = await coachRepo.get(coachId).catch(() => null);
        }
        if (!cancelled) setCoachProfile(row);
      } catch (err) {
        console.warn('Coach topbar profile load failed', err?.message || err);
      }
    })();

    return () => { cancelled = true; };
  }, [accountId, coachId]);

  useEffect(() => {
    const handleCoachProfileUpdated = (event) => {
      const nextCoach = event.detail?.coach;
      if (!nextCoach) return;
      setCoachProfile((prev) => ({ ...(prev || {}), ...nextCoach }));
    };

    window.addEventListener(COACH_PROFILE_UPDATED_EVENT, handleCoachProfileUpdated);
    return () => window.removeEventListener(COACH_PROFILE_UPDATED_EVENT, handleCoachProfileUpdated);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06142c] text-white">
      <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 text-white lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={mobileOpen ? 'Close coach menu' : 'Open coach menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <NotificationsBell />

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Open coach account menu"
              aria-expanded={profileOpen}
              aria-haspopup="true"
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
              <ChevronDown className="hidden h-4 w-4 text-slate-300 sm:block" aria-hidden="true" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-3 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 text-slate-950 shadow-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-bold">{displayName}</p>
                  {user?.email && <p className="text-xs text-slate-500 truncate">{user.email}</p>}
                </div>
                {showMasterAdminReturn && (
                  <>
                    <div className="my-1 h-px bg-slate-200" />
                    <Link
                      to="/master-admin"
                      onClick={() => {
                        clearViewAs();
                        setProfileOpen(false);
                      }}
                      className="flex items-start gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-5">Return to admin mode</span>
                        <span className="block text-xs leading-4 text-blue-700">Open master admin controls</span>
                      </span>
                    </Link>
                    <div className="my-1 h-px bg-slate-200" />
                  </>
                )}
                <Link
                  to="/coach/profile"
                  onClick={() => setProfileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                >
                  Profile builder
                </Link>
                <Link
                  to="/coach/settings"
                  onClick={() => setProfileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                >
                  Account settings
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
              <Link to="/terms" className="hover:text-blue-600">Terms of service</Link>
              <Link to="/privacy" className="hover:text-blue-600">Privacy policy</Link>
              <Link to="/resources" className="hover:text-blue-600">Help center</Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
