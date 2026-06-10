// Player matching directory. NEVER returns emails — only display name, age
// group, position, and skill level. Minors and adults are kept separate.
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

async function callerIsBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
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
    if (!me) return res.json({ error: 'No profile found for this account.' }, 404);
    if (await callerIsBanned(databases, me)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }
    if (me.matching_opted_in !== true) {
      return res.json({ error: 'Opt in to player matching to see other players.' }, 403);
    }
    const callerIsMinor = me.is_minor === true;
    if (callerIsMinor && !me.parent_consent_verified_at) {
      return res.json({ error: 'A verified parent consent is required for matching.' }, 403);
    }

    const profiles = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('matching_opted_in', true),
      Query.limit(200),
    ]);
    const players = profiles.documents
      .filter((p) => p.$id !== me.$id)
      // Minors without verified parent consent are never listed.
      .filter((p) => p.is_minor !== true || p.parent_consent_verified_at)
      // Age-group separation: minors see minors, adults see adults.
      .filter((p) => (p.is_minor === true) === callerIsMinor)
      .map((p) => ({
        profile_id: p.$id,
        first_name: p.first_name || 'Player',
        age_group: p.matching_age_group || '',
        position: p.position || '',
        skill_level: p.skill_level || '',
      }));
    return res.json({ players });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load matching players.' }, 500);
  }
};
