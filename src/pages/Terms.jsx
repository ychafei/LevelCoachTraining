import React from 'react';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import PublicLegalDocument from '@/components/legal/PublicLegalDocument';
import { LEGAL_SIGNING_FLOW, legalDocByKey } from '@/lib/legalDocumentText';

const universalTerms = legalDocByKey('platform_universal_account_terms_privacy_esign');

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
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-bold">File name</th>
                <th className="py-2 pr-4 font-bold">Who signs it</th>
                <th className="py-2 pr-4 font-bold">When they sign it</th>
                <th className="py-2 font-bold">Where they sign it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {LEGAL_SIGNING_FLOW.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-[260px] py-3 pr-4 align-top font-bold text-slate-950">{row.fileName}</td>
                  <td className="py-3 pr-4 align-top">{row.signer}</td>
                  <td className="py-3 pr-4 align-top">{row.when}</td>
                  <td className="py-3 align-top">{row.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PublicLegalDocument>
  );
}
