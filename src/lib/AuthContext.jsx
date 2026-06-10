import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { auth } from '@/lib/auth';
import { isAthlete, isOnboardingComplete, isOrganizationUser, isParentOrGuardian } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

const AuthContext = createContext(null);

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

// Full-screen stop state shown when accountProfile.ensure reports the caller
// is banned. The session has already been dropped by auth.js at this point.
function AccountSuspendedScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-4" role="alert">
        <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">Account Suspended</h1>
        <p className="text-muted-foreground text-sm">
          This account has been suspended and can no longer access LevelCoach Training.
          If you believe this is a mistake, contact us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>.
        </p>
        <Button
          variant="outline"
          onClick={() => { window.location.assign('/'); }}
          className="font-display tracking-wider uppercase"
        >
          Go Home
        </Button>
      </div>
    </div>
  );
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with the previous legacy flow which loaded
  // public app settings before auth. Appwrite has no equivalent boot step,
  // so this stays `false` after the first render.
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState(null);

  useEffect(() => {
    void checkUserAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (err) {
      if (err?.type === 'account_banned') {
        setAuthError({ type: 'account_banned' });
      } else {
        // 401 = no session — this is the normal "logged out" path, not an error.
        const code = err?.code;
        if (code !== 401 && code !== 403) {
          console.error('User auth check failed:', err);
        }
      }
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const refetchUser = useCallback(async () => {
    try {
      const fresh = await auth.getCurrentUser();
      setUser(fresh);
      setIsAuthenticated(true);
      return fresh;
    } catch (err) {
      if (err?.type === 'account_banned') {
        setAuthError({ type: 'account_banned' });
      }
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }
  }, []);

  const logout = async (shouldRedirect = true) => {
    await auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) window.location.assign('/');
  };

  const navigateToLogin = (returnUrl = window.location.href) => {
    auth.signIn(returnUrl);
  };

  const labels = Array.isArray(user?.labels) ? user.labels : [];
  const isAdmin = labels.includes('admin')
    || labels.includes('superadmin')
    || user?.role === 'admin'
    || user?.role === 'super_admin';
  const isSuperAdmin = user?.is_super_admin === true;
  const isCoach = labels.includes('coach') || user?.role === 'coach' || isAdmin;
  const onboardingComplete = !user || isOnboardingComplete(user);
  const isOrganizationAdmin = isOrganizationUser(user);
  const isGuardian = isParentOrGuardian(user);
  const isAthleteUser = isAthlete(user);

  if (authError?.type === 'account_banned') {
    return <AccountSuspendedScreen />;
  }

  return (
    <AuthContext.Provider value={{
      user,
      labels,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      isAdmin,
      isSuperAdmin,
      isCoach,
      isOrganizationAdmin,
      isGuardian,
      isAthlete: isAthleteUser,
      onboardingComplete,
      logout,
      navigateToLogin,
      checkAppState: checkUserAuth,
      refetchUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
