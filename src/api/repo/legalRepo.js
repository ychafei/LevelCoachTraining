import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const legalTemplateBase = makeRepo(COL.LegalTemplate);

export const legalTemplateRepo = {
  ...legalTemplateBase,
  createAdmin: (template) => callFn('adminOps', { action: 'createLegalTemplate', template }),
  updateAdmin: (template_id, updates) => callFn('adminOps', { action: 'updateLegalTemplate', template_id, updates }),
  retireAdmin: (template_id, { reason, confirmation } = { reason: '', confirmation: '' }) =>
    callFn('adminOps', { action: 'retireLegalTemplate', template_id, reason, confirmation }),
  deleteAdmin: (template_id, { reason, confirmation } = { reason: '', confirmation: '' }) =>
    callFn('adminOps', { action: 'deleteLegalTemplate', template_id, reason, confirmation }),
};
export const legalAgreementRepo = makeRepo(COL.LegalAgreement);
export const legalAdminNoteRepo = makeRepo(COL.LegalAdminNote);
