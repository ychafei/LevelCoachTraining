import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.UnsubscribeRecord);

// unsubscribe_records is server-only writable: all changes go through the
// `emailDispatch` function which requires proof of address ownership (signed
// in with that email, or the HMAC token from an email unsubscribe link).
// Reads stay direct for admin (label) screens.
export const unsubscribeRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // { email, token?, reason? } — token only needed when not signed in as the
  // address owner.
  unsubscribe: ({ email, token = '', reason = '' }) =>
    callFn('emailDispatch', { action: 'unsubscribe', email, token, reason }),

  resubscribe: ({ email, token = '' }) =>
    callFn('emailDispatch', { action: 'resubscribe', email, token }),
};
