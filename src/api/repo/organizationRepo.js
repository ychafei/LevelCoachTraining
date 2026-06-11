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

  // Pending coach-roster invites addressed to the signed-in coach. The
  // `organization_coaches` rows are keyed by `coach_id` (the Coach record id)
  // and inviteCoach grants the invited coach's account a per-document read,
  // so this is a direct, permission-scoped read. Each row is enriched with the
  // inviting organization's name/slug for display (organizations are read-any).
  listPendingInvitesForCoach: async ({ coachId } = /** @type {{ coachId?: string }} */ ({})) => {
    if (!coachId) return [];
    const res = await databases.listDocuments(DB_ID, COL.OrganizationCoach, [
      Query.equal('coach_id', String(coachId)),
      Query.equal('status', 'invited'),
      Query.limit(50),
    ]);
    const rows = res.documents.map(mapDoc);
    const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))];
    const orgs = await Promise.all(
      orgIds.map((id) => databases.getDocument(DB_ID, COL.Organization, id).then(mapDoc).catch(() => null)),
    );
    const byId = new Map(orgs.filter(Boolean).map((o) => [o.id, o]));
    return rows.map((r) => ({
      ...r,
      organization: byId.get(r.organization_id) || null,
      organization_name: byId.get(r.organization_id)?.name || 'An organization',
    }));
  },

  // Pending org-team (member) invites addressed to the signed-in account.
  // `organization_members` rows are keyed by `profile_id` and inviteMember
  // grants the target account a per-document read. Coaches can also be invited
  // as staff members, so the coach portal surfaces these alongside roster
  // invites.
  listPendingMemberInvites: async ({ profileId } = /** @type {{ profileId?: string }} */ ({})) => {
    if (!profileId) return [];
    const res = await databases.listDocuments(DB_ID, COL.OrganizationMember, [
      Query.equal('profile_id', String(profileId)),
      Query.equal('status', 'invited'),
      Query.limit(50),
    ]);
    const rows = res.documents.map(mapDoc);
    const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))];
    const orgs = await Promise.all(
      orgIds.map((id) => databases.getDocument(DB_ID, COL.Organization, id).then(mapDoc).catch(() => null)),
    );
    const byId = new Map(orgs.filter(Boolean).map((o) => [o.id, o]));
    return rows.map((r) => ({
      ...r,
      organization: byId.get(r.organization_id) || null,
      organization_name: byId.get(r.organization_id)?.name || 'An organization',
    }));
  },
  suspendCoach: (payload) => callFn('orgAdmin', { action: 'suspendCoach', ...payload }),
  setPayoutRule: (payload) => callFn('orgAdmin', { action: 'setPayoutRule', ...payload }),

  // Per-org platform-fee override (the platform's cut for this org's bookings,
  // basis points). This is an admin decision — it goes through adminOps.setOrgFee
  // (admin label), not the org-self-service orgAdmin function.
  setPlatformFee: (organization_id, platform_fee_bps) =>
    callFn('adminOps', { action: 'setOrgFee', organization_id, platform_fee_bps }),

  // --- Packages & Pricing ----------------------------------------------------
  // Org packages are server-only writable through orgAdmin (caller must be an
  // org owner/admin). They carry organization_id and an empty coach_id, and are
  // offered when booking the org's affiliated coaches.
  listPackages: async (organization_id) =>
    (await callFn('orgAdmin', { action: 'listPackages', organization_id }))?.packages || [],
  savePackage: (pkg) => callFn('orgAdmin', { action: 'savePackage', ...pkg }),
  deletePackage: (organization_id, package_id) =>
    callFn('orgAdmin', { action: 'deletePackage', organization_id, package_id }),

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
