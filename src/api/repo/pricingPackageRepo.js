import { makeRepo } from '@/api/repoFactory';
import { databases, DB_ID, COL, Query, mapDoc } from '@/api/appwriteClient';

const base = makeRepo(COL.PricingPackage);

// Public marketplace pricing. Each package belongs to a coach (coach_id) and is
// self-contained (price_cents + duration_minutes). Packages with an empty
// coach_id are legacy/platform-default templates kept only as a fallback.
export const pricingPackageRepo = {
  ...base,

  // A coach's own active, bookable packages, ordered for display.
  listForCoach: async (coachId) => {
    if (!coachId) return [];
    const res = await databases.listDocuments(DB_ID, COL.PricingPackage, [
      Query.equal('coach_id', coachId),
      Query.equal('is_active', true),
      Query.limit(100),
    ]).catch(() => ({ documents: [] }));
    return res.documents
      .map(mapDoc)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || (a.price_cents || 0) - (b.price_cents || 0));
  },

  // An organization's own active, bookable packages, ordered for display.
  // Offered when booking that org's affiliated coaches (read defensively — the
  // organization_id attribute may not exist yet during rollout).
  listForOrg: async (orgId) => {
    if (!orgId) return [];
    const res = await databases.listDocuments(DB_ID, COL.PricingPackage, [
      Query.equal('organization_id', orgId),
      Query.equal('is_active', true),
      Query.limit(100),
    ]).catch(() => ({ documents: [] }));
    return res.documents
      .map(mapDoc)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || (a.price_cents || 0) - (b.price_cents || 0));
  },

  // Legacy/platform-default packages (no coach binding) — booking fallback only.
  listPlatformDefaults: async () => {
    const res = await databases.listDocuments(DB_ID, COL.PricingPackage, [
      Query.equal('is_visible', true),
      Query.limit(100),
    ]).catch(() => ({ documents: [] }));
    return res.documents
      .map(mapDoc)
      .filter((p) => !p.coach_id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  },
};
