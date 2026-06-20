import { account, databases, DB_ID, COL, Query, ID } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';
import { OAuthProvider } from 'appwrite';

const PROFILE_HYDRATE_CACHE_MS = 2500;
const PROFILE_ENSURE_RETRY_DELAYS_MS = [400, 900, 1600];

let recentHydration = {
  accountId: null,
  user: null,
  expiresAt: 0,
  promise: null,
};

function clearHydratedUserCache() {
  recentHydration = {
    accountId: null,
    user: null,
    expiresAt: 0,
    promise: null,
  };
}

function rememberHydratedUser(user) {
  if (!user?.account_id) return user;
  recentHydration = {
    accountId: user.account_id,
    user,
    expiresAt: Date.now() + PROFILE_HYDRATE_CACHE_MS,
    promise: null,
  };
  return user;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAuthError(err) {
  const message = err?.message || '';
  const status = Number(err?.status || err?.code || 0);
  if (
    status === 409
    || err?.type === 'user_already_exists'
    || /already associated|already exists|already registered/i.test(message)
  ) {
    err.type = 'account_email_conflict';
  } else if (status === 403 && /verify your email/i.test(message)) {
    err.type = 'profile_claim_requires_verification';
  }
  return err;
}

function isProfileEnsureRetryable(err) {
  const message = err?.message || '';
  const status = Number(err?.status || err?.code || 0);
  if (err?.type === 'account_email_conflict' || status === 409 || status === 401 || status === 403) return false;
  return status === 429
    || status === 500
    || status === 502
    || status === 503
    || /rate limit|too many requests|profile setup is busy|could not process profile request/i.test(message);
}

async function ensureProfileWithRetry() {
  let lastError = null;
  for (let attempt = 0; attempt <= PROFILE_ENSURE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await callFn('accountProfile', { action: 'ensure' });
    } catch (err) {
      lastError = normalizeAuthError(err);
      if (!isProfileEnsureRetryable(lastError) || attempt === PROFILE_ENSURE_RETRY_DELAYS_MS.length) {
        throw lastError;
      }
      await sleep(PROFILE_ENSURE_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

// Hydrate the caller's `profiles` document through the server-side
// `accountProfile` function (clients can no longer create or repair profile
// rows directly — the collection is server-only writable), then merge account
// + profile into a single app-shaped user object. The app reads `.email`,
// `.role`, `.is_super_admin`, `.first_name`, `.last_name`, `.id` etc., so the
// merge keeps those keys stable.
async function hydrateProfileFresh(acc) {
  if (!acc) return null;

  // ensure → { profile, banned, labels }. The function creates the profile on
  // first sign-in (replacing the old client-side auto-create), claims legacy
  // rows, and reports the ban state + account labels.
  const ensured = await ensureProfileWithRetry();
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

async function hydrateProfile(acc, options = {}) {
  if (!acc) return null;

  const accountId = acc.$id;
  const now = Date.now();
  if (!options.force && recentHydration.accountId === accountId) {
    if (recentHydration.user && recentHydration.expiresAt > now) return recentHydration.user;
    if (recentHydration.promise) return recentHydration.promise;
  }

  const prior = recentHydration.accountId === accountId ? recentHydration : null;
  const promise = hydrateProfileFresh(acc)
    .then((user) => rememberHydratedUser(user))
    .catch((err) => {
      if (recentHydration.promise === promise) clearHydratedUserCache();
      throw err;
    });

  recentHydration = {
    accountId,
    user: prior?.user || null,
    expiresAt: prior?.expiresAt || 0,
    promise,
  };
  return promise;
}

export const auth = {
  // Returns the merged profile+account object, or throws if not signed in.
  getCurrentUser: async (options = {}) => {
    const acc = await account.get();
    return hydrateProfile(acc, options);
  },

  // Email + password sign-in. Returns the hydrated user.
  signInWithPassword: async (email, password) => {
    clearHydratedUserCache();
    await account.createEmailPasswordSession(email, password);
    return auth.getCurrentUser({ force: true });
  },

  // Create a brand-new Appwrite account, then immediately sign in. The
  // accountProfile.ensure call inside getCurrentUser() inserts the matching
  // profiles row server-side.
  signUp: async (email, password) => {
    // Clear any lingering session first — Appwrite rejects
    // createEmailPasswordSession with "a session is active" otherwise, which
    // surfaces as a confusing generic error during signup.
    try { await account.deleteSession('current'); } catch { /* no session */ }
    try {
      await account.create(ID.unique(), email.trim().toLowerCase(), password);
    } catch (err) {
      throw normalizeAuthError(err);
    }
    await account.createEmailPasswordSession(email.trim().toLowerCase(), password);
    // Send a verification email (best-effort — never block signup on it).
    try {
      await account.createVerification(`${window.location.origin}/verify-email`);
    } catch (err) {
      console.error('[auth] createVerification failed', err);
    }
    clearHydratedUserCache();
    return auth.getCurrentUser({ force: true });
  },

  // (Re)send the email-verification link for the current account.
  resendVerification: async () => {
    return account.createVerification(`${window.location.origin}/verify-email`);
  },

  // Finish email verification with the userId+secret captured from the URL.
  completeEmailVerification: async (userId, secret) => {
    await account.updateVerification(userId, secret);
    clearHydratedUserCache();
    return auth.getCurrentUser({ force: true });
  },

  // Kick off an OAuth round-trip using Appwrite's TOKEN flow (not the cookie
  // flow): on success Appwrite redirects back to /login with userId+secret
  // query params and the app finishes via completeTokenSession below. The
  // cookie flow sets the session cookie during a cross-site redirect, which
  // Safari ITP / Chrome Incognito / hardened Firefox block (third-party
  // cookie) — the user bounces back to /login signed out. The token flow
  // creates the session through an SDK call, so the SDK persists its
  // localStorage cookieFallback and works without third-party cookies.
  // `provider` is one of 'google' | 'microsoft' | 'facebook' | 'apple'
  // (matches the OAuthProvider enum).
  createOAuthSession: (provider, next) => {
    const success = `${window.location.origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const failure = `${window.location.origin}/login?oauth_error=1`;
    const key = String(provider).toLowerCase();
    const resolved = OAuthProvider[key.charAt(0).toUpperCase() + key.slice(1)] || key;
    return account.createOAuth2Token({ provider: resolved, success, failure });
  },

  // Finish any token-based sign-in (OAuth token flow + magic links): both
  // land on /login with userId+secret and complete through the same
  // sessions/token endpoint. Create-first, delete-on-conflict: a stale or
  // already-used token must fail WITHOUT destroying a live session (clicking
  // an expired link while signed in must not log the user out).
  completeTokenSession: async (userId, secret) => {
    try {
      await account.createSession({ userId, secret });
    } catch (err) {
      if (err?.type !== 'user_session_already_exists') throw err;
      // A live session blocks token sign-in — replace it and retry once.
      try { await account.deleteSession('current'); } catch { /* already gone */ }
      await account.createSession({ userId, secret });
    }
    clearHydratedUserCache();
    return auth.getCurrentUser({ force: true });
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
  // by default and `completeTokenSession` finishes the session.
  sendMagicLink: async (email, returnUrl) => {
    const url = returnUrl || `${window.location.origin}/login`;
    return account.createMagicURLToken({ userId: 'unique()', email, url });
  },

  // Used by the magic-URL return route to finalise the session. Same
  // endpoint as the OAuth token flow — kept as a named alias for clarity.
  completeMagicLink: (userId, secret) => auth.completeTokenSession(userId, secret),

  // Drop the current Appwrite session. `returnUrl` is accepted for API
  // compatibility with the old legacy wrapper but isn't needed — callers
  // navigate themselves.
  signOut: async () => {
    try { await account.deleteSession('current'); } catch { /* already gone */ }
    clearHydratedUserCache();
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
    clearHydratedUserCache();
    return auth.getCurrentUser({ force: true });
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

  // Stackable roles: set the FULL set of granted roles (subset of
  // ['coach','admin','super_admin']) for an account at once. Empty array
  // demotes to a plain user. Master-admin only (enforced server-side).
  setUserRoles: async ({ profileId, roles, allowSuperAdmin = false }) => {
    return callFn('grantAdminRole', {
      profile_id: profileId,
      roles,
      allow_super_admin: allowSuperAdmin,
    });
  },

  // Read the current stacked roles for an account (for the role editor UI).
  getUserRoles: async (profileId) => {
    return callFn('grantAdminRole', { action: 'getRoles', profile_id: profileId });
  },
};
