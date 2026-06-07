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
| P0 | Appwrite function deployment still needs a canonical function tree. | `appwrite.json`, function sources, deployment scripts | Payment, email, matching, coach availability, public coach, and coach-client functions deploy and execute. |
| P0 | Payment and credit flows need live verification. | Stripe, PayPal, Appwrite functions | Each successful card or PayPal purchase creates exactly one correct `session_credits` record and handles duplicate webhooks idempotently. |
| P0 | Organization onboarding needs real tenant data. | schema, `CreateOrganization.jsx`, admin/org routes | Organizations, memberships, owner roles, slugs, logo storage, subscription state, and org dashboard behavior are backed by real collections. |
| P1 | Legal/privacy copy needs review for youth coaching, messaging, payments, refunds, and consent. | `Terms.jsx`, `Privacy.jsx`, legal review | Production legal pages are reviewed and approved. |

## Quality Gates

- `npm run build` passes.
- `npm run lint` passes.
- Dependency audit is clean or exceptions are documented.
- Typecheck is passing or intentionally scoped.
- Appwrite metadata check has no missing active collections, attributes, functions, or buckets.
- Stripe and PayPal sandbox tests pass before live credentials are used.
- Booking smoke test passes on mobile and desktop.
- Coach portal smoke test passes.
- Admin portal smoke test passes.
- Matching and parent consent smoke test passes.
- Public route smoke test passes: `/`, `/book`, `/for-coaches`, `/create-account`, `/apply/private-training-coach`, `/create-organization`, `/resources`, `/terms`, `/privacy`.

## Recommended Next Phases

1. Refresh Appwrite API keys and provision the `levelcoach` database.
2. Normalize function source/deployment structure.
3. Verify auth, booking, payments, emails, matching, coach portal, and admin workflows.
4. Finish organization tenant schema and dashboard behavior.
5. Add CI gates for build, lint, audit, schema drift, and Playwright route smoke tests.
