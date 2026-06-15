import { legalAgreementRepo, legalTemplateRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import { storage } from '@/lib/storage';

export const SIGNER_ROLE_TO_TEMPLATE_ROLE = {
  athlete: 'athlete',
  guardian: 'guardian',
  coach: 'coach',
  organization_admin: 'organization',
  admin: 'admin',
};

export function legalSignerRoleForUser(user) {
  if (!user) return '';
  if (['admin', 'super_admin', 'master_admin', 'master_admin_locked'].includes(user.role)) return 'admin';
  if (user.role === 'coach') return 'coach';
  if (user.onboarding_role === 'organization' || user.primary_organization_id) return 'organization_admin';
  if (user.onboarding_role === 'parent' || user.onboarding_role === 'guardian') return 'guardian';
  return 'athlete';
}

function activeRequired(template) {
  // NOTE: no second parameter — this is used as .filter(activeRequired), and
  // Array.filter passes the element INDEX as arg 2. A `now = Date.now()`
  // default param silently became now=0/1/2..., rejecting every template as
  // "not yet effective" (compared against 1970). Keep `now` internal.
  const now = Date.now();
  if (!template.required) return false;
  if (template.retired_at && new Date(template.retired_at).getTime() <= now) return false;
  if (template.effective_at && new Date(template.effective_at).getTime() > now) return false;
  return true;
}

export async function listRequiredLegalTemplates(signerRole) {
  const templateRole = SIGNER_ROLE_TO_TEMPLATE_ROLE[signerRole] || signerRole;
  if (!templateRole) return [];
  const rows = await legalTemplateRepo.filter({ role: templateRole }).catch(() => []);
  return rows
    .filter(activeRequired)
    .sort((a, b) => `${a.template_key}:${a.version}`.localeCompare(`${b.template_key}:${b.version}`));
}

function matchesEntity(agreement, entity = {}) {
  if (entity.athleteId && agreement.athlete_id !== entity.athleteId) return false;
  if (entity.coachId && agreement.coach_id !== entity.coachId) return false;
  if (entity.organizationId && agreement.organization_id !== entity.organizationId) return false;
  return true;
}

export function agreementMatchesTemplate(agreement, template) {
  if (!agreement || agreement.status !== 'signed') return false;
  if (agreement.template_id === template.id) return true;
  return agreement.template_key === template.template_key
    && agreement.template_version === template.version
    && (!template.checksum || !agreement.template_checksum || agreement.template_checksum === template.checksum);
}

export async function getLegalPacketStatus({ user, signerRole, athleteId = '', coachId = '', organizationId = '' }) {
  if (!user?.id || !signerRole) {
    return { loading: false, templates: [], agreements: [], signed: [], missing: [], complete: false };
  }

  const [templates, agreements] = await Promise.all([
    listRequiredLegalTemplates(signerRole),
    legalAgreementRepo.filter({ signer_profile_id: user.id }).catch(() => []),
  ]);

  const entity = { athleteId, coachId, organizationId };
  const currentAgreements = agreements.filter((agreement) =>
    agreement.signer_role === signerRole && matchesEntity(agreement, entity)
  );

  const signed = [];
  const missing = [];
  for (const template of templates) {
    const agreement = currentAgreements.find((row) => agreementMatchesTemplate(row, template));
    if (agreement) signed.push({ template, agreement });
    else missing.push(template);
  }

  return {
    templates,
    agreements: currentAgreements,
    signed,
    missing,
    complete: templates.length > 0 && missing.length === 0,
    hasTemplates: templates.length > 0,
  };
}

// callFn surfaces the server's `.error` message verbatim on failures, so UIs
// can toast err.message directly.
export async function signLegalAgreement(payload) {
  return callFn('signLegalAgreement', payload);
}

export async function generateLegalAgreementPdf(agreementId) {
  return callFn('generateLegalAgreementPdf', { agreement_id: agreementId });
}

export function legalPdfUrl(fileId) {
  return storage.getFileViewUrl('legal-documents', fileId);
}
