import React, { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { teamMatchRepo } from '@/api/repo';
import { LcfcPage, Card, EmptyState, safeLoad } from '@/components/lcfc/LcfcKit';

function statusLabel(m) {
  if (m.score) return m.score;
  if (m.result) return m.result;
  if (m.status && m.status !== 'scheduled') {
    return m.status.charAt(0).toUpperCase() + m.status.slice(1);
  }
  return m.match_time || 'TBD';
}

export default function LcfcSchedule() {
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    safeLoad(teamMatchRepo, { is_active: true }, 'display_order', 'match_date').then((rows) =>
      setMatches(rows.filter((m) => m.is_active !== false)),
    );
  }, []);

  return (
    <LcfcPage title="Schedule / Results" subtitle="Every LCFC fixture, result, and matchday.">
      {matches === null ? (
        <div className="h-64 rounded-2xl bg-white border border-[#DDDAD2] animate-pulse" />
      ) : matches.length === 0 ? (
        <EmptyState icon={CalendarDays}>Schedule coming soon.</EmptyState>
      ) : (
        <Card className="p-6 md:p-8">
          <div className="hidden md:grid grid-cols-[120px_1fr_90px_120px_1fr_auto] gap-4 px-3 pb-3 text-[10px] font-oswald tracking-[0.18em] uppercase text-[#666666] border-b border-[#DDDAD2]">
            <span>Date</span><span>Opponent</span><span>H/A</span><span>Time</span><span>Location</span><span className="text-right">Status</span>
          </div>
          {matches.map((m, i) => (
            <div
              key={m.id}
              className={`grid grid-cols-2 md:grid-cols-[120px_1fr_90px_120px_1fr_auto] gap-x-4 gap-y-1 items-center px-3 py-4 text-sm ${i % 2 ? 'bg-[#F7F7F5]' : ''} rounded-lg`}
            >
              <span className="font-semibold text-[#111111] whitespace-nowrap">
                {m.match_date ? format(new Date(m.match_date), 'EEE, MMM d') : '—'}
              </span>
              <span className="text-[#2A2A2A] truncate md:order-none order-2 col-span-2 md:col-span-1">
                {m.opponent}
              </span>
              <span className="text-[#666666] uppercase text-xs">{m.is_home ? 'Home' : 'Away'}</span>
              <span className="text-[#666666]">{m.match_time || '—'}</span>
              <span className="text-[#666666] truncate">{m.location || '—'}</span>
              <span className="flex items-center justify-end gap-3 whitespace-nowrap">
                <span className="font-oswald font-bold tracking-wider text-[#A9822B]">{statusLabel(m)}</span>
                {m.ticket_link && (
                  <a href={m.ticket_link} target="_blank" rel="noreferrer" className="text-[#C9A646] hover:text-[#D4AF37]" title="Tickets">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}
    </LcfcPage>
  );
}
