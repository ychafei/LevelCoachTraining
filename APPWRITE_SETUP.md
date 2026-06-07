# Appwrite Setup

LevelCoach Training uses Appwrite for auth, profile data, coach/session records, messaging, storage, and server functions.

## Environment

Set these locally in `.env.local` and in the deployed environment:

```bash
VITE_APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=levelcoach
APPWRITE_DATABASE_ID=levelcoach
APPWRITE_API_KEY=your_server_api_key
MASTER_ADMIN_EMAIL=yousef.elchafei@gmail.com
APP_BASE_URL=https://your-production-domain.example
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_...
```

`VITE_APPWRITE_DATABASE_ID` controls the browser client. `APPWRITE_DATABASE_ID` controls server-side scripts. Both default to `levelcoach` when omitted.
`MASTER_ADMIN_EMAIL` controls the one account allowed to bootstrap the locked platform owner profile.

## Provision

Run the provisioner after the Appwrite project and API key exist:

```bash
node scripts/provision-appwrite.mjs
node scripts/fix-attrs.mjs
npm run legal:seed-templates
```

`legal:seed-templates` creates or refreshes the current required legal template
records for athletes, guardians, coaches, and organizations. The seed content is
operational placeholder copy and must be reviewed by counsel before production
launch.

The active LevelCoach data model is focused on:

- profiles and roles
- coaches and coach link requests
- sessions and session credits
- conversations, messages, and match requests
- coach applications
- pricing packages
- blog/content, unsubscribe records, user bans, and audit logs
- production organization tenancy records
- athlete/guardian profile records
- sports taxonomy and sport-specific coach profiles
- legal template/agreement/admin-note records
- Stripe connected account, payment, transfer, and webhook event records
- delegated admin assignment records

## Storage

Confirm these buckets exist:

- `coach-photos`
- `coach-resumes`
- `site-content`
- `legal-documents`
- `coach-documents`
- `org-logos`
- `generated-receipts`

`legal-documents`, `coach-documents`, and `generated-receipts` are private
production buckets. Generated legal PDFs must never be made public.
Legal PDF files are written with signer account read permission plus Appwrite
`admin`/`super_admin` label read permission. Run the master-admin bootstrap and
admin grant functions after deployment so Appwrite account labels stay aligned
with LevelCoach profile roles.

## Phase 0 verification

Run this before provisioning/deploying functions:

```bash
npm run phase0:verify
```

The verifier checks that every function declared in `appwrite.json` has source
code, PayPal backend functions are no longer declared, and production
collections/buckets are represented in the provisioner.

## Phase 1 verification

Run this after onboarding/admin route changes:

```bash
npm run phase1:verify
```

The verifier checks that onboarding routes, role guards, organization tenant
creation, owner memberships, signed-in coach/org application support, master
admin bootstrap access, and server-side admin role grants are represented in
the codebase.

## Phase 2 verification

Run this after legal signing/vault changes:

```bash
npm run phase2:verify
```

The verifier checks the legal signing function, legal schema fields, versioned
template seed script, signature UI, booking/coach/org gates, PDF regeneration,
and admin legal vault route.

## Phase 3 verification

Run this after Stripe-only payment and payout changes:

```bash
npm run phase3:verify
```

The verifier checks that PayPal/direct-payment UI paths are removed, Stripe
Checkout calculates trusted server-side amounts, Connect onboarding/refresh is
owner-scoped, webhooks are signature-verified and idempotent, refunds are
server-side admin actions, and `/admin/payments` is registered.

## Stripe deployment notes

Deploy these functions together after configuring variables:

- `createStripeCheckout`
- `stripeWebhook`
- `createStripeConnectAccount`
- `createStripeConnectOnboarding`
- `refreshStripeConnectAccount`
- `refundStripePayment`

Point the Stripe webhook endpoint at the deployed `stripeWebhook` function and
subscribe at minimum to Checkout Session, Payment Intent, Charge, and Refund
events. Credits must be issued only from the verified webhook path, not from
client-side success redirects.

## Verify

1. Visit `/create-account` and create an athlete account.
2. Visit `/book` and confirm coaches/packages load.
3. Visit `/coach` with a linked coach account.
4. Visit `/admin` with an admin account and confirm users, coaches, pricing, bookings, credits, applications, and messages load.
5. Visit `/master-admin` as the configured master email after email verification and run bootstrap.
6. Visit `/create-organization` from onboarding and confirm it creates an `organizations` record plus an active `organization_members` owner row.
7. Visit `/parent`, `/coach`, `/organization`, and `/book` with seeded legal templates and confirm required legal packets block the relevant workflows until signed.
8. Visit `/admin/legal-documents` as an admin and confirm templates, signed agreements, PDF links, regeneration, filters, and admin notes load.
9. Visit `/coach/earnings` and `/organization` to create/refresh Stripe Connect onboarding links.
10. Visit `/admin/payments` as an admin and confirm payment, transfer, webhook, and refund controls load.
