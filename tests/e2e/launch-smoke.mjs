import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.E2E_PORT || 4181);
const base = process.env.E2E_BASE_URL || `http://localhost:${port}`;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source(path) {
  return readFileSync(join(root, path), 'utf8');
}

function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    const out = execSync(
      'node -e "console.log(require(\'playwright-core\').chromium.executablePath())"',
      { cwd: root, encoding: 'utf8' },
    ).trim();
    if (out && existsSync(out)) return out;
  } catch { /* handled below */ }
  return null;
}

async function mockAppwrite(page) {
  await page.route('**/v1/account**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthenticated smoke test session.' }),
    });
  });
  await page.route('**/v1/functions/**/executions', async (route) => {
    const url = new URL(route.request().url());
    const functionId = url.pathname.split('/functions/')[1]?.split('/')[0] || '';
    const bodyByFunction = {
      getPublicCoaches: { coaches: [] },
      getCoachAvailability: { availability: [] },
      accountProfile: { error: 'Authentication required.' },
    };
    const payload = bodyByFunction[functionId] || {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        responseStatusCode: functionId === 'accountProfile' ? 401 : 200,
        responseBody: JSON.stringify(payload),
      }),
    });
  });
  await page.route('**/v1/databases/**/documents**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0, documents: [] }),
    });
  });
}

test('guest browsing: public routes render without a live Appwrite session', async ({ page }) => {
  for (const route of ['/', '/coaches', '/book', '/parent-consent']) {
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 5000 });
    const text = (await page.locator('body').innerText()).trim();
    assert(!/404|not found/i.test(text), `${route} rendered a not-found state`);
  }
});

test('adult athlete booking: checkout requires published coach and exact checkout status', () => {
  const checkout = source('functions/createStripeCheckout/src/main.js');
  const availability = source('functions/getCoachAvailability/src/main.js');
  const book = source('src/pages/Book.jsx');
  const booking = source('functions/booking/src/main.js');
  const schedule = source('src/lib/scheduleET.js');
  const athleteOverview = source('src/features/athlete/AthleteOverview.jsx');
  const stripeWebhook = source('functions/stripeWebhook/src/main.js');
  assert(/coach\.is_active\s*!==\s*true\s*\|\|\s*coach\.published\s*!==\s*true/.test(checkout), 'checkout must reject unpublished coaches');
  assert(checkout.includes('&coach_id=${encodeURIComponent(coach.$id)}'), 'checkout success URL must preserve coach_id');
  assert(checkout.includes("action === 'status'"), 'createStripeCheckout must expose status action');
  assert(book.includes("action: 'status'") && book.includes('checkout_session_id'), 'Book.jsx must poll exact checkout_session_id');
  assert(book.includes('setConfirmedCoachId') && book.includes('creditCoachId(exactCredit)'), 'Book.jsx must keep the exact credit coach after Stripe return');
  assert(!book.includes('credits.find(c => remainingCredits(c) > 0 && c.payment_processor === \'stripe\')'), 'Book.jsx must not attach first arbitrary Stripe credit');
  assert(athleteOverview.includes('creditBookHref') && athleteOverview.includes("params.set('credit_id'"), 'athlete portal must deep-link existing credits back into booking');
  assert(athleteOverview.includes("params.set('schedule', '1')"), 'athlete portal existing-credit CTA must deep-link directly to scheduling');
  assert(book.includes('const directSchedule') && book.includes('useState(!!directSchedule)'), 'Book.jsx must honor direct schedule links for existing credits');
  assert(book.includes('} else {\n        active = credits.find(c => remainingCredits(c) > 0);'), 'Book.jsx must not fall back to an arbitrary credit when credit_id is provided');
  assert(book.includes('activeCredit.package_id') && book.includes('inferSportForPackage'), 'Book.jsx must carry paid-credit package/sport context into direct scheduling');
  assert(book.includes('apiErrorMessage(err'), 'Book.jsx must surface server booking errors instead of hiding the real reason');
  assert(availability.includes('booking_rules: bookingRules') && availability.includes('bufferedRange'), 'public availability must expose booking rules and buffer busy ranges');
  assert(schedule.includes('bookingRulesForAvailability') && schedule.includes('min_notice_hours'), 'slot grid must hide times that violate coach notice/advance rules');
  assert(booking.includes('allowMissingSport') && booking.includes('effectiveSportKey'), 'booking function must infer sport from a paid package when the shortcut skips sport selection');
  assert(athleteOverview.includes('Credit with ${coachName}') && athleteOverview.includes('Schedule with ${creditCoachName'), 'athlete portal must plainly show which coach a credit belongs to');
  assert(athleteOverview.includes('PaymentHistoryCard') && athleteOverview.includes('stripePaymentRecordRepo.list'), 'athlete portal must show readable payment records');
  assert(checkout.includes('stripe_payment_records') && checkout.includes('ownerReadGrant(accountId)'), 'checkout-created payment records must be readable by the payer');
  assert(stripeWebhook.includes('sendPurchaseNotifications') && stripeWebhook.includes("type: 'payment_receipt'") && stripeWebhook.includes("type: 'credit_purchased'"), 'stripe webhook must notify buyer and coach when prepaid credit is purchased');
  assert(stripeWebhook.includes('creditReadGrants') && stripeWebhook.includes('coachReadGrant'), 'session credits must be readable by the original coach for pending-credit visibility');
});

test('coach portal: prepaid purchases are visible before scheduling', () => {
  const overview = source('src/pages/coach/CoachOverview.jsx');
  const backfill = source('scripts/backfill-permissions.mjs');
  assert(overview.includes('sessionCreditRepo.filter') && overview.includes('Prepaid credits'), 'coach dashboard must load prepaid credits purchased with this coach');
  assert(overview.includes('purchased {credit.package_name') || overview.includes('purchased {credit.package_name ||'), 'coach dashboard must identify client purchases, not only booked sessions');
  assert(backfill.includes('accountForCoachId(doc.original_coach_id || doc.originating_coach_id || doc.coach_id)'), 'permission backfill must grant original coaches read access to existing credits');
});

test('coach portal: reviews have a dedicated route', () => {
  const app = source('src/App.jsx');
  const layout = source('src/components/coach-portal/CoachLayout.jsx');
  const reviews = source('src/pages/coach/CoachReviews.jsx');
  assert(app.includes("import('@/pages/coach/CoachReviews')") && app.includes('path="/coach/reviews"'), 'coach reviews must be a dedicated routed page');
  assert(layout.includes("to: '/coach/reviews'") && !layout.includes("to: '/coach#reviews'"), 'coach sidebar must not route reviews to the dashboard anchor');
  assert(reviews.includes('Published reviews') && reviews.includes('coachReviewRepo.listPublished'), 'coach reviews page must show only review-specific content');
});

test('wellness reports: athlete check-ins are same-day session-bound', () => {
  const wellness = source('src/features/athlete/AthleteWellness.jsx');
  const training = source('functions/training/src/main.js');
  assert(wellness.includes('Session-day wellness report') && wellness.includes('todaySessions'), 'wellness UI must only expose day-of sessions');
  assert(training.includes('session_id is required for session-day wellness reports'), 'training function must require a session_id for wellness reports');
  assert(training.includes('Wellness reports open only on the day of the session'), 'training function must enforce day-of submission');
  assert(training.includes('This session does not belong to this athlete'), 'training function must bind check-in to the athlete session');
  assert(training.includes('coachForGrants.$id') && training.includes('injury_flag'), 'check-ins must grant the session coach read access and persist injury flags');
});

test('parent/minor booking: guardian consent must be exact-child bound', () => {
  const checkout = source('functions/createStripeCheckout/src/main.js');
  const booking = source('functions/booking/src/main.js');
  const sign = source('functions/signLegalAgreement/src/main.js');
  assert(!checkout.includes('!agreement.athlete_id || agreement.athlete_id === athleteId'), 'checkout must not accept unbound guardian agreements');
  assert(!booking.includes('!agreement.athlete_id || agreement.athlete_id === athleteId'), 'booking must not accept unbound guardian agreements');
  assert(sign.includes('Guardian signings require an athlete_id'), 'guardian signing must require athlete_id');
  assert(sign.includes('legalAgreementPermissions(accountId)'), 'signed legal agreements must be readable by the signer');
});

test('coach session management: session state changes stay server-side', () => {
  const booking = source('functions/booking/src/main.js');
  const sessionRepo = source('src/api/repo/sessionRepo.js');
  assert(booking.includes("case 'complete'") || booking.includes('completeAction'), 'booking function must expose complete action');
  assert(booking.includes("case 'cancel'") || booking.includes('cancelAction'), 'booking function must expose cancel action');
  assert(booking.includes("case 'reschedule'") || booking.includes('rescheduleAction'), 'booking function must expose reschedule action');
  assert(sessionRepo.includes("callFn('booking'"), 'sessionRepo must route mutations through booking function');
});

test('organization payout split: split math is server validated', () => {
  const orgAdmin = source('functions/orgAdmin/src/main.js');
  const booking = source('functions/booking/src/main.js');
  assert(orgAdmin.includes('coachShare + orgShare + platformShare !== 10000'), 'org payout split must sum to 10000 bps server-side');
  assert(booking.includes('payout_plan_snapshot'), 'booking must snapshot payout plan at booking time');
});

test('admin refund: refund requires reason, typed confirmation, and idempotency', () => {
  const refund = source('functions/refundStripePayment/src/main.js');
  const adminPayments = source('src/pages/admin/AdminPayments.jsx');
  assert(refund.includes("confirmation || '').trim() !== 'REFUND'"), 'refund server must require typed REFUND confirmation');
  assert(refund.includes('reason is required (3-1000 chars)'), 'refund server must require reason');
  assert(refund.includes('idempotencyKey: `refund_${paymentRecord.$id}_${requestId}`'), 'refund must keep Stripe idempotency key');
  assert(adminPayments.includes('Audit preview: refund'), 'admin refund UI must show audit preview');
});

test('permission denial: sensitive functions are not publicly executable', () => {
  const appwrite = JSON.parse(source('appwrite.json'));
  const publicFns = new Set(['stripeWebhook', 'stripeConnectWebhook', 'getPublicCoaches', 'getCoachAvailability', 'emailDispatch', 'applications']);
  for (const fn of appwrite.functions) {
    const execute = fn.execute || [];
    if (publicFns.has(fn.name)) continue;
    assert(execute.includes('users'), `${fn.name} must require users execute permission`);
    assert(!execute.includes('any'), `${fn.name} must not be public executable`);
  }
});

test('storage privacy: parent and athlete avatars use server-mediated private upload', () => {
  const accountProfile = source('functions/accountProfile/src/main.js');
  const athleteSettings = source('src/pages/athlete/AthleteSettings.jsx');
  const parentSettings = source('src/pages/parent/ParentSettings.jsx');
  assert(accountProfile.includes("PROFILE_PHOTO_BUCKET = 'client-photos'"), 'profile photos must target client-photos');
  assert(accountProfile.includes('InputFile.fromBuffer'), 'profile photo upload must run server-side');
  assert(athleteSettings.includes('uploadProfilePhoto(file)'), 'athlete settings must use server-mediated profile photo upload');
  assert(parentSettings.includes('uploadProfilePhoto(file)'), 'parent settings must use server-mediated profile photo upload');
  assert(!parentSettings.includes("uploadFile('coach-photos'"), 'parent settings must not upload avatars to coach-photos');
});

test('connect webhook: failed or stalled events are reclaimed', () => {
  const connectWebhook = source('functions/stripeConnectWebhook/src/main.js');
  assert(connectWebhook.includes("existing.status === 'failed' || stalled"), 'Connect webhook must reclaim failed/stalled events');
  assert(connectWebhook.includes("status: 'processing'"), 'Connect webhook must reset reclaimed events to processing');
});

if (!existsSync(join(root, 'dist/index.html')) && !process.env.E2E_BASE_URL) {
  throw new Error('dist/index.html not found. Run npm run build before npm run test:e2e.');
}

let server = null;
if (!process.env.E2E_BASE_URL) {
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch { /* still starting */ }
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  throw new Error(`Preview server did not start at ${base}`);
}

const executablePath = chromiumPath();
if (!executablePath) {
  throw new Error('No Chromium found. Install Chrome, set CHROMIUM_PATH, or run `npx playwright install chromium`.');
}
const { chromium } = await import('playwright-core');

let browser = null;
let failed = 0;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath, headless: true });
  for (const { name, fn } of tests) {
    const page = await browser.newPage();
    await mockAppwrite(page);
    try {
      await fn({ page });
      console.log(`ok - ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(err?.stack || err?.message || err);
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
}

if (failed > 0) {
  console.error(`${failed} launch smoke test${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log(`${tests.length} launch smoke tests passed.`);
