# LevelCoach Design System — "Performance Premium"

Brand idea: **quiet confidence — proof over promises.** LevelCoach's real
differentiator is that its safety and payment guarantees are server-enforced
mechanics, not marketing. The design's job is to make that substance *felt*
on every screen: calm, premium, specific, never shouting.

Last updated: 2026-06-11. This file is the binding reference for all UI work;
`docs/ARCHITECTURE.md` governs behavior, this governs presentation.

## 1. The psychological journey (page-by-page)

Each page has ONE psychological job. Design every section to serve it.

| Beat | Pages | Visitor's silent question | Design answer |
|---|---|---|---|
| **Orient** (0–5s) | Landing | "Is this for me, and is it legit?" | One clear promise + one action + proof strip above the fold. No competing CTAs. |
| **Explore** | How-it-works, For-X | "How does this actually work? What's the catch?" | Mechanism transparency; answer objections where they arise, not in a hidden FAQ. |
| **Compare** | CoachSearch, OrgDirectory | "How do I choose without getting burned?" | Comparable facts on every card: price, rating, sports, distance. Honest badges only. |
| **Commit** | CoachDetail | "Can I trust this stranger with my kid / my money?" | Decision info BEFORE the button: price, cancellation policy, what-happens-next, honestly-scoped vetting. |
| **Pay** | Book | "Is my money safe right now?" | Zero brand shift, risk reversal AT the pay step, the charged amount is the biggest number on screen. |
| **Hand over trust** | Login, CreateAccount, Apply, CreateOrganization | "Why do you need this?" | Every sensitive ask explained inline. Never discard typed data. No fake controls. |
| **Belong** | Portals | "Was this the right call?" | First screen shows progress + the next step, never an empty wall or marketing chrome. |

## 2. Voice

- Sentence case everywhere. ALL-CAPS only for tiny eyebrows/labels, never headings.
- Specific beats superlative: "Reviews come only from completed sessions" > "Trusted by athletes".
- Never claim what the platform doesn't enforce. "Email verified" is not "Verified".
- Explain asks at the ask: DOB → "to apply guardian protections for under-18s".
- Numbers are proof: render counts/prices/ratings in `tabular-nums`, large and calm.

## 3. Tokens (src/index.css)

- Background: warm off-white (`--background`), navy ink (`--foreground`).
- Primary/accent: electric blue — interactive elements ONLY (buttons, links, focus).
- `--proof` (amber): reserved for proof moments — ratings, stats, live counts,
  savings. Never for decoration; scarcity of the color is what makes it read as signal.
- Radius 0.75rem; shadows soft and few (`shadow-sm` default, one hero-level shadow max per page).

## 4. Type scale

Inter only. Hierarchy comes from weight + size + ink, not font changes.

- Hero H1: `text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.02em]`
- Section H2: `text-3xl sm:text-4xl font-bold tracking-[-0.01em]`
- Card H3: `text-lg font-semibold`
- Eyebrow: `text-xs font-bold uppercase tracking-[0.18em] text-primary` (or muted)
- Body: `text-base leading-7 text-muted-foreground` (15–16px floor; never below 13px)
- Proof numbers: `proof-number` utility (tabular-nums, tight tracking, extrabold)

## 5. Layout rhythm

- Max widths: marketing `max-w-6xl`, forms `max-w-xl`, portals `max-w-7xl`.
- Section padding: `py-16 sm:py-24` marketing; cards `p-5`/`p-6`.
- One primary CTA per viewport-height. Secondary actions are ghost/outline.
- F-pattern: the answer to the page's silent question must sit top-left or dead center above the fold.

## 6. Trust component rules

- **Badges:** label = exactly what was checked ("Email verified", "Stripe payouts
  active", "Background-check consented"). No bare "Verified".
- **Price:** visible at every decision point (search card, profile aside, checkout).
  If a filter/sort uses a value, the value must be visible on results.
- **Risk reversal:** the cancellation/credit policy appears with every Book/Pay
  button, not after payment.
- **What happens next:** every commitment (apply, book, pay, create org) is
  followed—and preceded—by a numbered next-steps strip.
- **Forms:** sensitive fields carry a one-line "why we ask"; OAuth buttons go
  ABOVE the form (never after typed input); no dead controls, no unlinked
  document references.

## 7. State quality bar

Every async surface ships all four: skeleton (shaped like the content, `role="status"`),
empty (explains + one next step), error (plain words + retry), loaded.
`src/features/athlete/portalShared.jsx` is the reference implementation.

## 8. Rollout

- **Phase 1 (done):** tokens/utilities; Landing; CoachSearch + card pricing/badges;
  CoachDetail decision panel; Book risk-reversal + light theme; auth trust fixes;
  Footer signed-in variant; Navbar consistency.
- **Phase 2:** portal unification to sentence-case premium style (athlete pattern
  wins), org portal overview-first + go-live checklist, account menu + notifications
  for all roles, admin surfaces.
