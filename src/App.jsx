import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import {
  RequireAuth,
  RequireCoach,
  RequireLinkedCoach,
  RequireAdmin,
  RequireClient,
} from '@/components/guards/RouteGuards';
import CoachLayout from '@/components/coach-portal/CoachLayout';
import CoachOverview from '@/pages/coach/CoachOverview';
import CoachSessions from '@/pages/coach/CoachSessions';
import CoachClients from '@/pages/coach/CoachClients';
import CoachClientDetail from '@/pages/coach/CoachClientDetail';
import CoachEarnings from '@/pages/coach/CoachEarnings';
import CoachProfile from '@/pages/coach/CoachProfile';

// Layouts
import PublicLayout from '@/components/layout/PublicLayout';

// Public pages
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import Book from '@/pages/Book';
import CoachDetail from '@/pages/CoachDetail';
import Blog from '@/pages/Blog';
import BlogPostPage from '@/pages/BlogPost';
import Apply from '@/pages/Apply';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Unsubscribe from '@/pages/Unsubscribe';
import Pay from '@/pages/Pay';
import ParentConsent from '@/pages/ParentConsent';

// Authenticated pages
import Dashboard from '@/pages/Dashboard';
import Messages from '@/pages/Messages';
import Settings from '@/pages/Settings';
import Matching from '@/pages/Matching';
import CoachSchedule from '@/pages/CoachSchedule';

// Admin pages
import AdminPanel from '@/pages/admin/AdminPanel';
import AdminCoaches from '@/pages/admin/AdminCoaches';
import AdminBookings from '@/pages/admin/AdminBookings';
import AdminContent from '@/pages/admin/AdminContent';
import AdminPricing from '@/pages/admin/AdminPricing';
import AdminApplications from '@/pages/admin/AdminApplications';
import AdminBlog from '@/pages/admin/AdminBlog';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminMessages from '@/pages/admin/AdminMessages';
import AdminUnsubscribes from '@/pages/admin/AdminUnsubscribes';
import AdminCredits from '@/pages/admin/AdminCredits';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/book" element={<Book />} />
        <Route path="/coaches/:coachId" element={<CoachDetail />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/parent-consent" element={<ParentConsent />} />

        {/* Authenticated — any signed-in user */}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Client-only */}
        <Route element={<RequireClient />}>
          <Route path="/matching" element={<Matching />} />
        </Route>

        {/* Coach portal — shell + nested pages. RequireCoach (admins also pass).
            Individual pages handle the "no coach_id" state gracefully. */}
        <Route element={<RequireCoach />}>
          <Route element={<CoachLayout />}>
            <Route path="/coach" element={<CoachOverview />} />
            <Route path="/coach/sessions" element={<CoachSessions />} />
            <Route path="/coach/schedule" element={<CoachSchedule />} />
            <Route path="/coach/messages" element={<Messages />} />
            <Route path="/coach/clients" element={<CoachClients />} />
            <Route path="/coach/clients/:clientEmail" element={<CoachClientDetail />} />
            <Route path="/coach/earnings" element={<CoachEarnings />} />
            <Route path="/coach/profile" element={<CoachProfile />} />
          </Route>
        </Route>

        {/* Legacy route redirects → coach portal */}
        <Route path="/coach-schedule" element={<Navigate to="/coach/schedule" replace />} />
        <Route path="/coach-setup" element={<Navigate to="/coach" replace />} />

        {/* Admin-only */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/admin/coaches" element={<AdminCoaches />} />
          <Route path="/admin/bookings" element={<AdminBookings />} />
          <Route path="/admin/credits" element={<AdminCredits />} />
          <Route path="/admin/content" element={<AdminContent />} />
          <Route path="/admin/pricing" element={<AdminPricing />} />
          <Route path="/admin/applications" element={<AdminApplications />} />
          <Route path="/admin/blog" element={<AdminBlog />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/messages" element={<AdminMessages />} />
          <Route path="/admin/unsubscribes" element={<AdminUnsubscribes />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
