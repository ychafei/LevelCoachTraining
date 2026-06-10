import React, { useCallback, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';

/**
 * Guardian legal packet step: one LegalSignaturePanel per linked child.
 * The signLegalAgreement function requires a guardian-linked athlete_id for
 * every guardian-role signing, so each panel is bound to a specific athlete.
 */
export default function GuardianLegalStep({ athletes = [], onAllComplete = null }) {
  const statusesRef = useRef({});
  const [, setVersion] = useState(0);

  const handleStatus = useCallback((athleteId, status) => {
    statusesRef.current = { ...statusesRef.current, [athleteId]: status };
    setVersion((v) => v + 1);
    if (onAllComplete && athletes.length > 0) {
      const allComplete = athletes.every((athlete) => statusesRef.current[athlete.$id]?.complete === true);
      onAllComplete(allComplete);
    }
  }, [athletes, onAllComplete]);

  if (athletes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <Users className="mx-auto h-8 w-8 text-blue-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-slate-900">Add an athlete first</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-600">
          Guardian legal documents are signed per athlete. Add your athletes in the previous step,
          then sign their packets here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {athletes.map((athlete) => {
        const name = [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') || 'Athlete';
        return (
          <LegalSignaturePanel
            key={athlete.$id}
            signerRole="guardian"
            athleteId={athlete.$id}
            athleteName={name}
            title={`Legal packet for ${name}`}
            description="Sign the guardian authority, participation, medical, media, and safety documents for this athlete."
            onStatusChange={(status) => handleStatus(athlete.$id, status)}
          />
        );
      })}
    </div>
  );
}
