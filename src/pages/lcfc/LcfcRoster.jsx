import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { playerRepo } from '@/api/repo';
import { LcfcPage, EmptyState, safeLoad } from '@/components/lcfc/LcfcKit';

export default function LcfcRoster() {
  const [players, setPlayers] = useState(null);

  useEffect(() => {
    safeLoad(playerRepo, { is_active: true }, 'display_order', 'jersey_number').then((rows) =>
      setPlayers(rows.filter((p) => p.is_active !== false)),
    );
  }, []);

  return (
    <LcfcPage title="Roster" subtitle="The competitive men's squad of LCFC.">
      {players === null ? (
        <div className="h-64 rounded-2xl bg-white border border-[#DDDAD2] animate-pulse" />
      ) : players.length === 0 ? (
        <EmptyState icon={Users}>Roster coming soon.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {players.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-[#DDDAD2] overflow-hidden shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)]">
              <div className="relative aspect-[4/5] bg-[#0B0B0B] flex items-center justify-center">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={`${p.first_name} ${p.last_name}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-oswald text-4xl text-[#333]">
                    {(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}
                  </span>
                )}
                {p.jersey_number != null && p.jersey_number !== '' && (
                  <span className="absolute top-2 left-2 font-oswald text-sm text-[#C9A646] bg-black/60 px-2 py-0.5 rounded">
                    #{p.jersey_number}
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="font-oswald tracking-wider uppercase text-[#111111] truncate">
                  {p.first_name} {p.last_name}
                </p>
                <div className="flex gap-2 mt-1 text-[11px] uppercase tracking-wider text-[#666666]">
                  {p.position && <span className="text-[#A9822B] font-semibold">{p.position}</span>}
                  {p.hometown && <span className="truncate">· {p.hometown}</span>}
                </div>
                {p.bio && <p className="text-sm text-[#2A2A2A] mt-3 line-clamp-3 leading-relaxed">{p.bio}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </LcfcPage>
  );
}
