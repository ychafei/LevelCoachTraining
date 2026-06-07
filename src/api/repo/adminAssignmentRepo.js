import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const adminAssignmentRepo = makeRepo(COL.AdminAssignment);
