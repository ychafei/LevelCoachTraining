import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  coachRepo,
  organizationCoachRepo,
  organizationMemberRepo,
  organizationRepo,
  payoutRuleRepo,
  profileRepo,
  stripeConnectedAccountRepo,
} from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { bpsToPercentLabel } from '@/features/admin/money';
import { ArrowLeft, Building2, CheckCircle2, Eye, Info, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_TONES = {
  draft: 'bg-secondary text-muted-foreground border-border',
  pending_review: 'bg-accent/10 text-accent border-accent/20',
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
  archived: 'bg-secondary text-muted-foreground border-border',
};

// Display-only labels for stored status values.
const STATUS_LABELS = {
  draft: 'Draft',
  pending_review: 'Pending review',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

const MEMBER_STATUS_LABELS = {
  active: 'Active',
  invited: 'Invited',
  pending: 'Pending',
  suspended: 'Suspended',
  removed: 'Removed',
};

const MEMBER_ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  coach: 'Coach',
  member: 'Member',
  staff: 'Staff',
};

function StatusBadge({ status }) {
  return (
    <Badge className={`border text-xs ${STATUS_TONES[status] || STATUS_TONES.draft}`}>
      {STATUS_LABELS[status] || status || 'Draft'}
    </Badge>
  );
}

function personName(profile, fallbackId) {
  if (profile) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
      || profile.email
      || `Profile ${String(fallbackId).slice(0, 8)}`;
  }
  return `Profile ${String(fallbackId || '').slice(0, 8)}`;
}

function coachLabel(coach, fallbackId) {
  if (coach) {
    return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim()
      || coach.email
      || `Coach ${String(fallbackId).slice(0, 8)}`;
  }
  return `Coach ${String(fallbackId || '').slice(0, 8)}`;
}

function OrgDetailSheet({ org, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [members, coachLinks, rules, connect] = await Promise.all([
          organizationMemberRepo.filter({ organization_id: org.id }).catch(() => []),
          organizationCoachRepo.filter({ organization_id: org.id }).catch(() => []),
          payoutRuleRepo.listByOrganization(org.id).catch(() => []),
          stripeConnectedAccountRepo.filter({ owner_type: 'org', owner_id: org.id }).catch(() => []),
        ]);
        const profileIds = [...new Set(members.map((row) => row.profile_id).filter(Boolean))];
        const coachIds = [...new Set(coachLinks.map((row) => row.coach_id).filter(Boolean))];
        const [profiles, coaches] = await Promise.all([
          profileIds.length ? profileRepo.filter({ id: profileIds }).catch(() => []) : [],
          coachIds.length ? coachRepo.filter({ id: coachIds }).catch(() => []) : [],
        ]);
        if (cancelled) return;
        const profileMap = {};
        profiles.forEach((profile) => { profileMap[profile.id] = profile; });
        const coachMap = {};
        coaches.forEach((coach) => { coachMap[coach.id] = coach; });
        setDetail({
          members,
          coachLinks,
          rules,
          connect: connect[0] || null,
          profileMap,
          coachMap,
        });
      } catch (err) {
        if (!cancelled) toast.error(err?.message || 'Could not load organization details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [org?.id]);

  if (!org) return null;
  const connectReady = !!detail?.connect?.charges_enabled && !!detail?.connect?.payouts_enabled;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display tracking-tight">{org.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <StatusBadge status={org.status} />
            <span>/{org.slug}</span>
            {org.type && <span>· {org.type}</span>}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-6 space-y-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        ) : detail && (
          <div className="mt-6 space-y-6 pb-8">
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Contact</h3>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Email</dt><dd className="text-foreground">{org.contact_email || '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Phone</dt><dd className="text-foreground">{org.contact_phone || '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Service area</dt><dd className="text-foreground">{org.service_area_label || '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Sports</dt><dd className="text-foreground">{org.primary_sports || '—'}</dd></div>
              </dl>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Publish gates</h3>
              <div className="mt-2 flex items-center gap-2 text-sm">
                {connectReady
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  : <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />}
                <span>Stripe Connect {connectReady ? 'ready' : detail.connect ? 'incomplete' : 'not started'}</span>
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Publishing and suspension are owner-driven through the orgAdmin function — there is no
                platform-admin override action yet, so this view is read-only for status changes.
              </p>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Members ({detail.members.length})
                </h3>
              </div>
              {detail.members.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No member rows.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{personName(detail.profileMap[member.profile_id], member.profile_id)}</p>
                        <p className="text-xs text-muted-foreground">{MEMBER_ROLE_LABELS[member.role] || member.role}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{MEMBER_STATUS_LABELS[member.status] || member.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Coaches ({detail.coachLinks.length})
                </h3>
              </div>
              {detail.coachLinks.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No coach links.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.coachLinks.map((link) => {
                    const rule = detail.rules.find((row) => row.coach_id === link.coach_id);
                    return (
                      <li key={link.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{coachLabel(detail.coachMap[link.coach_id], link.coach_id)}</p>
                          <p className="text-xs text-muted-foreground">
                            {rule
                              ? `split: coach ${bpsToPercentLabel(rule.coach_share_bps)} / org ${bpsToPercentLabel(rule.org_share_bps)} / platform ${bpsToPercentLabel(rule.platform_share_bps)}`
                              : 'no payout rule'}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">{MEMBER_STATUS_LABELS[link.status] || link.status}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function AdminOrganizations() {
  const { isAdmin } = useCurrentUser();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    let cancelled = false;
    organizationRepo.list('-created_date')
      .then((rows) => { if (!cancelled) setOrgs(rows); })
      .catch((err) => { if (!cancelled) toast.error(err?.message || 'Could not load organizations.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const stats = useMemo(() => ({
    total: orgs.length,
    active: orgs.filter((org) => org.status === 'active').length,
    draft: orgs.filter((org) => !org.status || org.status === 'draft').length,
    pending: orgs.filter((org) => org.status === 'pending_review').length,
  }), [orgs]);

  const columns = [
    {
      key: 'name',
      header: 'Organization',
      sortable: true,
      sortAccessor: 'name',
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">/{row.slug}{row.type ? ` · ${row.type}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      sortAccessor: 'contact_email',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.contact_email || '—'}</span>,
    },
    {
      key: 'sports',
      header: 'Sports',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.primary_sports || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: 'status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)} className="h-8 text-xs">
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Details
        </Button>
      ),
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to admin
        </Link>
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Organizations</h1>
        <p className="mt-1 text-muted-foreground">All organization workspaces across the platform.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Pending review', value: stats.pending },
            { label: 'Draft', value: stats.draft },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading organizations">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-2/3" />
            </div>
          ) : orgs.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-10 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">No organizations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Organizations appear here as soon as an owner creates one from the public onboarding flow.
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={orgs}
              searchFields={['name', 'slug', 'contact_email', 'type', 'primary_sports']}
              searchPlaceholder="Search by name, slug, email, or sport..."
              emptyMessage="No organizations match the search."
            />
          )}
        </div>
      </div>

      {selected && <OrgDetailSheet org={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
