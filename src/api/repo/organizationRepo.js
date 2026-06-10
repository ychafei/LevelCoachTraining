import { makeRepo } from '@/api/repoFactory';
import { COL, Query, databases, DB_ID, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const orgBase = makeRepo(COL.Organization);
const memberBase = makeRepo(COL.OrganizationMember);
const coachBase = makeRepo(COL.OrganizationCoach);

// Organizations and their member/coach link rows are server-only writable:
// every mutation goes through the `orgAdmin` function which verifies org
// membership + role before acting. Reads stay direct (organizations: read
// any; member/coach rows: per-document grants for the member/coach + org
// admins, label read for platform admins).

export const organizationRepo = {
  list: orgBase.list,
  filter: orgBase.filter,
  get: orgBase.get,

  // Create an organization — the caller becomes org_owner server-side (the
  // owner membership row is created by the function too).
  create: async (payload) => {
    const res = await callFn('orgAdmin', { action: 'create', ...payload });
    return res?.organization ? mapDoc(res.organization) : res?.organization;
  },

  // Whitelisted org profile updates.
  update: async (organization_id, updates) => {
    const res = await callFn('orgAdmin', { action: 'update', organization_id, ...updates });
    return res?.organization ? mapDoc(res.organization) : res;
  },

  // Publication is server-gated (org legal packet + Connect ready).
  publish: (organization_id) => callFn('orgAdmin', { action: 'publish', organization_id }),

  // --- Coach roster ----------------------------------------------------------
  inviteCoach: (payload) => callFn('orgAdmin', { action: 'inviteCoach', ...payload }),
  acceptInvite: (payload) => callFn('orgAdmin', { action: 'acceptInvite', ...payload }),
  removeCoach: (payload) => callFn('orgAdmin', { action: 'removeCoach', ...payload }),
  suspendCoach: (payload) => callFn('orgAdmin', { action: 'suspendCoach', ...payload }),
  setPayoutRule: (payload) => callFn('orgAdmin', { action: 'setPayoutRule', ...payload }),

  // --- Members ---------------------------------------------------------------
  inviteMember: (payload) => callFn('orgAdmin', { action: 'inviteMember', ...payload }),
  acceptMemberInvite: (payload) => callFn('orgAdmin', { action: 'acceptMemberInvite', ...payload }),
  setMemberRole: (payload) => callFn('orgAdmin', { action: 'setMemberRole', ...payload }),
  removeMember: (payload) => callFn('orgAdmin', { action: 'removeMember', ...payload }),
};

export const organizationMemberRepo = {
  list: memberBase.list,
  filter: memberBase.filter,
  get: memberBase.get,

  // Compatibility shim: orgAdmin.create already inserts the org_owner
  // membership row server-side, so "creating" the owner membership resolves
  // to the existing server-created row instead of a (forbidden) direct write.
  // Any other membership must go through organizationRepo.inviteMember.
  create: async ({ organization_id, profile_id }) => {
    const rows = await databases.listDocuments(DB_ID, COL.OrganizationMember, [
      Query.equal('organization_id', organization_id),
      Query.equal('profile_id', profile_id),
      Query.limit(1),
    ]);
    const existing = rows.documents[0];
    if (!existing) {
      throw new Error('Memberships are created server-side. Use organizationRepo.inviteMember.');
    }
    return mapDoc(existing);
  },
};

export const organizationCoachRepo = {
  list: coachBase.list,
  filter: coachBase.filter,
  get: coachBase.get,
};
