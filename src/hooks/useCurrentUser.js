import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export default function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      // Backfill first_name / last_name in-memory for legacy users who only have full_name.
      // Non-destructive: we do not write back to the server; OnboardingModal will persist
      // real values the next time the user edits their profile.
      if (me && (!me.first_name || !me.last_name) && me.full_name) {
        const parts = me.full_name.trim().split(/\s+/);
        if (!me.first_name) me.first_name = parts[0] || '';
        if (!me.last_name) me.last_name = parts.slice(1).join(' ') || '';
      }
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const isAdmin = user?.role === 'admin';
  const isSuperAdmin = user?.is_super_admin === true;
  const isCoach = user?.role === 'coach' || isAdmin;

  return { user, loading, isAdmin, isSuperAdmin, isCoach, refetch: fetchUser };
}