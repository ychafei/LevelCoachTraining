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

function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);
    const databases = db();
    const meRes = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('account_id', accountId),
      Query.limit(1),
    ]);
    const me = meRes.documents[0];
    if (!me) return res.json({ players: [] });

    const profiles = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('matching_opted_in', true),
      Query.limit(200),
    ]);
    const players = profiles.documents
      .filter((p) => p.email !== me.email)
      .filter((p) => !p.is_minor || p.parent_consent_verified_at)
      .map((p) => ({
        id: p.$id,
        email: p.email,
        first_name: p.first_name || 'Player',
        player_age: ageFromDob(p.dob),
        matching_age_group: p.matching_age_group || '',
      }));
    return res.json({ players });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load matching players.' }, 500);
  }
};
