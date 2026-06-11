import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { organizationRepo } from '@/api/repo';
import { cn } from '@/lib/utils';

// Pending organization invites for the signed-in coach. Lists both coach-roster
// invites (`organization_coaches`, keyed by coach_id) and any org-team/member
// invites (`organization_members`, keyed by profile_id) addressed to this
// account, and lets the coach accept them — the step that turns an 'invited'
// link into 'active' and unlocks org-package checkout, roster activation, org
// affiliation in public listings and org payout routing.
//
// Both row types are readable by the invited coach via per-document grants
// (orgAdmin.inviteCoach / inviteMember grant Permission.read to the invited
// account), so the listing methods are direct permission-scoped reads.
export default function PendingOrgInvites({ coachId, profileId, onChange }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState('');

  const load = useCallback(async () => {
    if (!coachId && !profileId) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [roster, members] = await Promise.all([
        coachId
          ? organizationRepo.listPendingInvitesForCoach({ coachId }).catch(() => [])
          : Promise.resolve([]),
        profileId
          ? organizationRepo.listPendingMemberInvites({ profileId }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const combined = [
        ...(roster || []).map((r) => ({
          key: `coach:${r.id}`,
          kind: 'coach',
          id: r.id,
          organization_id: r.organization_id,
          organization_name: r.organization_name,
          label: `${r.organization_name} invited you to join their roster`,
          role: null,
        })),
        ...(members || []).map((r) => ({
          key: `member:${r.id}`,
          kind: 'member',
          id: r.id,
          organization_id: r.organization_id,
          organization_name: r.organization_name,
          label: `${r.organization_name} invited you to join their team`,
          role: r.role,
        })),
      ];
      setInvites(combined);
    } finally {
      setLoading(false);
    }
  }, [coachId, profileId]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (invite) => {
    setAccepting(invite.key);
    try {
      if (invite.kind === 'coach') {
        await organizationRepo.acceptInvite({ org_coach_id: invite.id });
      } else {
        await organizationRepo.acceptMemberInvite({ org_member_id: invite.id });
      }
      toast.success(`You joined ${invite.organization_name}.`);
      setInvites((prev) => prev.filter((i) => i.key !== invite.key));
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err?.message || 'Could not accept this invitation.');
    } finally {
      setAccepting('');
    }
  };

  // Render nothing until we know there's at least one pending invite — keep the
  // dashboard clean for coaches with no invites and avoid layout flash.
  if (loading || invites.length === 0) return null;

  return (
    <section
      aria-label="Pending organization invitations"
      className="rounded-lg border border-accent/40 bg-accent/5 p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-accent" aria-hidden="true" />
        <h2 className="font-display text-base font-bold tracking-wider uppercase text-foreground">
          Organization {invites.length === 1 ? 'Invitation' : 'Invitations'}
        </h2>
      </div>
      <ul className="space-y-3">
        {invites.map((invite) => {
          const isAccepting = accepting === invite.key;
          return (
            <li
              key={invite.key}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{invite.label}.</p>
                {invite.role && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Role: <span className="font-medium text-foreground">{invite.role.replace(/^org_/, '').replace(/_/g, ' ')}</span>
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Accepting affiliates you with this organization.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => accept(invite)}
                  disabled={isAccepting || !!accepting}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground',
                    'hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {isAccepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isAccepting ? 'Accepting…' : 'Accept'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
