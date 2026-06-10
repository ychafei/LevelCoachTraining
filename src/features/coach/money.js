// Money helpers for the coach portal. All amounts are integer cents.

export function formatCents(cents) {
  const value = (Number.isFinite(Number(cents)) ? Number(cents) : 0) / 100;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// "2026-04" → "Apr 2026" (UTC-safe — no timezone drift on month labels).
export function formatMonthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!match) return String(month || '');
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

// Basis points → "15%" style label.
export function formatBps(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '';
  const pct = n / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
