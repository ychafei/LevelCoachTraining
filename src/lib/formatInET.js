// Legacy ET display helpers — thin wrappers around the timezone-aware
// formatters in src/lib/scheduleET.js, pinned to America/Detroit.
//
// Kept so existing call sites (Dashboard, CoachSessions, admin pages, ...)
// continue to work unchanged. New code should use formatInTz/formatTimeInTz
// from '@/lib/scheduleET' and pass session.timezone explicitly.

import {
  DEFAULT_TIMEZONE,
  formatInTz,
  formatTimeInTz,
  formatLongDateInTz,
  formatRangeInTz,
  formatInstantInTz,
} from '@/lib/scheduleET';

export function formatSessionDateTimeET(dateStr, startTime) {
  const text = formatInTz(dateStr, startTime, DEFAULT_TIMEZONE, { timeZoneName: undefined });
  return text ? `${text} ET` : '';
}

export function formatTimeET(dateStr, startTime) {
  const text = formatTimeInTz(dateStr, startTime, DEFAULT_TIMEZONE, { timeZoneName: undefined });
  return text ? `${text} ET` : '';
}

export function formatLongDateET(dateStr) {
  return formatLongDateInTz(dateStr, DEFAULT_TIMEZONE);
}

export function formatDateTimeET(date) {
  const text = formatInstantInTz(date, DEFAULT_TIMEZONE, { weekday: 'short', timeZoneName: undefined });
  return text ? `${text} ET` : '';
}

export function formatSessionRangeET(dateStr, startTime, durationMinutes) {
  const text = formatRangeInTz(dateStr, startTime, durationMinutes, DEFAULT_TIMEZONE);
  if (!text) return '';
  // Strip the trailing zone abbreviation from the range and use the legacy
  // fixed "ET" suffix so existing string handling keeps working.
  const stripped = text.replace(/\s[A-Z]{2,5}$/, '');
  return `${stripped} ET`;
}
