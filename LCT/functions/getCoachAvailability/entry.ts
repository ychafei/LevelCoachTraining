import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { coach_id } = body;
    const base44 = createClientFromRequest(req);

    const [blocks, sessions] = await Promise.all([
      base44.asServiceRole.entities.CoachBlock.filter({ coach_id, is_active: true }),
      base44.asServiceRole.entities.Session.filter({ coach_id }),
    ]);

    const activeSessions = sessions.filter(s => s.status === 'pending' || s.status === 'confirmed');

    return Response.json({ blocks, sessions: activeSessions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});