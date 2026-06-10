import React, { useCallback, useEffect, useState } from 'react';
import { organizationMemberRepo, organizationRepo, profileRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const MEMBER_ROLES = [
  { value: 'org_owner', label: 'Owner' },
  { value: 'org_admin', label: 'Admin' },
  { value: 'org_billing', label: 'Billing' },
  { value: 'org_coach_manager', label: 'Coach manager' },
  { value: 'org_viewer', label: 'Viewer' },
];

const STATUS_TONES = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  invited: 'bg-accent/10 text-accent border-accent/20',
  suspended: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  removed: 'bg-destructive/10 text-destructive border-destructive/20',
};

function roleLabel(role) {
  return MEMBER_ROLES.find((item) => item.value === role)?.label || role;
}

export default function OrgMembersTab({ organizationId, isOrgAdmin, isOwner, currentProfileId }) {
  const [members, setMembers] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('org_viewer');
  const [inviting, setInviting] = useState(false);
  const [actingId, setActingId] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await organizationMemberRepo.filter({ organization_id: organizationId }, '-created_date');
      const visible = rows.filter((row) => row.status !== 'removed');
      setMembers(visible);
      // Profiles are per-document scoped: org admins can usually only read
      // their own row, so resolve names best-effort and fall back to ids.
      const lookups = await Promise.allSettled(
        [...new Set(visible.map((row) => row.profile_id).filter(Boolean))]
          .map(async (profileId) => [profileId, await profileRepo.get(profileId)]),
      );
      const map = {};
      lookups.forEach((result) => {
        if (result.status === 'fulfilled') map[result.value[0]] = result.value[1];
      });
      setProfilesById(map);
    } catch (err) {
      toast.error(err?.message || 'Could not load organization members.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const memberName = (member) => {
    const profile = profilesById[member.profile_id];
    if (profile) {
      return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
        || profile.email
        || `Member ${String(member.profile_id).slice(0, 8)}`;
    }
    if (member.profile_id === currentProfileId) return 'You';
    return `Member ${String(member.profile_id).slice(0, 8)}`;
  };

  const invite = async (event) => {
    event.preventDefault();
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      await organizationRepo.inviteMember({
        organization_id: organizationId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      setInviteRole('org_viewer');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not invite this member.');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member, role) => {
    if (role === member.role) return;
    setActingId(member.id);
    try {
      await organizationRepo.setMemberRole({
        organization_id: organizationId,
        member_id: member.id,
        role,
      });
      toast.success('Member role updated');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not change the member role.');
    } finally {
      setActingId('');
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${memberName(member)}?`,
      description: 'They immediately lose access to this organization workspace.',
      confirmLabel: 'Remove member',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!ok) return;
    setActingId(member.id);
    try {
      await organizationRepo.removeMember({ organization_id: organizationId, member_id: member.id });
      toast.success('Member removed');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not remove this member.');
    } finally {
      setActingId('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading members">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-2/3" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isOrgAdmin && (
        <form onSubmit={invite} className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Invite a team member</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The person needs an existing LevelCoach account with this email. Owner and admin roles can only be granted by the organization owner.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_190px_auto]">
            <div>
              <Label htmlFor="invite-member-email" className="sr-only">Member email</Label>
              <Input
                id="invite-member-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <Label htmlFor="invite-member-role" className="sr-only">Member role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-member-role" className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMBER_ROLES
                    .filter((role) => isOwner || !['org_owner', 'org_admin'].includes(role.value))
                    .map((role) => (
                      <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting} className="bg-accent text-accent-foreground hover:bg-accent/90 font-display tracking-wider uppercase">
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              {inviting ? 'Sending...' : 'Invite'}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Members</h2>
          <p className="mt-1 text-xs text-muted-foreground">{members.length} member{members.length === 1 ? '' : 's'}</p>
        </div>
        {members.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-foreground">No members visible</p>
            <p className="mt-1 text-sm text-muted-foreground">Invite teammates above to share access to this workspace.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{memberName(member)}</p>
                    <Badge className={`border text-xs ${STATUS_TONES[member.status] || 'bg-secondary text-muted-foreground border-border'}`}>
                      {member.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{roleLabel(member.role)}</p>
                </div>
                {isOwner && member.profile_id !== currentProfileId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(role) => changeRole(member, role)}
                      disabled={actingId === member.id}
                    >
                      <SelectTrigger className="h-8 w-40 bg-secondary border-border text-xs" aria-label={`Role for ${memberName(member)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBER_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === member.id}
                      onClick={() => remove(member)}
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <UserMinus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </Button>
                  </div>
                ) : (
                  member.profile_id === currentProfileId && (
                    <Badge variant="outline" className="text-xs">Your membership</Badge>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isOwner && isOrgAdmin && (
        <p className="text-xs text-muted-foreground">Role changes and removals are reserved for the organization owner.</p>
      )}
      {confirmDialog}
    </div>
  );
}
