// Money/split helpers for the organization portal. All platform money fields
// are integer cents; payout splits are integer basis points (bps).

export const DEFAULT_PLATFORM_FEE_BPS = 1500; // mirrors server env PLATFORM_FEE_BPS default

export function formatCents(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function bpsToPercent(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

export function percentToBps(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return null;
  const bps = Math.round(n * 100);
  if (bps < 0 || bps > 10000) return null;
  return bps;
}

export function bpsLabel(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '—';
  return `${(n / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}
