import { Client, Databases, Query } from 'node-appwrite';

// Auth-required — returns opted-in profiles other than the caller, with first name + age only.
// Caller identity comes from req.headers['x-appwrite-user-id'] (set by Appwrite when the
// client calls the function with an authenticated session).

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);

    // Get caller's profile to know their email so we can exclude self.
    const myProfile = await databases.listDocuments('lctraining', 'profiles', [
      Query.equal('account_id', userId),
      Query.limit(1),
    ]);
    const myEmail = myProfile.documents[0]?.email || '';

    const optedIn = await databases.listDocuments('lctraining', 'profiles', [
      Query.equal('matching_opted_in', true),
      Query.limit(500),
    ]);

    const calcAge = (dob) => {
      if (!dob) return null;
      return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    };

    const players = optedIn.documents
      .filter((p) => p.email !== myEmail)
      .map((p) => ({
        email: p.email,
        first_name: p.first_name || 'Player',
        player_age: calcAge(p.dob),
        matching_age_group: p.matching_age_group || null,
      }));

    return res.json({ players });
  } catch (err) {
    error(`getMatchingPlayers: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
