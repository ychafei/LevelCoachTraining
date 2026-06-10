import React from 'react';
import { HeartPulse, ShieldCheck } from 'lucide-react';
import {
  AVAILABILITY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  SPORT_SELECT_OPTIONS,
  levelsForSport,
  positionsForSport,
  validatePersonName,
  validatePhone,
  validateEmail,
  validateSportKey,
} from '@/lib/athleteOnboardingFields';

// ---------------------------------------------------------------------------
// Shared field primitives (light theme — used on the white signup/onboarding
// surfaces). Each control carries an explicit label + error wiring.
// ---------------------------------------------------------------------------

function FieldShell({ id, label, required, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-950">
        {label}
        {required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">{error}</p>}
    </div>
  );
}

const inputClass = (error) =>
  `h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
  }`;

export function SelectInput({ id, label, required, error, hint, value, onChange, disabled, children }) {
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        className={`${inputClass(error)} appearance-none pr-8`}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextInput({ id, label, required, error, hint, value, onChange, ...props }) {
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
        className={inputClass(error)}
        {...props}
      />
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Athlete sport details: sport (catalog) + position/event + level +
// availability preferences. `value` keys: sportKey, position, level,
// availability (array).
// ---------------------------------------------------------------------------

export function AthleteSportFields({ value, onChange, errors = {}, disabled = false, idPrefix = 'athlete' }) {
  const positions = positionsForSport(value.sportKey);
  const levels = levelsForSport(value.sportKey);

  const setSport = (sportKey) => {
    // Reset sport-dependent selections when the sport changes.
    onChange({ ...value, sportKey, position: '', level: '' });
  };

  const toggleAvailability = (slot) => {
    const current = Array.isArray(value.availability) ? value.availability : [];
    const next = current.includes(slot)
      ? current.filter((item) => item !== slot)
      : [...current, slot];
    onChange({ ...value, availability: next });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectInput
          id={`${idPrefix}-sport`}
          label="Primary sport"
          required
          error={errors.sportKey}
          value={value.sportKey}
          onChange={setSport}
          disabled={disabled}
        >
          <option value="">Select a sport</option>
          {SPORT_SELECT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectInput>

        {positions.length > 0 && (
          <SelectInput
            id={`${idPrefix}-position`}
            label="Position / event"
            required
            error={errors.position}
            value={value.position}
            onChange={(position) => onChange({ ...value, position })}
            disabled={disabled}
          >
            <option value="">Select position or event</option>
            {positions.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </SelectInput>
        )}

        <SelectInput
          id={`${idPrefix}-level`}
          label="Current level"
          required
          error={errors.level}
          value={value.level}
          onChange={(level) => onChange({ ...value, level })}
          disabled={disabled || !value.sportKey}
          hint={!value.sportKey ? 'Pick a sport first.' : undefined}
        >
          <option value="">Select level</option>
          {levels.map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </SelectInput>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold text-slate-950">
          Availability preferences<span aria-hidden="true" className="text-red-600"> *</span>
        </legend>
        <p className="mb-2 text-xs leading-5 text-slate-500">When do sessions usually work for you? Pick all that apply.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AVAILABILITY_OPTIONS.map((slot) => {
            const selected = (value.availability || []).includes(slot);
            return (
              <label
                key={slot}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold transition ${
                  selected
                    ? 'border-blue-300 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleAvailability(slot)}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600 focus:ring-blue-500"
                />
                {slot}
              </label>
            );
          })}
        </div>
        {errors.availability && (
          <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">{errors.availability}</p>
        )}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health notes (optional, private) + emergency contact.
// `value` keys: healthNotes, emergencyName, emergencyPhone,
// emergencyRelationship.
// ---------------------------------------------------------------------------

export function HealthAndEmergencyFields({ value, onChange, errors = {}, disabled = false, idPrefix = 'athlete' }) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-health-notes`} className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-950">
          <HeartPulse className="h-4 w-4 text-blue-700" aria-hidden="true" />
          Health notes <span className="text-xs font-semibold text-slate-500">(optional, kept private)</span>
        </label>
        <textarea
          id={`${idPrefix}-health-notes`}
          rows={3}
          value={value.healthNotes}
          onChange={(event) => onChange({ ...value, healthNotes: event.target.value })}
          disabled={disabled}
          placeholder="Allergies, injuries, conditions, or anything a coach should know before training."
          className={`w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            errors.healthNotes
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
        />
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Only visible on your private profile — never shown publicly.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-950">
          Emergency contact<span aria-hidden="true" className="text-red-600"> *</span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            id={`${idPrefix}-emergency-name`}
            label="Name"
            required
            error={errors.emergencyName}
            value={value.emergencyName}
            onChange={(emergencyName) => onChange({ ...value, emergencyName })}
            disabled={disabled}
            placeholder="Full name"
            autoComplete="off"
          />
          <TextInput
            id={`${idPrefix}-emergency-phone`}
            label="Phone"
            required
            type="tel"
            error={errors.emergencyPhone}
            value={value.emergencyPhone}
            onChange={(emergencyPhone) => onChange({ ...value, emergencyPhone })}
            disabled={disabled}
            placeholder="(248) 555-0123"
            autoComplete="off"
          />
          <TextInput
            id={`${idPrefix}-emergency-relationship`}
            label="Relationship"
            error={errors.emergencyRelationship}
            value={value.emergencyRelationship}
            onChange={(emergencyRelationship) => onChange({ ...value, emergencyRelationship })}
            disabled={disabled}
            placeholder="Parent, spouse, friend…"
            list={`${idPrefix}-emergency-relationship-options`}
          />
        </div>
        <datalist id={`${idPrefix}-emergency-relationship-options`}>
          {RELATIONSHIP_OPTIONS.map((relationship) => <option key={relationship} value={relationship} />)}
        </datalist>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guardian contact block for minor athletes, including the required copy
// about parent-managed bookings and payments.
// `value` keys: parentFirstName, parentLastName, parentEmail, parentPhone,
// parentRelationship.
// ---------------------------------------------------------------------------

export function GuardianContactFields({ value, onChange, errors = {}, disabled = false, idPrefix = 'guardian' }) {
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4" aria-labelledby={`${idPrefix}-heading`}>
      <datalist id={`${idPrefix}-relationship-options`}>
        {RELATIONSHIP_OPTIONS.map((relationship) => <option key={relationship} value={relationship} />)}
      </datalist>
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-blue-700 shadow-sm">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id={`${idPrefix}-heading`} className="text-sm font-extrabold text-slate-950">
            Parent / guardian information (required for athletes under 18)
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Because this athlete is a minor, a parent or guardian account must manage bookings, payments,
            and legal documents. Your guardian will sign the required waivers from their own parent account
            before sessions can be booked.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput
          id={`${idPrefix}-first-name`}
          label="Guardian first name"
          required
          error={errors.parentFirstName}
          value={value.parentFirstName}
          onChange={(parentFirstName) => onChange({ ...value, parentFirstName })}
          disabled={disabled}
          placeholder="First name"
        />
        <TextInput
          id={`${idPrefix}-last-name`}
          label="Guardian last name"
          required
          error={errors.parentLastName}
          value={value.parentLastName}
          onChange={(parentLastName) => onChange({ ...value, parentLastName })}
          disabled={disabled}
          placeholder="Last name"
        />
        <TextInput
          id={`${idPrefix}-email`}
          label="Guardian email"
          required
          type="email"
          error={errors.parentEmail}
          value={value.parentEmail}
          onChange={(parentEmail) => onChange({ ...value, parentEmail })}
          disabled={disabled}
          placeholder="parent@example.com"
        />
        <TextInput
          id={`${idPrefix}-phone`}
          label="Guardian phone"
          required
          type="tel"
          error={errors.parentPhone}
          value={value.parentPhone}
          onChange={(parentPhone) => onChange({ ...value, parentPhone })}
          disabled={disabled}
          placeholder="(248) 555-0123"
        />
      </div>
      <div className="mt-3">
        <TextInput
          id={`${idPrefix}-relationship`}
          label="Relationship to athlete"
          required
          error={errors.parentRelationship}
          value={value.parentRelationship}
          onChange={(parentRelationship) => onChange({ ...value, parentRelationship })}
          disabled={disabled}
          placeholder="Parent, guardian, family member"
          list={`${idPrefix}-relationship-options`}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Validation helpers shared by the signup form and onboarding completion.
// ---------------------------------------------------------------------------

export function validateAthleteDetails(value) {
  const errors = {};
  const sportError = validateSportKey(value.sportKey);
  if (sportError) errors.sportKey = sportError;
  if (value.sportKey && positionsForSport(value.sportKey).length > 0 && !String(value.position || '').trim()) {
    errors.position = 'Select the position or event you train for.';
  }
  if (!String(value.level || '').trim()) errors.level = 'Select your current level.';
  if (!Array.isArray(value.availability) || value.availability.length === 0) {
    errors.availability = 'Pick at least one availability window.';
  }
  const emergencyNameError = validatePersonName(value.emergencyName, 'Emergency contact name');
  if (emergencyNameError) errors.emergencyName = emergencyNameError;
  const emergencyPhoneError = validatePhone(value.emergencyPhone, 'Emergency contact phone');
  if (emergencyPhoneError) errors.emergencyPhone = emergencyPhoneError;
  return errors;
}

export function validateGuardianContact(value) {
  const errors = {};
  const firstError = validatePersonName(value.parentFirstName, 'Guardian first name');
  const lastError = validatePersonName(value.parentLastName, 'Guardian last name');
  const emailError = validateEmail(value.parentEmail, 'Guardian email');
  const phoneError = validatePhone(value.parentPhone, 'Guardian phone');
  if (firstError) errors.parentFirstName = firstError;
  if (lastError) errors.parentLastName = lastError;
  if (emailError) errors.parentEmail = emailError;
  if (phoneError) errors.parentPhone = phoneError;
  if (!String(value.parentRelationship || '').trim()) errors.parentRelationship = 'Relationship is required.';
  return errors;
}
