import { makeRepo } from '@/api/repoFactory';

// Notifications are created server-side (booking, orgAdmin, webhooks, …).
// Recipients hold per-document read + update grants — update is scoped to
// mark-read only by convention (the only field the UI ever writes).
const base = makeRepo('notifications');

export const notificationRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // All notifications for a profile, newest first. Per-doc grants mean a
  // non-admin caller only ever sees their own rows anyway.
  listMine: (profileId) => base.filter({ recipient_profile_id: profileId }, '-created_date'),

  // Direct updateDocument — the recipient's per-document update grant allows
  // exactly this.
  markRead: (id) => base.update(id, { read: true }),
};
