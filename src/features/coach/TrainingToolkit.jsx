import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ClipboardCheck, ClipboardList, ListChecks, NotebookPen,
  Plus, Target, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trainingRepo } from '@/api/repo';
import { getSport, SPORTS_CATALOG } from '@/lib/sportsCatalog';
import AssessmentForm from '@/features/coach/AssessmentForm';
import { toast } from 'sonner';

// Full training toolkit for one athlete: goals, training plans + items,
// homework, assessments, and check-in history. Every mutation goes through
// the `training` Appwrite Function (trainingRepo); reads are direct and
// scoped by per-document grants.

const GOAL_STATUSES = ['active', 'achieved', 'paused', 'archived'];
const PLAN_STATUSES = ['draft', 'active', 'completed', 'archived'];
const PLAN_ITEM_STATUSES = ['planned', 'in_progress', 'completed', 'skipped'];

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function statusTone(status) {
  switch (status) {
    case 'active':
    case 'in_progress':
    case 'assigned':
      return 'bg-accent/10 text-accent border-accent/20';
    case 'achieved':
    case 'completed':
    case 'reviewed':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'submitted':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'paused':
    case 'draft':
    case 'planned':
      return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    default:
      return 'bg-secondary text-muted-foreground border-border';
  }
}

function StatusBadge({ status }) {
  return (
    <Badge className={`${statusTone(status)} border text-[10px] font-display tracking-widest uppercase`}>
      {String(status || '').replace(/_/g, ' ')}
    </Badge>
  );
}

function PanelEmpty({ icon: Icon, title, blurb, action }) {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <Icon className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
      <p className="font-display tracking-wider uppercase text-sm text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{blurb}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-secondary/50" />
      ))}
    </div>
  );
}

function SportSelect({ id, value, onChange, allowNone = true }) {
  return (
    <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
      <SelectTrigger id={id} className="bg-secondary border-border mt-1">
        <SelectValue placeholder="Sport (optional)" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">No specific sport</SelectItem>}
        {SPORTS_CATALOG.map((s) => (
          <SelectItem key={s.sport_key} value={s.sport_key}>{s.display_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function GoalForm({ athleteId, defaultSportKey, initial = null, onDone, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [targetDate, setTargetDate] = useState(initial?.target_date ? initial.target_date.slice(0, 10) : '');
  const [sportKey, setSportKey] = useState(initial?.sport_key ?? defaultSportKey ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error('Give the goal a title.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description,
        target_date: targetDate || '',
        sport_key: sportKey,
      };
      const saved = initial
        ? await trainingRepo.updateGoal(initial.id, payload)
        : await trainingRepo.createGoal({ athlete_id: athleteId, ...payload });
      toast.success(initial ? 'Goal updated' : 'Goal created');
      onDone?.(saved);
    } catch (err) {
      toast.error(err?.message || 'Could not save the goal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-accent/30 rounded-lg p-4 space-y-3">
      <div>
        <Label htmlFor="goal-title" className="font-display tracking-wider uppercase text-xs">Goal</Label>
        <Input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Confident finishing with the weak foot"
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div>
        <Label htmlFor="goal-desc" className="font-display tracking-wider uppercase text-xs">Details</Label>
        <Textarea
          id="goal-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What success looks like and how you'll measure it."
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="goal-date" className="font-display tracking-wider uppercase text-xs">Target date</Label>
          <Input
            id="goal-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-secondary border-border mt-1"
          />
        </div>
        <div>
          <Label htmlFor="goal-sport" className="font-display tracking-wider uppercase text-xs">Sport</Label>
          <SportSelect id="goal-sport" value={sportKey} onChange={setSportKey} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="font-display tracking-wider uppercase text-xs">Cancel</Button>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
        >
          {saving ? 'Saving…' : initial ? 'Save Goal' : 'Create Goal'}
        </Button>
      </div>
    </div>
  );
}

function GoalsPanel({ coachId, athleteId, defaultSportKey }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await trainingRepo.listGoals({ coach_id: coachId, athlete_id: athleteId });
      setGoals(rows || []);
    } catch (err) {
      console.error('Goals load failed', err);
    } finally {
      setLoading(false);
    }
  }, [coachId, athleteId]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (goal, status) => {
    try {
      await trainingRepo.updateGoal(goal.id, { status });
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status } : g)));
    } catch (err) {
      toast.error(err?.message || 'Could not update the goal.');
    }
  };

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{goals.length} goal{goals.length === 1 ? '' : 's'}</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
            <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> New Goal
          </Button>
        )}
      </div>

      {creating && (
        <GoalForm
          athleteId={athleteId}
          defaultSportKey={defaultSportKey}
          onDone={() => { setCreating(false); void load(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {goals.length === 0 && !creating ? (
        <PanelEmpty
          icon={Target}
          title="No goals yet"
          blurb="Set the first goal for this athlete — goals show up on their dashboard and anchor your plans."
          action={(
            <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Create the first goal
            </Button>
          )}
        />
      ) : (
        goals.map((goal) => (
          editingId === goal.id ? (
            <GoalForm
              key={goal.id}
              athleteId={athleteId}
              initial={goal}
              onDone={() => { setEditingId(null); void load(); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={goal.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-display tracking-wider text-foreground">{goal.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                    {goal.sport_key && <span>{getSport(goal.sport_key)?.display_name || goal.sport_key}</span>}
                    {goal.target_date && <span>Target {fmtDate(goal.target_date)}</span>}
                  </div>
                  {goal.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{goal.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={goal.status} />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                <Select value={goal.status} onValueChange={(v) => setStatus(goal, v)}>
                  <SelectTrigger className="w-36 h-8 bg-secondary border-border text-xs" aria-label={`Status for goal ${goal.title}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(goal.id)} className="font-display tracking-wider uppercase text-xs">
                  Edit
                </Button>
              </div>
            </div>
          )
        ))
      )}
    </div>
  );
}

// ── Training plans + items ────────────────────────────────────────────────────

function PlanItemRow({ item, onChanged }) {
  const setStatus = async (status) => {
    try {
      await trainingRepo.updatePlanItem(item.id, { status });
      onChanged?.({ ...item, status });
    } catch (err) {
      toast.error(err?.message || 'Could not update the plan item.');
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mr-2">Week {item.week ?? 0}</span>
          {item.title}
        </p>
        {item.description && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.description}</p>}
      </div>
      <Select value={item.status || 'planned'} onValueChange={setStatus}>
        <SelectTrigger className="w-36 h-8 bg-secondary border-border text-xs shrink-0" aria-label={`Status for ${item.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_ITEM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PlanItemForm({ planId, onDone, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [week, setWeek] = useState('1');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error('Give the item a title.'); return; }
    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < 0 || weekNum > 104) {
      toast.error('Week must be a whole number between 0 and 104.');
      return;
    }
    setSaving(true);
    try {
      await trainingRepo.createPlanItem({ plan_id: planId, title: title.trim(), description, week: weekNum });
      toast.success('Plan item added');
      onDone?.();
    } catch (err) {
      toast.error(err?.message || 'Could not add the plan item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-accent/30 rounded-lg p-3 mt-2 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2">
        <div>
          <Label htmlFor={`item-title-${planId}`} className="sr-only">Item title</Label>
          <Input
            id={`item-title-${planId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weak-foot wall work, 3x per week"
            className="bg-secondary border-border"
          />
        </div>
        <div>
          <Label htmlFor={`item-week-${planId}`} className="sr-only">Week number</Label>
          <Input
            id={`item-week-${planId}`}
            type="number"
            min={0}
            max={104}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            aria-label="Week number"
            className="bg-secondary border-border"
          />
        </div>
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Details (optional)"
        aria-label="Item details"
        className="bg-secondary border-border"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} className="font-display tracking-wider uppercase text-xs">Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
          {saving ? 'Adding…' : 'Add Item'}
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ plan, onChanged }) {
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const rows = await trainingRepo.listPlanItems({ plan_id: plan.id });
      setItems(rows || []);
    } catch (err) {
      console.error('Plan items load failed', err);
      setItems([]);
    }
  }, [plan.id]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const setStatus = async (status) => {
    try {
      await trainingRepo.updatePlan(plan.id, { status });
      onChanged?.({ ...plan, status });
    } catch (err) {
      toast.error(err?.message || 'Could not update the plan.');
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-display tracking-wider text-foreground">{plan.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
            {plan.sport_key && <span>{getSport(plan.sport_key)?.display_name || plan.sport_key}</span>}
            {(plan.starts_on || plan.ends_on) && (
              <span>
                {plan.starts_on ? fmtDate(plan.starts_on) : '…'} – {plan.ends_on ? fmtDate(plan.ends_on) : 'open'}
              </span>
            )}
          </div>
          {plan.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{plan.description}</p>}
        </div>
        <StatusBadge status={plan.status} />
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Plan items</p>
          <div className="flex items-center gap-2">
            <Select value={plan.status} onValueChange={setStatus}>
              <SelectTrigger className="w-32 h-8 bg-secondary border-border text-xs" aria-label={`Status for plan ${plan.title}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="font-display tracking-wider uppercase text-xs">
                <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Item
              </Button>
            )}
          </div>
        </div>

        {items === null ? (
          <div className="h-10 animate-pulse rounded bg-secondary/60" aria-hidden="true" />
        ) : items.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground py-2">No items yet — break the plan into weekly steps.</p>
        ) : (
          items.map((item) => (
            <PlanItemRow
              key={item.id}
              item={item}
              onChanged={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
            />
          ))
        )}

        {adding && (
          <PlanItemForm
            planId={plan.id}
            onDone={() => { setAdding(false); void loadItems(); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function PlanForm({ athleteId, defaultSportKey, onDone, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [sportKey, setSportKey] = useState(defaultSportKey || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error('Give the plan a title.'); return; }
    setSaving(true);
    try {
      await trainingRepo.createPlan({
        athlete_id: athleteId,
        title: title.trim(),
        description,
        starts_on: startsOn || '',
        ends_on: endsOn || '',
        sport_key: sportKey,
      });
      toast.success('Training plan created');
      onDone?.();
    } catch (err) {
      toast.error(err?.message || 'Could not create the plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-accent/30 rounded-lg p-4 space-y-3">
      <div>
        <Label htmlFor="plan-title" className="font-display tracking-wider uppercase text-xs">Plan title</Label>
        <Input
          id="plan-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 8-week finishing block"
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div>
        <Label htmlFor="plan-desc" className="font-display tracking-wider uppercase text-xs">Overview</Label>
        <Textarea
          id="plan-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What this plan builds toward."
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="plan-start" className="font-display tracking-wider uppercase text-xs">Starts</Label>
          <Input id="plan-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="bg-secondary border-border mt-1" />
        </div>
        <div>
          <Label htmlFor="plan-end" className="font-display tracking-wider uppercase text-xs">Ends</Label>
          <Input id="plan-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="bg-secondary border-border mt-1" />
        </div>
        <div>
          <Label htmlFor="plan-sport" className="font-display tracking-wider uppercase text-xs">Sport</Label>
          <SportSelect id="plan-sport" value={sportKey} onChange={setSportKey} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="font-display tracking-wider uppercase text-xs">Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
          {saving ? 'Creating…' : 'Create Plan'}
        </Button>
      </div>
    </div>
  );
}

function PlansPanel({ coachId, athleteId, defaultSportKey }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await trainingRepo.listPlans({ coach_id: coachId, athlete_id: athleteId });
      setPlans(rows || []);
    } catch (err) {
      console.error('Plans load failed', err);
    } finally {
      setLoading(false);
    }
  }, [coachId, athleteId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{plans.length} plan{plans.length === 1 ? '' : 's'}</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
            <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> New Plan
          </Button>
        )}
      </div>

      {creating && (
        <PlanForm
          athleteId={athleteId}
          defaultSportKey={defaultSportKey}
          onDone={() => { setCreating(false); void load(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {plans.length === 0 && !creating ? (
        <PanelEmpty
          icon={ClipboardList}
          title="No training plans"
          blurb="Build a structured plan with weekly items — the athlete sees it on their dashboard."
          action={(
            <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Create the first plan
            </Button>
          )}
        />
      ) : (
        plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onChanged={(next) => setPlans((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
          />
        ))
      )}
    </div>
  );
}

// ── Homework ──────────────────────────────────────────────────────────────────

function HomeworkForm({ athleteId, defaultSportKey, onDone, onCancel }) {
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sportKey, setSportKey] = useState(defaultSportKey || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error('Give the homework a title.'); return; }
    setSaving(true);
    try {
      await trainingRepo.createHomework({
        athlete_id: athleteId,
        title: title.trim(),
        instructions,
        due_date: dueDate || '',
        sport_key: sportKey,
      });
      toast.success('Homework assigned');
      onDone?.();
    } catch (err) {
      toast.error(err?.message || 'Could not assign the homework.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-accent/30 rounded-lg p-4 space-y-3">
      <div>
        <Label htmlFor="hw-title" className="font-display tracking-wider uppercase text-xs">Homework</Label>
        <Input
          id="hw-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 200 wall-ball touches per day"
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div>
        <Label htmlFor="hw-instructions" className="font-display tracking-wider uppercase text-xs">Instructions</Label>
        <Textarea
          id="hw-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Exactly what to do, how often, and what to send back."
          className="bg-secondary border-border mt-1"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="hw-due" className="font-display tracking-wider uppercase text-xs">Due date</Label>
          <Input id="hw-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-secondary border-border mt-1" />
        </div>
        <div>
          <Label htmlFor="hw-sport" className="font-display tracking-wider uppercase text-xs">Sport</Label>
          <SportSelect id="hw-sport" value={sportKey} onChange={setSportKey} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="font-display tracking-wider uppercase text-xs">Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
          {saving ? 'Assigning…' : 'Assign Homework'}
        </Button>
      </div>
    </div>
  );
}

function HomeworkPanel({ coachId, athleteId, defaultSportKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await trainingRepo.listHomework({ coach_id: coachId, athlete_id: athleteId });
      setRows(list || []);
    } catch (err) {
      console.error('Homework load failed', err);
    } finally {
      setLoading(false);
    }
  }, [coachId, athleteId]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (hw, status) => {
    try {
      await trainingRepo.updateHomework(hw.id, { status });
      setRows((prev) => prev.map((h) => (h.id === hw.id ? { ...h, status } : h)));
      if (status === 'reviewed') toast.success('Marked as reviewed');
    } catch (err) {
      toast.error(err?.message || 'Could not update the homework.');
    }
  };

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{rows.length} assignment{rows.length === 1 ? '' : 's'}</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
            <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Assign Homework
          </Button>
        )}
      </div>

      {creating && (
        <HomeworkForm
          athleteId={athleteId}
          defaultSportKey={defaultSportKey}
          onDone={() => { setCreating(false); void load(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {rows.length === 0 && !creating ? (
        <PanelEmpty
          icon={NotebookPen}
          title="No homework assigned"
          blurb="Between-session work keeps athletes progressing. Assign the first piece of homework."
          action={(
            <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Assign homework
            </Button>
          )}
        />
      ) : (
        rows.map((hw) => (
          <div key={hw.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-display tracking-wider text-foreground">{hw.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                  {hw.sport_key && <span>{getSport(hw.sport_key)?.display_name || hw.sport_key}</span>}
                  {hw.due_date && <span>Due {fmtDate(hw.due_date)}</span>}
                  {hw.submitted_at && <span>Submitted {fmtDate(hw.submitted_at)}</span>}
                </div>
                {hw.instructions && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{hw.instructions}</p>}
                {hw.athlete_notes && (
                  <div className="mt-2 rounded border border-accent/20 bg-accent/5 p-2">
                    <p className="text-[10px] font-display tracking-widest uppercase text-accent">Athlete notes</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{hw.athlete_notes}</p>
                  </div>
                )}
              </div>
              <StatusBadge status={hw.status} />
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
              {hw.status === 'submitted' && (
                <Button
                  size="sm"
                  onClick={() => setStatus(hw, 'reviewed')}
                  className="bg-green-600 text-white font-display tracking-wider uppercase text-xs hover:bg-green-700"
                >
                  <ListChecks className="w-3 h-3 mr-1" aria-hidden="true" /> Mark Reviewed
                </Button>
              )}
              {hw.status !== 'archived' && (
                <Button size="sm" variant="ghost" onClick={() => setStatus(hw, 'archived')} className="font-display tracking-wider uppercase text-xs text-muted-foreground">
                  <X className="w-3 h-3 mr-1" aria-hidden="true" /> Archive
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Assessments ───────────────────────────────────────────────────────────────

function parseScores(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function AssessmentCard({ assessment }) {
  const [expanded, setExpanded] = useState(false);
  const scores = useMemo(() => parseScores(assessment.scores), [assessment.scores]);
  const sport = getSport(assessment.sport_key);
  const entries = Object.entries(scores).filter(([, v]) => Number.isFinite(Number(v)));
  const average = entries.length
    ? entries.reduce((sum, [, v]) => sum + Number(v), 0) / entries.length
    : null;

  // Group scored skills by the template's categories where possible.
  const grouped = useMemo(() => {
    const known = new Map();
    const categories = sport?.assessment_template?.categories || [];
    for (const cat of categories) {
      const skills = cat.skills
        .filter((s) => scores[s.key] !== undefined)
        .map((s) => ({ key: s.key, label: s.label, value: Number(scores[s.key]) }));
      if (skills.length > 0) known.set(cat.label, skills);
      for (const s of cat.skills) known.set(`__seen:${s.key}`, true);
    }
    const other = entries
      .filter(([key]) => !known.has(`__seen:${key}`))
      .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value: Number(value) }));
    const result = [...known.entries()].filter(([k]) => !String(k).startsWith('__seen:'));
    if (other.length > 0) result.push(['Other', other]);
    return result;
  }, [sport, scores, entries]);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display tracking-wider text-foreground">
              {sport?.display_name || assessment.sport_key || 'Assessment'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtDate(assessment.assessed_at || assessment.created_date)} · {entries.length} skill{entries.length === 1 ? '' : 's'} scored
            </p>
          </div>
          {average !== null && (
            <span className="font-display text-lg font-bold text-accent">{average.toFixed(1)}<span className="text-xs text-muted-foreground">/10 avg</span></span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {grouped.map(([label, skills]) => (
            <div key={label}>
              <p className="text-[10px] font-display tracking-widest uppercase text-accent mb-1">{label}</p>
              <div className="space-y-1.5">
                {skills.map((s) => (
                  <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,160px)_36px] items-center gap-2">
                    <span className="text-sm text-foreground truncate capitalize">{s.label}</span>
                    <div className="h-1.5 rounded-full bg-secondary" role="img" aria-label={`${s.label}: ${s.value} out of 10`}>
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(Math.max(1, Math.min(10, s.value)) / 10) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-foreground text-right">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {assessment.notes && (
            <div>
              <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1">Summary</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{assessment.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssessmentsPanel({ coachId, athleteId, defaultSportKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await trainingRepo.listAssessments({ coach_id: coachId, athlete_id: athleteId });
      setRows(list || []);
    } catch (err) {
      console.error('Assessments load failed', err);
    } finally {
      setLoading(false);
    }
  }, [coachId, athleteId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{rows.length} assessment{rows.length === 1 ? '' : 's'}</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
            <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> New Assessment
          </Button>
        )}
      </div>

      {creating && (
        <AssessmentForm
          athleteId={athleteId}
          defaultSportKey={defaultSportKey}
          onCreated={() => { setCreating(false); void load(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {rows.length === 0 && !creating ? (
        <PanelEmpty
          icon={ClipboardCheck}
          title="No assessments yet"
          blurb="Baseline this athlete with a sport-specific skills assessment so progress is measurable."
          action={(
            <Button size="sm" onClick={() => setCreating(true)} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> Run the first assessment
            </Button>
          )}
        />
      ) : (
        rows.map((a) => <AssessmentCard key={a.id} assessment={a} />)
      )}
    </div>
  );
}

// ── Check-ins ─────────────────────────────────────────────────────────────────

function CheckInsPanel({ coachId, athleteId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Check-ins may be created by the athlete (no coach_id) or this coach —
        // load both readable sets and merge.
        const [mine, athleteOwn] = await Promise.all([
          trainingRepo.listCheckIns({ coach_id: coachId, athlete_id: athleteId }).catch(() => []),
          trainingRepo.listCheckIns({ athlete_id: athleteId }).catch(() => []),
        ]);
        if (cancelled) return;
        const byId = new Map();
        for (const row of [...(mine || []), ...(athleteOwn || [])]) byId.set(row.id, row);
        setRows([...byId.values()].sort((a, b) => (a.created_date < b.created_date ? 1 : -1)));
      } catch (err) {
        console.error('Check-ins load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachId, athleteId]);

  if (loading) return <PanelSkeleton />;

  if (rows.length === 0) {
    return (
      <PanelEmpty
        icon={CalendarDays}
        title="No check-ins yet"
        blurb="Athlete mood, energy, and soreness check-ins will appear here as they come in."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">{fmtDate(c.created_date)} · {c.created_by_role === 'coach' ? 'Logged by coach' : 'Athlete check-in'}</p>
            <div className="flex items-center gap-3 text-xs">
              {[['Mood', c.mood], ['Energy', c.energy], ['Soreness', c.soreness]].map(([label, value]) => (
                value != null && value !== '' ? (
                  <span key={label} className="text-muted-foreground">
                    {label}: <span className="font-semibold text-foreground">{value}/10</span>
                  </span>
                ) : null
              ))}
            </div>
          </div>
          {c.notes && <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap">{c.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Toolkit shell ─────────────────────────────────────────────────────────────

export default function TrainingToolkit({ coachId, athleteId, defaultSportKey = '' }) {
  if (!athleteId) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground mb-1">Training Toolkit</h2>
        <p className="text-sm text-muted-foreground">
          This client's sessions don't carry an athlete record yet, so goals, plans, homework, and assessments
          can't be attached. The toolkit unlocks after their next booking.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">Training Toolkit</h2>
      <Tabs defaultValue="goals">
        <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-secondary/60">
          <TabsTrigger value="goals" className="font-display tracking-wider uppercase text-xs">Goals</TabsTrigger>
          <TabsTrigger value="plans" className="font-display tracking-wider uppercase text-xs">Plans</TabsTrigger>
          <TabsTrigger value="homework" className="font-display tracking-wider uppercase text-xs">Homework</TabsTrigger>
          <TabsTrigger value="assessments" className="font-display tracking-wider uppercase text-xs">Assessments</TabsTrigger>
          <TabsTrigger value="checkins" className="font-display tracking-wider uppercase text-xs">Check-ins</TabsTrigger>
        </TabsList>
        <TabsContent value="goals" className="mt-4">
          <GoalsPanel coachId={coachId} athleteId={athleteId} defaultSportKey={defaultSportKey} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <PlansPanel coachId={coachId} athleteId={athleteId} defaultSportKey={defaultSportKey} />
        </TabsContent>
        <TabsContent value="homework" className="mt-4">
          <HomeworkPanel coachId={coachId} athleteId={athleteId} defaultSportKey={defaultSportKey} />
        </TabsContent>
        <TabsContent value="assessments" className="mt-4">
          <AssessmentsPanel coachId={coachId} athleteId={athleteId} defaultSportKey={defaultSportKey} />
        </TabsContent>
        <TabsContent value="checkins" className="mt-4">
          <CheckInsPanel coachId={coachId} athleteId={athleteId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
