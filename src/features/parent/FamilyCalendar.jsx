import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLongDateInTz, formatRangeInTz } from '@/lib/scheduleET';
import {
  EmptyState,
  SectionCard,
  SessionStatusBadge,
  SkeletonRows,
  coachDisplayName,
} from '@/features/athlete/portalShared';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(key, delta) {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

// List-by-date view of every family session in the selected month.
export default function FamilyCalendar({ sessionsData, childNamesById, viewerName = 'You' }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));

  const days = useMemo(() => {
    const inMonth = sessionsData.sessions.filter((session) => String(session.date || '').startsWith(month));
    const byDate = new Map();
    for (const session of inMonth) {
      if (!byDate.has(session.date)) byDate.set(session.date, []);
      byDate.get(session.date).push(session);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({
        date,
        sessions: sessions.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
      }));
  }, [sessionsData.sessions, month]);

  return (
    <SectionCard
      title="Family calendar"
      icon={CalendarDays}
      description="Every athlete's sessions in one place, shown in each session's own timezone."
      action={(
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-foreground">{monthLabel(month)}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    >
      {sessionsData.loading ? (
        <SkeletonRows rows={3} />
      ) : days.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={`No sessions in ${monthLabel(month)}`}
          body="Sessions you or your athletes book will appear here by date."
          cta={{ href: '/coaches', label: 'Find a coach' }}
          compact
        />
      ) : (
        <ol className="space-y-4">
          {days.map((day) => (
            <li key={day.date}>
              <h3 className="mb-2 text-sm font-bold text-foreground">
                {formatLongDateInTz(day.date, day.sessions[0]?.timezone) || day.date}
              </h3>
              <ul className="space-y-2">
                {day.sessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatRangeInTz(session.date, session.start_time, session.duration_minutes, session.timezone)
                          || session.start_time}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {childNamesById[session.athlete_id] || session.client_name || viewerName}
                        {' · '}
                        {coachDisplayName(sessionsData.coachesById[session.coach_id])}
                      </p>
                    </div>
                    <SessionStatusBadge status={session.status} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
