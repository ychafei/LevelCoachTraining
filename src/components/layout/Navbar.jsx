import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const { user, isAdmin, isCoach } = useCurrentUser();
  const location = useLocation();

  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthenticated);
  }, []);

  const getNavLinks = () => {
    if (!authenticated || !user) {
      return [
        { label: 'Home', path: '/' },
        { label: 'About', path: '/about' },
        { label: 'Book', path: '/book' },
        { label: 'Apply', path: '/apply' },
        { label: 'Blog', path: '/blog' },
      ];
    }

    const links = [];

    if (!isCoach && !isAdmin) {
      links.push({ label: 'Book', path: '/book' });
      links.push({ label: 'Matching', path: '/matching' });
    }

    links.push({ label: 'Dashboard', path: '/dashboard' });

    if (isCoach || isAdmin) {
      links.push({ label: 'Schedule', path: '/coach-schedule' });
    }

    links.push({ label: 'Messages', path: '/messages' });
    links.push({ label: 'Blog', path: '/blog' });

    if (isAdmin) {
      links.push({ label: 'Admin', path: '/admin', icon: Shield });
    }

    return links;
  };

  const navLinks = getNavLinks();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="https://media.base44.com/images/public/69d69d3ae73dc51803327ea6/a54216aca_LesChevresTraininglogodesign.png"
              alt="Les Chevrès Training"
              className="h-10 w-10 object-contain rounded-full"
            />
            <span className="font-oswald text-xl font-bold tracking-wider text-accent">LC TRAINING</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 text-sm font-oswald tracking-wide uppercase transition-colors ${
                  location.pathname === link.path
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
                  <Link to="/settings">
                    <Button variant="ghost" size="sm" className="font-oswald tracking-wide uppercase text-xs">
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => base44.auth.logout('/')}
                    className="font-oswald tracking-wide uppercase text-xs border-border"
                  >
                    Logout
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => base44.auth.redirectToLogin()}
                  className="bg-accent text-accent-foreground font-oswald tracking-wide uppercase text-xs hover:bg-accent/90"
                >
                  Sign In
                </Button>
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
                  location.pathname === link.path
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
                    onClick={() => base44.auth.logout('/')}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full bg-accent text-accent-foreground font-oswald tracking-wide uppercase text-xs"
                  onClick={() => base44.auth.redirectToLogin()}
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}