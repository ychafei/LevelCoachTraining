// Money always renders from integer cents.
export function formatUsdFromCents(cents, { dropZeroCents = true } = {}) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '';
  const dollars = value / 100;
  const hasCents = Math.round(value) % 100 !== 0;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dropZeroCents && !hasCents ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default formatUsdFromCents;
