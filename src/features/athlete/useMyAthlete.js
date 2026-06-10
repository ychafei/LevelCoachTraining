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

  // Sport identity comes primarily from the self-editable `profiles` fields
  // (user.sports / skill_level / sport_position), falling back to the
  // family-managed `athlete_profiles` row, then a sensible empty state.
  const profileSports = Array.isArray(user?.sports) ? user.sports.filter(Boolean) : [];
  const athleteRowSports = Array.isArray(athleteProfile?.sports) ? athleteProfile.sports.filter(Boolean) : [];
  const sports = profileSports.length > 0 ? profileSports : athleteRowSports;

  const skillLevel = user?.skill_level || athleteProfile?.skill_level || '';
  const position = user?.sport_position || '';

  return {
    loading: query.isLoading && !!user?.id,
    athleteProfile,
    athleteIds,
    sports,
    skillLevel,
    position,
    refetch: query.refetch,
  };
}
