import { useCallback, useEffect, useState } from 'react';
import { coachRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';

// Loads the signed-in coach's own Coach record. Resolution order matches the
// server (`coachSelf`): coaches.user_id === account id first, then the
// profile's coach_id link as a fallback for legacy rows.
export function useMyCoach() {
  const { user } = useAuth();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const accountId = user?.account_id || '';
  const coachId = user?.coach_id || '';

  const load = useCallback(async () => {
    if (!accountId && !coachId) {
      setCoach(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      let row = null;
      if (accountId) {
        const rows = await coachRepo.filter({ user_id: accountId }).catch(() => []);
        row = rows[0] || null;
      }
      if (!row && coachId) {
        row = await coachRepo.get(coachId).catch(() => null);
      }
      setCoach(row);
      return row;
    } catch (err) {
      setError(err);
      setCoach(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [accountId, coachId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await load();
      if (cancelled) return row;
      return row;
    })();
    return () => { cancelled = true; };
  }, [load]);

  return { coach, setCoach, loading, error, reload: load };
}
