import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Shield, Briefcase, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';
import LevelCoachLogo from '@/components/public/LevelCoachLogo';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState({}); // { team: true, apply: false }
  const { user, isAuthenticated, isAdmin, isCoach, isOrganizationAdmin, logout } = useAuth();
  const authenticated = isAuthenticated;
  const location = useLocation();
  const navigate = useNavigate();
  const isGuestPlatform = !authenticated || !user;

  const getNavLinks = () => {
    // Guests: full marketplace/product navigation.
    if (!authenticated || !user) {
      return [
        { label: 'Find a Coach', path: '/coaches' },
        { label: 'Organizations', path: '/organizations' },
        { label: 'How It Works', path: '/how-it-works' },
        {
          label: 'For You',
          path: '/for-you',
          items: [
            { label: 'For Athletes', path: '/for-athletes' },
            { label: 'For Parents', path: '/for-parents' },
            { label: 'For Coaches', path: '/for-coaches' },
            { label: 'For Organizations', path: '/for-organizations' },
          ],
        },
        {
          label: 'Resources',
          path: '/resources',
          items: [
            { label: 'Resource Center', path: '/resources' },
            { label: 'Blog', path: '/blog' },
            { label: 'About', path: '/about' },
          ],
        },
      ];
    }

    // Admins: coach portal + admin only.
    if (isAdmin) {
      return [
        { label: 'Coaching Portal', path: '/coach', icon: Briefcase },
        { label: 'Admin', path: '/admin', icon: Shield },
      ];
    }

    // Coaches (non-admin): coach portal only.
    if (isCoach) {
      return [{ label: 'Coaching Portal', path: '/coach', icon: Briefcase }];
    }

    // Organization admins: org portal + marketplace.
    if (isOrganizationAdmin) {
      return [
        { label: 'Organization', path: '/organization', icon: Briefcase },
        { label: 'Find a Coach', path: '/coaches' },
        { label: 'Messages', path: '/messages' },
      ];
    }

    // Clients (athletes / parents): account nav.
    return [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Find a Coach', path: '/coaches' },
      { label: 'Matching', path: '/matching' },
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
      className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b ${
        isGuestPlatform
          ? 'bg-white/95 border-slate-200 text-slate-950 shadow-sm'
          : 'bg-background/90 border-border'
      }`}
    >
      <div className={`${isGuestPlatform ? 'max-w-[1480px]' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
        <div className="flex items-center justify-between h-20">
          <LevelCoachLogo />

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
                          ? 'font-display text-sm tracking-wide uppercase text-accent'
                          : 'font-display text-sm tracking-wide uppercase text-muted-foreground hover:text-foreground'
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
                                ? 'font-display tracking-wide uppercase text-accent bg-accent/10'
                                : 'font-display tracking-wide uppercase text-foreground hover:text-accent focus:text-accent'
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
                        ? 'font-display text-sm tracking-wide uppercase text-accent border-accent'
                        : 'font-display text-sm tracking-wide uppercase text-muted-foreground border-transparent hover:text-foreground'
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
                <div className="flex items-center gap-3">
                  {user?.first_name && (
                    <span className="font-display tracking-wide uppercase text-xs text-muted-foreground hidden lg:inline">
                      Hi, <span className="text-accent">{user.first_name}</span>
                    </span>
                  )}
                  <Link to="/settings">
                    <Button variant="ghost" size="sm" className="font-display tracking-wide uppercase text-xs">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logout()}
                    className="font-display tracking-wide uppercase text-xs border-border"
                  >
                    Logout
                  </Button>
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
                        : 'font-display tracking-wide uppercase text-xs'
                    }`}
                  >
                    Sign In
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
                    Create Free Account
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-2 ${isGuestPlatform ? 'text-slate-950' : 'text-foreground'}`}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
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
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-display tracking-wide uppercase rounded-md transition-colors ${
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
                          className={`block px-4 py-2.5 text-xs font-display tracking-wide uppercase rounded-md transition-colors ${
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
                  className={`block px-4 py-3 text-sm font-display tracking-wide uppercase rounded-md transition-colors ${
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
                  <Link to="/settings" onClick={closeMobile}>
                    <Button variant="ghost" className="w-full justify-start font-display tracking-wide uppercase text-xs">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full font-display tracking-wide uppercase text-xs"
                    onClick={() => logout()}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className={`w-full ${
                      isGuestPlatform
                        ? 'font-semibold normal-case tracking-normal text-slate-950'
                        : 'font-display tracking-wide uppercase text-xs'
                    }`}
                    onClick={() => {
                      closeMobile();
                      navigate('/sign-in');
                    }}
                  >
                    Sign In
                  </Button>
                  <Button
                    className={`w-full font-display tracking-wide uppercase text-xs ${
                      isGuestPlatform ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-accent text-accent-foreground'
                    }`}
                    onClick={() => {
                      closeMobile();
                      navigate('/create-account');
                    }}
                  >
                    Create Free Account
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
