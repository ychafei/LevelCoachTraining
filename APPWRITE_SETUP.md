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
```

`VITE_APPWRITE_DATABASE_ID` controls the browser client. `APPWRITE_DATABASE_ID` controls server-side scripts. Both default to `levelcoach` when omitted.

## Provision

Run the provisioner after the Appwrite project and API key exist:

```bash
node scripts/provision-appwrite.mjs
node scripts/fix-attrs.mjs
```

The active LevelCoach data model is focused on:

- profiles and roles
- coaches and coach link requests
- sessions and session credits
- conversations, messages, and match requests
- coach applications
- pricing packages
- blog/content, unsubscribe records, user bans, and audit logs

## Storage

Confirm these buckets exist:

- `coach-photos`
- `coach-resumes`
- `site-content`

## Verify

1. Visit `/create-account` and create an athlete account.
2. Visit `/book` and confirm coaches/packages load.
3. Visit `/coach` with a linked coach account.
4. Visit `/admin` with an admin account and confirm users, coaches, pricing, bookings, credits, applications, and messages load.
