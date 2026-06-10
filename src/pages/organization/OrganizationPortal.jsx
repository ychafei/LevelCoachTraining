import React from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { useOrganization } from '@/features/org/useOrganization';
import OrgProfileTab from '@/features/org/OrgProfileTab';
import OrgRosterTab from '@/features/org/OrgRosterTab';
import OrgMembersTab from '@/features/org/OrgMembersTab';
import OrgRevenueTab from '@/features/org/OrgRevenueTab';
import OrgBookingsTab from '@/features/org/OrgBookingsTab';
import OrgComplianceTab from '@/features/org/OrgComplianceTab';

const STATUS_TONES = {
  draft: 'bg-secondary text-muted-foreground border-border',
  pending_review: 'bg-accent/10 text-accent border-accent/20',
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
  archived: 'bg-secondary text-muted-foreground border-border',
};

export default function OrganizationPortal() {
  const { user } = useAuth();
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
          <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90 font-display tracking-wider uppercase">
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
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Organization Portal</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                {organization?.name || 'Organization workspace'}
              </h1>
              {organization?.status && (
                <Badge className={`border text-xs ${STATUS_TONES[organization.status] || STATUS_TONES.draft}`}>
                  {organization.status}
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

        <Tabs defaultValue="profile" className="mt-7">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-secondary/60 p-1">
            <TabsTrigger value="profile" className="font-display text-xs uppercase tracking-wider">Profile</TabsTrigger>
            <TabsTrigger value="roster" className="font-display text-xs uppercase tracking-wider">Roster</TabsTrigger>
            <TabsTrigger value="members" className="font-display text-xs uppercase tracking-wider">Members</TabsTrigger>
            <TabsTrigger value="revenue" className="font-display text-xs uppercase tracking-wider">Revenue</TabsTrigger>
            <TabsTrigger value="bookings" className="font-display text-xs uppercase tracking-wider">Bookings</TabsTrigger>
            <TabsTrigger value="compliance" className="font-display text-xs uppercase tracking-wider">Compliance</TabsTrigger>
          </TabsList>

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
