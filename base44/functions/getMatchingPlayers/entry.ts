import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const allUsers = await base44.asServiceRole.entities.User.filter({ matching_opted_in: true });

  const calcAge = (dob) => {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  };

  const eligible = allUsers
    .filter(u => u.email !== user.email)
    .map(u => ({
      email: u.email,
      // Prefer explicit first_name; fall back to splitting legacy full_name for older accounts
      first_name: u.first_name || u.full_name?.split(' ')[0] || 'Player',
      player_age: calcAge(u.dob),
      matching_age_group: u.matching_age_group || null,
    }));

  return Response.json({ players: eligible });
});