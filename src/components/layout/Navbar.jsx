import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Shield, Briefcase, ChevronDown, LogOut, Settings, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';
import { fullName, initialsOf } from '@/lib/displayName';
import NotificationsBell from '@/features/coach/NotificationsBell';
import LevelCoachLogo from '@/components/public/LevelCoachLogo';
import CreditsModal from '@/components/layout/CreditsModal';
import { useCreditBalance } from '@/hooks/useCreditBalance';

function creditButtonCopy(balance) {
  if (balance.loading) return 'Credits: ...';
  const count = Math.max(0, Number(balance.remainingSessions) || 0);
  return `Credits: ${count} session${count === 1 ? '' : 's'}`;
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState({}); // { team: true, apply: false }
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, isAuthenticated, isAdmin, isSuperAdmin, isCoach, isOrganizationAdmin, isGuardian, logout } = useAuth();
  const authenticated = isAuthenticated;
  const location = useLocation();
  const navigate = useNavigate();
  const isGuestPlatform = !authenticated || !user;
  const showCreditBalance = authenticated && !!user && !isAdmin && !isCoach && !isOrganizationAdmin;
  const creditBalance = useCreditBalance(user, showCreditBalance);

  // Human-readable account type for the account menu. Display only — order
  // matters because admins also pass the isCoach check.
  const roleLabel = isSuperAdmin
    ? 'Super admin'
    : isAdmin
      ? 'Admin'
      : isCoach
        ? 'Coach'
        : isOrganizationAdmin
          ? 'Organization admin'
          : isGuardian
            ? 'Parent'
            : 'Athlete';

  // Elevate the guest navbar with a stronger shadow once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const getNavLinks = () => {
    // Guests: full marketplace/product navigation.
    if (!authenticated || !user) {
      return [
        { label: 'Find a coach', path: '/coaches' },
        { label: 'Sports', path: '/sports' },
        { label: 'Organizations', path: '/organizations' },
        { label: 'How it works', path: '/how-it-works' },
        {
          label: 'For you',
          path: '/for-you',
          items: [
            { label: 'For athletes', path: '/for-athletes' },
            { label: 'For parents', path: '/for-parents' },
            { label: 'For coaches', path: '/for-coaches' },
            { label: 'For organizations', path: '/for-organizations' },
          ],
        },
        {
          label: 'Resources',
          path: '/resources',
          items: [
            { label: 'Resource center', path: '/resources' },
            { label: 'FAQ', path: '/faq' },
            { label: 'Blog', path: '/blog' },
            { label: 'Support', path: '/support' },
            { label: 'About', path: '/about' },
          ],
        },
      ];
    }

    // Admins: coach portal + admin only.
    if (isAdmin) {
      return [
        { label: 'Coaching portal', path: '/coach', icon: Briefcase },
        { label: 'Admin', path: '/admin', icon: Shield },
      ];
    }

    // Coaches (non-admin): coach portal only.
    if (isCoach) {
      return [{ label: 'Coaching portal', path: '/coach', icon: Briefcase }];
    }

    // Organization admins: org portal + marketplace.
    if (isOrganizationAdmin) {
      return [
        { label: 'Organization', path: '/organization', icon: Briefcase },
        { label: 'Find a coach', path: '/coaches' },
        { label: 'Messages', path: '/messages' },
      ];
    }

    // Clients (athletes / parents): account nav. Parents land on the same
    // /dashboard route — only the label differs.
    return [
      { label: isGuardian ? 'Family portal' : 'Dashboard', path: '/dashboard' },
      { label: 'Find a coach', path: '/coaches' },
      { label: 'Messages', path: '/messages' },
    ];
  };

  const navLinks = getNavLinks();

  const isActive = (path) => {
    const [pathname, hash] = path.split('#');
    if (hash) return location.pathname === pathname && location.hash === `#${hash}`;
    if (pathname === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // A dropdown group is active when any of its items is the current page.
  const isGroupActive = (link) =>
    link.items ? link.items.some((item) => isActive(item.path)) : isActive(link.path);

  const handleNavClick = (path) => {
    const hash = path.includes('#') ? path.split('#')[1] : '';
    if (hash && location.pathname === '/') {
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    closeMobile();
  };

  const toggleMobileExpand = (key) =>
    setMobileExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const closeMobile = () => {
    setMobileOpen(false);
    setMobileExpanded({});
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md transition-all duration-300 ${
        isGuestPlatform
          ? `border-slate-200 text-slate-950 ${
              scrolled ? 'bg-white/90 shadow-lg shadow-slate-900/5' : 'bg-white/80 shadow-sm'
            }`
          : 'bg-background/90 border-border'
      }`}
    >
      <div className={`${isGuestPlatform ? 'max-w-[1480px]' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
        <div className="flex items-center justify-between h-20">
          <LevelCoachLogo />

          {/* Right cluster: desktop nav, the single notifications bell (all
              breakpoints), and the mobile toggle. */}
          <div className="flex items-center gap-1">

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) =>
              link.items ? (
                <DropdownMenu key={link.path}>
                  <DropdownMenuTrigger
                    className={`px-4 py-2 transition-colors outline-none focus:outline-none flex items-center gap-1.5 whitespace-nowrap ${
                      isGuestPlatform
                        ? `border-b-2 text-sm font-semibold tracking-normal ${
                            isGroupActive(link)
                              ? 'border-blue-600 text-blue-700'
                              : 'border-transparent text-slate-950 hover:text-blue-700'
                          }`
                        : isGroupActive(link)
                          ? 'text-sm font-semibold text-accent'
                          : 'text-sm font-semibold text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {link.icon && <link.icon className="w-3.5 h-3.5" />}
                    {link.label}
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className={`min-w-[220px] p-1 ${
                      isGuestPlatform ? 'bg-white border border-slate-200 shadow-xl' : 'bg-card border border-border'
                    }`}
                  >
                    {link.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link
                          to={item.path}
                          className={`px-3 py-2 text-sm rounded-sm cursor-pointer w-full ${
                            isGuestPlatform
                              ? isActive(item.path)
                                ? 'font-semibold text-blue-700 bg-blue-50'
                                : 'font-semibold text-slate-700 hover:text-blue-700 focus:text-blue-700'
                              : isActive(item.path)
                                ? 'font-semibold text-accent bg-accent/10'
                                : 'font-semibold text-foreground hover:text-accent focus:text-accent'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => handleNavClick(link.path)}
                  className={`px-4 py-2 transition-colors border-b-2 whitespace-nowrap ${
                    isGuestPlatform
                      ? `text-sm font-semibold tracking-normal ${
                          isActive(link.path)
                            ? 'text-blue-700 border-blue-600'
                            : 'text-slate-950 border-transparent hover:text-blue-700'
                        }`
                      : isActive(link.path)
                        ? 'text-sm font-semibold text-accent border-accent'
                        : 'text-sm font-semibold text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {link.icon && <link.icon className="w-3.5 h-3.5" />}
                    {link.label}
                  </span>
                </Link>
              )
            )}
            <div className="ml-4">
              {authenticated ? (
                <div className="flex items-center gap-2">
                  {showCreditBalance && (
                    <button
                      type="button"
                      onClick={() => setCreditsOpen(true)}
                      className="hidden h-10 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-xs font-extrabold text-blue-800 shadow-sm transition hover:border-blue-200 hover:bg-white lg:inline-flex"
                      aria-haspopup="dialog"
                      aria-label="Open training credits"
                      title={
                        creditBalance.remainingSessions > 0
                          ? `${creditBalance.remainingSessions} credit${creditBalance.remainingSessions === 1 ? '' : 's'} available`
                          : 'No active training credit'
                      }
                    >
                      <WalletCards className="h-4 w-4" aria-hidden="true" />
                      {creditButtonCopy(creditBalance)}
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="flex items-center gap-1.5 rounded-full p-1 pr-1.5 transition-colors hover:bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label="Open account menu"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                        {initialsOf(user)}
                      </span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={8}
                      className="min-w-[240px] p-1 bg-card border border-border"
                    >
                      <DropdownMenuLabel className="px-3 py-2 font-normal">
                        <p className="text-sm font-semibold text-foreground truncate">{fullName(user)}</p>
                        {user?.email && (
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel}</p>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link
                          to="/settings"
                          className="px-3 py-2 text-sm rounded-sm cursor-pointer w-full font-semibold text-foreground hover:text-accent focus:text-accent"
                        >
                          <Settings className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild onSelect={() => logout()}>
                        <button
                          type="button"
                          className="px-3 py-2 text-sm rounded-sm cursor-pointer w-full font-semibold text-foreground hover:text-accent focus:text-accent"
                        >
                          <LogOut className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                          Log out
                        </button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/sign-in')}
                    className={`${
                      isGuestPlatform
                        ? `h-11 border-transparent bg-transparent px-4 text-sm font-semibold normal-case tracking-normal shadow-none hover:bg-slate-50 hover:text-blue-700 ${
                            isActive('/sign-in')
                              ? 'text-blue-700 underline decoration-blue-600 decoration-2 underline-offset-[10px]'
                              : 'text-slate-950'
                          }`
                        : 'text-sm font-semibold'
                    }`}
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/create-account')}
                    className={`${
                      isGuestPlatform
                        ? 'h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold normal-case tracking-normal text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700'
                        : 'bg-accent text-accent-foreground hover:bg-accent/90'
                    }`}
                  >
                    Create free account
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Single bell for every breakpoint: two mounted instances would
              double-fetch and hold desynced unread state across resizes. On
              desktop it sits right of the account menu; on mobile, left of
              the hamburger. */}
          {authenticated && (
            <div className="flex items-center">
              <NotificationsBell buttonClassName="h-10 w-10 rounded-full text-foreground hover:bg-secondary" />
            </div>
          )}

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-1">
            {/* The primary CTA must exist outside the hamburger — visible in
                the collapsed mobile header for guests. */}
            {!authenticated && (
              <Button
                size="sm"
                onClick={() => navigate('/create-account')}
                className={`mr-1 h-9 px-3 text-xs font-semibold ${
                  isGuestPlatform ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-accent text-accent-foreground hover:bg-accent/90'
                }`}
              >
                Create free account
              </Button>
            )}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`p-2 ${isGuestPlatform ? 'text-slate-950' : 'text-foreground'}`}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className={`md:hidden border-b ${isGuestPlatform ? 'bg-white border-slate-200' : 'bg-background border-border'}`}>
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) =>
              link.items ? (
                <div key={link.path}>
                  <button
                    onClick={() => toggleMobileExpand(link.path)}
                    aria-expanded={!!mobileExpanded[link.path]}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-md transition-colors ${
                      isGuestPlatform
                        ? isGroupActive(link)
                          ? 'text-blue-700 bg-blue-50'
                          : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
                        : isGroupActive(link)
                          ? 'text-accent bg-secondary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {link.icon && <link.icon className="w-4 h-4" />}
                      {link.label}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${mobileExpanded[link.path] ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {mobileExpanded[link.path] && (
                    <div className={`ml-4 pl-3 border-l space-y-0.5 mt-1 mb-2 ${isGuestPlatform ? 'border-slate-200' : 'border-border'}`}>
                      {link.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={closeMobile}
                          className={`block px-4 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                            isGuestPlatform
                              ? isActive(item.path)
                                ? 'text-blue-700 bg-blue-50'
                                : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
                              : isActive(item.path)
                                ? 'text-accent bg-secondary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => handleNavClick(link.path)}
                  className={`block px-4 py-3 text-sm font-semibold rounded-md transition-colors ${
                    isGuestPlatform
                      ? isActive(link.path)
                        ? 'text-blue-700 bg-blue-50'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
                      : isActive(link.path)
                        ? 'text-accent bg-secondary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {link.icon && <link.icon className="w-4 h-4" />}
                    {link.label}
                  </span>
                </Link>
              )
            )}
            <div className={`pt-2 border-t space-y-2 ${isGuestPlatform ? 'border-slate-200' : 'border-border'}`}>
              {authenticated ? (
                <>
                  {showCreditBalance && (
                    <button
                      type="button"
                      onClick={() => {
                        closeMobile();
                        setCreditsOpen(true);
                      }}
                      className="mx-4 flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-extrabold text-blue-800"
                      aria-haspopup="dialog"
                    >
                      <span className="inline-flex items-center gap-2">
                        <WalletCards className="h-4 w-4" aria-hidden="true" />
                        Training credits
                      </span>
                      <span>{creditButtonCopy(creditBalance).replace('Credits: ', '')}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                      {initialsOf(user)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{fullName(user)}</p>
                      {user?.email && (
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{roleLabel}</p>
                    </div>
                  </div>
                  <Link to="/settings" onClick={closeMobile}>
                    <Button variant="ghost" className="w-full justify-start text-sm font-semibold">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full text-sm font-semibold"
                    onClick={() => logout()}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className={`w-full ${
                      isGuestPlatform
                        ? 'font-semibold normal-case tracking-normal text-slate-950'
                        : 'text-sm font-semibold'
                    }`}
                    onClick={() => {
                      closeMobile();
                      navigate('/sign-in');
                    }}
                  >
                    Sign in
                  </Button>
                  <Button
                    className={`w-full text-sm font-semibold ${
                      isGuestPlatform ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-accent text-accent-foreground'
                    }`}
                    onClick={() => {
                      closeMobile();
                      navigate('/create-account');
                    }}
                  >
                    Create free account
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {showCreditBalance && (
        <CreditsModal
          open={creditsOpen}
          onOpenChange={setCreditsOpen}
          user={user}
          creditBalance={creditBalance}
        />
      )}
    </nav>
  );
}
