import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { sessionRepo } from '@/api/repo';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Users, ChevronRight, AlertTriangle } from 'lucide-react';
import { formatLongDateInTz, formatTimeInTz } from '@/lib/scheduleET';

// The getCoachClients function was removed in the production cutover — the
// client roster is derived from the coach's own sessions (reads scoped by
// per-document grants), grouped by client_email.

function statusForClient(c) {
  const today = new Date();
  const lastMs = c.last_session_date ? new Date(`${c.last_session_date}T00:00:00Z`).getTime() : 0;
  const daysSinceLast = lastMs ? Math.floor((today.getTime() - lastMs) / (24 * 60 * 60 * 1000)) : Infinity;
  if (c.upcoming_sessions > 0) return { label: c.total_sessions <= 2 ? 'New' : 'Active', tone: 'green' };
  if (daysSinceLast <= 30) return { label: c.total_sessions <= 2 ? 'New' : 'Active', tone: 'green' };
  if (daysSinceLast <= 90) return { label: 'Returning', tone: 'accent' };
  return { label: 'Paused', tone: 'muted' };
}

function buildClientsFromSessions(sessions = []) {
  const byClient = new Map();
  const today = new Date().toISOString().slice(0, 10);
  for (const session of sessions) {
    const email = session.client_email;
    if (!email) continue;

    const current = byClient.get(email) || {
      client_email: email,
      client_name: session.client_name || email,
      age: session.client_age || null,
      athlete_id: '',
      total_sessions: 0,
      completed_sessions: 0,
      upcoming_sessions: 0,
      last_session_date: '',
      next_session_date: '',
      next_session_time: '',
      timezone: session.timezone || '',
    };

    current.total_sessions += 1;
    if (session.status === 'completed') current.completed_sessions += 1;
    if (!current.client_name || current.client_name === email) {
      current.client_name = session.client_name || email;
    }
    if (!current.age && session.client_age) current.age = session.client_age;
    if (!current.athlete_id && session.athlete_id) current.athlete_id = session.athlete_id;

    const active = session.status === 'pending' || session.status === 'confirmed';
    if (session.date >= today && active) {
      current.upcoming_sessions += 1;
      if (!current.next_session_date || session.date < current.next_session_date) {
        current.next_session_date = session.date;
        current.next_session_time = session.start_time || '';
        current.timezone = session.timezone || current.timezone;
      }
    }

    if (session.date < today && (!current.last_session_date || session.date > current.last_session_date)) {
      current.last_session_date = session.date;
    }

    byClient.set(email, current);
  }

  return [...byClient.values()];
}

export default function CoachClients() {
  const { isAdmin } = useAuth();
  const { coach, loading: coachLoading } = useMyCoach();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (coachLoading) return undefined;
    if (!coach?.id) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const sessions = await sessionRepo.filter({ coach_id: coach.id }, '-date');
        if (cancelled) return;
        setClients(buildClientsFromSessions(sessions || []));
      } catch (err) {
        console.error('CoachClients load failed', err);
        if (!cancelled) setError(err?.message || 'Failed to load clients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coach?.id, coachLoading]);

  const rows = useMemo(() => clients.map(c => ({
    ...c,
    _status: statusForClient(c),
    _sortLastAct: c.next_session_date || c.last_session_date || '',
  })), [clients]);

  const columns = [
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      sortAccessor: 'client_name',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <span className="font-display text-xs text-muted-foreground">
              {(row.client_name || row.client_email || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {row.client_name}{row.age ? <span className="text-muted-foreground font-normal"> · {row.age}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground truncate">{row.client_email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last session',
      sortable: true,
      sortAccessor: 'last_session_date',
      cell: (row) => row.last_session_date
        ? <span className="text-sm text-foreground">{formatLongDateInTz(row.last_session_date, row.timezone || undefined).split(',')[0]}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'next',
      header: 'Next session',
      sortable: true,
      sortAccessor: 'next_session_date',
      cell: (row) => row.next_session_date
        ? (
          <div>
            <p className="text-sm text-foreground">{formatLongDateInTz(row.next_session_date, row.timezone || undefined).split(',')[0]}</p>
            {row.next_session_time && (
              <p className="text-xs text-muted-foreground">
                {formatTimeInTz(row.next_session_date, row.next_session_time, row.timezone || undefined)}
              </p>
            )}
          </div>
        )
        : <span className="text-xs text-muted-foreground">No upcoming</span>,
    },
    {
      key: 'completed',
      header: 'Completed',
      sortable: true,
      sortAccessor: 'completed_sessions',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.completed_sessions}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      sortAccessor: 'total_sessions',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.total_sessions}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (r) => r._status.label,
      cell: (row) => {
        const s = row._status;
        const tone =
          s.tone === 'green'  ? 'bg-green-500/10 text-green-600 border-green-500/20' :
          s.tone === 'accent' ? 'bg-accent/10 text-accent border-accent/20' :
                                'bg-secondary text-muted-foreground border-border';
        return <Badge className={`${tone} border text-xs font-semibold`}>{s.label}</Badge>;
      },
    },
    {
      key: 'go',
      header: '',
      cell: () => <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />,
    },
  ];

  if (!coachLoading && !coach && isAdmin) {
    return (
      <div className="bg-card border border-accent/30 rounded-lg p-6">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground mb-2">My clients</h2>
        <p className="text-sm text-muted-foreground">
          Your admin account isn't linked to a coach profile, so there are no clients to show.
        </p>
      </div>
    );
  }

  if (!coachLoading && !coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">Coach profile not linked</h2>
            <p className="text-sm text-muted-foreground mt-1">Ask an admin to link your account to a coach record before you can see clients.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground">My clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} total · {clients.filter(c => c.upcoming_sessions > 0).length} with upcoming sessions</p>
        </div>
      </div>

      {loading || coachLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading clients">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-secondary/50" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-card border border-destructive/30 rounded-lg p-4 text-sm text-destructive break-words">{error}</div>
      ) : clients.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">No clients yet</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Once a client books a session with you, they'll show up here with their full training history and toolkit.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns.map((col) => ({
            ...col,
            cell: (row) => (
              <Link
                to={`/coach/clients/${encodeURIComponent(row.client_email)}`}
                className="block -mx-2 px-2 py-1 rounded hover:bg-secondary/40 transition-colors"
              >
                {col.cell(row)}
              </Link>
            ),
          }))}
          data={rows}
          searchFields={['client_name', 'client_email']}
          searchPlaceholder="Search by name or email…"
          emptyMessage="No clients match your search."
          getRowKey={(r) => r.client_email}
        />
      )}
    </div>
  );
}
