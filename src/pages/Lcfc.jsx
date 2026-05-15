import React, { useEffect, useState } from 'react';
import {
  Calendar, Quote, ArrowRight, Users, CalendarDays, Newspaper, ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { playerRepo, teamMatchRepo, lcfcStaffRepo, lcfcNewsRepo } from '@/api/repo';
import { loadLcfcSettings, toLines } from '@/lib/lcfcSettings';

// Try an ordered/filtered load, degrade to a plain list, then to []. Keeps
// /lcfc rendering even before the new schema/fields exist in Appwrite.
async function safeLoad(repo, where, sort, fallbackSort) {
  try {
    return await repo.filter(where, sort);
  } catch {
    try {
      return await repo.list(fallbackSort);
    } catch {
      return [];
    }
  }
}

export default function Lcfc() {
  const [s, setS] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [staff, setStaff] = useState([]);
  const [news, setNews] = useState([]);

  useEffect(() => {
    loadLcfcSettings().then(setS);
    safeLoad(playerRepo, { is_active: true }, 'display_order', 'jersey_number').then(setPlayers);
    safeLoad(teamMatchRepo, { is_active: true }, 'display_order', 'match_date').then(setMatches);
    safeLoad(lcfcStaffRepo, { is_active: true }, 'display_order', 'display_order').then(setStaff);
    safeLoad(lcfcNewsRepo, { is_published: true }, 'display_order', 'display_order').then(setNews);
  }, []);

  if (!s) return <div className="min-h-screen bg-zinc-950" />;

  const featured = news.find((n) => n.is_featured) || news[0] || null;
  const newsList = news.filter((n) => n !== featured).slice(0, 5);

  return (
    <div className="bg-zinc-100">
      {s.hero_enabled && <Hero s={s} />}

      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-14 md:py-20 space-y-10">
        {s.about_enabled && <AboutRow s={s} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {s.overview_enabled && <OverviewCard s={s} />}
          {s.roster_enabled && <RosterCard players={players} />}
          {s.schedule_enabled && <ScheduleCard matches={matches} />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7"><TryoutsCard s={s} /></div>
          {s.staff_enabled && <div className="lg:col-span-5"><StaffCard staff={staff} /></div>}
        </div>
      </div>

      {s.news_enabled && <NewsSection featured={featured} newsList={newsList} />}
    </div>
  );
}

/* ---------- primitives ---------- */

function GoldButton({ as: As = 'a', className = '', children, ...props }) {
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-accent text-accent-foreground font-oswald tracking-widest uppercase text-sm rounded-md shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}

function OutlineButton({ as: As = 'a', className = '', children, ...props }) {
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 border border-zinc-300 text-zinc-800 font-oswald tracking-widest uppercase text-xs rounded-md hover:border-accent hover:text-accent hover:bg-accent/5 transition-colors ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}

function Card({ id, className = '', children }) {
  return (
    <div id={id} className={`relative scroll-mt-24 bg-white rounded-2xl border border-zinc-200/80 shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)] ${className}`}>
      <span className="absolute left-7 top-0 h-[3px] w-12 bg-accent rounded-full" />
      {children}
    </div>
  );
}

function CardTitle({ children, sub }) {
  return (
    <div className="mb-5">
      <h2 className="font-oswald text-xl font-bold tracking-[0.12em] uppercase text-zinc-900">{children}</h2>
      {sub && <p className="text-sm text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, children }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <p className="font-oswald tracking-wider uppercase text-sm text-zinc-500">{children}</p>
    </div>
  );
}

/* ---------- hero ---------- */

function Hero({ s }) {
  return (
    <section className="relative min-h-[78vh] md:min-h-[88vh] flex items-center overflow-hidden bg-zinc-950">
      {s.hero_image_url ? (
        <img src={s.hero_image_url} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 70% 0%, rgba(186,154,75,0.22), transparent 60%), linear-gradient(160deg, #050505 0%, #0c0c0c 45%, #161310 100%)' }}
          />
          <div className="absolute -top-24 right-1/4 w-[34rem] h-[34rem] bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-[26rem] h-[26rem] bg-accent/5 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 90px)' }}
          />
        </>
      )}

      {/* Strong dark overlay for readability over any image */}
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/30" />

      {/* Existing LC logo, large, right side — no new crest created */}
      <img
        src="/logo-shield.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute right-[-60px] md:right-8 top-1/2 -translate-y-1/2 w-[300px] md:w-[460px] lg:w-[540px] opacity-25 md:opacity-50 drop-shadow-[0_0_60px_rgba(186,154,75,0.35)] hidden sm:block"
      />

      <div className="relative w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/30 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-accent text-[11px] font-oswald tracking-[0.25em] uppercase">Les Chèvres · Competitive Side</span>
          </div>

          <h1 className="font-oswald text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white leading-[0.95]">
            {s.hero_heading}
          </h1>
          <p className="font-oswald text-xl md:text-2xl tracking-wide text-accent mt-4">
            {s.hero_subheading}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-9">
            <GoldButton href={s.hero_primary_link || '#tryouts'}>{s.hero_primary_text}</GoldButton>
            <a
              href={s.hero_secondary_link || '#news'}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-white/40 text-white font-oswald tracking-widest uppercase text-sm rounded-md backdrop-blur-sm hover:border-accent hover:text-accent transition-colors"
            >
              {s.hero_secondary_text}
            </a>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
    </section>
  );
}

/* ---------- about + quote ---------- */

function AboutRow({ s }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
      <Card className="p-8 lg:p-10 flex flex-col">
        <CardTitle>{s.about_heading}</CardTitle>
        <p className="text-zinc-600 leading-relaxed text-[15px]">{s.about_body}</p>
      </Card>

      <div className="relative rounded-2xl overflow-hidden bg-zinc-950 p-10 lg:p-12 flex flex-col justify-center min-h-[240px]">
        <div className="absolute inset-0 opacity-[0.5]" style={{ background: 'radial-gradient(circle at 85% 15%, rgba(186,154,75,0.18), transparent 55%)' }} />
        {/* diagonal gold accent lines */}
        <div className="absolute -right-10 top-0 bottom-0 w-[2px] bg-accent/40 rotate-[14deg]" />
        <div className="absolute -right-4 top-0 bottom-0 w-[2px] bg-accent/20 rotate-[14deg]" />
        <div className="absolute top-5 left-5 right-5 h-px bg-accent/40" />
        <div className="absolute bottom-5 left-5 right-5 h-px bg-accent/40" />
        <Quote className="w-12 h-12 text-accent mb-4" />
        <div className="space-y-1">
          {toLines(s.quote_text).map((line, i) => (
            <p key={i} className="font-oswald text-2xl md:text-[28px] leading-snug tracking-wide text-accent">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- overview / roster / schedule ---------- */

function OverviewCard({ s }) {
  return (
    <Card id="overview" className="p-8 overflow-hidden flex flex-col">
      <div
        className="absolute right-0 bottom-0 w-2/3 h-2/3 pointer-events-none"
        style={{
          background: s.overview_image_url
            ? undefined
            : 'radial-gradient(circle at 100% 100%, rgba(186,154,75,0.12), transparent 70%)',
        }}
      />
      {s.overview_image_url && (
        <img src={s.overview_image_url} alt="" aria-hidden="true" className="absolute right-0 bottom-0 w-2/3 h-full object-cover opacity-10" />
      )}
      <div className="relative flex flex-col flex-1">
        <CardTitle>{s.overview_title}</CardTitle>
        <ul className="space-y-3 mb-7 flex-1">
          {toLines(s.overview_bullets).map((b, i) => (
            <li key={i} className="flex items-start gap-3 text-[14px] text-zinc-700">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0 ring-4 ring-accent/15" />
              {b}
            </li>
          ))}
        </ul>
        <OutlineButton href={s.overview_button_link || '#overview'} className="self-start">
          {s.overview_button_text}
        </OutlineButton>
      </div>
    </Card>
  );
}

function PlayerThumb({ p }) {
  const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`;
  return (
    <div className="group">
      <div className="aspect-[4/5] rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center relative">
        {p.photo_url ? (
          <img src={p.photo_url} alt={`${p.first_name} ${p.last_name}`} className="w-full h-full object-cover" />
        ) : (
          <span className="font-oswald text-3xl text-zinc-700">{initials || '#'}</span>
        )}
        {p.jersey_number != null && p.jersey_number !== '' && (
          <span className="absolute top-1.5 left-1.5 font-oswald text-xs text-accent bg-black/60 px-1.5 rounded">
            #{p.jersey_number}
          </span>
        )}
      </div>
      <p className="font-oswald text-[11px] tracking-wider uppercase text-zinc-900 mt-2 truncate">
        {p.first_name} {p.last_name}
      </p>
      {p.position && <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{p.position}</p>}
    </div>
  );
}

function RosterCard({ players }) {
  const shown = players.slice(0, 6);
  return (
    <Card id="roster" className="p-8 flex flex-col">
      <CardTitle sub="Meet the Squad">Roster</CardTitle>
      {shown.length === 0 ? (
        <EmptyState icon={Users}>Roster coming soon.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-4 flex-1">
          {shown.map((p) => <PlayerThumb key={p.id} p={p} />)}
        </div>
      )}
      <OutlineButton href="#roster" className="w-full mt-6">View Full Roster</OutlineButton>
    </Card>
  );
}

function ScheduleCard({ matches }) {
  const shown = matches.slice(0, 6);
  return (
    <Card id="schedule" className="p-8 flex flex-col">
      <CardTitle>Schedule / Results</CardTitle>
      {shown.length === 0 ? (
        <EmptyState icon={CalendarDays}>Schedule coming soon.</EmptyState>
      ) : (
        <div className="flex-1 -mx-2">
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-2 pb-2 text-[10px] font-oswald tracking-[0.18em] uppercase text-zinc-400 border-b border-zinc-200">
            <span>Date</span><span>Opponent</span><span className="text-right">Time / Result</span>
          </div>
          {shown.map((m, i) => (
            <div
              key={m.id}
              className={`grid grid-cols-[auto_1fr_auto] gap-x-4 items-center px-2 py-3 text-sm ${i % 2 ? 'bg-zinc-50/70' : ''}`}
            >
              <span className="text-zinc-500 whitespace-nowrap font-medium">
                {m.match_date ? format(new Date(m.match_date), 'EEE, MMM d') : '—'}
              </span>
              <span className="text-zinc-900 truncate">
                <span className="text-zinc-400">{m.is_home ? 'vs.' : '@'}</span> {m.opponent}
              </span>
              <span className="text-right font-semibold text-zinc-800 whitespace-nowrap">
                {m.score || m.result || m.match_time || 'TBD'}
              </span>
            </div>
          ))}
        </div>
      )}
      <OutlineButton href="#schedule" className="w-full mt-6">View Full Schedule</OutlineButton>
    </Card>
  );
}

/* ---------- tryouts / staff ---------- */

function TryoutsCard({ s }) {
  const dates = toLines(s.tryouts_dates);
  const status = s.tryouts_status || 'coming_soon';

  let heading = 'Coming Soon';
  let body = 'Dates, time, and location will be announced soon.';
  if (status === 'closed') {
    heading = 'Tryouts Closed';
    body = s.tryouts_notes || 'Tryouts are currently closed. Check back for future opportunities.';
  } else if (status === 'open' && dates.length > 0) {
    heading = dates.length === 1 ? 'Tryout Date' : 'Tryout Dates';
  }
  const showDetails = status === 'open' && dates.length > 0;

  return (
    <div id="tryouts" className="relative h-full rounded-2xl overflow-hidden bg-zinc-950 p-8 lg:p-10">
      <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(circle at 90% 10%, rgba(186,154,75,0.16), transparent 55%)' }} />
      <div className="absolute top-5 left-5 right-5 h-px bg-accent/30" />
      <div className="relative flex items-center gap-8">
        <div className="flex-1">
          <p className="font-oswald text-[11px] tracking-[0.25em] uppercase text-zinc-400 mb-3">Tryouts / ID Sessions</p>
          <p className="font-oswald text-4xl md:text-5xl font-bold tracking-wide uppercase text-accent leading-none">
            {heading}
          </p>
          {!showDetails && <p className="text-sm text-zinc-400 mt-4 max-w-sm">{body}</p>}
          {showDetails && (
            <ul className="mt-4 space-y-2">
              {dates.map((d, i) => (
                <li key={i} className="text-sm text-zinc-200 flex flex-wrap gap-x-2">
                  <span className="font-semibold">{d}</span>
                  {(s.tryouts_start_time || s.tryouts_end_time) && (
                    <span className="text-zinc-400">{s.tryouts_start_time}{s.tryouts_end_time ? `–${s.tryouts_end_time}` : ''}</span>
                  )}
                  {s.tryouts_location && <span className="text-zinc-400">· {s.tryouts_location}</span>}
                </li>
              ))}
              {s.tryouts_registration_link && (
                <li className="pt-3">
                  <GoldButton href={s.tryouts_registration_link} target="_blank" rel="noreferrer">Register</GoldButton>
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="hidden sm:flex shrink-0 w-28 h-28 lg:w-36 lg:h-36 rounded-2xl border border-accent/30 bg-accent/5 items-center justify-center">
          <Calendar className="w-14 h-14 lg:w-16 lg:h-16 text-accent/80" />
        </div>
      </div>
    </div>
  );
}

function StaffCard({ staff }) {
  const shown = staff.slice(0, 3);
  return (
    <Card id="staff" className="p-8 flex flex-col h-full">
      <CardTitle>Staff</CardTitle>
      {shown.length === 0 ? (
        <EmptyState icon={ShieldCheck}>Staff coming soon.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-4 flex-1">
          {shown.map((m) => (
            <div key={m.id} className="text-center">
              <div className="aspect-square rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center">
                {m.image_url ? (
                  <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-oswald text-xl text-zinc-700">{m.name?.[0]}</span>
                )}
              </div>
              <p className="font-oswald text-[11px] tracking-wider uppercase text-zinc-900 mt-2 truncate">{m.name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{m.role}</p>
            </div>
          ))}
        </div>
      )}
      <OutlineButton href="#staff" className="w-full mt-6">Meet the Staff</OutlineButton>
    </Card>
  );
}

/* ---------- news / matchday ---------- */

function NewsSection({ featured, newsList }) {
  const empty = !featured && newsList.length === 0;
  return (
    <section id="news" className="relative bg-zinc-950 py-16 md:py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(186,154,75,0.12), transparent 55%)' }} />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-10">
          <h2 className="font-oswald text-2xl md:text-3xl font-bold tracking-[0.15em] uppercase text-white">
            News <span className="text-accent">/ Matchday</span>
          </h2>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {empty ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <Newspaper className="w-7 h-7 text-accent" />
            </div>
            <p className="font-oswald tracking-[0.2em] uppercase text-zinc-400">News coming soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {featured && (
              <div className="lg:col-span-7 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
                {featured.image_url && <img src={featured.image_url} alt="" className="w-full h-64 md:h-80 object-cover" />}
                <div className="p-7">
                  <p className="font-oswald text-[11px] tracking-[0.25em] uppercase text-accent mb-2">{featured.type || 'Matchday'}</p>
                  <h3 className="font-oswald text-2xl md:text-3xl font-bold tracking-wide text-white">{featured.title}</h3>
                  {featured.date && <p className="text-sm text-zinc-400 mt-1">{featured.date}</p>}
                  {featured.excerpt && <p className="text-[15px] text-zinc-300 mt-4 leading-relaxed">{featured.excerpt}</p>}
                  {featured.button_url && (
                    <a href={featured.button_url} className="inline-flex items-center gap-2 mt-5 text-accent font-oswald tracking-widest uppercase text-sm hover:gap-3 transition-all">
                      {featured.button_text || 'Read More'} <ArrowRight className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="lg:col-span-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-oswald text-lg font-bold tracking-[0.2em] uppercase text-white">Latest News</h3>
              </div>
              <div className="divide-y divide-white/10 border-t border-white/10">
                {newsList.map((n) => (
                  <div key={n.id} className="py-5 flex gap-4 group">
                    {n.image_url && <img src={n.image_url} alt="" className="w-24 h-18 object-cover rounded-md shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-oswald tracking-wide text-white group-hover:text-accent transition-colors truncate">{n.title}</p>
                      {n.date && <p className="text-xs text-accent/80 mt-0.5">{n.date}</p>}
                      {n.excerpt && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{n.excerpt}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
