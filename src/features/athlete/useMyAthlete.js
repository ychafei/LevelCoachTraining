import { useQuery } from '@tanstack/react-query';
import { athleteProfileRepo } from '@/api/repo';

// Resolves the signed-in user's athlete identity. Training/session artifacts
// reference `athlete_id` as either the caller's `athlete_profiles` row id
// (managed/linked athletes) or, for self-managed adults, their `profiles` row
// id — so reads need to match both.
export function useMyAthlete(user) {
  const query = useQuery({
    queryKey: ['athlete', 'identity', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const rows = await athleteProfileRepo.filter({ profile_id: user.id }).catch(() => []);
      return rows?.[0] || null;
    },
  });

  const athleteProfile = query.data || null;
  const athleteIds = [athleteProfile?.id, user?.id].filter(Boolean);
  const sports = Array.isArray(athleteProfile?.sports) && athleteProfile.sports.length > 0
    ? athleteProfile.sports
    : [];

  return {
    loading: query.isLoading && !!user?.id,
    athleteProfile,
    athleteIds,
    sports,
    refetch: query.refetch,
  };
}
