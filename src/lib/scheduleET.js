// Scheduling helpers anchored to America/Detroit (ET).
// All stored session dates (YYYY-MM-DD) and times (HH:mm) are treated as ET wall-clock.
// This avoids drift when the viewing browser is in a different timezone.

const ET_TZ = 'America/Detroit';

// Returns the offset, in minutes, that ET is ahead of UTC at a given instant.
// DST-aware: -240 during EDT, -300 during EST.
function getEtOffsetMinutes(atUtcMs) {
  const date = new Date(atUtcMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Guard: some runtimes emit "24" for midnight
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

// Convert an ET wall-clock date + time ("2026-04-22" + "10:00") to a UTC millisecond instant.
export function sessionStartUtcMs(dateStr, startTime) {
  if (!dateStr || !startTime) return null;
  // Parse as if UTC first; we'll correct by the ET offset for that instant.
  const naiveUtcMs = Date.parse(`${dateStr}T${startTime}:00Z`);
  if (isNaN(naiveUtcMs)) return null;
  const offsetMin = getEtOffsetMinutes(naiveUtcMs);
  // naiveUtcMs expressed in UTC is the same wall time we want in ET,
  // so the true UTC instant = naive - offsetMin minutes.
  return naiveUtcMs - offsetMin * 60000;
}

// True if session start (interpreted as ET wall time) is before "now" (real UTC).
export function isSessionPast(dateStr, startTime, nowMs = Date.now()) {
  const sMs = sessionStartUtcMs(dateStr, startTime);
  if (sMs == null) return false;
  return sMs < nowMs;
}

// True if session start is within the next `hours` hours of now.
// Default 24h is the cancellation-cutoff window.
export function isWithinHoursFromNow(dateStr, startTime, hours = 24, nowMs = Date.now()) {
  const sMs = sessionStartUtcMs(dateStr, startTime);
  if (sMs == null) return false;
  return sMs - nowMs < hours * 60 * 60 * 1000;
}

// Distance from now to session start, in ms (negative if in the past).
export function msUntilSession(dateStr, startTime, nowMs = Date.now()) {
  const sMs = sessionStartUtcMs(dateStr, startTime);
  if (sMs == null) return null;
  return sMs - nowMs;
}
