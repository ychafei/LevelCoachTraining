import { makeRepo } from '@/api/repoFactory';
import { mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

// Training data (goals, plans, plan items, homework, assessments, check-ins)
// is server-only writable via the `training` function, which validates the
// coach↔athlete relationship for every mutation. Reads stay direct: per-doc
// grants scope rows to the coach, the athlete and their guardians, so list
// calls (filtered by athlete_id / coach_id) only return readable documents.
const goals = makeRepo('athlete_goals');
const plans = makeRepo('training_plans');
const planItems = makeRepo('training_plan_items');
const homework = makeRepo('homework_assignments');
const assessments = makeRepo('athlete_assessments');
const checkIns = makeRepo('session_check_ins');

async function mutate(action, payload, key) {
  let res;
  try {
    res = await callFn('training', { action, ...payload });
  } catch (err) {
    const canRetryWithoutSport = payload?.sport_key
      && err?.message === 'sport_key is not a known sport.';
    if (!canRetryWithoutSport) throw err;
    const retryPayload = { ...payload, sport_key: '' };
    res = await callFn('training', { action, ...retryPayload });
  }
  const doc = res?.[key];
  return doc ? mapDoc(doc) : res;
}

export const trainingRepo = {
  // --- Reads (where: e.g. { athlete_id } or { coach_id }) --------------------
  listGoals: (where, sort = '-created_date') => goals.filter(where, sort),
  listPlans: (where, sort = '-created_date') => plans.filter(where, sort),
  listPlanItems: (where, sort = 'week') => planItems.filter(where, sort),
  listHomework: (where, sort = '-created_date') => homework.filter(where, sort),
  listAssessments: (where, sort = '-created_date') => assessments.filter(where, sort),
  listCheckIns: (where, sort = '-created_date') => checkIns.filter(where, sort),

  // --- Mutations (validated server-side) -------------------------------------
  createGoal: (payload) => mutate('goal.create', payload, 'goal'),
  updateGoal: (goal_id, updates) => mutate('goal.update', { goal_id, ...updates }, 'goal'),

  createPlan: (payload) => mutate('plan.create', payload, 'plan'),
  updatePlan: (plan_id, updates) => mutate('plan.update', { plan_id, ...updates }, 'plan'),

  createPlanItem: (payload) => mutate('planItem.create', payload, 'item'),
  updatePlanItem: (item_id, updates) => mutate('planItem.update', { item_id, ...updates }, 'item'),

  createHomework: (payload) => mutate('homework.create', payload, 'homework'),
  updateHomework: (homework_id, updates) => mutate('homework.update', { homework_id, ...updates }, 'homework'),
  submitHomework: (homework_id, payload = {}) => mutate('homework.submit', { homework_id, ...payload }, 'homework'),

  createAssessment: (payload) => mutate('assessment.create', payload, 'assessment'),
  createCheckIn: (payload) => mutate('checkin.create', payload, 'check_in'),
};
