import { makeRepo } from '@/api/repoFactory';
import { COL, databases, DB_ID, Query } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.SiteContent);

export const siteContentRepo = {
  ...base,

  // Read a single site_content row's value (string) by key, or null when the
  // key is unset or the collection is unreachable. site_content is read-any.
  getValue: async (key) => {
    try {
      const res = await databases.listDocuments(DB_ID, COL.SiteContent, [
        Query.equal('key', key),
        Query.limit(1),
      ]);
      const value = res.documents[0]?.value;
      return value === undefined || value === null ? null : String(value);
    } catch {
      return null;
    }
  },

  // --- Platform fee admin setters (server-authorized via adminOps) -----------
  // The platform's cut, in basis points. setPlatformFee is super-admin only;
  // setOrgFee is admin-or-super-admin. Both validate 0-5000 server-side.
  setPlatformFee: (platform_fee_bps) =>
    callFn('adminOps', { action: 'setPlatformFee', platform_fee_bps }),
  setOrgFee: (organization_id, platform_fee_bps) =>
    callFn('adminOps', { action: 'setOrgFee', organization_id, platform_fee_bps }),
};
