import { makeRepo } from '@/api/repoFactory';
import { client, COL, DB_ID, mapDoc } from '@/api/appwriteClient';

const base = makeRepo(COL.Message);

export const messageRepo = {
  ...base,
  // Realtime feed for the messages collection. `cb` receives a Base44-shaped
  // event: { event, payload } where payload is mapDoc()'d. Returns the
  // unsubscribe function.
  subscribe: (cb) => {
    const channel = `databases.${DB_ID}.collections.${COL.Message}.documents`;
    return client.subscribe(channel, (raw) => {
      cb({
        event: raw.events?.[0],
        payload: mapDoc(raw.payload),
      });
    });
  },
};
