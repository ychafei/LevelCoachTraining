export const DEFAULT_PACKAGE_DURATIONS = [30, 45, 60, 75, 90, 120];

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatDurationMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n % 60 === 0) return `${n / 60} hr${n === 60 ? '' : 's'}`;
  if (n > 60) {
    const hours = Math.floor(n / 60);
    const mins = n % 60;
    return mins ? `${hours} hr ${mins} min` : `${hours} hrs`;
  }
  return `${n} min`;
}

export function formatCentsDollars(cents, options = {}) {
  const value = Number(cents || 0) / 100;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: options.alwaysCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function normalizeDurationOptions(pkgOrOptions) {
  const source = Array.isArray(pkgOrOptions)
    ? pkgOrOptions
    : parseJsonArray(pkgOrOptions?.duration_options);
  const fallback = !Array.isArray(pkgOrOptions)
    ? [{
        duration_minutes: Number(pkgOrOptions?.duration_minutes) || 60,
        price_cents: Number(pkgOrOptions?.price_cents) || Math.round((Number(pkgOrOptions?.price) || 0) * 100),
      }]
    : [];
  const rows = source.length ? source : fallback;
  const byDuration = new Map();
  for (const row of rows) {
    const duration = Number(row?.duration_minutes);
    const price = Number(row?.price_cents);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) continue;
    if (!Number.isInteger(price) || price < 0) continue;
    byDuration.set(duration, {
      duration_minutes: duration,
      price_cents: price,
    });
  }
  return [...byDuration.values()].sort((a, b) => a.duration_minutes - b.duration_minutes);
}

export function primaryDurationOption(pkg) {
  return normalizeDurationOptions(pkg)[0] || null;
}

export function durationOptionFor(pkg, minutes) {
  const options = normalizeDurationOptions(pkg);
  if (!options.length) return null;
  const requested = Number(minutes);
  return options.find((option) => option.duration_minutes === requested) || options[0];
}

export function packagePriceCentsForDuration(pkg, minutes) {
  const option = durationOptionFor(pkg, minutes);
  if (option) return option.price_cents;
  const cents = Number(pkg?.price_cents);
  return Number.isInteger(cents) && cents > 0 ? cents : null;
}

export function perSessionCentsForDuration(pkg, minutes) {
  const price = packagePriceCentsForDuration(pkg, minutes);
  if (!Number.isInteger(price) || price <= 0) return null;
  const sessions = Math.max(1, Number(pkg?.sessions) || 1);
  return Math.floor(price / sessions);
}

export function hourlyCentsForOption(pkg, option) {
  if (!option) return null;
  const sessions = Math.max(1, Number(pkg?.sessions) || 1);
  const perSession = option.price_cents / sessions;
  const hours = option.duration_minutes / 60;
  if (!(hours > 0)) return null;
  return Math.round(perSession / hours);
}

export function discountPercentForOption(pkg, option) {
  const options = normalizeDurationOptions(pkg);
  if (options.length < 2 || !option) return 0;
  const base = options[0];
  const baseHourly = hourlyCentsForOption(pkg, base);
  const optionHourly = hourlyCentsForOption(pkg, option);
  if (!baseHourly || !optionHourly || optionHourly >= baseHourly) return 0;
  return Math.round((1 - optionHourly / baseHourly) * 100);
}

