import { useAuth } from '@/lib/AuthContext';

// Compatibility wrapper — reads from the single AuthContext source of truth.
// Existing callers keep their shape: { user, loading, isAdmin, isSuperAdmin, isCoach, refetch }.
export default function useCurrentUser() {
  const { user, labels, isLoadingAuth, isAdmin, isSuperAdmin, isCoach, refetchUser } = useAuth();
  return {
    user,
    labels,
    loading: isLoadingAuth,
    isAdmin,
    isSuperAdmin,
    isCoach,
    refetch: refetchUser,
  };
}
