import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  PlayCircle,
  ShieldCheck,
  Star,
  Tag,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { coachBookHref, coachIntroEmbedUrl, publicCoachDisplay } from '@/lib/publicCoach';
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
        <span className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-blue-700 shadow-lg ring-1 ring-blue-100">
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Intro video available</span>
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

function CoachStat({ icon: Icon, label, value, sub, highlight = false, compactText = false }) {
  const labelClass = compactText
    ? 'flex min-w-0 items-center text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-500'
    : 'flex min-w-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-500';

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
      <p className={labelClass}>
        {!compactText && (
          <Icon
            className={`h-3 w-3 shrink-0 ${highlight ? 'fill-amber-400 text-amber-400' : 'text-blue-600'}`}
            aria-hidden="true"
          />
        )}
        <span className="truncate" data-testid="coach-stat-label" title={label}>
          {label}
        </span>
      </p>
      <p className="mt-0.5 truncate font-display text-base font-extrabold tracking-normal text-slate-950">{value}</p>
      {sub && (
        <p className="truncate text-[11px] font-semibold text-slate-500" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

function CoachVerificationButton({ model, onViewProfile }) {
  const [open, setOpen] = useState(false);
  const verified = model.verified || model.contactVerified;

  if (verified) {
    return (
      <button
        type="button"
        disabled
        onClick={(event) => event.stopPropagation()}
        className="mt-2 inline-flex h-9 w-full max-w-[128px] cursor-default items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-extrabold text-emerald-700 shadow-sm shadow-emerald-900/5 disabled:opacity-100"
        aria-disabled="true"
        aria-label={`${model.displayName} is verified`}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Verified
      </button>
    );
  }

  const openDialog = (event) => {
    event.stopPropagation();
    setOpen(true);
  };

  const viewProfile = () => {
    setOpen(false);
    onViewProfile();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="mt-2 inline-flex h-9 w-full max-w-[128px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white text-xs font-extrabold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
        aria-label={`Open verification status for ${model.displayName}`}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Verify
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[460px] rounded-2xl border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-950/20"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <DialogTitle className="font-display text-2xl font-extrabold tracking-normal">
              Verification in progress
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              This coach profile has not finished public verification yet. LevelCoach keeps booking controls
              protected while verification is reviewed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-slate-700">
            Verified coach profiles show a green status after account, profile, legal, and safety checks are current.
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="rounded-xl border-slate-200 font-bold"
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={viewProfile}
              className="rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              View profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isDirectVideoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const pathname = new URL(raw).pathname.toLowerCase();
    return /\.(mp4|webm|ogg|mov|m4v)$/.test(pathname);
  } catch {
    return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(raw);
  }
}

function CoachIntroVideoFrame({ model, mode = 'preview' }) {
  const embedUrl = coachIntroEmbedUrl(model.introVideoUrl);
  const directVideo = isDirectVideoUrl(model.introVideoUrl);
  const isModal = mode === 'modal';
  const isPreview = mode === 'preview';

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
      {embedUrl ? (
        <iframe
          title={`${model.displayName} coach intro video`}
          src={embedUrl}
          className="h-full w-full"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : directVideo ? (
        <video
          className="h-full w-full object-cover"
          src={model.introVideoUrl}
          controls={isModal}
          muted={!isModal}
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] text-white">
          <Video className="h-9 w-9" aria-hidden="true" />
        </div>
      )}
      {isPreview && (
        <span className="pointer-events-none absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-blue-700 shadow-md ring-1 ring-blue-100">
          <PlayCircle className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function CoachIntroVideoDialog({ model, open, onOpenChange }) {
  if (!model.introVideoUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl rounded-3xl border-slate-200 bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/20 sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="px-1">
          <DialogTitle className="font-display text-2xl font-extrabold tracking-normal">
            {model.firstName}'s coach intro
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Preview the coach's communication style before opening the full profile.
          </DialogDescription>
        </DialogHeader>
        <CoachIntroVideoFrame model={model} mode="modal" />
      </DialogContent>
    </Dialog>
  );
}

function CoachIntroMobileButton({ model, onWatchIntro }) {
  if (!model.introVideoUrl) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onWatchIntro();
      }}
      className="mt-2 inline-flex h-9 w-full max-w-[128px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 xl:hidden"
    >
      <Video className="h-4 w-4 text-blue-600" aria-hidden="true" />
      Watch intro
    </button>
  );
}

function CoachIntroPreviewPanel({ model, open, transition, onWatchIntro }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key={`${model.id || model.displayName}-intro-preview`}
          initial={{ width: 0, opacity: 0, x: 14 }}
          animate={{ width: 260, opacity: 1, x: 0 }}
          exit={{ width: 0, opacity: 0, x: 14 }}
          transition={transition}
          className="hidden min-w-0 self-center overflow-hidden xl:block"
          aria-label={`${model.displayName} coach intro video preview`}
        >
          <div
            className="w-[260px] rounded-3xl border border-blue-100 bg-white p-2.5 shadow-xl shadow-blue-950/10"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
              Coach Intro Video
            </p>
            <CoachIntroVideoFrame model={model} mode="preview" />
            <div className="mt-3 space-y-2">
              <p className="text-sm font-bold leading-5 text-slate-900">
                Get a quick feel for this coach's style before booking.
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onWatchIntro();
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-600 px-4 text-sm font-extrabold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              >
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                Watch intro
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function CoachCardMotionShell({ hasIntroVideo, previewOpen, transition, children, ...props }) {
  if (!hasIntroVideo) {
    return (
      <div className="relative" data-has-intro-video="false" {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className="relative xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
      style={{ columnGap: 0 }}
      animate={{ columnGap: previewOpen ? 14 : 0 }}
      transition={transition}
      data-has-intro-video="true"
      {...props}
    >
      {children}
    </motion.div>
  );
}

function CoachCardMotionArticle({ hasIntroVideo, previewOpen, reduceMotion, transition, className, ...props }) {
  if (!hasIntroVideo) {
    return <article className={className} {...props} />;
  }

  return (
    <motion.article
      animate={{ x: previewOpen && !reduceMotion ? -14 : 0 }}
      transition={transition}
      className={className}
      {...props}
    />
  );
}

function shouldClosePreview(nextTarget, currentTarget) {
  return !nextTarget || !currentTarget.contains(nextTarget);
}

function useCoachIntroHover(hasIntroVideo) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const hoverRef = useRef(null);

  const openPreview = () => {
    if (hasIntroVideo) setPreviewOpen(true);
  };
  const closePreview = () => {
    if (hasIntroVideo) setPreviewOpen(false);
  };
  const closePreviewOnBlur = (event) => {
    if (hasIntroVideo && shouldClosePreview(event.relatedTarget, event.currentTarget)) {
      setPreviewOpen(false);
    }
  };
  const closePreviewOnExit = (event) => {
    if (hasIntroVideo && shouldClosePreview(event.relatedTarget, event.currentTarget)) {
      setPreviewOpen(false);
    }
  };

  useEffect(() => {
    if (!hasIntroVideo || !previewOpen) return undefined;

    const closeWhenPointerLeavesRow = (event) => {
      const element = hoverRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const buffer = 8;
      const outside =
        event.clientX < rect.left - buffer ||
        event.clientX > rect.right + buffer ||
        event.clientY < rect.top - buffer ||
        event.clientY > rect.bottom + buffer;

      if (outside) setPreviewOpen(false);
    };

    window.addEventListener('pointermove', closeWhenPointerLeavesRow, { passive: true });
    window.addEventListener('mousemove', closeWhenPointerLeavesRow, { passive: true });
    return () => {
      window.removeEventListener('pointermove', closeWhenPointerLeavesRow);
      window.removeEventListener('mousemove', closeWhenPointerLeavesRow);
    };
  }, [hasIntroVideo, previewOpen]);

  if (!hasIntroVideo) {
    return {
      previewOpen: false,
      hoverProps: {},
    };
  }

  return {
    previewOpen,
    hoverProps: {
      ref: hoverRef,
      onMouseEnter: openPreview,
      onMouseLeave: closePreview,
      onMouseOut: closePreviewOnExit,
      onPointerEnter: openPreview,
      onPointerLeave: closePreview,
      onPointerOut: closePreviewOnExit,
      onFocus: openPreview,
      onBlur: closePreviewOnBlur,
    },
  };
}

function useDesktopIntroPreview() {
  const [isDesktopPreview, setIsDesktopPreview] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const updatePreviewMode = () => setIsDesktopPreview(mediaQuery.matches);

    updatePreviewMode();
    mediaQuery.addEventListener?.('change', updatePreviewMode);
    return () => mediaQuery.removeEventListener?.('change', updatePreviewMode);
  }, []);

  return isDesktopPreview;
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
    ? allChips.slice(0, compact ? 2 : 3)
    : [model.primarySport].filter(Boolean);
  const hasOrg = !!model.organization?.name;
  const profileHref = hrefWithParams(model.profileHref, bookingParams);
  const bookHref = coachBookHref(model.raw, { intro: '1', ...bookingParams });
  const displayDistance = distanceMiles === null || distanceMiles === undefined ? null : Number(distanceMiles);
  const tierLabel = coachTierLabel(model);
  const benefits = coachBenefits(model);
  const hasIntroVideo = !!model.introVideoUrl;
  const reduceMotion = useReducedMotion();
  const [introDialogOpen, setIntroDialogOpen] = useState(false);
  const { previewOpen, hoverProps } = useCoachIntroHover(hasIntroVideo);
  const canShowIntroPreview = useDesktopIntroPreview();
  const desktopPreviewOpen = hasIntroVideo && canShowIntroPreview && previewOpen;
  const compactHoverStats = desktopPreviewOpen;
  const motionTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

  const openProfile = () => navigate(profileHref);
  const openIntroDialog = () => setIntroDialogOpen(true);
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
    <CoachCardMotionShell
      hasIntroVideo={hasIntroVideo}
      previewOpen={desktopPreviewOpen}
      transition={motionTransition}
      {...hoverProps}
    >
      <CoachCardMotionArticle
        hasIntroVideo={hasIntroVideo}
        previewOpen={desktopPreviewOpen}
        reduceMotion={reduceMotion}
        transition={motionTransition}
        data-testid="public-coach-card"
        role="link"
        tabIndex={0}
        onClick={openProfile}
        onKeyDown={onKeyDown}
        className={`group relative cursor-pointer rounded-3xl border border-slate-200 bg-white p-3 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:p-4 ${className}`}
        aria-label={`View ${model.displayName}'s full profile`}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-[132px_minmax(0,1fr)_minmax(208px,232px)]">
          <div className="flex flex-col items-center">
            <CoachCardPhoto model={model} compact={compact} />
            <SaveCoachButton
              coach={coach}
              showLabel
              className="mt-2 inline-flex h-9 w-full max-w-[128px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              iconClassName="h-4 w-4"
            />
            <CoachVerificationButton model={model} onViewProfile={openProfile} />
            <CoachIntroMobileButton model={model} onWatchIntro={openIntroDialog} />
          </div>

          <div className="min-w-0 pr-0 xl:pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-700 ring-1 ring-blue-100">
                <Trophy className="h-3 w-3" aria-hidden="true" />
                {tierLabel}
              </span>
              {hasOrg ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-700 ring-1 ring-blue-100">
                  <Building2 className="h-3 w-3" aria-hidden="true" />
                  {model.organization.name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-extrabold text-slate-600 ring-1 ring-slate-200">
                  Independent coach
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${
                  model.recentlyActive
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                    : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${model.recentlyActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
                {model.presenceLabel}
              </span>
              {coach?.is_demo && (
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-extrabold text-slate-600 ring-1 ring-slate-200">
                  Demo
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-extrabold leading-tight tracking-normal text-slate-950 transition group-hover:text-blue-700 sm:text-2xl">
                  {model.displayName}
                </h2>
                <p className="text-xs font-extrabold text-slate-600 sm:text-sm">{model.primarySport} Coach</p>
              </div>
              <button
                type="button"
                onClick={openProfileButton}
                className="hidden shrink-0 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 ring-1 ring-slate-200 transition hover:bg-blue-50 sm:inline-flex"
              >
                View full profile
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600 sm:text-sm">
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                {model.primarySport}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                {model.locationLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                {model.availability}
              </span>
              {displayDistance !== null && Number.isFinite(displayDistance) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-100">
                  {displayDistance < 10 ? displayDistance.toFixed(1) : Math.round(displayDistance)} mi away
                </span>
              )}
            </div>

            <p className="mt-2 line-clamp-1 max-w-3xl text-sm leading-5 text-slate-600 sm:line-clamp-2 xl:line-clamp-1">
              {model.headline}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleSpecs.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold capitalize text-blue-700 ring-1 ring-blue-100"
                >
                  {tag}
                </span>
              ))}
              {model.trainingFormats.slice(0, 1).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  {tag}
                </span>
              ))}
              {model.serviceRadiusLabel && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  {model.serviceRadiusLabel}
                </span>
              )}
            </div>

            <div
              className={`mt-3 grid grid-cols-2 gap-2 ${model.hasActiveAthleteStat ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
            >
              <CoachStat
                icon={Star}
                label="Rating"
                value={model.ratingLabel || 'New'}
                sub={model.reviewLabel}
                highlight={!!model.ratingLabel}
                compactText={compactHoverStats}
              />
              {model.hasActiveAthleteStat && (
                <CoachStat
                  icon={Users}
                  label="Athletes"
                  value={model.activeAthletes.toLocaleString()}
                  sub="active"
                  compactText={compactHoverStats}
                />
              )}
              <CoachStat
                icon={Trophy}
                label="Sessions"
                value={model.sessionsTaught > 0 ? model.sessionsTaught.toLocaleString() : 'New'}
                sub={model.sessionsTaught > 0 ? 'completed' : 'coach'}
                compactText={compactHoverStats}
              />
              <CoachStat
                icon={BadgeCheck}
                label="Verified"
                value={model.verified ? 'Yes' : 'Pending'}
                sub="public profile"
                compactText={compactHoverStats}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-3 shadow-inner shadow-blue-900/5 md:col-span-2 xl:col-span-1">
            <div className="flex h-full flex-col gap-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Starting at</p>
                  {model.rateLabel ? (
                    <p className="mt-1">
                      <span className="proof-number text-2xl text-slate-950">
                        {model.rateLabel.replace(/^From\s+/i, '')}
                      </span>
                      <span className="ml-1 text-xs font-semibold text-slate-500">/ session</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-slate-700">Shown at booking</p>
                  )}
                </div>
                <div className="text-left">
                  <p className="inline-flex items-center gap-1 font-display text-base font-extrabold text-slate-950">
                    <Star
                      className={`h-4 w-4 ${model.ratingLabel ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      aria-hidden="true"
                    />
                    {model.ratingLabel || 'New'}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">{model.reviewLabel}</p>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-blue-100 pt-2.5">
                {benefits.map((benefit) => (
                  <p key={benefit} className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    {benefit}
                  </p>
                ))}
              </div>

              {model.nextAvailable && (
                <p className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {model.nextAvailable}
                </p>
              )}

              <div className="mt-auto space-y-2 pt-1">
                <CoachActionPanel coach={coach} bookHref={bookHref} />
                <button
                  type="button"
                  onClick={openProfileButton}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:hidden xl:inline-flex"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  View full profile
                </button>
              </div>
            </div>
          </div>
        </div>
      </CoachCardMotionArticle>
      {hasIntroVideo && (
        <>
          <CoachIntroPreviewPanel
            model={model}
            open={desktopPreviewOpen}
            transition={motionTransition}
            onWatchIntro={openIntroDialog}
          />
          <CoachIntroVideoDialog
            model={model}
            open={introDialogOpen}
            onOpenChange={setIntroDialogOpen}
          />
        </>
      )}
    </CoachCardMotionShell>
  );
}
