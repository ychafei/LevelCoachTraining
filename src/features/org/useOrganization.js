import { useCallback, useEffect, useState } from 'react';
import { organizationRepo, organizationMemberRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';

// Loads the caller's organization + their membership role. Org id resolution:
// profile.primary_organization_id first, then the first active membership row
// hydrated onto the user by auth.js.
export function useOrganization() {
  const { user } = useAuth();
  const orgId = user?.primary_organization_id
    || user?.organization_memberships?.[0]?.organization_id
    || '';

  const [organization, setOrganization] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(!!orgId);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!orgId) {
      setOrganization(null);
      setMembership(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const org = await organizationRepo.get(orgId);
      setOrganization(org);
    } catch (err) {
      setOrganization(null);
      setError(err?.message || 'Could not load the organization.');
    }
    try {
      const fromUser = (user?.organization_memberships || [])
        .find((row) => row.organization_id === orgId);
      if (fromUser) {
        setMembership(fromUser);
      } else if (user?.id) {
        const rows = await organizationMemberRepo.filter({
          organization_id: orgId,
          profile_id: user.id,
          status: 'active',
        });
        setMembership(rows[0] || null);
      }
    } catch {
      setMembership(null);
    }
    setLoading(false);
    // Memberships hydrated on `user` are intentionally read fresh each run
    // without being a dependency — orgId/user.id changing is what matters.
  }, [orgId, user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const role = membership?.role || '';
  return {
    orgId,
    organization,
    setOrganization,
    membership,
    role,
    isOwner: role === 'org_owner',
    isOrgAdmin: role === 'org_owner' || role === 'org_admin',
    loading,
    error,
    refresh,
  };
}
