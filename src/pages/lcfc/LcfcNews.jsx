import React, { useEffect, useState } from 'react';
import { Newspaper, ArrowRight } from 'lucide-react';
import { lcfcNewsRepo } from '@/api/repo';
import { LcfcPage, EmptyState, safeLoad } from '@/components/lcfc/LcfcKit';

export default function LcfcNews() {
  const [news, setNews] = useState(null);

  useEffect(() => {
    safeLoad(lcfcNewsRepo, { is_published: true }, 'display_order', 'display_order').then((rows) =>
      setNews(rows.filter((n) => n.is_published === true)),
    );
  }, []);

  const featured = news?.find((n) => n.is_featured) || news?.[0] || null;
  const rest = (news || []).filter((n) => n !== featured);

  return (
    <LcfcPage title="News / Matchday" subtitle="Updates, recaps, and matchday announcements.">
      {news === null ? (
        <div className="h-64 rounded-2xl bg-white border border-[#DDDAD2] animate-pulse" />
      ) : news.length === 0 ? (
        <EmptyState icon={Newspaper}>News coming soon.</EmptyState>
      ) : (
        <div className="space-y-10">
          {featured && (
            <div className="grid lg:grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-[#DDDAD2] bg-white shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)]">
              {featured.image_url && (
                <img src={featured.image_url} alt="" className="w-full h-64 lg:h-full object-cover" />
              )}
              <div className="p-8 flex flex-col justify-center">
                <p className="font-oswald text-[11px] tracking-[0.25em] uppercase text-[#A9822B] mb-2">
                  {featured.type || 'Matchday'}
                </p>
                <h2 className="font-oswald text-2xl md:text-3xl font-bold tracking-wide text-[#111111]">{featured.title}</h2>
                {featured.date && <p className="text-sm text-[#666666] mt-1">{featured.date}</p>}
                {featured.excerpt && <p className="text-[#2A2A2A] mt-4 leading-relaxed">{featured.excerpt}</p>}
                {featured.button_url && (
                  <a href={featured.button_url} className="inline-flex items-center gap-2 mt-5 text-[#A9822B] font-oswald tracking-widest uppercase text-sm hover:gap-3 transition-all">
                    {featured.button_text || 'Read More'} <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((n) => (
                <div key={n.id} className="bg-white rounded-2xl border border-[#DDDAD2] overflow-hidden shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)] flex flex-col">
                  {n.image_url && <img src={n.image_url} alt="" className="w-full h-44 object-cover" />}
                  <div className="p-6 flex flex-col flex-1">
                    <p className="font-oswald text-[10px] tracking-[0.25em] uppercase text-[#A9822B] mb-2">{n.type || 'News'}</p>
                    <p className="font-oswald text-lg tracking-wide text-[#111111]">{n.title}</p>
                    {n.date && <p className="text-xs text-[#666666] mt-1">{n.date}</p>}
                    {n.excerpt && <p className="text-sm text-[#2A2A2A] mt-3 leading-relaxed line-clamp-3 flex-1">{n.excerpt}</p>}
                    {n.button_url && (
                      <a href={n.button_url} className="inline-flex items-center gap-2 mt-4 text-[#A9822B] font-oswald tracking-widest uppercase text-xs hover:gap-3 transition-all">
                        {n.button_text || 'Read More'} <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </LcfcPage>
  );
}
