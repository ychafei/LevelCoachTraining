import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.UserBan);

// Bans are enacted through the `adminOps` function (which also audits and
// enforces the ban at login + in every function). Reads stay direct for
// admin (label) screens.
export const userBanRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  ban: (profile_id, reason, permanent = false) =>
    callFn('adminOps', { action: 'banUser', profile_id, reason, permanent }),

  unban: (profile_id) => callFn('adminOps', { action: 'unbanUser', profile_id }),
};
