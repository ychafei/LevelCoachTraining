import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Flag,
  MapPin,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  Star,
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { callFn } from '@/lib/rpc';
import { coachReviewRepo, pricingPackageRepo } from '@/api/repo';
import {
  coachBookHref,
  formatAvailabilityTime,
  normalizePublicCoach,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import { recurringWindowsByDay, timezoneAbbreviation } from '@/lib/scheduleET';
import { CoachAvatar } from '@/components/public/PublicCoachCard';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { formatUsdFromCents } from '@/features/marketing/format';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function mergeSearch(path, currentSearch) {
  const params = new URLSearchParams(currentSearch);
  if (!params.toString()) return path;
  const [base, rawSearch = ''] = path.split('?');
  const next = new URLSearchParams(rawSearch);
  params.forEach((value, key) => {
    if (!next.has(key)) next.set(key, value);
  });
  return `${base}?${next.toString()}`;
}

function StarRow({ rating, className = 'h-4 w-4' }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${className} ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function CoachDetail() {
  const { coachId } = useParams();
  const location = useLocation();
  const [coach, setCoach] = useState(null);
  const [packages, setPackages] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewsError, setReviewsError] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError('');
    setReviewsError(false);
    try {
      const [coachRes, packageRows] = await Promise.all([
        callFn('getPublicCoaches', {}),
        pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
      ]);
      const liveCoaches = (coachRes?.coaches || []).map(normalizePublicCoach);
      const match = liveCoaches.find((item) => item.id === coachId);
      if (!match) {
        setNotFound(true);
        return;
      }
      setCoach(match);
      setPackages(packageRows);

      // Secondary loads degrade gracefully — the profile still renders.
      const [reviewRows, av] = await Promise.all([
        coachReviewRepo.listPublished(coachId).catch(() => { setReviewsError(true); return []; }),
        callFn('getCoachAvailability', { coach_id: coachId }).catch(() => null),
      ]);
      setReviews(reviewRows || []);
      setAvailability(av);
    } catch (err) {
      console.error('CoachDetail load failed', err);
      setLoadError(err?.message || 'This profile could not load.');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => { load(); }, [load]);

  const model = useMemo(
    () => (coach ? publicCoachDisplay(coach, { packages }) : null),
    [coach, packages],
  );

  usePageMeta({
    title: model ? `${model.displayName} — ${model.primarySport} Coach` : 'Coach Profile',
    description: model
      ? `${model.displayName} offers ${model.primarySport.toLowerCase()} training${model.locationLabel && model.locationLabel !== 'Location coming soon' ? ` in ${model.locationLabel}` : ''}. View specialties, availability, and published reviews, then book on LevelCoach Training.`
      : 'View coach specialties, availability, and published reviews on LevelCoach Training.',
  });

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-[1240px] space-y-4" aria-busy="true" aria-label="Loading coach profile">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white" />
            <div className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-20 text-center" role="alert">
        <h1 className="font-display text-3xl font-bold text-slate-950">We couldn't load this profile</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{loadError}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={load} className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline" className="rounded-lg border-blue-200 px-5 font-bold text-blue-700 hover:bg-blue-50">
            <Link to="/coaches">Back to search</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (notFound || !coach || !model) {
    return (
      <div className="min-h-[60vh] bg-slate-50 px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-slate-950">Coach not found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          This profile may have been unpublished. Browse the marketplace to find an active coach.
        </p>
        <Button asChild className="mt-6 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
          <Link to="/coaches">Browse coaches</Link>
        </Button>
      </div>
    );
  }

  const bookHref = mergeSearch(coachBookHref(coach), location.search);
  const priceLabel = Number.isFinite(Number(coach.price_hint_cents)) && Number(coach.price_hint_cents) > 0
    ? formatUsdFromCents(coach.price_hint_cents)
    : '';
  const weeklyWindows = recurringWindowsByDay(availability || { availability: coach.availability });
  const hasWindows = WEEK_DAYS.some((day) => (weeklyWindows[day] || []).length > 0);
  const tzLabel = timezoneAbbreviation(availability?.timezone || coach.timezone);
  const ratingAvg = Number(coach.rating_avg) || 0;
  const reviewCount = Number(coach.review_count) || 0;
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => Number(review.rating) === star).length,
  }));
  const org = coach.organization;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: model.displayName,
    jobTitle: `${model.primarySport} Coach`,
    description: model.bio || model.headline,
    ...(model.photoUrl ? { image: model.photoUrl } : {}),
    ...(model.serviceCity ? {
      address: {
        '@type': 'PostalAddress',
        addressLocality: model.serviceCity,
        ...(model.serviceState ? { addressRegion: model.serviceState } : {}),
      },
    } : {}),
    ...(org?.name ? { worksFor: { '@type': 'Organization', name: org.name } } : {}),
    ...(reviewCount > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: ratingAvg,
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 lg:px-8">
          <Link to="/coaches" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to coach search
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <CoachAvatar coach={coach} size="xl" className="sm:mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {model.contactVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Verified email
                      </span>
                    )}
                    {model.locationLabel && model.locationLabel !== 'Location coming soon' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {model.locationLabel}
                      </span>
                    )}
                  </div>

                  <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                    {model.displayName}
                  </h1>
                  <p className="mt-2 text-base font-semibold text-slate-700">{model.organizationName}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    {ratingAvg > 0 ? (
                      <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                        <StarRow rating={Math.round(ratingAvg)} />
                        {ratingAvg.toFixed(1)} · {reviewCount} review{reviewCount === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="font-semibold text-slate-500">No reviews yet</span>
                    )}
                    {priceLabel && (
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                        <CircleDollarSign className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        {priceLabel} / session
                      </span>
                    )}
                  </div>

                  {coach.quote && (
                    <blockquote className="mt-4 max-w-3xl border-l-4 border-blue-200 pl-4 text-lg italic leading-8 text-slate-600">
                      "{coach.quote}"
                    </blockquote>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[...model.sports, ...model.specializations].filter(Boolean).slice(0, 8).map((tag) => (
                      <span key={tag} className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold capitalize text-blue-700 ring-1 ring-blue-100">
                        {String(tag).replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start" aria-label="Book training">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Book training</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">Train with {model.firstName}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pick a time from {model.firstName}'s live availability. Pricing is confirmed at checkout
                and processed securely through Stripe.
              </p>
              {priceLabel && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Typical session price</p>
                  <p className="mt-1 font-display text-2xl font-bold text-slate-950">
                    {priceLabel}
                    <span className="font-sans text-xs font-semibold text-slate-500"> / session</span>
                  </p>
                </div>
              )}
              <Button asChild className="mt-5 h-12 w-full rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700">
                <Link to={bookHref}>
                  Book training
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="mt-2 h-11 w-full rounded-lg border-blue-200 bg-white text-sm font-bold text-blue-700 hover:bg-blue-50">
                <Link to="/coaches">Compare other coaches</Link>
              </Button>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1240px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-5">
          <InfoSection title={`About ${model.firstName}`} icon={Users}>
            {model.bio ? (
              <p className="whitespace-pre-line text-base leading-8 text-slate-600">{model.bio}</p>
            ) : (
              <p className="text-base leading-8 text-slate-600">
                This coach hasn't added a public bio yet. Their location, specialties, and availability
                below come straight from their profile settings.
              </p>
            )}
          </InfoSection>

          <InfoSection title="Service area" icon={Target}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FocusList
                title="Where they train"
                items={[model.locationLabel, model.serviceVenue, ...model.servedAreas].filter(
                  (item) => item && item !== 'Location coming soon',
                )}
                fallback="Shared during booking"
              />
              <FocusList
                title="Travel & format"
                items={[model.serviceRadiusLabel, model.serviceTypeLabel].filter(Boolean)}
                fallback="Ask during booking"
              />
            </div>
          </InfoSection>

          <InfoSection title="Weekly availability" icon={CalendarDays}>
            {hasWindows ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {WEEK_DAYS.map((day) => {
                    const windows = weeklyWindows[day] || [];
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
                          windows.length ? 'border-blue-100 bg-blue-50/70' : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                      >
                        <span className="text-sm font-bold">{day}</span>
                        <span className="text-xs font-semibold">
                          {windows.length
                            ? windows.map((w) => `${formatAvailabilityTime(w.start)}–${formatAvailabilityTime(w.end)}`).join(', ')
                            : 'Unavailable'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {tzLabel && (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Times shown in the coach's timezone ({tzLabel}). Exact open slots appear during booking.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                {model.firstName} hasn't published recurring weekly windows yet. Open the booking flow to
                see any available times.
              </p>
            )}
          </InfoSection>

          <InfoSection title="Reviews" icon={Star}>
            {reviewsError && (
              <p className="text-sm leading-6 text-slate-600" role="alert">
                Reviews could not load right now. Refresh the page to try again.
              </p>
            )}
            {!reviewsError && reviews.length === 0 && (
              <p className="text-sm leading-6 text-slate-600">
                No published reviews yet. Reviews can only be left by clients after a completed
                session, so every one you see here reflects real training.
              </p>
            )}
            {!reviewsError && reviews.length > 0 && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center">
                  <div className="text-center sm:pr-6">
                    <p className="font-display text-4xl font-bold text-slate-950">{ratingAvg > 0 ? ratingAvg.toFixed(1) : '—'}</p>
                    <StarRow rating={Math.round(ratingAvg)} />
                    <p className="mt-1 text-xs font-semibold text-slate-500">{reviewCount} review{reviewCount === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {breakdown.map(({ star, count }) => (
                      <div key={star} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="w-8 shrink-0">{star} star</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="presentation">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <ul className="space-y-4">
                  {reviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-950">{review.reviewer_name || 'Verified client'}</p>
                        <StarRow rating={Number(review.rating) || 0} className="h-3.5 w-3.5" />
                      </div>
                      {review.created_date && (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {new Date(review.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {review.comment && (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{review.comment}</p>
                      )}
                      {review.coach_response && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3 ring-1 ring-blue-100">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Coach response</p>
                          <p className="mt-1 text-sm leading-6 text-slate-700">{review.coach_response}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </InfoSection>
        </div>

        <aside className="space-y-5">
          {org?.name && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Affiliated organization</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="font-display text-lg font-bold text-slate-950">{org.name}</p>
              </div>
              {org.slug && (
                <Button asChild variant="outline" className="mt-4 w-full rounded-lg border-blue-200 font-bold text-blue-700 hover:bg-blue-50">
                  <Link to={`/organizations/${encodeURIComponent(org.slug)}`}>
                    View organization
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Safety information">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Safety on LevelCoach</p>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    {model.contactVerified ? 'Email verified' : 'Email verification pending'}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                    {model.contactVerified
                      ? 'This coach confirmed their email address with a server-issued code.'
                      : 'This coach has not completed email verification yet.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-950">In-platform messaging</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                    Coach-client messages stay inside LevelCoach; guardians of minors can read their child's conversations.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700 ring-1 ring-red-100">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-950">Report a concern</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Report a concern about coach ${model.displayName}`)}`}
                      className="font-bold text-red-700 underline-offset-2 hover:underline"
                    >
                      Email our team
                    </a>{' '}
                    and we'll review it promptly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
              <p className="font-display text-xl font-bold text-slate-950">Ready to train?</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Open the booking flow to see {model.firstName}'s live open times and confirm a session.
            </p>
            <Button asChild className="mt-4 w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700">
              <Link to={bookHref}>Book training</Link>
            </Button>
          </div>
        </aside>
      </section>
    </div>
  );
}

function InfoSection({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-normal text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FocusList({ title, items, fallback }) {
  const list = items?.length ? items : [fallback];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((item) => (
          <span key={item} className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
