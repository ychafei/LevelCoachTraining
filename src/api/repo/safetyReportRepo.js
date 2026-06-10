import { makeRepo } from '@/api/repoFactory';
import { callFn } from '@/lib/rpc';

// Safety reports are filed through messaging.report (the server verifies the
// reporter can actually see what they are reporting). Reads stay direct:
// admins (label) list everything; reporters can read their own rows via the
// per-document grant.
const base = makeRepo('safety_reports');

export const safetyReportRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // payload: { conversation_id?, message_id?, category, detail? }
  // category: harassment | inappropriate_content | spam | safety_concern |
  //           minor_safety | other. Returns { report_id }.
  report: (payload) => callFn('messaging', { action: 'report', ...payload }),
};
