import { account, databases, functions, DB_ID, COL, Query, ID } from '@/api/appwriteClient';
import { OAuthProvider } from 'appwrite';

// Hydrate the matching `profiles` document for an Appwrite account, then
// merge into a single app-shaped user object. The app reads `.email`,
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

  // First time we see this account (signup or OAuth) — create a minimal
  // profiles row so downstream role checks and admin queries don't trip.
  if (!profile) {
    try {
      profile = await databases.createDocument(DB_ID, COL.Profile, ID.unique(), {
        account_id: acc.$id,
        email: acc.email,
        role: 'user',
        first_name: '',
        last_name: '',
        profile_setup_complete: false,
      });
    } catch (err) {
      console.error('[auth] failed to auto-create profile for', acc.$id, err);
    }
  }

  // Repair a blank/stale profile email. Some accounts (often OAuth) were
  // created when acc.email was empty, leaving profile.email = "" forever —
  // which silently breaks all email-based matching (admin link + self-heal).
  // Backfill it on every login so both duplicate rows become matchable.
  if (
    profile &&
    acc.email &&
    (profile.email || '').trim().toLowerCase() !== acc.email.trim().toLowerCase()
  ) {
    try {
      profile = await databases.updateDocument(DB_ID, COL.Profile, profile.$id, {
        email: acc.email,
      });
    } catch (err) {
      console.error('[auth] failed to repair profile email for', acc.$id, err);
    }
  }

  // Self-heal duplicate-account profiles: if this account's profile has no
  // coach_id but a sibling profile with the same email does (an admin linked
  // the other account), copy the link onto this profile so the coach portal
  // works regardless of which sign-in method was used.
  // Gate auto-reconciliation on a verified email: an unverified account must
  // not inherit coach access just by using someone else's email. OAuth
  // accounts are provider-verified; password accounts verify via /verify-email.
  if (profile && !profile.coach_id && acc.email && acc.emailVerification === true) {
    try {
      // Index-free: list profiles and match email client-side. Appwrite
      // rejects Query.equal on an unindexed attribute, and profiles.email
      // is not indexed. Fine for a small profiles collection.
      const want = acc.email.trim().toLowerCase();
      const sibs = await databases.listDocuments(DB_ID, COL.Profile, [
        Query.limit(200),
      ]);
      const linked = sibs.documents.find(
        (d) => d.$id !== profile.$id
          && (d.email || '').trim().toLowerCase() === want
          && d.coach_id,
      );
      if (linked) {
        const patch = { coach_id: linked.coach_id };
        // A sibling having coach access proves intent; never auto-grant admin.
        if (!profile.role || profile.role === 'user') patch.role = 'coach';
        profile = await databases.updateDocument(DB_ID, COL.Profile, profile.$id, patch);
      }
    } catch (err) {
      console.error('[auth] coach-link self-heal failed for', acc.$id, err);
    }
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

  // Create a brand-new Appwrite account, then immediately sign in. The
  // hydrateProfile() call inside getCurrentUser() will insert the matching
  // profiles row.
  signUp: async (email, password) => {
    await account.create(ID.unique(), email, password);
    await account.createEmailPasswordSession(email, password);
    // Send a verification email (best-effort — never block signup on it).
    try {
      await account.createVerification(`${window.location.origin}/verify-email`);
    } catch (err) {
      console.error('[auth] createVerification failed', err);
    }
    return auth.getCurrentUser();
  },

  // (Re)send the email-verification link for the current account.
  resendVerification: async () => {
    return account.createVerification(`${window.location.origin}/verify-email`);
  },

  // Finish email verification with the userId+secret captured from the URL.
  completeEmailVerification: async (userId, secret) => {
    await account.updateVerification(userId, secret);
    return auth.getCurrentUser();
  },

  // Kick off an OAuth round-trip. Appwrite redirects the browser to the
  // provider; on success the provider redirects back to `successUrl` with an
  // active session cookie. `provider` is one of 'google' | 'microsoft' |
  // 'facebook' | 'apple' (matches the OAuthProvider enum).
  createOAuthSession: (provider, next) => {
    const success = `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const failure = `${window.location.origin}/login?oauth_error=1`;
    const key = String(provider).toLowerCase();
    const resolved = OAuthProvider[key.charAt(0).toUpperCase() + key.slice(1)] || key;
    return account.createOAuth2Session(resolved, success, failure);
  },

  // Send a password-recovery email. Appwrite renders the link using its
  // template, substituting our `url` and appending ?userId=…&secret=…
  sendPasswordRecovery: async (email) => {
    const url = `${window.location.origin}/reset-password`;
    return account.createRecovery(email, url);
  },

  // Finish the recovery flow with the userId+secret captured from the URL.
  completePasswordRecovery: async (userId, secret, newPassword) => {
    return account.updateRecovery(userId, secret, newPassword);
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
  // compatibility with the old legacy wrapper but isn't needed — callers
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
