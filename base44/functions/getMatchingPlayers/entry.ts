import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const allUsers = await base44.asServiceRole.entities.User.filter({ matching_opted_in: true });
  const eligible = allUsers
    .filter(u => u.email !== user.email)
    .map(u => ({
      email: u.email,
      first_name: u.full_name?.split(' ')[0] || 'Player',
      age_min: u.matching_age_min,
      age_max: u.matching_age_max,
    }));

  return Response.json({ players: eligible });
});