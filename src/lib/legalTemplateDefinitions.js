// Generated from the Michigan v1.0 legal forms package supplied for LevelCoach
// on 2026-06-15. These are the live signable templates for the legal vault.

import { LEVELCOACH_LEGAL_DOCS } from './legalDocumentText.js';

export const LEGAL_TEMPLATE_SEED = LEVELCOACH_LEGAL_DOCS.map((doc) => ({
  template_key: doc.key,
  role: doc.role,
  version: doc.version,
  title: doc.title,
  jurisdiction: doc.jurisdiction,
  required: true,
  effective_at: `${doc.effectiveDate}T00:00:00.000Z`,
  body: doc.body,
}));

export function templateIdentity(template) {
  return [
    template.template_key,
    template.role,
    template.version,
    template.title,
    template.body,
    template.jurisdiction || '',
  ].join('\n');
}
