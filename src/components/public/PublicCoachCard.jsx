import React from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Clock,
  MapPin,
  Star,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coachBookHref, publicCoachDisplay } from '@/lib/publicCoach';

// No presence dot: we have no real online/offline signal, so we don't fake one.
export function CoachAvatar({ coach, size = 'lg', className = '' }) {
  const model = publicCoachDisplay(coach);
  const sizeClass = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-20 w-20 text-xl',
  }[size] || 'h-14 w-14 text-base';

  return (
    <div className={`relative shrink-0 self-start overflow-visible rounded-full ${sizeClass} ${className}`}>
      {model.photoUrl ? (
        <img
          src={model.photoUrl}
          alt={model.displayName}
          className="h-full w-full rounded-full object-cover object-center"
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-blue-50 via-white to-emerald-50 font-extrabold text-blue-900">
          {model.initials}
        </div>
      )}
    </div>
  );
}

function CoachCardPhoto({ model, compact = false }) {
  const heightClass = compact ? 'h-28 sm:h-32' : 'h-40 sm:h-44 lg:h-full';

  return (
    <div className={`relative overflow-hidden rounded-lg bg-blue-50 ring-1 ring-slate-200 ${heightClass}`}>
      {model.photoUrl ? (
        <img
          src={model.photoUrl}
          alt={model.displayName}
          className="h-full w-full object-cover object-center"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_55%,#ecfdf5_100%)] font-display text-4xl font-extrabold text-blue-900">
          {model.initials}
        </div>
      )}
      {model.verified && (
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
          Verified
        </span>
      )}
    </div>
  );
}

function hrefWithParams(path, params = {}) {
  const clean = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!clean.length) return path;
  const search = new URLSearchParams(clean);
  return `${path}?${search.toString()}`;
}

export default function PublicCoachCard({
  coach,
  packages = [],
  compact = false,
  className = '',
  distanceMiles = null,
  bookingParams = {},
}) {
  const model = publicCoachDisplay(coach, { packages });
  // Sports chips (humanized sport keys) followed by specialties; deduped.
  const sportChips = model.sports.map((sport) => String(sport).replace(/_/g, ' '));
  const allChips = [...sportChips, ...model.specializations].filter(
    (chip, index, arr) => arr.findIndex((c) => c.toLowerCase() === chip.toLowerCase()) === index,
  );
  const visibleSpecs = allChips.length
    ? allChips.slice(0, compact ? 2 : 4)
    : [model.primarySport].filter(Boolean);
  const hasOrg = !!model.organization?.name;
  const profileHref = hrefWithParams(model.profileHref, bookingParams);
  const bookHref = coachBookHref(model.raw, { intro: '1', ...bookingParams });
  const displayDistance = distanceMiles === null || distanceMiles === undefined ? null : Number(distanceMiles);

  return (
    <article className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-4 ${className}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[170px_1fr] xl:grid-cols-[190px_1fr_230px]">
        <CoachCardPhoto model={model} compact={compact} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {hasOrg && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {model.organization.name}
              </span>
            )}
            {!hasOrg && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Independent coach
              </span>
            )}
            {coach?.is_demo && (
              <span className="rounded-md bg-slate-50 px-2 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Demo
              </span>
            )}
          </div>

          <Link
            to={profileHref}
            className="mt-2 block truncate font-display text-2xl font-extrabold tracking-normal text-slate-950 hover:text-blue-700"
          >
            {model.displayName}
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1 text-blue-700">
              <Tag className="h-4 w-4" aria-hidden="true" />
              {model.primarySport}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {model.locationLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {model.availability}
            </span>
            {displayDistance !== null && Number.isFinite(displayDistance) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-100">
                {displayDistance < 10 ? displayDistance.toFixed(1) : Math.round(displayDistance)} mi away
              </span>
            )}
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{model.headline}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {visibleSpecs.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold capitalize text-blue-700 ring-1 ring-blue-100"
              >
                {tag}
              </span>
            ))}
            {model.trainingFormats.slice(0, compact ? 1 : 2).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
              >
                {tag}
              </span>
            ))}
            {model.serviceRadiusLabel && (
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                {model.serviceRadiusLabel}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div className="grid grid-cols-2 gap-3 xl:block">
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Rating</p>
              <p className="mt-2 inline-flex items-center gap-1 font-display text-2xl font-extrabold text-slate-950">
                <Star className={`h-5 w-5 ${model.ratingLabel ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
                {model.ratingLabel || 'New'}
              </p>
              <p className="text-xs font-semibold text-slate-500">{model.reviewLabel}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-blue-100 xl:mt-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Starting at</p>
              {model.rateLabel ? (
                <p className="mt-2">
                  <span className="proof-number text-3xl text-slate-950">{model.rateLabel.replace(/^From\s+/i, '')}</span>
                  <span className="ml-1 text-xs font-semibold text-slate-500">/ session</span>
                </p>
              ) : (
                <p className="mt-2 text-sm font-bold text-slate-700">Shown at booking</p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500">Next available</p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {model.nextAvailable || 'Request times'}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-lg border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"
            >
              <Link to={profileHref}>Profile</Link>
            </Button>
            <Button
              asChild
              className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-blue-600/20 hover:bg-blue-700"
            >
              <Link to={bookHref}>Book</Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
