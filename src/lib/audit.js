// Audit logging is authoritative on the SERVER. The sensitive functions
// (adminOps / refund / grantAdminRole) write tamper-resistant audit_logs rows
// using a server-verified actor identity. A direct client write here would
// carry a client-computed actor_role/actor_email that is trivially spoofable
// and redundant with those rows, so logAdminAction is intentionally a no-op.
//
// The export signature is preserved so existing callers keep working — calling
// it is harmless; it simply does not write an audit row from the client.
export async function logAdminAction(_details) {
  // Intentionally no client-side write. See note above: server-side audit rows
  // (written by adminOps/refund/grantAdminRole) are the authoritative record.
}
