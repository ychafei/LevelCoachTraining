// Shared earnings math for coach pages and admin tooling.
// Sessions live in ET; date strings are YYYY-MM-DD in ET.

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(n) {
  const v = Number.isFinite(n) ? n : 0;
  return currency.format(v);
}

export function computeFee(coach, gross) {
  const g = Number.isFinite(gross) ? gross : 0;
  if (!coach || g <= 0) return 0;
  const type = coach.platform_fee_type || 'none';
  const val = Number(coach.platform_fee_value) || 0;
  if (type === 'percent') return Math.min(g, Math.max(0, (g * val) / 100));
  if (type === 'fixed') return Math.min(g, Math.max(0, val));
  return 0;
}

export function computeNet(coach, gross) {
  return (Number.isFinite(gross) ? gross : 0) - computeFee(coach, gross);
}

// "Coach keeps $42.50 of a $50 session" — for the admin live preview.
export function describeFee(coach, reference = 50) {
  const fee = computeFee(coach, reference);
  const net = reference - fee;
  if (!fee) return `No platform fee — coach keeps the full ${formatCurrency(reference)}.`;
  return `Coach keeps ${formatCurrency(net)} of a ${formatCurrency(reference)} session (fee ${formatCurrency(fee)}).`;
}

// ---- date helpers (ET) ----

function todayInET(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function monthPrefixET(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit',
  }).format(now);
}

// Monday-start week. Returns YYYY-MM-DD of the Monday of the week containing dateStr.
function isoWeekStart(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1; // days back to Monday
  const ms = d.getTime() - offset * 24 * 60 * 60 * 1000;
  const wk = new Date(ms);
  const y = wk.getUTCFullYear();
  const m = String(wk.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wk.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const ms = d.getTime() + days * 24 * 60 * 60 * 1000;
  const x = new Date(ms);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- aggregation ----

export function summarizeSessions(sessions, coach, opts = {}) {
  const now = opts.now || new Date();
  const month = monthPrefixET(now);
  const today = todayInET(now);
  const list = Array.isArray(sessions) ? sessions : [];

  let mtdGross = 0;
  let mtdFees = 0;
  let mtdNet = 0;
  let paidThisMonthCount = 0;
  let lifetimeNet = 0;
  let lifetimeGross = 0;
  let pendingCashAmount = 0;
  let pendingCashCount = 0;

  for (const s of list) {
    const cancelled = s.status === 'cancelled';
    const completed = s.status === 'completed';
    const price = Number(s.total_price) || 0;
    const inMonth = typeof s.date === 'string' && s.date.startsWith(month);

    if (completed) {
      const fee = computeFee(coach, price);
      const net = price - fee;
      lifetimeGross += price;
      lifetimeNet += net;
      if (inMonth) {
        mtdGross += price;
        mtdFees += fee;
        mtdNet += net;
        if (s.payment_status === 'paid') paidThisMonthCount += 1;
      }
    }

    if (!cancelled && s.payment_method === 'cash' && s.payment_status === 'unpaid') {
      pendingCashAmount += price;
      pendingCashCount += 1;
    }
  }

  // Last 8 ISO weeks (Monday-start), oldest first, for the trend chart.
  const thisMonday = isoWeekStart(today);
  const buckets = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = addDays(thisMonday, -7 * i);
    buckets.push({ weekStart, weekEnd: addDays(weekStart, 6), gross: 0, net: 0, fees: 0, sessions: 0 });
  }
  const earliest = buckets[0].weekStart;
  for (const s of list) {
    if (s.status !== 'completed' || typeof s.date !== 'string') continue;
    if (s.date < earliest) continue;
    const ws = isoWeekStart(s.date);
    const bucket = buckets.find(b => b.weekStart === ws);
    if (!bucket) continue;
    const price = Number(s.total_price) || 0;
    const fee = computeFee(coach, price);
    bucket.gross += price;
    bucket.fees += fee;
    bucket.net += price - fee;
    bucket.sessions += 1;
  }

  return {
    mtdGross,
    mtdFees,
    mtdNet,
    paidThisMonth: paidThisMonthCount,
    lifetimeGross,
    lifetimeNet,
    pendingCashAmount,
    pendingCashCount,
    weeklyTrend: buckets,
    hasFee: !!coach && coach.platform_fee_type && coach.platform_fee_type !== 'none' && Number(coach.platform_fee_value) > 0,
  };
}
