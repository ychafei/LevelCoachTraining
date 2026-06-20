import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  PlayCircle,
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
  const sizeClass = compact ? 'h-24 w-24' : 'h-32 w-32 sm:h-36 sm:w-36';

  return (
    <div className={`relative mx-auto overflow-hidden rounded-3xl bg-blue-50 ring-1 ring-slate-200 ${sizeClass}`}>
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
      {model.introVideoUrl && (
        <span className="absolute bottom-2 left-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-blue-700 shadow-lg ring-1 ring-blue-100">
          <PlayCircle className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Intro video available</span>
        </span>
      )}
      {model.verified && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
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

function coachTierLabel(model) {
  const rating = Number(model.ratingLabel);
  if (model.sessionsTaught >= 50 && Number.isFinite(rating) && rating >= 4.8) return 'Top Coach';
  if (model.sessionsTaught >= 20) return 'Expert Coach';
  if (model.sessionsTaught > 0 || Number(model.reviewLabel?.split(' ')[0]) > 0) return 'Rising Coach';
  return 'New Coach';
}

function coachBenefits(model) {
  const formats = model.trainingFormats || [];
  const benefits = [];
  if (formats.some((format) => /group|team/i.test(format))) benefits.push('Individual & small groups');
  else benefits.push('Individual training');
  benefits.push('Secure LevelCoach booking');
  benefits.push('Progress tracking');
  return benefits;
}

function CoachStat({ icon: Icon, label, value, sub, highlight = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
        <Icon
          className={`h-3.5 w-3.5 ${highlight ? 'fill-amber-400 text-amber-400' : 'text-blue-600'}`}
          aria-hidden="true"
        />
        {label}
      </p>
      <p className="mt-1 truncate font-display text-lg font-extrabold tracking-normal text-slate-950">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{sub}</p>}
    </div>
  );
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
  const tierLabel = coachTierLabel(model);
  const benefits = coachBenefits(model);

  const openProfile = () => navigate(profileHref);
  const openProfileButton = (event) => {
    event.stopPropagation();
    navigate(profileHref);
  };
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
      className={`group relative cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:p-5 ${className}`}
      aria-label={`View ${model.displayName}'s full profile`}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[164px_minmax(0,1fr)] xl:grid-cols-[170px_minmax(0,1fr)_286px]">
        <div className="flex flex-col items-center">
          <CoachCardPhoto model={model} compact={compact} />
          <SaveCoachButton
            coach={coach}
            showLabel
            className="mt-3 inline-flex h-11 w-full max-w-[144px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            iconClassName="h-4 w-4"
          />
        </div>

        <div className="min-w-0 pr-0 xl:pr-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
              <Trophy className="h-3 w-3" aria-hidden="true" />
              {tierLabel}
            </span>
            {hasOrg ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {model.organization.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Independent coach
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${
                model.recentlyActive
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                  : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${model.recentlyActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {model.presenceLabel}
            </span>
            {coach?.is_demo && (
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-slate-600 ring-1 ring-slate-200">
                Demo
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate font-display text-2xl font-extrabold tracking-normal text-slate-950 transition group-hover:text-blue-700">
                {model.displayName}
              </h2>
              <p className="text-sm font-extrabold text-slate-600">{model.primarySport} Coach</p>
            </div>
            <button
              type="button"
              onClick={openProfileButton}
              className="hidden shrink-0 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 ring-1 ring-slate-200 transition hover:bg-blue-50 sm:inline-flex"
            >
              View full profile
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold text-slate-600">
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

          <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600">{model.headline}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {visibleSpecs.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-700 ring-1 ring-blue-100"
              >
                {tag}
              </span>
            ))}
            {model.trainingFormats.slice(0, compact ? 1 : 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
              >
                {tag}
              </span>
            ))}
            {model.serviceRadiusLabel && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                {model.serviceRadiusLabel}
              </span>
            )}
          </div>

          <div className={`mt-4 grid grid-cols-2 gap-2 ${model.hasActiveAthleteStat ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <CoachStat
              icon={Star}
              label="Rating"
              value={model.ratingLabel || 'New'}
              sub={model.reviewLabel}
              highlight={!!model.ratingLabel}
            />
            {model.hasActiveAthleteStat && (
              <CoachStat
                icon={Users}
                label="Athletes"
                value={model.activeAthletes.toLocaleString()}
                sub="active"
              />
            )}
            <CoachStat
              icon={Trophy}
              label="Sessions"
              value={model.sessionsTaught > 0 ? model.sessionsTaught.toLocaleString() : 'New'}
              sub={model.sessionsTaught > 0 ? 'completed' : 'coach'}
            />
            <CoachStat
              icon={BadgeCheck}
              label="Verified"
              value={model.verified ? 'Yes' : 'Pending'}
              sub="public profile"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-blue-100 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-4 shadow-inner shadow-blue-900/5 md:col-span-2 xl:col-span-1">
          <div className="flex h-full flex-col gap-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Starting at</p>
                {model.rateLabel ? (
                  <p className="mt-1">
                    <span className="proof-number text-2xl text-slate-950">{model.rateLabel.replace(/^From\s+/i, '')}</span>
                    <span className="ml-1 text-xs font-semibold text-slate-500">/ session</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-bold text-slate-700">Shown at booking</p>
                )}
              </div>
              <div className="text-left">
                <p className="inline-flex items-center gap-1 font-display text-lg font-extrabold text-slate-950">
                  <Star className={`h-5 w-5 ${model.ratingLabel ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
                  {model.ratingLabel || 'New coach'}
                </p>
                <p className="text-xs font-semibold text-slate-500">{model.reviewLabel}</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-blue-100 pt-3">
              {benefits.map((benefit) => (
                <p key={benefit} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  {benefit}
                </p>
              ))}
            </div>

            {model.nextAvailable && (
              <p className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-sm font-extrabold text-blue-700 ring-1 ring-blue-100">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {model.nextAvailable}
              </p>
            )}

            <div className="mt-auto space-y-2 pt-1">
              <CoachActionPanel coach={coach} bookHref={bookHref} />
              <button
                type="button"
                onClick={openProfileButton}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:hidden xl:inline-flex"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                View full profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
