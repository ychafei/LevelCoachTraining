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
  const bookingPackage = JSON.parse(source('functions/booking/package.json'));
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
  assert(booking.includes('resolveBookingAthlete') && booking.includes('isSelfProfileAthleteId'), 'booking must accept self-managed adult profile ids as athlete ids');
  assert(booking.includes('athlete_id: sessionAthleteId'), 'booking must store a stable athlete id on the session');
  assert(bookingPackage.dependencies?.stripe, 'booking function must declare stripe because payout release code imports it at module load');
  assert(checkout.includes('isSelfProfileAthleteId(profile, athleteId)'), 'checkout/top-up access must accept self-managed adult profile ids on credits');
  assert(athleteOverview.includes('Transferable credit from ${coachName}') && athleteOverview.includes('use with any published coach'), 'athlete portal must show source coach while making credit transferability clear');
  assert(stripeWebhook.includes('apply the remaining balance toward another published coach') && stripeWebhook.includes('transferable by remaining dollar value'), 'payment emails must not imply credits are locked to the origin coach');
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

test('public marketplace: coach cards use gated save/message/book actions and safe aggregate stats', () => {
  const card = source('src/components/public/PublicCoachCard.jsx');
  const actions = source('src/components/public/CoachActionControls.jsx');
  const search = source('src/pages/CoachSearch.jsx');
  const detail = source('src/pages/CoachDetail.jsx');
  const navbar = source('src/components/layout/Navbar.jsx');
  const creditsModal = source('src/components/layout/CreditsModal.jsx');
  const publicFn = source('functions/getPublicCoaches/src/main.js');
  const publicModel = source('src/lib/publicCoach.js');
  const coachSelf = source('functions/coachSelf/src/main.js');
  const accountProfile = source('functions/accountProfile/src/main.js');
  const packagesManager = source('src/features/coach/PackagesManager.jsx');
  assert(card.includes('role="link"') && card.includes('View full profile'), 'coach card must navigate to the full public profile from the card surface');
  assert(card.includes('SaveCoachButton') && card.includes('CoachActionPanel'), 'coach card must expose save, message, and book actions');
  assert(card.includes('model.presenceLabel'), 'coach cards must use the shared active/not-active label');
  assert(!card.includes('Building roster'), 'coach cards must not show filler active-athlete copy for new coaches');
  assert(actions.includes('Continue with Google') && !actions.includes('Continue with Facebook') && !actions.includes('Continue with Apple'), 'logged-out coach actions must use the Google-only LC auth gate');
  assert(actions.includes("conversationRepo.start({ coach_id: model.id") && actions.includes("navigate('/messages')"), 'message action must start/reuse a real coach conversation');
  assert(actions.includes('saved_coach_ids') && actions.includes('auth.updateCurrentUser'), 'save action must persist to the signed-in profile preferences');
  assert(search.includes('Saved coaches') && search.includes('showSavedOnly') && search.includes('savedCoachIds.has'), 'coach search must expose a signed-in saved-coaches list filter');
  assert(navbar.includes('CreditsModal') && navbar.includes('Credits: ${count} session') && !navbar.includes('Balance:'), 'top nav credit affordance must be a Credits pill, not a Balance link');
  assert(creditsModal.includes('Use Your Credits') && creditsModal.includes('Recent coaches are shown from most recent to least recent') && creditsModal.includes('Book session'), 'credits pill must open a recent-coach booking modal with a normal booking CTA');
  assert(creditsModal.includes('remaining credit value can be applied toward another coach') && creditsModal.includes('sessionRepo.list') && creditsModal.includes('coachRepo.get'), 'credits modal must explain transferable value and load real recent coach rows');
  assert(creditsModal.includes("callFn('getPublicCoaches'") && creditsModal.includes('Here are published coaches near your area') && creditsModal.includes('matchesCoachSearch'), 'credits modal must fall back to published coaches in the client area when no recent coaches exist');
  assert(creditsModal.includes('onBrowseCoaches') && !creditsModal.includes('BrowseCoachesCallout compact'), 'credits modal browse action must close the popup and avoid a duplicate bottom browse block');
  assert(creditsModal.includes('onBookSession') && creditsModal.includes('onClick={onBookSession}'), 'credits modal coach booking action must close the popup before navigating');
  assert(detail.includes('IntroVideo') && detail.includes('CoachActionPanel') && detail.includes('BookCoachButton'), 'public coach profile must render intro video and gated actions');
  assert(publicFn.includes('sessions_taught') && publicFn.includes('active_athletes') && publicFn.includes('last_active_at'), 'public coaches function must return only safe coach aggregate/presence fields');
  assert(publicFn.includes('singleSessionPriceCents') && publicFn.includes('candidatePriceHint'), 'public function must anchor display price to Single Session before discounted bundles');
  assert(publicModel.includes('coachIntroEmbedUrl') && publicModel.includes('sessionsTaughtLabel') && publicModel.includes('activeAthletesLabel'), 'public coach display model must normalize video and stats');
  assert(publicModel.includes('publicPackageSessionDollars') && publicModel.includes('packageSingleSessionDollars'), 'frontend package fallback must anchor display price to Single Session');
  assert(publicModel.includes('end <= today.minutes') && publicModel.includes('Available today'), 'public next availability must not advertise past slots today');
  assert(publicModel.includes('showActiveAthletes = safeActiveAthletes >= 2'), 'public model must hide active-athlete stat until it is meaningful');
  assert(coachSelf.includes('last_active_at: new Date().toISOString()'), 'coach portal reads must update the public recent-activity signal');
  assert(coachSelf.includes('price_hint_cents: primary.price_cents'), 'saving Single Session must sync the coach public price hint');
  assert(packagesManager.includes('Default public package: Single Session') && packagesManager.includes('Session price (USD)'), 'coach package editor must default to a simple Single Session price flow');
  assert(accountProfile.includes('touchLinkedCoachActivity') && accountProfile.includes('last_active_at'), 'normal logged-in profile reads must update linked coach recent activity');
});

test('coach portal: reviews have a dedicated route', () => {
  const app = source('src/App.jsx');
  const layout = source('src/components/coach-portal/CoachLayout.jsx');
  const reviews = source('src/pages/coach/CoachReviews.jsx');
  assert(app.includes("import('@/pages/coach/CoachReviews')") && app.includes('path="/coach/reviews"'), 'coach reviews must be a dedicated routed page');
  assert(layout.includes("to: '/coach/reviews'") && !layout.includes("to: '/coach#reviews'"), 'coach sidebar must not route reviews to the dashboard anchor');
  assert(reviews.includes('Published reviews') && reviews.includes('coachReviewRepo.listPublished'), 'coach reviews page must show only review-specific content');
  assert(reviews.includes('Session feedback:'), 'coach reviews page must show the post-session feedback label');
});

test('post-session reviews: completed clients are prompted and reviews stay verified', () => {
  const prompt = source('src/features/athlete/PostSessionReviewPrompt.jsx');
  const athletePortal = source('src/pages/athlete/AthletePortal.jsx');
  const parentPortal = source('src/pages/parent/ParentPortal.jsx');
  const childDetail = source('src/features/parent/ChildDetail.jsx');
  const portalData = source('src/features/athlete/useAthletePortalData.js');
  const sessionsPanel = source('src/features/athlete/SessionsPanel.jsx');
  const bookingFn = source('functions/booking/src/main.js');
  const reviewFn = source('functions/reviews/src/main.js');
  const provision = source('scripts/provision-appwrite.mjs');
  const backfill = source('scripts/backfill-session-review-requests.mjs');
  const coachDetail = source('src/pages/CoachDetail.jsx');
  const coachReviews = source('src/pages/coach/CoachReviews.jsx');
  assert(prompt.includes('How was your session with') && prompt.includes('SESSION_FEEDBACK_OPTIONS'), 'post-session review prompt must ask for quick session feedback');
  assert(prompt.includes("feedback === 'other'") && prompt.includes('review-other'), 'Other feedback must open a required text box');
  assert(prompt.includes('firstPendingReviewSession') && prompt.includes("session.status === 'completed'"), 'auto prompt must target completed unreviewed sessions only');
  assert(prompt.includes('reviewSessionById') && prompt.includes('onReviewConsumed'), 'review prompt must open direct review_session deep links exactly once');
  assert(athletePortal.includes('PostSessionReviewPrompt') && parentPortal.includes('PostSessionReviewPrompt'), 'adult and parent portal shells must mount the instant review prompt');
  assert(athletePortal.includes("searchParams.get('review_session')") && parentPortal.includes("searchParams.get('review_session')"), 'athlete and parent portals must pass review_session deep links into the prompt');
  assert(parentPortal.includes('useMyReviewedSessionIds') && parentPortal.includes('reviewedSessionIds={reviewsData.reviewedSessionIds}'), 'parent portal must share reviewed state with child session review buttons');
  assert(portalData.includes('SESSION_REFRESH_MS') && portalData.includes('refetchInterval: SESSION_REFRESH_MS'), 'session data must refresh so coach-completed sessions can trigger the prompt without manual reload');
  assert(sessionsPanel.includes('ReviewSessionDialog') && sessionsPanel.includes('onReviewChanged'), 'manual session review button must use the same review dialog and refresh review state');
  assert(bookingFn.includes('session_review_requested') && bookingFn.includes('requestClientSessionReview'), 'booking completion must create a client review notification/email');
  assert(bookingFn.includes("newStatus === 'completed' && changedStatus"), 'review requests must only fire on the first completed transition');
  assert(bookingFn.includes("params.set('review_session', sessionId)") && bookingFn.includes('Rate your session with'), 'completion review request must deep-link to the exact session review modal');
  assert(reviewFn.includes("session.status !== 'completed'") && reviewFn.includes('You can only review your own sessions'), 'review function must remain completed-session and owner verified');
  assert(reviewFn.includes('session_feedback_key') && reviewFn.includes('session_feedback_other'), 'review function must persist quick feedback fields');
  assert(provision.includes('session_feedback_label') && provision.includes('session_feedback_other'), 'Appwrite schema must include feedback fields');
  assert(backfill.includes('Backfill missing "How was your session?" prompts') && backfill.includes("session.status !== 'completed'"), 'review request backfill must exist and keep completed-session verification');
  assert(backfill.includes('sessionHasReview') && backfill.includes('notificationExists') && backfill.includes('session_review_backfill_notice'), 'review backfill must be idempotent and notify coaches');
  assert(coachDetail.includes('Session feedback:') && coachReviews.includes('Session feedback:'), 'public coach profile and coach reviews page must display feedback');
});

test('wellness reports: athlete check-ins are same-day session-bound', () => {
  const wellness = source('src/features/athlete/AthleteWellness.jsx');
  const training = source('functions/training/src/main.js');
  const trainingRepo = source('src/api/repo/trainingRepo.js');
  assert(wellness.includes('Session-day wellness report') && wellness.includes('todaySessions'), 'wellness UI must only expose day-of sessions');
  assert(training.includes('session_id is required for session-day wellness reports'), 'training function must require a session_id for wellness reports');
  assert(training.includes('Wellness reports open only on the day of the session'), 'training function must enforce day-of submission');
  assert(training.includes('This session does not belong to this athlete'), 'training function must bind check-in to the athlete session');
  assert(training.includes('coachForGrants.$id') && training.includes('injury_flag'), 'check-ins must grant the session coach read access and persist injury flags');
  assert(trainingRepo.includes("sport_key: ''") && trainingRepo.includes('sport_key is not a known sport'), 'training mutations must retry without optional sport_key when production sports data lags');
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
  const sessionsPanel = source('src/features/athlete/SessionsPanel.jsx');
  assert(booking.includes("case 'complete'") || booking.includes('completeAction'), 'booking function must expose complete action');
  assert(booking.includes("case 'cancel'") || booking.includes('cancelAction'), 'booking function must expose cancel action');
  assert(booking.includes("case 'reschedule'") || booking.includes('rescheduleAction'), 'booking function must expose reschedule action');
  assert(sessionRepo.includes("callFn('booking'"), 'sessionRepo must route mutations through booking function');
  assert(booking.includes('Sessions inside 24 hours cannot be self-rescheduled'), 'client/guardian reschedules inside 24 hours must be blocked server-side');
  assert(booking.includes('LevelCoach session confirmed') && booking.includes('coachNotifyEmail'), 'new bookings must email both the client and coach');
  assert(booking.includes('sendSessionEventEmails(db') && booking.includes('booking_cancelled') && booking.includes('booking_rescheduled'), 'booking changes must send transactional emails to both parties');
  assert(sessionsPanel.includes('Reschedule locked'), 'athlete/parent portal must not offer self-service late rescheduling');
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

test('settings routing: signup details round-trip into role settings/profile pages', () => {
  const app = source('src/App.jsx');
  const navbar = source('src/components/layout/Navbar.jsx');
  const createAccount = source('src/pages/CreateAccount.jsx');
  const onboarding = source('src/pages/onboarding/OnboardingCompletion.jsx');
  const athleteSettings = source('src/pages/athlete/AthleteSettings.jsx');
  const parentSettings = source('src/pages/parent/ParentSettings.jsx');
  const parentAthletes = source('src/features/onboarding/ParentAthletesStep.jsx');
  const childForm = source('src/features/parent/ChildForm.jsx');
  const familyFn = source('functions/family/src/main.js');
  const createOrg = source('src/pages/CreateOrganization.jsx');
  const orgProfile = source('src/features/org/OrgProfileTab.jsx');
  const coachApply = source('src/pages/apply/ApplyPrivateTrainingCoach.jsx');

  assert(!app.includes("import('@/pages/Settings')"), 'generic Settings page must not be route-loaded');
  assert(app.includes('const SettingsRedirect') && app.includes('path="/settings" element={<SettingsRedirect />}'), 'legacy /settings must redirect instead of rendering a duplicate page');
  assert(app.includes('<Navigate to="/athlete/settings" replace />'), 'athlete fallback settings route must be /athlete/settings');
  assert(app.includes('<Navigate to="/parent/settings" replace />'), 'parent settings redirect must use /parent/settings');
  assert(app.includes('<Navigate to="/coach/settings" replace />'), 'coach settings redirect must use /coach/settings');
  assert(app.includes('<Navigate to="/organization?tab=profile" replace />'), 'organization settings redirect must land on the org profile tab');
  assert(navbar.includes('settingsPathForRole') && !navbar.includes('to="/settings"'), 'navbar Settings links must use role-specific destinations, never /settings');
  assert(navbar.includes("return '/athlete/settings'") && navbar.includes("return '/parent/settings'") && navbar.includes("return '/coach/settings'"), 'navbar must route athlete/parent/coach settings separately');

  assert(createAccount.includes("onboarding_role: 'athlete'") && createAccount.includes('first_name: form.firstName.trim()') && createAccount.includes('location_label: buildLocationLabel'), 'athlete signup must save identity and location to the profile');
  assert(createAccount.includes("onboarding_role: 'parent'") && createAccount.includes('phone: normalizePhoneForStorage(form.phone)'), 'parent signup must save parent account details to the profile');
  assert(onboarding.includes('parseLocationLabel(user?.location_label)') && onboarding.includes('parseAthleteBio(user?.bio)'), 'athlete onboarding must prefill from signup-saved profile fields');
  assert(onboarding.includes('profile_setup_complete: true') && onboarding.includes('location_label: buildLocationLabel'), 'athlete onboarding completion must persist the confirmed fields once');
  assert(athleteSettings.includes('user?.first_name') && athleteSettings.includes('user?.phone') && athleteSettings.includes('parseLocationLabel(user?.location_label)'), 'athlete settings must prefill account and sport profile fields from the saved profile');
  assert(athleteSettings.includes('sports: form.sports') && athleteSettings.includes('skill_level: form.skill_level') && athleteSettings.includes('location_label: locationLabel'), 'athlete settings must save editable sport/location fields back to the same profile');

  assert(parentSettings.includes('user?.first_name') && parentSettings.includes('await auth.updateCurrentUser({') && parentSettings.includes('parent_relationship: form.parent_relationship.trim()'), 'parent settings must edit the parent profile created during signup');
  assert(parentAthletes.includes('create_child_account') && parentAthletes.includes('child_email') && parentAthletes.includes('child_password'), 'parent onboarding must support optional player login creation for eligible children');
  assert(parentAthletes.includes('preferred_name: form.preferredName.trim()') && parentAthletes.includes('training_goals: form.trainingGoal.trim()'), 'parent onboarding must persist rich child athlete info');
  assert(childForm.includes('function formFromChild') && childForm.includes('skill_level: child?.skill_level') && childForm.includes('health_notes: child?.health_notes'), 'parent child editor must prefill existing child athlete details');
  assert(familyFn.includes('createChildLogin') && familyFn.includes('Parent and player accounts cannot share one email') && familyFn.includes('profile_setup_complete: true'), 'family function must create unique child player accounts and prevent shared parent/child emails');

  assert(createOrg.includes("onboarding_role: currentUser.onboarding_status === 'complete' ? undefined : 'organization'") && createOrg.includes("action: 'create'"), 'organization signup must persist owner profile fields and create the org server-side');
  assert(orgProfile.includes('setForm({') && orgProfile.includes('name: organization.name') && orgProfile.includes('contact_email: organization.contact_email'), 'organization profile tab must prefill from the created organization');
  assert(coachApply.includes('current.firstName || user.first_name') && coachApply.includes('profile_setup_complete: true'), 'coach application must reuse signed-in profile details and mark coach applicants complete when appropriate');
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
