import { account, databases, DB_ID, COL, Query, ID } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';
import { OAuthProvider } from 'appwrite';

// Hydrate the caller's `profiles` document through the server-side
// `accountProfile` function (clients can no longer create or repair profile
// rows directly — the collection is server-only writable), then merge account
// + profile into a single app-shaped user object. The app reads `.email`,
// `.role`, `.is_super_admin`, `.first_name`, `.last_name`, `.id` etc., so the
// merge keeps those keys stable.
async function hydrateProfile(acc) {
  if (!acc) return null;

  // ensure → { profile, banned, labels }. The function creates the profile on
  // first sign-in (replacing the old client-side auto-create), claims legacy
  // rows, and reports the ban state + account labels.
  const ensured = await callFn('accountProfile', { action: 'ensure' });
  const profile = ensured?.profile || null;
  const labels = Array.isArray(ensured?.labels) ? ensured.labels : [];

  if (ensured?.banned === true) {
    // Drop the session so a banned account can't keep using per-doc grants.
    try { await account.deleteSession('current'); } catch { /* already gone */ }
    /** @type {any} */
    const err = new Error('This account is suspended.');
    err.type = 'account_banned';
    throw err;
  }

  // Org membership rows are readable via per-document grants — load them
  // directly but tolerate failures (pre-provisioned/staging databases).
  let organizationMemberships = [];
  if (profile) {
    try {
      const memberships = await databases.listDocuments(DB_ID, COL.OrganizationMember, [
        Query.equal('profile_id', profile.$id),
        Query.equal('status', 'active'),
        Query.limit(25),
      ]);
      organizationMemberships = memberships.documents.map((doc) => ({
        ...doc,
        id: doc.$id,
      }));
    } catch (err) {
      console.warn('[auth] organization memberships unavailable', err?.message || err);
    }
  }

  /** @type {any} */
  const merged = Object.assign({}, profile || {}, {
    id: profile ? profile.$id : acc.$id,
    account_id: acc.$id,
    email: acc.email,
    email_verified: acc.emailVerification === true,
    emailVerification: acc.emailVerification === true,
    name: profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || acc.name
      : acc.name,
    labels,
    is_super_admin: labels.includes('superadmin') || profile?.role === 'super_admin',
    organization_memberships: organizationMemberships,
    organization_ids: organizationMemberships.map((m) => m.organization_id).filter(Boolean),
    primary_organization_id: profile?.primary_organization_id || organizationMemberships[0]?.organization_id || '',
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
  // accountProfile.ensure call inside getCurrentUser() inserts the matching
  // profiles row server-side.
  signUp: async (email, password) => {
    // Clear any lingering session first — Appwrite rejects
    // createEmailPasswordSession with "a session is active" otherwise, which
    // surfaces as a confusing generic error during signup.
    try { await account.deleteSession('current'); } catch { /* no session */ }
    await account.create(ID.unique(), email.trim().toLowerCase(), password);
    await account.createEmailPasswordSession(email.trim().toLowerCase(), password);
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

  // Update the current user's profile document through the server-side
  // whitelist (profiles is no longer client-writable).
  updateCurrentUser: async (data) => {
    const payload = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (value === undefined) continue;
      if (key.startsWith('$')) continue;
      if (key === 'id' || key === 'created_date' || key === 'updated_date') continue;
      payload[key] = value;
    }
    await callFn('accountProfile', { action: 'update', ...payload });
    return auth.getCurrentUser();
  },

  // Admin-only invite — routed through the consolidated adminOps function.
  inviteUser: async (email, role) => {
    return callFn('adminOps', { action: 'inviteUser', email, role });
  },

  bootstrapMasterAdmin: async () => {
    return callFn('bootstrapMasterAdmin', {});
  },

  grantAdminRole: async ({ profileId, role, allowSuperAdmin = false }) => {
    return callFn('grantAdminRole', {
      profile_id: profileId,
      role,
      allow_super_admin: allowSuperAdmin,
    });
  },
};
