# Appwrite Setup — LevelCoach Training

This is the operational runbook for provisioning the Appwrite backend. The
architectural contract behind it lives in `docs/ARCHITECTURE.md`.

## 1. Prerequisites

- An Appwrite Cloud project (or self-hosted ≥ 1.6).
- A server API key with scopes: `databases.*`, `users.*`, `functions.*`, `storage.*`.
- `.env.local` filled in from `.env.example` (never commit it).

Key identifiers (must match `.env.local`):

| Setting | Value |
|---|---|
| `VITE_APPWRITE_PROJECT_ID` | your project id |
| `VITE_APPWRITE_DATABASE_ID` / `APPWRITE_DATABASE_ID` | defaults to `lctraining` everywhere when omitted — set both explicitly in every environment |

## 2. Provision (idempotent — also the permission cutover)

```bash
node scripts/provision-appwrite.mjs
```

Creates/updates the database, all collections (with attributes + indexes) and
buckets, **and enforces the production permission model on every run** via
`updateCollection`/`updateBucket`:

- Admin access uses **account labels** (`admin`, `superadmin`, `coach`) via
  `Role.label('admin')` — labels are only writable through the server Users API.
- Sensitive collections are server-only writable; user access is granted
  per-document at write time (documentSecurity).
- No collection grants blanket update/delete to `Role.users()`.

If the script warns that an enum could not be widened (e.g. `sessions.status`
`no_show`, `organizations.payout_model` `split`), update those enum elements
once in the Appwrite console.

## 3. Backfill per-document permissions (existing data only)

Existing documents created before the cutover carry no per-document grants, so
their owners can't read them until backfilled:

```bash
node scripts/backfill-permissions.mjs --dry-run   # inspect
node scripts/backfill-permissions.mjs             # apply
```

Run it **after** coach/profile account linking is in place; it is idempotent
and safe to re-run.

## 4. Seed content

```bash
node scripts/seed-sports.mjs            # 15 sports + assessment templates
node scripts/seed-legal-templates.mjs   # legal packet templates (all roles)
```

Both are idempotent. The legal seeder also retires obsolete template versions
so users are never asked to sign superseded documents.

> ⚠️ All seeded legal copy is **operational placeholder text and requires
> attorney review before production use**.

## 5. Functions

```bash
node scripts/configure-functions.mjs   # set env vars on all 24 functions
node scripts/deploy-functions.mjs      # deploy code
```

The function registry is `appwrite.json` (24 functions). Only these are
executable by unauthenticated callers: `stripeWebhook`, `stripeConnectWebhook`,
`getPublicCoaches`, `getCoachAvailability`, `emailDispatch`, `applications`.
Everything else requires a session.

If this project previously deployed the removed functions (`send-email`,
`sendBookingEmails`, `sendCoachEmailVerification`, `sendCoachLinkEmail`,
`createStripeConnectAccount`, `createStripeConnectOnboarding`,
`refreshStripeConnectAccount`, `getCoachClients`), **delete them in the
Appwrite console** — deploys do not auto-prune.

## 6. Stripe wiring

1. Platform webhook → the `stripeWebhook` function URL. Events:
   `checkout.session.completed`, `checkout.session.async_payment_failed`,
   `payment_intent.payment_failed`, `payment_intent.canceled`,
   `charge.refunded`, `refund.created`, `refund.updated`,
   `charge.dispute.created`, `charge.dispute.closed`.
   Signing secret → `STRIPE_WEBHOOK_SECRET`.
2. Connect webhook → the `stripeConnectWebhook` function URL. Events:
   `account.updated`. Signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. `PLATFORM_FEE_BPS` (default 1500 = 15%) is the platform's default take.
   Org/coach splits are managed in-app (`payout_rules`, validated server-side
   to sum to 100%).

Money model: the platform is merchant of record (no destination charges).
The `stripeWebhook` function creates real transfers to coach/org connected
accounts per the server-computed `payout_plan`; refunds reverse transfers
proportionally. Every movement lands in `payment_ledger_entries`.

## 7. Master admin bootstrap

1. Set `MASTER_ADMIN_EMAIL` on the `bootstrapMasterAdmin` function (done by
   `configure-functions.mjs`).
2. Create an account with that email and **verify the email address**.
3. Visit `/master-admin` and run Bootstrap. This grants the `superadmin`
   label and locks the profile (`master_admin_locked`).
4. All further admin/super_admin grants flow through the `grantAdminRole`
   function — reachable from the master-admin portal and the AdminUsers role
   editor (`grantAdminRole` requires the superadmin label + locked profile).
   The coach role/label is also granted by admin-gated flows (application
   approval, coach-account linking/creation). Roles stack: coach + admin +
   super_admin can coexist on one account.

## 8. Verify

```bash
npm run phase0:verify   # structural surface (functions/collections/buckets)
npm run phase7:verify   # production-cutover invariants (security/payments)
```

These are structural tripwires, not behavioral tests. Before go-live, walk the
manual verification list in `GO_LIVE_READINESS_PLAN.md` against the live
project (test-mode Stripe first).

## 9. Buckets

| Bucket | Access |
|---|---|
| coach-photos, org-logos, blog-media, site-content | public read; user create; admin update/delete |
| client-photos, progress-media | private (fileSecurity, owner/coach grants) |
| coach-resumes, message-attachments, coach-documents, legal-documents, generated-receipts | private (fileSecurity; server/per-file grants only) |
