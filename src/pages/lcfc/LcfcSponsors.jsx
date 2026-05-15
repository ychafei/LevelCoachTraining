import React, { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { lcfcSponsorRepo } from '@/api/repo';
import { LcfcPage, EmptyState, safeLoad } from '@/components/lcfc/LcfcKit';

const TIER_ORDER = { gold: 0, silver: 1, bronze: 2, partner: 3, other: 4 };

export default function LcfcSponsors() {
  const [sponsors, setSponsors] = useState(null);

  useEffect(() => {
    safeLoad(lcfcSponsorRepo, { is_active: true }, 'display_order', 'display_order').then((rows) => {
      const visible = rows
        .filter((s) => s.is_active !== false && s.is_published === true)
        .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));
      setSponsors(visible);
    });
  }, []);

  return (
    <LcfcPage title="Sponsors" subtitle="The partners backing LCFC.">
      {sponsors === null ? (
        <div className="h-48 rounded-2xl bg-white border border-[#DDDAD2] animate-pulse" />
      ) : sponsors.length === 0 ? (
        <EmptyState icon={Handshake}>Sponsors coming soon.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {sponsors.map((sp) => {
            const inner = (
              <div className="bg-white rounded-2xl border border-[#DDDAD2] shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)] p-6 flex flex-col items-center justify-center text-center h-44 hover:border-[#C9A646] transition-colors">
                {sp.logo_url ? (
                  <img src={sp.logo_url} alt={sp.name} className="max-h-20 max-w-full object-contain" />
                ) : (
                  <span className="font-oswald text-lg tracking-wider uppercase text-[#111111]">{sp.name}</span>
                )}
                <span className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#A9822B]">{sp.tier}</span>
              </div>
            );
            return sp.website_url ? (
              <a key={sp.id} href={sp.website_url} target="_blank" rel="noreferrer">{inner}</a>
            ) : (
              <div key={sp.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </LcfcPage>
  );
}
