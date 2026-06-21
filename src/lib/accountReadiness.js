export function isEmailVerified(user) {
  return user?.email_verified === true || user?.emailVerification === true;
}

export function isProfileSetupComplete(user) {
  return user?.profile_setup_complete === true;
}

export function accountActionLock(user, { requireEmail = true, requireSetup = true } = {}) {
  if (!user) return { type: 'auth' };
  if (requireEmail && !isEmailVerified(user)) {
    return {
      type: 'email',
      title: 'Verify your email first',
      body: 'You can browse coach profiles while your email is unverified. Credits, saving coaches, messaging, booking, payments, and legal signing unlock after verification.',
      cta: 'Verify email',
      path: '/verify-email',
    };
  }
  if (requireSetup && !isProfileSetupComplete(user)) {
    return {
      type: 'setup',
      title: 'Finish your account setup',
      body: 'You can keep browsing public coach profiles, but account actions unlock after your LevelCoach profile is complete.',
      cta: 'Finish setup',
      path: '/onboarding',
    };
  }
  return null;
}
