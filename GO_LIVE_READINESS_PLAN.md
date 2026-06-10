# LevelCoach Training — Go-Live Readiness Plan

Last updated: 2026-06-10 (production cutover).

LevelCoach Training is a multi-sport coaching marketplace: athletes and
parents/guardians find coaches, book and pay for sessions, message safely, and
track development; coaches run their business (profile, availability, clients,
training plans, evaluations, earnings, Stripe Connect payouts); organizations
(gyms/academies/clubs) manage rosters, branding, and payout splits; platform
admins operate everything with a locked master-admin root of trust.

## What the cutover delivered

- **Security model**: account-label authorization (`admin`/`superadmin`/`coach`),
  documentSecurity + per-document grants everywhere, server-only writes for all
  sensitive collections, 24 consolidated Appwrite Functions with server-side
  validation, audit logging, ban enforcement, and no client-trusted prices,
  roles, or IDs. Tripwires: `npm run phase7:verify`.
- **Payments**: platform is merchant of record; server-priced checkout in
  integer cents; default platform fee `PLATFORM_FEE_BPS` (15%); org/coach
  splits via `payout_rules` (e.g. 60/25/15) paid as real Stripe transfers from
  the verified webhook; idempotent webhooks; admin refunds with proportional
  transfer reversals; dispute handling; append-only `payment_ledger_entries`
  with reconciliation views for coach, org, and admin.
- **Safety/compliance**: role-specific legal packets (placeholder copy —
  attorney review required), guardian-bound minor consent, minors cannot book
  or self-sign, parent-visible messaging grants, safety reports, private
  buckets actually private.

## Launch checklist (ordered)

### A. Secrets & accounts
- [ ] **Rotate every key currently in `.env.local`** (Stripe live secret,
      Appwrite admin API key, Resend) — they predate the cutover and have sat
      in a working tree. Remove the stale PayPal and BASE44 entries.
- [ ] Use Stripe **test mode** until section D passes end-to-end.
- [ ] Set all vars from `.env.example` in Vercel (frontend) and via
      `scripts/configure-functions.mjs` (functions), including the new
      `STRIPE_CONNECT_WEBHOOK_SECRET`, `PLATFORM_FEE_BPS`, `UNSUBSCRIBE_SECRET`,
      `MASTER_ADMIN_EMAIL`, `APP_BASE_URL`.

### B. Backend provisioning (see APPWRITE_SETUP.md)
- [ ] `node scripts/provision-appwrite.mjs` (permission cutover included)
- [ ] Widen any enums the script flags (console, one-time)
- [ ] `node scripts/backfill-permissions.mjs --dry-run` → apply
- [ ] `node scripts/seed-sports.mjs && node scripts/seed-legal-templates.mjs`
- [ ] `node scripts/configure-functions.mjs && node scripts/deploy-functions.mjs`
- [ ] Delete the 8 superseded functions from the Appwrite console
- [ ] Configure both Stripe webhook endpoints (platform + Connect)

### C. Master admin & roles
- [ ] Create + verify the `MASTER_ADMIN_EMAIL` account → `/master-admin` → Bootstrap
- [ ] Grant admin roles only through the master-admin UI

### D. End-to-end verification (test mode)
- [ ] Coach: apply → admin approval → coach label → profile → availability →
      email-code verification → Stripe Connect onboarding → legal packet →
      **Publish** (gate must list anything missing)
- [ ] Athlete (adult): signup → onboarding → legal packet → buy package
      (Stripe test card) → webhook creates exactly ONE credit (re-send the
      webhook from Stripe to prove idempotency) → book → coach sees session
- [ ] Splits: org with payout rule 60/25 → checkout → verify two transfers in
      Stripe + ledger rows; solo coach → one transfer at 85%
- [ ] Refund from `/admin/payments` → verify Stripe refund + transfer
      reversal(s) + credit adjustment + ledger entries
- [ ] Parent/minor: parent signup → add child → guardian packet (bound to the
      child) → book for child; verify a minor account cannot book or self-sign
- [ ] Messaging: two users → realtime delivery; non-participant cannot read
      (try via console SDK); guardian sees child's thread
- [ ] Permission spot-checks from a throwaway user account via the SDK:
      cannot read other profiles, cannot create credits, cannot update
      coaches/pricing/site_content, cannot read stripe records
- [ ] `npm run phase0:verify && npm run phase7:verify` green in CI

### E. Legal (blocking for real users)
- [ ] Attorney review of ALL legal templates (`src/lib/legalTemplateDefinitions.js`),
      Terms, Privacy — every document is marked
      `OPERATIONAL PLACEHOLDER — ATTORNEY REVIEW REQUIRED`
- [ ] Confirm COPPA posture for under-13 athletes with counsel
- [ ] Decide insurance/background-check vendor for coach verification claims

### F. Cutover
- [ ] Switch Stripe to live keys (after D passes), re-run configure-functions
- [ ] Vercel production deploy; confirm CSP/HSTS headers respond
- [ ] Smoke the five public pages + one full booking with a real card; refund it

## Known limitations / next phases
- Org admins see revenue via reports, not raw coach session lists (permission-scoped).
- Coach background checks are consent-only (no vendor integration yet).
- No automated tests beyond structural verifiers — add Playwright smoke tests.
- Matching is message-based discovery only (legacy match requests removed).
- Webhook retries: failed events (and events stalled in `processing` for over
  10 minutes) are automatically reclaimed on Stripe's next retry; all handlers
  are idempotent, so reprocessing is safe.
