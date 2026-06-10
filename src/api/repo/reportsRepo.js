import { callFn } from '@/lib/rpc';

// Aggregated money/earnings views, computed server-side from the ledger and
// Stripe records and scoped to the caller's authority by the `reports`
// function.
export const reportsRepo = {
  // Coach: own earnings (admins may pass a coach_id where supported).
  coachEarnings: (payload = {}) => callFn('reports', { action: 'coachEarnings', ...payload }),

  // Org owner/admin: revenue for their organization.
  orgRevenue: (payload = {}) => callFn('reports', { action: 'orgRevenue', ...payload }),

  // Platform admin: cross-platform reconciliation.
  adminReconciliation: (payload = {}) => callFn('reports', { action: 'adminReconciliation', ...payload }),
};
