import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const POSITIONS = ['Goalkeeper', 'Defender', 'Center Back', 'Fullback', 'Midfielder', 'Winger', 'Striker', 'Forward', 'Other'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];

export default function OnboardingModal({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    phone: user?.phone || '',
    dob: user?.dob || '',
    position: user?.position || '',
    skill_level: user?.skill_level || '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    agreed_to_terms: false,
  });
  const [saving, setSaving] = useState(false);

  const age = form.dob ? Math.floor((Date.now() - new Date(form.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const isUnder18 = age !== null && age < 18;

  const totalSteps = isUnder18 ? 3 : 2;

  const canProceedStep1 = form.phone && form.dob && form.position && form.skill_level;
  const canProceedStep2 = isUnder18 ? (form.parent_name && form.parent_phone) : form.agreed_to_terms;
  const canFinish = form.agreed_to_terms;

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({
      phone: form.phone,
      dob: form.dob,
      position: form.position,
      skill_level: form.skill_level,
      parent_name: form.parent_name || undefined,
      parent_phone: form.parent_phone || undefined,
      parent_email: form.parent_email || undefined,
      profile_setup_complete: true,
    });
    setSaving(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-5">
        <div>
          <h2 className="font-oswald text-2xl uppercase tracking-wider text-accent">Welcome to LC Training</h2>
          <p className="text-muted-foreground text-sm mt-1">Step {step} of {totalSteps} — Let's set up your profile</p>
          <div className="flex gap-1 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-border'}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Phone Number</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 000-0000" className="mt-1" />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="mt-1" />
            </div>
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
            <Button disabled={!canProceedStep1} onClick={() => setStep(2)} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-oswald uppercase tracking-wider">
              Continue
            </Button>
          </div>
        )}

        {step === 2 && isUnder18 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Since you're under 18, we need a parent or guardian's information.</p>
            <div>
              <Label>Parent/Guardian Name</Label>
              <Input value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label>Parent/Guardian Phone</Label>
              <Input value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} placeholder="(555) 000-0000" className="mt-1" />
            </div>
            <div>
              <Label>Parent/Guardian Email (optional)</Label>
              <Input value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} placeholder="email@example.com" className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button disabled={!canProceedStep2} onClick={() => setStep(3)} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-oswald uppercase tracking-wider">Continue</Button>
            </div>
          </div>
        )}

        {((step === 2 && !isUnder18) || (step === 3 && isUnder18)) && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please read and agree to our terms before getting started.</p>
            <div className="bg-secondary rounded-md p-3 text-xs text-muted-foreground max-h-40 overflow-y-auto leading-relaxed">
              By using LC Training, you agree to our{' '}
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
              <Button disabled={!canFinish || saving} onClick={handleSave} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 font-oswald uppercase tracking-wider">
                {saving ? 'Saving...' : 'Get Started'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}