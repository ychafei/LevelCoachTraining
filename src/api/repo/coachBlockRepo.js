import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.CoachBlock);

// Coach blocks (blackout dates) are server-only writable: the full set is
// replaced through coachSelf.setBlocks. Reads stay direct (collection read:
// users).
export const coachBlockRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Replace the caller's blocks. `blocks` is an array of block objects.
  // Returns { ok, block_ids }.
  setBlocks: (blocks) => callFn('coachSelf', { action: 'setBlocks', blocks }),
};
