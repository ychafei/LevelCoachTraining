import { isEmailVerified } from './accountReadiness';

export const ROLE_HOME = {
  athlete: '/athlete',
  parent: '/parent',
  guardian: '/parent',
  organization: '/organization',
  coach: '/coach',
  coach_applicant: '/apply/private-training-coach',
};

export function profileRole(user) {
  if (!user) return '';
  if (user.role === 'super_admin') return 'super_admin';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'coach') return 'coach';
  if (user.onboarding_role) return user.onboarding_role;
  return user.profile_setup_complete === true ? 'athlete' : '';
}

export function isOnboardingComplete(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (!isEmailVerified(user)) return false;
  if (user.role === 'coach') return true;
  return user.profile_setup_complete === true
    && user.onboarding_status !== 'incomplete'
    && !!profileRole(user);
}

export function isAthlete(user) {
  return profileRole(user) === 'athlete';
}

export function isParentOrGuardian(user) {
  const role = profileRole(user);
  return role === 'parent' || role === 'guardian';
}

export function isOrganizationUser(user) {
  return profileRole(user) === 'organization' || (user?.organization_memberships || []).length > 0;
}
