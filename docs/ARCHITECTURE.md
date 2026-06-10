# LevelCoach Training — Target Architecture & Contracts

This document is the source of truth for the production cutover. Every implementation
change must conform to the contracts below. Last updated: 2026-06-10.

## 1. Identity & Authorization Model

**Appwrite Account = identity. Authorization = account labels + server-only-writable profile.**

- **Account labels** (only writable via server Users API): `admin`, `superadmin`, `coach`.
  Labels are used in Appwrite permission grants (`Role.label('admin')`) and verified
  server-side in functions via `users.get(accountId).labels`.
- **`profiles`** is server-only writable. Clients read their own profile via a
  per-document read grant. All mutations go through the `accountProfile` function with a
  field whitelist. Consequently `profiles.role`, `coach_id`, `is_minor`,
  `parent_consent_*`, `primary_organization_id`, `onboarding_*` are trustworthy server
  data. `is_minor` is always recomputed server-side from `dob`.
- **Org authority**: `organization_members` (server-only writes). Functions verify
  membership + member role (`org_owner`/`org_admin`/...) before org mutations.
- **Master admin**: bootstrap requires verified email matching `MASTER_ADMIN_EMAIL`
  (server env, not client constant); grants `superadmin` label + locked profile flag.
  `grantAdminRole` requires caller label `superadmin` AND locked master profile.
- Client route guards remain as UX, but are never the security boundary.

## 2. Permission Matrix (provisioner v2)

`documentSecurity: true` = per-document grants used. "server-only" = no client
create/update/delete permissions; Appwrite Functions use the API key which bypasses
collection permissions.

| Collection | docSec | Collection-level perms | Per-document grants (set by server at write) |
|---|---|---|---|
| profiles | ON | read: label(admin) | read: owner account |
| coaches | ON | read: any | (writes server-only via `coachSelf`/admin functions) |
| sessions | ON | read: label(admin) | read: client, coach, guardian(s) |
| session_credits | ON | read: label(admin) | read: owner, guardian(s) |
| conversations / messages | ON | read: label(admin) | read: participants + guardian of minor participant |
| match_requests | ON | read: label(admin) | read: requester + target |
| coach_applications | ON | read+update: label(admin) | read: applicant account (if any) |
| coach_blocks | OFF | read: users; writes server-only (`coachSelf`) | — |
| availability_blocks | OFF | read: any; writes server-only (`coachSelf`) | — |
| pricing_packages | OFF | read: any; create/update/delete: label(admin) | — |
| blog_posts | ON | create: label(admin); read: label(admin) | read: any (granted on publish) |
| site_content | OFF | read: any; writes: label(admin) | — |
| audit_logs | OFF | create: label(admin); read: label(admin); **no update/delete for anyone** | — |
| user_bans | OFF | read/write: label(admin) | — |
| unsubscribe_records | OFF | server-only (public unsubscribe goes through `emailDispatch`) | — |
| organizations | OFF | read: any; writes server-only (`orgAdmin` fn / label(admin)) | — |
| organization_members / organization_coaches | ON | read: label(admin) | read: the member/coach + org admins |
| athlete_profiles | ON | read: label(admin) | read: owner account + guardians; writes server-only (`family`/`accountProfile`) |
| guardian_athletes | ON | read: label(admin) | read: guardian + athlete owner |
| sports | OFF | read: any; writes: label(admin) | — |
| coach_sport_profiles | OFF | read: any; writes server-only (`coachSelf`) | — |
| athlete_availability_preferences | ON | read: label(admin) | read: owner |
| legal_templates | OFF | read: users; writes server-only | — |
| legal_agreements | ON | read: label(admin) | read: signer (+ guardian) |
| legal_admin_notes | OFF | read/create: label(admin) | — |
| stripe_connected_accounts | ON | read: label(admin) | read: owner (coach account / org owner+admins) |
| stripe_payment_records / stripe_transfer_records | ON | read: label(admin) | read: payer / payee owner where known |
| stripe_webhook_events | OFF | server-only; read: label(admin) | — |
| payment_ledger_entries (new) | ON | read: label(admin) | read: payee owner |
| payout_rules (new, per org-coach link) | ON | read: label(admin) | read: org admins + coach |
| admin_assignments | OFF | server-only; read: label(admin) | — |
| notifications (new) | ON | read: label(admin) | read+update: recipient (mark-read only) |
| coach_reviews (new) | ON | read: label(admin); | read: any (granted on approve/auto-publish); writes server-only (`reviews`) |
| athlete_goals / training_plans / training_plan_items / homework_assignments / athlete_assessments / session_check_ins / safety_reports (new) | ON | read: label(admin) | read (and scoped update) for coach + athlete + guardian; writes server-only (`training` fn). safety_reports: reporter read only |
| coach_link_requests (new — was missing) | OFF | server-only; read: label(admin) | — |

**Buckets**: `legal-documents`, `coach-documents`, `generated-receipts`, `coach-resumes`,
`message-attachments`, `progress-media` (new): `fileSecurity: true`, **no** bucket-level
user read/write — per-file grants only, files created server-side or with explicit
per-file permissions. Public buckets (`coach-photos`, `org-logos`, `blog-media`,
`site-content`): read any, create users (own uploads), update/delete label(admin).
`client-photos` becomes private (`fileSecurity: true`, owner+coach grants) — athlete
photos may depict minors.

The provisioner must **update permissions on existing collections/buckets**
(`updateCollection` / `updateBucket`), not only create-if-missing.

## 3. Appwrite Functions (consolidated API surface)

All functions derive the caller from the `x-appwrite-user-id` header (trusted, set by
Appwrite), load the profile server-side, and check labels via the Users API where
admin/coach authority is needed. All write paths validate inputs, log to `audit_logs`
for sensitive actions, and never trust client-supplied prices, roles, ids, or emails.
Multi-action functions take `{ action, ...payload }`.

| Function | Execute | Actions / notes |
|---|---|---|
| `accountProfile` | users | `ensure` (create-or-get own profile, replaces client auto-create), `update` (whitelist: names, phone, dob→recompute is_minor, photo, bio, sport prefs, location, notification prefs). Never: role, coach_id, consent fields, org id, fee fields. |
| `booking` | users | `book` (credit-based; validates: coach active+published, slot inside availability, full-duration conflict check vs sessions+blocks incl. partial-day blackouts, not past, min-notice/buffer/max-advance, legal packet signed by athlete-or-guardian, minor⇒booked/approved by linked guardian, atomic credit decrement w/ rollback), `cancel`, `reschedule` (re-validate), `complete`, `no_show`. Sessions get `athlete_id`, `booked_by_profile_id`, per-doc read grants. Sends transactional emails internally. |
| `messaging` | users | `start`, `send` (sender bound server-side, participant check, per-doc perms incl. guardian read for minors), `report`, `block`. |
| `training` | users | CRUD for goals, training plans/items, homework, assessments, check-ins, session notes visibility. Validates coach↔athlete relationship (existing session or active client link). |
| `family` | users | Parent/guardian: `addChild`, `updateChild`, `linkAthlete`, `setPermissions` (can_book/can_pay/can_message), `approveBooking`. Creates guardian_athletes rows + per-doc grants. |
| `coachSelf` | users | Coach (label `coach`): `updateProfile` (whitelist — never fee/verified/stripe/active fields), `setAvailability`, `setBlocks`, `setSportProfiles`, `requestEmailCode`/`confirmEmailCode` (server-generated, hashed, 10-min expiry, attempt-limited), `publish` (gated: legal packet + Connect ready + verified email + complete profile). |
| `orgAdmin` | users | `create` (creator becomes org_owner), `update`, `inviteCoach`, `acceptInvite`, `removeCoach`, `suspendCoach`, `setPayoutRule` (bps split, validated), `inviteMember`, `setMemberRole`, `publish` (gated: org legal packet + Connect ready). |
| `applications` | any (create) / users | `submit` (coach application; validates; rate-limited per email), `review` (admin label: approve⇒creates coach doc + sets `coach` label + links profile, reject/notes). |
| `adminOps` | users (admin label) | `inviteUser` (implemented at last), `grantCredits`, `revokeCredits`, `banUser`/`unbanUser` (enforced at login via `accountProfile.ensure` returning banned state + functions reject banned callers), `linkCoachAccount`, `setCoachFee`, `setCoachActive`, `publishBlogPost`. |
| `reviews` | users | `submit` (only by clients with a completed session with that coach; one per session), `respond` (coach), `moderate` (admin). Aggregates `rating_avg`/`review_count` onto coaches. |
| `reports` | users | `coachEarnings`, `orgRevenue`, `adminReconciliation` — read from ledger + Stripe records, scoped to caller's authority. |
| `emailDispatch` | any | `unsubscribe` (signed-out OK, token-based), internal template sends for other functions (no arbitrary HTML, suppression-list enforced, per-recipient rate limit). Direct arbitrary email sending is **removed**. |
| `getPublicCoaches` | any | Public marketplace cards — strips PII (no raw email/phone), only published coaches, includes rating aggregates + sports + price hints. |
| `getCoachAvailability` | any | Returns **opaque busy ranges + bookable windows only**. Never session documents. |
| `getMatchingPlayers` | users | Returns display name + age group only. No emails. Requires caller opt-in + (if minor) verified consent. |
| `createStripeCheckout` | users | See §4. |
| `stripeWebhook` | any | Signature-verified; idempotent (unique event index); see §4. |
| `stripeConnectWebhook` | any | `account.updated` → sync `stripe_connected_accounts`. Separate webhook secret. |
| `stripeConnect` | users | `createAccount` (idempotent per owner; caller must own coach/org), `onboardingLink`, `refresh`, `dashboardLink` (Express login link). |
| `refundStripePayment` | users (admin label) | Full/partial refunds; **reverses transfers proportionally**; accumulates `refunded_amount`; sets `partially_refunded`/`refunded`; adjusts credits; ledger entries; audit log. |
| `signLegalAgreement` | users | Verifies caller's actual server-side role; guardian signings must reference a linked `athlete_id`; minors cannot self-sign athlete waivers (guardian must). |
| `generateLegalAgreementPdf` | users | unchanged role-hardening as above. |
| `bootstrapMasterAdmin` / `grantAdminRole` | users | label-verified as described in §1. |

Removed functions: `send-email` (open relay), `sendBookingEmails`, `sendCoachLinkEmail`,
`sendCoachEmailVerification` (folded into `emailDispatch`/`booking`/`adminOps`/`coachSelf`),
`createStripeConnectAccount`/`createStripeConnectOnboarding`/`refreshStripeConnectAccount`
(folded into `stripeConnect`), `getCoachClients` (folded into `reports` with proper scoping).

## 4. Payments (Stripe only — separate charges & transfers)

- **Checkout** (`createStripeCheckout`): server computes price in **cents** from
  `pricing_packages` (admin-controlled) bound to the coach (`package.coach_id` empty =
  platform-wide package). No `transfer_data` — the platform is merchant of record.
  Hard gate: coach (and org, if routed) must have a ready Connect account, signed legal
  packet, and verified email — otherwise checkout is refused (no trapped funds).
- **Split resolution** (server-only, basis points):
  - Platform fee: `PLATFORM_FEE_BPS` env (default **1500** = 15%), overridable per coach
    (`coaches.platform_fee_bps`, admin-set) or per org link (`payout_rules`).
  - Org-affiliated coach (active `organization_coaches` link with a `payout_rules` row):
    default coach **6000**, org **2500**, platform **1500**. Validated: shares sum to 10000.
  - Solo coach: coach `10000 − platform_bps`, org 0.
- **Webhook** (`checkout.session.completed`): idempotent; creates `session_credits`
  (integer `amount_cents`, per-doc read grant for the buyer), creates **real Stripe
  transfers** (`source_transaction = charge`) to coach/org accounts, writes
  `stripe_transfer_records` with real transfer ids + `payment_ledger_entries` rows
  (one per leg: charge, platform_fee, coach_payout, org_payout).
- **Refunds**: admin-only function. Creates refund on the charge, **reverses transfers
  proportionally**, accumulates `refunded_amount`, statuses:
  `paid → partially_refunded → refunded`. Adjusts credits, writes ledger + audit.
- **Disputes**: `charge.dispute.created/closed` handled — payment marked `disputed`,
  credit frozen, admins notified.
- **Connect status**: `stripeConnectWebhook` keeps `stripe_connected_accounts` synced.
- All money fields are integer cents; all splits are integer bps. Ledger is append-only.

## 5. Booking & Scheduling

- Coach availability = `availability_blocks` (recurring windows + date-specific +
  blackouts incl. partial-day) in the coach's IANA timezone (`coaches.timezone`,
  default `America/Detroit`). Sessions store `date`, `start_time`, `duration_minutes`,
  `timezone` (copied from coach at booking), plus derived `starts_at_utc` for sorting.
- Conflict check covers the **full session duration** against confirmed/pending sessions
  and all blocks. Min-notice/buffer/max-advance from `coaches.booking_rules` (JSON).
- Minors: bookable only by/with a linked guardian whose packet is signed;
  `sessions.athlete_id` always identifies the athlete (child) the session is for.
- Cancellation policy enforced server-side; credit restitution by policy windows.

## 6. Multi-sport model

- `sports` seeded with: soccer, basketball, football, baseball, softball, volleyball,
  tennis, lacrosse, hockey, golf, track_field, swimming, speed_agility,
  strength_conditioning, general_performance. Each: display name, category, positions[],
  specialties[], levels[], `assessment_template` JSON (categories → skills, 1–10 scale).
  Soccer template is deep: technical (first touch, short/long passing, shooting,
  finishing, weak foot, dribbling, ball striking), physical (speed, agility,
  conditioning), tactical (positioning, awareness, decision making, defending),
  position-specific blocks (GK/DEF/MID/FWD), mental (confidence, match readiness).
- `coaches.county` enum and soccer-only `profiles.position` enum are deprecated —
  replaced by free-form service location + lat/lng + radius and sport-specific data in
  `athlete_profiles.sports`/`coach_sport_profiles`. Provisioner stops requiring county.
- Search filters: sport, location/radius, level, age group, availability, organization,
  price band, specialty, session type.

## 7. Frontend conventions

- Route-level code splitting (`React.lazy`) for portal/admin bundles.
- New feature components live under `src/features/<area>/` (athlete, parent, coach, org,
  admin, booking, legal, marketplace); shared primitives stay in `src/components/`.
- No fabricated data outside an explicit demo mode (`site_content.demo_mode`, default
  **off**, admin-writable only). No fake stats/ratings/notifications anywhere.
- All function calls go through `src/lib/rpc.js` helpers (`callFunction(name, payload)`).
- Mobile-first, accessible (labels, focus states, contrast), skeleton loading states.

## 8. Legal & compliance

Template set (per role; all copy carries "OPERATIONAL PLACEHOLDER — ATTORNEY REVIEW
REQUIRED" header): platform terms/privacy ack, participation waiver & assumption of risk,
medical authorization + emergency contact, media release, communication & safety policy,
payment/refund/cancellation terms, coach independent-contractor agreement + payout
acknowledgement, background-check consent, code of conduct, organization agreement,
guardian authority + minor participation consent (bound to `athlete_id`).
Server-side gates: booking (both credit and checkout paths), coach publish, org publish,
payout transfers. Signing for minors is guardian-only. Audit log entries for all legal,
payment, ban, role, and refund actions.

## 9. Environment variables

See `.env.example`. Key additions: `PLATFORM_FEE_BPS` (default 1500),
`STRIPE_CONNECT_WEBHOOK_SECRET`, `MASTER_ADMIN_EMAIL` (server-side only),
`APP_BASE_URL` (required in production — no localhost fallback).
