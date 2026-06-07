import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function callerAccountId(req) {
  return req.headers?.['x-appwrite-user-id'] || req.headers?.['X-Appwrite-User-Id'] || req.headers?.['X-Appwrite-User-ID'];
}

function mapDoc(doc) {
  return { ...doc, id: doc.$id };
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const databases = db();
    const profiles = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('account_id', accountId),
      Query.limit(1),
    ]);
    const profile = profiles.documents[0];
    if (!profile?.coach_id && !['admin', 'super_admin'].includes(profile?.role)) {
      return res.json({ error: 'Coach profile required.' }, 403);
    }

    const sessionsRes = profile?.coach_id
      ? await databases.listDocuments(DB_ID, 'sessions', [Query.equal('coach_id', profile.coach_id), Query.limit(500)])
      : await databases.listDocuments(DB_ID, 'sessions', [Query.limit(500)]);
    const creditsRes = await databases.listDocuments(DB_ID, 'session_credits', [Query.limit(500)]);

    const creditsByEmail = new Map();
    for (const credit of creditsRes.documents.map(mapDoc)) {
      const remaining = Math.max(0, Number(credit.total_credits || 0) - Number(credit.used_credits || 0));
      if (!remaining) continue;
      creditsByEmail.set(credit.client_email, (creditsByEmail.get(credit.client_email) || 0) + remaining);
    }

    const byClient = new Map();
    const today = new Date().toISOString().slice(0, 10);
    for (const session of sessionsRes.documents.map(mapDoc)) {
      const email = session.client_email;
      if (!email) continue;
      const current = byClient.get(email) || {
        client_email: email,
        client_name: session.client_name || email,
        age: session.client_age || null,
        total_sessions: 0,
        upcoming_sessions: 0,
        last_session_date: '',
        next_session_date: '',
        next_session_time: '',
        credits_remaining: creditsByEmail.get(email) || 0,
      };
      current.total_sessions += 1;
      if (session.date >= today && session.status !== 'cancelled') {
        current.upcoming_sessions += 1;
        if (!current.next_session_date || session.date < current.next_session_date) {
          current.next_session_date = session.date;
          current.next_session_time = session.start_time || '';
        }
      }
      if (session.date < today && (!current.last_session_date || session.date > current.last_session_date)) {
        current.last_session_date = session.date;
      }
      byClient.set(email, current);
    }

    return res.json({ clients: [...byClient.values()] });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load coach clients.' }, 500);
  }
};
