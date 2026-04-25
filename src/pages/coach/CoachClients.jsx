import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Users, ChevronRight, Zap, AlertTriangle } from 'lucide-react';
import { formatLongDateET } from '@/lib/formatInET';

function statusForClient(c) {
  // Active: has upcoming OR session in last 30d
  // Returning: last session 31-90d ago
  // Paused: last session > 90d ago, no upcoming
  // New: total_sessions <= 2 and active
  const today = new Date();
  const lastMs = c.last_session_date ? new Date(`${c.last_session_date}T00:00:00Z`).getTime() : 0;
  const daysSinceLast = lastMs ? Math.floor((today.getTime() - lastMs) / (24 * 60 * 60 * 1000)) : Infinity;
  if (c.upcoming_sessions > 0) return { label: c.total_sessions <= 2 ? 'New' : 'Active', tone: 'green' };
  if (daysSinceLast <= 30) return { label: c.total_sessions <= 2 ? 'New' : 'Active', tone: 'green' };
  if (daysSinceLast <= 90) return { label: 'Returning', tone: 'accent' };
  return { label: 'Paused', tone: 'muted' };
}

export default function CoachClients() {
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('getCoachClients', {});
        if (cancelled) return;
        const payload = res?.data ?? res;
        if (payload?.error) throw new Error(payload.error);
        setClients(payload?.clients || []);
      } catch (err) {
        console.error('getCoachClients failed', err);
        if (!cancelled) setError(err?.message || 'Failed to load clients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
            <span className="font-oswald text-xs text-muted-foreground">
              {(row.client_name || row.client_email || '').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-oswald tracking-wider text-foreground text-sm truncate">
              {row.client_name}{row.age ? <span className="text-muted-foreground font-normal"> · {row.age}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground truncate">{row.client_email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last Session',
      sortable: true,
      sortAccessor: 'last_session_date',
      cell: (row) => row.last_session_date
        ? <span className="text-sm text-foreground">{formatLongDateET(row.last_session_date).split(',')[0]}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'next',
      header: 'Next Session',
      sortable: true,
      sortAccessor: 'next_session_date',
      cell: (row) => row.next_session_date
        ? (
          <div>
            <p className="text-sm text-foreground">{formatLongDateET(row.next_session_date).split(',')[0]}</p>
            {row.next_session_time && <p className="text-xs text-muted-foreground">{row.next_session_time}</p>}
          </div>
        )
        : <span className="text-xs text-muted-foreground">No upcoming</span>,
    },
    {
      key: 'credits',
      header: 'Credits',
      sortable: true,
      sortAccessor: 'credits_remaining',
      cell: (row) => row.credits_remaining > 0
        ? (
          <span className="inline-flex items-center gap-1 text-sm text-accent">
            <Zap className="w-3 h-3" /> {row.credits_remaining}
          </span>
        )
        : <span className="text-xs text-muted-foreground">0</span>,
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
          s.tone === 'green'  ? 'bg-green-500/10 text-green-400 border-green-500/20' :
          s.tone === 'accent' ? 'bg-accent/10 text-accent border-accent/20' :
                                'bg-secondary text-muted-foreground border-border';
        return <Badge className={`${tone} border text-[10px] font-oswald tracking-widest uppercase`}>{s.label}</Badge>;
      },
    },
    {
      key: 'go',
      header: '',
      cell: () => <ChevronRight className="w-4 h-4 text-muted-foreground" />,
    },
  ];

  if (!user?.coach_id && isAdmin) {
    return (
      <div className="bg-card border border-accent/30 rounded-lg p-6">
        <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase mb-2">My Clients</h2>
        <p className="text-sm text-muted-foreground">
          Your admin account isn't linked to a coach profile, so there are no clients to show.
        </p>
      </div>
    );
  }

  if (!user?.coach_id) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase">Coach Profile Not Linked</h2>
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
          <h1 className="font-oswald text-2xl font-bold tracking-wider text-foreground uppercase">My Clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} total · {clients.filter(c => c.upcoming_sessions > 0).length} with upcoming sessions</p>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="bg-card border border-destructive/30 rounded-lg p-4 text-sm text-destructive break-words">{error}</div>
      ) : clients.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-oswald text-lg tracking-wider text-foreground uppercase">No Clients Yet</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Once a client books a session with you, they'll show up here with their history, credits, and notes.
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
