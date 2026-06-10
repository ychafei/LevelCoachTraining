// Money/formatting helpers for admin surfaces. All platform money fields are
// integer cents; splits are integer basis points.

export function formatCents(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function bpsToPercentLabel(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '—';
  return `${(n / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function shortId(value, head = 10, tail = 4) {
  if (!value) return '—';
  const str = String(value);
  return str.length > head + tail + 2 ? `${str.slice(0, head)}...${str.slice(-tail)}` : str;
}
