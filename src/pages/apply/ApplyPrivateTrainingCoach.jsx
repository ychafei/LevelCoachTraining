import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileUp,
  Grid2X2,
  Lock,
  Mail,
  MapPin,
  Monitor,
  Phone,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { coachRepo } from '@/api/repo/coachRepo';
import { onboardingPath } from '@/lib/roleHome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SESSION_TYPES = [
  { id: '1-on-1', label: '1-on-1', icon: User },
  { id: 'Small Group', label: 'Small Group', icon: Users },
  { id: 'Team Training', label: 'Team Training', icon: Users },
  { id: 'Virtual', label: 'Virtual', icon: Monitor },
];

const PASSWORD_RULES = [
  { id: 'length', label: '8+ characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: '1 uppercase', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: '1 lowercase', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: '1 number', test: (value) => /\d/.test(value) },
  { id: 'special', label: '1 special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function ApplyPrivateTrainingCoach() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, user, refetchUser } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    sportsCoached: '',
    trainingSpecialties: '',
    serviceArea: '',
    shortBio: '',
    yearsExperience: '',
    certifications: '',
    termsAccepted: false,
    verificationConsent: false,
  });
  const [sessionTypes, setSessionTypes] = useState(['1-on-1', 'Small Group', 'Team Training', 'Virtual']);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const age = useMemo(() => calculateAge(form.dob), [form.dob]);
  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const passwordValid = passwordChecks.every((check) => check.ok);
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const bioCount = form.shortBio.length;
  const usingExistingAccount = isAuthenticated && !!user;

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      firstName: current.firstName || user.first_name || splitFirstName(user.name),
      lastName: current.lastName || user.last_name || splitLastName(user.name),
      email: user.email || current.email,
      phone: current.phone || user.phone || '',
      dob: current.dob || user.dob || '',
    }));
  }, [user]);

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
    else if (age < 18) next.dob = 'Coach account owners must be 18 or older.';
    if (!usingExistingAccount) {
      if (!form.password) next.password = 'Password is required.';
      else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
      if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
      else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    }
    if (!form.displayName.trim()) next.displayName = 'Display name is required.';
    if (!form.sportsCoached.trim()) next.sportsCoached = 'Sport is required.';
    if (!form.trainingSpecialties.trim()) next.trainingSpecialties = 'Training specialty is required.';
    if (!form.serviceArea.trim()) next.serviceArea = 'Service area is required.';
    if (sessionTypes.length === 0) next.sessionTypes = 'Select at least one session type.';
    if (!form.shortBio.trim()) next.shortBio = 'Short bio is required.';
    if (!form.yearsExperience) next.yearsExperience = 'Years of experience is required.';
    if (!form.termsAccepted) next.termsAccepted = 'You must agree to the Terms of Service and Privacy Policy.';
    if (!form.verificationConsent) next.verificationConsent = 'Verification consent is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      let currentUser = user;
      if (!usingExistingAccount) {
        await auth.signOut();
        currentUser = await auth.signUp(form.email.trim(), form.password);
      } else {
        currentUser = await refetchUser();
      }
      if (!currentUser?.id) {
        throw new Error('Could not load your coach applicant profile.');
      }

      currentUser = await auth.updateCurrentUser({
        role: 'coach',
        onboarding_role: 'coach',
        onboarding_status: 'complete',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        dob: form.dob,
        terms_accepted: true,
        profile_setup_complete: false,
      });

      const coach = await coachRepo.create({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        county: inferCounty(form.serviceArea),
        training_area: form.serviceArea.trim(),
        bio: buildCoachBio(form),
        quote: form.displayName.trim(),
        specializations: buildSpecializations(form, sessionTypes),
        is_active: false,
        is_head_coach: false,
        display_order: 999,
        availability: {},
        platform_fee_type: 'none',
        platform_fee_value: 0,
        user_id: currentUser.account_id || currentUser.id,
      });

      await auth.updateCurrentUser({
        role: 'coach',
        onboarding_role: 'coach',
        onboarding_status: 'complete',
        coach_id: coach.id,
        profile_setup_complete: false,
      });
      await refetchUser();
      setSubmitted(true);
    } catch (err) {
      const code = err?.code;
      const type = err?.type;
      if (code === 409 || type === 'user_already_exists') {
        setFormError('An account with that email already exists. Sign in instead.');
      } else {
        setFormError(err?.message || 'Could not create your coach account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      if (usingExistingAccount) {
        navigate(onboardingPath('/apply/private-training-coach', 'coach_applicant'));
        return;
      }
      await auth.signOut();
      auth.createOAuthSession('google', onboardingPath('/apply/private-training-coach', 'coach_applicant'));
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-up.');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-950">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-4 pt-20">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-slate-950/10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="mt-6 font-sans text-3xl font-extrabold tracking-normal text-slate-950 normal-case">
              Coach account created
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your draft coach profile is saved. You can finish verification, availability, and payments before going live.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/coach')}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Open coach portal
              </button>
              <Link
                to="/"
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Back to platform
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
            <div className="px-6 py-7 sm:px-9 lg:px-8 xl:px-10">
              <div className="mx-auto w-full max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                  <Users className="h-4 w-4" />
                  Coach
                </div>

                <h1 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-4xl">
                  Create your coach account
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Build your profile, manage athletes, and grow your training business.
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="coach-first-name"
                      label="First name"
                      icon={User}
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(event) => updateForm('firstName', event.target.value)}
                      error={errors.firstName}
                      disabled={submitting}
                    />
                    <AuthField
                      id="coach-last-name"
                      label="Last name"
                      icon={User}
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(event) => updateForm('lastName', event.target.value)}
                      error={errors.lastName}
                      disabled={submitting}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="coach-email"
                      label="Email address"
                      type="email"
                      icon={Mail}
                      placeholder="you@yourdomain.com"
                      value={form.email}
                      onChange={(event) => updateForm('email', event.target.value)}
                      error={errors.email}
                      disabled={submitting || usingExistingAccount}
                    />
                    <AuthField
                      id="coach-phone"
                      label="Phone number"
                      type="tel"
                      icon={Phone}
                      placeholder="(248) 555-0123"
                      value={form.phone}
                      onChange={(event) => updateForm('phone', event.target.value)}
                      error={errors.phone}
                      disabled={submitting}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="coach-dob"
                      label="Date of birth"
                      type="date"
                      icon={CalendarCheck}
                      value={form.dob}
                      onChange={(event) => updateForm('dob', event.target.value)}
                      error={errors.dob}
                      disabled={submitting}
                    />
                    <AuthField
                      id="coach-display-name"
                      label="Coach display name or profile name"
                      icon={User}
                      placeholder="e.g., Elite Hoops Training"
                      value={form.displayName}
                      onChange={(event) => updateForm('displayName', event.target.value)}
                      error={errors.displayName}
                      disabled={submitting}
                    />
                  </div>

                  {usingExistingAccount ? (
                    <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                      You are signed in as {user.email}. This coach application will be attached to your current account.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <AuthField
                          id="coach-password"
                          label="Password"
                          type={showPassword ? 'text' : 'password'}
                          icon={Lock}
                          placeholder="Create a strong password"
                          value={form.password}
                          onChange={(event) => updateForm('password', event.target.value)}
                          error={errors.password}
                          disabled={submitting}
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
                          id="coach-confirm-password"
                          label="Confirm password"
                          type={showConfirm ? 'text' : 'password'}
                          icon={Lock}
                          placeholder="Confirm your password"
                          value={form.confirmPassword}
                          onChange={(event) => updateForm('confirmPassword', event.target.value)}
                          error={errors.confirmPassword}
                          disabled={submitting}
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
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold ${
                              check.ok
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {check.label}
                          </span>
                        ))}
                        {form.confirmPassword && (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold ${
                              passwordsMatch
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="coach-sports"
                      label="Sports coached"
                      icon={Grid2X2}
                      placeholder="Select sports"
                      value={form.sportsCoached}
                      onChange={(event) => updateForm('sportsCoached', event.target.value)}
                      error={errors.sportsCoached}
                      disabled={submitting}
                      trailing={<ChevronDown className="h-4 w-4 text-slate-500" />}
                    />
                    <AuthField
                      id="coach-location"
                      label="Primary location / service area"
                      icon={MapPin}
                      placeholder="City, State or ZIP"
                      value={form.serviceArea}
                      onChange={(event) => updateForm('serviceArea', event.target.value)}
                      error={errors.serviceArea}
                      disabled={submitting}
                    />
                  </div>

                  <AuthField
                    id="coach-specialties"
                    label="Training specialties"
                    icon={ShieldCheck}
                    placeholder="Select specialties"
                    value={form.trainingSpecialties}
                    onChange={(event) => updateForm('trainingSpecialties', event.target.value)}
                    error={errors.trainingSpecialties}
                    disabled={submitting}
                    trailing={<ChevronDown className="h-4 w-4 text-slate-500" />}
                  />

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-950">
                      Session types offered
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {SESSION_TYPES.map(({ id, label, icon: Icon }) => {
                        const selected = sessionTypes.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              setSessionTypes((current) =>
                                selected ? current.filter((item) => item !== id) : [...current, id],
                              )
                            }
                            className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-bold transition ${
                              selected
                                ? 'border-blue-200 bg-blue-50 text-slate-900'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                            }`}
                          >
                            <Icon className="h-4 w-4 text-blue-700" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {errors.sessionTypes && <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.sessionTypes}</p>}
                  </div>

                  <div>
                    <label htmlFor="coach-bio" className="mb-2 block text-sm font-bold text-slate-950">
                      Short bio
                    </label>
                    <textarea
                      id="coach-bio"
                      maxLength={500}
                      rows={3}
                      placeholder="Tell athletes about your coaching philosophy, experience, and what makes you unique..."
                      value={form.shortBio}
                      onChange={(event) => updateForm('shortBio', event.target.value)}
                      disabled={submitting}
                      className={`min-h-20 w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
                        errors.shortBio
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                          : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                      }`}
                    />
                    <div className="mt-1 flex items-center justify-between gap-3">
                      {errors.shortBio ? (
                        <p className="text-xs font-semibold text-red-600">{errors.shortBio}</p>
                      ) : (
                        <span />
                      )}
                      <p className="text-xs font-semibold text-slate-400">{bioCount} / 500</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="coach-years"
                      label="Years of experience"
                      type="number"
                      min="0"
                      icon={CalendarCheck}
                      placeholder="e.g., 5"
                      value={form.yearsExperience}
                      onChange={(event) => updateForm('yearsExperience', event.target.value)}
                      error={errors.yearsExperience}
                      disabled={submitting}
                    />
                    <AuthField
                      id="coach-certifications"
                      label="Certifications"
                      icon={ShieldCheck}
                      placeholder="e.g., NASM, USA Basketball"
                      value={form.certifications}
                      onChange={(event) => updateForm('certifications', event.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50/60">
                    <FileUp className="h-4 w-4 text-blue-700" />
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                    />
                    {uploadFile ? uploadFile.name : 'Optional upload: certification, license, resume, PDF, PNG, or JPG'}
                  </label>

                  <div className="space-y-2">
                    <CheckboxRow
                      checked={form.termsAccepted}
                      onChange={(checked) => updateForm('termsAccepted', checked)}
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
                      .
                    </CheckboxRow>
                    {errors.termsAccepted && <p className="text-xs font-semibold text-red-600">{errors.termsAccepted}</p>}

                    <CheckboxRow
                      checked={form.verificationConsent}
                      onChange={(checked) => updateForm('verificationConsent', checked)}
                      disabled={submitting}
                    >
                      I consent to verification and background checks to help build trust on LevelCoach.
                    </CheckboxRow>
                    {errors.verificationConsent && <p className="text-xs font-semibold text-red-600">{errors.verificationConsent}</p>}
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting
                      ? 'Creating coach profile...'
                      : usingExistingAccount
                        ? 'Create Coach Profile'
                        : 'Create Coach Account'}
                  </button>
                </form>

                {!usingExistingAccount && (
                  <>
                    <div className="my-3 flex items-center gap-4">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-medium text-slate-500">or sign up with</span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogle}
                      disabled={submitting || isLoadingAuth}
                      className="flex h-9 w-full items-center justify-center gap-3 rounded-md border border-blue-200 bg-white text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <GoogleIcon className="h-4 w-4" />
                      Continue with Google
                    </button>

                    <p className="mt-4 text-center text-sm text-slate-600">
                      Already have an account?{' '}
                      <Link to="/sign-in" className="font-semibold text-blue-700 hover:underline">
                        Sign in
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

function AuthField({
  id,
  label,
  icon: Icon,
  error,
  trailing,
  onChange,
  ...inputProps
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          onChange={onChange}
          className={`h-9 w-full rounded-md border bg-white pl-10 text-sm text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            trailing ? 'pr-10' : 'pr-3'
          } ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function CheckboxRow({ checked, onChange, disabled, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-5 text-slate-600">
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
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
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

function buildSpecializations(form, sessionTypes) {
  return [
    form.sportsCoached.trim(),
    form.trainingSpecialties.trim(),
    ...sessionTypes,
    form.certifications.trim(),
    `${form.yearsExperience} years experience`,
  ].filter(Boolean);
}

function buildCoachBio(form) {
  return [
    form.shortBio.trim(),
    '',
    `Display name: ${form.displayName.trim()}`,
    `Sports coached: ${form.sportsCoached.trim()}`,
    `Training specialties: ${form.trainingSpecialties.trim()}`,
    `Years of experience: ${form.yearsExperience}`,
    form.certifications.trim() ? `Certifications/licenses: ${form.certifications.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function inferCounty(serviceArea) {
  const value = serviceArea.toLowerCase();
  if (value.includes('macomb')) return 'Macomb';
  if (value.includes('wayne') || value.includes('detroit')) return 'Wayne';
  return 'Oakland';
}

function splitFirstName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean)[0] || '';
}

function splitLastName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(1).join(' ');
}

function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}
