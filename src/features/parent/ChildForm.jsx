import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { callFn } from '@/lib/rpc';
import { sportOptions } from '@/lib/sportsCatalog';
import { parseJsonObject } from '@/features/athlete/portalShared';

const SKILL_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Competitive Club',
  'High School',
  'College',
  'Professional',
];

const RELATIONSHIPS = ['Parent', 'Guardian', 'Grandparent', 'Other family'];

function emptyForm() {
  return {
    first_name: '',
    last_name: '',
    dob: '',
    sports: [],
    skill_level: '',
    relationship: 'Parent',
    emergency_name: '',
    emergency_phone: '',
    emergency_relationship: '',
    health_notes: '',
  };
}

function formFromChild(child) {
  const contact = parseJsonObject(child?.emergency_contact) || {};
  return {
    first_name: child?.first_name || '',
    last_name: child?.last_name || '',
    dob: child?.dob ? String(child.dob).slice(0, 10) : '',
    sports: Array.isArray(child?.sports) ? child.sports : [],
    skill_level: child?.skill_level || '',
    relationship: 'Parent',
    emergency_name: contact.name || '',
    emergency_phone: contact.phone || '',
    emergency_relationship: contact.relationship || '',
    health_notes: child?.health_notes || '',
  };
}

// Add / edit a child athlete profile through the `family` function.
// `child` null → addChild; otherwise updateChild.
export default function ChildForm({ open, onOpenChange, child = null, onSaved = () => {} }) {
  const editing = !!child;
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(editing ? formFromChild(child) : emptyForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, child?.id]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleSport = (value) => {
    setForm((current) => ({
      ...current,
      sports: current.sports.includes(value)
        ? current.sports.filter((sport) => sport !== value)
        : [...current.sports, value],
    }));
  };

  const canSave = form.first_name.trim() && form.last_name.trim() && form.dob;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const emergencyContact = (form.emergency_name || form.emergency_phone || form.emergency_relationship)
        ? {
          name: form.emergency_name.trim(),
          phone: form.emergency_phone.trim(),
          relationship: form.emergency_relationship.trim(),
        }
        : '';
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        dob: form.dob,
        sports: form.sports,
        skill_level: form.skill_level,
        emergency_contact: emergencyContact,
        health_notes: form.health_notes.trim(),
      };
      const res = editing
        ? await callFn('family', { action: 'updateChild', athlete_id: child.id, ...payload })
        : await callFn('family', { action: 'addChild', relationship: form.relationship.toLowerCase(), ...payload });
      if (res?.error) throw new Error(res.error);
      toast.success(editing ? 'Athlete profile updated.' : `${form.first_name.trim()} was added to your family.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err?.message || 'Could not save the athlete profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${child.first_name || 'athlete'}'s profile` : 'Add a child athlete'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update your child’s details. Health and emergency information stays private to your family, their coaches, and platform admins.'
              : 'Create a managed athlete profile for your child. You stay in control of booking, payments, and messaging.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="child-first-name">First name *</Label>
              <Input
                id="child-first-name"
                value={form.first_name}
                onChange={(event) => set('first_name', event.target.value)}
                maxLength={100}
                className="mt-1 bg-background"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="child-last-name">Last name *</Label>
              <Input
                id="child-last-name"
                value={form.last_name}
                onChange={(event) => set('last_name', event.target.value)}
                maxLength={100}
                className="mt-1 bg-background"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="child-dob">Date of birth *</Label>
              <Input
                id="child-dob"
                type="date"
                value={form.dob}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => set('dob', event.target.value)}
                className="mt-1 bg-background"
              />
            </div>
            <div>
              <Label htmlFor="child-skill">Skill level</Label>
              <Select value={form.skill_level} onValueChange={(value) => set('skill_level', value)}>
                <SelectTrigger id="child-skill" className="mt-1 bg-background">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!editing && (
              <div>
                <Label htmlFor="child-relationship">Your relationship</Label>
                <Select value={form.relationship} onValueChange={(value) => set('relationship', value)}>
                  <SelectTrigger id="child-relationship" className="mt-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((rel) => (
                      <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-foreground">Sports</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick everything they train in — this powers their assessments and coach matching.</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {sportOptions().map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition ${
                    form.sports.includes(option.value)
                      ? 'border-accent/50 bg-accent/10 text-foreground'
                      : 'border-border bg-background/40 text-muted-foreground hover:border-accent/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.sports.includes(option.value)}
                    onChange={() => toggleSport(option.value)}
                    className="h-3.5 w-3.5 rounded border-border accent-blue-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-md border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-foreground">Emergency contact & health notes</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Private — only visible to you, your child&apos;s coaches, and platform admins. Never shown publicly.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="emergency-name">Contact name</Label>
                <Input
                  id="emergency-name"
                  value={form.emergency_name}
                  onChange={(event) => set('emergency_name', event.target.value)}
                  maxLength={200}
                  className="mt-1 bg-background"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="emergency-phone">Phone</Label>
                <Input
                  id="emergency-phone"
                  type="tel"
                  value={form.emergency_phone}
                  onChange={(event) => set('emergency_phone', event.target.value)}
                  maxLength={30}
                  className="mt-1 bg-background"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="emergency-relationship">Relationship</Label>
                <Input
                  id="emergency-relationship"
                  value={form.emergency_relationship}
                  onChange={(event) => set('emergency_relationship', event.target.value)}
                  maxLength={100}
                  className="mt-1 bg-background"
                  placeholder="e.g. Mother"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="health-notes">Health notes (allergies, conditions, medications)</Label>
              <Textarea
                id="health-notes"
                value={form.health_notes}
                onChange={(event) => set('health_notes', event.target.value)}
                maxLength={20000}
                className="mt-1 bg-background"
                placeholder="Anything a coach should know to keep your child safe."
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSave || saving}
            onClick={save}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add child'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
