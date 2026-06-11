import React, { useEffect, useState } from 'react';
import { FilePenLine } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { SignedAgreementsList } from '@/features/athlete/AthleteDocuments';
import { EmptyState, SectionCard, SkeletonRows } from '@/features/athlete/portalShared';

// Guardian legal packet. Guardian-role documents (minor participation
// consent, medical authorization, …) are bound to a specific athlete, so the
// panel is rendered per child via its athleteId prop.
export default function ParentDocuments({ user, family }) {
  const [athleteId, setAthleteId] = useState('');

  useEffect(() => {
    if (!athleteId && family.children.length > 0) setAthleteId(family.children[0].id);
  }, [athleteId, family.children]);

  const selected = family.children.find((child) => child.id === athleteId) || null;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Sign for an athlete"
        icon={FilePenLine}
        description="Guardian documents are signed per athlete. Choose which child you're signing for."
      >
        {family.loading ? (
          <SkeletonRows rows={1} />
        ) : family.children.length === 0 ? (
          <EmptyState
            icon={FilePenLine}
            title="Add a child first"
            body="Guardian documents are bound to a specific athlete. Add your child in the Family tab, then sign their packet here."
            compact
          />
        ) : (
          <div className="max-w-sm">
            <Label htmlFor="documents-athlete">Signing for</Label>
            <Select value={athleteId} onValueChange={setAthleteId}>
              <SelectTrigger id="documents-athlete" className="mt-1 bg-background">
                <SelectValue placeholder="Choose an athlete" />
              </SelectTrigger>
              <SelectContent>
                {family.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {[child.first_name, child.last_name].filter(Boolean).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </SectionCard>

      {selected && (
        <LegalSignaturePanel
          key={selected.id}
          signerRole="guardian"
          athleteId={selected.id}
          title={`Guardian legal packet — ${[selected.first_name, selected.last_name].filter(Boolean).join(' ')}`}
          description="Guardian authority, minor participation, medical, media, and safety documents for this athlete. A complete packet is required before booking for them."
        />
      )}

      <SignedAgreementsList user={user} athleteNamesById={family.childNamesById} />
    </div>
  );
}
