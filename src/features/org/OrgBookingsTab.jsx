import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { coachRepo, organizationCoachRepo, reportsRepo, sessionRepo } from '@/api/repo';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatInTz } from '@/lib/scheduleET';
import { formatCents } from '@/features/org/money';
import { CalendarDays, Info } from 'lucide-react';

const STATUS_TONES = {
  pending: 'bg-accent/10 text-accent border-accent/20',
  confirmed: 'bg-primary/10 text-primary border-primary/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
  no_show: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

// Display-only labels for session statuses — stored values never change.
const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return month || '—';
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// Sessions are per-document scoped to participants — org admins generally
// hold no read grant on roster coaches' sessions. We attempt the read anyway
// (future grants may include org admins) and otherwise fall back to a
// revenue-derived activity view.
export default function OrgBookingsTab({ organizationId, isOrgAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [coachesById, setCoachesById] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const links = await organizationCoachRepo
        .filter({ organization_id: organizationId, status: 'active' })
        .catch(() => []);
      const coachIds = [...new Set(links.map((row) => row.coach_id).filter(Boolean))];

      let sessionRows = [];
      if (coachIds.length > 0) {
        const coaches = await coachRepo.filter({ id: coachIds }).catch(() => []);
        const map = {};
        coaches.forEach((coach) => { map[coach.id] = coach; });
        setCoachesById(map);
        sessionRows = await sessionRepo.filter({ coach_id: coachIds }, '-date').catch(() => []);
      }
      setSessions(sessionRows);

      if (sessionRows.length === 0 && isOrgAdmin) {
        const report = await reportsRepo.orgRevenue({ organization_id: organizationId }).catch(() => null);
        setActivity([...(report?.monthly || [])].reverse());
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, isOrgAdmin]);

  useEffect(() => { void load(); }, [load]);

  const coachName = useMemo(() => (coachId) => {
    const coach = coachesById[coachId];
    return coach
      ? [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || coach.email
      : `Coach ${String(coachId || '').slice(0, 8)}`;
  }, [coachesById]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading bookings">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-2/3" />
      </div>
    );
  }

  if (sessions.length > 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Roster sessions</h2>
          <p className="mt-1 text-xs text-muted-foreground">{sessions.length} session{sessions.length === 1 ? '' : 's'} visible to you</p>
        </div>
        <ul className="divide-y divide-border">
          {sessions.slice(0, 50).map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {formatInTz(session.date, session.start_time, session.timezone) || `${session.date} ${session.start_time}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {coachName(session.coach_id)} · {session.client_name || 'Client'} · {session.duration_minutes} min
                </p>
              </div>
              <Badge className={`border text-xs ${STATUS_TONES[session.status] || 'bg-secondary text-muted-foreground border-border'}`}>
                {STATUS_LABELS[session.status] || session.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Individual session details are private</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Session records are only readable by the client, coach, and guardians involved, so this workspace
              cannot list roster coaches&apos; bookings directly. Booking activity shows up below through your
              organization&apos;s revenue ledger instead.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
            <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" /> Monthly booking activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Derived from organization payout ledger entries.</p>
        </div>
        {activity.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No booking activity yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once clients book and pay your roster coaches, monthly activity appears here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.slice(0, 12).map((row) => (
              <li key={row.month} className="flex items-center justify-between p-3 text-sm">
                <span className="text-muted-foreground">{monthLabel(row.month)}</span>
                <span className="font-display font-bold text-foreground">{formatCents(row.earned_cents || 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
