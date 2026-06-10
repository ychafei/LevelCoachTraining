import { makeRepo } from '@/api/repoFactory';
import { COL, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.Profile);

// Profiles are server-only writable: every mutation goes through the
// `accountProfile` function (field-whitelisted, own profile only). Admin
// profile edits (role, coach link, bans, credits) go through `adminOps`
// actions exposed on the relevant repos. Reads stay direct — users hold a
// per-document read grant on their own row; admins read via label grant.
export const profileRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Update the CALLER'S OWN profile through the server whitelist. The id is
  // verified against the caller's actual profile so a stale call site can
  // never silently write the wrong target.
  update: async (id, data) => {
    const ensured = await callFn('accountProfile', { action: 'ensure' });
    const ownId = ensured?.profile?.$id;
    if (id && ownId && id !== ownId) {
      throw new Error('Only your own profile can be updated. Admin profile changes go through adminOps actions.');
    }
    const res = await callFn('accountProfile', { action: 'update', ...data });
    return res?.profile ? mapDoc(res.profile) : res?.profile;
  },

  // Self-service update without an id (preferred for new call sites).
  updateSelf: async (data) => {
    const res = await callFn('accountProfile', { action: 'update', ...data });
    return res?.profile ? mapDoc(res.profile) : res?.profile;
  },

  // Legacy alias kept so existing call sites don't have to change.
  updateById: (id, data) => profileRepo.update(id, data),
};
