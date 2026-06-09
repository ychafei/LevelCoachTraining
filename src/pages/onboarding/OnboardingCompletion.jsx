import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Briefcase, CheckCircle2, FileText, ShieldCheck, UserRound, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import {
  CITY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  SPORT_OPTIONS,
  citySuggestions,
  normalizePhoneForStorage,
  normalizeSport,
  requiresGuardian,
  resolveCityPlace,
  validateCity,
  validateDob,
  validateEmail,
  validatePersonName,
  validatePhone,
  validateSport,
} from '@/lib/athleteOnboardingFields';
import { homePathForRole } from '@/lib/roleHome';
import { athleteProfileRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const ROLE_CARDS = [
  { id: 'athlete', title: 'Athlete', body: 'Book coaches, manage sessions, and track training.', icon: UserRound },
  { id: 'parent', title: 'Parent / Guardian', body: 'Create and manage child athlete profiles.', icon: Users },
  { id: 'coach_applicant', title: 'Coach', body: 'Continue into the coach application and verification flow.', icon: Briefcase },
  { id: 'organization', title: 'Organization', body: 'Create a tenant workspace for your training business.', icon: Building2 },
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

function onboardingErrors(form, role) {
  const next = {};
  if (role !== 'athlete' && role !== 'parent') return next;

  const firstNameError = validatePersonName(form.first_name, 'First name');
  const lastNameError = validatePersonName(form.last_name, 'Last name');
  const phoneError = validatePhone(form.phone, 'Phone');

  if (firstNameError) next.first_name = firstNameError;
  if (lastNameError) next.last_name = lastNameError;
  if (phoneError) next.phone = phoneError;

  if (role === 'athlete') {
    const dobError = validateDob(form.dob);
    const sportError = validateSport(form.sport);
    const cityError = validateCity(form.location);

    if (dobError) next.dob = dobError;
    if (sportError) next.sport = sportError;
    if (cityError) next.location = cityError;

    if (requiresGuardian(form.dob)) {
      const parentFirstError = validatePersonName(form.parent_first_name, 'Parent/guardian first name');
      const parentLastError = validatePersonName(form.parent_last_name, 'Parent/guardian last name');
      const parentEmailError = validateEmail(form.parent_email, 'Parent/guardian email');
      const parentPhoneError = validatePhone(form.parent_phone, 'Parent/guardian phone');
      if (parentFirstError) next.parent_first_name = parentFirstError;
      if (parentLastError) next.parent_last_name = parentLastError;
      if (parentEmailError) next.parent_email = parentEmailError;
      if (parentPhoneError) next.parent_phone = parentPhoneError;
      if (!form.parent_relationship.trim()) next.parent_relationship = 'Relationship is required.';
    }
  }

  return next;
}

function firstSport(profile) {
  if (Array.isArray(profile?.sports) && profile.sports[0]) return profile.sports[0];
  if (typeof profile?.sports === 'string') return profile.sports.split(',')[0]?.trim() || '';
  return '';
}

async function upsertAthleteProfile(existingProfile, payload) {
  if (existingProfile?.id) {
    try {
      return await athleteProfileRepo.update(existingProfile.id, payload);
    } catch {
      return athleteProfileRepo.create(payload);
    }
  }
  return athleteProfileRepo.create(payload);
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
  const name = useMemo(() => splitName(user), [user]);
  const [form, setForm] = useState({
    first_name: name.first,
    last_name: name.last,
    phone: user?.phone || '',
    dob: user?.dob || '',
    sport: '',
    location: '',
    notes: '',
    parent_first_name: user?.parent_first_name || '',
    parent_last_name: user?.parent_last_name || '',
    parent_email: user?.parent_email || '',
    parent_phone: user?.parent_phone || '',
    parent_relationship: user?.parent_relationship || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [existingAthleteProfile, setExistingAthleteProfile] = useState(null);
  const [loadingAthleteProfile, setLoadingAthleteProfile] = useState(false);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const markTouched = (key) => setTouched((current) => ({ ...current, [key]: true }));

  useEffect(() => {
    if (requestedRole && requestedRole !== selectedRole) setSelectedRole(requestedRole);
    if (!requestedRole && !selectedRole) {
      const profileRole = normalizeRequestedRole(user?.onboarding_role);
      if (profileRole) setSelectedRole(profileRole);
    }
  }, [requestedRole, selectedRole, user?.onboarding_role]);

  useEffect(() => {
    if (!user) return;
    const nextName = splitName(user);
    setForm((current) => ({
      ...current,
      first_name: current.first_name || nextName.first,
      last_name: current.last_name || nextName.last,
      phone: current.phone || user.phone || '',
      dob: current.dob || user.dob || '',
      parent_first_name: current.parent_first_name || user.parent_first_name || '',
      parent_last_name: current.parent_last_name || user.parent_last_name || '',
      parent_email: current.parent_email || user.parent_email || '',
      parent_phone: current.parent_phone || user.parent_phone || '',
      parent_relationship: current.parent_relationship || user.parent_relationship || '',
    }));
  }, [user]);

  useEffect(() => {
    if (!user?.id || selectedRole !== 'athlete') return;
    let cancelled = false;
    setLoadingAthleteProfile(true);
    athleteProfileRepo.filter({ profile_id: user.id })
      .then((profiles) => {
        if (cancelled) return;
        const profile = profiles?.[0] || null;
        setExistingAthleteProfile(profile);
        if (!profile) return;
        setForm((current) => ({
          ...current,
          first_name: current.first_name || profile.first_name || '',
          last_name: current.last_name || profile.last_name || '',
          dob: current.dob || profile.dob || '',
          sport: current.sport || firstSport(profile),
          location: current.location || profile.location_label || '',
          notes: current.notes || profile.health_notes || '',
        }));
      })
      .catch(() => {
        if (!cancelled) setExistingAthleteProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAthleteProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRole, user?.id]);

  const validationErrors = useMemo(
    () => onboardingErrors(form, selectedRole),
    [form, selectedRole],
  );
  const guardianRequired = selectedRole === 'athlete' && requiresGuardian(form.dob);
  const locationSuggestions = useMemo(() => citySuggestions(form.location, 10), [form.location]);
  const selectedRoleCard = ROLE_CARDS.find((role) => role.id === selectedRole);
  const SelectedRoleIcon = selectedRoleCard?.icon || UserRound;
  const roleLocked = Boolean(selectedRole && (requestedRole || normalizeRequestedRole(user?.onboarding_role)));
  const fromCreateAccount = params.get('from') === 'create-account';
  const reviewingSavedAthleteInfo = selectedRole === 'athlete'
    && (fromCreateAccount || !!existingAthleteProfile);
  const heading = reviewingSavedAthleteInfo ? 'Review your LevelCoach athlete account' : 'Finish your LevelCoach account';
  const introCopy = reviewingSavedAthleteInfo
    ? 'We carried over the details from account creation. Review them, fix anything that looks off, then confirm setup before legal documents and protected booking unlock.'
    : 'Choose the role for this account before entering any dashboard. This keeps OAuth and password signups on the right production path.';
  const profileStepBody = selectedRole === 'coach_applicant'
    ? 'Complete coach application'
    : selectedRole === 'organization'
      ? 'Complete organization form'
      : reviewingSavedAthleteInfo
        ? 'Review saved details'
        : 'Required fields below';
  const submitLabel = reviewingSavedAthleteInfo ? 'Confirm setup' : 'Complete setup';
  const canSave = (selectedRole === 'athlete' || selectedRole === 'parent')
    && !loadingAthleteProfile
    && Object.keys(validationErrors).length === 0;
  const fieldError = (key) => {
    const value = String(form[key] || '').trim();
    if (!validationErrors[key]) return '';
    if (submitted || touched[key] || value) return validationErrors[key];
    return '';
  };

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 pt-24 text-slate-950">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
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

  const continueSpecializedFlow = async () => {
    if (selectedRole !== 'coach_applicant' && selectedRole !== 'organization') return;
    setSaving(true);
    setError('');
    try {
      if (selectedRole === 'coach_applicant') {
        await auth.updateCurrentUser({ onboarding_role: 'coach_applicant', onboarding_status: 'incomplete' });
        await refetchUser();
        navigate('/apply/private-training-coach', { replace: true });
        return;
      }
      await auth.updateCurrentUser({ onboarding_role: 'organization', onboarding_status: 'incomplete' });
      await refetchUser();
      navigate('/create-organization', { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not save your onboarding path.');
    } finally {
      setSaving(false);
    }
  };

  const finish = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (!canSave) {
      setError('Fix the highlighted fields before completing setup.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const primarySport = normalizeSport(form.sport);
      const cityPlace = selectedRole === 'athlete' ? resolveCityPlace(form.location) : null;
      const minor = selectedRole === 'athlete' && requiresGuardian(form.dob);
      const patch = {
        role: 'user',
        onboarding_role: selectedRole,
        onboarding_status: 'complete',
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: normalizePhoneForStorage(form.phone),
        dob: form.dob || undefined,
        is_minor: minor,
        parent_first_name: minor ? form.parent_first_name.trim() : '',
        parent_last_name: minor ? form.parent_last_name.trim() : '',
        parent_email: minor ? form.parent_email.trim() : '',
        parent_phone: minor ? normalizePhoneForStorage(form.parent_phone) : '',
        parent_relationship: minor ? form.parent_relationship.trim() : '',
        profile_setup_complete: true,
        bio: selectedRole === 'athlete'
          ? [`Primary sport: ${primarySport}`, `Preferred city: ${cityPlace?.label || ''}`, form.notes.trim()].filter(Boolean).join('\n')
          : form.notes.trim(),
      };
      await auth.updateCurrentUser(patch);
      if (selectedRole === 'athlete') {
        const athleteProfilePayload = {
          profile_id: user.id,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          dob: form.dob,
          sports: [primarySport],
          skill_level: '',
          location_label: cityPlace?.label || '',
          location_lat: cityPlace?.lat,
          location_lng: cityPlace?.lng,
          health_notes: form.notes.trim(),
        };
        const savedAthleteProfile = await upsertAthleteProfile(existingAthleteProfile, athleteProfilePayload);
        setExistingAthleteProfile(savedAthleteProfile);
      }
      const fresh = await refetchUser();
      navigate(safeNext(params.get('next')) || homePathForRole(fresh), { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 pt-24 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Required Setup
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-normal sm:text-4xl">{heading}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {introCopy}
          </p>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SetupStepCard
            icon={Users}
            title="Role"
            body={selectedRole ? selectedRoleCard?.title : 'Choose account role'}
            complete={!!selectedRole}
          />
          <SetupStepCard
            icon={UserRound}
            title="Profile"
            body={profileStepBody}
            complete={false}
          />
          <SetupStepCard
            icon={FileText}
            title="Legal Packet"
            body="Required documents are shown after role setup"
            complete={false}
          />
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
                    ? 'Your coach role is not active until the application, legal packet, compliance checklist, and Stripe payout setup are complete or approved.'
                    : 'Your organization workspace is not publishable until the organization form, legal packet, admin scope, and Stripe payout setup are complete.'}
                </p>
              </div>
              <Button onClick={continueSpecializedFlow} disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
                {saving ? 'Saving...' : 'Continue'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          </div>
        )}

        {(selectedRole === 'athlete' || selectedRole === 'parent') && (
          <form onSubmit={finish} className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <datalist id="levelcoach-primary-sports">
              {SPORT_OPTIONS.map((sport) => <option key={sport} value={sport} />)}
            </datalist>
            <datalist id="levelcoach-city-options">
              {(form.location.trim() ? locationSuggestions : CITY_OPTIONS).map((place) => (
                <option key={place.label} value={place.label} />
              ))}
            </datalist>
            <datalist id="levelcoach-guardian-relationships">
              {RELATIONSHIP_OPTIONS.map((relationship) => <option key={relationship} value={relationship} />)}
            </datalist>
            {reviewingSavedAthleteInfo && (
              <div className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Saved from account creation</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      Your details are already filled in. Edit any field below if something is wrong, then confirm setup.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('first-name')?.focus()}
                    className="border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                  >
                    Edit details
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                value={form.first_name}
                onChange={(value) => updateForm('first_name', value)}
                onBlur={() => markTouched('first_name')}
                error={fieldError('first_name')}
                autoComplete="given-name"
                required
              />
              <Field
                label="Last name"
                value={form.last_name}
                onChange={(value) => updateForm('last_name', value)}
                onBlur={() => markTouched('last_name')}
                error={fieldError('last_name')}
                autoComplete="family-name"
                required
              />
              <Field
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(value) => updateForm('phone', value)}
                onBlur={() => markTouched('phone')}
                error={fieldError('phone')}
                autoComplete="tel"
                placeholder="(248) 555-0123"
                required
              />
              {selectedRole === 'athlete' && (
                <Field
                  label="Date of birth"
                  type="date"
                  value={form.dob}
                  onChange={(value) => updateForm('dob', value)}
                  onBlur={() => markTouched('dob')}
                  error={fieldError('dob')}
                  required
                />
              )}
              {selectedRole === 'athlete' && (
                <>
                  <Field
                    label="Primary sport"
                    value={form.sport}
                    onChange={(value) => updateForm('sport', value)}
                    onBlur={() => {
                      const sport = normalizeSport(form.sport);
                      if (sport) updateForm('sport', sport);
                      markTouched('sport');
                    }}
                    error={fieldError('sport')}
                    list="levelcoach-primary-sports"
                    placeholder="Select a sport"
                    required
                  />
                  <Field
                    label="Preferred training location"
                    value={form.location}
                    onChange={(value) => updateForm('location', value)}
                    onBlur={() => {
                      const city = resolveCityPlace(form.location);
                      if (city) updateForm('location', city.label);
                      markTouched('location');
                    }}
                    error={fieldError('location')}
                    list="levelcoach-city-options"
                    placeholder="Select a city"
                    required
                  />
                </>
              )}
            </div>
            {guardianRequired && (
              <section className="mt-5 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-blue-700 shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-950">Parent / Guardian information</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Required because this athlete is under 18. This contact is stored on the profile for legal packet routing and coach safety context.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Parent/guardian first name"
                    value={form.parent_first_name}
                    onChange={(value) => updateForm('parent_first_name', value)}
                    onBlur={() => markTouched('parent_first_name')}
                    error={fieldError('parent_first_name')}
                    autoComplete="given-name"
                    required
                  />
                  <Field
                    label="Parent/guardian last name"
                    value={form.parent_last_name}
                    onChange={(value) => updateForm('parent_last_name', value)}
                    onBlur={() => markTouched('parent_last_name')}
                    error={fieldError('parent_last_name')}
                    autoComplete="family-name"
                    required
                  />
                  <Field
                    label="Parent/guardian email"
                    type="email"
                    value={form.parent_email}
                    onChange={(value) => updateForm('parent_email', value)}
                    onBlur={() => markTouched('parent_email')}
                    error={fieldError('parent_email')}
                    autoComplete="email"
                    placeholder="parent@example.com"
                    required
                  />
                  <Field
                    label="Parent/guardian phone"
                    type="tel"
                    value={form.parent_phone}
                    onChange={(value) => updateForm('parent_phone', value)}
                    onBlur={() => markTouched('parent_phone')}
                    error={fieldError('parent_phone')}
                    autoComplete="tel"
                    placeholder="(248) 555-0123"
                    required
                  />
                  <Field
                    label="Relationship"
                    value={form.parent_relationship}
                    onChange={(value) => updateForm('parent_relationship', value)}
                    onBlur={() => markTouched('parent_relationship')}
                    error={fieldError('parent_relationship')}
                    list="levelcoach-guardian-relationships"
                    placeholder="Parent, guardian, family member"
                    required
                  />
                </div>
              </section>
            )}
            <div className="mt-4">
              <Label className="text-sm font-bold text-slate-900">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                className="mt-1 border-slate-300 bg-white text-slate-950"
                rows={3}
                placeholder={selectedRole === 'athlete' ? 'Anything coaches should know?' : 'Optional household or support notes'}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">After setup, the required legal packet appears before protected booking and portal actions.</p>
              <Button type="submit" disabled={!canSave || saving} className="bg-blue-600 text-white hover:bg-blue-700">
                {saving ? 'Saving...' : submitLabel}
              </Button>
            </div>
            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          </form>
        )}
      </div>
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

function SetupStepCard({ icon: Icon, title, body, complete }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Icon className="h-5 w-5 text-blue-600" />
        {complete && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{body}</p>
    </div>
  );
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
