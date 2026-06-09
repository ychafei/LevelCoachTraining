import React from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  MapPin,
  Star,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coachBookHref, publicCoachDisplay } from '@/lib/publicCoach';

export function CoachAvatar({ coach, size = 'lg', className = '' }) {
  const model = publicCoachDisplay(coach);
  const sizeClass = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-20 w-20 text-xl',
  }[size] || 'h-14 w-14 text-base';
  const dotClass = size === 'xl' ? 'h-4 w-4 border-[3px]' : 'h-3.5 w-3.5 border-[2.5px]';

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
      <span className={`absolute bottom-0 right-0 rounded-full border-white bg-emerald-500 ${dotClass}`} />
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
  const visibleSpecs = model.specializations.length
    ? model.specializations.slice(0, compact ? 2 : 4)
    : [model.primarySport].filter(Boolean);
  const profileHref = hrefWithParams(model.profileHref, bookingParams);
  const bookHref = coachBookHref(model.raw, { intro: '1', ...bookingParams });
  const displayDistance = distanceMiles === null || distanceMiles === undefined ? null : Number(distanceMiles);

  return (
    <article className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-4 ${className}`}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <CoachAvatar coach={coach} size={compact ? 'md' : 'lg'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={profileHref}
                className="truncate font-display text-xl font-bold tracking-normal text-slate-950 hover:text-blue-700"
              >
                {model.displayName}
              </Link>
              {model.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </span>
              )}
              {coach?.is_demo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200">
                  Demo
                </span>
              )}
            </div>

            <p className="mt-0.5 text-sm font-semibold text-slate-700">{model.organizationName}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Tag className="h-3.5 w-3.5" />
                {model.primarySport}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                {model.locationLabel}
              </span>
              {model.serviceRadiusLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 ring-1 ring-blue-100">
                  {model.serviceRadiusLabel}
                </span>
              )}
              {model.serviceTypeLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">
                  {model.serviceTypeLabel}
                </span>
              )}
              {displayDistance !== null && Number.isFinite(displayDistance) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                  {displayDistance < 10 ? displayDistance.toFixed(1) : Math.round(displayDistance)} mi away
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                {model.availability}
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                <Star className={`h-3.5 w-3.5 ${model.ratingLabel ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                {model.ratingLabel ? `${model.ratingLabel} · ${model.reviewLabel}` : model.reviewLabel}
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{model.headline}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {visibleSpecs.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100"
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
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 lg:min-w-[210px] lg:border-t-0 lg:pt-0">
          <div className="flex items-end justify-between gap-3 lg:block">
            <div>
              {model.rateLabel ? (
                <p className="font-display text-2xl font-bold tracking-normal text-slate-950">
                  {model.rateLabel}
                  <span className="font-sans text-xs font-semibold normal-case text-slate-500"> {model.rateHint}</span>
                </p>
              ) : (
                <p className="text-sm font-bold text-slate-700">{model.rateHint}</p>
              )}
              <p className="mt-1 text-xs font-semibold text-slate-500">Next available</p>
              <p className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                <CalendarDays className="h-3.5 w-3.5" />
                {model.nextAvailable || 'Request times'}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-lg border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"
            >
              <Link to={profileHref}>View Profile</Link>
            </Button>
            <Button
              asChild
              className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-blue-600/20 hover:bg-blue-700"
            >
              <Link to={bookHref}>Book Intro</Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
