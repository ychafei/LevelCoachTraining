import React, { useState } from 'react';
import { auth } from '@/lib/auth';
import { email as emailLib } from '@/lib/email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const POSITIONS = ['Goalkeeper', 'Center Back', 'Fullback', 'Defensive Midfielder', 'Central Midfielder', 'Attacking Midfielder', 'Winger', 'Striker', 'Forward', 'Other'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];

const cleanPhone = (val) => val.replace(/\D/g, '');
const isValidPhone = (val) => cleanPhone(val).length === 10;
const hasNumbers = (val) => /\d/.test(val);
const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

export default function OnboardingModal({ user, onComplete }) {
  // Derive initial first/last from existing data: explicit fields first, else split full_name
  const derivedFirst = user?.first_name || user?.full_name?.trim().split(/\s+/)[0] || '';
  const derivedLast = user?.last_name || user?.full_name?.trim().split(/\s+/).slice(1).join(' ') || '';

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: derivedFirst,
    last_name: derivedLast,
    phone: user?.phone || '',
    dob: user?.dob || '',
    position: user?.position || '',
    skill_level: user?.skill_level || '',
    parent_first_name: '',
    parent_last_name: '',
    parent_phone: '',
    parent_email: '',
    agreed_to_terms: false,
  });
  const [saving, setSaving] = useState(false);

  const isCoach = user?.role === 'coach' || user?.role === 'admin';
  const age = form.dob ? Math.floor((Date.now() - new Date(form.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const isUnder18 = age !== null && age < 18;

  const totalSteps = isUnder18 ? 3 : 2;

  const phoneValid = isValidPhone(form.phone);
  const firstNameOk = form.first_name.trim().length > 0 && !hasNumbers(form.first_name);
  const lastNameOk = form.last_name.trim().length > 0 && !hasNumbers(form.last_name);
  const canProceedStep1 = isCoach
    ? firstNameOk && lastNameOk && form.phone && form.dob && phoneValid
    : firstNameOk && lastNameOk && form.phone && form.dob && form.position && form.skill_level && phoneValid;

  const parentFirstOk = form.parent_first_name.trim().length > 0 && !hasNumbers(form.parent_first_name);
  const parentLastOk = form.parent_last_name.trim().length > 0 && !hasNumbers(form.parent_last_name);
  const parentPhoneOk = isValidPhone(form.parent_phone);
  const parentEmailOk = form.parent_email && isValidEmail(form.parent_email);
  const canProceedStep2 = isUnder18 ? (parentFirstOk && parentLastOk && parentPhoneOk && parentEmailOk) : form.agreed_to_terms;
  const canFinish = form.agreed_to_terms;

  const handleSave = async () => {
    setSaving(true);
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    await auth.updateCurrentUser({
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      phone: cleanPhone(form.phone),
      dob: form.dob,
      position: form.position,
      skill_level: form.skill_level,
      parent_first_name: form.parent_first_name || undefined,
      parent_last_name: form.parent_last_name || undefined,
      parent_phone: form.parent_phone ? cleanPhone(form.parent_phone) : undefined,
      parent_email: form.parent_email || undefined,
      profile_setup_complete: true,
    });

    // Notify parent/guardian via email if under 18
    if (isUnder18 && form.parent_email) {
      const childName = `${firstName} ${lastName}`.trim() || user?.email || 'Your child';
      try {
        await emailLib.send({
          to: form.parent_email,
          subject: 'Your Child Has Signed Up for LevelCoach Training',
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #2563EB;">LevelCoach Training — Parent/Guardian Notification</h2>
              <p>Hi ${form.parent_first_name},</p>
              <p><strong>${childName}</strong> (age ${age}) has created an account on <strong>LevelCoach Training</strong>, a private soccer coaching platform.</p>
              <h3 style="color: #2563EB;">What is LevelCoach Training?</h3>
              <p>LevelCoach Training provides one-on-one and small group soccer coaching sessions for players of all ages and skill levels in Oakland, Macomb, and Wayne counties.</p>
              <h3 style="color: #2563EB;">What your child can do on the platform:</h3>
              <ul>
                <li>Book private coaching sessions with certified coaches</li>
                <li>Connect with other players their age through our matching system (first name and age only are visible)</li>
                <li>Message matched players (all messages are monitored for safety)</li>
              </ul>
              <h3 style="color: #2563EB;">Your information on file:</h3>
              <ul>
                <li>Name: ${form.parent_first_name} ${form.parent_last_name}</li>
                <li>Phone: ${form.parent_phone}</li>
                <li>Email: ${form.parent_email}</li>
              </ul>
              <p>If you have any questions or did not authorize this, please contact us immediately at <a href="mailto:support@levelcoach.com" style="color: #2563EB;">support@levelcoach.com</a>.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">LevelCoach Training — Private Soccer Coaching<br/>${window.location.origin}</p>
            </div>
          `,
        });
      } catch {
        // Email failure shouldn't block profile setup
      }
    }

    setSaving(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wider text-accent">Welcome to LevelCoach Training</h2>
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
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input
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
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input
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
              <Label>Phone Number <span className="text-destructive">*</span></Label>
              <Input
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
              <Label>Date of Birth <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="mt-1" />
            </div>
            {!isCoach && (
              <>
                <div>
                  <Label>Position</Label>
                  <Select value={form.position} onValueChange={v => setForm({ ...form, position: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select position" /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Skill Level</Label>
                  <Select value={form.skill_level} onValueChange={v => setForm({ ...form, skill_level: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select skill level" /></SelectTrigger>
                    <SelectContent>
                      {SKILL_LEVELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-display uppercase tracking-wider"
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Guardian Info (under 18) */}
        {step === 2 && isUnder18 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Since you're under 18, we need a parent or guardian's information.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Parent First Name <span className="text-destructive">*</span></Label>
                <Input
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
                <Label>Parent Last Name <span className="text-destructive">*</span></Label>
                <Input
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
              <Label>Parent Phone <span className="text-destructive">*</span></Label>
              <Input
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
              <Label>Parent Email <span className="text-destructive">*</span></Label>
              <Input
                value={form.parent_email}
                onChange={e => setForm({ ...form, parent_email: e.target.value })}
                placeholder="email@example.com"
                className="mt-1"
              />
              {form.parent_email && !isValidEmail(form.parent_email) && (
                <p className="text-xs text-destructive mt-1">Invalid email address</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button
                disabled={!canProceedStep2}
                onClick={() => setStep(3)}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-display uppercase tracking-wider"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Terms step */}
        {((step === 2 && !isUnder18) || (step === 3 && isUnder18)) && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please read and agree to our terms before getting started.</p>
            <div className="bg-secondary rounded-md p-3 text-xs text-muted-foreground max-h-40 overflow-y-auto leading-relaxed">
              By using LevelCoach Training, you agree to our{' '}
              <a href="/terms" target="_blank" className="text-accent underline">Terms of Service</a> and{' '}
              <a href="/privacy" target="_blank" className="text-accent underline">Privacy Policy</a>. Sessions are subject to cancellation policies. All communications are monitored for safety.
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="terms"
                checked={form.agreed_to_terms}
                onCheckedChange={v => setForm({ ...form, agreed_to_terms: !!v })}
              />
              <Label htmlFor="terms" className="cursor-pointer text-sm">I agree to the Terms of Service and Privacy Policy</Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">Back</Button>
              <Button
                disabled={!canFinish || saving}
                onClick={handleSave}
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-display uppercase tracking-wider"
              >
                {saving ? 'Saving...' : 'Get Started'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}