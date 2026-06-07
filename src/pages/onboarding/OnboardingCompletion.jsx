import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Briefcase, CheckCircle2, FileText, ShieldCheck, UserRound, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (requestedRole && requestedRole !== selectedRole) setSelectedRole(requestedRole);
  }, [requestedRole, selectedRole]);

  useEffect(() => {
    if (!user) return;
    const nextName = splitName(user);
    setForm((current) => ({
      ...current,
      first_name: current.first_name || nextName.first,
      last_name: current.last_name || nextName.last,
      phone: current.phone || user.phone || '',
      dob: current.dob || user.dob || '',
    }));
  }, [user]);

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

  const canSave = selectedRole === 'athlete'
    ? form.first_name.trim() && form.last_name.trim() && form.phone.trim() && form.dob && form.sport.trim()
    : selectedRole === 'parent'
      ? form.first_name.trim() && form.last_name.trim() && form.phone.trim()
      : false;

  const finish = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const patch = {
        role: 'user',
        onboarding_role: selectedRole,
        onboarding_status: 'complete',
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        dob: form.dob || undefined,
        profile_setup_complete: true,
        bio: selectedRole === 'athlete'
          ? [`Sport: ${form.sport.trim()}`, form.location.trim() ? `Preferred location: ${form.location.trim()}` : '', form.notes.trim()].filter(Boolean).join('\n')
          : form.notes.trim(),
      };
      await auth.updateCurrentUser(patch);
      if (selectedRole === 'athlete') {
        await athleteProfileRepo.create({
          profile_id: user.id,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          dob: form.dob,
          sports: [form.sport.trim()],
          skill_level: '',
          location_label: form.location.trim(),
          health_notes: form.notes.trim(),
        }).catch(() => {});
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
          <h1 className="mt-4 text-3xl font-extrabold tracking-normal sm:text-4xl">Finish your LevelCoach account</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Choose the role for this account before entering any dashboard. This keeps OAuth and password signups on the right production path.
          </p>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <SetupStepCard
            icon={Users}
            title="Role"
            body={selectedRole ? ROLE_CARDS.find((role) => role.id === selectedRole)?.title : 'Choose account role'}
            complete={!!selectedRole}
          />
          <SetupStepCard
            icon={UserRound}
            title="Profile"
            body={selectedRole === 'coach_applicant' ? 'Complete coach application' : selectedRole === 'organization' ? 'Complete organization form' : 'Required fields below'}
            complete={false}
          />
          <SetupStepCard
            icon={FileText}
            title="Legal Packet"
            body="Required documents are shown after role setup"
            complete={false}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {ROLE_CARDS.map((role) => (
            <RoleCard key={role.id} role={role} selected={selectedRole === role.id} onChoose={chooseRole} />
          ))}
        </div>

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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={form.first_name} onChange={(value) => updateForm('first_name', value)} required />
              <Field label="Last name" value={form.last_name} onChange={(value) => updateForm('last_name', value)} required />
              <Field label="Phone" value={form.phone} onChange={(value) => updateForm('phone', value)} required />
              {selectedRole === 'athlete' && (
                <Field label="Date of birth" type="date" value={form.dob} onChange={(value) => updateForm('dob', value)} required />
              )}
              {selectedRole === 'athlete' && (
                <>
                  <Field label="Primary sport" value={form.sport} onChange={(value) => updateForm('sport', value)} required />
                  <Field label="Preferred training location" value={form.location} onChange={(value) => updateForm('location', value)} />
                </>
              )}
            </div>
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
                {saving ? 'Saving...' : 'Complete setup'}
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

function Field({ label, value, onChange, type = 'text', required = false }) {
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
        className="mt-1 border-slate-300 bg-white text-slate-950"
        required={required}
      />
    </div>
  );
}
