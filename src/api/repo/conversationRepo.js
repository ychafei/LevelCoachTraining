import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const conversationRepo = makeRepo(COL.Conversation);
