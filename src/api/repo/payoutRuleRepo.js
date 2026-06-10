import { makeRepo } from '@/api/repoFactory';

// Payout rules (per org↔coach revenue split, basis points) are written only
// through orgAdmin.setPayoutRule (see organizationRepo). Reads stay direct —
// per-document grants cover org admins + the coach; platform admins read via
// label.
const base = makeRepo('payout_rules');

export const payoutRuleRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // All rules for an organization.
  listByOrganization: (organizationId) => base.filter({ organization_id: organizationId }),
};
