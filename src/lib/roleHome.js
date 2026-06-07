import { isOnboardingComplete, profileRole } from '@/lib/roles';

const MASTER_ADMIN_EMAIL = 'yousef.elchafei@gmail.com';

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
  if (user?.master_admin_locked || (user.email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL) return '/master-admin';
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
  if (!isOnboardingComplete(user)) {
    if (requestedNext?.startsWith('/onboarding')) return requestedNext;
    return onboardingPath(requestedNext);
  }
  return requestedNext || homePathForRole(user);
}
