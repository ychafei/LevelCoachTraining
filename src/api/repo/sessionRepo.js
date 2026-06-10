import { makeRepo } from '@/api/repoFactory';
import { COL, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.Session);

// Sessions are server-only writable. All lifecycle mutations go through the
// `booking` Appwrite Function which validates availability, conflicts, legal
// packets, guardian authority and credits server-side. Reads stay direct —
// participants hold per-document read grants; admins read via label grant.
export const sessionRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Book a session against an existing credit.
  // payload: { coach_id, credit_id, date, start_time, duration_minutes,
  //            athlete_id?, notes? } → session document.
  bookWithCredit: async (payload) => {
    const res = await callFn('booking', { action: 'book', ...payload });
    return res?.session ? mapDoc(res.session) : res?.session;
  },

  // Cancel — server applies the cancellation policy and restores credits
  // when allowed. Returns { session, credit_restored }.
  cancel: async (session_id, reason = '') => {
    const res = await callFn('booking', { action: 'cancel', session_id, reason });
    return {
      session: res?.session ? mapDoc(res.session) : res?.session,
      credit_restored: res?.credit_restored === true,
    };
  },

  // Reschedule — server re-validates the new slot end to end.
  // payload: { session_id, date, start_time, duration_minutes? }
  reschedule: async (payload) => {
    const res = await callFn('booking', { action: 'reschedule', ...payload });
    return res?.session ? mapDoc(res.session) : res?.session;
  },

  complete: async (session_id) => {
    const res = await callFn('booking', { action: 'complete', session_id });
    return res?.session ? mapDoc(res.session) : res?.session;
  },

  noShow: async (session_id) => {
    const res = await callFn('booking', { action: 'no_show', session_id });
    return res?.session ? mapDoc(res.session) : res?.session;
  },
};
