import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const MAX_MESSAGE_LENGTH = 10000;
const REPORT_CATEGORIES = ['harassment', 'inappropriate_content', 'spam', 'safety_concern', 'minor_safety', 'other'];

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { db: new Databases(client) };
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];
    if (value) return String(value);
  }
  return '';
}

function callerAccountId(req) {
  return header(req, ['x-appwrite-user-id', 'X-Appwrite-User-Id', 'X-Appwrite-User-ID']);
}

async function profileForAccount(db, accountId) {
  const rows = await db.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function activeBan(db, email) {
  if (!email) return null;
  const rows = await db.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', [email, String(email).toLowerCase()]),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// Plain text only — strip HTML tags and enforce the length cap.
function sanitizeContent(value) {
  const text = String(value ?? '').replace(/<[^>]*>/g, '').trim();
  return text;
}

function sameEmail(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase() && Boolean(a);
}

function fullName(profile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email || 'Member';
}

function parsePrefs(profile) {
  try {
    const prefs = typeof profile?.notification_prefs === 'object'
      ? profile?.notification_prefs
      : JSON.parse(profile?.notification_prefs || '{}');
    return prefs && typeof prefs === 'object' ? prefs : {};
  } catch { return {}; }
}

function blockedIds(profile) {
  const list = parsePrefs(profile).blocked_profile_ids;
  return Array.isArray(list) ? list.map(String) : [];
}

function eitherSideBlocks(profileA, profileB) {
  if (!profileA || !profileB) return false;
  return blockedIds(profileA).includes(profileB.$id) || blockedIds(profileB).includes(profileA.$id);
}

async function profileByEmail(db, email) {
  if (!email) return null;
  const rows = await db.listDocuments(DB_ID, 'profiles', [
    Query.equal('email', [email, String(email).toLowerCase()]),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

// Guardian read grants for minor participants.
async function guardianAccountsForProfile(db, profile) {
  if (!profile || profile.is_minor !== true) return [];
  const athleteRows = await db.listDocuments(DB_ID, 'athlete_profiles', [
    Query.equal('profile_id', profile.$id),
    Query.limit(5),
  ]).catch(() => ({ documents: [] }));
  const accounts = [];
  for (const athlete of athleteRows.documents) {
    const links = await db.listDocuments(DB_ID, 'guardian_athletes', [
      Query.equal('athlete_id', athlete.$id),
      Query.limit(25),
    ]).catch(() => ({ documents: [] }));
    for (const link of links.documents) {
      const guardian = await db.getDocument(DB_ID, 'profiles', link.guardian_profile_id).catch(() => null);
      if (guardian?.account_id) accounts.push(guardian.account_id);
    }
  }
  return [...new Set(accounts)];
}

function readGrantsOf(document) {
  return (document.$permissions || []).filter((perm) => perm.startsWith('read('));
}

async function isParticipant(db, conversation, profile, accountId) {
  const emails = (conversation.participant_emails || []).map((email) => String(email).toLowerCase());
  if (profile.email && emails.includes(String(profile.email).toLowerCase())) return true;
  if (conversation.coach_id) {
    const coach = await db.getDocument(DB_ID, 'coaches', conversation.coach_id).catch(() => null);
    if (coach?.user_id && coach.user_id === accountId) return true;
  }
  return false;
}

async function otherParticipantProfiles(db, conversation, profile) {
  const profiles = [];
  for (const email of conversation.participant_emails || []) {
    if (sameEmail(email, profile.email)) continue;
    const other = await profileByEmail(db, email);
    if (other) profiles.push(other);
  }
  return profiles;
}

async function createMessage(db, conversation, senderProfile, content) {
  const message = await db.createDocument(DB_ID, 'messages', ID.unique(), {
    conversation_id: conversation.$id,
    sender_email: senderProfile.email,
    sender_name: fullName(senderProfile),
    content,
  }, readGrantsOf(conversation));
  await db.updateDocument(DB_ID, 'conversations', conversation.$id, {
    last_message: content.slice(0, 20000),
    last_message_at: new Date().toISOString(),
  }).catch(() => {});
  return message;
}

// --- Actions -------------------------------------------------------------------

async function startAction(db, accountId, profile, payload, res) {
  const recipientProfileId = String(payload.recipient_profile_id || '').trim();
  const coachId = String(payload.coach_id || '').trim();
  const content = sanitizeContent(payload.first_message);
  if (!recipientProfileId && !coachId) {
    return res.json({ error: 'recipient_profile_id or coach_id is required.' }, 400);
  }
  if (!content) return res.json({ error: 'first_message is required.' }, 400);
  if (content.length > MAX_MESSAGE_LENGTH) {
    return res.json({ error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` }, 400);
  }

  // Resolve the recipient entirely server-side.
  let coach = null;
  let recipientProfile = null;
  if (coachId) {
    coach = await db.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
    if (!coach) return res.json({ error: 'Coach not found.' }, 404);
    if (coach.user_id) recipientProfile = await profileForAccount(db, coach.user_id);
  } else {
    recipientProfile = await db.getDocument(DB_ID, 'profiles', recipientProfileId).catch(() => null);
    if (!recipientProfile) return res.json({ error: 'Recipient not found.' }, 404);
  }

  const recipientEmail = recipientProfile?.email || coach?.email || '';
  const recipientName = recipientProfile
    ? fullName(recipientProfile)
    : [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim();
  if (!recipientEmail) return res.json({ error: 'Recipient has no contact email.' }, 400);
  if (sameEmail(recipientEmail, profile.email)) {
    return res.json({ error: 'You cannot message yourself.' }, 400);
  }
  if (eitherSideBlocks(profile, recipientProfile)) {
    return res.json({ error: 'Messaging is not available with this member.' }, 403);
  }

  const conversationCoachId = coach?.$id || recipientProfile?.coach_id || profile.coach_id || '';

  // Reuse an existing conversation between this pair when present.
  let conversation = null;
  const existing = await db.listDocuments(DB_ID, 'conversations', [
    Query.contains('participant_emails', profile.email),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  conversation = existing.documents.find((doc) =>
    (doc.participant_emails || []).some((email) => sameEmail(email, recipientEmail))
  ) || null;

  if (!conversation) {
    const guardianAccounts = [
      ...(await guardianAccountsForProfile(db, profile)),
      ...(await guardianAccountsForProfile(db, recipientProfile)),
    ];
    const permissions = [...new Set([
      Permission.read(Role.user(accountId)),
      ...(recipientProfile?.account_id ? [Permission.read(Role.user(recipientProfile.account_id))] : []),
      ...(coach?.user_id ? [Permission.read(Role.user(coach.user_id))] : []),
      ...guardianAccounts.map((id) => Permission.read(Role.user(id))),
    ])];
    conversation = await db.createDocument(DB_ID, 'conversations', ID.unique(), {
      type: 'coach_client',
      participant_emails: [profile.email, recipientEmail],
      participant_names: [fullName(profile), recipientName || recipientEmail],
      coach_id: conversationCoachId,
    }, permissions);
  }

  const message = await createMessage(db, conversation, profile, content);
  return res.json({ conversation, message });
}

async function sendAction(db, accountId, profile, payload, res) {
  const conversationId = String(payload.conversation_id || '').trim();
  const content = sanitizeContent(payload.content);
  if (!conversationId) return res.json({ error: 'conversation_id is required.' }, 400);
  if (!content) return res.json({ error: 'Message content is required.' }, 400);
  if (content.length > MAX_MESSAGE_LENGTH) {
    return res.json({ error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` }, 400);
  }

  const conversation = await db.getDocument(DB_ID, 'conversations', conversationId).catch(() => null);
  if (!conversation) return res.json({ error: 'Conversation not found.' }, 404);
  if (!(await isParticipant(db, conversation, profile, accountId))) {
    return res.json({ error: 'You are not a participant in this conversation.' }, 403);
  }

  // Respect blocks in either direction.
  const others = await otherParticipantProfiles(db, conversation, profile);
  if (others.some((other) => eitherSideBlocks(profile, other))) {
    return res.json({ error: 'Messaging is not available with this member.' }, 403);
  }

  const message = await createMessage(db, conversation, profile, content);
  return res.json({ message });
}

async function reportAction(db, accountId, profile, payload, res) {
  const conversationId = String(payload.conversation_id || '').trim();
  const messageId = String(payload.message_id || '').trim();
  const category = String(payload.category || '').trim();
  const detail = sanitizeContent(payload.detail).slice(0, 5000);
  if (!conversationId && !messageId) {
    return res.json({ error: 'conversation_id or message_id is required.' }, 400);
  }
  if (!REPORT_CATEGORIES.includes(category)) {
    return res.json({ error: 'category is invalid.' }, 400);
  }

  // Verify the reporter can actually see what they are reporting.
  let resolvedConversationId = conversationId;
  if (messageId) {
    const message = await db.getDocument(DB_ID, 'messages', messageId).catch(() => null);
    if (!message) return res.json({ error: 'Message not found.' }, 404);
    resolvedConversationId = message.conversation_id;
  }
  const conversation = await db.getDocument(DB_ID, 'conversations', resolvedConversationId).catch(() => null);
  if (!conversation) return res.json({ error: 'Conversation not found.' }, 404);
  if (!(await isParticipant(db, conversation, profile, accountId))) {
    return res.json({ error: 'You are not a participant in this conversation.' }, 403);
  }

  const report = await db.createDocument(DB_ID, 'safety_reports', ID.unique(), {
    reporter_profile_id: profile.$id,
    reporter_account_id: accountId,
    conversation_id: resolvedConversationId,
    message_id: messageId,
    category,
    detail,
    status: 'open',
  }, [Permission.read(Role.user(accountId))]);

  return res.json({ report_id: report.$id });
}

async function blockAction(db, profile, payload, blocked, res) {
  const targetId = String(payload.profile_id || '').trim();
  if (!targetId || targetId.length > 64) return res.json({ error: 'profile_id is required.' }, 400);
  if (targetId === profile.$id) return res.json({ error: 'You cannot block yourself.' }, 400);
  if (blocked) {
    const target = await db.getDocument(DB_ID, 'profiles', targetId).catch(() => null);
    if (!target) return res.json({ error: 'Profile not found.' }, 404);
  }

  const prefs = parsePrefs(profile);
  const list = new Set(Array.isArray(prefs.blocked_profile_ids) ? prefs.blocked_profile_ids.map(String) : []);
  if (blocked) list.add(targetId); else list.delete(targetId);
  prefs.blocked_profile_ids = [...list];

  await db.updateDocument(DB_ID, 'profiles', profile.$id, {
    notification_prefs: JSON.stringify(prefs),
  });
  return res.json({ blocked_profile_ids: prefs.blocked_profile_ids });
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const action = String(payload.action || '');
    const { db } = services();

    const profile = await profileForAccount(db, accountId);
    if (!profile) return res.json({ error: 'No profile found. Complete your account setup first.' }, 404);
    if (await activeBan(db, profile.email)) {
      return res.json({ error: 'This account is suspended.' }, 403);
    }

    switch (action) {
      case 'start':
        return await startAction(db, accountId, profile, payload, res);
      case 'send':
        return await sendAction(db, accountId, profile, payload, res);
      case 'report':
        return await reportAction(db, accountId, profile, payload, res);
      case 'block':
        return await blockAction(db, profile, payload, true, res);
      case 'unblock':
        return await blockAction(db, profile, payload, false, res);
      default:
        return res.json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not process messaging request.' }, 500);
  }
};
