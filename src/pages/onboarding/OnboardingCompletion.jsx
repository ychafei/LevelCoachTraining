import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Briefcase, CheckCircle2, FileText, ShieldCheck, UserRound, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import {
  buildAthleteBio,
  buildLocationLabel,
  normalizePhoneForStorage,
  parseAthleteBio,
  parseLocationLabel,
  requiresGuardian,
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
import EmailVerificationBanner from '@/features/onboarding/EmailVerificationBanner';
import ParentAthletesStep from '@/features/onboarding/ParentAthletesStep';
import GuardianLegalStep from '@/features/onboarding/GuardianLegalStep';
import { homePathForRole } from '@/lib/roleHome';
import USLocationFields from '@/components/forms/USLocationFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ROLE_CARDS = [
  { id: 'athlete', title: 'Athlete', body: 'Book coaches, manage sessions, and track training.', icon: UserRound },
  { id: 'parent', title: 'Parent / Guardian', body: 'Create and manage child athlete profiles.', icon: Users },
  { id: 'coach_applicant', title: 'Coach', body: 'Continue into the coach application and verification flow.', icon: Briefcase },
  { id: 'organization', title: 'Organization', body: 'Run your training business — coaches, programs, and payouts in one workspace.', icon: Building2 },
];

const ROLE_IDS = new Set(ROLE_CARDS.map((role) => role.id));

function safeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '';
  if (value.startsWith('/onboarding')) return '';
  return value;
}

function splitName(user) {
  const parts = (user?.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    first: user?.first_name || parts[0] || '',
    last: user?.last_name || parts.slice(1).join(' ') || '',
  };
}

function normalizeRequestedRole(role) {
  if (role === 'guardian') return 'parent';
  return ROLE_IDS.has(role) ? role : '';
}


export default function OnboardingCompletion() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    onboardingComplete,
    user,
    refetchUser,
  } = useAuth();
  const requestedRole = normalizeRequestedRole(params.get('role'));
  const [selectedRole, setSelectedRole] = useState(requestedRole || normalizeRequestedRole(user?.onboarding_role) || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (requestedRole && requestedRole !== selectedRole) setSelectedRole(requestedRole);
    if (!requestedRole && !selectedRole) {
      const profileRole = normalizeRequestedRole(user?.onboarding_role);
      if (profileRole) setSelectedRole(profileRole);
    }
  }, [requestedRole, selectedRole, user?.onboarding_role]);

  const selectedRoleCard = ROLE_CARDS.find((role) => role.id === selectedRole);
  const SelectedRoleIcon = selectedRoleCard?.icon || UserRound;
  const roleLocked = Boolean(selectedRole && (requestedRole || normalizeRequestedRole(user?.onboarding_role)));
  const fromCreateAccount = params.get('from') === 'create-account';

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-10 text-slate-950">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const next = `/onboarding${window.location.search || ''}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (onboardingComplete) {
    return <Navigate to={safeNext(params.get('next')) || homePathForRole(user)} replace />;
  }

  const chooseRole = (role) => {
    setSelectedRole(role);
    setError('');
  };

  // Coach applicants and organizations resume their specialized flows.
  // onboarding_role is in the accountProfile.update whitelist pre-completion.
  const continueSpecializedFlow = async () => {
    if (selectedRole !== 'coach_applicant' && selectedRole !== 'organization') return;
    setSaving(true);
    setError('');
    try {
      // onboarding_role is whitelisted in accountProfile.update pre-completion only.
      if (user?.onboarding_status !== 'complete' && user?.onboarding_role !== selectedRole) {
        await auth.updateCurrentUser({ onboarding_role: selectedRole });
      }
      await refetchUser();
      navigate(selectedRole === 'coach_applicant' ? '/apply/private-training-coach' : '/create-organization', { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not save your onboarding path.');
    } finally {
      setSaving(false);
    }
  };

  const finishNavigate = async () => {
    const fresh = await refetchUser();
    navigate(safeNext(params.get('next')) || homePathForRole(fresh), { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <EmailVerificationBanner user={user} className="mb-5" />

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Finish setup
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.01em] sm:text-4xl">
            {fromCreateAccount ? 'Finish setting up your account' : 'Finish your LevelCoach account'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {fromCreateAccount
              ? 'A few more steps and your account is ready. Review what we saved, complete the remaining steps, and confirm.'
              : 'Pick how you’ll use LevelCoach to unlock your dashboard. Your account is saved — you can come back to this anytime.'}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Want to look around first?{' '}
            <Link to="/coaches" className="font-semibold text-blue-700 hover:underline">
              Browse coaches
            </Link>
            {' '}— this page will be here when you’re ready.
          </p>
        </div>

        {roleLocked ? (
          <div className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <SelectedRoleIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Account type</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-950">{selectedRoleCard?.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{selectedRoleCard?.body}</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Selected
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            {ROLE_CARDS.map((role) => (
              <RoleCard key={role.id} role={role} selected={selectedRole === role.id} onChoose={chooseRole} />
            ))}
          </div>
        )}

        {(selectedRole === 'coach_applicant' || selectedRole === 'organization') && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Resume setup</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {selectedRole === 'coach_applicant' ? 'Continue coach onboarding' : 'Continue organization onboarding'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {selectedRole === 'coach_applicant'
                    ? 'Your coach role is not active until the application is reviewed and approved, then the legal packet, profile, and Stripe payout setup are complete.'
                    : 'Your organization workspace is not publishable until the organization form, legal packet, and Stripe payout setup are complete.'}
                </p>
              </div>
              <Button onClick={continueSpecializedFlow} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
                {saving ? 'Saving...' : 'Continue'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          </div>
        )}

        {selectedRole === 'athlete' && (
          <AthleteOnboardingForm user={user} fromCreateAccount={fromCreateAccount} onFinished={finishNavigate} />
        )}

        {selectedRole === 'parent' && (
          <ParentOnboardingSteps user={user} onFinished={finishNavigate} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Athlete flow — review/confirm details, then complete onboarding through the
// accountProfile function (whitelist-only; is_minor recomputed server-side).
// ---------------------------------------------------------------------------

function AthleteOnboardingForm({ user, fromCreateAccount, onFinished }) {
  const name = useMemo(() => splitName(user), [user]);
  const parsedBio = useMemo(() => parseAthleteBio(user?.bio), [user?.bio]);
  const savedLocation = useMemo(() => parseLocationLabel(user?.location_label), [user?.location_label]);
  const notificationPrefs = useMemo(() => parseNotificationPrefs(user?.notification_prefs), [user?.notification_prefs]);

  const [form, setForm] = useState({
    first_name: name.first,
    last_name: name.last,
    phone: user?.phone || '',
    dob: user?.dob ? String(user.dob).slice(0, 10) : '',
    location: {
      city: savedLocation.city,
      state: savedLocation.state,
      zip: '',
      county: savedLocation.county,
      lat: savedLocation.lat,
      lng: savedLocation.lng,
    },
    locationDetail: savedLocation.detail,
    trainingGoal: parsedBio.trainingGoal,
    termsAccepted: user?.terms_accepted === true,
    marketingSms: notificationPrefs.marketing_sms === true,
    mediaRelease: user?.media_release_accepted === true,
  });
  const [sportDetails, setSportDetails] = useState({
    sportKey: parsedBio.sportKey,
    position: parsedBio.position,
    level: parsedBio.level,
    availability: parsedBio.availability,
  });
  const [healthDetails, setHealthDetails] = useState({
    healthNotes: parsedBio.healthNotes,
    emergencyName: parsedBio.emergencyName,
    emergencyPhone: parsedBio.emergencyPhone,
    emergencyRelationship: parsedBio.emergencyRelationship,
  });
  const [guardian, setGuardian] = useState({
    parentFirstName: user?.parent_first_name || '',
    parentLastName: user?.parent_last_name || '',
    parentEmail: user?.parent_email || '',
    parentPhone: user?.parent_phone || '',
    parentRelationship: user?.parent_relationship || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const guardianRequired = requiresGuardian(form.dob);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Merge the changed subset from USLocationFields into the structured location.
  const updateLocation = (patch) => {
    setForm((current) => ({ ...current, location: { ...current.location, ...patch } }));
    setErrors((current) => ({ ...current, city: undefined, state: undefined }));
  };

  const validate = () => {
    const next = {};
    const firstNameError = validatePersonName(form.first_name, 'First name');
    const lastNameError = validatePersonName(form.last_name, 'Last name');
    const phoneError = validatePhone(form.phone, 'Phone');
    const dobError = validateDob(form.dob);
    if (firstNameError) next.first_name = firstNameError;
    if (lastNameError) next.last_name = lastNameError;
    if (phoneError) next.phone = phoneError;
    if (dobError) next.dob = dobError;
    if (validateLocation(form.location.city)) next.city = 'Training city is required.';
    if (!form.location.state) next.state = 'Select your state.';
    if (!form.termsAccepted) next.termsAccepted = 'You must agree to the Universal Account Terms, Privacy Notice, and Electronic Signature Consent.';
    Object.assign(next, validateAthleteDetails({ ...sportDetails, ...healthDetails }));
    if (guardianRequired) Object.assign(next, validateGuardianContact(guardian));
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finish = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!validate()) {
      setFormError('Fix the highlighted fields before completing setup.');
      return;
    }
    setSaving(true);
    try {
      const { city, state, lat, lng } = form.location;
      // "City, ST" matches CreateAccount so signup→onboarding→settings round-trips.
      const cityStateLabel = [city.trim(), state].filter(Boolean).join(', ');
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      // onboarding_role / onboarding_status are only writable pre-completion;
      // skip them for profiles that already crossed that transition.
      const alreadyComplete = user?.onboarding_status === 'complete';
      await auth.updateCurrentUser({
        onboarding_role: alreadyComplete ? undefined : 'athlete',
        onboarding_status: alreadyComplete ? undefined : 'complete',
        profile_setup_complete: true,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: normalizePhoneForStorage(form.phone),
        dob: form.dob,
        parent_first_name: guardianRequired ? guardian.parentFirstName.trim() : '',
        parent_last_name: guardianRequired ? guardian.parentLastName.trim() : '',
        parent_email: guardianRequired ? guardian.parentEmail.trim() : '',
        parent_phone: guardianRequired ? normalizePhoneForStorage(guardian.parentPhone) : '',
        parent_relationship: guardianRequired ? guardian.parentRelationship.trim() : '',
        terms_accepted: true,
        media_release_accepted: form.mediaRelease === true,
        notification_prefs: notificationPrefsWithMarketingSms(user?.notification_prefs, form.marketingSms),
        location_label: buildLocationLabel(cityStateLabel, form.locationDetail),
        ...(hasCoords ? { location_lat: lat, location_lng: lng } : {}),
        bio: buildAthleteBio({
          ...sportDetails,
          trainingGoal: form.trainingGoal,
          ...healthDetails,
        }),
      });
      await onFinished();
    } catch (err) {
      setFormError(err?.message || 'Could not complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={finish} className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" noValidate>
      {fromCreateAccount && (
        <div className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Saved from account creation</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Your details are already filled in. Edit anything that looks off, then confirm setup.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          value={form.first_name}
          onChange={(value) => updateForm('first_name', value)}
          error={errors.first_name}
          autoComplete="given-name"
          required
        />
        <Field
          label="Last name"
          value={form.last_name}
          onChange={(value) => updateForm('last_name', value)}
          error={errors.last_name}
          autoComplete="family-name"
          required
        />
        <Field
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(value) => updateForm('phone', value)}
          error={errors.phone}
          autoComplete="tel"
          placeholder="(248) 555-0123"
          required
        />
        <Field
          label="Date of birth"
          type="date"
          value={form.dob}
          onChange={(value) => updateForm('dob', value)}
          error={errors.dob}
          required
        />
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 block text-sm font-bold text-slate-900">
          Training location<span className="text-red-600"> *</span>
        </legend>
        <USLocationFields
          idPrefix="onboarding-athlete-loc"
          fields={['state', 'city', 'zip']}
          required
          disabled={saving}
          value={form.location}
          onChange={updateLocation}
          errors={{ city: errors.city, state: errors.state }}
          columns="grid grid-cols-1 gap-4 sm:grid-cols-3"
        />
      </fieldset>

      <div className="mt-5">
        <Field
          label="Location details (optional)"
          value={form.locationDetail}
          onChange={(value) => updateForm('locationDetail', value)}
          placeholder="Neighborhood, facility, travel range…"
        />
      </div>

      <div className="mt-5">
        <AthleteSportFields
          value={sportDetails}
          onChange={(next) => {
            setSportDetails(next);
            setErrors((current) => ({ ...current, sportKey: undefined, position: undefined, level: undefined, availability: undefined }));
          }}
          errors={errors}
          disabled={saving}
          idPrefix="onboarding-athlete"
        />
      </div>

      <div className="mt-5">
        <Field
          label="Training goal (optional)"
          value={form.trainingGoal}
          onChange={(value) => updateForm('trainingGoal', value)}
          placeholder="e.g., make varsity, improve first touch, get faster"
        />
      </div>

      <div className="mt-5">
        <HealthAndEmergencyFields
          value={healthDetails}
          onChange={(next) => {
            setHealthDetails(next);
            setErrors((current) => ({ ...current, healthNotes: undefined, emergencyName: undefined, emergencyPhone: undefined, emergencyRelationship: undefined }));
          }}
          errors={errors}
          disabled={saving}
          idPrefix="onboarding-athlete"
        />
      </div>

      {guardianRequired && (
        <div className="mt-5">
          <GuardianContactFields
            value={guardian}
            onChange={(next) => {
              setGuardian(next);
              setErrors((current) => ({ ...current, parentFirstName: undefined, parentLastName: undefined, parentEmail: undefined, parentPhone: undefined, parentRelationship: undefined }));
            }}
            errors={errors}
            disabled={saving}
            idPrefix="onboarding-guardian"
          />
        </div>
      )}

      <div className="mt-5">
        <LegalConsentRows
          termsAccepted={form.termsAccepted}
          marketingSms={form.marketingSms}
          mediaRelease={form.mediaRelease}
          errors={errors}
          onChange={updateForm}
          disabled={saving}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {guardianRequired
            ? 'Because you are under 18, your parent or guardian signs your legal packet and manages bookings and payments from their parent account.'
            : 'After setup, the required legal packet appears before protected booking and portal actions.'}
        </p>
        <Button type="submit" disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
          {saving ? 'Saving...' : fromCreateAccount ? 'Confirm setup' : 'Complete setup'}
        </Button>
      </div>
      {formError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{formError}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Parent flow — identity, add athletes (family function), guardian legal
// packet per child, then completion via accountProfile.
// ---------------------------------------------------------------------------

const PARENT_STEPS = [
  { id: 'details', label: 'Your details', icon: UserRound },
  { id: 'athletes', label: 'Your athletes', icon: Users },
  { id: 'legal', label: 'Legal packet', icon: FileText },
];

function ParentOnboardingSteps({ user, onFinished }) {
  const name = useMemo(() => splitName(user), [user]);
  const notificationPrefs = useMemo(() => parseNotificationPrefs(user?.notification_prefs), [user?.notification_prefs]);
  const detailsAlreadySaved = user?.onboarding_role === 'parent' && !!user?.first_name && !!user?.phone && user?.terms_accepted === true;
  const [stage, setStage] = useState(detailsAlreadySaved ? 'athletes' : 'details');
  const [form, setForm] = useState({
    first_name: name.first,
    last_name: name.last,
    phone: user?.phone || '',
    termsAccepted: user?.terms_accepted === true,
    marketingSms: notificationPrefs.marketing_sms === true,
    mediaRelease: user?.media_release_accepted === true,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [athletes, setAthletes] = useState([]);
  const [legalComplete, setLegalComplete] = useState(false);

  const stageIndex = PARENT_STEPS.findIndex((step) => step.id === stage);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    setFormError('');
    const next = {};
    const firstNameError = validatePersonName(form.first_name, 'First name');
    const lastNameError = validatePersonName(form.last_name, 'Last name');
    const phoneError = validatePhone(form.phone, 'Phone');
    if (firstNameError) next.first_name = firstNameError;
    if (lastNameError) next.last_name = lastNameError;
    if (phoneError) next.phone = phoneError;
    if (!form.termsAccepted) next.termsAccepted = 'You must agree to the Universal Account Terms, Privacy Notice, and Electronic Signature Consent.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await auth.updateCurrentUser({
        onboarding_role: 'parent',
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: normalizePhoneForStorage(form.phone),
        terms_accepted: true,
        media_release_accepted: form.mediaRelease === true,
        notification_prefs: notificationPrefsWithMarketingSms(user?.notification_prefs, form.marketingSms),
      });
      setStage('athletes');
    } catch (err) {
      setFormError(err?.message || 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    setFormError('');
    try {
      await auth.updateCurrentUser({
        onboarding_status: user?.onboarding_status === 'complete' ? undefined : 'complete',
        profile_setup_complete: true,
      });
      await onFinished();
    } catch (err) {
      setFormError(err?.message || 'Could not complete onboarding.');
      setSaving(false);
    }
  };

  return (
    <div className="mt-5">
      <ol className="grid grid-cols-3 gap-2" aria-label="Parent setup steps">
        {PARENT_STEPS.map((step, index) => {
          const Icon = step.icon;
          const state = index < stageIndex ? 'done' : index === stageIndex ? 'current' : 'todo';
          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold ${
                state === 'current'
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : state === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              <span className="truncate">{index + 1}. {step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {stage === 'details' && (
          <form onSubmit={saveDetails} noValidate>
            <h2 className="text-lg font-extrabold text-slate-950">Your details</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              This is the account that manages bookings, payments, and legal documents for your athletes.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                value={form.first_name}
                onChange={(value) => updateForm('first_name', value)}
                error={errors.first_name}
                autoComplete="given-name"
                required
              />
              <Field
                label="Last name"
                value={form.last_name}
                onChange={(value) => updateForm('last_name', value)}
                error={errors.last_name}
                autoComplete="family-name"
                required
              />
              <Field
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(value) => updateForm('phone', value)}
                error={errors.phone}
                autoComplete="tel"
                placeholder="(248) 555-0123"
                required
              />
            </div>
            <div className="mt-5">
              <LegalConsentRows
                termsAccepted={form.termsAccepted}
                marketingSms={form.marketingSms}
                mediaRelease={form.mediaRelease}
                errors={errors}
                onChange={updateForm}
                disabled={saving}
              />
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
                {saving ? 'Saving...' : 'Continue to athletes'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {formError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{formError}</p>}
          </form>
        )}

        {stage === 'athletes' && (
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Add your athletes</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Each athlete gets their own profile linked to your guardian account. Booking, payment,
              and messaging permissions default to parent-managed — adjust them anytime.
            </p>
            <div className="mt-4">
              <ParentAthletesStep onFamilyChange={setAthletes} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStage('details')} disabled={saving}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                {athletes.length === 0 && (
                  <button
                    type="button"
                    onClick={completeOnboarding}
                    disabled={saving}
                    className="text-xs font-semibold text-slate-500 underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    Skip for now and finish
                  </button>
                )}
                <Button
                  type="button"
                  onClick={() => setStage('legal')}
                  disabled={saving || athletes.length === 0}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Continue to legal packet
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
            {formError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{formError}</p>}
          </div>
        )}

        {stage === 'legal' && (
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Guardian legal packet</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Sign the required documents for each athlete. Booking stays locked for an athlete until
              their packet is signed — you can also finish now and sign later from your parent portal.
            </p>
            <div className="mt-4">
              <GuardianLegalStep athletes={athletes} onAllComplete={setLegalComplete} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStage('athletes')} disabled={saving}>
                Back
              </Button>
              <Button type="button" onClick={completeOnboarding} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
                {saving ? 'Finishing...' : legalComplete ? 'Finish setup' : 'Finish setup (sign later)'}
              </Button>
            </div>
            {formError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{formError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function LegalConsentRows({
  termsAccepted,
  marketingSms,
  mediaRelease,
  errors,
  onChange,
  disabled,
}) {
  return (
    <div className="space-y-2">
      <CheckboxRow
        checked={termsAccepted}
        onChange={(checked) => onChange('termsAccepted', checked)}
        disabled={disabled}
      >
        I have read, understood, and agree to the{' '}
        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline">
          Universal Account Terms, Privacy Notice, and Electronic Signature Consent
        </Link>{' '}
        including the{' '}
        <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline">
          Privacy Notice
        </Link>
        . <span className="text-red-600">*</span>
      </CheckboxRow>
      {errors.termsAccepted && <p className="text-xs font-semibold text-red-600">{errors.termsAccepted}</p>}
      <CheckboxRow
        checked={marketingSms}
        onChange={(checked) => onChange('marketingSms', checked)}
        disabled={disabled}
      >
        OPTIONAL: I consent to receive recurring marketing SMS/text messages from LevelCoach Training at the mobile number I provide. Consent is not a condition of purchase or use.
      </CheckboxRow>
      <CheckboxRow
        checked={mediaRelease}
        onChange={(checked) => onChange('mediaRelease', checked)}
        disabled={disabled}
      >
        OPTIONAL: I authorize LevelCoach to use approved photos, videos, name, image, voice, likeness, testimonials, training content, and session media for LevelCoach marketing.
      </CheckboxRow>
    </div>
  );
}

function RoleCard({ role, selected, onChoose }) {
  const Icon = role.icon;
  return (
    <button
      type="button"
      onClick={() => onChoose(role.id)}
      className={`rounded-lg border bg-white p-4 text-left shadow-sm transition ${
        selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200'
      }`}
    >
      <Icon className="h-5 w-5 text-blue-600" />
      <h2 className="mt-3 text-base font-bold">{role.title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">{role.body}</p>
    </button>
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

function parseNotificationPrefs(raw) {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function notificationPrefsWithMarketingSms(raw, marketingSms) {
  return { ...parseNotificationPrefs(raw), marketing_sms: marketingSms === true };
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  required = false,
  error = '',
  placeholder = '',
  autoComplete,
  list,
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div>
      <Label htmlFor={id} className="text-sm font-bold text-slate-900">
        {label}{required && <span className="text-red-600"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        list={list}
        aria-invalid={error ? 'true' : undefined}
        className={`mt-1 bg-white text-slate-950 ${
          error
            ? 'border-red-400 focus-visible:ring-red-100'
            : 'border-slate-300 focus-visible:ring-blue-100'
        }`}
        required={required}
      />
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
