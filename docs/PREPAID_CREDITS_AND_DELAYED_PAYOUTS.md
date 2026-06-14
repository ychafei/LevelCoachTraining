# Prepaid Credits and Delayed Payouts

Status: implementation specification  
Last updated: 2026-06-13

## 0. Purpose

LevelCoach is the merchant of record. Client payments are collected by
LevelCoach, recorded as prepaid client credit, and held as a platform liability
until a session outcome makes that value earned by a coach or organization.

This spec replaces the current "pay coach/org at checkout" behavior with a
"reserve at booking, release at earned session outcome" model.

## 1. Repository Implementation Status

Implemented in the first cutover patch:

- `createStripeCheckout` creates platform Checkout payments only. It no longer
  embeds payout plans, connected-account destinations, `transfer_data`, or
  Connect application fees.
- `stripeWebhook.checkout.session.completed` creates value-based prepaid credit
  and credit/payment ledger rows. It no longer creates coach/org transfers.
- `booking.book` reserves credit value in cents, allows unused credit to be
  applied to a different published coach, snapshots server-computed price/split
  data, and returns a top-up requirement when available value is insufficient.
- `booking.complete`, `booking.no_show`, and `booking.late_cancelled_chargeable`
  capture the reservation, recognize earned value, create payout obligations,
  and create Stripe transfers to coach/org connected accounts.
- `refundStripePayment` refunds unused available credit without reversing
  coach/org transfers; earned-session refunds can reverse transfers when a
  `session_id` is supplied.
- `scripts/provision-appwrite.mjs` provisions the new credit ledger,
  reservations, payout obligations, and delayed-payout snapshot fields.
- Legal seed text and the primary architecture/setup docs now describe the
  merchant-of-record prepaid credit model.

Known follow-up work before full production cutover:

- Build a first-class top-up UI flow. The backend currently blocks underfunded
  bookings with a structured `requires_top_up` response.
- Add a migration/backfill script for existing coach-locked credits and any
  checkout-time transfer advances already sent before this patch.
- Add admin UI/reporting for `credit_ledger_entries`,
  `credit_reservations`, and `payout_obligations`.
- Backfill deterministic `idempotency_key` values on legacy ledger/transfer rows
  before converting query indexes on those legacy collections to unique indexes.

## 2. Accounting Rules

- All money amounts are integer cents. Never store or calculate money as floats.
- All split percentages are integer basis points. Valid payout shares always sum
  to exactly `10000`.
- All ledgers are append-only. Corrections are new reversing/adjusting entries,
  never edits or deletes.
- Every ledger-producing operation has a deterministic idempotency key with a
  unique index.
- Never trust client-supplied prices, roles, payout splits, coach ids, org ids,
  or connected-account ids. The server re-reads and validates them.
- Stripe Checkout must not include `transfer_data`, `application_fee_amount`, or
  any destination connected account.
- Coaches/orgs are paid only from server-finalized session outcomes:
  `completed`, `no_show`, or `late_cancelled_chargeable`.

## 3. Data Model Changes

### Existing collections to change

`session_credits`

Convert from unit-based coach-locked credits to value-based credit lots.
Existing unit fields can remain temporarily for migration but must stop driving
new booking logic.

Required fields:

- `owner_profile_id` string, buyer or guardian profile.
- `owner_account_id` string, Appwrite account id for read grants.
- `athlete_id` string, optional child/self athlete this credit is usable for.
- `currency` string, default `usd`.
- `original_amount_cents` int.
- `available_amount_cents` int, materialized cache of unreserved value.
- `reserved_amount_cents` int, materialized cache of active holds.
- `refunded_amount_cents` int.
- `earned_amount_cents` int.
- `originating_coach_id` string, optional attribution only; not a spending lock.
- `originating_organization_id` string, optional attribution only.
- `source_payment_record_id` string.
- `status` string or enum:
  `active`, `frozen`, `depleted`, `refunded`, `disputed`, `voided`.
- `migration_source_credit_id` string, for migrated legacy rows.

Deprecated for new logic:

- `total_credits`
- `used_credits`
- `per_session_base_price`
- `per_session_base_price_cents`
- booking-time enforcement of `coach_id`

`sessions`

Add immutable server-created price and payout snapshots:

- `credit_reservation_id` string.
- `offering_id` string, the server-validated pricing package/offering.
- `price_snapshot_cents` int, gross client value reserved for the session.
- `currency` string, default `usd`.
- `platform_share_bps` int.
- `coach_share_bps` int.
- `org_share_bps` int.
- `organization_id` string.
- `payout_rule_id` string.
- `coach_connected_account_id_snapshot` string.
- `org_connected_account_id_snapshot` string.
- `payment_state` string:
  `reserved`, `released`, `restored`, `partially_refunded`, `refunded`,
  `disputed`, `admin_adjusted`.
- `payout_state` string:
  `not_payable`, `payable`, `processing`, `paid`, `failed`, `held`,
  `reversed`, `offset`.
- `outcome_finalized_at` datetime.

Once a session is created, these snapshot fields are immutable except through an
admin exception that writes compensating ledger entries.

`stripe_payment_records`

Use records for platform charges/top-ups/refunds, not payee transfers:

- `purpose` string: `prepaid_credit`, `top_up`, `admin_adjustment`.
- `credit_lot_id` string.
- `athlete_id` string.
- `merchant_of_record` string, always `levelcoach_platform`.
- `available_for_refund_cents` int.
- `disputed_amount_cents` int.
- `state` string values include:
  `created`, `paid`, `partially_refunded`, `refunded`, `disputed`,
  `dispute_won`, `dispute_lost`, `failed`, `cancelled`.

`stripe_transfer_records`

Create these only when earned payouts are released. Add:

- `session_id` string.
- `credit_reservation_id` string.
- `payout_obligation_id` string.
- `owner_type` enum: `coach`, `org`.
- `owner_id` string.
- `amount_cents` int.
- `currency` string.
- `transfer_group` string.
- `idempotency_key` string, unique.

`payment_ledger_entries`

Expand ledger types:

- `checkout_charge`
- `credit_liability_created`
- `credit_refunded`
- `credit_dispute_hold`
- `credit_dispute_release`
- `credit_dispute_loss`
- `session_revenue_recognized`
- `platform_fee_earned`
- `coach_payout_earned`
- `org_payout_earned`
- `stripe_transfer_created`
- `stripe_transfer_failed`
- `stripe_transfer_reversed`
- `legacy_advance_recovered`
- `admin_adjustment`

Add:

- `session_id` string.
- `credit_lot_id` string.
- `credit_reservation_id` string.
- `idempotency_key` string, unique.

### New collections

`credit_ledger_entries`

Append-only operational credit ledger. This is the source of truth for client
credit value.

Fields:

- `credit_lot_id` string, required.
- `owner_profile_id` string.
- `athlete_id` string.
- `session_id` string.
- `payment_record_id` string.
- `reservation_id` string.
- `type` enum:
  `checkout_grant`, `top_up_grant`, `reservation_hold`,
  `reservation_release`, `reservation_capture`, `refund_debit`,
  `dispute_freeze`, `dispute_release`, `dispute_loss`, `admin_grant`,
  `admin_debit`, `migration_import`, `legacy_advance_recovery`.
- `available_delta_cents` int, required.
- `reserved_delta_cents` int, required.
- `currency` string, default `usd`.
- `idempotency_key` string, required and unique.
- `metadata` string JSON.

`credit_reservations`

Current-state reservation documents for bookings. The reservation state may be
updated, but each money movement is still recorded in `credit_ledger_entries`.

Fields:

- `credit_lot_id` string, required.
- `session_id` string.
- `owner_profile_id` string.
- `athlete_id` string.
- `coach_id` string.
- `organization_id` string.
- `offering_id` string.
- `reserved_amount_cents` int, required.
- `captured_amount_cents` int.
- `released_amount_cents` int.
- `currency` string, default `usd`.
- `status` enum:
  `reserved`, `captured`, `released`, `partially_refunded`, `refunded`,
  `disputed`, `voided`.
- `idempotency_key` string, required and unique.

`payout_obligations`

Payable legs generated from earned session outcomes.

Fields:

- `session_id` string, required.
- `credit_reservation_id` string.
- `owner_type` enum: `coach`, `org`.
- `owner_id` string.
- `stripe_connected_account_id` string.
- `gross_session_amount_cents` int.
- `share_bps` int.
- `amount_cents` int.
- `currency` string, default `usd`.
- `status` enum:
  `pending`, `held`, `processing`, `paid`, `failed`, `reversed`, `offset`,
  `voided`.
- `stripe_transfer_record_id` string.
- `transfer_id` string.
- `idempotency_key` string, required and unique.
- `metadata` string JSON.

## 4. Checkout Flow

1. Client selects a prepaid credit purchase or top-up.
2. `createStripeCheckout` authenticates the caller from
   `x-appwrite-user-id`, loads the profile server-side, checks bans, verifies
   legal packet status, and validates guardian/athlete authority where needed.
3. Server reads the package/offering from `pricing_packages` or the replacement
   offerings collection. The client may submit ids, but never price.
4. Server computes `amount_cents` from trusted data only.
5. Server creates Stripe Checkout as a platform payment:
   - `mode: payment`
   - `payment_method_types: ['card']`
   - no `transfer_data`
   - no `application_fee_amount`
   - no connected-account ids
   - metadata limited to buyer, athlete, package, and idempotency references
6. Server creates or updates a `stripe_payment_records` row with
   `purpose = prepaid_credit` or `top_up`, `state = created`.
7. `stripeWebhook` handles `checkout.session.completed` idempotently:
   - updates the payment record to `paid`
   - creates a value-based `session_credits` lot
   - writes `credit_ledger_entries.checkout_grant`
   - writes `payment_ledger_entries.checkout_charge`
   - writes `payment_ledger_entries.credit_liability_created`
   - creates no transfers and no payout ledger entries

After checkout, funds are in LevelCoach's Stripe platform balance. The client
has prepaid value. No coach/org has earned or received money.

## 5. Booking Reservation Flow

1. Client requests a booking with `coach_id`, `offering_id`, date/time,
   athlete, and selected credit lot or wallet.
2. `booking.book` validates the caller, guardian relationship, legal packet,
   coach active/published status, coach availability, scheduling rules,
   conflicts, and cancellation policy.
3. Server reads the published offering and computes the session price in cents.
   It must reject missing, inactive, unpublished, or mismatched offerings.
4. Server resolves the payout split from trusted data:
   - `payout_rules` when an active org-coach rule exists
   - org payout model defaults
   - coach/platform defaults
   - shares must sum to `10000`
5. Server validates payee readiness for every positive payout leg. A published
   coach/org should normally have a ready Stripe Connect account, but booking
   must still verify the current server state.
6. Server compares the client's available credit value with
   `price_snapshot_cents`.
7. If available credit is sufficient:
   - atomically moves `price_snapshot_cents` from available to reserved
   - writes `credit_ledger_entries.reservation_hold`
   - creates `credit_reservations.status = reserved`
   - creates the `sessions` row with immutable price/split/payee snapshots
8. If available credit is insufficient:
   - compute `top_up_amount_cents = price_snapshot_cents - available_cents`
   - create a top-up Checkout session for exactly that amount
   - do not create a confirmed session until the top-up webhook succeeds and
     the reservation can be completed
9. If the new coach is cheaper than the remaining credit:
   - reserve only the new coach's `price_snapshot_cents`
   - preserve the remaining balance as available credit
10. If a client books a different published coach from the original purchase:
   - ignore `originating_coach_id` for spend eligibility
   - use the new coach's current server-validated offering and payout split

Early client cancellation and coach cancellation restore the reservation:

- update `credit_reservations.status = released`
- move reserved cents back to available cents
- write `credit_ledger_entries.reservation_release`
- set `sessions.payment_state = restored`
- do not create payout obligations

## 6. Payout Release Flow

Eligible earning outcomes:

- `completed`
- `no_show`
- `late_cancelled_chargeable`

Non-earning outcomes:

- early client cancellation
- coach cancellation
- admin void
- booking expiration
- payment failure
- dispute hold before finalization

Flow:

1. Coach or admin marks the session outcome. The function checks authority and
   only allows eligible state transitions after the scheduled start time, except
   for policy-defined late cancellation.
2. The payout release handler loads the session and reservation, then replays no
   client-supplied money fields.
3. It idempotently captures the reservation:
   - `credit_reservations.status = captured`
   - `credit_ledger_entries.reservation_capture`
   - `sessions.payment_state = released`
4. It computes split amounts from the immutable snapshot:
   - `coach_payout_cents = floor(price_snapshot_cents * coach_share_bps / 10000)`
   - `org_payout_cents = floor(price_snapshot_cents * org_share_bps / 10000)`
   - `platform_fee_cents = price_snapshot_cents - coach_payout_cents - org_payout_cents`
5. It writes append-only accounting ledger entries:
   - `session_revenue_recognized`
   - `platform_fee_earned`
   - `coach_payout_earned`, if positive
   - `org_payout_earned`, if positive
6. It creates one `payout_obligations` row per positive coach/org leg.
7. A payout worker creates Stripe transfers from the LevelCoach platform balance
   to the connected accounts:
   - `stripe.transfers.create({ amount, currency, destination, transfer_group })`
   - deterministic Stripe idempotency key:
     `payout_${session_id}_${owner_type}_${owner_id}_${amount_cents}`
   - no client-supplied destination
8. The worker writes `stripe_transfer_records` and
   `payment_ledger_entries.stripe_transfer_created`.
9. If Stripe reports insufficient available balance or a temporary error, the
   obligation stays `pending` or `failed` and is retried. The session must not
   be paid twice.

## 7. Refund and Dispute Flow

### Refunds before a session is earned

Admin refunds may apply only to unused available credit unless an explicit
admin exception unwinds a reservation.

Flow:

1. Admin calls `refundStripePayment` with a payment record, amount, reason, and
   request id.
2. Server verifies admin labels through Appwrite Users API.
3. Server calculates refundable cents from available unused credit tied to the
   payment lot. The client does not choose the refundable balance.
4. Server creates a Stripe refund against the original platform charge.
5. Server writes:
   - `credit_ledger_entries.refund_debit`
   - `payment_ledger_entries.credit_refunded`
   - audit log
6. No transfer reversal is required because no coach/org transfer happened at
   checkout.

### Refunds after a session is earned

If an admin refunds an already earned session:

1. Write compensating credit/payment ledger entries.
2. Reverse the related Stripe transfer when possible.
3. If Stripe cannot reverse because the connected account lacks funds, create a
   negative payee balance/offset to recover from future payouts.
4. Never delete the original earned payout entries.

### Disputes

On `charge.dispute.created`:

- mark payment record `state = disputed`
- freeze the disputed unused credit value
- prevent new reservations against frozen value
- write `credit_dispute_hold`
- notify admins

On dispute won:

- release frozen credit
- write `credit_dispute_release`
- restore payment state based on refund status

On dispute lost:

- debit unused credit first
- for earned sessions, reverse related transfers when possible
- otherwise create payee offsets
- write `credit_dispute_loss` and payment ledger entries
- leave all historical entries intact

## 8. Admin Exception Flow

Admin-only functions may perform exceptions, but every exception requires:

- Appwrite Users API label check (`admin` or `superadmin`)
- reason text
- deterministic `request_id`
- audit log entry
- append-only credit/payment ledger entries
- no direct mutation that hides the original event

Allowed exceptions:

- grant promotional credit
- debit expired or invalid credit
- restore a late-cancel credit as goodwill
- force a chargeable late cancellation under policy
- hold or release a payout obligation
- retry a failed payout
- reverse a payout and create an offset
- refund an earned session
- migrate or repair legacy credit lots

Admin exceptions must not bypass server-side price, split, or payee validation.
When an exception changes who should be paid, create a new session/reservation
snapshot or a compensating payout obligation rather than editing the old one.

## 9. Migration Plan from Coach-Locked Credits

1. Announce a payment maintenance window and disable new Stripe Checkout while
   the cutover migration runs.
2. Deploy schema additions:
   `credit_ledger_entries`, `credit_reservations`, `payout_obligations`, new
   session snapshot fields, expanded ledger types, and unique idempotency
   indexes.
3. Deploy code that stops checkout-time transfers before re-enabling Checkout.
   `stripeWebhook` must create prepaid value only.
4. Snapshot legacy `session_credits`, `sessions`, `stripe_payment_records`, and
   `stripe_transfer_records`.
5. For each legacy credit row:
   - compute `remaining_units = total_credits - used_credits`
   - compute `legacy_unit_value_cents` from `per_session_base_price_cents`, or
     from `amount_cents / total_credits` using integer division
   - compute `remaining_value_cents = remaining_units * legacy_unit_value_cents`
   - create a value-based credit lot with `originating_coach_id = old coach_id`
     for attribution only
   - write `credit_ledger_entries.migration_import`
6. For completed/no-show sessions already covered by legacy checkout transfers:
   - mark them `payout_state = paid` or `legacy_paid`
   - write historical payment ledger entries only if missing
   - do not pay them again
7. For unearned legacy transfers already sent at checkout:
   - calculate the unearned portion tied to remaining credit value
   - attempt proportional Stripe transfer reversals where possible
   - write `legacy_advance_recovered`
   - if reversal is impossible, create a payee offset balance and recover from
     future payouts before sending more money to that payee
8. For pending future sessions:
   - create `credit_reservations` and immutable session price/split snapshots
   - if their original payout was already advanced and not recovered, mark the
     future payout as `advance_applied` so the coach/org is not paid twice
9. Update legal templates prospectively:
   - credits are value-based prepaid platform credit, not coach-locked
   - coach/org payout is earned only on completed/no-show/chargeable late cancel
   - refunds reduce unused value first
10. Re-enable Checkout only after reconciliation reports show:
   - no new checkout-time transfers
   - migrated available/reserved/earned totals balance to legacy source records
   - all legacy advances are reversed, offset, or explicitly accepted as
     platform-funded exceptions

## 10. Verification Checklist

### Static/code checks

- `createStripeCheckout` contains no `transfer_data`,
  `application_fee_amount`, connected-account destination, or payout metadata
  used for checkout transfer.
- `stripeWebhook.checkout.session.completed` creates credit value and ledger
  entries but does not call `stripe.transfers.create`.
- `booking.book` does not reject usable credit solely because
  `originating_coach_id` differs from the requested coach.
- `booking.book` stores immutable `price_snapshot_cents` and split bps from
  server-read data.
- All money fields added by this migration end in `_cents` and are integers.
- All split fields end in `_bps`, are integers, and sum to `10000`.
- Ledger collections have no client update/delete permissions.
- Every ledger writer checks a unique idempotency key before appending.

### Behavioral tests

- Parent buys `$100.00` of credit; Stripe receives a platform charge; no
  `stripe_transfer_records` are created.
- Parent books Coach A at `$75.00`; `$75.00` becomes reserved and `$25.00`
  remains available.
- Parent books Coach B at `$60.00` using a `$75.00` balance; `$15.00` remains.
- Parent tries Coach C at `$90.00` with `$75.00` available; system requires a
  `$15.00` top-up before confirmation.
- Early client cancellation releases the reservation back to available credit.
- Coach cancellation releases the reservation back to available credit.
- Late client cancellation under policy captures the reservation and creates
  payout obligations.
- Completed session captures the reservation exactly once and pays coach/org
  exactly once.
- No-show captures the reservation exactly once and pays coach/org exactly once.
- Replaying the same webhook, booking request, completion request, refund
  request, or payout worker job is idempotent.
- Refund of unused credit debits client value and creates no transfer reversal.
- Refund of earned value creates a transfer reversal or payee offset.
- Dispute freezes unused credit and prevents new reservations until resolved.

### Reconciliation checks

- For every credit lot:
  `original_amount_cents + top_up_grants - refunds - earned - dispute_losses`
  equals current available plus reserved value.
- For every captured session:
  `platform_fee_cents + coach_payout_cents + org_payout_cents`
  equals `price_snapshot_cents`.
- For every payout obligation marked `paid`, exactly one Stripe transfer record
  exists with the same amount, owner, session, and idempotency key.
- Sum of client available/reserved credit equals LevelCoach's outstanding
  prepaid credit liability, after excluding refunded, disputed-lost, and earned
  amounts.
- Legacy migrated credits have a documented handling state for any checkout-time
  transfer advance: `reversed`, `offset`, `advance_applied`, or
  `platform_exception`.
