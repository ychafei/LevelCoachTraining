import { Client, Databases, Users, ID, Permission, Query, Role } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const SESSION_FEEDBACK_OPTIONS = new Map([
  ['great_fit', 'Great fit'],
  ['helpful', 'Helpful session'],
  ['okay', 'It was okay'],
  ['not_right_fit', 'Not the right fit'],
  ['other', 'Other'],
]);

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), users: new Users(client) };
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

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

async function callerIsBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

async function writeAudit(databases, entry) {
  const data = { ...entry };
  if (!['admin', 'super_admin'].includes(data.actor_role)) delete data.actor_role;
  await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), data).catch(() => {});
}

function str(value, min, max) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return undefined;
  return trimmed;
}

async function createDocumentResilient(databases, collection, data, permissions) {
  let payload = { ...data };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await databases.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
    } catch (err) {
      const match = /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '');
      if (!match || !(match[1] in payload)) throw err;
      delete payload[match[1]];
    }
  }
  return databases.createDocument(DB_ID, collection, ID.unique(), payload, permissions);
}

// Recompute coaches.rating_avg / review_count from published reviews only.
async function recomputeAggregates(databases, coachId) {
  let cursor = null;
  let count = 0;
  let sum = 0;
  for (;;) {
    const page = await databases.listDocuments(DB_ID, 'coach_reviews', [
      Query.equal('coach_id', coachId),
      Query.equal('status', 'published'),
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    for (const review of page.documents) {
      const rating = Number(review.rating);
      if (Number.isFinite(rating)) {
        count += 1;
        sum += rating;
      }
    }
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  await databases.updateDocument(DB_ID, 'coaches', coachId, {
    rating_avg: avg,
    review_count: count,
  }).catch(() => {});
  return { rating_avg: avg, review_count: count };
}

// --- Action handlers ----------------------------------------------------------

async function submit(databases, profile, payload) {
  const coachId = String(payload.coach_id || '');
  const sessionId = String(payload.session_id || '');
  const rating = Number(payload.rating);
  const comment = str(payload.comment ?? '', 0, 5000);
  const sessionFeedbackKey = String(payload.session_feedback_key || payload.feedback_key || '').trim();
  const sessionFeedbackOther = str(payload.session_feedback_other ?? payload.feedback_other ?? '', 0, 1000);
  if (!coachId) return { status: 400, body: { error: 'coach_id is required.' } };
  if (!sessionId) return { status: 400, body: { error: 'session_id is required.' } };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: 400, body: { error: 'rating must be an integer 1-5.' } };
  }
  if (comment === undefined) return { status: 400, body: { error: 'comment is too long (max 5000 chars).' } };
  if (sessionFeedbackKey && !SESSION_FEEDBACK_OPTIONS.has(sessionFeedbackKey)) {
    return { status: 400, body: { error: 'session_feedback_key is invalid.' } };
  }
  if (sessionFeedbackKey === 'other' && !sessionFeedbackOther) {
    return { status: 400, body: { error: 'Tell us what made the session feel different.' } };
  }
  if (sessionFeedbackOther === undefined) {
    return { status: 400, body: { error: 'session_feedback_other is too long (max 1000 chars).' } };
  }

  // Only clients with a completed session with this coach may review it.
  const session = await databases.getDocument(DB_ID, 'sessions', sessionId).catch(() => null);
  if (!session) return { status: 404, body: { error: 'Session not found.' } };
  if (session.status !== 'completed') {
    return { status: 403, body: { error: 'Reviews are only allowed after a completed session.' } };
  }
  if (session.coach_id !== coachId) {
    return { status: 400, body: { error: 'This session does not belong to that coach.' } };
  }
  if (String(session.client_email || '').toLowerCase() !== String(profile.email || '').toLowerCase()) {
    return { status: 403, body: { error: 'You can only review your own sessions.' } };
  }

  const existing = await databases.listDocuments(DB_ID, 'coach_reviews', [
    Query.equal('session_id', sessionId),
    Query.limit(1),
  ]);
  if (existing.documents[0]) {
    return { status: 409, body: { error: 'This session already has a review.' } };
  }

  const reviewerName = [profile.first_name, profile.last_name ? `${profile.last_name[0]}.` : '']
    .filter(Boolean).join(' ') || 'Client';
  const review = await createDocumentResilient(databases, 'coach_reviews', {
    coach_id: coachId,
    session_id: sessionId,
    reviewer_profile_id: profile.$id,
    reviewer_name: reviewerName,
    rating,
    session_feedback_key: sessionFeedbackKey,
    session_feedback_label: SESSION_FEEDBACK_OPTIONS.get(sessionFeedbackKey) || '',
    session_feedback_other: sessionFeedbackKey === 'other' ? sessionFeedbackOther : '',
    comment,
    status: 'published',
  }, [Permission.read(Role.any())]);

  const aggregates = await recomputeAggregates(databases, coachId);
  return { status: 200, body: { ok: true, review_id: review.$id, ...aggregates } };
}

async function respond(databases, accountId, payload) {
  const reviewId = String(payload.review_id || '');
  const response = str(payload.response, 1, 5000);
  if (!reviewId) return { status: 400, body: { error: 'review_id is required.' } };
  if (response === undefined) return { status: 400, body: { error: 'response is required (max 5000 chars).' } };

  const review = await databases.getDocument(DB_ID, 'coach_reviews', reviewId).catch(() => null);
  if (!review) return { status: 404, body: { error: 'Review not found.' } };

  const rows = await databases.listDocuments(DB_ID, 'coaches', [
    Query.equal('user_id', accountId),
    Query.limit(1),
  ]);
  const coach = rows.documents[0];
  if (!coach || coach.$id !== review.coach_id) {
    return { status: 403, body: { error: 'Only the reviewed coach can respond.' } };
  }

  await databases.updateDocument(DB_ID, 'coach_reviews', reviewId, {
    coach_response: response,
    responded_at: new Date().toISOString(),
  });
  return { status: 200, body: { ok: true } };
}

async function moderate(databases, actor, payload) {
  const reviewId = String(payload.review_id || '');
  const decision = String(payload.decision || '');
  const statusByDecision = { publish: 'published', unpublish: 'unpublished', reject: 'rejected' };
  const nextStatus = statusByDecision[decision];
  if (!reviewId) return { status: 400, body: { error: 'review_id is required.' } };
  if (!nextStatus) return { status: 400, body: { error: 'decision must be publish, unpublish, or reject.' } };

  const review = await databases.getDocument(DB_ID, 'coach_reviews', reviewId).catch(() => null);
  if (!review) return { status: 404, body: { error: 'Review not found.' } };

  // Only published reviews carry the public read grant.
  const permissions = nextStatus === 'published' ? [Permission.read(Role.any())] : [];
  await databases.updateDocument(DB_ID, 'coach_reviews', reviewId, { status: nextStatus }, permissions);
  const aggregates = await recomputeAggregates(databases, review.coach_id);

  await writeAudit(databases, {
    actor_email: actor.email,
    actor_role: actor.role,
    action: 'review.moderate',
    entity_type: 'CoachReview',
    entity_id: reviewId,
    before: JSON.stringify({ status: review.status }),
    after: JSON.stringify({ status: nextStatus }),
    metadata: JSON.stringify({ coach_id: review.coach_id, decision }),
  });
  return { status: 200, body: { ok: true, ...aggregates } };
}

// --- Entrypoint -----------------------------------------------------------------

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { databases, users } = services();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for this account.' }, 404);
    if (await callerIsBanned(databases, profile)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }

    const payload = body(req);
    let result;
    switch (payload.action) {
      case 'submit':
        result = await submit(databases, profile, payload);
        break;
      case 'respond':
        result = await respond(databases, accountId, payload);
        break;
      case 'moderate': {
        const account = await users.get(accountId).catch(() => null);
        const labels = account?.labels || [];
        if (!labels.includes('admin') && !labels.includes('superadmin')) {
          return res.json({ error: 'Admin access required.' }, 403);
        }
        const actor = {
          email: profile.email || account?.email || '',
          role: labels.includes('superadmin') ? 'super_admin' : 'admin',
        };
        result = await moderate(databases, actor, payload);
        break;
      }
      default:
        result = { status: 400, body: { error: 'Unknown action.' } };
    }
    return res.json(result.body, result.status);
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Review request failed.' }, 500);
  }
};
