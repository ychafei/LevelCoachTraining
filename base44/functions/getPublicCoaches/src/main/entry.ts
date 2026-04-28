import { Client, Databases, Query } from 'node-appwrite';

// Public — returns { coaches: [...] } with only is_active=true coaches.
// Replaces the Base44 service-role workaround. Errors return an empty list
// so the home page still renders.

export default async ({ req, res, error }) => {
  try {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const result = await databases.listDocuments('lctraining', 'coaches', [
      Query.equal('is_active', true),
      Query.orderAsc('display_order'),
      Query.limit(100),
    ]);

    return res.json({ coaches: result.documents });
  } catch (err) {
    error(`getPublicCoaches: ${err?.message || err}`);
    return res.json({ coaches: [] });
  }
};
