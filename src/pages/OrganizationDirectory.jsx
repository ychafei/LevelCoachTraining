import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, MapPin, RefreshCcw, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { organizationRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import { storage } from '@/lib/storage';
import { usePageMeta } from '@/features/marketing/usePageMeta';

function orgSports(org) {
  return String(org.primary_sports || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function OrgLogo({ org, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  const url = org?.logo_file_id ? storage.getFileViewUrl('org-logos', org.logo_file_id) : '';
  if (url) {
    return (
      <img
        src={url}
        alt={`${org.name} logo`}
        className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1`}
      />
    );
  }
  return (
    <span className={`grid ${sizeClass} shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100`}>
      <Building2 className={size === 'lg' ? 'h-9 w-9' : 'h-6 w-6'} aria-hidden="true" />
    </span>
  );
}

export default function OrganizationDirectory() {
  usePageMeta({
    title: 'Training Organizations',
    description: 'Browse active training organizations on LevelCoach — academies and clubs with published coach rosters, sports, and service areas.',
  });

  const [orgs, setOrgs] = useState([]);
  const [coachCounts, setCoachCounts] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await organizationRepo.filter({ status: 'active' }, 'name');
      setOrgs(rows);
      // Published-coach counts come from the same public endpoint the
      // marketplace uses, so the numbers always reflect live rosters.
      const coachRes = await callFn('getPublicCoaches', {}).catch(() => null);
      const counts = new Map();
      for (const coach of coachRes?.coaches || []) {
        const orgId = coach.organization?.id;
        if (orgId) counts.set(orgId, (counts.get(orgId) || 0) + 1);
      }
      setCoachCounts(counts);
    } catch (err) {
      console.error('OrganizationDirectory load failed', err);
      setLoadError(err?.message || 'Organizations could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orgs;
    return orgs.filter((org) => [
      org.name,
      org.service_area_label,
      org.description,
      ...orgSports(org),
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [orgs, query]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">Organizations</span>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
            Training organizations
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Academies and clubs running coach rosters on LevelCoach. Every organization listed here
            is active, with its published coaches bookable through the marketplace.
          </p>

          <label className="relative mt-6 block max-w-xl">
            <span className="sr-only">Search organizations by name, sport, or location</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, sport, or location"
              className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading organizations">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
            <h2 className="font-display text-2xl font-bold text-slate-950">We couldn't load organizations</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{loadError}</p>
            <Button onClick={load} className="mt-5 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}

        {!loading && !loadError && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((org) => {
              const sports = orgSports(org);
              const coachCount = coachCounts.get(org.id) || 0;
              return (
                <Link
                  key={org.id}
                  to={`/organizations/${encodeURIComponent(org.slug)}`}
                  className="group flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/10 focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div className="flex items-start gap-4">
                    <OrgLogo org={org} />
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-bold tracking-normal text-slate-950 group-hover:text-blue-700">
                        {org.name}
                      </h2>
                      {org.service_area_label && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                          <MapPin className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                          {org.service_area_label}
                        </p>
                      )}
                    </div>
                  </div>
                  {org.description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{org.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sports.slice(0, 4).map((sport) => (
                      <span key={sport} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold capitalize text-blue-700 ring-1 ring-blue-100">
                        {sport.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <Users className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                      {coachCount} published coach{coachCount === 1 ? '' : 'es'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-blue-700">
                      View
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-slate-950">
              {query ? 'No organizations match that search' : 'No active organizations yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {query
                ? 'Try a different name, sport, or location.'
                : 'Organizations appear here once they are created and activated. Run an academy or club? Bring your roster to LevelCoach.'}
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {query && (
                <Button variant="outline" onClick={() => setQuery('')} className="rounded-lg border-blue-200 px-5 font-bold text-blue-700 hover:bg-blue-50">
                  Clear search
                </Button>
              )}
              <Button asChild className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
                <Link to="/for-organizations">
                  Learn about organizations
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
