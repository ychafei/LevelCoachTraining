import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Plus, ShieldCheck, UserRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { callFn } from '@/lib/rpc';
import { Button } from '@/components/ui/button';
import {
  SPORT_SELECT_OPTIONS,
  RELATIONSHIP_OPTIONS,
  levelsForSport,
  normalizePhoneForStorage,
  positionsForSport,
  sportLabelForKey,
  validateDob,
  validateEmail,
  validatePersonName,
  validatePhone,
} from '@/lib/athleteOnboardingFields';
import { SelectInput, TextInput } from '@/features/onboarding/AthleteFields';

const PERMISSIONS = [
  { key: 'can_book', label: 'Can request bookings' },
  { key: 'can_pay', label: 'Can use family payments' },
  { key: 'can_message', label: 'Can message coaches' },
];

const EMPTY_CHILD = {
  firstName: '',
  lastName: '',
  preferredName: '',
  dob: '',
  sportKey: '',
  level: '',
  position: '',
  trainingGoal: '',
  locationLabel: '',
  relationship: 'Parent',
  emergencyName: '',
  emergencyPhone: '',
  healthNotes: '',
  createLogin: false,
  childEmail: '',
  childPassword: '',
};

function childAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

/**
 * Parent onboarding: "add your athletes". Every write goes through the
 * `family` Appwrite Function (addChild / setPermissions) — athlete_profiles
 * and guardian_athletes are server-only writable.
 */
export default function ParentAthletesStep({ onFamilyChange = null, autoOpenForm = true }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [children, setChildren] = useState([]);
  const [links, setLinks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_CHILD);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState('');

  const loadFamily = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await callFn('family', { action: 'listFamily' });
      const allChildren = [...(data?.children || []), ...(data?.linked_athletes || [])];
      setChildren(allChildren);
      setLinks(data?.links || []);
      onFamilyChange?.(allChildren);
      if (autoOpenForm && allChildren.length === 0) setShowForm(true);
    } catch (err) {
      setLoadError(err?.message || 'Could not load your athletes.');
    } finally {
      setLoading(false);
    }
  }, [onFamilyChange, autoOpenForm]);

  useEffect(() => { void loadFamily(); }, [loadFamily]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    const firstError = validatePersonName(form.firstName, 'First name');
    const lastError = validatePersonName(form.lastName, 'Last name');
    const dobError = validateDob(form.dob);
    if (firstError) next.firstName = firstError;
    if (lastError) next.lastName = lastError;
    if (dobError) next.dob = dobError;
    if (!form.relationship) next.relationship = 'Select your relationship.';
    if (!form.sportKey) next.sportKey = 'Select a sport.';
    if (!form.level) next.level = 'Select the athlete level.';
    if (!form.trainingGoal.trim()) next.trainingGoal = 'Add one training goal or focus area.';
    if (!form.emergencyName.trim()) {
      next.emergencyName = 'Emergency contact name is required.';
    }
    const phoneError = validatePhone(form.emergencyPhone, 'Emergency contact phone');
    if (phoneError) next.emergencyPhone = phoneError;
    if (form.createLogin) {
      const age = childAge(form.dob);
      if (age !== null && age < 13) {
        next.createLogin = 'Player logins are available for athletes 13 or older.';
      }
      const emailError = validateEmail(form.childEmail, 'Player email');
      if (emailError) next.childEmail = emailError;
      if (form.childPassword.length < 8) {
        next.childPassword = 'Use at least 8 characters.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const addChild = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const emergencyContact = form.emergencyName.trim()
        ? {
          name: form.emergencyName.trim(),
          phone: normalizePhoneForStorage(form.emergencyPhone),
        }
        : undefined;
      await callFn('family', {
        action: 'addChild',
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        preferred_name: form.preferredName.trim(),
        dob: form.dob,
        sports: form.sportKey ? [sportLabelForKey(form.sportKey)] : [],
        skill_level: form.level,
        sport_position: form.position.trim(),
        training_goals: form.trainingGoal.trim(),
        location_label: form.locationLabel.trim(),
        relationship: form.relationship || 'Parent',
        health_notes: form.healthNotes.trim(),
        create_child_account: form.createLogin === true,
        child_email: form.createLogin ? form.childEmail.trim() : '',
        child_password: form.createLogin ? form.childPassword : '',
        ...(emergencyContact ? { emergency_contact: emergencyContact } : {}),
      });
      toast.success(`${form.firstName.trim()} added to your family`);
      setForm(EMPTY_CHILD);
      setShowForm(false);
      await loadFamily();
    } catch (err) {
      toast.error(err?.message || 'Could not add this athlete.');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = async (athleteId, key, value) => {
    setPermissionSaving(`${athleteId}:${key}`);
    try {
      await callFn('family', { action: 'setPermissions', athlete_id: athleteId, [key]: value });
      setLinks((current) => current.map((link) => (
        link.athlete_id === athleteId ? { ...link, [key]: value } : link
      )));
    } catch (err) {
      toast.error(err?.message || 'Could not update permissions.');
    } finally {
      setPermissionSaving('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your athletes">
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{loadError}</p>
      )}

      {children.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <Users className="mx-auto h-8 w-8 text-blue-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-slate-900">No athletes yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-600">
            Add each child athlete you manage. You'll book sessions, approve payments, and sign
            their legal documents from this family account.
          </p>
          <Button type="button" onClick={() => setShowForm(true)} className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="mr-1.5 h-4 w-4" /> Add your first athlete
          </Button>
        </div>
      )}

      {children.map((child) => {
        const link = links.find((row) => row.athlete_id === child.$id);
        const age = childAge(child.dob);
        const displayName = [child.preferred_name || child.first_name, child.last_name].filter(Boolean).join(' ');
        return (
          <div key={child.$id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-slate-950">
                    {displayName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {[
                      age !== null ? `Age ${age}` : '',
                      Array.isArray(child.sports) ? child.sports.join(', ') : '',
                      child.skill_level || '',
                      child.sport_position || '',
                    ].filter(Boolean).join(' · ') || 'Profile saved'}
                  </p>
                  {child.training_goals && (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Goal: {child.training_goals}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {child.profile_id && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                    Player login enabled
                  </span>
                )}
                {link && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Linked to you
                  </span>
                )}
              </div>
            </div>

            {link && (
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
                {PERMISSIONS.map((permission) => (
                  <label key={permission.key} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={link[permission.key] !== false}
                      disabled={permissionSaving === `${child.$id}:${permission.key}`}
                      onChange={(event) => togglePermission(child.$id, permission.key, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600 focus:ring-blue-500"
                    />
                    {permission.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <form onSubmit={addChild} className="rounded-lg border border-blue-100 bg-blue-50/40 p-4" noValidate>
          <h3 className="text-sm font-extrabold text-slate-950">Add an athlete</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              id="child-first-name"
              label="First name"
              required
              error={errors.firstName}
              value={form.firstName}
              onChange={(value) => updateForm('firstName', value)}
              disabled={saving}
              placeholder="First name"
            />
            <TextInput
              id="child-last-name"
              label="Last name"
              required
              error={errors.lastName}
              value={form.lastName}
              onChange={(value) => updateForm('lastName', value)}
              disabled={saving}
              placeholder="Last name"
            />
            <TextInput
              id="child-preferred-name"
              label="Preferred name"
              error={errors.preferredName}
              value={form.preferredName}
              onChange={(value) => updateForm('preferredName', value)}
              disabled={saving}
              placeholder="What coaches should call them"
            />
            <TextInput
              id="child-dob"
              label="Date of birth"
              required
              type="date"
              error={errors.dob}
              value={form.dob}
              onChange={(value) => updateForm('dob', value)}
              disabled={saving}
            />
            <SelectInput
              id="child-relationship"
              label="Your relationship"
              required
              error={errors.relationship}
              value={form.relationship}
              onChange={(value) => updateForm('relationship', value)}
              disabled={saving}
            >
              {RELATIONSHIP_OPTIONS.map((relationship) => (
                <option key={relationship} value={relationship}>{relationship}</option>
              ))}
            </SelectInput>
            <SelectInput
              id="child-sport"
              label="Primary sport"
              required
              error={errors.sportKey}
              value={form.sportKey}
              onChange={(value) => {
                setForm((current) => ({ ...current, sportKey: value, level: '', position: '' }));
                setErrors((current) => ({ ...current, sportKey: undefined, level: undefined, position: undefined }));
              }}
              disabled={saving}
            >
              <option value="">Select a sport</option>
              {SPORT_SELECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
            <SelectInput
              id="child-level"
              label="Current level"
              error={errors.level}
              value={form.level}
              onChange={(value) => updateForm('level', value)}
              disabled={saving || !form.sportKey}
              hint={!form.sportKey ? 'Pick a sport first.' : undefined}
            >
              <option value="">Select level</option>
              {levelsForSport(form.sportKey).map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </SelectInput>
            <SelectInput
              id="child-position"
              label="Position or focus"
              error={errors.position}
              value={form.position}
              onChange={(value) => updateForm('position', value)}
              disabled={saving || !form.sportKey}
              hint={!form.sportKey ? 'Pick a sport first.' : undefined}
            >
              <option value="">Select if known</option>
              {positionsForSport(form.sportKey).map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </SelectInput>
            <TextInput
              id="child-location"
              label="Training area"
              error={errors.locationLabel}
              value={form.locationLabel}
              onChange={(value) => updateForm('locationLabel', value)}
              disabled={saving}
              placeholder="City, school, or flexible"
            />
            <TextInput
              id="child-emergency-name"
              label="Emergency contact name"
              required
              error={errors.emergencyName}
              value={form.emergencyName}
              onChange={(value) => updateForm('emergencyName', value)}
              disabled={saving}
              placeholder="Defaults to you"
            />
            <TextInput
              id="child-emergency-phone"
              label="Emergency contact phone"
              required
              type="tel"
              error={errors.emergencyPhone}
              value={form.emergencyPhone}
              onChange={(value) => updateForm('emergencyPhone', value)}
              disabled={saving}
              placeholder="(248) 555-0123"
            />
          </div>
          <div className="mt-3">
            <label htmlFor="child-training-goal" className="mb-1.5 block text-sm font-bold text-slate-950">
              Training goal <span aria-hidden="true" className="text-red-600">*</span>
            </label>
            <textarea
              id="child-training-goal"
              rows={2}
              value={form.trainingGoal}
              onChange={(event) => updateForm('trainingGoal', event.target.value)}
              disabled={saving}
              placeholder="Example: improve ball control, confidence, speed, conditioning, or game IQ."
              aria-invalid={errors.trainingGoal ? 'true' : undefined}
              className={`w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 ${
                errors.trainingGoal
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
              }`}
            />
            {errors.trainingGoal && <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">{errors.trainingGoal}</p>}
          </div>
          <div className="mt-3">
            <label htmlFor="child-health-notes" className="mb-1.5 block text-sm font-bold text-slate-950">
              Health notes <span className="text-xs font-semibold text-slate-500">(optional, kept private)</span>
            </label>
            <textarea
              id="child-health-notes"
              rows={2}
              value={form.healthNotes}
              onChange={(event) => updateForm('healthNotes', event.target.value)}
              disabled={saving}
              placeholder="Allergies, injuries, or anything a coach should know."
              className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.createLogin === true}
                disabled={saving}
                onChange={(event) => updateForm('createLogin', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-extrabold text-slate-950">Create a player login</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Optional for athletes 13 or older. They can view their training schedule and progress, while you keep booking, payment, and legal control.
                </span>
              </span>
            </label>
            {errors.createLogin && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{errors.createLogin}</p>}
            {form.createLogin && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput
                  id="child-login-email"
                  label="Player email"
                  required
                  type="email"
                  error={errors.childEmail}
                  value={form.childEmail}
                  onChange={(value) => updateForm('childEmail', value)}
                  disabled={saving}
                  placeholder="player@example.com"
                />
                <TextInput
                  id="child-login-password"
                  label="Player password"
                  required
                  type="password"
                  error={errors.childPassword}
                  value={form.childPassword}
                  onChange={(value) => updateForm('childPassword', value)}
                  disabled={saving}
                  placeholder="At least 8 characters"
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowForm(false); setErrors({}); }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
              <CalendarCheck className="mr-1.5 h-4 w-4" />
              {saving ? 'Adding…' : 'Add athlete'}
            </Button>
          </div>
        </form>
      ) : (
        children.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setShowForm(true)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Plus className="mr-1.5 h-4 w-4" /> Add another athlete
          </Button>
        )
      )}
    </div>
  );
}
