import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const siteContentRepo = makeRepo(COL.SiteContent);
