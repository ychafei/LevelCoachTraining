import { Client, Databases, Users, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const MAX_ROWS = 5000;

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), users: new Users(client) };
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];
    if (value) return String(value);
  }
  return '';
}

function callerAccountId(req) {
  return header(req, ['x-appwrite-user-id', 'X-Appwrite-User-Id', 'X-Appwrite-User-ID']);
}

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function callerIsBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

// Cursor-paginated read of a collection (collections may not exist yet —
// callers treat failures as empty).
async function listAll(databases, collectionId, queries, max = MAX_ROWS) {
  const out = [];
  let cursor = null;
  try {
    while (out.length < max) {
      const page = await databases.listDocuments(DB_ID, collectionId, [
        ...queries,
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ]);
      out.push(...page.documents);
      if (page.documents.length < 100) break;
      cursor = page.documents[page.documents.length - 1].$id;
    }
  } catch {
    return out;
  }
  return out;
}

function monthOf(value) {
  return String(value || '').slice(0, 7) || 'unknown';
}

function addCents(map, key, field, cents) {
  if (!Number.isFinite(cents)) return;
  if (!map.has(key)) map.set(key, {});
  const bucket = map.get(key);
  bucket[field] = (bucket[field] || 0) + cents;
}

// Earnings rollup shared by coachEarnings and orgRevenue.
async function ownerEarnings(databases, ownerType, ownerId) {
  const ledger = await listAll(databases, 'payment_ledger_entries', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', ownerId),
  ]);

  const monthly = new Map();
  const byType = {};
  let earned = 0;
  for (const entry of ledger) {
    const cents = Number(entry.amount_cents);
    if (!Number.isInteger(cents)) continue;
    const type = entry.type || 'other';
    byType[type] = (byType[type] || 0) + cents;
    earned += cents;
    addCents(monthly, monthOf(entry.$createdAt), 'earned_cents', cents);
  }

  // Real Stripe transfers to this owner's connected account.
  const accounts = await listAll(databases, 'stripe_connected_accounts', [
    Query.equal('owner_type', ownerType),
    Query.equal('owner_id', ownerId),
  ], 10);
  let paid = 0;
  let pending = 0;
  let reversed = 0;
  for (const account of accounts) {
    const transfers = await listAll(databases, 'stripe_transfer_records', [
      Query.equal('destination_account_id', account.stripe_account_id),
    ]);
    for (const transfer of transfers) {
      const cents = Number(transfer.amount);
      if (!Number.isInteger(cents)) continue;
      if (transfer.status === 'paid') paid += cents;
      else if (transfer.status === 'pending') pending += cents;
      else if (transfer.status === 'reversed') reversed += cents;
    }
  }

  return { ledger_by_type: byType, earned, paid, pending, reversed, monthly };
}

function monthlyToArray(monthly) {
  return [...monthly.entries()]
    .map(([month, values]) => ({ month, ...values }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

// --- coachEarnings ----------------------------------------------------------------

async function coachEarnings(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
  const coach = rows.documents[0];
  if (!coach) return { status: 403, body: { error: 'No coach record is linked to this account.' } };

  const earnings = await ownerEarnings(databases, 'coach', coach.$id);
  const completed = await listAll(databases, 'sessions', [
    Query.equal('coach_id', coach.$id),
    Query.equal('status', 'completed'),
  ]);
  for (const session of completed) {
    const month = monthOf(session.date);
    if (!earnings.monthly.has(month)) earnings.monthly.set(month, {});
    const bucket = earnings.monthly.get(month);
    bucket.sessions_completed = (bucket.sessions_completed || 0) + 1;
  }

  return {
    status: 200,
    body: {
      coach_id: coach.$id,
      totals: {
        earned_cents: earnings.earned,
        transfers_paid_cents: earnings.paid,
        transfers_pending_cents: earnings.pending,
        transfers_reversed_cents: earnings.reversed,
        sessions_completed: completed.length,
        by_type: earnings.ledger_by_type,
      },
      pending_cents: earnings.pending,
      monthly: monthlyToArray(earnings.monthly),
    },
  };
}

// --- orgRevenue -------------------------------------------------------------------

async function orgRevenue(databases, profile, payload) {
  const orgId = String(payload.organization_id || profile.primary_organization_id || '');
  if (!orgId) return { status: 400, body: { error: 'organization_id is required.' } };
  const members = await databases.listDocuments(DB_ID, 'organization_members', [
    Query.equal('organization_id', orgId),
    Query.equal('profile_id', profile.$id),
    Query.equal('status', 'active'),
    Query.limit(1),
  ]);
  const member = members.documents[0];
  if (!member || !['org_owner', 'org_admin'].includes(member.role)) {
    return { status: 403, body: { error: 'Organization owner or admin access required.' } };
  }

  const earnings = await ownerEarnings(databases, 'org', orgId);
  return {
    status: 200,
    body: {
      organization_id: orgId,
      totals: {
        earned_cents: earnings.earned,
        transfers_paid_cents: earnings.paid,
        transfers_pending_cents: earnings.pending,
        transfers_reversed_cents: earnings.reversed,
        by_type: earnings.ledger_by_type,
      },
      pending_cents: earnings.pending,
      monthly: monthlyToArray(earnings.monthly),
    },
  };
}

// --- adminReconciliation ------------------------------------------------------------

async function adminReconciliation(databases) {
  const ledger = await listAll(databases, 'payment_ledger_entries', []);
  const monthly = new Map();
  const totalsByType = {};
  const byOwner = new Map(); // `${owner_type}:${owner_id}` -> cents
  for (const entry of ledger) {
    const cents = Number(entry.amount_cents);
    if (!Number.isInteger(cents)) continue;
    const type = entry.type || 'other';
    totalsByType[type] = (totalsByType[type] || 0) + cents;
    addCents(monthly, monthOf(entry.$createdAt), `${type}_cents`, cents);
    if (entry.owner_type && entry.owner_id) {
      const key = `${entry.owner_type}:${entry.owner_id}`;
      byOwner.set(key, (byOwner.get(key) || 0) + cents);
    }
  }

  const payments = await listAll(databases, 'stripe_payment_records', []);
  let refunded = 0;
  let disputedCount = 0;
  let paidCount = 0;
  for (const payment of payments) {
    const refundedCents = Number(payment.refunded_amount);
    if (Number.isInteger(refundedCents) && refundedCents > 0) refunded += refundedCents;
    if (payment.status === 'disputed') disputedCount += 1;
    if (['paid', 'partially_refunded', 'refunded'].includes(payment.status)) paidCount += 1;
  }

  const credits = await listAll(databases, 'session_credits', []);
  let heldClientCredits = 0;
  let reservedCredits = 0;
  let spentReleasedCredits = 0;
  for (const credit of credits) {
    const remaining = Number(credit.remaining_amount_cents ?? credit.available_amount_cents);
    const reserved = Number(credit.reserved_amount_cents);
    const spent = Number(credit.spent_amount_cents ?? credit.earned_amount_cents);
    if (Number.isInteger(remaining) && remaining > 0) heldClientCredits += remaining;
    if (Number.isInteger(reserved) && reserved > 0) reservedCredits += reserved;
    if (Number.isInteger(spent) && spent > 0) spentReleasedCredits += spent;
  }

  const payoutObligations = await listAll(databases, 'payout_obligations', []);
  const failedPayoutReleases = payoutObligations.filter((row) => row.status === 'failed').length;
  const pendingPayoutReleases = payoutObligations.filter((row) => ['pending', 'held', 'processing', 'failed'].includes(row.status)).length;

  const breakdown = { coaches: [], orgs: [] };
  for (const [key, cents] of byOwner.entries()) {
    const [ownerType, ownerId] = key.split(':');
    const row = { owner_id: ownerId, total_cents: cents };
    if (ownerType === 'coach') breakdown.coaches.push(row);
    else if (ownerType === 'org') breakdown.orgs.push(row);
  }
  breakdown.coaches.sort((a, b) => b.total_cents - a.total_cents);
  breakdown.orgs.sort((a, b) => b.total_cents - a.total_cents);

  const recentRows = await databases.listDocuments(DB_ID, 'payment_ledger_entries', [
    Query.orderDesc('$createdAt'),
    Query.limit(50),
  ]).catch(() => ({ documents: [] }));
  const recentCreditRows = await databases.listDocuments(DB_ID, 'credit_ledger_entries', [
    Query.orderDesc('$createdAt'),
    Query.limit(50),
  ]).catch(() => ({ documents: [] }));
  const recentPaymentRows = await databases.listDocuments(DB_ID, 'stripe_payment_records', [
    Query.orderDesc('$createdAt'),
    Query.limit(25),
  ]).catch(() => ({ documents: [] }));

  return {
    status: 200,
    body: {
      totals: {
        gross_cents: totalsByType.charge || 0,
        platform_fee_cents: totalsByType.platform_fee || 0,
        coach_payout_cents: totalsByType.coach_payout || 0,
        org_payout_cents: totalsByType.org_payout || 0,
        refunded_cents: refunded,
        disputed_count: disputedCount,
        paid_payment_count: paidCount,
        total_held_client_credits_cents: heldClientCredits,
        total_reserved_cents: reservedCredits,
        total_spent_released_cents: spentReleasedCredits,
        failed_payout_releases: failedPayoutReleases,
        pending_payout_releases: pendingPayoutReleases,
        stripe_payment_record_count: payments.length,
        payment_ledger_entry_count: ledger.length,
        credit_ledger_entry_count: recentCreditRows.total ?? recentCreditRows.documents.length,
        by_type: totalsByType,
      },
      monthly: monthlyToArray(monthly),
      coaches: breakdown.coaches,
      orgs: breakdown.orgs,
      recent_ledger: recentRows.documents.map((entry) => ({
        id: entry.$id,
        entry_type: entry.type || '',
        owner_type: entry.owner_type || '',
        owner_id: entry.owner_id || '',
        amount_cents: Number.isInteger(Number(entry.amount_cents)) ? Number(entry.amount_cents) : 0,
        payment_record_id: entry.payment_record_id || '',
        created_at: entry.$createdAt,
      })),
      recent_credit_ledger: recentCreditRows.documents.map((entry) => ({
        id: entry.$id,
        entry_type: entry.type || '',
        credit_id: entry.credit_id || entry.credit_lot_id || '',
        payment_record_id: entry.payment_record_id || '',
        session_id: entry.session_id || '',
        amount_cents: Number.isInteger(Number(entry.amount_cents)) ? Number(entry.amount_cents) : 0,
        created_at: entry.$createdAt,
      })),
      recent_payments: recentPaymentRows.documents.map((payment) => ({
        id: payment.$id,
        amount_cents: Number.isInteger(Number(payment.amount)) ? Number(payment.amount) : 0,
        status: payment.status || payment.state || '',
        state: payment.state || '',
        credit_id: payment.credit_lot_id || payment.credit_id || '',
        checkout_session_id: payment.checkout_session_id || '',
        payment_intent_id: payment.payment_intent_id || '',
        created_at: payment.$createdAt,
      })),
    },
  };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for this account.' }, 404);
    if (await callerIsBanned(databases, profile)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    const payload = body(req);
    let result;
    switch (payload.action) {
      case 'coachEarnings':
        result = await coachEarnings(databases, accountId);
        break;
      case 'orgRevenue':
        result = await orgRevenue(databases, profile, payload);
        break;
      case 'adminReconciliation': {
        const account = await users.get(accountId).catch(() => null);
        const labels = account?.labels || [];
        if (!labels.includes('admin') && !labels.includes('superadmin')) {
          return res.json({ error: 'Admin access required.' }, 403);
        }
        result = await adminReconciliation(databases);
        break;
      }
      default:
        result = { status: 400, body: { error: 'Unknown action.' } };
    }
    return res.json(result.body, result.status);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Report request failed.' }, 500);
  }
};
