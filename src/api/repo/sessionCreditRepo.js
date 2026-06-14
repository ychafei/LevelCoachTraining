import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.SessionCredit);

// Session credits are server-only writable (Stripe webhook creates value lots;
// the booking function reserves/captures cents atomically). Reads stay direct —
// owners/guardians hold per-document read grants; admins read via label.
// Admin grant/revoke goes through the `adminOps` function.
export const sessionCreditRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Admin-only: grant credits to a client profile.
  // payload: { client_profile_id, package_name, total_credits,
  //            session_duration_minutes, amount_cents?, coach_id? }
  grant: (payload) => callFn('adminOps', { action: 'grantCredits', ...payload }),

  // Admin-only: revoke a credit package (requires a reason for the audit log).
  revoke: (credit_id, reason) => callFn('adminOps', { action: 'revokeCredits', credit_id, reason }),

  // Admin-only: freeze/unfreeze and exception adjustments. Balance mutations
  // stay inside adminOps so clients never patch cents directly.
  freeze: (credit_id, reason, request_id = crypto.randomUUID()) =>
    callFn('adminOps', { action: 'freezeCredit', credit_id, reason, request_id }),

  unfreeze: (credit_id, reason = '', request_id = crypto.randomUUID()) =>
    callFn('adminOps', { action: 'unfreezeCredit', credit_id, reason, request_id }),

  adjust: (credit_id, amount_cents, reason, request_id = crypto.randomUUID()) =>
    callFn('adminOps', { action: 'adjustCredit', credit_id, amount_cents, reason, request_id }),

  restore: (credit_id, amount_cents, reason, request_id = crypto.randomUUID()) =>
    callFn('adminOps', { action: 'restoreCredit', credit_id, amount_cents, reason, request_id }),
};
