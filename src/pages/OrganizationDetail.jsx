import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Globe, MapPin, RefreshCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { organizationRepo, pricingPackageRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import { normalizePublicCoach } from '@/lib/publicCoach';
import PublicCoachCard from '@/components/public/PublicCoachCard';
import { OrgLogo } from '@/pages/OrganizationDirectory';
import { usePageMeta } from '@/features/marketing/usePageMeta';

function orgSports(org) {
  return String(org?.primary_sports || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function OrganizationDetail() {
  const { slug } = useParams();
  const [org, setOrg] = useState(null);
  const [roster, setRoster] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError('');
    try {
      const rows = await organizationRepo.filter({ slug, status: 'active' });
      const match = rows[0];
      if (!match) {
        setNotFound(true);
        return;
      }
      setOrg(match);

      // Roster = published coaches whose active org affiliation (resolved
      // server-side by getPublicCoaches) points at this organization.
      const [coachRes, packageRows] = await Promise.all([
        callFn('getPublicCoaches', {}).catch(() => null),
        pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
      ]);
      const coaches = (coachRes?.coaches || [])
        .map(normalizePublicCoach)
        .filter((coach) => coach.organization?.id === match.id);
      setRoster(coaches);
      setPackages(packageRows);
    } catch (err) {
      console.error('OrganizationDetail load failed', err);
      setLoadError(err?.message || 'This organization could not load.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  usePageMeta({
    title: org ? org.name : 'Organization',
    description: org
      ? `${org.name} on LevelCoach Training${org.service_area_label ? ` — serving ${org.service_area_label}` : ''}. View the published coach roster and book training.`
      : 'View this training organization and its published coach roster on LevelCoach Training.',
  });

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-[1240px] space-y-4" aria-busy="true" aria-label="Loading organization">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-48 animate-pulse rounded-lg border border-slate-200 bg-white" />
          <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white" />
          <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-20 text-center" role="alert">
        <h1 className="font-display text-3xl font-bold text-slate-950">We couldn't load this organization</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{loadError}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={load} className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline" className="rounded-lg border-blue-200 px-5 font-bold text-blue-700 hover:bg-blue-50">
            <Link to="/organizations">Back to directory</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-slate-950">Organization not found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          This organization may not be active yet. Browse the directory for active organizations.
        </p>
        <Button asChild className="mt-6 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
          <Link to="/organizations">Browse organizations</Link>
        </Button>
      </div>
    );
  }

  const sports = orgSports(org);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8">
          <Link to="/organizations" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All organizations
          </Link>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <OrgLogo org={org} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                  {org.name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
                  {org.service_area_label && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      {org.service_area_label}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    {roster.length} published coach{roster.length === 1 ? '' : 'es'}
                  </span>
                  {org.website_url && (
                    <a
                      href={org.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"
                    >
                      <Globe className="h-4 w-4" aria-hidden="true" />
                      Website
                    </a>
                  )}
                </div>
                {sports.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sports.map((sport) => (
                      <span key={sport} className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold capitalize text-blue-700 ring-1 ring-blue-100">
                        {sport.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
                {org.description && (
                  <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-slate-600">{org.description}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8" aria-labelledby="roster-heading">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Coach roster</p>
          <h2 id="roster-heading" className="mt-1 font-display text-3xl font-bold tracking-normal text-slate-950">
            Work with {org.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Pick a coach below to view their profile and book training directly.
          </p>
        </div>

        {roster.length > 0 ? (
          <div className="space-y-3">
            {roster.map((coach) => (
              <PublicCoachCard key={coach.id} coach={coach} packages={packages} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-bold text-slate-950">No published coaches yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {org.name} hasn't published any coach profiles yet. Browse the full marketplace while
              their roster comes online.
            </p>
            <Button asChild className="mt-5 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
              <Link to="/coaches">
                Browse all coaches
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
