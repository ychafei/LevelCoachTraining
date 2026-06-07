import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

const mapDoc = (doc) => ({ ...doc, id: doc.$id });

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

export default async ({ req, res, error }) => {
  try {
    const { coach_id } = body(req);
    if (!coach_id) return res.json({ error: 'coach_id is required.' }, 400);
    const databases = db();
    const [blocks, sessions] = await Promise.all([
      databases.listDocuments(DB_ID, 'coach_blocks', [
        Query.equal('coach_id', coach_id),
        Query.equal('is_active', true),
        Query.limit(200),
      ]),
      databases.listDocuments(DB_ID, 'sessions', [
        Query.equal('coach_id', coach_id),
        Query.limit(500),
      ]),
    ]);
    return res.json({
      blocks: blocks.documents.map(mapDoc),
      sessions: sessions.documents.map(mapDoc).filter((s) => s.status !== 'cancelled'),
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load coach availability.' }, 500);
  }
};
