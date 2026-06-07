import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { homePathForRole } from '@/lib/roleHome';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import {
  RequireAuth,
  RequireOnboardingComplete,
  RequireCoach,
  RequireLinkedCoach,
  RequireAdmin,
  RequireMasterAdmin,
  RequireOrganizationAdmin,
  RequireGuardianOfAthlete,
  RequireAthlete,
  RequireSignedLegalPacket,
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
import HowItWorks from '@/pages/HowItWorks';
import ForCoaches from '@/pages/ForCoaches';
import Resources from '@/pages/Resources';
import About from '@/pages/About';
import VerifyCoachLink from '@/pages/VerifyCoachLink';
import VerifyEmail from '@/pages/VerifyEmail';
import Book from '@/pages/Book';
import CoachSearch from '@/pages/CoachSearch';
import CoachDetail from '@/pages/CoachDetail';
import Blog from '@/pages/Blog';
import BlogPostPage from '@/pages/BlogPost';
import Apply from '@/pages/Apply';
import ApplyPrivateTrainingCoach from '@/pages/apply/ApplyPrivateTrainingCoach';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Unsubscribe from '@/pages/Unsubscribe';
import Pay from '@/pages/Pay';
import ParentConsent from '@/pages/ParentConsent';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import SignIn from '@/pages/SignIn';
import CreateAccount, { AthleteSignup, ParentSignup } from '@/pages/CreateAccount';
import CreateOrganization from '@/pages/CreateOrganization';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import OnboardingCompletion from '@/pages/onboarding/OnboardingCompletion';

// Authenticated pages
import Messages from '@/pages/Messages';
import Settings from '@/pages/Settings';
import Matching from '@/pages/Matching';
import CoachSchedule from '@/pages/CoachSchedule';
import AthletePortal from '@/pages/athlete/AthletePortal';
import ParentPortal from '@/pages/parent/ParentPortal';
import OrganizationPortal from '@/pages/organization/OrganizationPortal';
import MasterAdminPortal from '@/pages/master-admin/MasterAdminPortal';

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
import AdminLegalDocuments from '@/pages/admin/AdminLegalDocuments';
import AdminPayments from '@/pages/admin/AdminPayments';

// Public root: guests see the marketing landing page; signed-in users are
// sent to their role home (admin → /admin, coach → /coach, client →
// /dashboard) so they don't get stranded on the public site after login.
const RootRoute = () => {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated && user) {
    return <Navigate to={homePathForRole(user)} replace />;
  }
  return <Landing />;
};

const RoleHomeRoute = () => {
  const { user } = useAuth();
  return <Navigate to={homePathForRole(user)} replace />;
};

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
        <Route path="/" element={<RootRoute />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/for-coaches" element={<ForCoaches />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/about" element={<About />} />
        <Route path="/verify-coach-link" element={<VerifyCoachLink />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/book" element={<Book />} />
        <Route path="/coaches" element={<CoachSearch />} />
        <Route path="/coaches/:coachId" element={<CoachDetail />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/parent-consent" element={<ParentConsent />} />

        {/* Authenticated — any signed-in user with completed onboarding */}
        <Route element={<RequireOnboardingComplete />}>
          <Route path="/dashboard" element={<RoleHomeRoute />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Athlete / parent / organization portals */}
        <Route element={<RequireOnboardingComplete />}>
          <Route element={<RequireAthlete />}>
            <Route path="/athlete" element={<AthletePortal />} />
          </Route>
          <Route element={<RequireGuardianOfAthlete />}>
            <Route path="/parent" element={<ParentPortal />} />
          </Route>
          <Route element={<RequireOrganizationAdmin />}>
            <Route path="/organization" element={<OrganizationPortal />} />
          </Route>
        </Route>

        <Route element={<RequireOnboardingComplete />}>
          {/* Client-only */}
          <Route element={<RequireClient />}>
            <Route element={<RequireSignedLegalPacket />}>
              <Route path="/matching" element={<Matching />} />
            </Route>
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
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/content" element={<AdminContent />} />
            <Route path="/admin/pricing" element={<AdminPricing />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/legal-documents" element={<AdminLegalDocuments />} />
            <Route path="/admin/blog" element={<AdminBlog />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/messages" element={<AdminMessages />} />
            <Route path="/admin/unsubscribes" element={<AdminUnsubscribes />} />
          </Route>
        </Route>

        <Route element={<RequireMasterAdmin />}>
          <Route path="/master-admin" element={<MasterAdminPortal />} />
        </Route>
      </Route>

      <Route path="/onboarding" element={<OnboardingCompletion />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/signup"          element={<Signup />} />
      <Route path="/sign-in"         element={<SignIn />} />
      <Route path="/create-account"  element={<CreateAccount />} />
      <Route path="/create-account/athlete" element={<AthleteSignup />} />
      <Route path="/create-account/parent" element={<ParentSignup />} />
      <Route path="/create-organization" element={<CreateOrganization />} />
      <Route path="/apply/private-training-coach" element={<ApplyPrivateTrainingCoach />} />
      <Route path="/apply/training-organization" element={<CreateOrganization />} />
      <Route path="/apply/organization" element={<CreateOrganization />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />
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
