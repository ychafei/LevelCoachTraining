import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachRepo, organizationCoachRepo, organizationMemberRepo, sessionRepo } from '@/api/repo';
import { Badge } from '@/components/ui/badge';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { isUpcomingSession, SectionCard, StatTile } from '@/features/athlete/portalShared';
import { connectAccountReady, fetchOrgConnectAccount } from '@/features/org/OrgComplianceTab';
import { orgStatusLabel, orgStatusTone } from '@/features/org/orgStatus';
import { CalendarDays, CheckCircle2, Circle, ExternalLink, Rocket, ShieldCheck, Users } from 'lucide-react';

// Overview — the first screen an org admin lands on. Its job is BELONG:
// show progress (stat tiles fed by the same repos the deeper tabs use) and
// the next step (the go-live checklist, derived from the same signals the
// Compliance tab's publish gate checks). No new server surface area.

function ChecklistRow({ step, onGo }) {
  const Icon = step.done ? CheckCircle2 : Circle;
  const iconColor = step.done ? 'text-green-500' : 'text-muted-foreground';

  const content = (
    <div className="flex items-start gap-3 py-2">
      {step.loading ? (
        <span className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded-full bg-secondary/70" aria-hidden="true" />
      ) : (
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}`}>
          {step.label}
        </p>
        {!step.done && <p className="mt-0.5 text-xs text-muted-foreground">{step.blurb}</p>}
      </div>
    </div>
  );

  if (step.done) {
    return <li className="-mx-2 rounded-md px-2">{content}</li>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onGo(step.tab)}
        className="-mx-2 block w-full rounded-md px-2 text-left transition-colors hover:bg-secondary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {content}
      </button>
    </li>
  );
}

export default function OrgOverviewTab({ organizationId, organization, user, goTab }) {
  // Per-tile state so each tile shows its own skeleton and never blocks the rest.
  const [roster, setRoster] = useState({ loading: true, publishedCount: 0, activeCount: 0, addedCount: 0 });
  const [members, setMembers] = useState({ loading: true, count: null });
  // count === null after load means session reads were denied (privacy-scoped).
  const [upcoming, setUpcoming] = useState({ loading: true, count: null });
  const [connect, setConnect] = useState({ loading: true, account: null });

  // Same signal the Compliance tab's legal gate reads (LegalSignaturePanel
  // uses this hook internally with the same signer role + org id).
  const legalStatus = useLegalPacketStatus({ user, signerRole: 'organization_admin', organizationId });

  // Roster links → published-coach count, plus upcoming sessions for the same
  // active coach ids (mirrors OrgRosterTab / OrgBookingsTab queries).
  useEffect(() => {
    if (!organizationId) {
      setRoster({ loading: false, publishedCount: 0, activeCount: 0, addedCount: 0 });
      setUpcoming({ loading: false, count: 0 });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const links = await organizationCoachRepo
        .filter({ organization_id: organizationId })
        .catch(() => []);
      const addedCount = links.filter((row) => row.status !== 'removed').length;
      const activeIds = [...new Set(
        links.filter((row) => row.status === 'active').map((row) => row.coach_id).filter(Boolean),
      )];
      let publishedCount = 0;
      if (activeIds.length > 0) {
        const coaches = await coachRepo.filter({ id: activeIds }).catch(() => []);
        publishedCount = coaches.filter((coach) => coach?.published === true).length;
      }
      if (!cancelled) {
        setRoster({ loading: false, publishedCount, activeCount: activeIds.length, addedCount });
      }

      // Sessions are per-document scoped to participants, so this read may be
      // denied for org admins — null keeps the tile honest ("—") instead of 0.
      let sessionRows = [];
      if (activeIds.length > 0) {
        sessionRows = await sessionRepo.filter({ coach_id: activeIds }).catch(() => null);
      }
      if (!cancelled) {
        setUpcoming({
          loading: false,
          count: sessionRows === null
            ? null
            : sessionRows.filter((session) => isUpcomingSession(session)).length,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  // Team members — same query OrgMembersTab runs, counted the same way.
  useEffect(() => {
    if (!organizationId) {
      setMembers({ loading: false, count: 0 });
      return undefined;
    }
    let cancelled = false;
    organizationMemberRepo.filter({ organization_id: organizationId })
      .then((rows) => {
        if (cancelled) return;
        setMembers({ loading: false, count: rows.filter((row) => row.status !== 'removed').length });
      })
      .catch(() => { if (!cancelled) setMembers({ loading: false, count: null }); });
    return () => { cancelled = true; };
  }, [organizationId]);

  // Stripe Connect readiness — reuses the Compliance tab's exported helper.
  useEffect(() => {
    let cancelled = false;
    fetchOrgConnectAccount(organizationId)
      .then((account) => { if (!cancelled) setConnect({ loading: false, account }); })
      .catch(() => { if (!cancelled) setConnect({ loading: false, account: null }); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const status = organization?.status;
  const isLive = status === 'active';
  // Suspended/archived orgs must not be coached toward "publish" — that flow
  // is for draft/pending workspaces only.
  const isHalted = status === 'suspended' || status === 'archived';
  const orgName = organization?.name || 'your organization';

  const steps = [
    {
      key: 'stripe_connect',
      label: 'Connect Stripe payouts',
      blurb: 'Charges and payouts must be enabled before any organization share can transfer.',
      tab: 'revenue',
      done: connectAccountReady(connect.account),
      loading: connect.loading,
    },
    {
      key: 'legal_packet',
      label: 'Sign the legal packet',
      blurb: 'The organization agreement, authority, safety, and payout documents.',
      tab: 'compliance',
      done: legalStatus.complete === true,
      loading: legalStatus.loading,
    },
    {
      key: 'roster',
      label: 'Add at least one roster coach',
      blurb: 'Invite a coach by email — athletes book your organization through its roster.',
      tab: 'roster',
      done: roster.addedCount > 0,
      loading: roster.loading,
    },
    {
      key: 'publish',
      label: 'Publish your organization',
      blurb: 'Lists your organization publicly and enables payment routing to your roster.',
      tab: 'compliance',
      done: isLive,
      loading: false,
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="space-y-5">
      {/* Welcome — name + humanized status, and where things stand. */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Welcome back, {orgName}
          </h2>
          <Badge className={`border text-xs ${orgStatusTone(organization?.status)}`}>
            {orgStatusLabel(organization?.status)}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isLive
            ? 'Your organization is live — here is how your roster and workspace are doing.'
            : isHalted
              ? (status === 'suspended'
                ? 'This organization is suspended and is not visible in the public directory. Contact support to resolve the suspension.'
                : 'This organization is archived and is not visible in the public directory.')
              : `You're ${steps.length - doneCount} step${steps.length - doneCount === 1 ? '' : 's'} from going live. Pick up where you left off below.`}
        </p>
      </div>

      {/* Progress at a glance — same repos the deeper tabs read. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={Users}
          label="Published roster coaches"
          value={roster.publishedCount}
          sub={`${roster.activeCount} active on your roster`}
          href="/organization?tab=roster"
          action="Manage roster"
          loading={roster.loading}
          tone="accent"
        />
        <StatTile
          icon={ShieldCheck}
          label="Team members"
          value={members.count === null ? '—' : members.count}
          sub="People with access to this workspace"
          href="/organization?tab=members"
          action="Manage members"
          loading={members.loading}
          tone="blue"
        />
        <StatTile
          icon={CalendarDays}
          label="Upcoming bookings"
          value={upcoming.count === null ? '—' : upcoming.count}
          sub={upcoming.count === null
            ? 'Session details are private — activity shows in Bookings'
            : 'Across your roster coaches'}
          href="/organization?tab=bookings"
          action="View bookings"
          loading={upcoming.loading}
          tone="green"
        />
      </div>

      {/* Go-live checklist — collapses to a compact confirmation once live,
          and hides entirely for suspended/archived workspaces. */}
      {isHalted ? null : isLive ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Live</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {orgName} is published — athletes and families can find it in the directory.
              </p>
            </div>
          </div>
          {organization?.slug && (
            <Link
              to={`/organizations/${encodeURIComponent(organization.slug)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              View public page
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : (
        <SectionCard
          title="Get your organization live"
          icon={Rocket}
          description={`${doneCount} of ${steps.length} complete — each step links to the tab where you finish it.`}
        >
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="space-y-1">
            {steps.map((step) => (
              <ChecklistRow key={step.key} step={step} onGo={goTab} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
