import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const coachApplicationRepo = makeRepo(COL.CoachApplication);
