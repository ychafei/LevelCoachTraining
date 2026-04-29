import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const auditLogRepo = makeRepo(COL.AuditLog);
