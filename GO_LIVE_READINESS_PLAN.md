# LevelCoach Training Go-Live Readiness Plan

Assessment date: 2026-06-07

## Product Direction

LevelCoach Training is a clean SaaS coaching marketplace and operations platform. The product UI direction is light surfaces, navy/slate text, bright-blue actions, fine blue/gray borders, dashboard cards, responsive workflows, and the LevelCoach wordmark.

The active product surface is:

- athletes and parents discovering coaches, booking sessions, paying, messaging, and tracking progress
- coaches managing profile, availability, clients, sessions, earnings, and messages
- organization/admin users managing coaches, users, pricing, bookings, credits, applications, content, conversations, and revenue

## Launch Blockers

| Priority | Finding | Destination | Acceptance Criteria |
|---|---|---|---|
| P0 | Appwrite environment must be reprovisioned for LevelCoach naming. | `.env.local`, Vercel env, Appwrite Console | `VITE_APPWRITE_DATABASE_ID` and `APPWRITE_DATABASE_ID` are set, provision scripts authenticate, and all active collections exist. |
| P0 | Appwrite function deployment now has a canonical source tree, but still needs live deployment verification. | `appwrite.json`, `functions/*`, deployment scripts | Payment, refund, email, matching, coach availability, public coach, coach-client, legal signing/PDF, master-admin, and Stripe Connect functions deploy and execute. |
| P0 | Payment and credit flows need live verification. | Stripe, Appwrite functions | Each successful Stripe card purchase creates exactly one correct `session_credits` record and handles duplicate webhooks idempotently. |
| P0 | Organization onboarding needs live Appwrite verification. | schema, `CreateOrganization.jsx`, admin/org routes | Organizations, memberships, owner roles, slugs, and logo storage are backed by real collections; Stripe subscription state is completed in the payments phase. |
| P1 | Legal/privacy copy and legal template seed content need review for youth coaching, messaging, payments, refunds, e-signature consent, and document retention. | `Terms.jsx`, `Privacy.jsx`, `src/lib/legalTemplateDefinitions.js`, legal review | Production legal pages and required legal templates are reviewed and approved. |

## Quality Gates

- `npm run build` passes.
- `npm run lint` passes.
- Dependency audit is clean or exceptions are documented.
- Typecheck is passing or intentionally scoped.
- Appwrite metadata check has no missing active collections, attributes, functions, or buckets.
- Stripe sandbox tests pass before live credentials are used.
- `npm run phase0:verify` passes before deploying function changes.
- `npm run phase1:verify` passes before testing onboarding/admin role changes.
- `npm run phase2:verify` passes before testing legal packet signing, booking gates, and admin legal vault workflows.
- `npm run phase3:verify` passes before testing Stripe Checkout, Connect, webhooks, refunds, and reconciliation.
- `npm run legal:seed-templates` has been run after provisioning and counsel-approved template text has been published.
- Booking smoke test passes on mobile and desktop.
- Coach portal smoke test passes.
- Admin portal smoke test passes.
- Matching and parent consent smoke test passes.
- Public route smoke test passes: `/`, `/book`, `/for-coaches`, `/create-account`, `/apply/private-training-coach`, `/create-organization`, `/resources`, `/terms`, `/privacy`.

## Recommended Next Phases

1. Refresh Appwrite API keys and provision the `levelcoach` database.
2. Normalize function source/deployment structure.
3. Verify auth, booking, payments, emails, matching, coach portal, and admin workflows.
4. Live-test legal packet signing/storage enforcement for athletes, guardians, coaches, and organizations.
5. Live-test Stripe Checkout, Connect onboarding, webhook idempotency, refunds, and `/admin/payments` reconciliation in sandbox.
6. Add CI gates for build, lint, audit, schema drift, and Playwright route smoke tests.
