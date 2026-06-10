import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, FileX2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { legalAgreementRepo } from '@/api/repo';
import { legalPdfUrl } from '@/lib/legal';
import { formatInstantInTz } from '@/lib/scheduleET';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { EmptyState, SectionCard, SkeletonRows } from '@/features/athlete/portalShared';

const STATUS_BADGES = {
  signed: 'border-green-500/20 bg-green-500/10 text-green-500',
  superseded: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  voided: 'border-border bg-secondary/50 text-muted-foreground',
};

// Reusable signed-agreements list — also used by the parent portal documents
// tab (filtered there to the guardian's own signatures).
export function SignedAgreementsList({ user, athleteNamesById = {} }) {
  const query = useQuery({
    queryKey: ['portal', 'agreements', user?.id],
    enabled: !!user?.id,
    queryFn: () => legalAgreementRepo.filter({ signer_profile_id: user.id }, '-created_date'),
  });

  const agreements = query.data || [];

  return (
    <SectionCard
      title="Signed agreements"
      icon={FileText}
      description="Every document you have signed, including older versions kept for your records."
    >
      {query.isLoading ? (
        <SkeletonRows rows={2} />
      ) : agreements.length === 0 ? (
        <EmptyState
          icon={FileX2}
          title="No signed agreements yet"
          body="Documents you sign will be archived here with a downloadable signed copy."
          compact
        />
      ) : (
        <ul className="space-y-2">
          {agreements.map((agreement) => {
            const boundAthlete = agreement.athlete_id ? athleteNamesById[agreement.athlete_id] : '';
            return (
              <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {agreement.template_key
                        ? agreement.template_key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                        : 'Legal agreement'}
                    </p>
                    <Badge className={STATUS_BADGES[agreement.status] || STATUS_BADGES.voided}>
                      {agreement.status || 'signed'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {agreement.template_version && `v${agreement.template_version} · `}
                    Signed {formatInstantInTz(agreement.signed_at || agreement.created_date)}
                    {boundAthlete && ` · for ${boundAthlete}`}
                  </p>
                </div>
                {agreement.pdf_file_id && (
                  <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs">
                    <a href={legalPdfUrl(agreement.pdf_file_id)} target="_blank" rel="noreferrer">
                      <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Signed copy
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export default function AthleteDocuments({ user }) {
  return (
    <div className="space-y-4">
      <LegalSignaturePanel
        signerRole="athlete"
        title="Athlete Legal Packet"
        description="Review and sign the current athlete participation, safety, and platform documents. Booking requires a complete packet."
      />
      <SignedAgreementsList user={user} />
    </div>
  );
}
