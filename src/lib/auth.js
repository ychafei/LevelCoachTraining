import { account, databases, functions, DB_ID, COL, Query } from '@/api/appwriteClient';

// Hydrate the matching `profiles` document for an Appwrite account, then
// merge into a single Base44-shaped user object. The app reads `.email`,
// `.role`, `.is_super_admin`, `.first_name`, `.last_name`, `.id` etc., so
// the merge keeps those keys stable.
async function hydrateProfile(acc) {
  if (!acc) return null;
  let profile = null;
  try {
    const res = await databases.listDocuments(DB_ID, COL.Profile, [
      Query.equal('account_id', acc.$id),
      Query.limit(1),
    ]);
    profile = res.documents[0] || null;
  } catch (err) {
    console.error('[auth] failed to load profile for', acc.$id, err);
  }

  // Profile fields take precedence; account email is authoritative. Typed as
  // `any` because the profile schema is dynamic — TS can't see the columns
  // that come back from Appwrite.
  /** @type {any} */
  const merged = Object.assign({}, profile || {}, {
    id: profile ? profile.$id : acc.$id,
    account_id: acc.$id,
    email: acc.email,
    name: profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || acc.name
      : acc.name,
    is_super_admin: profile?.role === 'super_admin',
    created_date: profile?.$createdAt || acc.$createdAt,
    updated_date: profile?.$updatedAt || acc.$updatedAt,
  });

  // Backfill first/last name in-memory from the account name when profile
  // doesn't have them yet (matches the legacy behaviour in AuthContext).
  if (acc.name && (!merged.first_name || !merged.last_name)) {
    const parts = acc.name.trim().split(/\s+/);
    if (!merged.first_name) merged.first_name = parts[0] || '';
    if (!merged.last_name)  merged.last_name  = parts.slice(1).join(' ') || '';
  }

  return merged;
}

export const auth = {
  // Returns the merged profile+account object, or throws if not signed in.
  getCurrentUser: async () => {
    const acc = await account.get();
    return hydrateProfile(acc);
  },

  // Email + password sign-in. Returns the hydrated user.
  signInWithPassword: async (email, password) => {
    await account.createEmailPasswordSession(email, password);
    return auth.getCurrentUser();
  },

  // Send a magic-URL email; the link returns to `${location.origin}/login`
  // by default and `account.updateMagicURLSession` finishes the session.
  sendMagicLink: async (email, returnUrl) => {
    const url = returnUrl || `${window.location.origin}/login`;
    return account.createMagicURLToken({ userId: 'unique()', email, url });
  },

  // Used by the magic-URL return route to finalise the session.
  completeMagicLink: async (userId, secret) => {
    await account.updateMagicURLSession({ userId, secret });
    return auth.getCurrentUser();
  },

  // Drop the current Appwrite session. `returnUrl` is accepted for API
  // compatibility with the old Base44 wrapper but isn't needed — callers
  // navigate themselves.
  signOut: async () => {
    try { await account.deleteSession('current'); } catch { /* already gone */ }
  },

  // Send the user to the in-app login page. Kept synchronous + named the
  // same as the legacy helper so existing call sites keep working.
  signIn: (returnUrl) => {
    const next = returnUrl || window.location.href;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  },

  // Update the current user's profile document (not the Appwrite account).
  updateCurrentUser: async (data) => {
    const acc = await account.get();
    const res = await databases.listDocuments(DB_ID, COL.Profile, [
      Query.equal('account_id', acc.$id),
      Query.limit(1),
    ]);
    const existing = res.documents[0];
    if (!existing) {
      throw new Error('No profile found for current account');
    }
    await databases.updateDocument(DB_ID, COL.Profile, existing.$id, data);
    return auth.getCurrentUser();
  },

  // Admin-only invite. Browser SDK can't create users — this is a thin
  // wrapper around an Appwrite Function. If the function isn't deployed yet
  // it'll throw; the admin UI surfaces the error.
  inviteUser: async (email, role) => {
    const exec = await functions.createExecution(
      'inviteUser',
      JSON.stringify({ email, role }),
      false,
    );
    return JSON.parse(exec.responseBody || '{}');
  },
};
