import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const organizationRepo = makeRepo(COL.Organization);
export const organizationMemberRepo = makeRepo(COL.OrganizationMember);
export const organizationCoachRepo = makeRepo(COL.OrganizationCoach);
