import { Client, Databases, Query } from 'node-appwrite';

// Public — returns active blocks + non-cancelled sessions for a given coach.
// Body: { coach_id }

export default async ({ req, res, error }) => {
  try {
    const body = req.bodyJson || (req.body ? JSON.parse(req.body) : {});
    const coach_id = body.coach_id;
    if (!coach_id) return res.json({ error: 'Missing coach_id' }, 400);

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);

    const [blocks, sessions] = await Promise.all([
      databases.listDocuments('lctraining', 'coach_blocks', [
        Query.equal('coach_id', coach_id),
        Query.equal('is_active', true),
        Query.limit(500),
      ]),
      databases.listDocuments('lctraining', 'sessions', [
        Query.equal('coach_id', coach_id),
        Query.limit(2000),
      ]),
    ]);

    const activeSessions = sessions.documents.filter(
      (s) => s.status === 'pending' || s.status === 'confirmed'
    );

    return res.json({ blocks: blocks.documents, sessions: activeSessions });
  } catch (err) {
    error(`getCoachAvailability: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
