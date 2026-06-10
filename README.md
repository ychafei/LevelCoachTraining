# LevelCoach Training

A multi-sport coaching marketplace and operations platform.

- **Athletes** find coaches across 15 sports, book paid sessions with credits,
  track goals, training plans, homework, skill assessments, and wellness.
- **Parents/guardians** manage child athlete profiles, sign minor consent
  packets, book and pay on their children's behalf, and monitor messaging.
- **Coaches** run a full business portal: profile, sport specialties,
  availability, bookings, client evaluations, training plans, earnings, and
  Stripe Connect payouts.
- **Organizations** (gyms/academies/clubs) brand a roster, invite and manage
  coaches, and configure payout splits (e.g. coach 60% / org 25% / platform 15%).
- **Admins** operate applications, payments, refunds, reconciliation, legal
  documents, safety reports, and content — rooted in a locked master admin.

## Stack

Vite + React 18 SPA · Appwrite (auth, database, storage, functions) ·
Stripe (checkout, Connect transfers, webhooks) · Tailwind + shadcn/Radix.

Architecture contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —
account-label authorization, per-document permissions, 24 server functions,
server-side pricing/splits in integer cents/bps.

## Run locally

```bash
cp .env.example .env.local   # fill in real values
npm install
npm run dev
```

Backend setup (Appwrite provisioning, seeds, functions, Stripe webhooks):
see [`APPWRITE_SETUP.md`](APPWRITE_SETUP.md).
Launch checklist: [`GO_LIVE_READINESS_PLAN.md`](GO_LIVE_READINESS_PLAN.md).

## Commands

```bash
npm run build            # production build
npm run lint             # eslint
npm run phase0:verify    # structural surface check (functions/collections)
npm run phase7:verify    # production-cutover security/payments invariants
npm run verify:all       # all phase verifiers
npm run sports:seed      # seed the sports catalog (15 sports + assessments)
npm run legal:seed-templates  # seed legal packet templates
```

## Legal notice

All legal template copy, Terms, and Privacy content in this repository is
**operational placeholder text marked for attorney review** and must not be
relied on in production without counsel sign-off.
