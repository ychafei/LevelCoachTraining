import { makeRepo } from '@/api/repoFactory';
import { client, COL, DB_ID, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.Message);

// Messages are server-only writable: sending goes through the `messaging`
// function (sender bound server-side, participant + block checks, per-doc
// permissions). Reads stay direct via per-document grants, and the realtime
// subscription keeps working because Appwrite emits events for any document
// the subscriber can read.
export const messageRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Send a message into an existing conversation. Returns the created
  // message document (app-shaped).
  send: async (conversation_id, content) => {
    const res = await callFn('messaging', { action: 'send', conversation_id, content });
    return res?.message ? mapDoc(res.message) : res?.message;
  },

  markRead: (conversation_id) => callFn('messaging', { action: 'markRead', conversation_id }),

  // Start a new conversation — see conversationRepo.start for the richer
  // return shape; kept here too so messaging call sites have one import.
  startConversation: async (recipient) => {
    const res = await callFn('messaging', { action: 'start', ...recipient });
    return {
      conversation: res?.conversation ? mapDoc(res.conversation) : res?.conversation,
      message: res?.message ? mapDoc(res.message) : res?.message,
    };
  },

  // Report a conversation or message to the safety team.
  // payload: { conversation_id?, message_id?, category, detail? }
  report: (payload) => callFn('messaging', { action: 'report', ...payload }),

  // Block / unblock another member by profile id.
  block: (profile_id) => callFn('messaging', { action: 'block', profile_id }),
  unblock: (profile_id) => callFn('messaging', { action: 'unblock', profile_id }),

  // Realtime feed for the messages collection. The Appwrite web SDK invokes
  // the callback with { events: string[], channels, timestamp, payload } —
  // normalise that into { events, type, payload } where `type` is one of
  // 'create' | 'update' | 'delete' and payload is mapDoc()'d. Returns the
  // unsubscribe function.
  subscribe: (cb) => {
    const channel = `databases.${DB_ID}.collections.${COL.Message}.documents`;
    return client.subscribe(channel, (raw) => {
      const events = Array.isArray(raw?.events) ? raw.events : [];
      let type = '';
      if (events.some((e) => e.endsWith('.create'))) type = 'create';
      else if (events.some((e) => e.endsWith('.update'))) type = 'update';
      else if (events.some((e) => e.endsWith('.delete'))) type = 'delete';
      cb({
        events,
        type,
        payload: mapDoc(raw?.payload),
      });
    });
  },
};
