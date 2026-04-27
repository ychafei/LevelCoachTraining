import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    // Use service role so this works for unauthenticated (public) users too
    const base44 = createClientFromRequest(req);
    const coaches = await base44.asServiceRole.entities.Coach.filter({ is_active: true });
    return Response.json({ coaches });
  } catch (error) {
    console.error('[ERROR]', error.message);
    // Return empty coaches rather than erroring — page should still load
    return Response.json({ coaches: [] });
  }
});