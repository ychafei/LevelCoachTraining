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
  Phone,
  ShieldCheck,
  Target,
  User,
  Users,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { homePathForRole, onboardingPath, postAuthRedirectPath } from '@/lib/roleHome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    description: 'Find coaches, book sessions, message your coach, and track your training progress.',
    icon: Users,
    href: '/create-account/athlete',
    cta: 'Create athlete account',
    accent: 'blue',
  },
  {
    label: 'Parent / Guardian',
    description: 'Create a family workspace to manage child athletes, waivers, approvals, payments, and messages.',
    icon: ShieldCheck,
    href: '/create-account/parent',
    cta: 'Create parent account',
    accent: 'indigo',
  },
  {
    label: 'Coach',
    description: 'Create a free coach profile and finish verification, availability, and payments before going live.',
    icon: Briefcase,
    href: '/apply/private-training-coach',
    cta: 'Create coach account',
    accent: 'emerald',
  },
  {
    label: 'Training Organization',
    description: 'Set up your branded organization portal for coaches, athletes, programs, and payments.',
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
    trainingDetails: '',
    password: '',
    confirmPassword: '',
    parentFirstName: '',
    parentLastName: '',
    parentEmail: '',
    parentPhone: '',
    parentRelationship: '',
    terms: false,
    marketing: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const explicitNext = params.get('next');
  const age = useMemo(() => calculateAge(form.dob), [form.dob]);
  const needsGuardian = age !== null && age < 18;

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user) {
      const safeNext = getSafeNextPath(explicitNext);
      const roleNext = onboardingPath(safeNext || '', 'athlete');
      navigate(user.profile_setup_complete ? postAuthRedirectPath(user, safeNext) : roleNext, { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, explicitNext, navigate]);

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

    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.phone.trim()) next.phone = 'Phone number is required.';
    if (!form.dob) next.dob = 'Date of birth is required.';
    else if (age === null) next.dob = 'Enter a valid date of birth.';
    else if (age < 13) next.dob = 'Athletes must be at least 13 to create an account.';
    if (!form.trainingDetails.trim()) next.trainingDetails = 'Sport, goal, and location are required.';
    if (!form.password) next.password = 'Password is required.';
    else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!form.terms) next.terms = 'You must agree to the Terms of Service and Privacy Policy.';

    if (needsGuardian) {
      if (!form.parentFirstName.trim()) next.parentFirstName = 'Parent/guardian first name is required.';
      if (!form.parentLastName.trim()) next.parentLastName = 'Parent/guardian last name is required.';
      if (!form.parentEmail.trim()) next.parentEmail = 'Parent/guardian email is required.';
      else if (!EMAIL_RE.test(form.parentEmail.trim())) next.parentEmail = 'Enter a valid email address.';
      if (!form.parentPhone.trim()) next.parentPhone = 'Parent/guardian phone is required.';
      if (!form.parentRelationship.trim()) next.parentRelationship = 'Relationship is required.';
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
      await auth.signOut();
      await auth.signUp(form.email.trim(), form.password);
      await auth.updateCurrentUser({
        role: 'user',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        dob: form.dob,
        is_minor: needsGuardian,
        parent_first_name: needsGuardian ? form.parentFirstName.trim() : '',
        parent_last_name: needsGuardian ? form.parentLastName.trim() : '',
        parent_email: needsGuardian ? form.parentEmail.trim() : '',
        parent_phone: needsGuardian ? form.parentPhone.trim() : '',
        parent_relationship: needsGuardian ? form.parentRelationship.trim() : '',
        terms_accepted: true,
        profile_setup_complete: true,
        bio: [
          `Sport, goal, and location: ${form.trainingDetails.trim()}`,
        ].join('\n'),
      });

      const fresh = await refetchUser();
      navigate(getSafeNextPath(explicitNext) || homePathForRole(fresh), { replace: true });
    } catch (err) {
      setFormError(err?.message || 'Could not create your account. Please try again.');
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

                  <AuthField
                    id="trainingDetails"
                    label="Sport, goal, and location"
                    icon={Target}
                    placeholder="e.g., Soccer, speed and agility, Detroit, MI"
                    value={form.trainingDetails}
                    onChange={(event) => updateForm('trainingDetails', event.target.value)}
                    disabled={submitting}
                    error={errors.trainingDetails}
                    trailing={<ChevronDown className="h-4 w-4 text-slate-500" />}
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
                    <GuardianFields
                      form={form}
                      errors={errors}
                      submitting={submitting}
                      updateForm={updateForm}
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

                    <CheckboxRow
                      checked={form.marketing}
                      onChange={(checked) => updateForm('marketing', checked)}
                      disabled={submitting}
                    >
                      Send me product updates, training tips, and offers (optional)
                    </CheckboxRow>
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Creating account...' : 'Create Free Account'}
                  </button>
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
    terms: false,
    marketing: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const explicitNext = params.get('next');

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user) {
      const safeNext = getSafeNextPath(explicitNext);
      const roleNext = onboardingPath(safeNext || '', 'parent');
      navigate(user.profile_setup_complete ? postAuthRedirectPath(user, safeNext) : roleNext, { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, explicitNext, navigate]);

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
    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.phone.trim()) next.phone = 'Phone number is required.';
    if (!form.password) next.password = 'Password is required.';
    else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
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
      await auth.updateCurrentUser({
        role: 'user',
        onboarding_role: 'parent',
        onboarding_status: 'complete',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        terms_accepted: true,
        profile_setup_complete: true,
        updates_opt_in: form.marketing,
      });
      const fresh = await refetchUser();
      navigate(getSafeNextPath(explicitNext) || homePathForRole(fresh), { replace: true });
    } catch (err) {
      setFormError(err?.message || 'Could not create your parent account. Please try again.');
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

                    <CheckboxRow
                      checked={form.marketing}
                      onChange={(checked) => updateForm('marketing', checked)}
                      disabled={submitting}
                    >
                      Send me product updates, training tips, and offers (optional)
                    </CheckboxRow>
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Creating account...' : 'Create Family Account'}
                  </button>
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

function GuardianFields({ form, errors, submitting, updateForm }) {
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-blue-700 shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-sans text-sm font-extrabold tracking-normal text-slate-950 normal-case">
            Parent / Guardian Information
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Required based on date of birth.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AuthField
          id="parentFirstName"
          label="First name"
          icon={User}
          placeholder="First name"
          value={form.parentFirstName}
          onChange={(event) => updateForm('parentFirstName', event.target.value)}
          disabled={submitting}
          error={errors.parentFirstName}
        />
        <AuthField
          id="parentLastName"
          label="Last name"
          icon={User}
          placeholder="Last name"
          value={form.parentLastName}
          onChange={(event) => updateForm('parentLastName', event.target.value)}
          disabled={submitting}
          error={errors.parentLastName}
        />
        <AuthField
          id="parentEmail"
          label="Email address"
          type="email"
          icon={Mail}
          placeholder="parent@example.com"
          value={form.parentEmail}
          onChange={(event) => updateForm('parentEmail', event.target.value)}
          disabled={submitting}
          error={errors.parentEmail}
        />
        <AuthField
          id="parentPhone"
          label="Phone number"
          type="tel"
          icon={Phone}
          placeholder="(248) 555-0123"
          value={form.parentPhone}
          onChange={(event) => updateForm('parentPhone', event.target.value)}
          disabled={submitting}
          error={errors.parentPhone}
        />
      </div>

      <div className="mt-3">
        <AuthField
          id="parentRelationship"
          label="Relationship"
          icon={Users}
          placeholder="Parent, guardian, family member"
          value={form.parentRelationship}
          onChange={(event) => updateForm('parentRelationship', event.target.value)}
          disabled={submitting}
          error={errors.parentRelationship}
        />
      </div>
    </section>
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

function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
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
