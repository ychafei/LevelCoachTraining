import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Info,
  LoaderCircle,
  MapPin,
  Search,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { coachRepo, sessionRepo } from '@/api/repo';
import { CoachAvatar } from '@/components/public/PublicCoachCard';
import { callFn } from '@/lib/rpc';
import { coachDistanceMiles, resolvePlace } from '@/lib/metroDetroitPlaces';
import {
  coachBookHref,
  matchesCoachSearch,
  normalizePublicCoach,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import {
  creditRemainingCents,
  creditRemainingSessionCount,
  formatCreditMoney,
} from '@/hooks/useCreditBalance';

const MAX_RECENT_COACHES = 5;
const AREA_RADIUS_MILES = 35;

function intCents(value) {
  const cents = Number(value);
  return Number.isInteger(cents) && cents > 0 ? cents : 0;
}

function creditCoachId(credit) {
  return credit?.coach_id || credit?.original_coach_id || credit?.originating_coach_id || '';
}

function firstText(obj, keys) {
  for (const key of keys) {
    const value = typeof obj?.[key] === 'string' ? obj[key].trim() : '';
    if (value) return value;
  }
  return '';
}

function clientLocationText(user) {
  return firstText(user, [
    'location_label',
    'training_location_label',
    'service_area_label',
    'city',
    'location',
  ]);
}

function creditUnitCents(credit) {
  const direct = intCents(credit?.per_session_base_price_cents);
  if (direct) return direct;
  const sessions = creditRemainingSessionCount(credit);
  const remaining = creditRemainingCents(credit);
  return sessions > 0 && remaining > 0 ? Math.max(1, Math.round(remaining / sessions)) : 0;
}

function sessionSortMs(session) {
  const candidates = [
    session?.created_date,
    session?.updated_date,
    session?.starts_at_utc,
    session?.date && session?.start_time ? `${session.date}T${session.start_time}` : '',
    session?.date,
  ];
  for (const candidate of candidates) {
    const ms = Date.parse(String(candidate || ''));
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function creditSortMs(credit) {
  const ms = Date.parse(String(credit?.created_date || credit?.updated_date || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function sessionPriceCents(session, credit) {
  return intCents(session?.price_snapshot_cents)
    || intCents(session?.session_price_cents)
    || intCents(session?.reserved_amount_cents)
    || (Number(session?.total_price) > 0 ? Math.round(Number(session.total_price) * 100) : 0)
    || creditUnitCents(credit);
}

function relativeDate(value) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) return 'recently';
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 'today';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms));
}

function creditApplyLabel({ priceCents, credit, credits, remainingCents, remainingSessions }) {
  if (!remainingCents || remainingCents <= 0) return 'No credits available';

  const unit = creditUnitCents(credit)
    || credits.map(creditUnitCents).find((value) => value > 0)
    || (remainingSessions > 0 ? Math.round(remainingCents / remainingSessions) : 0);

  if (!priceCents || !unit) return 'Credits apply';

  if (priceCents > remainingCents) {
    const count = Math.max(1, remainingSessions || 1);
    return `${count} credit${count === 1 ? '' : 's'} + top-up`;
  }

  const low = Math.max(1, Math.floor(priceCents / unit));
  const high = Math.max(1, Math.ceil(priceCents / unit));
  if (low === high) return `${high} credit${high === 1 ? ' applies' : 's apply'}`;
  return `${low}-${high} credits apply`;
}

function bookWithCreditHref(coachId, credit) {
  if (!coachId) return '/coaches';
  const params = { use_credit: '1' };
  if (credit?.id) {
    params.credit_id = credit.id;
    params.schedule = '1';
  }
  return coachBookHref({ id: coachId }, params);
}

async function loadCreditModalRows(credits) {
  const [sessions, publicCoachResult] = await Promise.all([
    sessionRepo.list('-created_date').catch(() => []),
    callFn('getPublicCoaches', {}).catch(() => ({ coaches: [] })),
  ]);
  const creditCoachIds = credits.map(creditCoachId).filter(Boolean);
  const sessionCoachIds = sessions.map((session) => session.coach_id).filter(Boolean);
  const coachIds = [...new Set([...sessionCoachIds, ...creditCoachIds])].slice(0, 12);
  const coachRows = await Promise.all(
    coachIds.map((id) => coachRepo.get(id).catch(() => null)),
  );
  const coachesById = Object.fromEntries(
    coachRows.filter(Boolean).map((coach) => [coach.id, coach]),
  );
  const marketplaceCoaches = (publicCoachResult?.coaches || []).map(normalizePublicCoach).filter(Boolean);
  return { sessions, coachesById, marketplaceCoaches };
}

function areaCoachScore(coach, place) {
  const model = publicCoachDisplay(coach, { searchPlace: place });
  const distance = place ? coachDistanceMiles(coach, place) : null;
  let score = 0;
  if (distance !== null) score += Math.max(0, 200 - distance * 4);
  if (model.availableNow) score += 35;
  if (model.recentlyActive) score += 20;
  if (model.hasSessionStat) score += Math.min(30, model.sessionsTaught / 10);
  if (model.hasActiveAthleteStat) score += Math.min(20, model.activeAthletes * 2);
  const rating = Number(model.ratingLabel);
  if (Number.isFinite(rating)) score += rating * 6;
  return score;
}

function areaCoachRows({ marketplaceCoaches, credits, remainingCents, remainingSessions, user }) {
  const locationText = clientLocationText(user);
  const place = resolvePlace(locationText);
  const inArea = locationText
    ? marketplaceCoaches.filter((coach) => matchesCoachSearch(coach, {
      location: locationText,
      place,
      radius: AREA_RADIUS_MILES,
    }))
    : marketplaceCoaches;
  const pool = inArea.length ? inArea : marketplaceCoaches;

  return pool
    .map((coach) => {
      const model = publicCoachDisplay(coach, { searchPlace: place });
      const priceCents = intCents(coach?.price_hint_cents);
      const distanceLabel = model.distanceMiles !== null && model.distanceMiles !== undefined
        ? `${Math.round(model.distanceMiles)} mi away`
        : (place?.label ? `Near ${place.label}` : 'Suggested coach');
      return {
        coach,
        coachId: coach.id,
        credit: credits[0] || null,
        lastLabel: distanceLabel,
        priceCents,
        sourceMs: 0,
        mode: 'area',
        score: areaCoachScore(coach, place),
        creditsApply: creditApplyLabel({
          priceCents,
          credit: credits[0] || null,
          credits,
          remainingCents,
          remainingSessions,
        }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECENT_COACHES);
}

function buildRows({ sessions, coachesById, marketplaceCoaches, credits, remainingCents, remainingSessions, user }) {
  const rows = new Map();
  const creditsByCoach = new Map();
  for (const credit of credits) {
    const coachId = creditCoachId(credit);
    if (!coachId || !creditRemainingCents(credit)) continue;
    if (!creditsByCoach.has(coachId)) creditsByCoach.set(coachId, credit);
  }

  const sortedSessions = [...sessions]
    .filter((session) => session?.coach_id && coachesById[session.coach_id])
    .sort((a, b) => sessionSortMs(b) - sessionSortMs(a));

  for (const session of sortedSessions) {
    if (rows.has(session.coach_id)) continue;
    const coach = coachesById[session.coach_id];
    const credit = creditsByCoach.get(session.coach_id) || credits[0] || null;
    const priceCents = sessionPriceCents(session, credit);
    rows.set(session.coach_id, {
      coach,
      coachId: session.coach_id,
      credit,
      lastLabel: `Last booked ${relativeDate(session.created_date || session.starts_at_utc || session.date)}`,
      priceCents,
      sourceMs: sessionSortMs(session),
    });
  }

  const sortedCredits = [...credits]
    .filter((credit) => creditCoachId(credit) && coachesById[creditCoachId(credit)])
    .sort((a, b) => creditSortMs(b) - creditSortMs(a));

  for (const credit of sortedCredits) {
    const coachId = creditCoachId(credit);
    if (rows.has(coachId)) continue;
    rows.set(coachId, {
      coach: coachesById[coachId],
      coachId,
      credit,
      lastLabel: `Credit added ${relativeDate(credit.created_date)}`,
      priceCents: creditUnitCents(credit),
      sourceMs: creditSortMs(credit),
    });
  }

  const recentRows = [...rows.values()]
    .sort((a, b) => b.sourceMs - a.sourceMs)
    .slice(0, MAX_RECENT_COACHES)
    .map((row) => ({
      ...row,
      mode: 'recent',
      creditsApply: creditApplyLabel({
        priceCents: row.priceCents,
        credit: row.credit,
        credits,
        remainingCents,
        remainingSessions,
      }),
    }));
  if (recentRows.length) return { mode: 'recent', rows: recentRows };

  return {
    mode: 'area',
    rows: areaCoachRows({
      marketplaceCoaches,
      credits,
      remainingCents,
      remainingSessions,
      user,
    }),
  };
}

function BrowseCoachesCallout({ onBrowseCoaches }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100">
            <Search className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-extrabold text-slate-950">Want a different coach?</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Your credit value can be applied toward another published coach.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-xl border-blue-200 bg-white font-extrabold text-blue-700 hover:bg-blue-50">
          <Link to="/coaches" onClick={onBrowseCoaches}>Browse coaches</Link>
        </Button>
      </div>
    </div>
  );
}

function RecentCoachRow({ row }) {
  const model = publicCoachDisplay(row.coach);
  const priceLabel = row.priceCents
    ? `${formatCreditMoney(row.priceCents)}/session`
    : (model.rateLabel ? `${model.rateLabel.replace(/^From\s+/i, '')}/session` : 'Price shown at booking');
  const MetaIcon = row.mode === 'area' ? MapPin : CalendarDays;

  return (
    <div className="grid gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <CoachAvatar coach={row.coach} size="xl" className="mt-0.5" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold tracking-normal text-slate-950">
            {model.displayName}
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-600">
            {model.primarySport} Coach · {model.locationLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MetaIcon className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              {row.lastLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              {model.serviceTypeLabel || 'Training details in profile'}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:min-w-[250px] sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="font-display text-lg font-extrabold tracking-normal text-slate-950">{priceLabel}</p>
          <p className="text-xs font-extrabold text-blue-700">{row.creditsApply}</p>
        </div>
        <Button asChild className="h-10 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700">
          <Link to={bookWithCreditHref(row.coachId, row.credit)}>Book with credit</Link>
        </Button>
      </div>
    </div>
  );
}

export default function CreditsModal({ open, onOpenChange, user, creditBalance }) {
  const credits = creditBalance?.credits || [];
  const remainingCents = creditBalance?.remainingCents || 0;
  const remainingSessions = creditBalance?.remainingSessions || 0;
  const creditWord = remainingSessions === 1 ? 'credit' : 'credits';

  const query = useQuery({
    queryKey: ['creditsModalRecentCoaches', user?.id, credits.map((credit) => credit.id).join('|')],
    enabled: open && !!user?.id,
    queryFn: () => loadCreditModalRows(credits),
    staleTime: 30000,
  });

  const result = useMemo(
    () => buildRows({
      sessions: query.data?.sessions || [],
      coachesById: query.data?.coachesById || {},
      marketplaceCoaches: query.data?.marketplaceCoaches || [],
      credits,
      remainingCents,
      remainingSessions,
      user,
    }),
    [credits, query.data?.coachesById, query.data?.marketplaceCoaches, query.data?.sessions, remainingCents, remainingSessions, user],
  );
  const rows = result.rows;
  const showingAreaFallback = result.mode === 'area' && rows.length > 0;
  const subtitle = showingAreaFallback
    ? `You have ${remainingSessions} ${creditWord} available. Here are published coaches near your area.`
    : `You have ${remainingSessions} ${creditWord} available. Recent coaches are shown from most recent to least recent.`;
  const onBrowseCoaches = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/35 backdrop-blur-[2px]"
        className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-3xl border-slate-200 bg-white p-0 text-slate-950 shadow-2xl shadow-slate-950/20"
      >
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_62%,#f8fbff_100%)] px-6 py-6">
          <DialogHeader>
            <div className="flex items-start gap-3 pr-8">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <WalletCards className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <DialogTitle className="font-display text-2xl font-extrabold tracking-normal text-slate-950">
                  Use Your Credits
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600">
                  {subtitle}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100">
                <Info className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-sm leading-6 text-blue-950">
                <strong>Credits are prepaid session value.</strong> If you switch coaches, your remaining credit value can be applied toward another coach's session rate.
              </p>
            </div>
          </div>

          <BrowseCoachesCallout onBrowseCoaches={onBrowseCoaches} />

          <div className="rounded-3xl border border-slate-200 bg-white px-4 shadow-sm">
            {query.isLoading || creditBalance?.loading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-sm font-bold text-slate-600">
                <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
                Loading recent coaches...
              </div>
            ) : rows.length > 0 ? (
              rows.map((row) => <RecentCoachRow key={row.coachId} row={row} />)
            ) : (
              <div className="py-10 text-center">
                <p className="font-display text-xl font-extrabold tracking-normal text-slate-950">No coaches available yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  We could not load recent or nearby published coaches right now. Browse the marketplace to keep searching.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
