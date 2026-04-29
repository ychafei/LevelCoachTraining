import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const coachBlockRepo = makeRepo(COL.CoachBlock);
