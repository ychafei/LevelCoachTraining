import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const sportRepo = makeRepo(COL.Sport);
export const coachSportProfileRepo = makeRepo(COL.CoachSportProfile);
export const availabilityBlockRepo = makeRepo(COL.AvailabilityBlock);
