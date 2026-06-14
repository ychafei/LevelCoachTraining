import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

// Append-only credit ledger. Writes happen in Stripe/booking/admin functions;
// clients only read rows they have permission to see.
const base = makeRepo(COL.CreditLedgerEntry);

export const creditLedgerRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,
};
