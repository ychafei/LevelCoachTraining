import React from 'react';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import PublicLegalDocument from '@/components/legal/PublicLegalDocument';
import { legalDocByKey } from '@/lib/legalDocumentText';

const universalTerms = legalDocByKey('platform_universal_account_terms_privacy_esign');

function slicePrivacyNotice(text) {
  const body = String(text || '');
  const start = body.indexOf('9. Privacy Notice');
  const end = body.indexOf('11. Electronic Records and Electronic Signature Consent');
  if (start < 0) return body;
  return body.slice(start, end > start ? end : undefined).trim();
}

export default function Privacy() {
  usePageMeta({
    title: 'Privacy Notice',
    description: 'LevelCoach Training privacy notice from the universal account terms: data collection, use, sharing, children, retention, requests, email, and SMS/text communications.',
  });

  return (
    <PublicLegalDocument
      title="Privacy Notice"
      subtitle="This Privacy Notice is section 9 and the communications/SMS section of the LevelCoach universal account terms and privacy document."
      document={universalTerms}
      text={slicePrivacyNotice(universalTerms?.body)}
    />
  );
}
