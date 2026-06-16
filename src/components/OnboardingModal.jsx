import React, { useState } from 'react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Lightweight profile-gate modal (used by the booking flow when a signed-in
// user has not finished profile setup). Sport-specific fields live in the full
// onboarding flow (/onboarding) — this only collects the universal minimum.
// All writes go through the accountProfile.update whitelist; is_minor is
// recomputed server-side from dob.

const cleanPhone = (val) => val.replace(/\D/g, '');
const isValidPhone = (val) => cleanPhone(val).length === 10;
const hasNumbers = (val) => /\d/.test(val);

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

export default function OnboardingModal({ user, onComplete }) {
  // Derive initial first/last from existing data: explicit fields first, else split full_name
  const derivedFirst = user?.first_name || user?.full_name?.trim().split(/\s+/)[0] || '';
  const derivedLast = user?.last_name || user?.full_name?.trim().split(/\s+/).slice(1).join(' ') || '';
  const notificationPrefs = parseNotificationPrefs(user?.notification_prefs);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: derivedFirst,
    last_name: derivedLast,
    phone: user?.phone || '',
    dob: user?.dob ? String(user.dob).slice(0, 10) : '',
    parent_first_name: user?.parent_first_name || '',
    parent_last_name: user?.parent_last_name || '',
    parent_phone: user?.parent_phone || '',
    parent_relationship: user?.parent_relationship || '',
    agreed_to_terms: false,
    marketing_sms_consent: notificationPrefs.marketing_sms === true,
    media_release_consent: user?.media_release_accepted === true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const age = form.dob ? Math.floor((Date.now() - new Date(form.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const isUnder18 = age !== null && age < 18;

  const totalSteps = isUnder18 ? 3 : 2;

  const phoneValid = isValidPhone(form.phone);
  const firstNameOk = form.first_name.trim().length > 0 && !hasNumbers(form.first_name);
  const lastNameOk = form.last_name.trim().length > 0 && !hasNumbers(form.last_name);
  const canProceedStep1 = firstNameOk && lastNameOk && form.phone && form.dob && phoneValid;

  const parentFirstOk = form.parent_first_name.trim().length > 0 && !hasNumbers(form.parent_first_name);
  const parentLastOk = form.parent_last_name.trim().length > 0 && !hasNumbers(form.parent_last_name);
  const parentPhoneOk = isValidPhone(form.parent_phone);
  const parentRelationshipOk = form.parent_relationship.trim().length > 0;
  const canProceedStep2 = isUnder18
    ? (parentFirstOk && parentLastOk && parentPhoneOk && parentRelationshipOk)
    : form.agreed_to_terms;
  const canFinish = form.agreed_to_terms;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await auth.updateCurrentUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: cleanPhone(form.phone),
        dob: form.dob,
        parent_first_name: isUnder18 ? form.parent_first_name.trim() : '',
        parent_last_name: isUnder18 ? form.parent_last_name.trim() : '',
        parent_phone: isUnder18 ? cleanPhone(form.parent_phone) : '',
        parent_relationship: isUnder18 ? form.parent_relationship.trim() : '',
        terms_accepted: true,
        media_release_accepted: form.media_release_consent === true,
        notification_prefs: notificationPrefsWithMarketingSms(user?.notification_prefs, form.marketing_sms_consent),
        profile_setup_complete: true,
      });
      onComplete();
    } catch (err) {
      setError(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-foreground">Welcome to LevelCoach Training</h2>
          <p className="text-muted-foreground text-sm mt-1">Step {step} of {totalSteps} — Let's set up your profile</p>
          <div className="flex gap-1 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-border'}`} />
            ))}
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="onboarding-first-name">First name <span className="text-destructive">*</span></Label>
                <Input
                  id="onboarding-first-name"
                  value={form.first_name}
                  onChange={e => setForm({ ...form, first_name: e.target.value })}
                  placeholder="First name"
                  className="mt-1"
                />
                {form.first_name && hasNumbers(form.first_name) && (
                  <p className="text-xs text-destructive mt-1">No numbers allowed</p>
                )}
              </div>
              <div>
                <Label htmlFor="onboarding-last-name">Last name <span className="text-destructive">*</span></Label>
                <Input
                  id="onboarding-last-name"
                  value={form.last_name}
                  onChange={e => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Last name"
                  className="mt-1"
                />
                {form.last_name && hasNumbers(form.last_name) && (
                  <p className="text-xs text-destructive mt-1">No numbers allowed</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="onboarding-phone">Phone number <span className="text-destructive">*</span></Label>
              <Input
                id="onboarding-phone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 000-0000"
                className="mt-1"
              />
              {form.phone && !phoneValid && (
                <p className="text-xs text-destructive mt-1">Must be a 10-digit phone number</p>
              )}
            </div>
            <div>
              <Label htmlFor="onboarding-dob">Date of birth <span className="text-destructive">*</span></Label>
              <Input id="onboarding-dob" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="mt-1" />
            </div>
            <Button
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Guardian Info (under 18) */}
        {step === 2 && isUnder18 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Since you're under 18, we need a parent or guardian's information. Your parent or
              guardian manages bookings, payments, and legal documents from their own parent account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="onboarding-parent-first-name">Parent first name <span className="text-destructive">*</span></Label>
                <Input
                  id="onboarding-parent-first-name"
                  value={form.parent_first_name}
                  onChange={e => setForm({ ...form, parent_first_name: e.target.value })}
                  placeholder="First name"
                  className="mt-1"
                />
                {form.parent_first_name && hasNumbers(form.parent_first_name) && (
                  <p className="text-xs text-destructive mt-1">No numbers allowed</p>
                )}
              </div>
              <div>
                <Label htmlFor="onboarding-parent-last-name">Parent last name <span className="text-destructive">*</span></Label>
                <Input
                  id="onboarding-parent-last-name"
                  value={form.parent_last_name}
                  onChange={e => setForm({ ...form, parent_last_name: e.target.value })}
                  placeholder="Last name"
                  className="mt-1"
                />
                {form.parent_last_name && hasNumbers(form.parent_last_name) && (
                  <p className="text-xs text-destructive mt-1">No numbers allowed</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="onboarding-parent-phone">Parent phone <span className="text-destructive">*</span></Label>
              <Input
                id="onboarding-parent-phone"
                value={form.parent_phone}
                onChange={e => setForm({ ...form, parent_phone: e.target.value })}
                placeholder="(555) 000-0000"
                className="mt-1"
              />
              {form.parent_phone && !isValidPhone(form.parent_phone) && (
                <p className="text-xs text-destructive mt-1">Must be a 10-digit phone number</p>
              )}
            </div>
            <div>
              <Label htmlFor="onboarding-parent-relationship">Relationship <span className="text-destructive">*</span></Label>
              <Input
                id="onboarding-parent-relationship"
                value={form.parent_relationship}
                onChange={e => setForm({ ...form, parent_relationship: e.target.value })}
                placeholder="Parent, guardian, family member"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button
                disabled={!canProceedStep2}
                onClick={() => setStep(3)}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Terms step */}
        {((step === 2 && !isUnder18) || (step === 3 && isUnder18)) && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please read and agree to the required account terms before getting started.</p>
            <div className="bg-secondary rounded-md p-3 text-xs text-muted-foreground max-h-40 overflow-y-auto leading-relaxed">
              By using LevelCoach Training, you agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">Universal Account Terms, Privacy Notice, and Electronic Signature Consent</a>, including the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">Privacy Notice</a>. Sessions are subject to cancellation policies. All communications are monitored for safety.
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="terms"
                checked={form.agreed_to_terms}
                onCheckedChange={v => setForm({ ...form, agreed_to_terms: !!v })}
              />
              <Label htmlFor="terms" className="cursor-pointer text-sm">I agree to the Universal Account Terms, Privacy Notice, and Electronic Signature Consent</Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="marketing-sms"
                checked={form.marketing_sms_consent}
                onCheckedChange={v => setForm({ ...form, marketing_sms_consent: !!v })}
              />
              <Label htmlFor="marketing-sms" className="cursor-pointer text-sm leading-5">
                OPTIONAL: I consent to recurring marketing SMS/text messages. Consent is not a condition of purchase or use.
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="media-release"
                checked={form.media_release_consent}
                onCheckedChange={v => setForm({ ...form, media_release_consent: !!v })}
              />
              <Label htmlFor="media-release" className="cursor-pointer text-sm leading-5">
                OPTIONAL: I authorize LevelCoach to use approved photos, videos, image, likeness, testimonials, training content, and session media for LevelCoach marketing.
              </Label>
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">Back</Button>
              <Button
                disabled={!canFinish || saving}
                onClick={handleSave}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
              >
                {saving ? 'Saving...' : 'Get started'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
