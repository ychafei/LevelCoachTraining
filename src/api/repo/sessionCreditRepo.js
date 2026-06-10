import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.SessionCredit);

// Session credits are server-only writable (Stripe webhook creates them;
// the booking function decrements them atomically). Reads stay direct —
// owners/guardians hold per-document read grants; admins read via label.
// Admin grant/revoke goes through the `adminOps` function.
export const sessionCreditRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Admin-only: grant credits to a client profile.
  // payload: { client_profile_id, package_name, total_credits,
  //            session_duration_minutes, coach_id? }
  grant: (payload) => callFn('adminOps', { action: 'grantCredits', ...payload }),

  // Admin-only: revoke a credit package (requires a reason for the audit log).
  revoke: (credit_id, reason) => callFn('adminOps', { action: 'revokeCredits', credit_id, reason }),
};
