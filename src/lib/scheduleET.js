// Timezone-aware scheduling helpers.
//
// Historically this module was anchored to America/Detroit (ET). Sessions now
// carry their own IANA timezone (`session.timezone`, copied from the coach at
// booking), so every helper accepts an optional timezone argument. The legacy
// ET-named exports remain as thin wrappers (defaulting to America/Detroit) so
// existing call sites keep working unchanged.
//
// Pure Intl — no external dependencies.

export const DEFAULT_TIMEZONE = 'America/Detroit';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function normalizeTimezone(timezone) {
  const tz = String(timezone || '').trim();
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

export function timeToMinutes(value) {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// Offset (ms) the zone is ahead of UTC at a given instant. DST-aware.
function tzOffsetMs(timeZone, atUtcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(atUtcMs)).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, /** @type {Record<string, string>} */ ({}));
  // Guard: some runtimes emit "24" for midnight.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return asUtc - atUtcMs;
}

// Convert a wall-clock date + time ("2026-04-22" + "10:00") in an IANA
// timezone to a UTC millisecond instant. DST boundaries are refined.
export function zonedStartUtcMs(dateStr, timeStr, timezone = DEFAULT_TIMEZONE) {
  if (!validDate(dateStr) || !validTime(timeStr)) return null;
  const tz = normalizeTimezone(timezone);
  const naive = Date.parse(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(naive)) return null;
  let offset = tzOffsetMs(tz, naive);
  offset = tzOffsetMs(tz, naive - offset);
  return naive - offset;
}

// Legacy name. ET unless a timezone is passed.
export function sessionStartUtcMs(dateStr, startTime, timezone = DEFAULT_TIMEZONE) {
  return zonedStartUtcMs(dateStr, startTime, timezone);
}

// True if a session start (wall time in `timezone`) is before "now" (real UTC).
export function isSessionPast(dateStr, startTime, nowMs = Date.now(), timezone = DEFAULT_TIMEZONE) {
  const sMs = zonedStartUtcMs(dateStr, startTime, timezone);
  if (sMs == null) return false;
  return sMs < nowMs;
}

// True if a session start is within the next `hours` hours of now.
// Default 24h is the cancellation-cutoff / credit-restoration window.
export function isWithinHoursFromNow(dateStr, startTime, hours = 24, nowMs = Date.now(), timezone = DEFAULT_TIMEZONE) {
  const sMs = zonedStartUtcMs(dateStr, startTime, timezone);
  if (sMs == null) return false;
  return sMs - nowMs < hours * 60 * 60 * 1000;
}

// Distance from now to session start, in ms (negative if in the past).
export function msUntilSession(dateStr, startTime, nowMs = Date.now(), timezone = DEFAULT_TIMEZONE) {
  const sMs = zonedStartUtcMs(dateStr, startTime, timezone);
  if (sMs == null) return null;
  return sMs - nowMs;
}

// ── Display ──────────────────────────────────────────────────────────────────

function formatUtcMs(utcMs, timezone, options) {
  if (utcMs == null) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: normalizeTimezone(timezone), ...options }).format(new Date(utcMs));
  } catch {
    return '';
  }
}

// Format a session's stored wall-clock date + time in its own timezone, with
// the timezone abbreviation (e.g. "Wed, Apr 22, 10:00 AM EDT").
export function formatInTz(dateStr, timeStr, timezone = DEFAULT_TIMEZONE, options = {}) {
  const utcMs = zonedStartUtcMs(dateStr, timeStr, timezone);
  return formatUtcMs(utcMs, timezone, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
    ...options,
  });
}

// Time-of-day only (e.g. "10:00 AM EDT").
export function formatTimeInTz(dateStr, timeStr, timezone = DEFAULT_TIMEZONE, options = {}) {
  const utcMs = zonedStartUtcMs(dateStr, timeStr, timezone);
  return formatUtcMs(utcMs, timezone, {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    ...options,
  });
}

// Long date only (e.g. "Wednesday, April 22").
export function formatLongDateInTz(dateStr, timezone = DEFAULT_TIMEZONE) {
  const utcMs = zonedStartUtcMs(dateStr, '00:00', timezone);
  return formatUtcMs(utcMs, timezone, { weekday: 'long', month: 'long', day: 'numeric' });
}

// Start–end time range (e.g. "10:00 AM–11:00 AM EDT").
export function formatRangeInTz(dateStr, startTime, durationMinutes, timezone = DEFAULT_TIMEZONE) {
  const startMs = zonedStartUtcMs(dateStr, startTime, timezone);
  if (startMs == null || !durationMinutes) return '';
  const endMs = startMs + Number(durationMinutes) * 60 * 1000;
  const start = formatUtcMs(startMs, timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
  const end = formatUtcMs(endMs, timezone, { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
  return start && end ? `${start}–${end}` : '';
}

// Short zone label for UI copy (e.g. "EDT"). Empty string on failure.
export function timezoneAbbreviation(timezone, atMs = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalizeTimezone(timezone),
      timeZoneName: 'short',
    }).formatToParts(new Date(atMs));
    return parts.find((part) => part.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

// Format any Date/ISO instant in a timezone.
export function formatInstantInTz(value, timezone = DEFAULT_TIMEZONE, options = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return formatUtcMs(d.getTime(), timezone, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
    ...options,
  });
}

// ── Slot grid from getCoachAvailability ({ windows, busy, availability, timezone })

function weekdayNameFor(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function dayMatches(rowDay, weekday) {
  const a = String(rowDay || '').trim().toLowerCase();
  if (!a) return false;
  const b = weekday.toLowerCase();
  return a === b || a === b.slice(0, 3);
}

// True when the coach has at least one configured bookable window anywhere
// (legacy weekly JSON or availability_blocks rows). When false, the booking
// grid falls back to a generic 08:00–20:00 day.
export function coachHasWindows(av) {
  if (!av) return false;
  if ((av.windows || []).some((row) => validTime(row.start_time) && validTime(row.end_time))) return true;
  const weekly = av.availability || {};
  return Object.values(weekly).some((day) => day?.enabled && validTime(day.start) && validTime(day.end));
}

// Bookable windows ([startMinutes, endMinutes]) for one date. Mirrors the
// server-side `booking` validateSlot window logic.
export function windowsForDate(av, dateStr) {
  if (!av || !validDate(String(dateStr || ''))) return [];
  const weekday = weekdayNameFor(dateStr);
  const out = [];
  const legacy = av.availability?.[weekday];
  if (legacy?.enabled && validTime(legacy.start) && validTime(legacy.end)) {
    out.push([timeToMinutes(legacy.start), timeToMinutes(legacy.end)]);
  }
  for (const row of av.windows || []) {
    if (!validTime(row.start_time) || !validTime(row.end_time)) continue;
    const applies = row.block_type === 'date'
      ? row.date === dateStr
      : (row.date === dateStr || (!row.date && dayMatches(row.day, weekday)));
    if (applies) out.push([timeToMinutes(row.start_time), timeToMinutes(row.end_time)]);
  }
  return out;
}

// Recurring weekly windows keyed by day name — for schedule grids.
export function recurringWindowsByDay(av) {
  const result = {};
  for (const day of WEEK_DAYS) {
    const windows = [];
    const legacy = av?.availability?.[day];
    if (legacy?.enabled && validTime(legacy.start) && validTime(legacy.end)) {
      windows.push({ start: legacy.start, end: legacy.end });
    }
    for (const row of av?.windows || []) {
      if (row.block_type === 'date' || row.date) continue;
      if (!dayMatches(row.day, day)) continue;
      if (validTime(row.start_time) && validTime(row.end_time)) {
        windows.push({ start: row.start_time, end: row.end_time });
      }
    }
    result[day] = windows;
  }
  return result;
}

// Open start times ("HH:MM") for a date, from the coach's windows minus the
// opaque busy ranges. Falls back to 08:00–20:00 ONLY when the coach has no
// configured windows at all. Past slots (in the coach timezone) are excluded.
export function slotsForDate(av, dateStr, durationMinutes = 60, options = {}) {
  const {
    stepMinutes = 30,
    nowMs = Date.now(),
    fallbackStart = '08:00',
    fallbackEnd = '20:00',
  } = options;
  if (!validDate(String(dateStr || ''))) return [];
  const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
  const tz = normalizeTimezone(av?.timezone);

  let windows = windowsForDate(av, dateStr);
  if (windows.length === 0) {
    if (coachHasWindows(av)) return [];
    windows = [[timeToMinutes(fallbackStart), timeToMinutes(fallbackEnd)]];
  }

  const busy = (av?.busy || [])
    .filter((range) => range.date === dateStr)
    .map((range) => [
      timeToMinutes(validTime(range.start_time) ? range.start_time : '00:00'),
      timeToMinutes(validTime(range.end_time) ? range.end_time : '23:59'),
    ]);

  const seen = new Set();
  const out = [];
  for (const [winStart, winEnd] of windows) {
    if (winStart == null || winEnd == null) continue;
    for (let start = winStart; start + duration <= winEnd; start += stepMinutes) {
      const time = minutesToTime(start);
      if (seen.has(time)) continue;
      seen.add(time);
      const end = start + duration;
      if (busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart)) continue;
      const startUtcMs = zonedStartUtcMs(dateStr, time, tz);
      if (startUtcMs !== null && startUtcMs <= nowMs) continue;
      out.push(time);
    }
  }
  return out.sort();
}

export function dateHasOpenSlots(av, dateStr, durationMinutes = 60, options = {}) {
  return slotsForDate(av, dateStr, durationMinutes, options).length > 0;
}
