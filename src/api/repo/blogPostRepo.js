import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const blogPostRepo = makeRepo(COL.BlogPost);
