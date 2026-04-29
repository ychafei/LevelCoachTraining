import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { auth } from '@/lib/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with the previous Base44 flow which loaded
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
      // 401 = no session — this is the normal "logged out" path, not an error.
      const code = err?.code;
      if (code !== 401 && code !== 403) {
        console.error('User auth check failed:', err);
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
    } catch {
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

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.is_super_admin === true;
  const isCoach = user?.role === 'coach' || isAdmin;

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      isAdmin,
      isSuperAdmin,
      isCoach,
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
