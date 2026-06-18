import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Clock,
  MapPin,
  Star,
  Tag,
  Trophy,
  Users,
} from 'lucide-react';
import { coachBookHref, publicCoachDisplay } from '@/lib/publicCoach';
import { CoachActionPanel, SaveCoachButton } from '@/components/public/CoachActionControls';

export function CoachAvatar({ coach, size = 'lg', className = '' }) {
  const model = publicCoachDisplay(coach);
  const sizeClass = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-16 w-16 text-lg',
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
      <PresenceDot model={model} className="absolute bottom-0 right-0" />
    </div>
  );
}

function PresenceDot({ model, className = '' }) {
  return (
    <span
      className={`block h-3.5 w-3.5 rounded-full border-2 border-white ${
        model.recentlyActive ? 'bg-emerald-500' : 'bg-slate-300'
      } ${className}`}
      title={model.presenceLabel}
      aria-label={model.presenceLabel}
    />
  );
}

function CoachCardPhoto({ model, compact = false }) {
  const sizeClass = compact ? 'h-24 w-24' : 'h-28 w-28 sm:h-32 sm:w-32';

  return (
    <div className={`relative mx-auto overflow-hidden rounded-lg bg-blue-50 ring-1 ring-slate-200 ${sizeClass}`}>
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
      <PresenceDot model={model} className="absolute bottom-2 right-2 h-4 w-4" />
      {model.verified && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
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
  const navigate = useNavigate();
  const model = publicCoachDisplay(coach, { packages });
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

  const openProfile = () => navigate(profileHref);
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProfile();
    }
  };

  return (
    <article
      data-testid="public-coach-card"
      role="link"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={onKeyDown}
      className={`group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow-xl hover:shadow-blue-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:p-4 ${className}`}
      aria-label={`View ${model.displayName}'s full profile`}
    >
      <span className="pointer-events-none absolute right-4 top-4 hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700 opacity-0 ring-1 ring-blue-100 transition group-hover:opacity-100 lg:inline-flex">
        View full profile
      </span>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[136px_1fr] xl:grid-cols-[144px_1fr_220px]">
        <div className="flex flex-col items-center">
          <CoachCardPhoto model={model} compact={compact} />
          <SaveCoachButton
            coach={coach}
            showLabel
            className="mt-3 inline-flex h-10 w-full max-w-[132px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            iconClassName="h-4 w-4"
          />
        </div>

        <div className="min-w-0 pr-0 xl:pr-2">
          <div className="flex flex-wrap items-center gap-2">
            {hasOrg ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {model.organization.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Independent coach
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
              <span className={`h-2 w-2 rounded-full ${model.recentlyActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {model.presenceLabel}
            </span>
            {coach?.is_demo && (
              <span className="rounded-md bg-slate-50 px-2 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Demo
              </span>
            )}
          </div>

          <h2 className="mt-2 truncate font-display text-2xl font-extrabold tracking-normal text-slate-950 transition group-hover:text-blue-700">
            {model.displayName}
          </h2>

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

          <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-6 text-slate-600">{model.headline}</p>

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
          <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3 xl:block">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Starting at</p>
                {model.rateLabel ? (
                  <p className="mt-1">
                    <span className="proof-number text-3xl text-slate-950">{model.rateLabel.replace(/^From\s+/i, '')}</span>
                    <span className="ml-1 text-xs font-semibold text-slate-500">/ session</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-bold text-slate-700">Shown at booking</p>
                )}
              </div>
              <div className="text-left xl:mt-3">
                <p className="inline-flex items-center gap-1 font-display text-xl font-extrabold text-slate-950">
                  <Star className={`h-5 w-5 ${model.ratingLabel ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
                  {model.ratingLabel || 'New'}
                </p>
                <p className="text-xs font-semibold text-slate-500">{model.reviewLabel}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-y border-slate-100 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-slate-800 ring-1 ring-slate-200">
                <Trophy className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                {model.sessionsTaughtLabel}
              </span>
              {model.hasActiveAthleteStat && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-slate-800 ring-1 ring-slate-200">
                  <Users className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  {model.activeAthletesLabel}
                </span>
              )}
            </div>

            {model.nextAvailable && (
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {model.nextAvailable}
              </p>
            )}

            <div className="mt-auto">
              <CoachActionPanel coach={coach} bookHref={bookHref} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
