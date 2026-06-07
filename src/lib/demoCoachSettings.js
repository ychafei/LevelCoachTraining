import { siteContentRepo } from '@/api/repo';

export const DEMO_COACH_PROFILES_ENABLED_KEY = 'demo_coach_profiles_enabled';

function parseBool(value, fallback = true) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function localFallback() {
  try {
    return parseBool(window.localStorage.getItem(DEMO_COACH_PROFILES_ENABLED_KEY), true);
  } catch {
    return true;
  }
}

export async function loadDemoCoachProfilesEnabled() {
  try {
    const rows = await siteContentRepo.filter({ key: DEMO_COACH_PROFILES_ENABLED_KEY });
    const match = rows[0];
    if (!match) return localFallback();
    try {
      window.localStorage.setItem(DEMO_COACH_PROFILES_ENABLED_KEY, match.value);
    } catch {}
    return parseBool(match.value, true);
  } catch {
    return localFallback();
  }
}

export async function saveDemoCoachProfilesEnabled(enabled) {
  const value = enabled ? 'true' : 'false';
  try {
    window.localStorage.setItem(DEMO_COACH_PROFILES_ENABLED_KEY, value);
  } catch {}

  const existing = await siteContentRepo.filter({ key: DEMO_COACH_PROFILES_ENABLED_KEY }).catch(() => []);
  if (existing[0]?.id) {
    return siteContentRepo.update(existing[0].id, { value, content_type: 'json' });
  }
  return siteContentRepo.create({
    key: DEMO_COACH_PROFILES_ENABLED_KEY,
    value,
    content_type: 'json',
  });
}
