import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { callFn } from '@/lib/rpc';
import { useAuth } from '@/lib/AuthContext';
import { SPORT_SELECT_OPTIONS, EMAIL_RE } from '@/lib/athleteOnboardingFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Clock3, Mail, MapPin, Rocket } from 'lucide-react';
import USLocationFields from '@/components/forms/USLocationFields';

export function WhatHappensNext({ heading = 'What happens next' }) {
  const steps = [
    {
      icon: Clock3,
      title: '1. Review',
      body: 'Our team reviews every application — background, credentials, and sports coverage.',
    },
    {
      icon: Mail,
      title: '2. Approval email',
      body: "If approved, you'll get an email at the address you applied with. Sign in with that same email to continue.",
    },
    {
      icon: Rocket,
      title: '3. Onboarding',
      body: 'Complete your coach profile, sign the coach legal packet, set availability, and connect payouts before going live.',
    },
  ];
  return (
    <div className="mt-8 text-left">
      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{heading}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="rounded-lg border border-border bg-card p-4">
            <step.icon className="h-5 w-5 text-accent" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-foreground">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Unified LevelCoach application form. Submits through the `applications`
 * Appwrite Function (anonymous-capable, rate-limited, honeypot-protected) —
 * never writes to the coach_applications collection directly.
 */
export function ApplicationForm({
  title,
  subtitle,
  promptLabel,
  promptPlaceholder,
  successMessage = 'Thank you for your interest. We review every application and follow up by email.',
}) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: user?.email || '',
    phone: '',
    dob: '',
    county: '',
    location: { city: '', state: '', zip: '', county: '', lat: undefined, lng: undefined },
    credentials: '',
    coaching_background: '',
    resume_url: '',
    background_check_consent: false,
    website: '', // honeypot — hidden from real users
  });
  const [sports, setSports] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Merge the changed subset from USLocationFields; mirror the picked county
  // into `county` so the service_county payload is unchanged.
  const updateLocation = (patch) => {
    setForm((current) => ({
      ...current,
      location: { ...current.location, ...patch },
      ...(patch.county !== undefined ? { county: patch.county || '' } : {}),
    }));
    setErrors((current) => ({ ...current, service_area: undefined }));
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
    if (!form.first_name.trim()) next.first_name = 'First name is required.';
    if (!form.last_name.trim()) next.last_name = 'Last name is required.';
    if (!form.email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (sports.length === 0) next.sports = 'Select at least one sport.';
    if (!form.location.city.trim() || !form.location.state) next.service_area = 'Service area is required (state and city).';
    if (form.coaching_background.trim().length < 20) {
      next.coaching_background = 'Tell us a bit more (at least 20 characters).';
    }
    if (form.resume_url.trim() && !/^https?:\/\//i.test(form.resume_url.trim())) {
      next.resume_url = 'Use a full link, like https://…';
    }
    if (form.background_check_consent !== true) {
      next.background_check_consent = 'Background check consent is required to apply.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const background = [
        `Sports: ${sports.join(', ')}`,
        `Service area: ${serviceArea}`,
        form.credentials.trim() ? `Credentials & certifications:\n${form.credentials.trim()}` : '',
        `Background / message:\n${form.coaching_background.trim()}`,
      ].filter(Boolean).join('\n\n');

      await callFn('applications', {
        action: 'submit',
        website: form.website, // honeypot
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        ...(form.dob ? { dob: form.dob } : {}),
        ...(serviceArea ? { service_location: serviceArea } : {}),
        ...(form.county.trim() ? { service_county: form.county.trim() } : {}),
        coaching_background: background,
        resume_url: form.resume_url.trim(),
        background_check_consent: true,
      });
      setSubmitted(true);
    } catch (err) {
      setFormError(err?.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-accent" aria-hidden="true" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-4">Application submitted</h1>
          <p className="text-muted-foreground">{successMessage}</p>
          <WhatHappensNext />
        </div>
      </div>
    );
  }

  return (
    <div className="py-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">{title}</h1>
        {subtitle && <p className="text-muted-foreground mb-10 leading-relaxed">{subtitle}</p>}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Honeypot — invisible to humans, bots tend to fill it. */}
          <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="application-website">Website</label>
            <input
              id="application-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => update('website', event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="application-first-name" className="text-xs font-semibold">First name *</Label>
              <Input id="application-first-name" required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} className="bg-card border-border mt-1" />
              {errors.first_name && <p className="mt-1 text-xs text-destructive">{errors.first_name}</p>}
            </div>
            <div>
              <Label htmlFor="application-last-name" className="text-xs font-semibold">Last name *</Label>
              <Input id="application-last-name" required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} className="bg-card border-border mt-1" />
              {errors.last_name && <p className="mt-1 text-xs text-destructive">{errors.last_name}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="application-email" className="text-xs font-semibold">Email *</Label>
            <Input id="application-email" required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="bg-card border-border mt-1" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="application-phone" className="text-xs font-semibold">Phone</Label>
              <Input id="application-phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="bg-card border-border mt-1" />
            </div>
            <div>
              <Label htmlFor="application-dob" className="text-xs font-semibold">Date of birth</Label>
              <Input id="application-dob" type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} className="bg-card border-border mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Sports you coach *</Label>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Sports you coach">
              {SPORT_SELECT_OPTIONS.map((option) => {
                const selected = sports.includes(option.label);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSport(option.label)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-card text-muted-foreground hover:border-accent/50'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {errors.sports && <p className="mt-1 text-xs text-destructive">{errors.sports}</p>}
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-foreground">Service area *</legend>
            <div className="mt-1">
              <USLocationFields
                idPrefix="application-service-area"
                fields={['city', 'state', 'zip']}
                required
                value={form.location}
                onChange={updateLocation}
                errors={{ city: errors.service_area, state: errors.service_area }}
                columns="grid grid-cols-1 sm:grid-cols-3 gap-4"
              />
            </div>
            {errors.service_area && <p className="mt-1 text-xs text-destructive">{errors.service_area}</p>}
            <div className="mt-3">
              <Label className="text-xs font-semibold">County</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 text-sm mt-1">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className={form.county ? 'text-foreground' : 'text-muted-foreground'}>
                  {form.county
                    ? (form.county.toLowerCase().includes('county') ? form.county : `${form.county} County`)
                    : 'Auto-filled from the city you select'}
                </span>
              </div>
            </div>
          </fieldset>

          <div>
            <Label htmlFor="application-credentials" className="text-xs font-semibold">Credentials &amp; certifications</Label>
            <Textarea
              id="application-credentials"
              value={form.credentials}
              onChange={(e) => update('credentials', e.target.value)}
              className="bg-card border-border mt-1"
              rows={3}
              placeholder="Licenses, certifications, playing/coaching credentials…"
            />
          </div>

          <div>
            <Label htmlFor="application-background" className="text-xs font-semibold">{promptLabel || 'Coaching experience & background *'}</Label>
            <Textarea
              id="application-background"
              required
              value={form.coaching_background}
              onChange={(e) => update('coaching_background', e.target.value)}
              className="bg-card border-border mt-1"
              rows={5}
              placeholder={promptPlaceholder || 'Who you coach, how long, your approach, and what you want to build on LevelCoach…'}
            />
            {errors.coaching_background && <p className="mt-1 text-xs text-destructive">{errors.coaching_background}</p>}
          </div>

          <div>
            <Label htmlFor="application-resume" className="text-xs font-semibold">Resume / portfolio link (optional)</Label>
            <Input
              id="application-resume"
              type="url"
              placeholder="https://…"
              value={form.resume_url}
              onChange={(e) => update('resume_url', e.target.value)}
              className="bg-card border-border mt-1"
            />
            {errors.resume_url && <p className="mt-1 text-xs text-destructive">{errors.resume_url}</p>}
          </div>

          <div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="application-background-check"
                checked={form.background_check_consent}
                onCheckedChange={(v) => update('background_check_consent', v === true)}
              />
              <label htmlFor="application-background-check" className="text-sm text-muted-foreground cursor-pointer">
                I consent to a background check as part of the application process. * Review the{' '}
                <Link to="/terms" className="text-accent underline">Terms of Service</Link> and{' '}
                <Link to="/privacy" className="text-accent underline">Privacy Policy</Link>.
              </label>
            </div>
            {errors.background_check_consent && <p className="mt-1 text-xs text-destructive">{errors.background_check_consent}</p>}
          </div>

          {formError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90 py-6"
          >
            {submitting ? 'Submitting...' : 'Submit application'}
          </Button>
        </form>
      </div>
    </div>
  );
}
