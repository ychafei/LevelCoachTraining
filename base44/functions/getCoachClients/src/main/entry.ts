import { Client, Databases, Query } from 'node-appwrite';

// Auth-required — returns the authenticated coach's aggregated client roster.
// Response shape preserved from the Base44 version so the frontend doesn't change.

function calcAgeFromDob(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function etToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Unauthorized' }, 401);

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);

    const me = (await databases.listDocuments('lctraining', 'profiles', [
      Query.equal('account_id', userId), Query.limit(1),
    ])).documents[0];

    if (!me) return res.json({ error: 'Profile not found' }, 404);
    const isCoachOrAdmin = me.role === 'coach' || me.role === 'admin' || me.role === 'super_admin';
    if (!isCoachOrAdmin) return res.json({ error: 'Forbidden' }, 403);
    if (!me.coach_id) return res.json({ clients: [] });

    // All sessions for this coach (most-recent first).
    const sessionsResult = await databases.listDocuments('lctraining', 'sessions', [
      Query.equal('coach_id', me.coach_id),
      Query.orderDesc('date'),
      Query.limit(2000),
    ]);
    const sessions = sessionsResult.documents;

    // Pull all relevant profiles + credits in two bulk queries to avoid N+1.
    const clientEmails = [...new Set(sessions.map((s) => s.client_email).filter(Boolean))];
    let profileByEmail = {};
    let creditsByEmail = {};
    if (clientEmails.length > 0) {
      const profilesResult = await databases.listDocuments('lctraining', 'profiles', [
        Query.contains('email', clientEmails),
        Query.limit(500),
      ]).catch(() => ({ documents: [] }));
      profileByEmail = Object.fromEntries(profilesResult.documents.map((p) => [p.email, p]));

      const creditsResult = await databases.listDocuments('lctraining', 'session_credits', [
        Query.contains('client_email', clientEmails),
        Query.limit(2000),
      ]).catch(() => ({ documents: [] }));
      for (const c of creditsResult.documents) {
        const remaining = Math.max(0, (c.total_credits || 0) - (c.used_credits || 0));
        creditsByEmail[c.client_email] = (creditsByEmail[c.client_email] || 0) + remaining;
      }
    }

    const today = etToday();

    const byEmail = new Map();
    for (const s of sessions) {
      if (!s.client_email) continue;
      const arr = byEmail.get(s.client_email) || [];
      arr.push(s);
      byEmail.set(s.client_email, arr);
    }

    const clients = [];
    for (const [email, list] of byEmail.entries()) {
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

      const profile = profileByEmail[email];
      let age = latest?.client_age ?? null;
      let parent_info;
      let countyFromUser = null;
      if (profile) {
        const derivedAge = calcAgeFromDob(profile.dob);
        if (derivedAge != null) age = derivedAge;
        countyFromUser = profile.county || null;
        if (derivedAge != null && derivedAge < 18) {
          parent_info = {
            first_name: profile.parent_first_name || null,
            last_name: profile.parent_last_name || null,
            email: profile.parent_email || null,
            phone: profile.parent_phone || null,
          };
        }
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
        next_session_id: firstUpcoming?.$id || null,
        notes_session_count: withNotes.length,
        last_goals: latestGoals?.session_goals || null,
        credits_remaining: creditsByEmail[email] || 0,
        parent_info,
      });
    }

    clients.sort((a, b) => {
      const aKey = a.next_session_date || a.last_session_date || '';
      const bKey = b.next_session_date || b.last_session_date || '';
      return bKey.localeCompare(aKey);
    });

    return res.json({ clients });
  } catch (err) {
    error(`getCoachClients: ${err?.message || err}`);
    return res.json({ error: err?.message || String(err) }, 500);
  }
};
