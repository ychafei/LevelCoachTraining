import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rpc } from '@/lib/rpc';
import { pricingPackageRepo } from '@/api/repo';
import {
  formatAvailabilityTime,
  normalizePublicCoach,
  publicCoachDisplay,
} from '@/lib/publicCoach';
import { CoachAvatar } from '@/components/public/PublicCoachCard';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

export default function CoachDetail() {
  const { coachId } = useParams();
  const location = useLocation();
  const [coach, setCoach] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [coachRes, packageRows] = await Promise.all([
          rpc.invoke('getPublicCoaches', {}).catch((err) => {
            console.warn('Public coaches unavailable.', err);
            return null;
          }),
          pricingPackageRepo.filter({ is_visible: true }, 'display_order').catch(() => []),
        ]);
        if (cancelled) return;
        const liveCoaches = (coachRes?.data?.coaches || coachRes?.coaches || []).map(normalizePublicCoach);
        const match = liveCoaches.find((item) => item.id === coachId);
        if (!match) {
          setError(true);
        } else {
          setCoach(match);
          setPackages(packageRows);
        }
      } catch (err) {
        console.error('CoachDetail load failed', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-slate-50 px-4 py-24 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Loading coach profile...</p>
      </div>
    );
  }

  if (error || !coach) {
    return <Navigate to="/coaches" replace />;
  }

  const model = publicCoachDisplay(coach, { packages });
  const bookIntroHref = mergeSearch(model.bookIntroHref, location.search);
  const enabledDays = DAYS.filter((day) => coach.availability?.[day]?.enabled);
  const details = [
    { label: 'Primary sport', value: model.primarySport, icon: Trophy },
    { label: 'Training area', value: model.locationLabel, icon: MapPin },
    { label: 'Service radius', value: [model.serviceRadiusLabel, model.serviceTypeLabel].filter(Boolean).join(' · '), icon: Target },
    { label: 'Availability', value: model.availability, icon: CalendarDays },
    { label: 'Reviews', value: model.ratingLabel ? `${model.ratingLabel} · ${model.reviewLabel}` : model.reviewLabel, icon: Star },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
        <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
          <Link to="/coaches" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to coach search
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <CoachAvatar coach={coach} size="xl" className="sm:mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {model.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Verified coach
                      </span>
                    )}
                    {coach.is_demo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200">
                        Demo profile
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                      <MapPin className="h-3.5 w-3.5" />
                      {model.countyLabel || model.locationLabel}
                    </span>
                  </div>

                  <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl">
                    {model.displayName}
                  </h1>
                  <p className="mt-2 text-base font-semibold text-slate-700">{model.organizationName}</p>
                  <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">{model.headline}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[model.primarySport, ...model.specializations, ...model.trainingFormats].filter(Boolean).slice(0, 7).map((tag) => (
                      <span key={tag} className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Book intro</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-950">Start with {model.firstName}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Preview availability, add optional notes, then create an account to finish booking safely.
              </p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Next available</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-blue-700">
                  <Clock className="h-4 w-4" />
                  {model.nextAvailable || 'Request available times'}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-11 rounded-lg border-blue-200 bg-white text-sm font-bold text-blue-700 hover:bg-blue-50">
                  <Link to="/coaches">Compare</Link>
                </Button>
                <Button asChild className="h-11 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700">
                  <Link to={bookIntroHref}>
                    Book Intro
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1480px] grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {details.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{value || 'Coming soon'}</p>
              </div>
            ))}
          </div>

          <InfoSection title={`About ${model.firstName}`} icon={Users}>
            {model.bio ? (
              <p className="whitespace-pre-line text-base leading-8 text-slate-600">{model.bio}</p>
            ) : (
              <p className="text-base leading-8 text-slate-600">
                This coach is still finishing their public bio. Their profile already includes location, availability, and specialties provided through LevelCoach.
              </p>
            )}
          </InfoSection>

          <InfoSection title="Training Focus" icon={Target}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FocusList title="Specialties" items={model.specializations} fallback={`${model.primarySport} training`} />
              <FocusList title="Training formats" items={model.trainingFormats} fallback="1-on-1 and small group sessions" />
              <FocusList title="Age groups" items={model.ageGroups} fallback="Ask during booking" />
              <FocusList
                title="Service area"
                items={[
                  model.locationLabel,
                  model.serviceVenue,
                  model.serviceRadiusLabel,
                  ...model.servedAreas,
                ].filter(Boolean)}
                fallback="Location shared during booking"
              />
            </div>
          </InfoSection>

          <InfoSection title="Weekly Availability" icon={CalendarDays}>
            {enabledDays.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DAYS.map((day) => {
                  const slot = coach.availability?.[day];
                  const enabled = !!slot?.enabled;
                  return (
                    <div key={day} className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
                      enabled ? 'border-blue-100 bg-blue-50/70' : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}>
                      <span className="text-sm font-bold">{day}</span>
                      <span className="text-xs font-semibold">
                        {enabled ? `${formatAvailabilityTime(slot.start)} - ${formatAvailabilityTime(slot.end)}` : 'Unavailable'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">Availability is coming soon. You can still open the intro flow to request times.</p>
            )}
          </InfoSection>
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Why LevelCoach</p>
            <div className="mt-4 space-y-4">
              {[
                [ShieldCheck, 'Verified profile data', 'Coach cards use information saved in the coach profile.'],
                [MessageCircle, 'Safe messaging', 'Athlete and coach communication stays inside LevelCoach.'],
                [CheckCircle2, 'Booking continuity', 'Logged-out athletes can preserve intent before account creation.'],
              ].map(([Icon, title, body]) => (
                <div key={title} className="flex gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <p className="font-display text-xl font-bold text-slate-950">Ready to see times?</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Open the intro flow for {model.firstName}, preview the schedule, then sign in or create an athlete account to confirm.
            </p>
            <Button asChild className="mt-4 w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700">
              <Link to={model.bookIntroHref}>Book Intro</Link>
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
          <Icon className="h-5 w-5" />
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
