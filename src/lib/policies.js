// User-facing policy copy with a single source of truth. The wording must
// match what the server enforces (functions/booking cancelAction and
// rescheduleAction) — if the policy ever changes server-side, this is the
// only string to update.
export const CANCEL_POLICY_COPY =
  'Cancel or reschedule 24 or more hours before a session starts. Early cancellations restore your credit automatically. '
  + 'Reschedules inside 24 hours must be handled by the coach or support. '
  + 'Cancellations inside 24 hours forfeit the credit, unless the coach cancels.';
