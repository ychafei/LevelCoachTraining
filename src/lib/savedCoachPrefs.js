export function parseNotificationPrefs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function savedCoachIdsFromPrefs(raw) {
  const ids = parseNotificationPrefs(raw).saved_coach_ids;
  return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
}
