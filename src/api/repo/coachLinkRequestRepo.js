import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const coachLinkRequestRepo = makeRepo(COL.CoachLinkRequest);
