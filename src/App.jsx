import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { homePathForRole } from '@/lib/roleHome';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ViewAsBanner from '@/features/admin/ViewAsBanner';
import {
  RequireOnboardingComplete,
  RequireCoach,
  RequireAdmin,
  RequireMasterAdmin,
  RequireOrganizationAdmin,
  RequireGuardianOfAthlete,
  RequireAthlete,
} from '@/components/guards/RouteGuards';

// Layouts
import PublicLayout from '@/components/layout/PublicLayout';

// Route-level code splitting: every page loads lazily behind a single
// Suspense fallback so portal/admin bundles stay out of the public chunk.
const CoachLayout = React.lazy(() => import('@/components/coach-portal/CoachLayout'));
const CoachOverview = React.lazy(() => import('@/pages/coach/CoachOverview'));
const CoachSessions = React.lazy(() => import('@/pages/coach/CoachSessions'));
const CoachClients = React.lazy(() => import('@/pages/coach/CoachClients'));
const CoachClientDetail = React.lazy(() => import('@/pages/coach/CoachClientDetail'));
const CoachEarnings = React.lazy(() => import('@/pages/coach/CoachEarnings'));
const CoachProfile = React.lazy(() => import('@/pages/coach/CoachProfile'));
const CoachSettings = React.lazy(() => import('@/pages/coach/CoachSettings'));

// Public pages
const Landing = React.lazy(() => import('@/pages/Landing'));
const HowItWorks = React.lazy(() => import('@/pages/HowItWorks'));
const ForCoaches = React.lazy(() => import('@/pages/ForCoaches'));
const ForAthletes = React.lazy(() => import('@/pages/ForAthletes'));
const ForParents = React.lazy(() => import('@/pages/ForParents'));
const ForOrganizations = React.lazy(() => import('@/pages/ForOrganizations'));
const OrganizationDirectory = React.lazy(() => import('@/pages/OrganizationDirectory'));
const OrganizationDetail = React.lazy(() => import('@/pages/OrganizationDetail'));
const Resources = React.lazy(() => import('@/pages/Resources'));
const Faq = React.lazy(() => import('@/pages/Faq'));
const Support = React.lazy(() => import('@/pages/Support'));
const Safety = React.lazy(() => import('@/pages/Safety'));
const SportsIndex = React.lazy(() => import('@/pages/SportsIndex'));
const SportPage = React.lazy(() => import('@/pages/SportPage'));
const About = React.lazy(() => import('@/pages/About'));
const VerifyEmail = React.lazy(() => import('@/pages/VerifyEmail'));
const Book = React.lazy(() => import('@/pages/Book'));
const CoachSearch = React.lazy(() => import('@/pages/CoachSearch'));
const CoachDetail = React.lazy(() => import('@/pages/CoachDetail'));
const Blog = React.lazy(() => import('@/pages/Blog'));
const BlogPostPage = React.lazy(() => import('@/pages/BlogPost'));
const Apply = React.lazy(() => import('@/pages/Apply'));
const ApplyPrivateTrainingCoach = React.lazy(() => import('@/pages/apply/ApplyPrivateTrainingCoach'));
const Terms = React.lazy(() => import('@/pages/Terms'));
const Privacy = React.lazy(() => import('@/pages/Privacy'));
const Unsubscribe = React.lazy(() => import('@/pages/Unsubscribe'));
const Pay = React.lazy(() => import('@/pages/Pay'));
const ParentConsent = React.lazy(() => import('@/pages/ParentConsent'));
const Login = React.lazy(() => import('@/pages/Login'));
const Signup = React.lazy(() => import('@/pages/Signup'));
const SignIn = React.lazy(() => import('@/pages/SignIn'));
const CreateAccount = React.lazy(() => import('@/pages/CreateAccount'));
const AthleteSignup = React.lazy(() => import('@/pages/CreateAccount').then((m) => ({ default: m.AthleteSignup })));
const ParentSignup = React.lazy(() => import('@/pages/CreateAccount').then((m) => ({ default: m.ParentSignup })));
const CreateOrganization = React.lazy(() => import('@/pages/CreateOrganization'));
const ForgotPassword = React.lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('@/pages/ResetPassword'));
const OnboardingCompletion = React.lazy(() => import('@/pages/onboarding/OnboardingCompletion'));

// Authenticated pages
const Messages = React.lazy(() => import('@/pages/Messages'));
const Settings = React.lazy(() => import('@/pages/Settings'));
const CoachSchedule = React.lazy(() => import('@/pages/CoachSchedule'));
const AthletePortal = React.lazy(() => import('@/pages/athlete/AthletePortal'));
const AthleteSettings = React.lazy(() => import('@/pages/athlete/AthleteSettings'));
const ParentPortal = React.lazy(() => import('@/pages/parent/ParentPortal'));
const ParentSettings = React.lazy(() => import('@/pages/parent/ParentSettings'));
const OrganizationPortal = React.lazy(() => import('@/pages/organization/OrganizationPortal'));
const MasterAdminPortal = React.lazy(() => import('@/pages/master-admin/MasterAdminPortal'));

// Admin pages
const AdminPanel = React.lazy(() => import('@/pages/admin/AdminPanel'));
const AdminCoaches = React.lazy(() => import('@/pages/admin/AdminCoaches'));
const AdminBookings = React.lazy(() => import('@/pages/admin/AdminBookings'));
const AdminContent = React.lazy(() => import('@/pages/admin/AdminContent'));
const AdminPricing = React.lazy(() => import('@/pages/admin/AdminPricing'));
const AdminApplications = React.lazy(() => import('@/pages/admin/AdminApplications'));
const AdminBlog = React.lazy(() => import('@/pages/admin/AdminBlog'));
const AdminUsers = React.lazy(() => import('@/pages/admin/AdminUsers'));
const AdminMessages = React.lazy(() => import('@/pages/admin/AdminMessages'));
const AdminUnsubscribes = React.lazy(() => import('@/pages/admin/AdminUnsubscribes'));
const AdminCredits = React.lazy(() => import('@/pages/admin/AdminCredits'));
const AdminLegalDocuments = React.lazy(() => import('@/pages/admin/AdminLegalDocuments'));
const AdminPayments = React.lazy(() => import('@/pages/admin/AdminPayments'));
const AdminOrganizations = React.lazy(() => import('@/pages/admin/AdminOrganizations'));
const AdminSafety = React.lazy(() => import('@/pages/admin/AdminSafety'));
const AdminReconciliation = React.lazy(() => import('@/pages/admin/AdminReconciliation'));
const AdminPlatformSettings = React.lazy(() => import('@/pages/admin/AdminPlatformSettings'));

// Single Suspense fallback — a calm page-shaped placeholder (header bar +
// content blocks) instead of a bare spinner blanking the chrome, so route
// transitions read as "loading", not "broken".
const PageLoader = () => (
  <div className="fixed inset-0 bg-background" role="status" aria-label="Loading page">
    <div className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <div className="h-9 w-2/5 animate-pulse rounded-lg bg-secondary" />
      <div className="mt-4 h-4 w-3/5 animate-pulse rounded bg-secondary/70" />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-secondary/60" />
        <div className="h-28 animate-pulse rounded-lg bg-secondary/60" />
        <div className="h-28 animate-pulse rounded-lg bg-secondary/60" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  </div>
);

// Public root: guests see the marketing landing page; fully-onboarded users
// are sent to their role home (admin → /admin, coach → /coach, client →
// /dashboard) so they don't get stranded on the public site after login.
// Half-onboarded users keep access to the homepage like every other public
// page — the onboarding funnel catches them at every app entry (post-auth
// redirect, /dashboard, portal guards), so the front door never has to trap.
const RootRoute = () => {
  const { isAuthenticated, user, onboardingComplete } = useAuth();
  if (isAuthenticated && user && onboardingComplete) {
    return <Navigate to={homePathForRole(user)} replace />;
  }
  return <Landing />;
};

const RoleHomeRoute = () => {
  const { user } = useAuth();
  return <Navigate to={homePathForRole(user)} replace />;
};

const AuthenticatedApp = () => {
  const { authError } = useAuth();

  // No global auth gate: public pages render immediately (the prerendered
  // paint survives instead of being replaced by a loader while Appwrite
  // resolves the session). Route guards handle isLoadingAuth themselves, and
  // RootRoute redirects signed-in users once the session check lands.
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ViewAsBanner />
      <Routes>
        <Route element={<PublicLayout />}>
          {/* Public routes */}
          <Route path="/" element={<RootRoute />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/for-coaches" element={<ForCoaches />} />
          <Route path="/for-athletes" element={<ForAthletes />} />
          <Route path="/for-parents" element={<ForParents />} />
          <Route path="/for-organizations" element={<ForOrganizations />} />
          <Route path="/organizations" element={<OrganizationDirectory />} />
          <Route path="/organizations/:slug" element={<OrganizationDetail />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/support" element={<Support />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/sports" element={<SportsIndex />} />
          <Route path="/sports/:sportKey" element={<SportPage />} />
          <Route path="/about" element={<About />} />
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
              <Route path="/athlete/settings" element={<AthleteSettings />} />
            </Route>
            <Route element={<RequireGuardianOfAthlete />}>
              <Route path="/parent" element={<ParentPortal />} />
              <Route path="/parent/settings" element={<ParentSettings />} />
            </Route>
            <Route element={<RequireOrganizationAdmin />}>
              <Route path="/organization" element={<OrganizationPortal />} />
            </Route>
          </Route>

          <Route element={<RequireOnboardingComplete />}>
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
                <Route path="/coach/settings" element={<CoachSettings />} />
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
              <Route path="/admin/organizations" element={<AdminOrganizations />} />
              <Route path="/admin/safety" element={<AdminSafety />} />
              <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
              <Route path="/admin/content" element={<AdminContent />} />
              <Route path="/admin/pricing" element={<AdminPricing />} />
              <Route path="/admin/applications" element={<AdminApplications />} />
              <Route path="/admin/legal-documents" element={<AdminLegalDocuments />} />
              <Route path="/admin/blog" element={<AdminBlog />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/messages" element={<AdminMessages />} />
              <Route path="/admin/unsubscribes" element={<AdminUnsubscribes />} />
              <Route path="/admin/settings" element={<AdminPlatformSettings />} />
            </Route>
          </Route>

          <Route element={<RequireMasterAdmin />}>
            <Route path="/master-admin" element={<MasterAdminPortal />} />
          </Route>

          {/* Inside PublicLayout on purpose: a half-onboarded user must never
              be trapped on a chromeless page with no nav, no sign-out, and no
              way back to the marketplace. */}
          <Route path="/onboarding" element={<OnboardingCompletion />} />
        </Route>

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
    </Suspense>
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
        <SonnerToaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
