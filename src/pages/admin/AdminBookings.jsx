import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { formatSessionDateTimeET } from '@/lib/formatInET';

const statusConfig = {
  pending: { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20' },
  confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20' },
  completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export default function AdminBookings() {
  const { isAdmin } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [coaches, setCoaches] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [s, c] = await Promise.all([
          base44.entities.Session.list('-date'),
          base44.entities.Coach.list(),
        ]);
        if (cancelled) return;
        setSessions(s);
        const map = {};
        c.forEach(coach => { map[coach.id] = coach; });
        setCoaches(map);
      } catch (err) {
        console.error('AdminBookings load failed', err);
        if (!cancelled) toast.error('Could not load bookings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const updateStatus = async (session, status) => {
    if (status === session.status) return;
    if (status === 'cancelled') {
      const ok = await confirm({
        title: 'Cancel this booking?',
        description: `${session.client_name} · ${format(new Date(session.date), 'MMM d, yyyy')} at ${session.start_time}`,
        consequences: [
          'Status will be set to "cancelled".',
          'No automatic credit refund is issued from this panel — handle refunds in the Credits page.',
        ],
        confirmLabel: 'Cancel booking',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    await base44.entities.Session.update(session.id, { status });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status } : s));
    toast.success('Status updated');
  };

  const enriched = useMemo(() => sessions.map(s => {
    const coach = coaches[s.coach_id];
    return {
      ...s,
      coach_name: coach ? `${coach.first_name} ${coach.last_name}` : 'Unknown',
      when_sort: `${s.date} ${s.start_time || '00:00'}`,
    };
  }), [sessions, coaches]);

  const filtered = filter === 'all' ? enriched : enriched.filter(s => s.status === filter);

  const columns = [
    {
      key: 'when',
      header: 'When',
      sortable: true,
      sortAccessor: 'when_sort',
      cell: (row) => (
        <div>
          <p className="font-oswald tracking-wider text-foreground text-sm">{formatSessionDateTimeET(row.date, row.start_time)}</p>
          <p className="text-xs text-muted-foreground">{row.duration_minutes} min · {row.county}</p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      sortAccessor: 'client_name',
      cell: (row) => (
        <div>
          <p className="text-sm text-foreground">{row.client_name}</p>
          <p className="text-xs text-muted-foreground">{row.client_email}</p>
        </div>
      ),
    },
    {
      key: 'coach',
      header: 'Coach',
      sortable: true,
      sortAccessor: 'coach_name',
      cell: (row) => <span className="text-sm">{row.coach_name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: 'status',
      cell: (row) => {
        const sc = statusConfig[row.status] || statusConfig.pending;
        const Icon = sc.icon;
        return (
          <Badge className={`${sc.color} border text-xs`}>
            <Icon className="w-3 h-3 mr-1" />
            {row.status}
          </Badge>
        );
      },
    },
    {
      key: 'payment',
      header: 'Payment',
      sortable: true,
      sortAccessor: 'payment_status',
      cell: (row) => (
        <Badge className={row.payment_status === 'paid' ? 'bg-green-500/10 text-green-400 border-green-500/20 border text-xs' : 'bg-muted text-muted-foreground border text-xs'}>
          {row.payment_status || '—'}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: 'Change',
      cell: (row) => (
        <Select value={row.status} onValueChange={v => updateStatus(row, v)}>
          <SelectTrigger className="w-32 h-7 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground">ALL BOOKINGS</h1>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            searchFields={['client_name', 'client_email', 'coach_name', 'county']}
            searchPlaceholder="Search by client, coach, or county…"
            emptyMessage="No bookings found."
          />
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
