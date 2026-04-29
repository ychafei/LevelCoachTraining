import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const sessionCreditRepo = makeRepo(COL.SessionCredit);
