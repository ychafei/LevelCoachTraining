import React from 'react';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import PublicLegalDocument from '@/components/legal/PublicLegalDocument';
import { LEGAL_SIGNING_FLOW, legalDocByKey } from '@/lib/legalDocumentText';

const universalTerms = legalDocByKey('platform_universal_account_terms_privacy_esign');

function FlowCell({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{children}</p>
    </div>
  );
}

export default function Terms() {
  usePageMeta({
    title: 'Universal Account Terms, Privacy Notice, and Electronic Signature Consent',
    description: 'LevelCoach Training universal account terms, privacy notice, and electronic-signature consent for Michigan users.',
  });

  return (
    <PublicLegalDocument
      title="Universal Account Terms, Privacy Notice, and Electronic Signature Consent"
      subtitle="Required before any account holder creates or uses a LevelCoach account. Role-specific booking and provider agreements are required at the points shown below."
      document={universalTerms}
    >
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Signing flow">
        <h2 className="text-base font-extrabold text-slate-950">Signing Flow</h2>
        <div className="mt-4 space-y-3">
          {LEGAL_SIGNING_FLOW.map((row) => (
            <article key={row.key} className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">File name</p>
                  <p className="mt-1 break-all text-sm font-extrabold leading-6 text-slate-950">{row.fileName}</p>
                </div>
                <FlowCell label="Who signs it">{row.signer}</FlowCell>
                <FlowCell label="When they sign it">{row.when}</FlowCell>
                <FlowCell label="Where they sign it">{row.where}</FlowCell>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PublicLegalDocument>
  );
}
