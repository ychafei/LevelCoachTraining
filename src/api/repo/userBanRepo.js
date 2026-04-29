import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const userBanRepo = makeRepo(COL.UserBan);
