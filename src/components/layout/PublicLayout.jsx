import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import OnboardingModal from '@/components/OnboardingModal.jsx';
import { useAuth } from '@/lib/AuthContext';

export default function PublicLayout() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (isAuthenticated && user && !user.profile_setup_complete && user.role === 'user') {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [isAuthenticated, user, isLoadingAuth]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      <Footer />
      {showOnboarding && user && (
        <OnboardingModal
          user={user}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
