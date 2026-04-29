import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const matchRequestRepo = makeRepo(COL.MatchRequest);
