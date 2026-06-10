import { makeRepo } from '@/api/repoFactory';

// payment_ledger_entries is append-only and written exclusively by payment
// functions/webhooks. Admins (label) can list everything; payees read their
// own legs via per-document grants. No client writes — aggregate views come
// from reportsRepo.
const base = makeRepo('payment_ledger_entries');

export const ledgerRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,
};
