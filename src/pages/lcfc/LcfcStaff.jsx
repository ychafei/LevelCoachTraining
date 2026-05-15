import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Phone } from 'lucide-react';
import { lcfcStaffRepo } from '@/api/repo';
import { LcfcPage, EmptyState, safeLoad } from '@/components/lcfc/LcfcKit';

export default function LcfcStaff() {
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    safeLoad(lcfcStaffRepo, { is_active: true }, 'display_order', 'display_order').then((rows) =>
      setStaff(rows.filter((m) => m.is_active !== false)),
    );
  }, []);

  return (
    <LcfcPage title="Coaches / Staff" subtitle="The people building the LCFC environment.">
      {staff === null ? (
        <div className="h-64 rounded-2xl bg-white border border-[#DDDAD2] animate-pulse" />
      ) : staff.length === 0 ? (
        <EmptyState icon={ShieldCheck}>Staff coming soon.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl border border-[#DDDAD2] overflow-hidden shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)]">
              <div className="aspect-[4/3] bg-[#0B0B0B] flex items-center justify-center">
                {m.image_url ? (
                  <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-oswald text-4xl text-[#333]">{m.name?.[0]}</span>
                )}
              </div>
              <div className="p-6">
                <p className="font-oswald text-lg tracking-wider uppercase text-[#111111]">{m.name}</p>
                {m.role && <p className="text-[#A9822B] text-sm uppercase tracking-wider font-semibold mt-0.5">{m.role}</p>}
                {m.bio && <p className="text-sm text-[#2A2A2A] mt-3 leading-relaxed line-clamp-4">{m.bio}</p>}
                <div className="flex flex-col gap-1.5 mt-4">
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="flex items-center gap-2 text-sm text-[#666666] hover:text-[#C9A646]">
                      <Mail className="w-4 h-4" /> {m.email}
                    </a>
                  )}
                  {m.phone && (
                    <span className="flex items-center gap-2 text-sm text-[#666666]">
                      <Phone className="w-4 h-4" /> {m.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </LcfcPage>
  );
}
