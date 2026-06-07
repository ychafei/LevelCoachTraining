# Design QA

final result: passed for demo marketplace

Scope:
- Public navbar and logo consistency
- Logged-out coach search results route
- Logged-out public coach profile route
- Logged-out book-intro route
- Master-admin demo profile toggle

Passed:
- Public navbar uses the shared LevelCoach mark/text lockup.
- Footer uses the same shared LevelCoach logo.
- `Find a Coach` routes to `/coaches`.
- `/coaches` renders the filtered marketplace layout with responsive controls.
- Missing coach profile/book intro states fail gracefully.
- Demo marketplace shows 25 sample profiles.
- Sport filtering returns 5 demo profiles for Soccer.
- Demo profile detail pages render.
- Demo book-intro pages render and show the account-required gate.
- Master-admin content page includes a `demo_coach_profiles_enabled` toggle.
- `npm run lint` passes.
- `npm run build` passes.

Remaining external dependency:
- Appwrite calls still fail in the local browser with `TypeError: Failed to fetch`, so real live coach rows could not be visually compared. Demo profiles intentionally cover the public preview path until real coaches are available/reachable.

Notes:
- The UI is wired to real public coach data through `getPublicCoaches`; no fake ratings, reviews, coach prices, or organization names are generated.
- Demo profiles are explicit sample data and can be disabled through the master-admin content setting.
- When the backend returns public coaches, search cards, profiles, and book-intro summaries populate from the shared public coach display mapper alongside demos while demos are enabled.
