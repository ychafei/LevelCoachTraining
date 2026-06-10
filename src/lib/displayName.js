// Human-facing name helpers for greetings, avatars, and account menus.
//
// The guiding rule: NEVER surface a user's email (or an email local-part) as
// their name. A merged profile can be sparse early in onboarding — sometimes
// only `email` is set — so every helper falls back to a friendly, generic label
// instead of leaking the address.

// Heuristic: does this string look like an email address? Anything with an "@"
// or a bare local-part that mirrors the stored email is treated as one.
function looksLikeEmail(value) {
  if (typeof value !== 'string') return false;
  return value.includes('@');
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// First token of a free-form name ("Casey Jordan" -> "Casey").
function firstToken(value) {
  return trimmed(value).split(/\s+/).filter(Boolean)[0] || '';
}

/**
 * Short, friendly greeting name. Prefers `first_name`; falls back to the first
 * token of `name` (only when `name` isn't an email); otherwise 'there'.
 * Never returns the email or an email local-part.
 */
export function greetingName(user) {
  if (!user) return 'there';

  const first = trimmed(user.first_name);
  if (first) return first;

  const name = trimmed(user.name);
  if (name && !looksLikeEmail(name)) {
    const token = firstToken(name);
    if (token) return token;
  }

  return 'there';
}

/**
 * "First Last" full name. Falls back to `name` (when it isn't an email);
 * otherwise the generic 'Member'. Never returns the email.
 */
export function fullName(user) {
  if (!user) return 'Member';

  const combined = [trimmed(user.first_name), trimmed(user.last_name)]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (combined) return combined;

  const name = trimmed(user.name);
  if (name && !looksLikeEmail(name)) return name;

  return 'Member';
}

/**
 * Up to two uppercase initials drawn from the user's real name. Falls back to
 * the brand initials 'LC' rather than anything email-derived.
 */
export function initialsOf(user) {
  const source = fullName(user);
  if (source === 'Member') return 'LC';

  const initials = source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return initials || 'LC';
}

export default greetingName;
