import { databases, DB_ID, Query, ID, parseSort, whereToQueries, mapDoc } from '@/api/appwriteClient';

const DEFAULT_LIMIT = 500;

// Appwrite rejects writes containing system ($-prefixed) attributes or the
// derived aliases mapDoc adds (id/created_date/updated_date). Strip them so
// call sites can safely round-trip a mapped doc back into update/create.
function toWritable(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (k.startsWith('$')) continue;
    if (k === 'id' || k === 'created_date' || k === 'updated_date') continue;
    out[k] = v;
  }
  return out;
}

// Create a app-shaped repo (list/filter/create/update/delete) backed by an
// Appwrite collection. Documents are normalised via mapDoc so call sites can
// keep using `.id`, `.created_date`, `.updated_date`.
export function makeRepo(collectionId) {
  return {
    list: async (sort) => {
      const queries = [...parseSort(sort), Query.limit(DEFAULT_LIMIT)];
      const res = await databases.listDocuments(DB_ID, collectionId, queries);
      return res.documents.map(mapDoc);
    },

    filter: async (where, sort) => {
      const queries = [
        ...whereToQueries(where),
        ...parseSort(sort),
        Query.limit(DEFAULT_LIMIT),
      ];
      const res = await databases.listDocuments(DB_ID, collectionId, queries);
      return res.documents.map(mapDoc);
    },

    get: async (id) => mapDoc(await databases.getDocument(DB_ID, collectionId, id)),

    create: async (data) =>
      mapDoc(await databases.createDocument(DB_ID, collectionId, ID.unique(), toWritable(data))),

    update: async (id, data) =>
      mapDoc(await databases.updateDocument(DB_ID, collectionId, id, toWritable(data))),

    delete: async (id) => {
      await databases.deleteDocument(DB_ID, collectionId, id);
    },
  };
}
