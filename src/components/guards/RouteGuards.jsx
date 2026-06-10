import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { LogIn, ShieldAlert } from 'lucide-react';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { legalSignerRoleForUser } from '@/lib/legal';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';

// Shared spinner — short-lived; never sits forever because guards resolve
// after isLoadingAuth/isLoadingPublicSettings flip.
function AuthSpinner() {
  return (
    <div className="py-24 text-center">
      <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
    </div>
  );
}

function SignInRequired({ reason }) {
  const { navigateToLogin } = useAuth();
  const location = useLocation();
  const returnUrl = window.location.origin + location.pathname + location.search;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
          <LogIn className="w-6 h-6 text-accent" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">Sign In Required</h1>
        <p className="text-muted-foreground text-sm">
          {reason || 'You need to be signed in to view this page.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigateToLogin(returnUrl)}
            className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
          >
            Sign In
          </Button>
          <Button
            variant="outline"
            onClick={() => { window.location.href = '/'; }}
            className="font-display tracking-wider uppercase"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ title = 'Access Denied', message, cta }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6 text-destructive" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">{title}</h1>
        <p className="text-muted-foreground text-sm">{message || "You don't have permission to view this page."}</p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => { window.location.href = '/dashboard'; }}
            className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
          >
            Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => { window.location.href = '/'; }}
            className="font-display tracking-wider uppercase"
          >
            Go Home
          </Button>
        </div>
        {cta}
      </div>
    </div>
  );
}

// Base authenticated gate.
export function RequireAuth() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  return <Outlet />;
}

export function RequireOnboardingComplete() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, onboardingComplete } = useAuth();
  const location = useLocation();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!onboardingComplete) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/onboarding?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

// Coach-only (admins also pass — they can use coach features).
export function RequireCoach() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isCoach } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isCoach) {
    return (
      <AccessDenied
        title="Coaches Only"
        message="This page is reserved for coaches. If you believe this is a mistake, contact support."
      />
    );
  }
  return <Outlet />;
}

// Coach-only AND must have a linked coach_id.
export function RequireLinkedCoach() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isCoach } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isCoach) {
    return <AccessDenied title="Coaches Only" message="This page is for coaches." />;
  }
  if (!user.coach_id) {
    return (
      <AccessDenied
        title="Coach Profile Not Linked"
        message="Your account isn't linked to a coach profile yet. Ask an admin to set your coach_id in the Users panel."
      />
    );
  }
  return <Outlet />;
}

// Admin-only.
export function RequireAdmin() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isAdmin } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isAdmin) {
    return (
      <AccessDenied
        title="Admins Only"
        message="This area is restricted to administrators."
      />
    );
  }
  return <Outlet />;
}

// Super-admin only (for role escalation, destructive cross-org actions).
export function RequireSuperAdmin() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isSuperAdmin } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isSuperAdmin) {
    return (
      <AccessDenied
        title="Super Admin Only"
        message="This action requires super-admin privileges."
      />
    );
  }
  return <Outlet />;
}

// Master-admin gate. The locked platform owner (superadmin label + locked
// profile flag) always passes. Any other AUTHENTICATED user is also allowed
// through to /master-admin purely for the bootstrap UX: MasterAdminPortal
// shows a "Bootstrap master admin" action and the SERVER (bootstrapMasterAdmin
// function) validates the env MASTER_ADMIN_EMAIL — unauthorized users simply
// get a clean denial message from the function. There is intentionally no
// client-side email constant: route guards are UX, never the security
// boundary (see docs/ARCHITECTURE.md §1).
export function RequireMasterAdmin() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  return <Outlet />;
}

export function RequireOrganizationAdmin() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isOrganizationAdmin } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isOrganizationAdmin) {
    return (
      <AccessDenied
        title="Organization Access Required"
        message="This portal is for organization owners and admins."
      />
    );
  }
  return <Outlet />;
}

export function RequireGuardianOfAthlete() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isGuardian } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isGuardian) {
    return (
      <AccessDenied
        title="Parent Portal"
        message="This portal is for parent and guardian accounts."
      />
    );
  }
  return <Outlet />;
}

export function RequireAthlete() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user, isAthlete } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (!isAthlete) {
    return (
      <AccessDenied
        title="Athlete Portal"
        message="This portal is for athlete accounts."
      />
    );
  }
  return <Outlet />;
}

export function RequireSignedLegalPacket() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user } = useAuth();
  const signerRole = legalSignerRoleForUser(user);
  const status = useLegalPacketStatus({
    user,
    signerRole,
    coachId: signerRole === 'coach' ? user?.coach_id || '' : '',
    organizationId: signerRole === 'organization_admin' ? user?.primary_organization_id || '' : '',
  });
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (status.loading) return <AuthSpinner />;
  if (!status.complete) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <LegalSignaturePanel
          signerRole={signerRole}
          coachId={signerRole === 'coach' ? user?.coach_id || '' : ''}
          organizationId={signerRole === 'organization_admin' ? user?.primary_organization_id || '' : ''}
          title="Legal Packet Required"
          description="Complete the current required legal documents before using this area."
        />
      </div>
    );
  }
  return <Outlet />;
}

// Client-only (regular user — not coach, not admin).
export function RequireClient() {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    isAuthenticated,
    user,
    isCoach,
    isAdmin,
    isGuardian,
    isOrganizationAdmin,
  } = useAuth();
  if (isLoadingPublicSettings || isLoadingAuth) return <AuthSpinner />;
  if (!isAuthenticated || !user) return <SignInRequired />;
  if (isCoach || isAdmin || isGuardian || isOrganizationAdmin) {
    return (
      <AccessDenied
        title="Clients Only"
        message="This feature is for athlete client accounts."
        cta={
          <div className="mt-4">
            <Button
              variant="ghost"
              onClick={() => { window.location.href = '/dashboard'; }}
              className="font-display tracking-wider uppercase text-xs"
            >
              Go to Dashboard
            </Button>
          </div>
        }
      />
    );
  }
  return <Outlet />;
}

// Also export for use outside nested routes (e.g. conditional rendering).
export { AuthSpinner, SignInRequired, AccessDenied };
