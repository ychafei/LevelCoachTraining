// User-facing policy copy with a single source of truth. The wording must
// match what the server enforces (functions/booking cancelAction: credits
// restore when the caller is the coach OR hoursUntil >= 24) — if the policy
// ever changes server-side, this is the only string to update.
export const CANCEL_POLICY_COPY =
  'Cancel 24 or more hours before a session starts and your credit is restored automatically. '
  + 'Cancellations inside 24 hours forfeit the credit, unless the coach cancels.';
