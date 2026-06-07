import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const legalTemplateRepo = makeRepo(COL.LegalTemplate);
export const legalAgreementRepo = makeRepo(COL.LegalAgreement);
export const legalAdminNoteRepo = makeRepo(COL.LegalAdminNote);
