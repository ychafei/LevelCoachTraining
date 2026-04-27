import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// getCoachClients
// ---------------------------------------------------------------------------
// Returns an aggregated client roster for the currently authenticated coach.
// Centralises the "coach only sees their own clients" rule and avoids
// exposing the full User/Session/SessionCredit tables to the browser.
//
// Response shape (success):
//   {
//     clients: Array<{
//       client_email, client_name, age, county,
//       total_sessions, completed_sessions, upcoming_sessions, cancelled_sessions,
//       last_session_date, last_session_status,
//       next_session_date, next_session_time, next_session_id,
//       notes_session_count,
//       last_goals,
//       credits_remaining,
//       parent_info?: { first_name, last_name, email, phone }
//     }>
//   }
//
// Error: { error: string, diagnostics?: object }

function calcAgeFromDob(dobStr?: string | null): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function etToday(): string {
  // YYYY-MM-DD in America/Detroit, used for comparing against Session.date strings.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Must be a coach or admin, and have a coach_id to get meaningful results.
    const isCoachOrAdmin = me.role === 'coach' || me.role === 'admin';
    if (!isCoachOrAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!me.coach_id) {
      return Response.json({ clients: [] });
    }

    // All sessions for this coach. Reverse-chron by date.
    const sessions = await base44.entities.Session.filter({ coach_id: me.coach_id }, '-date');

    const today = etToday();

    // Group sessions by client_email
    const byEmail = new Map<string, any[]>();
    for (const s of sessions) {
      if (!s.client_email) continue;
      const arr = byEmail.get(s.client_email) || [];
      arr.push(s);
      byEmail.set(s.client_email, arr);
    }

    const clients = [];
    for (const [email, list] of byEmail.entries()) {
      // Sort each client's sessions in reverse-chron for consistency
      list.sort((a, b) => `${b.date} ${b.start_time || '00:00'}`.localeCompare(`${a.date} ${a.start_time || '00:00'}`));

      const completed = list.filter((s) => s.status === 'completed');
      const upcoming = list
        .filter((s) => (s.status === 'pending' || s.status === 'confirmed') && s.date >= today)
        .sort((a, b) => `${a.date} ${a.start_time || '00:00'}`.localeCompare(`${b.date} ${b.start_time || '00:00'}`));
      const cancelled = list.filter((s) => s.status === 'cancelled');
      const withNotes = list.filter((s) => typeof s.notes === 'string' && s.notes.trim().length > 0);

      const latest = list[0];
      const firstUpcoming = upcoming[0];
      const latestGoals = list.find((s) => typeof s.session_goals === 'string' && s.session_goals.trim().length > 0);

      // Look up user (for DOB / parent info). Small N — one query per client email.
      let age = latest?.client_age ?? null;
      let parent_info = undefined;
      let countyFromUser = null;
      try {
        const users = await base44.entities.User.filter({ email });
        const u = users?.[0];
        if (u) {
          const derivedAge = calcAgeFromDob(u.dob);
          if (derivedAge != null) age = derivedAge;
          countyFromUser = u.county || null;
          if (derivedAge != null && derivedAge < 18) {
            parent_info = {
              first_name: u.parent_first_name || null,
              last_name: u.parent_last_name || null,
              email: u.parent_email || null,
              phone: u.parent_phone || null,
            };
          }
        }
      } catch {
        // User lookup is nice-to-have; continue on failure.
      }

      // Sum remaining credits across all packages.
      let creditsRemaining = 0;
      try {
        const credits = await base44.entities.SessionCredit.filter({ client_email: email });
        for (const c of credits) {
          creditsRemaining += Math.max(0, (c.total_credits || 0) - (c.used_credits || 0));
        }
      } catch {
        // Credits lookup nice-to-have; continue on failure.
      }

      clients.push({
        client_email: email,
        client_name: latest?.client_name || email,
        age,
        county: latest?.county || countyFromUser || null,
        total_sessions: list.length,
        completed_sessions: completed.length,
        upcoming_sessions: upcoming.length,
        cancelled_sessions: cancelled.length,
        last_session_date: latest?.date || null,
        last_session_status: latest?.status || null,
        next_session_date: firstUpcoming?.date || null,
        next_session_time: firstUpcoming?.start_time || null,
        next_session_id: firstUpcoming?.id || null,
        notes_session_count: withNotes.length,
        last_goals: latestGoals?.session_goals || null,
        credits_remaining: creditsRemaining,
        parent_info,
      });
    }

    // Return roster sorted by most-recent activity first.
    clients.sort((a, b) => {
      const aKey = a.next_session_date || a.last_session_date || '';
      const bKey = b.next_session_date || b.last_session_date || '';
      return bKey.localeCompare(aKey);
    });

    return Response.json({ clients });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
});
