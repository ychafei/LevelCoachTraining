import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const athleteProfileRepo = makeRepo(COL.AthleteProfile);
export const guardianAthleteRepo = makeRepo(COL.GuardianAthlete);
export const athleteAvailabilityPreferenceRepo = makeRepo(COL.AthleteAvailabilityPreference);
