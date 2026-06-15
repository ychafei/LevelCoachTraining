import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarCheck, ClipboardList, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { callFn } from '@/lib/rpc';
import { pricingPackageRepo } from '@/api/repo';
import { getSport, SPORTS_CATALOG } from '@/lib/sportsCatalog';
import { normalizePublicCoach } from '@/lib/publicCoach';
import { sportIcon } from '@/features/marketing/sportIcons';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal, Stagger } from '@/features/marketing/MarketingMotion';
import PublicCoachCard from '@/components/public/PublicCoachCard';

// Same sport-matching rule CoachSearch applies: the coach's sports array can
// hold catalog keys or display names, with a text fallback over specialties.
function coachMatchesSport(coach, sport) {
  const terms = (coach.sports || []).map((value) => String(value).toLowerCase());
  if (terms.includes(sport.sport_key) || terms.includes(sport.display_name.toLowerCase())) return true;
  const text = [coach.bio, ...(coach.specializations || [])].filter(Boolean).join(' ').toLowerCase();
  return text.includes(sport.display_name.toLowerCase());
}

// /sports/:sportKey — templated landing page per catalog sport. One component
// + the catalog data file generates every page; each gets unique meta and the
// standard demand-side CTA.
export default function SportPage() {
  const { sportKey } = useParams();
  const sport = getSport(sportKey);
  const [coaches, setCoaches] = useState(null);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (!sport) return undefined;
    let cancelled = false;
    (async () => {
      const [coachRes, packageRows] = await Promise.all([
        callFn('getPublicCoaches', {}).catch(() => null),
        pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
      ]);
      if (cancelled) return;
      const all = (coachRes?.coaches || []).map(normalizePublicCoach);
      setCoaches(all.filter((coach) => coachMatchesSport(coach, sport)));
      setPackages(packageRows);
    })();
    return () => { cancelled = true; };
  }, [sportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const jsonLd = useMemo(() => (sport ? {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Private ${sport.display_name} Coaching`,
    serviceType: `${sport.display_name} training`,
    provider: { '@type': 'Organization', name: 'LevelCoach Training' },
    areaServed: 'United States',
  } : null), [sportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  usePageMeta({
    title: sport ? `Private ${sport.display_name} Coaching & Training` : 'Sport not found',
    description: sport
      ? `Book vetted private ${sport.display_name.toLowerCase()} coaches near you. ${sport.specialties.slice(0, 4).join(', ')} — real reviews, live availability, and secure Stripe booking.`
      : undefined,
    jsonLd,
    robots: sport ? undefined : 'noindex,follow',
  });

  if (!sport) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-slate-950">Sport not found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          This training category is not available. Browse the current sports catalog to find active training options.
        </p>
        <Button asChild className="mt-6 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
          <Link to="/sports">Browse sports</Link>
        </Button>
      </div>
    );
  }

  const Icon = sportIcon(sport.icon);
  const searchHref = `/coaches?sport=${encodeURIComponent(sport.sport_key)}`;
  const assessmentAreas = (sport.assessment_template?.categories || []).map((category) => category.label);

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-12 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-[1240px]">
          <nav aria-label="Breadcrumb" className="text-xs font-semibold text-slate-500">
            <Link to="/sports" className="hover:text-blue-700 hover:underline">All sports</Link>
            <span aria-hidden="true"> / </span>
            <span className="text-slate-700">{sport.display_name}</span>
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">
              {sport.display_name} coaching
            </h1>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Private {sport.display_name.toLowerCase()} training from vetted coaches — every
            profile shows real reviews from completed sessions, live availability, and the
            price before you book. Sessions are protected by signed waivers, Stripe payments,
            and guardian controls for athletes under 18.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild className="h-11 rounded-lg bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">
              <Link to={searchHref}>
                Find a {sport.display_name.toLowerCase()} coach
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-lg border-blue-200 px-6 font-bold text-blue-700 hover:bg-blue-50">
              <Link to="/how-it-works">How booking works</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
        <section aria-labelledby="sport-training">
          <Reveal>
            <p className="section-num" data-num="01">What coaches train</p>
            <h2 id="sport-training" className="mt-2 text-3xl font-bold tracking-[-0.01em] sm:text-4xl">
              {sport.display_name} specialties on LevelCoach
            </h2>
          </Reveal>
          <Stagger className="mt-5 flex flex-wrap gap-2">
            {sport.specialties.map((specialty) => (
              <Stagger.Item key={specialty} y={8}>
                <span className="inline-block rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800">
                  {specialty}
                </span>
              </Stagger.Item>
            ))}
          </Stagger>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Reveal className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <ClipboardList className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold">Sport-specific assessments</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Coaches score progress on a 1–10 {sport.display_name.toLowerCase()} scale across{' '}
                {assessmentAreas.slice(0, 3).join(', ').toLowerCase()}
                {assessmentAreas.length > 3 ? ' and more' : ''} — so improvement is measured, not guessed.
              </p>
            </Reveal>
            <Reveal className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <CalendarCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold">Every level</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Training from {sport.levels[0].toLowerCase()} through {sport.levels[sport.levels.length - 1].toLowerCase()}
                {sport.positions.length > 0 ? `, with position-specific work for ${sport.positions.slice(0, 3).join(', ').toLowerCase()} and more` : ''}.
              </p>
            </Reveal>
            <Reveal className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold">Server-enforced safeguards</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Signed waivers before training, Stripe-protected payments, and guardian
                controls for athletes under 18 — platform rules, not promises.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="sport-coaches">
          <Reveal className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-num" data-num="02">Available now</p>
              <h2 id="sport-coaches" className="mt-2 text-3xl font-bold tracking-[-0.01em] sm:text-4xl">
                {sport.display_name} coaches
              </h2>
            </div>
            <Link to={searchHref} className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline">
              Search with filters
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>

          {coaches === null ? (
            <div className="mt-6 space-y-4" role="status" aria-label="Loading coaches">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-36 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
              ))}
            </div>
          ) : coaches.length > 0 ? (
            <div className="mt-6 space-y-4">
              {coaches.slice(0, 6).map((coach) => (
                <PublicCoachCard key={coach.id} coach={coach} packages={packages} />
              ))}
            </div>
          ) : (
            <Reveal className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
              <Star className="mx-auto h-6 w-6 text-blue-600" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-bold">No published {sport.display_name.toLowerCase()} coaches yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Browse adjacent training or check the full marketplace — and if you coach{' '}
                {sport.display_name.toLowerCase()}, this page is waiting for you.
              </p>
              <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
                  <Link to="/coaches">Browse all coaches</Link>
                </Button>
                <Link to="/apply/private-training-coach" className="text-sm font-bold text-blue-700 hover:underline">
                  Apply to coach {sport.display_name.toLowerCase()}
                </Link>
              </div>
            </Reveal>
          )}
        </section>

        <section className="mt-12" aria-labelledby="sport-more">
          <Reveal>
            <p className="section-num" data-num="03">Keep exploring</p>
            <h2 id="sport-more" className="mt-2 text-xl font-bold tracking-[-0.01em]">Other sports &amp; training</h2>
          </Reveal>
          <div className="mt-4 flex flex-wrap gap-2">
            {SPORTS_CATALOG.filter((item) => item.sport_key !== sport.sport_key).map((item) => (
              <Link
                key={item.sport_key}
                to={`/sports/${item.sport_key}`}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                {item.display_name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
