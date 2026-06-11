import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { auth } from '@/lib/auth';
import { callFn } from '@/lib/rpc';
import { useAuth } from '@/lib/AuthContext';
import { coachApplicationRepo } from '@/api/repo';
import { SPORT_SELECT_OPTIONS, EMAIL_RE, normalizePhoneForStorage } from '@/lib/athleteOnboardingFields';
import { WhatHappensNext } from '@/components/apply/ApplicationForm';
import { onboardingPath } from '@/lib/roleHome';
import USLocationFields from '@/components/forms/USLocationFields';

const PASSWORD_RULES = [
  { id: 'length', label: '8+ characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: '1 uppercase', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: '1 lowercase', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: '1 number', test: (value) => /\d/.test(value) },
  { id: 'special', label: '1 special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function ApplyPrivateTrainingCoach() {
  const { isAuthenticated, isLoadingAuth, user, refetchUser, isCoach } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    password: '',
    confirmPassword: '',
    location: { city: '', state: '', zip: '', county: '', lat: undefined, lng: undefined },
    county: '',
    yearsExperience: '',
    credentials: '',
    experience: '',
    resumeUrl: '',
    backgroundCheckConsent: false,
    termsAccepted: false,
    website: '', // honeypot — hidden from real users
  });
  const [sports, setSports] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingApplication, setExistingApplication] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const age = useMemo(() => calculateAge(form.dob), [form.dob]);
  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const passwordValid = passwordChecks.every((check) => check.ok);
  const usingExistingAccount = isAuthenticated && !!user;
  // A new applicant always creates an account — the password is required.
  const wantsAccount = !usingExistingAccount;

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      firstName: current.firstName || user.first_name || splitFirstName(user.name),
      lastName: current.lastName || user.last_name || splitLastName(user.name),
      email: user.email || current.email,
      phone: current.phone || user.phone || '',
      dob: current.dob || (user.dob ? String(user.dob).slice(0, 10) : ''),
    }));
  }, [user]);

  // Applicants with an account get a per-document read grant on their own
  // application — show its status instead of the blank form.
  useEffect(() => {
    if (!user?.email) {
      setExistingApplication(null);
      return;
    }
    let cancelled = false;
    setCheckingExisting(true);
    coachApplicationRepo.filter({ email: String(user.email).toLowerCase() }, '-created_date')
      .then((rows) => {
        if (!cancelled) setExistingApplication(rows?.[0] || null);
      })
      .catch(() => {
        if (!cancelled) setExistingApplication(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingExisting(false);
      });
  }, [user?.email]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Merge the changed subset from USLocationFields. A city pick (or ZIP resolve)
  // also returns a county, which we mirror into the existing `county` field so
  // the submit payload (service_county) is unchanged.
  const updateLocation = (patch) => {
    setForm((current) => ({
      ...current,
      location: { ...current.location, ...patch },
      ...(patch.county !== undefined ? { county: patch.county || '' } : {}),
    }));
    setErrors((current) => ({ ...current, serviceArea: undefined, county: undefined }));
  };

  // "City, ST ZIP" — the service_location string sent to the applications fn.
  const serviceArea = [
    [form.location.city.trim(), form.location.state].filter(Boolean).join(', '),
    form.location.zip,
  ].filter(Boolean).join(' ').trim();

  const toggleSport = (label) => {
    setSports((current) => (
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
    ));
    setErrors((current) => ({ ...current, sports: undefined }));
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
    else if (age < 18) next.dob = 'Coaches must be 18 or older.';
    if (wantsAccount) {
      if (!passwordValid) next.password = 'Password does not meet the requirements below.';
      if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    }
    if (sports.length === 0) next.sports = 'Select at least one sport you coach.';
    if (!form.location.city.trim() || !form.location.state) next.serviceArea = 'Select your primary location (state and city).';
    if (!form.county.trim()) next.county = 'Pick a city from the suggestions so we can fill the county.';
    if (form.experience.trim().length < 20) next.experience = 'Tell us a bit more (at least 20 characters).';
    if (form.resumeUrl.trim() && !/^https?:\/\//i.test(form.resumeUrl.trim())) {
      next.resumeUrl = 'Use a full link, like https://…';
    }
    if (!form.backgroundCheckConsent) next.backgroundCheckConsent = 'Background check consent is required to apply.';
    if (!form.termsAccepted) next.termsAccepted = 'You must agree to the Terms of Service and Privacy Policy.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);

    // Phase 1 — create the account (only for new applicants). Isolated so an
    // account problem (email taken, weak password, active session) shows a
    // clear, specific message instead of a generic one.
    let hasAccount = usingExistingAccount;
    if (!usingExistingAccount && wantsAccount) {
      try {
        await auth.signOut();
        await auth.signUp(form.email.trim(), form.password);
        hasAccount = true;
      } catch (err) {
        const type = err?.type || '';
        const code = err?.code;
        if (code === 409 || type === 'user_already_exists') {
          setFormError('An account with that email already exists. Sign in first, then submit your application from your account.');
        } else if (type.includes('password')) {
          setFormError('That password was rejected. Use at least 8 characters with a mix of letters, numbers, and a symbol.');
        } else if (type === 'user_session_already_exists') {
          setFormError('You appear to be signed in already. Refresh the page and try again, or apply from your existing account.');
        } else {
          setFormError(err?.message || 'We could not create your account. Please try again.');
        }
        setSubmitting(false);
        return;
      }
    }

    // Phase 2 — submit the application (validated/rate-limited server-side).
    try {
      const background = [
        `Sports coached: ${sports.join(', ')}`,
        `Service area: ${serviceArea}`,
        form.yearsExperience ? `Years of experience: ${form.yearsExperience}` : '',
        form.credentials.trim() ? `Credentials & certifications:\n${form.credentials.trim()}` : '',
        `Coaching experience & background:\n${form.experience.trim()}`,
      ].filter(Boolean).join('\n\n');

      await callFn('applications', {
        action: 'submit',
        website: form.website, // honeypot
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        dob: form.dob,
        service_location: serviceArea,
        ...(form.county.trim() ? { service_county: form.county.trim() } : {}),
        coaching_background: background,
        resume_url: form.resumeUrl.trim(),
        background_check_consent: true,
      });
    } catch (err) {
      setFormError(err?.message || 'Could not submit your application. Please try again.');
      setSubmitting(false);
      return;
    }

    // Phase 3 — best-effort profile bookkeeping. Never blocks success: the
    // application is already in.
    if (hasAccount) {
      try {
        const fresh = await refetchUser();
        if (fresh && fresh.onboarding_status !== 'complete') {
          await auth.updateCurrentUser({
            onboarding_role: 'coach_applicant',
            onboarding_status: 'complete',
            profile_setup_complete: true,
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            phone: normalizePhoneForStorage(form.phone),
            dob: form.dob,
            terms_accepted: true,
          });
          await refetchUser();
        }
      } catch (profileErr) {
        console.warn('[apply] profile bookkeeping skipped:', profileErr?.message || profileErr);
      }
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      await auth.signOut();
      auth.createOAuthSession('google', onboardingPath('/apply/private-training-coach', 'coach_applicant'));
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-up.');
    }
  };

  // ---- Status screens -------------------------------------------------------

  if (isCoach && user?.role === 'coach') {
    return (
      <StatusShell
        icon={<CheckCircle2 className="h-9 w-9" />}
        tone="emerald"
        title="You're already a coach"
        body="Your coach account is active. Manage your profile, availability, legal packet, and payouts from the coach portal."
        primary={{ to: '/coach', label: 'Open coach portal' }}
      />
    );
  }

  if (submitted || existingApplication?.status === 'pending') {
    return (
      <StatusShell
        icon={<Clock3 className="h-9 w-9" />}
        tone="blue"
        title="Application received"
        body={`Thanks${form.firstName ? `, ${form.firstName.trim()}` : ''}! Your coach application is in review. We'll email ${form.email || existingApplication?.email || 'you'} with the decision.`}
        primary={{ to: '/', label: 'Back to platform' }}
      >
        <WhatHappensNext />
      </StatusShell>
    );
  }

  if (existingApplication?.status === 'accepted') {
    return (
      <StatusShell
        icon={<CheckCircle2 className="h-9 w-9" />}
        tone="emerald"
        title="Your application was approved"
        body="Welcome aboard. Head to the coach portal to complete your profile, sign the coach legal packet, set availability, and connect payouts."
        primary={{ to: '/coach', label: 'Start coach onboarding' }}
      />
    );
  }

  if (existingApplication?.status === 'rejected') {
    return (
      <StatusShell
        icon={<XCircle className="h-9 w-9" />}
        tone="slate"
        title="Application update"
        body="We weren't able to move forward with your previous application. You're welcome to apply again with updated experience or credentials."
        primary={{ onClick: () => setExistingApplication(null), label: 'Apply again' }}
      />
    );
  }

  // ---- Application form -----------------------------------------------------

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
                  Coach Application
                </div>

                <h1 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-4xl">
                  Apply to coach on LevelCoach
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Applications are reviewed by our team. Once approved, you'll set up your public
                  profile, availability, legal packet, and payouts before going live.
                </p>

                {checkingExisting && (
                  <div className="mt-4 h-10 animate-pulse rounded-md bg-slate-100" aria-busy="true" aria-label="Checking for an existing application" />
                )}

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                  {/* Honeypot — hidden from real users. */}
                  <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                    <label htmlFor="coach-apply-website">Website</label>
                    <input
                      id="coach-apply-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(event) => updateForm('website', event.target.value)}
                    />
                  </div>

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
                      id="coach-years"
                      label="Years of coaching experience"
                      type="number"
                      min="0"
                      icon={CalendarCheck}
                      placeholder="e.g., 5"
                      value={form.yearsExperience}
                      onChange={(event) => updateForm('yearsExperience', event.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  {usingExistingAccount ? (
                    <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                      You are signed in as {user.email}. This application will be linked to your current account.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <AuthField
                          id="coach-password"
                          label="Password"
                          type={showPassword ? 'text' : 'password'}
                          icon={Lock}
                          placeholder="Create a password for your account"
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
                          disabled={submitting || !form.password}
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
                      {wantsAccount && (
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
                        </div>
                      )}
                      <p className="text-xs leading-5 text-slate-500">
                        You can apply without a password — we'll email you either way. Creating one lets
                        you sign in and track your application status.
                      </p>
                    </>
                  )}

                  <div>
                    <p className="mb-2 block text-sm font-bold text-slate-950">
                      Sports you coach<span aria-hidden="true" className="text-red-600"> *</span>
                    </p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Sports you coach">
                      {SPORT_SELECT_OPTIONS.map((option) => {
                        const selected = sports.includes(option.label);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleSport(option.label)}
                            disabled={submitting}
                            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                              selected
                                ? 'border-blue-300 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {errors.sports && <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.sports}</p>}
                  </div>

                  <fieldset>
                    <legend className="mb-2 block text-sm font-bold text-slate-950">
                      Primary location / service area<span aria-hidden="true" className="text-red-600"> *</span>
                    </legend>
                    <USLocationFields
                      idPrefix="coach-service-area"
                      fields={['city', 'state', 'zip']}
                      required
                      disabled={submitting}
                      value={form.location}
                      onChange={updateLocation}
                      errors={{ city: errors.serviceArea, state: errors.serviceArea }}
                      columns="grid grid-cols-1 gap-4 sm:grid-cols-3"
                    />
                    {errors.serviceArea && <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.serviceArea}</p>}
                    <div className="mt-3">
                      <span className="block text-sm font-medium text-slate-700 mb-1">
                        County<span className="text-red-600"> *</span>
                      </span>
                      <div className={`flex h-11 items-center gap-2 rounded-md border bg-secondary/40 px-3 text-sm ${errors.county ? 'border-destructive' : 'border-border'}`}>
                        <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className={form.county ? 'text-foreground' : 'text-muted-foreground'} id="coach-county">
                          {form.county
                            ? (form.county.toLowerCase().includes('county') ? form.county : `${form.county} County`)
                            : 'Auto-filled from the city you select'}
                        </span>
                      </div>
                      {errors.county && <p className="mt-1 text-xs text-destructive">{errors.county}</p>}
                    </div>
                  </fieldset>

                  <TextAreaField
                    id="coach-credentials"
                    label="Credentials & certifications"
                    rows={3}
                    placeholder="Licenses, certifications, playing/coaching credentials, education…"
                    value={form.credentials}
                    onChange={(event) => updateForm('credentials', event.target.value)}
                    disabled={submitting}
                  />

                  <TextAreaField
                    id="coach-experience"
                    label="Coaching experience & background"
                    required
                    rows={5}
                    placeholder="Who you've coached, for how long, your training philosophy, and notable results…"
                    value={form.experience}
                    onChange={(event) => updateForm('experience', event.target.value)}
                    error={errors.experience}
                    disabled={submitting}
                  />

                  <AuthField
                    id="coach-resume-url"
                    label="Resume / portfolio link (optional)"
                    type="url"
                    icon={LinkIcon}
                    placeholder="https://…"
                    value={form.resumeUrl}
                    onChange={(event) => updateForm('resumeUrl', event.target.value)}
                    error={errors.resumeUrl}
                    disabled={submitting}
                  />

                  <div className="space-y-2">
                    <CheckboxRow
                      checked={form.backgroundCheckConsent}
                      onChange={(checked) => updateForm('backgroundCheckConsent', checked)}
                      disabled={submitting}
                    >
                      <span className="inline-flex items-start gap-1.5">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                        <span>
                          I consent to a background check as part of the application process. <span className="text-red-600">*</span>
                        </span>
                      </span>
                    </CheckboxRow>
                    {errors.backgroundCheckConsent && <p className="text-xs font-semibold text-red-600">{errors.backgroundCheckConsent}</p>}

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
                      . <span className="text-red-600">*</span>
                    </CheckboxRow>
                    {errors.termsAccepted && <p className="text-xs font-semibold text-red-600">{errors.termsAccepted}</p>}
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Submitting application...' : 'Submit Coach Application'}
                  </button>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">What happens next</p>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-5 text-slate-600">
                      <li>Our team reviews your application.</li>
                      <li>If approved, you get an approval email at this address.</li>
                      <li>Sign in to complete coach onboarding: profile, legal packet, availability, and payouts.</li>
                    </ol>
                  </div>
                </form>

                {!usingExistingAccount && (
                  <>
                    <div className="my-3 flex items-center gap-4">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-medium text-slate-500">or start with</span>
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

function StatusShell({ icon, tone, title, body, primary, children }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />
      <main className="flex min-h-screen items-center justify-center px-4 py-24">
        <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-slate-950/10">
          <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${tones[tone] || tones.blue}`}>
            {icon}
          </div>
          <h1 className="mt-6 font-sans text-3xl font-extrabold tracking-normal text-slate-950 normal-case">{title}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{body}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {primary?.to ? (
              <Link
                to={primary.to}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                {primary.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={primary?.onClick}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                {primary?.label}
              </button>
            )}
            {primary?.to !== '/' && (
              <Link
                to="/"
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Back to platform
              </Link>
            )}
          </div>
          {children}
        </div>
      </main>
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


function TextAreaField({ id, label, required = false, error, onChange, ...textAreaProps }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}{required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      <textarea
        id={id}
        onChange={onChange}
        className={`w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        }`}
        aria-invalid={error ? 'true' : undefined}
        {...textAreaProps}
      />
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
