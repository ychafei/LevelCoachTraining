import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPORTS_CATALOG, getSport, resolveSportKey } from '@/lib/sportsCatalog';
import { trainingRepo } from '@/api/repo';
import { toast } from 'sonner';

// New-assessment form driven by the sport's assessment_template from the
// sports catalog: per-skill 1-10 sliders grouped by category + a summary.
// Saves through the `training` function (assessment.create) which validates
// the coach↔athlete relationship server-side.
export default function AssessmentForm({ athleteId, defaultSportKey = '', onCreated, onCancel }) {
  const normalizedDefaultSportKey = resolveSportKey(defaultSportKey);
  const [sportKey, setSportKey] = useState(normalizedDefaultSportKey || SPORTS_CATALOG[0].sport_key);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Track whether the coach has manually overridden the sport so a late-arriving
  // resolved default (athlete's sport loads async) doesn't stomp their choice.
  const userPicked = useRef(false);
  // Whether the current sport matches the athlete-derived default — used to show
  // the "tailored to this athlete" hint.
  const tailored = !!defaultSportKey && sportKey === defaultSportKey;

  // Adopt the resolved default sport when it arrives, unless the coach already
  // picked one themselves. Pre-selecting keeps the evaluation sport-tailored.
  useEffect(() => {
    if (userPicked.current) return;
    if (normalizedDefaultSportKey && normalizedDefaultSportKey !== sportKey) {
      setSportKey(normalizedDefaultSportKey);
      setScores({});
    }
  }, [normalizedDefaultSportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSport = (value) => {
    userPicked.current = true;
    setSportKey(value);
    setScores({});
  };

  const sport = useMemo(() => getSport(sportKey), [sportKey]);
  const template = sport?.assessment_template;

  const setScore = (skillKey, value) => {
    setScores((prev) => ({ ...prev, [skillKey]: value }));
  };

  const scoredCount = Object.keys(scores).length;

  const save = async () => {
    if (!athleteId) return;
    if (scoredCount === 0) {
      toast.error('Score at least one skill before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        athlete_id: athleteId,
        sport_key: sportKey,
        scores,
        notes,
      };
      const created = await trainingRepo.createAssessment(payload);
      toast.success('Assessment saved');
      setScores({});
      setNotes('');
      onCreated?.(created);
    } catch (err) {
      toast.error(err?.message || 'Could not save the assessment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">New assessment</h3>
      </div>

      <div>
        <Label htmlFor="assessment-sport" className="text-xs font-semibold">Sport</Label>
        <Select value={sportKey} onValueChange={pickSport}>
          <SelectTrigger id="assessment-sport" className="bg-secondary border-border mt-1 w-full sm:w-72">
            <SelectValue placeholder="Choose a sport" />
          </SelectTrigger>
          <SelectContent>
            {SPORTS_CATALOG.map((s) => (
              <SelectItem key={s.sport_key} value={s.sport_key}>{s.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tailored ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Tailored to this athlete's sport. Switch above to evaluate a different sport.
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The evaluation below is built from this sport's skill template.
          </p>
        )}
      </div>

      {!template ? (
        <p className="text-sm text-muted-foreground">This sport has no assessment template.</p>
      ) : (
        <div className="space-y-5">
          {template.categories.map((category) => (
            <fieldset key={category.key} className="border border-border rounded-lg p-4">
              <legend className="px-2 text-xs font-bold uppercase tracking-[0.18em] text-accent">{category.label}</legend>
              <div className="space-y-4">
                {category.skills.map((skill) => {
                  const value = scores[skill.key];
                  return (
                    <div key={skill.key}>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <Label htmlFor={`skill-${skill.key}`} className="text-sm text-foreground" title={skill.description}>
                          {skill.label}
                        </Label>
                        <span className="font-display text-sm font-bold text-foreground w-14 text-right" aria-hidden="true">
                          {value ? `${value}/10` : '—'}
                        </span>
                      </div>
                      <Slider
                        id={`skill-${skill.key}`}
                        min={1}
                        max={10}
                        step={1}
                        value={[value || 5]}
                        onValueChange={([v]) => setScore(skill.key, v)}
                        aria-label={`${skill.label} score, 1 to 10${value ? `, currently ${value}` : ', not scored yet'}`}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground/80">{skill.description}</p>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div>
            <Label htmlFor="assessment-notes" className="text-xs font-semibold">Summary</Label>
            <Textarea
              id="assessment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Overall takeaways, biggest growth areas, and what to focus on next."
              className="bg-secondary border-border mt-1"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} className="text-xs font-semibold">
                Cancel
              </Button>
            )}
            <Button
              onClick={save}
              disabled={saving || scoredCount === 0}
              className="bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90"
            >
              {saving ? 'Saving…' : `Save assessment (${scoredCount} skill${scoredCount === 1 ? '' : 's'} scored)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
