import React, { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  ClipboardList,
  NotebookPen,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { trainingRepo } from '@/api/repo';
import { formatInstantInTz } from '@/lib/scheduleET';
import AssessmentView from '@/features/athlete/AssessmentView';
import { sportDisplayName } from '@/features/athlete/sportMeta';
import { EmptyState, ScoreBar, SectionCard, SkeletonRows } from '@/features/athlete/portalShared';

const dateOnly = { hour: undefined, minute: undefined, timeZoneName: undefined };

const HOMEWORK_BADGES = {
  assigned: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  submitted: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  reviewed: 'border-green-500/20 bg-green-500/10 text-green-500',
  archived: 'border-border bg-secondary/50 text-muted-foreground',
};

const ITEM_BADGES = {
  planned: 'border-border bg-secondary/50 text-muted-foreground',
  in_progress: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  completed: 'border-green-500/20 bg-green-500/10 text-green-500',
  skipped: 'border-border bg-secondary/40 text-muted-foreground/70',
};

// Display-only labels for raw status values — never written back.
const HOMEWORK_LABELS = {
  assigned: 'Assigned',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  archived: 'Archived',
};

const ITEM_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

const PLAN_LABELS = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const GOAL_LABELS = {
  active: 'Active',
  achieved: 'Achieved',
  paused: 'Paused',
  archived: 'Archived',
};

function PlansSection({ plans, planItems, loading }) {
  const visiblePlans = plans.filter((plan) => ['active', 'draft', 'completed'].includes(plan.status));
  const itemsByPlan = useMemo(() => {
    const map = {};
    for (const item of planItems) {
      (map[item.plan_id] = map[item.plan_id] || []).push(item);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.week - b.week) || (a.position - b.position));
    }
    return map;
  }, [planItems]);

  return (
    <SectionCard title="Training plans" icon={ClipboardList}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : visiblePlans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No training plans yet"
          body="When your coach builds you a plan, the weekly breakdown will live here."
          cta={{ href: '/coaches', label: 'Find a coach' }}
          compact
        />
      ) : (
        <div className="space-y-4">
          {visiblePlans.map((plan) => {
            const items = itemsByPlan[plan.id] || [];
            const weeks = [...new Set(items.map((item) => item.week))];
            return (
              <div key={plan.id} className="rounded-md border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{plan.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {plan.sport_key && `${sportDisplayName(plan.sport_key)} · `}
                      {plan.starts_on && `Starts ${plan.starts_on}`}
                      {plan.ends_on && ` · Ends ${plan.ends_on}`}
                    </p>
                  </div>
                  <Badge className={plan.status === 'active'
                    ? 'border-green-500/20 bg-green-500/10 text-green-500'
                    : 'border-border bg-secondary/50 text-muted-foreground'}
                  >
                    {PLAN_LABELS[plan.status] || plan.status}
                  </Badge>
                </div>
                {plan.description && (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{plan.description}</p>
                )}
                {weeks.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {weeks.map((week) => (
                      <div key={week}>
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          Week {week}
                        </p>
                        <ul className="space-y-1.5">
                          {items.filter((item) => item.week === week).map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-3 rounded border border-border/60 bg-card px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-foreground">{item.title}</p>
                                {item.description && (
                                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                                )}
                              </div>
                              <Badge className={`shrink-0 ${ITEM_BADGES[item.status] || ITEM_BADGES.planned}`}>
                                {ITEM_LABELS[item.status] || ITEM_LABELS.planned}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function HomeworkSection({ homework, loading, onChanged, readOnly = false }) {
  const [target, setTarget] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await trainingRepo.submitHomework(target.id, { athlete_notes: notes.trim() });
      toast.success('Homework submitted — nice work!');
      setTarget(null);
      setNotes('');
      onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not submit homework.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Homework" icon={NotebookPen}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : homework.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No homework assigned"
          body="Drills and at-home work from your coach will show up here when assigned."
          compact
        />
      ) : (
        <ul className="space-y-3">
          {homework.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <Badge className={HOMEWORK_BADGES[item.status] || HOMEWORK_BADGES.archived}>
                      {HOMEWORK_LABELS[item.status] || item.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.due_date
                      ? `Due ${formatInstantInTz(item.due_date, undefined, dateOnly)}`
                      : 'No due date'}
                    {item.sport_key && ` · ${sportDisplayName(item.sport_key)}`}
                  </p>
                  {item.instructions && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.instructions}</p>
                  )}
                  {item.athlete_notes && (
                    <p className="mt-2 rounded bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/80">Your notes: </span>
                      {item.athlete_notes}
                    </p>
                  )}
                  {item.coach_feedback && (
                    <p className="mt-2 rounded border border-accent/20 bg-accent/5 px-2 py-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-accent">Coach feedback: </span>
                      {item.coach_feedback}
                    </p>
                  )}
                </div>
                {!readOnly && item.status === 'assigned' && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 bg-accent text-xs text-accent-foreground hover:bg-accent/90"
                    onClick={() => { setTarget(item); setNotes(''); }}
                  >
                    Mark done
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Submit “{target?.title}”</DialogTitle>
            <DialogDescription>
              Tell your coach how it went. Your notes are shared with your coach (and your parent/guardian, if linked).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="homework-notes">How did it go? (optional)</Label>
            <Textarea
              id="homework-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={5000}
              className="mt-1 bg-background"
              placeholder="What felt good? What was hard?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={saving} onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Submitting…' : 'Submit homework'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function GoalsSection({ goals, loading }) {
  const active = goals.filter((goal) => goal.status !== 'archived');
  return (
    <SectionCard title="Goals" icon={Target}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : active.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals set yet"
          body="Goals you set with your coach — and progress toward them — will appear here."
          compact
        />
      ) : (
        <ul className="space-y-3">
          {active.map((goal) => {
            const pct = Math.max(0, Math.min(100, Number(goal.progress_pct) || 0));
            return (
              <li key={goal.id} className="rounded-md border border-border bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{goal.title}</p>
                  <Badge className={goal.status === 'achieved'
                    ? 'border-green-500/20 bg-green-500/10 text-green-500'
                    : 'border-border bg-secondary/50 text-muted-foreground'}
                  >
                    {GOAL_LABELS[goal.status] || goal.status}
                  </Badge>
                </div>
                {goal.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{goal.description}</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <ScoreBar value={pct} max={100} label={`${goal.title}: ${pct}% complete`} />
                  <span className="shrink-0 text-xs font-semibold text-foreground">{pct}%</span>
                </div>
                {goal.target_date && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Target: {formatInstantInTz(goal.target_date, undefined, dateOnly)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function AssessmentsSection({ assessments, loading, fallbackSport, coachesById }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = assessments.find((a) => a.id === selectedId) || assessments[0] || null;

  return (
    <SectionCard
      title="Skill assessments"
      icon={TrendingUp}
      description="Each assessment scores your skills 1–10 against your sport's evaluation template."
      action={assessments.length > 1 && (
        <div className="w-44">
          <Label htmlFor="assessment-picker" className="sr-only">Choose an assessment</Label>
          <Select value={selected?.id || ''} onValueChange={setSelectedId}>
            <SelectTrigger id="assessment-picker" className="h-8 bg-background text-xs">
              <SelectValue placeholder="Choose assessment" />
            </SelectTrigger>
            <SelectContent>
              {assessments.map((assessment) => (
                <SelectItem key={assessment.id} value={assessment.id}>
                  {formatInstantInTz(assessment.assessed_at || assessment.created_date, undefined, dateOnly)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : !selected ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No assessments yet"
          body="After your coach evaluates you, a category-by-category skill breakdown will appear here."
          compact
        />
      ) : (
        <AssessmentView
          assessment={selected}
          sportValue={selected.sport_key || fallbackSport}
          coachName={(() => {
            const coach = coachesById[selected.coach_id];
            return coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ') : '';
          })()}
        />
      )}
    </SectionCard>
  );
}

export default function AthleteTraining({ trainingData, fallbackSport = '', coachesById = {}, readOnly = false }) {
  return (
    <div className="space-y-4">
      <HomeworkSection
        homework={trainingData.homework}
        loading={trainingData.loading}
        onChanged={trainingData.refresh}
        readOnly={readOnly}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <PlansSection plans={trainingData.plans} planItems={trainingData.planItems} loading={trainingData.loading} />
        <GoalsSection goals={trainingData.goals} loading={trainingData.loading} />
      </div>
      <AssessmentsSection
        assessments={trainingData.assessments}
        loading={trainingData.loading}
        fallbackSport={fallbackSport}
        coachesById={coachesById}
      />
    </div>
  );
}
