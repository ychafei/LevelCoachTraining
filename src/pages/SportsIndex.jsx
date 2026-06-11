import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';
import { sportIcon } from '@/features/marketing/sportIcons';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal, Stagger } from '@/features/marketing/MarketingMotion';

const CATEGORY_LABELS = {
  team_sport: 'Team sports',
  individual_sport: 'Individual sports',
  performance_training: 'Performance training',
};

// /sports — index of every sport landing page. These per-sport pages are the
// long-tail SEO surface ("private soccer trainer", "goalie coach near me"),
// so each card links to the sport PAGE, not just a pre-filtered search.
export default function SportsIndex() {
  usePageMeta({
    title: 'Sports & Training Types',
    description: `Private coaching across ${SPORTS_CATALOG.length} sports and training types — from soccer and basketball to speed, strength, and all-around athletic development.`,
  });

  const groups = Object.keys(CATEGORY_LABELS).map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    sports: SPORTS_CATALOG.filter((sport) => sport.category === key),
  })).filter((group) => group.sports.length > 0);

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-12 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-[1240px]">
          <p className="section-num" data-num="01">{SPORTS_CATALOG.length} sports &amp; training types</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">
            Find coaching for your sport
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Every sport below has published coaches, sport-specific skill assessments, and
            specialty training — pick yours to see who&rsquo;s coaching near you.
          </p>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
        {groups.map((group) => (
          <section key={group.key} className="py-5" aria-labelledby={`sports-${group.key}`}>
            <Reveal>
              <h2 id={`sports-${group.key}`} className="text-xl font-bold tracking-[-0.01em] text-slate-950">{group.label}</h2>
            </Reveal>
            <Stagger className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.sports.map((sport) => {
                const Icon = sportIcon(sport.icon);
                return (
                  <Stagger.Item key={sport.sport_key} y={10}>
                    <Link
                      to={`/sports/${sport.sport_key}`}
                      className="group flex h-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-bold text-slate-950">{sport.display_name}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                          {sport.specialties.slice(0, 3).join(' · ')}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" aria-hidden="true" />
                    </Link>
                  </Stagger.Item>
                );
              })}
            </Stagger>
          </section>
        ))}
      </div>
    </div>
  );
}
