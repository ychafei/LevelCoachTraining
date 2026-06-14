import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

// Delayed-payout obligations are created and settled by the booking function.
// Admin UI reads them to monitor pending/failed release work.
const base = makeRepo(COL.PayoutObligation);

export const payoutObligationRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,
};
