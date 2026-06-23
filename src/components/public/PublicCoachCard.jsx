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
  Play,
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
import {
  coachBookHref,
  coachIntroEmbedUrl,
  formatAvailabilityTime,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import {
  AuthGateDialog,
  BookCoachButton,
  CoachActionPanel,
  MessageCoachButton,
  SaveCoachButton,
} from '@/components/public/CoachActionControls';
import { useAuth } from '@/lib/AuthContext';
import { accountActionLock } from '@/lib/accountReadiness';

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
  const sizeClass = compact ? 'h-20 w-20' : 'h-24 w-24 sm:h-[116px] sm:w-[116px]';

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
  const [base, existing = ''] = String(path).split('?');
  const search = new URLSearchParams(existing);
  clean.forEach(([key, value]) => search.set(key, value));
  return `${base}?${search.toString()}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function coachDateParts(coach, date = new Date()) {
  const timezone = String(coach?.timezone || '').trim();
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const hour = Number(byType.hour);
      const minute = Number(byType.minute);
      if (byType.weekday && byType.year && byType.month && byType.day) {
        return {
          weekday: byType.weekday,
          date: `${byType.year}-${byType.month}-${byType.day}`,
          minutes: Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0,
        };
      }
    } catch {
      // Fall back to browser-local time for legacy or malformed timezones.
    }
  }
  return {
    weekday: WEEKDAYS[date.getDay()],
    date: localDateString(date),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(total) {
  const minutes = Math.max(0, total);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function nextCoachOpeningSlots(coach, count = 3, durationMinutes = 60) {
  const availability = coach?.availability || {};
  const now = new Date();
  const slots = [];

  for (let offset = 0; offset <= 21 && slots.length < count; offset += 1) {
    const date = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = coachDateParts(coach, date);
    const dayWindow = availability?.[parts.weekday];
    if (!dayWindow?.enabled || !dayWindow.start || !dayWindow.end) continue;

    const start = timeToMinutes(dayWindow.start);
    const end = timeToMinutes(dayWindow.end);
    if (start === null || end === null || end <= start) continue;

    for (let minute = start; minute + durationMinutes <= end && slots.length < count; minute += durationMinutes) {
      if (offset === 0 && minute <= parts.minutes) continue;
      const dayLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : parts.weekday.slice(0, 3);
      const time = minutesToTime(minute);
      slots.push({
        date: parts.date,
        time,
        label: `${dayLabel} ${formatAvailabilityTime(time)}`,
        shortLabel: formatAvailabilityTime(time),
      });
    }
  }

  return slots;
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
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
      <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-500">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${highlight ? 'fill-amber-400 text-amber-400' : 'text-blue-600'}`}
          aria-hidden="true"
        />
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
        className="mt-1.5 inline-flex h-8 w-full max-w-[116px] cursor-default items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-extrabold text-emerald-700 shadow-sm shadow-emerald-900/5 disabled:opacity-100"
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
        className="mt-1.5 inline-flex h-8 w-full max-w-[116px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white text-xs font-extrabold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
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

function youtubeVideoId(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return parts[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      return parsed.searchParams.get('v')
        || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '')
        || '';
    }
  } catch {
    return '';
  }
  return '';
}

function youtubePosterUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : '';
}

function embedUrlWithAutoplay(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    parsed.searchParams.set('autoplay', '1');
    if (host.includes('youtube')) {
      parsed.searchParams.set('rel', '0');
      parsed.searchParams.set('modestbranding', '1');
    }
    if (host === 'player.vimeo.com') {
      parsed.searchParams.set('title', '0');
      parsed.searchParams.set('byline', '0');
      parsed.searchParams.set('portrait', '0');
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function CoachIntroPreviewMedia({ model, embedUrl, directVideo, posterUrl }) {
  if (posterUrl) {
    return (
      <img
        src={posterUrl}
        alt=""
        className="h-full w-full object-cover object-center"
        loading="lazy"
        aria-hidden="true"
      />
    );
  }

  if (directVideo) {
    return (
      <video
        className="h-full w-full object-cover"
        src={model.introVideoUrl}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    );
  }

  if (embedUrl) {
    return (
      <iframe
        title={`${model.displayName} coach intro video preview`}
        src={embedUrl}
        className="pointer-events-none h-full w-full scale-[1.01]"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        tabIndex={-1}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="grid h-full w-full place-items-center bg-slate-950 text-white">
      <Video className="h-9 w-9" aria-hidden="true" />
    </div>
  );
}

function CoachIntroVideoFrame({ model, mode = 'preview', onPlay }) {
  const embedUrl = coachIntroEmbedUrl(model.introVideoUrl);
  const directVideo = isDirectVideoUrl(model.introVideoUrl);
  const isModal = mode === 'modal';
  const isPreview = mode === 'preview';
  const posterUrl = youtubePosterUrl(model.introVideoUrl);
  const modalEmbedUrl = isModal ? embedUrlWithAutoplay(embedUrl) : embedUrl;

  if (isPreview) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="group relative block aspect-video w-full overflow-visible rounded-[10px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2"
        aria-label={`Play ${model.displayName}'s coach intro video`}
      >
        <span className="relative block h-full w-full overflow-hidden rounded-[9px] border-2 border-slate-950 bg-slate-950 shadow-sm">
          <CoachIntroPreviewMedia
            model={model}
            embedUrl={embedUrl}
            directVideo={directVideo}
            posterUrl={posterUrl}
          />
          <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/5" aria-hidden="true" />
        </span>
        <span
          className="pointer-events-none absolute right-3 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full border-2 border-slate-950 bg-blue-600 text-white shadow-lg shadow-blue-950/20 transition duration-200 group-hover:scale-105 group-hover:bg-blue-700"
          aria-hidden="true"
        >
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </button>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
      {modalEmbedUrl ? (
        <iframe
          title={`${model.displayName} coach intro video`}
          src={modalEmbedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : directVideo ? (
        <video
          className="h-full w-full object-cover"
          src={model.introVideoUrl}
          controls={isModal}
          autoPlay={isModal}
          muted={!isModal}
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] text-white">
          <Video className="h-9 w-9" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function CoachIntroVideoDialog({ model, open, onOpenChange }) {
  if (!model.introVideoUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/60"
        className="top-1/2 w-[calc(100vw-32px)] max-w-[970px] gap-0 border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none [&>button]:right-2 [&>button]:top-[-3rem] [&>button]:grid [&>button]:h-11 [&>button]:w-11 [&>button]:place-items-center [&>button]:rounded-full [&>button]:bg-white [&>button]:text-slate-400 [&>button]:opacity-100 [&>button]:shadow-xl [&>button]:shadow-slate-950/20 [&>button]:ring-0 [&>button]:ring-offset-0 hover:[&>button]:text-slate-600 sm:[&>button]:-right-5 sm:[&>button]:-top-5 [&>button_svg]:h-6 [&>button_svg]:w-6"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">{model.firstName}'s coach intro</DialogTitle>
        <DialogDescription className="sr-only">
          Preview the coach's communication style before opening the full profile.
        </DialogDescription>
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
      className="mt-1.5 inline-flex h-8 w-full max-w-[116px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 xl:hidden"
    >
      <Video className="h-4 w-4 text-blue-600" aria-hidden="true" />
      Watch intro
    </button>
  );
}

function CoachIntroPreviewPanel({ model, open, transition, onWatchIntro }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {open && (
        <motion.aside
          key={`${model.id || model.displayName}-intro-preview`}
          initial={{ opacity: 0, x: -18, y: 18, scale: 0.94, rotateY: -8, filter: 'blur(10px)' }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -14, y: 12, scale: 0.96, rotateY: -5, filter: 'blur(8px)' }}
          transition={transition}
          style={{ transformPerspective: 900, transformOrigin: 'left top' }}
          className="absolute left-[calc(100%+16px)] top-0 z-30 hidden w-[360px] min-w-0 overflow-visible 2xl:block"
          aria-label={`${model.displayName} coach intro video preview`}
        >
          <div
            className="rounded-2xl border border-blue-100 bg-white p-3 shadow-2xl shadow-blue-950/15 ring-1 ring-white/80"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-2 px-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
              Coach intro video
            </p>
            <CoachIntroVideoFrame model={model} mode="preview" onPlay={onWatchIntro} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function CoachCardMotionShell({ hasIntroVideo, children, ...props }) {
  if (!hasIntroVideo) {
    return (
      <div className="relative" data-has-intro-video="false" {...props}>
        {children}
      </div>
    );
  }

  return (
    <div className="relative overflow-visible" data-has-intro-video="true" {...props}>
      {children}
    </div>
  );
}

function CoachCardMotionArticle({ hasIntroVideo, transition, className, ...props }) {
  if (!hasIntroVideo) {
    return <article className={className} {...props} />;
  }

  return (
    <motion.article
      animate={{ x: 0 }}
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
      const leftBuffer = 12;
      const rightBuffer = previewOpen ? 430 : 12;
      const verticalBuffer = previewOpen ? 56 : 12;
      const outside =
        event.clientX < rect.left - leftBuffer ||
        event.clientX > rect.right + rightBuffer ||
        event.clientY < rect.top - verticalBuffer ||
        event.clientY > rect.bottom + verticalBuffer;

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
    return window.matchMedia('(min-width: 1536px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(min-width: 1536px)');
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
  onIntroPreviewChange = null,
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
  const sportBookingParams = model.sportKey ? { sport: model.sportKey } : {};
  const bookHref = coachBookHref(model.raw, { intro: '1', ...sportBookingParams, ...bookingParams });
  const { isAuthenticated, user } = useAuth();
  const displayDistance = distanceMiles === null || distanceMiles === undefined ? null : Number(distanceMiles);
  const tierLabel = coachTierLabel(model);
  const benefits = coachBenefits(model);
  const openingSlots = nextCoachOpeningSlots(model.raw, 3);
  const hasIntroVideo = !!model.introVideoUrl;
  const reduceMotion = useReducedMotion();
  const [introDialogOpen, setIntroDialogOpen] = useState(false);
  const [timeGateOpen, setTimeGateOpen] = useState(false);
  const [timeGateNextPath, setTimeGateNextPath] = useState(bookHref);
  const { previewOpen, hoverProps } = useCoachIntroHover(hasIntroVideo);
  const canShowIntroPreview = useDesktopIntroPreview();
  const desktopPreviewOpen = hasIntroVideo && canShowIntroPreview && previewOpen;
  const introPreviewSignalId = model.publicProfileId || model.id || coach?.id || model.displayName;
  const motionTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 260, damping: 24, mass: 0.72 };

  useEffect(() => {
    if (!hasIntroVideo || !onIntroPreviewChange || !introPreviewSignalId) return undefined;
    onIntroPreviewChange(introPreviewSignalId, desktopPreviewOpen);
    return () => onIntroPreviewChange(introPreviewSignalId, false);
  }, [desktopPreviewOpen, hasIntroVideo, introPreviewSignalId, onIntroPreviewChange]);

  const openProfile = () => navigate(profileHref);
  const openIntroDialog = () => setIntroDialogOpen(true);
  const openProfileButton = (event) => {
    event.stopPropagation();
    navigate(profileHref);
  };
  const openTimeSlot = (slot, event) => {
    event.stopPropagation();
    const slotHref = hrefWithParams(bookHref, {
      schedule: '1',
      selected_date: slot.date,
      selected_time: slot.time,
    });
    const lock = isAuthenticated ? accountActionLock(user) : null;
    setTimeGateNextPath(slotHref);
    if (!isAuthenticated || lock) {
      setTimeGateOpen(true);
      return;
    }
    navigate(slotHref);
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
      {...hoverProps}
    >
      <CoachCardMotionArticle
        hasIntroVideo={hasIntroVideo}
        transition={motionTransition}
        data-testid="public-coach-card"
        role="link"
        tabIndex={0}
        onClick={openProfile}
        onKeyDown={onKeyDown}
        className={`group relative cursor-pointer rounded-3xl border border-slate-200 bg-white p-2.5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:p-3 ${className}`}
        aria-label={`View ${model.displayName}'s full profile`}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[116px_minmax(0,1fr)] xl:grid-cols-[116px_minmax(0,1fr)_minmax(190px,214px)]">
          <div className="flex flex-col items-center">
            <CoachCardPhoto model={model} compact={compact} />
            <SaveCoachButton
              coach={coach}
              showLabel
              className="mt-1.5 inline-flex h-8 w-full max-w-[116px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              iconClassName="h-4 w-4"
            />
            <CoachVerificationButton model={model} onViewProfile={openProfile} />
            <MessageCoachButton
              coach={coach}
              showLabel
              className="mt-1.5 inline-flex h-8 w-full max-w-[116px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
              iconClassName="h-4 w-4 text-blue-600"
            />
            <CoachIntroMobileButton model={model} onWatchIntro={openIntroDialog} />
          </div>

          <div className="min-w-0 pr-0 xl:pr-3">
            <div className="flex flex-wrap items-center gap-1.5">
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
              {model.recentlyActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {model.presenceLabel}
                </span>
              )}
              {coach?.is_demo && (
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-extrabold text-slate-600 ring-1 ring-slate-200">
                  Demo
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-extrabold leading-tight tracking-normal text-slate-950 transition group-hover:text-blue-700 sm:text-[1.35rem]">
                  {model.displayName}
                </h2>
                <p className="text-xs font-extrabold text-slate-600 sm:text-sm">{model.primarySport} Coach</p>
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex 2xl:-mt-7">
                <BookCoachButton
                  coach={coach}
                  bookHref={bookHref}
                  className="hidden h-8 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-md shadow-blue-600/15 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 2xl:inline-flex"
                  iconClassName="h-4 w-4"
                />
                <button
                  type="button"
                  onClick={openProfileButton}
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                >
                  View full profile
                </button>
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-600 sm:text-sm">
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

            <p className="mt-1.5 line-clamp-1 max-w-3xl text-sm leading-5 text-slate-600">
              {model.headline}
            </p>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
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

            <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <CoachStat
                icon={Star}
                label="Rating"
                value={model.ratingLabel || 'New'}
                sub={model.reviewLabel}
                highlight={!!model.ratingLabel}
              />
              <CoachStat
                icon={Users}
                label="Athletes"
                value={model.activeAthletes > 0 ? model.activeAthletes.toLocaleString() : '0'}
                sub="active"
              />
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

          <div className="rounded-2xl border border-blue-100 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-2.5 shadow-inner shadow-blue-900/5 md:col-span-2 xl:col-span-1">
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Starting at</p>
                  {model.rateLabel ? (
                    <p className="mt-0.5">
                      <span className="proof-number text-xl text-slate-950">
                        {model.rateLabel.replace(/^From\s+/i, '')}
                      </span>
                      <span className="ml-1 text-xs font-semibold text-slate-500">/ session</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm font-bold text-slate-700">Shown at booking</p>
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

              <div className="space-y-1 border-t border-blue-100 pt-2">
                {benefits.map((benefit) => (
                  <p key={benefit} className="flex items-center gap-1.5 text-[11px] font-bold leading-4 text-slate-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    {benefit}
                  </p>
                ))}
              </div>

              {model.nextAvailable && (
                <p className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {model.nextAvailable}
                </p>
              )}

              {openingSlots.length > 0 && (
                <div className="rounded-xl border border-blue-100 bg-white/80 p-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">
                    Next times
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-1">
                    {openingSlots.map((slot) => (
                      <button
                        key={`${slot.date}-${slot.time}`}
                        type="button"
                        onClick={(event) => openTimeSlot(slot, event)}
                        className="inline-flex h-8 min-w-0 items-center justify-center whitespace-nowrap rounded-lg border border-blue-100 bg-blue-50 px-1 text-center text-[10px] font-extrabold leading-none text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        title={slot.label}
                      >
                        {slot.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-0.5 2xl:hidden">
                <CoachActionPanel coach={coach} bookHref={bookHref} />
                <button
                  type="button"
                  onClick={openProfileButton}
                  className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:hidden xl:inline-flex"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  View full profile
                </button>
              </div>
            </div>
          </div>
        </div>
      </CoachCardMotionArticle>
      <>
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
        <AuthGateDialog
          open={timeGateOpen}
          onOpenChange={setTimeGateOpen}
          coach={coach}
          intent="book"
          nextPath={timeGateNextPath}
          lock={isAuthenticated ? accountActionLock(user) : null}
        />
      </>
    </CoachCardMotionShell>
  );
}
