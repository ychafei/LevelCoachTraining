import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

const base = makeRepo(COL.Profile);

export const profileRepo = {
  ...base,
  // Legacy alias kept so existing call sites don't have to change.
  updateById: (id, data) => base.update(id, data),
};
