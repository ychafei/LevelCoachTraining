import { makeRepo } from '@/api/repoFactory';
import { COL, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.Conversation);

// Conversations are server-only writable: starting one goes through the
// `messaging` function which resolves the recipient, applies block lists and
// sets per-document read grants (participants + guardians of minors). Reads
// stay direct — listing WITHOUT a participant filter returns exactly the
// conversations the caller can read (per-doc grants scope the result);
// participant-email queries only make sense for admin (label) readers.
export const conversationRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  archive: async (conversation_id, archived = true) => {
    const res = await callFn('messaging', { action: 'archive', conversation_id, archived });
    return res?.conversation ? mapDoc(res.conversation) : res?.conversation;
  },

  // Start (or reuse) a conversation with another member.
  // recipient: { recipient_profile_id?, coach_id?, first_message }
  // Returns { conversation, message }.
  start: async (recipient) => {
    const res = await callFn('messaging', { action: 'start', ...recipient });
    return {
      conversation: res?.conversation ? mapDoc(res.conversation) : res?.conversation,
      message: res?.message ? mapDoc(res.message) : res?.message,
    };
  },
};
