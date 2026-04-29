import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const sessionRepo = makeRepo(COL.Session);
