import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { coachRepo, organizationCoachRepo, organizationRepo, payoutRuleRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DEFAULT_PLATFORM_FEE_BPS, bpsLabel, bpsToPercent, percentToBps } from '@/features/org/money';
import { Mail, Percent, UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_TONES = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  invited: 'bg-accent/10 text-accent border-accent/20',
  suspended: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  removed: 'bg-destructive/10 text-destructive border-destructive/20',
};

// Display-only labels for roster link statuses — stored values never change.
const STATUS_LABELS = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
  removed: 'Removed',
};

function coachName(coach) {
  if (!coach) return 'Coach';
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || coach.email || 'Coach';
}

// Payout split editor — percentages in the UI, basis points on the wire.
// The platform share is fixed server-side (env PLATFORM_FEE_BPS, default 15%);
// when a rule already exists we trust its stored platform_share_bps.
function PayoutDialog({ link, coach, rule, organizationId, onClose, onSaved }) {
  const platformBps = Number.isInteger(rule?.platform_share_bps)
    ? rule.platform_share_bps
    : DEFAULT_PLATFORM_FEE_BPS;
  const defaultCoach = Number.isInteger(rule?.coach_share_bps) ? rule.coach_share_bps : 6000;
  const defaultOrg = Number.isInteger(rule?.org_share_bps) ? rule.org_share_bps : 10000 - platformBps - 6000;
  const [coachPct, setCoachPct] = useState(String(bpsToPercent(defaultCoach)));
  const [orgPct, setOrgPct] = useState(String(bpsToPercent(Math.max(0, defaultOrg))));
  const [saving, setSaving] = useState(false);

  const coachBps = percentToBps(coachPct);
  const orgBps = percentToBps(orgPct);
  const total = (coachBps ?? 0) + (orgBps ?? 0) + platformBps;
  const valid = coachBps !== null && orgBps !== null && total === 10000;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await organizationRepo.setPayoutRule({
        organization_id: organizationId,
        coach_id: link.coach_id,
        coach_share_bps: coachBps,
        org_share_bps: orgBps,
      });
      toast.success('Payout split saved');
      onSaved();
    } catch (err) {
      toast.error(err?.message || 'Could not save the payout split.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Payout split — {coachName(coach)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Coach, organization, and platform shares must total 100%. Splits apply to new payments only.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="payout-coach-pct" className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Coach %</Label>
            <Input
              id="payout-coach-pct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={coachPct}
              onChange={(event) => setCoachPct(event.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label htmlFor="payout-org-pct" className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Organization %</Label>
            <Input
              id="payout-org-pct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={orgPct}
              onChange={(event) => setOrgPct(event.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Platform %</Label>
            <div className="mt-1 flex h-9 items-center rounded-md border border-border bg-secondary/60 px-3 text-sm text-muted-foreground" aria-label={`Platform share ${bpsLabel(platformBps)}`}>
              {bpsLabel(platformBps)} (fixed)
            </div>
          </div>
        </div>
        <p className={`text-sm ${valid ? 'text-green-500' : 'text-destructive'}`} role="status">
          Total: {bpsLabel(total)} {valid ? '' : '— shares must sum to exactly 100%.'}
        </p>
        <Button
          onClick={submit}
          disabled={!valid || saving}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
        >
          {saving ? 'Saving...' : 'Save split'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function OrgRosterTab({ organizationId, isOrgAdmin }) {
  const [links, setLinks] = useState([]);
  const [coachesById, setCoachesById] = useState({});
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [payoutTarget, setPayoutTarget] = useState(null);
  const [actingId, setActingId] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [linkRows, ruleRows] = await Promise.all([
        organizationCoachRepo.filter({ organization_id: organizationId }, '-created_date'),
        payoutRuleRepo.listByOrganization(organizationId).catch(() => []),
      ]);
      setLinks(linkRows);
      setRules(ruleRows);
      const coachIds = [...new Set(linkRows.map((row) => row.coach_id).filter(Boolean))];
      if (coachIds.length > 0) {
        const coaches = await coachRepo.filter({ id: coachIds }).catch(() => []);
        const map = {};
        coaches.forEach((coach) => { map[coach.id] = coach; });
        setCoachesById(map);
      } else {
        setCoachesById({});
      }
    } catch (err) {
      toast.error(err?.message || 'Could not load the coach roster.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const ruleByCoach = useMemo(() => {
    const map = {};
    rules.forEach((rule) => { map[rule.coach_id] = rule; });
    return map;
  }, [rules]);

  const invite = async (event) => {
    event.preventDefault();
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      await organizationRepo.inviteCoach({ organization_id: organizationId, email: inviteEmail.trim() });
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not invite this coach.');
    } finally {
      setInviting(false);
    }
  };

  const setStatus = async (link, action) => {
    const coach = coachesById[link.coach_id];
    const verbs = { suspendCoach: 'Suspend', removeCoach: 'Remove' };
    const ok = await confirm({
      title: `${verbs[action]} ${coachName(coach)}?`,
      description: action === 'removeCoach'
        ? 'They are removed from your roster and stop receiving organization-routed payments.'
        : 'They stay on the roster but are paused for new organization activity.',
      confirmLabel: verbs[action],
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!ok) return;
    setActingId(link.id);
    try {
      await organizationRepo[action]({ organization_id: organizationId, org_coach_id: link.id });
      toast.success(`Coach ${action === 'removeCoach' ? 'removed' : 'suspended'}`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not update the coach.');
    } finally {
      setActingId('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading roster">
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
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Invite a coach</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The coach must already have a LevelCoach coach account. They accept the invitation from their coach portal.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="invite-coach-email" className="sr-only">Coach email</Label>
              <Input
                id="invite-coach-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="coach@example.com"
                className="bg-secondary border-border"
              />
            </div>
            <Button type="submit" disabled={inviting} className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
              <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
              {inviting ? 'Sending...' : 'Send invite'}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Coach roster</h2>
          <p className="mt-1 text-xs text-muted-foreground">{links.length} coach link{links.length === 1 ? '' : 's'}</p>
        </div>
        {links.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-foreground">No coaches on the roster yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Invite your first coach by email above to start building your roster.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {links.map((link) => {
              const coach = coachesById[link.coach_id];
              const rule = ruleByCoach[link.coach_id];
              return (
                <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{coachName(coach)}</p>
                      <Badge className={`border text-xs ${STATUS_TONES[link.status] || 'bg-secondary text-muted-foreground border-border'}`}>
                        {STATUS_LABELS[link.status] || link.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {coach?.email || `coach ${String(link.coach_id).slice(0, 8)}`}
                      {rule
                        ? ` · split: coach ${bpsLabel(rule.coach_share_bps)} / org ${bpsLabel(rule.org_share_bps)} / platform ${bpsLabel(rule.platform_share_bps)}`
                        : ' · no payout split set'}
                    </p>
                  </div>
                  {isOrgAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPayoutTarget({ link, coach, rule })}
                        className="h-8 text-xs"
                      >
                        <Percent className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Payout split
                      </Button>
                      {link.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actingId === link.id}
                          onClick={() => setStatus(link, 'suspendCoach')}
                          className="h-8 text-xs text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-500"
                        >
                          Suspend
                        </Button>
                      )}
                      {['active', 'invited', 'suspended'].includes(link.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actingId === link.id}
                          onClick={() => setStatus(link, 'removeCoach')}
                          className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <UserMinus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Remove
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!isOrgAdmin && (
        <p className="text-xs text-muted-foreground">
          <UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          Inviting, suspending, and payout changes require the owner or admin role.
        </p>
      )}

      {payoutTarget && (
        <PayoutDialog
          link={payoutTarget.link}
          coach={payoutTarget.coach}
          rule={payoutTarget.rule}
          organizationId={organizationId}
          onClose={() => setPayoutTarget(null)}
          onSaved={() => { setPayoutTarget(null); void load(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
