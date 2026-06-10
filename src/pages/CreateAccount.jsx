import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import {
  CITY_OPTIONS,
  EMAIL_RE,
  buildAthleteBio,
  buildLocationLabel,
  citySuggestions,
  normalizePhoneForStorage,
  requiresGuardian,
  resolveCityPlace,
  validateDob,
  validateLocation,
  validatePersonName,
  validatePhone,
} from '@/lib/athleteOnboardingFields';
import {
  AthleteSportFields,
  GuardianContactFields,
  HealthAndEmergencyFields,
  validateAthleteDetails,
  validateGuardianContact,
} from '@/features/onboarding/AthleteFields';
import { homePathForRole, onboardingPath, postAuthRedirectPath } from '@/lib/roleHome';

const PASSWORD_RULES = [
  { id: 'length', label: '8+ characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: '1 uppercase', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: '1 lowercase', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: '1 number', test: (value) => /\d/.test(value) },
  { id: 'special', label: '1 special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const ACCOUNT_TYPES = [
  {
    label: 'Athlete / Client',
    description: 'Find coaches across 15 sports, book sessions, message your coach, and track your training progress.',
    icon: Users,
    href: '/create-account/athlete',
    cta: 'Create athlete account',
    accent: 'blue',
  },
  {
    label: 'Parent / Guardian',
    description: 'Manage your child athletes from one family account: profiles, waivers, booking approvals, payments, and messages.',
    icon: ShieldCheck,
    href: '/create-account/parent',
    cta: 'Create parent account',
    accent: 'indigo',
  },
  {
    label: 'Coach',
    description: 'Apply to coach on LevelCoach. After review and approval you set up your profile, availability, and payouts.',
    icon: Briefcase,
    href: '/apply/private-training-coach',
    cta: 'Apply as a coach',
    accent: 'emerald',
  },
  {
    label: 'Training Organization',
    description: 'Set up your organization workspace for coaches, rosters, payout splits, and a branded public page.',
    icon: Building2,
    href: '/create-organization',
    cta: 'Create organization account',
    accent: 'slate',
  },
];

export default function CreateAccount() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const explicitNext = params.get('next');

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user) {
      navigate(homePathForRole(user), { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
            <div className="px-6 py-8 sm:px-10 lg:px-12">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                  <Users className="h-4 w-4" />
                  Create Free Account
                </div>

                <h1 className="mt-5 font-sans text-4xl font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-5xl">
                  What kind of account do you want to create?
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  Choose the account type that fits you. We'll send you to the right setup form.
                </p>

                <div className="mt-8 grid grid-cols-1 gap-4">
                  {ACCOUNT_TYPES.map((type) => (
                    <AccountTypeCard
                      key={type.label}
                      type={type}
                      href={(type.href === '/create-account/athlete' || type.href === '/create-account/parent') ? withNext(type.href, explicitNext) : type.href}
                    />
                  ))}
                </div>

                <p className="mt-6 text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link to="/sign-in" className="font-semibold text-blue-700 hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

const EMPTY_SPORT_DETAILS = {
  sportKey: '',
  position: '',
  level: '',
  availability: [],
};

const EMPTY_HEALTH = {
  healthNotes: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelationship: '',
};

const EMPTY_GUARDIAN = {
  parentFirstName: '',
  parentLastName: '',
  parentEmail: '',
  parentPhone: '',
  parentRelationship: '',
};

export function AthleteSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetchUser, isAuthenticated, isLoadingAuth, user } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    city: '',
    locationDetail: '',
    trainingGoal: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [sportDetails, setSportDetails] = useState(EMPTY_SPORT_DETAILS);
  const [healthDetails, setHealthDetails] = useState(EMPTY_HEALTH);
  const [guardian, setGuardian] = useState(EMPTY_GUARDIAN);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const explicitNext = params.get('next');
  const needsGuardian = requiresGuardian(form.dob);
  const locationSuggestions = useMemo(() => citySuggestions(form.city, 10), [form.city]);

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user && !submitting) {
      const safeNext = getSafeNextPath(explicitNext);
      const roleNext = onboardingPath(safeNext || '', 'athlete');
      navigate(user.profile_setup_complete ? postAuthRedirectPath(user, safeNext) : roleNext, { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, explicitNext, navigate, submitting]);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const passwordValid = passwordChecks.every((check) => check.ok);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next = {};

    const firstNameError = validatePersonName(form.firstName, 'First name');
    const lastNameError = validatePersonName(form.lastName, 'Last name');
    const phoneError = validatePhone(form.phone, 'Phone number');
    const dobError = validateDob(form.dob);
    const cityError = validateLocation(form.city);

    if (firstNameError) next.firstName = firstNameError;
    if (lastNameError) next.lastName = lastNameError;
    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (phoneError) next.phone = phoneError;
    if (dobError) next.dob = dobError;
    if (cityError) next.city = cityError;
    if (!form.password) next.password = 'Password is required.';
    else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!form.terms) next.terms = 'You must agree to the Terms of Service and Privacy Policy.';

    Object.assign(next, validateAthleteDetails({ ...sportDetails, ...healthDetails }));

    if (needsGuardian) {
      Object.assign(next, validateGuardianContact(guardian));
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      const cityPlace = resolveCityPlace(form.city);
      await auth.signOut();
      await auth.signUp(form.email.trim(), form.password);
      // All profile writes go through the accountProfile.update whitelist.
      // is_minor is recomputed server-side from dob — never sent by the client.
      await auth.updateCurrentUser({
        onboarding_role: 'athlete',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: normalizePhoneForStorage(form.phone),
        dob: form.dob,
        parent_first_name: needsGuardian ? guardian.parentFirstName.trim() : '',
        parent_last_name: needsGuardian ? guardian.parentLastName.trim() : '',
        parent_email: needsGuardian ? guardian.parentEmail.trim() : '',
        parent_phone: needsGuardian ? normalizePhoneForStorage(guardian.parentPhone) : '',
        parent_relationship: needsGuardian ? guardian.parentRelationship.trim() : '',
        terms_accepted: true,
        location_label: buildLocationLabel(cityPlace?.label || form.city, form.locationDetail),
        ...(cityPlace ? { location_lat: cityPlace.lat, location_lng: cityPlace.lng } : {}),
        bio: buildAthleteBio({
          ...sportDetails,
          trainingGoal: form.trainingGoal,
          ...healthDetails,
        }),
      });

      await refetchUser();
      const onboardingNext = onboardingPath(getSafeNextPath(explicitNext) || '', 'athlete');
      navigate(`${onboardingNext}${onboardingNext.includes('?') ? '&' : '?'}from=create-account`, { replace: true });
    } catch (err) {
      if (err?.code === 409 || err?.type === 'user_already_exists') {
        setFormError('An account with that email already exists. Sign in instead.');
      } else {
        setFormError(err?.message || 'Could not create your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      await auth.signOut();
      auth.createOAuthSession('google', onboardingPath(getSafeNextPath(explicitNext) || '', 'athlete'));
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-up.');
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-7 sm:px-6 lg:px-8 lg:py-6">
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_70px_rgba(15,23,42,0.10)]">
            <div className="px-6 py-7 sm:px-10 lg:px-10 xl:px-12">
              <div className="mx-auto w-full max-w-[580px]">
                <div className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
                  <Users className="h-4 w-4" />
                  Athlete
                </div>

                <h1 className="mt-5 font-sans text-[31px] font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-[34px]">
                  Create your athlete account
                </h1>
                <p className="mt-3 text-base leading-7 text-slate-600">
                  Start your training journey with the right coach and the right tools.
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                  <datalist id="athlete-signup-city-options">
                    {(form.city.trim() ? locationSuggestions : CITY_OPTIONS).map((place) => (
                      <option key={place.label} value={place.label} />
                    ))}
                  </datalist>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="firstName"
                      label="First name"
                      icon={User}
                      autoComplete="given-name"
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(event) => updateForm('firstName', event.target.value)}
                      disabled={submitting}
                      error={errors.firstName}
                    />
                    <AuthField
                      id="lastName"
                      label="Last name"
                      icon={User}
                      autoComplete="family-name"
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(event) => updateForm('lastName', event.target.value)}
                      disabled={submitting}
                      error={errors.lastName}
                    />
                  </div>

                  <AuthField
                    id="email"
                    label="Email address"
                    type="email"
                    icon={Mail}
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    disabled={submitting}
                    error={errors.email}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="phone"
                      label="Phone number"
                      type="tel"
                      icon={Phone}
                      autoComplete="tel"
                      placeholder="(248) 555-0123"
                      value={form.phone}
                      onChange={(event) => updateForm('phone', event.target.value)}
                      disabled={submitting}
                      error={errors.phone}
                    />
                    <AuthField
                      id="dob"
                      label="Date of birth"
                      type="date"
                      icon={CalendarCheck}
                      autoComplete="bday"
                      value={form.dob}
                      onChange={(event) => updateForm('dob', event.target.value)}
                      disabled={submitting}
                      error={errors.dob}
                    />
                  </div>

                  <AthleteSportFields
                    value={sportDetails}
                    onChange={(next) => {
                      setSportDetails(next);
                      setErrors((current) => ({ ...current, sportKey: undefined, position: undefined, level: undefined, availability: undefined }));
                    }}
                    errors={errors}
                    disabled={submitting}
                    idPrefix="athlete-signup"
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="athlete-city"
                      label="Training city / state"
                      icon={MapPin}
                      placeholder="e.g., Troy, MI"
                      list="athlete-signup-city-options"
                      value={form.city}
                      onChange={(event) => updateForm('city', event.target.value)}
                      onBlur={() => {
                        const city = resolveCityPlace(form.city);
                        if (city) updateForm('city', city.label);
                      }}
                      disabled={submitting}
                      error={errors.city}
                    />
                    <AuthField
                      id="athlete-location-detail"
                      label="Location details (optional)"
                      icon={MapPin}
                      placeholder="Neighborhood, facility, travel range…"
                      value={form.locationDetail}
                      onChange={(event) => updateForm('locationDetail', event.target.value)}
                      disabled={submitting}
                      error={errors.locationDetail}
                    />
                  </div>

                  <div>
                    <label htmlFor="athlete-training-goal" className="mb-1.5 block text-sm font-bold text-slate-950">
                      Training goal <span className="text-xs font-semibold text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="athlete-training-goal"
                      value={form.trainingGoal}
                      onChange={(event) => updateForm('trainingGoal', event.target.value)}
                      disabled={submitting}
                      placeholder="e.g., make varsity, improve first touch, get faster"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                    />
                  </div>

                  <HealthAndEmergencyFields
                    value={healthDetails}
                    onChange={(next) => {
                      setHealthDetails(next);
                      setErrors((current) => ({ ...current, healthNotes: undefined, emergencyName: undefined, emergencyPhone: undefined, emergencyRelationship: undefined }));
                    }}
                    errors={errors}
                    disabled={submitting}
                    idPrefix="athlete-signup"
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="password"
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      icon={Lock}
                      autoComplete="new-password"
                      placeholder="************"
                      value={form.password}
                      onChange={(event) => updateForm('password', event.target.value)}
                      disabled={submitting}
                      error={errors.password}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                    <AuthField
                      id="confirmPassword"
                      label="Confirm password"
                      type={showConfirm ? 'text' : 'password'}
                      icon={Lock}
                      autoComplete="new-password"
                      placeholder="************"
                      value={form.confirmPassword}
                      onChange={(event) => updateForm('confirmPassword', event.target.value)}
                      disabled={submitting}
                      error={errors.confirmPassword}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowConfirm((value) => !value)}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                          aria-label={showConfirm ? 'Hide password' : 'Show password'}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {passwordChecks.map((check) => (
                      <span
                        key={check.id}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold ${
                          check.ok
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {check.label}
                      </span>
                    ))}
                  </div>

                  {needsGuardian && (
                    <GuardianContactFields
                      value={guardian}
                      onChange={(next) => {
                        setGuardian(next);
                        setErrors((current) => ({ ...current, parentFirstName: undefined, parentLastName: undefined, parentEmail: undefined, parentPhone: undefined, parentRelationship: undefined }));
                      }}
                      errors={errors}
                      disabled={submitting}
                      idPrefix="athlete-signup-guardian"
                    />
                  )}

                  <div className="space-y-2">
                    <CheckboxRow
                      checked={form.terms}
                      onChange={(checked) => updateForm('terms', checked)}
                      disabled={submitting}
                    >
                      I agree to the{' '}
                      <Link to="/terms" className="font-semibold text-blue-700 hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="font-semibold text-blue-700 hover:underline">
                        Privacy Policy
                      </Link>
                    </CheckboxRow>
                    {errors.terms && <p className="text-xs font-semibold text-red-600">{errors.terms}</p>}
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Creating account...' : 'Create Account & Review Setup'}
                  </button>
                  <p className="text-center text-xs leading-5 text-slate-500">
                    We'll email you a verification link after signup. You can finish setup before verifying.
                  </p>
                </form>

                <div className="my-4 flex items-center gap-4">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-sm font-medium text-slate-500">or sign up with</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={submitting}
                  className="flex h-11 w-full items-center justify-center gap-4 rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon className="h-5 w-5" />
                  Continue with Google
                </button>

                <p className="mt-4 text-center text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link to="/sign-in" className="font-semibold text-blue-700 hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

export function ParentSignup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetchUser, isAuthenticated, isLoadingAuth, user } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    authority: false,
    terms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const explicitNext = params.get('next');

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user && !submitting) {
      const safeNext = getSafeNextPath(explicitNext);
      const roleNext = onboardingPath(safeNext || '', 'parent');
      navigate(user.profile_setup_complete ? postAuthRedirectPath(user, safeNext) : roleNext, { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, explicitNext, navigate, submitting]);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const passwordValid = passwordChecks.every((check) => check.ok);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    const firstNameError = validatePersonName(form.firstName, 'First name');
    const lastNameError = validatePersonName(form.lastName, 'Last name');
    const phoneError = validatePhone(form.phone, 'Phone number');
    if (firstNameError) next.firstName = firstNameError;
    if (lastNameError) next.lastName = lastNameError;
    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (phoneError) next.phone = phoneError;
    if (!form.password) next.password = 'Password is required.';
    else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!form.authority) next.authority = 'You must confirm you are the parent or legal guardian.';
    if (!form.terms) next.terms = 'You must agree to the Terms of Service and Privacy Policy.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      await auth.signOut();
      await auth.signUp(form.email.trim(), form.password);
      // Whitelist-only profile write. Onboarding completes after the
      // add-athletes + legal packet steps on /onboarding.
      await auth.updateCurrentUser({
        onboarding_role: 'parent',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: normalizePhoneForStorage(form.phone),
        terms_accepted: true,
      });
      await refetchUser();
      const onboardingNext = onboardingPath(getSafeNextPath(explicitNext) || '', 'parent');
      navigate(`${onboardingNext}${onboardingNext.includes('?') ? '&' : '?'}from=create-account`, { replace: true });
    } catch (err) {
      if (err?.code === 409 || err?.type === 'user_already_exists') {
        setFormError('An account with that email already exists. Sign in instead.');
      } else {
        setFormError(err?.message || 'Could not create your parent account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      await auth.signOut();
      auth.createOAuthSession('google', onboardingPath(getSafeNextPath(explicitNext) || '', 'parent'));
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-up.');
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-7 sm:px-6 lg:px-8 lg:py-6">
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_70px_rgba(15,23,42,0.10)]">
            <div className="px-6 py-7 sm:px-10 lg:px-10 xl:px-12">
              <div className="mx-auto w-full max-w-[580px]">
                <div className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
                  <ShieldCheck className="h-4 w-4" />
                  Parent / Guardian
                </div>

                <h1 className="mt-5 font-sans text-[31px] font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-[34px]">
                  Create your family account
                </h1>
                <p className="mt-3 text-base leading-7 text-slate-600">
                  Manage child athletes, waivers, booking approvals, payments, and coach communication from one workspace.
                </p>

                <ol className="mt-4 grid grid-cols-1 gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-3">
                  {['1. Your account', '2. Add your athletes', '3. Sign legal packet'].map((step, index) => (
                    <li
                      key={step}
                      className={`rounded-md border px-3 py-2 ${index === 0 ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50'}`}
                    >
                      {step}
                    </li>
                  ))}
                </ol>

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="parent-account-first-name"
                      label="First name"
                      icon={User}
                      autoComplete="given-name"
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(event) => updateForm('firstName', event.target.value)}
                      disabled={submitting}
                      error={errors.firstName}
                    />
                    <AuthField
                      id="parent-account-last-name"
                      label="Last name"
                      icon={User}
                      autoComplete="family-name"
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(event) => updateForm('lastName', event.target.value)}
                      disabled={submitting}
                      error={errors.lastName}
                    />
                  </div>

                  <AuthField
                    id="parent-account-email"
                    label="Email address"
                    type="email"
                    icon={Mail}
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    disabled={submitting}
                    error={errors.email}
                  />

                  <AuthField
                    id="parent-account-phone"
                    label="Phone number"
                    type="tel"
                    icon={Phone}
                    autoComplete="tel"
                    placeholder="(248) 555-0123"
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    disabled={submitting}
                    error={errors.phone}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="parent-account-password"
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      icon={Lock}
                      autoComplete="new-password"
                      placeholder="************"
                      value={form.password}
                      onChange={(event) => updateForm('password', event.target.value)}
                      disabled={submitting}
                      error={errors.password}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                    <AuthField
                      id="parent-account-confirm-password"
                      label="Confirm password"
                      type={showConfirm ? 'text' : 'password'}
                      icon={Lock}
                      autoComplete="new-password"
                      placeholder="************"
                      value={form.confirmPassword}
                      onChange={(event) => updateForm('confirmPassword', event.target.value)}
                      disabled={submitting}
                      error={errors.confirmPassword}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowConfirm((value) => !value)}
                          className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                          aria-label={showConfirm ? 'Hide password' : 'Show password'}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {passwordChecks.map((check) => (
                      <span
                        key={check.id}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold ${
                          check.ok
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {check.label}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <CheckboxRow
                      checked={form.authority}
                      onChange={(checked) => updateForm('authority', checked)}
                      disabled={submitting}
                    >
                      I confirm that I am the parent or legal guardian of the athletes I add to this
                      account, and that I have the legal authority to sign documents, approve bookings,
                      and manage payments on their behalf.
                    </CheckboxRow>
                    {errors.authority && <p className="text-xs font-semibold text-red-600">{errors.authority}</p>}

                    <CheckboxRow
                      checked={form.terms}
                      onChange={(checked) => updateForm('terms', checked)}
                      disabled={submitting}
                    >
                      I agree to the{' '}
                      <Link to="/terms" className="font-semibold text-blue-700 hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="font-semibold text-blue-700 hover:underline">
                        Privacy Policy
                      </Link>
                    </CheckboxRow>
                    {errors.terms && <p className="text-xs font-semibold text-red-600">{errors.terms}</p>}
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Creating account...' : 'Create Account & Add Athletes'}
                  </button>
                  <p className="text-center text-xs leading-5 text-slate-500">
                    Next: add each child athlete you manage, then sign their legal packet.
                  </p>
                </form>

                <div className="my-4 flex items-center gap-4">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-sm font-medium text-slate-500">or sign up with</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={submitting}
                  className="flex h-11 w-full items-center justify-center gap-4 rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon className="h-5 w-5" />
                  Continue with Google
                </button>

                <p className="mt-4 text-center text-sm text-slate-600">
                  Already have an account?{' '}
                  <Link to="/sign-in" className="font-semibold text-blue-700 hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

function AccountTypeCard({ type, href }) {
  const Icon = type.icon;
  const tone = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 group-hover:bg-blue-600 group-hover:text-white',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 group-hover:bg-emerald-600 group-hover:text-white',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100 group-hover:bg-indigo-600 group-hover:text-white',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200 group-hover:bg-slate-800 group-hover:text-white',
  }[type.accent];

  return (
    <Link
      to={href}
      className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-slate-50 hover:shadow-md"
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ring-1 transition-colors ${tone}`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-base font-extrabold tracking-normal text-slate-950 normal-case">
          {type.label}
        </span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">
          {type.description}
        </span>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
          {type.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

function AuthField({
  id,
  label,
  icon: Icon,
  error,
  trailing,
  className = '',
  onChange,
  ...inputProps
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          onChange={onChange}
          className={`h-10 w-full rounded-md border bg-white pl-10 text-sm text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            trailing ? 'pr-10' : 'pr-3'
          } ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function CheckboxRow({ checked, onChange, disabled, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
      />
      <span>{children}</span>
    </label>
  );
}

function AuthFooter() {
  return (
    <footer className="bg-white">
      <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-6 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
        <img src="/levelcoach-wordmark.png" alt="LevelCoach Training" className="h-12 w-auto object-contain" />

        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
          <Link to="/terms" className="text-slate-500 transition-colors hover:text-blue-700">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-slate-500 transition-colors hover:text-blue-700">
            Privacy Policy
          </Link>
          <Link to="/resources" className="text-slate-500 transition-colors hover:text-blue-700">
            Support
          </Link>
          <span className="inline-flex items-center gap-2 text-slate-500">
            English
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </div>
    </footer>
  );
}

function withNext(path, next) {
  const safeNext = getSafeNextPath(next);
  return safeNext ? `${path}?next=${encodeURIComponent(safeNext)}` : path;
}

function getSafeNextPath(next) {
  if (!next) return null;

  try {
    const parsed = new URL(next, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;

    if (['/login', '/sign-in', '/signup', '/create-account', '/create-account/athlete', '/create-account/parent'].includes(parsed.pathname)) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
