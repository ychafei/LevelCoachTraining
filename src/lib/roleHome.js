import { isOnboardingComplete, profileRole } from '@/lib/roles';

// Master-admin home applies only to the locked platform owner account:
// superadmin authority (label-backed, computed server-side) AND the locked
// profile flag. There is no client-side email special-case — the server
// (bootstrapMasterAdmin) owns that check via env MASTER_ADMIN_EMAIL.
function isLockedMasterAdmin(user) {
  return user?.master_admin_locked === true && user?.is_super_admin === true;
}

export function onboardingPath(next = '', role = '') {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/onboarding')) {
    params.set('next', next);
  }
  const query = params.toString();
  return query ? `/onboarding?${query}` : '/onboarding';
}

// Where a signed-in user should land by role.
export function homePathForRole(user) {
  if (!user) return '/';
  if (isLockedMasterAdmin(user)) return '/master-admin';
  if (!isOnboardingComplete(user)) return '/onboarding';
  const role = user?.role;
  if (role === 'super_admin') return '/master-admin';
  if (role === 'admin') return '/admin';
  if (role === 'coach') return '/coach';
  const appRole = profileRole(user);
  if (appRole === 'organization' || user?.primary_organization_id) return '/organization';
  if (appRole === 'parent' || appRole === 'guardian') return '/parent';
  if (appRole === 'coach_applicant') return '/apply/private-training-coach';
  return '/athlete';
}

export function postAuthRedirectPath(user, requestedNext = '') {
  if (!user) return requestedNext || '/';
  if (isLockedMasterAdmin(user)) {
    if (requestedNext && !requestedNext.startsWith('/onboarding')) return requestedNext;
    return '/master-admin';
  }
  if (!isOnboardingComplete(user)) {
    if (requestedNext?.startsWith('/onboarding')) return requestedNext;
    return onboardingPath(requestedNext);
  }
  return requestedNext || homePathForRole(user);
}
