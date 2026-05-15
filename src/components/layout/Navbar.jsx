import React, { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Shield, Briefcase, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/AuthContext';
import { getBrandLabel } from '@/lib/brand';

const LCFC_ITEMS = [
  { label: 'Learn More', path: '/lcfc#overview' },
  { label: 'View Full Roster', path: '/lcfc#roster' },
  { label: 'View Full Schedule', path: '/lcfc#schedule' },
  { label: 'Meet The Staff', path: '/lcfc#staff' },
];

const APPLY_ITEMS = [
  { label: 'Apply as Team Player', path: '/apply/team-player' },
  { label: 'Apply as Team Coach', path: '/apply/team-coach' },
  { label: 'Apply as Private Training Coach', path: '/apply/private-training-coach' },
  { label: 'General Application', path: '/apply' },
];

// LCFC nav item: the label links to /lcfc, and the dropdown opens on hover,
// keyboard focus, or click. Same styling as the other navbar dropdowns.
function HoverLinkDropdown({ link, isActive }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    timer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className="relative"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Link
            to={link.path}
            className={`px-4 py-2 text-sm font-oswald tracking-wide uppercase transition-colors border-b-2 flex items-center gap-1.5 outline-none focus:outline-none ${
              isActive(link.path)
                ? 'text-accent border-accent'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {link.label}
            <ChevronDown className="w-3 h-3 opacity-70" />
          </Link>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="bg-card border border-border min-w-[220px] p-1"
        >
          {link.items.map((item) => (
            <DropdownMenuItem key={item.path} asChild>
              <Link
                to={item.path}
                className="px-3 py-2 text-sm font-oswald tracking-wide uppercase rounded-sm cursor-pointer w-full text-foreground hover:text-accent focus:text-accent"
              >
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState({}); // { team: true, apply: false }
  const { user, isAuthenticated, isAdmin, isCoach, logout, navigateToLogin } = useAuth();
  const authenticated = isAuthenticated;
  const location = useLocation();

  const getNavLinks = () => {
    if (!authenticated || !user) {
      return [
        { label: 'Home', path: '/' },
        { label: 'Book', path: '/book' },
        { label: 'LCFC', path: '/lcfc', items: LCFC_ITEMS, linkTrigger: true },
        { label: 'Apply', path: '/apply', items: APPLY_ITEMS },
        { label: 'Blog', path: '/blog' },
        { label: 'About', path: '/about' },
      ];
    }

    const links = [];

    if (!isCoach && !isAdmin) {
      links.push({ label: 'Book', path: '/book' });
      links.push({ label: 'Matching', path: '/matching' });
      links.push({ label: 'Dashboard', path: '/dashboard' });
      links.push({ label: 'Messages', path: '/messages' });
    }

    if (isCoach) {
      links.push({ label: 'Coach Portal', path: '/coach', icon: Briefcase });
    }

    links.push({ label: 'LCFC', path: '/lcfc', items: LCFC_ITEMS, linkTrigger: true });
    links.push({ label: 'Blog', path: '/blog' });

    if (isAdmin) {
      links.push({ label: 'Admin', path: '/admin', icon: Shield });
    }

    return links;
  };

  const navLinks = getNavLinks();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const toggleMobileExpand = (key) =>
    setMobileExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const closeMobile = () => {
    setMobileOpen(false);
    setMobileExpanded({});
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo-shield.png"
              alt=""
              aria-hidden="true"
              className="h-12 md:h-14 w-auto object-contain"
            />
            <span className="font-oswald text-2xl md:text-3xl font-bold tracking-wider text-accent whitespace-nowrap">
              {getBrandLabel(location.pathname)}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) =>
              link.items && link.linkTrigger ? (
                <HoverLinkDropdown key={link.path} link={link} isActive={isActive} />
              ) : link.items ? (
                <DropdownMenu key={link.path}>
                  <DropdownMenuTrigger
                    className={`px-4 py-2 text-sm font-oswald tracking-wide uppercase transition-colors outline-none focus:outline-none flex items-center gap-1.5 ${
                      isActive(link.path)
                        ? 'text-accent'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {link.icon && <link.icon className="w-3.5 h-3.5" />}
                    {link.label}
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="bg-card border border-border min-w-[220px] p-1"
                  >
                    {link.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link
                          to={item.path}
                          className={`px-3 py-2 text-sm font-oswald tracking-wide uppercase rounded-sm cursor-pointer w-full ${
                            isActive(item.path)
                              ? 'text-accent bg-accent/10'
                              : 'text-foreground hover:text-accent focus:text-accent'
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
                  className={`px-4 py-2 text-sm font-oswald tracking-wide uppercase transition-colors border-b-2 ${
                    isActive(link.path)
                      ? 'text-accent border-accent'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
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
                    <span className="font-oswald tracking-wide uppercase text-xs text-muted-foreground hidden lg:inline">
                      Hi, <span className="text-accent">{user.first_name}</span>
                    </span>
                  )}
                  <Link to="/settings">
                    <Button variant="ghost" size="sm" className="font-oswald tracking-wide uppercase text-xs">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logout()}
                    className="font-oswald tracking-wide uppercase text-xs border-border"
                  >
                    Logout
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToLogin()}
                    className="font-oswald tracking-wide uppercase text-xs"
                  >
                    Sign In
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigateToLogin()}
                    className="bg-accent text-accent-foreground font-oswald tracking-wide uppercase text-xs hover:bg-accent/90"
                  >
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-foreground p-2"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-b border-border">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) =>
              link.items ? (
                <div key={link.path}>
                  <button
                    onClick={() => toggleMobileExpand(link.path)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-oswald tracking-wide uppercase rounded-md transition-colors ${
                      isActive(link.path)
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
                    <div className="ml-4 pl-3 border-l border-border space-y-0.5 mt-1 mb-2">
                      {link.items.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={closeMobile}
                          className={`block px-4 py-2.5 text-xs font-oswald tracking-wide uppercase rounded-md transition-colors ${
                            isActive(item.path)
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
                  onClick={closeMobile}
                  className={`block px-4 py-3 text-sm font-oswald tracking-wide uppercase rounded-md transition-colors ${
                    isActive(link.path)
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
            <div className="pt-2 border-t border-border space-y-2">
              {authenticated ? (
                <>
                  <Link to="/settings" onClick={closeMobile}>
                    <Button variant="ghost" className="w-full justify-start font-oswald tracking-wide uppercase text-xs">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full font-oswald tracking-wide uppercase text-xs"
                    onClick={() => logout()}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full bg-accent text-accent-foreground font-oswald tracking-wide uppercase text-xs"
                  onClick={() => navigateToLogin()}
                >
                  Sign In / Sign Up
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
