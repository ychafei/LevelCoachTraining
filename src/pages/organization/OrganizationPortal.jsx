import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { useOrganization } from '@/features/org/useOrganization';
import { orgStatusLabel, orgStatusTone } from '@/features/org/orgStatus';
import OrgOverviewTab from '@/features/org/OrgOverviewTab';
import OrgProfileTab from '@/features/org/OrgProfileTab';
import OrgRosterTab from '@/features/org/OrgRosterTab';
import OrgPackagesTab from '@/features/org/OrgPackagesTab';
import OrgMembersTab from '@/features/org/OrgMembersTab';
import OrgRevenueTab from '@/features/org/OrgRevenueTab';
import OrgBookingsTab from '@/features/org/OrgBookingsTab';
import OrgComplianceTab from '@/features/org/OrgComplianceTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'profile', label: 'Profile' },
  { value: 'roster', label: 'Roster' },
  { value: 'packages', label: 'Packages' },
  { value: 'members', label: 'Members' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'compliance', label: 'Compliance' },
];

export default function OrganizationPortal() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.value === rawTab) ? rawTab : 'overview';

  const goTab = (next) => {
    // replace: tabs are view state — pushing per change floods history (Radix
    // arrow-key roving would otherwise push an entry per focused tab).
    setSearchParams((params) => {
      const copy = new URLSearchParams(params);
      copy.set('tab', next);
      return copy;
    }, { replace: true });
  };

  const {
    orgId,
    organization,
    setOrganization,
    isOwner,
    isOrgAdmin,
    loading,
    error,
    refresh,
  } = useOrganization();

  if (!orgId) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
          <Building2 className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">No organization yet</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your account is not linked to an organization workspace. Create one to manage a coach roster,
            payouts, and compliance — or ask your organization owner to invite you.
          </p>
          <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
            <Link to="/create-organization">Create an organization</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-6xl space-y-4 px-4 sm:px-6" aria-busy="true" aria-label="Loading organization">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Organization portal</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                {organization?.name || 'Organization workspace'}
              </h1>
              {organization?.status && (
                <Badge className={`border text-xs ${orgStatusTone(organization.status)}`}>
                  {orgStatusLabel(organization.status)}
                </Badge>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage your profile and branding, coach roster, team members, revenue, and compliance.
            </p>
          </div>
          <Building2 className="h-10 w-10 shrink-0 text-accent" aria-hidden="true" />
        </div>

        {error && (
          <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Tabs value={tab} onValueChange={goTab} className="mt-7">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max gap-1 bg-secondary/40 p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3.5 py-1.5 text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5">
            <OrgOverviewTab
              organizationId={orgId}
              organization={organization}
              user={user}
              goTab={goTab}
            />
          </TabsContent>
          <TabsContent value="profile" className="mt-5">
            <OrgProfileTab
              organization={organization}
              isOrgAdmin={isOrgAdmin}
              onSaved={(updated) => { if (updated) setOrganization(updated); }}
            />
          </TabsContent>
          <TabsContent value="roster" className="mt-5">
            <OrgRosterTab organizationId={orgId} isOrgAdmin={isOrgAdmin} />
          </TabsContent>
          <TabsContent value="packages" className="mt-5">
            <OrgPackagesTab organizationId={orgId} isOrgAdmin={isOrgAdmin} />
          </TabsContent>
          <TabsContent value="members" className="mt-5">
            <OrgMembersTab
              organizationId={orgId}
              isOrgAdmin={isOrgAdmin}
              isOwner={isOwner}
              currentProfileId={user?.id}
            />
          </TabsContent>
          <TabsContent value="revenue" className="mt-5">
            <OrgRevenueTab organizationId={orgId} organization={organization} isOrgAdmin={isOrgAdmin} />
          </TabsContent>
          <TabsContent value="bookings" className="mt-5">
            <OrgBookingsTab organizationId={orgId} isOrgAdmin={isOrgAdmin} />
          </TabsContent>
          <TabsContent value="compliance" className="mt-5">
            <OrgComplianceTab
              organizationId={orgId}
              organization={organization}
              isOwner={isOwner}
              onPublished={(updated) => { if (updated) setOrganization(updated); else void refresh(); }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
