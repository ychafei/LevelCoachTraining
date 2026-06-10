import { useQuery } from '@tanstack/react-query';
import { legalAgreementRepo } from '@/api/repo';
import { agreementMatchesTemplate, listRequiredLegalTemplates } from '@/lib/legal';

// Guardian legal packet status across an ENTIRE family in two reads:
//  1. the required guardian templates (one query, cached app-wide)
//  2. the guardian's own signed agreements (one query)
// Then we compute, per athlete, which required templates are still missing.
// No fabricated verdicts — when templates can't be loaded we report unknown.
export function useGuardianLegal(user, childIds = []) {
  const templatesQuery = useQuery({
    queryKey: ['guardian', 'legalTemplates'],
    enabled: !!user?.id,
    queryFn: () => listRequiredLegalTemplates('guardian'),
    staleTime: 5 * 60 * 1000,
  });

  const agreementsQuery = useQuery({
    queryKey: ['guardian', 'agreements', user?.id],
    enabled: !!user?.id,
    queryFn: () => legalAgreementRepo
      .filter({ signer_profile_id: user.id })
      .catch(() => []),
  });

  const templates = templatesQuery.data || [];
  const agreements = (agreementsQuery.data || []).filter(
    (a) => a.signer_role === 'guardian',
  );

  // Per-athlete missing-template count. `known` is false until templates load,
  // so callers never render a misleading "all signed" before data is in.
  const known = templatesQuery.isSuccess && agreementsQuery.isSuccess && templates.length > 0;
  const missingByChild = {};
  let childrenNeedingDocs = 0;

  if (known) {
    for (const childId of childIds) {
      const forChild = agreements.filter((a) => a.athlete_id === childId);
      const missing = templates.filter(
        (template) => !forChild.some((a) => agreementMatchesTemplate(a, template)),
      );
      missingByChild[childId] = missing.length;
      if (missing.length > 0) childrenNeedingDocs += 1;
    }
  }

  return {
    known,
    loading: (templatesQuery.isLoading || agreementsQuery.isLoading) && !!user?.id,
    hasTemplates: templates.length > 0,
    missingByChild,
    childrenNeedingDocs,
  };
}
