import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'levelcoach';

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function mapDoc(doc) {
  if (!doc) return doc;
  let availability = doc.availability;
  if (typeof availability === 'string' && availability.trim()) {
    try { availability = JSON.parse(availability); } catch { availability = {}; }
  }
  return { ...doc, id: doc.$id, availability };
}

export default async ({ res, error }) => {
  try {
    const databases = db();
    const coaches = await databases.listDocuments(DB_ID, 'coaches', [
      Query.equal('is_active', true),
      Query.orderAsc('display_order'),
      Query.limit(100),
    ]);
    return res.json({ coaches: coaches.documents.map(mapDoc) });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load public coaches.' }, 500);
  }
};
