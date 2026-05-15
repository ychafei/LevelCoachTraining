import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Shield, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, isAdmin, isCoach, logout, navigateToLogin } = useAuth();
  const authenticated = isAuthenticated;
  const location = useLocation();

  const getNavLinks = () => {
    if (!authenticated || !user) {
      return [
        { label: 'Home', path: '/' },
        { label: 'About', path: '/about' },
        { label: 'Team', path: '/team' },
        { label: 'Book', path: '/book' },
        { label: 'Apply', path: '/apply' },
        { label: 'Blog', path: '/blog' },
      ];
    }

    const links = [];

    // Client-only top nav items
    if (!isCoach && !isAdmin) {
      links.push({ label: 'Book', path: '/book' });
      links.push({ label: 'Matching', path: '/matching' });
      links.push({ label: 'Dashboard', path: '/dashboard' });
      links.push({ label: 'Messages', path: '/messages' });
    }

    // Coach top nav collapses into a single "Coach Portal" entry —
    // sub-nav (Schedule / Clients / Earnings / Profile / Messages) lives
    // inside the portal shell, not the global navbar.
    if (isCoach) {
      links.push({ label: 'Coach Portal', path: '/coach', icon: Briefcase });
    }

    links.push({ label: 'Team', path: '/team' });
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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <img
              src="/logo-wordmark.png"
              alt="LC Training"
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 text-sm font-oswald tracking-wide uppercase transition-colors ${
                  isActive(link.path)
                    ? 'text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {link.icon && <link.icon className="w-3.5 h-3.5" />}
                  {link.label}
                </span>
              </Link>
            ))}
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
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
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
            ))}
            <div className="pt-2 border-t border-border space-y-2">
              {authenticated ? (
                <>
                  <Link to="/settings" onClick={() => setMobileOpen(false)}>
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