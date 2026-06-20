// Backfill missing "How was your session?" prompts for completed sessions.
//
// Use this when sessions were completed before the review-request notification
// or email flow was deployed. The script is intentionally idempotent:
// - skips sessions that already have a coach review
// - skips sessions that already have a client review-request notification
// - dry-runs by default; --apply is required to create notifications/send email
//
// Usage:
//   node scripts/backfill-session-review-requests.mjs --date=2026-06-16
//   node scripts/backfill-session-review-requests.mjs --date=2026-06-16 --apply
//   node scripts/backfill-session-review-requests.mjs --date=2026-06-16 --apply --complete-confirmed

import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error(`Could not read ${envPath}. Make sure .env.local exists in the project root.`);
  process.exit(1);
}

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const COMPLETE_CONFIRMED = process.argv.includes('--complete-confirmed');
const FORCE_LIVE = process.argv.includes('--force-live');
const TIMEZONE = process.env.REVIEW_BACKFILL_TIMEZONE || 'America/Detroit';
const BATCH = 100;

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error('Missing required env vars. Need: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const databases = new Databases(client);

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function partsInZone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const out = {};
  for (const part of parts) out[part.type] = part.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function formatYmd({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function defaultYesterdayYmd(timezone) {
  const today = partsInZone(new Date(), timezone);
  const yesterdayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day) - 24 * 60 * 60 * 1000);
  return formatYmd({
    year: yesterdayUtc.getUTCFullYear(),
    month: yesterdayUtc.getUTCMonth() + 1,
    day: yesterdayUtc.getUTCDate(),
  });
}

const DATE = argValue('date') || defaultYesterdayYmd(TIMEZONE);
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error('Invalid --date. Expected YYYY-MM-DD.');
  process.exit(1);
}

function appBaseUrl() {
  return String(process.env.APP_BASE_URL || 'https://www.lctrainings.com').replace(/\/+$/, '');
}

function assertSafeToCompleteConfirmedSessions() {
  if (!COMPLETE_CONFIRMED || DRY_RUN) return;
  const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (stripeKey.startsWith('sk_live') && !FORCE_LIVE) {
    console.error('Refusing to --complete-confirmed with a live Stripe key. Use the coach/admin portal for live-money completions, or pass --force-live only after a deliberate payout review.');
    process.exit(1);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value, max) {
  const text = String(value ?? '').replace(/<[^>]*>/g, '').trim();
  return text.slice(0, max);
}

function coachName(coach) {
  return [coach?.first_name, coach?.last_name].filter(Boolean).join(' ') || 'your coach';
}

function clientReviewPath(profile, sessionId) {
  const role = String(profile?.onboarding_role || profile?.role || '').toLowerCase();
  const path = role === 'parent' || role === 'guardian' ? '/parent' : '/athlete';
  const params = new URLSearchParams();
  params.set('tab', path === '/parent' ? 'family' : 'sessions');
  params.set('review_session', sessionId);
  return `${path}?${params.toString()}`;
}

function formatSessionStart(session, coach) {
  const timezone = session.timezone || coach?.timezone || TIMEZONE;
  const start = session.starts_at_utc ? new Date(session.starts_at_utc) : null;
  if (start && Number.isFinite(start.getTime())) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(start);
    } catch {
      return session.starts_at_utc;
    }
  }
  return `${session.date || 'Unknown date'} ${session.start_time || ''}`.trim();
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function* listAll(collection, queries) {
  let cursor = null;
  for (;;) {
    const pageQueries = [...queries, Query.limit(BATCH)];
    if (cursor) pageQueries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DB_ID, collection, pageQueries);
    for (const doc of page.documents) yield doc;
    if (page.documents.length < BATCH) return;
    cursor = page.documents[page.documents.length - 1].$id;
  }
}

async function createDocumentResilient(collection, data, permissions) {
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

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY || !to) return false;
  const from = process.env.EMAIL_FROM || 'LevelCoach Training <support@lctrainings.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Resend returned ${response.status}`);
  }
  return true;
}

async function profileById(profileId) {
  if (!profileId) return null;
  return databases.getDocument(DB_ID, 'profiles', profileId).catch(() => null);
}

async function profileByAccountId(accountId) {
  if (!accountId) return null;
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0] || null;
}

async function clientProfileForSession(session) {
  let profile = await profileById(session.booked_by_profile_id);
  if (!profile && session.client_email) {
    const email = String(session.client_email).toLowerCase();
    const rows = await databases.listDocuments(DB_ID, 'profiles', [
      Query.equal('email', [session.client_email, email]),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    profile = rows.documents[0] || null;
  }
  return profile;
}

async function coachNotificationEmail(coach) {
  if (!coach) return '';
  const rows = await databases.listDocuments(DB_ID, 'coach_private', [
    Query.equal('coach_id', coach.$id),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents[0]?.email || coach.email || '';
}

async function sessionHasReview(sessionId) {
  const rows = await databases.listDocuments(DB_ID, 'coach_reviews', [
    Query.equal('session_id', sessionId),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return Boolean(rows.documents[0]);
}

async function notificationExists({ profileId, type, sessionId }) {
  if (!profileId) return false;
  const rows = await databases.listDocuments(DB_ID, 'notifications', [
    Query.equal('recipient_profile_id', profileId),
    Query.equal('type', type),
    Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.some((notification) => {
    const data = parseJson(notification.data);
    return data.session_id === sessionId || data.review_session_id === sessionId;
  });
}

async function createNotification({ profile, accountId, type, title, message, link = '', data = {} }) {
  const recipientAccountId = accountId || profile?.account_id || '';
  if (!recipientAccountId) return false;
  await createDocumentResilient('notifications', {
    recipient_account_id: recipientAccountId,
    recipient_profile_id: profile?.$id || '',
    type,
    title: cleanText(title, 200),
    body: cleanText(message, 2000),
    link: cleanText(link, 500),
    data: JSON.stringify(data),
    read: false,
  }, [
    Permission.read(Role.user(recipientAccountId)),
    Permission.update(Role.user(recipientAccountId)),
  ]);
  return true;
}

async function notifyCoachReviewRequestSent({ session, coach, coachProfile, coachEmail, when }) {
  const coachNoticeExists = await notificationExists({
    profileId: coachProfile?.$id,
    type: 'session_review_backfill_notice',
    sessionId: session.$id,
  });
  const data = {
    session_id: session.$id,
    coach_id: session.coach_id,
    review_session_id: session.$id,
    backfilled: true,
    backfill_date: DATE,
  };

  if (!coachNoticeExists) {
    await createNotification({
      profile: coachProfile,
      accountId: coach?.user_id || '',
      type: 'session_review_backfill_notice',
      title: 'Client review request sent',
      message: `We asked ${session.client_name || 'your client'} to review the completed session from ${when}.`,
      link: '/coach/reviews',
      data,
    });
  }

  await sendEmail({
    to: coachEmail,
    subject: `Review request sent — ${session.client_name || 'Client'}`,
    html: `
      <p>Hi ${escapeHtml(coach?.first_name || 'Coach')},</p>
      <p>We sent ${escapeHtml(session.client_name || 'your client')} a review request for the completed session on <strong>${escapeHtml(when)}</strong>.</p>
      <p>Submitted reviews will appear in your Reviews section and public coach profile.</p>
    `,
  });
}

async function writeAudit(session, metadata) {
  await createDocumentResilient('audit_logs', {
    actor_email: 'script:backfill-session-review-requests',
    actor_role: 'admin',
    action: 'session_review_request.backfill',
    entity_type: 'Session',
    entity_id: session.$id,
    before: JSON.stringify({ status: session.status }),
    after: JSON.stringify({ review_request_sent: true }),
    metadata: JSON.stringify(metadata),
  }, []).catch(() => {});
}

async function backfillSession(session) {
  const coach = await databases.getDocument(DB_ID, 'coaches', session.coach_id).catch(() => null);
  const clientProfile = await clientProfileForSession(session);
  const clientEmail = clientProfile?.email || session.client_email || '';
  const coachProfile = coach?.user_id ? await profileByAccountId(coach.user_id) : null;
  const coachEmail = await coachNotificationEmail(coach);
  const name = coachName(coach);
  const when = formatSessionStart(session, coach);
  const reviewPath = clientReviewPath(clientProfile, session.$id);
  const reviewUrl = `${appBaseUrl()}${reviewPath}`;
  const hasClientNotification = await notificationExists({
    profileId: clientProfile?.$id,
    type: 'session_review_requested',
    sessionId: session.$id,
  });

  if (!clientProfile?.account_id && !clientEmail) {
    return { status: 'skipped_missing_client', coach_id: session.coach_id };
  }
  if (hasClientNotification) {
    const coachNoticeExists = await notificationExists({
      profileId: coachProfile?.$id,
      type: 'session_review_backfill_notice',
      sessionId: session.$id,
    });
    if (coachNoticeExists) {
      return {
        status: 'skipped_existing_prompt',
        coach_id: session.coach_id,
        client_profile_id: clientProfile?.$id || '',
      };
    }
    if (!DRY_RUN) {
      await notifyCoachReviewRequestSent({ session, coach, coachProfile, coachEmail, when });
    }
    return {
      status: DRY_RUN ? 'would_send_coach_notice' : 'coach_notice_sent',
      coach_id: session.coach_id,
      client_profile_id: clientProfile?.$id || '',
    };
  }

  const data = {
    session_id: session.$id,
    coach_id: session.coach_id,
    review_session_id: session.$id,
    backfilled: true,
    backfill_date: DATE,
  };

  if (!DRY_RUN) {
    await createNotification({
      profile: clientProfile,
      type: 'session_review_requested',
      title: `Rate your session with ${name}`,
      message: `How was your session with ${name}? Leave a quick verified review to help other athletes choose the right coach.`,
      link: reviewPath,
      data,
    });

    await sendEmail({
      to: clientEmail,
      subject: `How was your session with ${name}?`,
      html: `
        <p>Hi there,</p>
        <p>Your session with <strong>${escapeHtml(name)}</strong> is complete.</p>
        <p>Please take a minute to rate the session and share a quick verified review. Your review helps other athletes and parents choose the right coach.</p>
        <p><a href="${escapeHtml(reviewUrl)}">Rate your session with ${escapeHtml(name)}</a></p>
      `,
    });

    await notifyCoachReviewRequestSent({ session, coach, coachProfile, coachEmail, when });

    await writeAudit(session, {
      date: DATE,
      coach_id: session.coach_id,
      client_profile_id: clientProfile?.$id || '',
      coach_profile_id: coachProfile?.$id || '',
    });
  }

  return {
    status: DRY_RUN ? 'would_send' : 'sent',
    coach_id: session.coach_id,
    client_profile_id: clientProfile?.$id || '',
    coach_profile_id: coachProfile?.$id || '',
  };
}

async function completeConfirmedSession(session) {
  const coach = await databases.getDocument(DB_ID, 'coaches', session.coach_id).catch(() => null);
  if (!coach?.user_id) {
    return { status: 'skipped_missing_coach_account' };
  }

  if (DRY_RUN) {
    return { status: 'would_complete', coach_id: session.coach_id };
  }

  const { default: bookingHandler } = await import('../functions/booking/src/main.js');
  let responseStatus = 200;
  let responseBody = null;
  const res = {
    json(data, status = 200) {
      responseStatus = status;
      responseBody = data;
      return data;
    },
  };
  await bookingHandler({
    req: {
      headers: { 'x-appwrite-user-id': coach.user_id },
      bodyJson: { action: 'complete', session_id: session.$id },
    },
    res,
    error: (message) => console.error(`[booking-complete] ${message}`),
  });

  if (responseStatus >= 400) {
    throw new Error(responseBody?.error || `booking complete failed with ${responseStatus}`);
  }

  return {
    status: 'completed',
    session: responseBody?.session || await databases.getDocument(DB_ID, 'sessions', session.$id),
    coach_id: session.coach_id,
  };
}

let scanned = 0;
let eligible = 0;
let sent = 0;
let wouldSend = 0;
let skippedReviewed = 0;
let skippedExistingPrompt = 0;
let skippedUnfinalized = 0;
let skippedOtherStatus = 0;
let skippedMissingClient = 0;
let wouldComplete = 0;
let completedConfirmed = 0;
let skippedMissingCoachAccount = 0;
let failed = 0;

assertSafeToCompleteConfirmedSessions();
console.log(`${DRY_RUN ? '[dry-run]' : '[apply]'} Backfilling review requests for sessions dated ${DATE} (${TIMEZONE}).`);
if (COMPLETE_CONFIRMED) {
  console.log(`${DRY_RUN ? '[dry-run]' : '[apply]'} Past confirmed sessions will be completed through the booking function before review requests are sent.`);
}

for await (const session of listAll('sessions', [Query.equal('date', DATE)])) {
  scanned += 1;
  if (session.status !== 'completed') {
    if (session.status === 'confirmed') {
      if (COMPLETE_CONFIRMED) {
        try {
          const completion = await completeConfirmedSession(session);
          if (completion.status === 'would_complete') {
            wouldComplete += 1;
            console.log(`[would-complete] ${session.$id} status=confirmed client="${session.client_name || ''}" coach=${session.coach_id}`);
          } else if (completion.status === 'completed') {
            completedConfirmed += 1;
            console.log(`[completed] ${session.$id} status=confirmed->completed client="${session.client_name || ''}" coach=${session.coach_id}`);
            const backfill = await backfillSession(completion.session);
            if (backfill.status === 'coach_notice_sent') {
              sent += 1;
              console.log(`[coach-notice-sent] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
            }
          } else if (completion.status === 'skipped_missing_coach_account') {
            skippedMissingCoachAccount += 1;
            console.log(`[skip-missing-coach-account] ${session.$id} status=confirmed client="${session.client_name || ''}" coach=${session.coach_id}`);
          }
        } catch (err) {
          failed += 1;
          console.error(`[failed-complete] ${session.$id}: ${err?.message || err}`);
        }
      } else {
        skippedUnfinalized += 1;
        console.log(`[skip-unfinalized] ${session.$id} status=confirmed client="${session.client_name || ''}" coach=${session.coach_id}`);
      }
    } else {
      skippedOtherStatus += 1;
    }
    continue;
  }

  if (await sessionHasReview(session.$id)) {
    skippedReviewed += 1;
    console.log(`[skip-reviewed] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    continue;
  }

  eligible += 1;
  try {
    const result = await backfillSession(session);
    if (result.status === 'would_send') {
      wouldSend += 1;
      console.log(`[would-send] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    } else if (result.status === 'sent') {
      sent += 1;
      console.log(`[sent] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    } else if (result.status === 'would_send_coach_notice') {
      wouldSend += 1;
      console.log(`[would-send-coach-notice] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    } else if (result.status === 'coach_notice_sent') {
      sent += 1;
      console.log(`[coach-notice-sent] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    } else if (result.status === 'skipped_existing_prompt') {
      skippedExistingPrompt += 1;
      console.log(`[skip-existing-prompt] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    } else if (result.status === 'skipped_missing_client') {
      skippedMissingClient += 1;
      console.log(`[skip-missing-client] ${session.$id} client="${session.client_name || ''}" coach=${session.coach_id}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`[failed] ${session.$id}: ${err?.message || err}`);
  }
}

console.log(JSON.stringify({
  date: DATE,
  dry_run: DRY_RUN,
  scanned,
  eligible_completed_unreviewed: eligible,
  would_send: wouldSend,
  sent,
  skipped_reviewed: skippedReviewed,
  skipped_existing_prompt: skippedExistingPrompt,
  skipped_unfinalized_confirmed: skippedUnfinalized,
  would_complete_confirmed: wouldComplete,
  completed_confirmed: completedConfirmed,
  skipped_missing_coach_account: skippedMissingCoachAccount,
  skipped_other_status: skippedOtherStatus,
  skipped_missing_client: skippedMissingClient,
  failed,
}, null, 2));

if (DRY_RUN) {
  console.log('Run again with --apply to create notifications and send emails.');
}
if (failed > 0) process.exit(1);
