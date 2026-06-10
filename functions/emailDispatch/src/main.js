// emailDispatch — public suppression-list management only.
// The previous open relay (send-email) is removed; this function deliberately
// has NO send action. It only flips unsubscribe_records for an email address.
//
// Authorization: suppressing (or re-subscribing) an address requires proof of
// ownership — either the caller is signed in and the address matches their
// profile email, or the request carries the HMAC token embedded in email
// unsubscribe links (HMAC-SHA256 of the lowercase address keyed with
// UNSUBSCRIBE_SECRET). Without this, anyone could silence another user's
// email preferences or undo their opt-out.
import { Client, Databases, ID, Query } from 'node-appwrite';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function callerAccountId(req) {
  const headers = req.headers || {};
  return headers['x-appwrite-user-id'] || headers['X-Appwrite-User-Id'] || headers['X-Appwrite-User-ID'] || '';
}

export function unsubscribeToken(email, secret) {
  return createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex');
}

function tokenMatches(email, token, secret) {
  if (!token || !secret) return false;
  const expected = Buffer.from(unsubscribeToken(email, secret), 'utf8');
  const provided = Buffer.from(String(token), 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

async function callerOwnsEmail(databases, accountId, email) {
  if (!accountId) return false;
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const profileEmail = (rows.documents[0]?.email || '').trim().toLowerCase();
  return !!profileEmail && profileEmail === email;
}

export default async ({ req, res, error }) => {
  try {
    const payload = body(req);
    const action = payload.action;
    if (action !== 'unsubscribe' && action !== 'resubscribe') {
      return res.json({ error: 'Unknown action.' }, 400);
    }

    const email = String(payload.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.json({ error: 'A valid email is required.' }, 400);
    }
    const reason = String(payload.reason || '').trim().slice(0, 500);

    const databases = db();
    const secret = process.env.UNSUBSCRIBE_SECRET || '';
    const authorized = tokenMatches(email, payload.token, secret)
      || await callerOwnsEmail(databases, callerAccountId(req), email);
    if (!authorized) {
      return res.json({ error: 'Sign in with this email address, or use the unsubscribe link from one of our emails.' }, 403);
    }

    const rows = await databases.listDocuments(DB_ID, 'unsubscribe_records', [
      Query.equal('email', email),
      Query.limit(1),
    ]);
    const existing = rows.documents[0] || null;
    const resubscribed = action === 'resubscribe';

    // Idempotent upsert: one record per email, toggled by the two actions.
    if (existing) {
      if (existing.resubscribed !== resubscribed) {
        await databases.updateDocument(DB_ID, 'unsubscribe_records', existing.$id, {
          resubscribed,
          ...(reason && !resubscribed ? { reason } : {}),
        });
      }
    } else if (!resubscribed) {
      await databases.createDocument(DB_ID, 'unsubscribe_records', ID.unique(), {
        email,
        reason,
        resubscribed: false,
      });
    }

    return res.json({ ok: true, email, unsubscribed: !resubscribed });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not update email preferences.' }, 500);
  }
};
