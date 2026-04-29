import { databases, DB_ID, Query, ID, parseSort, whereToQueries, mapDoc } from '@/api/appwriteClient';

const DEFAULT_LIMIT = 500;

// Create a Base44-shaped repo (list/filter/create/update/delete) backed by an
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
      mapDoc(await databases.createDocument(DB_ID, collectionId, ID.unique(), data)),

    update: async (id, data) =>
      mapDoc(await databases.updateDocument(DB_ID, collectionId, id, data)),

    delete: async (id) => {
      await databases.deleteDocument(DB_ID, collectionId, id);
    },
  };
}
