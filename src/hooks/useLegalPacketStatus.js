import { useCallback, useEffect, useState } from 'react';
import { getLegalPacketStatus } from '@/lib/legal';

export function useLegalPacketStatus(options) {
  const { user, signerRole, athleteId = '', coachId = '', organizationId = '' } = options || {};
  const [state, setState] = useState({
    loading: true,
    error: '',
    templates: [],
    agreements: [],
    signed: [],
    missing: [],
    complete: false,
    hasTemplates: false,
  });

  const refresh = useCallback(async () => {
    if (!user?.id || !signerRole) {
      setState((current) => ({ ...current, loading: false, complete: false }));
      return null;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const next = await getLegalPacketStatus({ user, signerRole, athleteId, coachId, organizationId });
      setState({ ...next, loading: false, error: '' });
      return next;
    } catch (err) {
      setState((current) => ({
        ...current,
        loading: false,
        error: err?.message || 'Could not load legal packet status.',
      }));
      return null;
    }
  }, [user?.id, signerRole, athleteId, coachId, organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
