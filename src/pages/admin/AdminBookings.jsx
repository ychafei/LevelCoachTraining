import React, { useEffect, useMemo, useState } from 'react';
import { sessionRepo, coachRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckCircle2, XCircle, UserX, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatInTz } from '@/lib/scheduleET';
import { logAdminAction } from '@/lib/audit';

const statusConfig = {
  pending: { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20' },
  confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20' },
  completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20' },
  no_show: { icon: UserX, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
};

// Admin cancellation dialog — the booking function requires/records a reason
// and applies the credit-restoration policy server-side.
function CancelDialog({ session, onClose, onDone, actor }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await sessionRepo.cancel(session.id, reason.trim() || 'Cancelled by admin');
      toast.success(result.credit_restored
        ? 'Session cancelled — credit restored'
        : 'Session cancelled — credit forfeited per policy');
      await logAdminAction({
        actor,
        action: 'session.status_change',
        entityType: 'Session',
        entityId: session.id,
        before: { status: session.status },
        after: { status: 'cancelled' },
        reason: reason.trim() || 'Cancelled by admin',
        metadata: { client_email: session.client_email, coach_id: session.coach_id },
      });
      onDone();
    } catch (err) {
      toast.error(err?.message || 'Could not cancel this session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">CANCEL BOOKING</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {session.client_name} · {formatInTz(session.date, session.start_time, session.timezone) || `${session.date} ${session.start_time}`}
        </p>
        <p className="text-xs text-muted-foreground">
          The server applies the cancellation policy: cancellations 24+ hours out (or by the coach) restore the credit.
        </p>
        <div>
          <Label htmlFor="cancel-reason" className="font-display tracking-wider uppercase text-xs">Reason</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this booking being cancelled?"
            className="mt-1 bg-secondary border-border"
          />
        </div>
        <Button
          onClick={submit}
          disabled={saving}
          className="mt-2 w-full bg-destructive text-destructive-foreground font-display tracking-wider uppercase hover:bg-destructive/90"
        >
          {saving ? 'Cancelling...' : 'Cancel booking'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminBookings() {
  const { user, isAdmin } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [coaches, setCoaches] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [actingId, setActingId] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = async () => {
    try {
      const [s, c] = await Promise.all([
        sessionRepo.list('-date'),
        coachRepo.list(),
      ]);
      setSessions(s);
      const map = {};
      c.forEach((coach) => { map[coach.id] = coach; });
      setCoaches(map);
    } catch (err) {
      console.error('AdminBookings load failed', err);
      toast.error('Could not load bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
     
  }, [isAdmin]);

  const enriched = useMemo(() => sessions.map((s) => {
    const coach = coaches[s.coach_id];
    return {
      ...s,
      coach_name: coach ? `${coach.first_name} ${coach.last_name}` : 'Unknown',
      when_sort: `${s.date} ${s.start_time || '00:00'}`,
    };
  }), [sessions, coaches]);

  const filtered = filter === 'all' ? enriched : enriched.filter((s) => s.status === filter);

  // Lifecycle changes go through the booking function — complete/no_show are
  // valid for confirmed sessions only; cancellation requires a reason.
  const markStatus = async (session, action) => {
    const labels = { complete: 'completed', noShow: 'no-show' };
    const ok = await confirm({
      title: `Mark this session as ${labels[action]}?`,
      description: `${session.client_name} · ${session.date} ${session.start_time} with ${session.coach_name}`,
      consequences: action === 'noShow'
        ? ['The credit stays consumed — no automatic restoration for no-shows.']
        : ['Completed sessions count toward coach earnings and review eligibility.'],
      confirmLabel: `Mark ${labels[action]}`,
      cancelLabel: 'Keep as is',
    });
    if (!ok) return;
    setActingId(session.id);
    try {
      const updated = action === 'complete'
        ? await sessionRepo.complete(session.id)
        : await sessionRepo.noShow(session.id);
      const status = updated?.status || (action === 'complete' ? 'completed' : 'no_show');
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, status } : s)));
      await logAdminAction({
        actor: user,
        action: 'session.status_change',
        entityType: 'Session',
        entityId: session.id,
        before: { status: session.status },
        after: { status },
        metadata: { client_email: session.client_email, coach_id: session.coach_id },
      });
      toast.success('Status updated');
    } catch (err) {
      toast.error(err?.message || 'Could not update this session.');
    } finally {
      setActingId('');
    }
  };

  const columns = [
    {
      key: 'when',
      header: 'When',
      sortable: true,
      sortAccessor: 'when_sort',
      cell: (row) => (
        <div>
          <p className="font-display tracking-wider text-foreground text-sm">
            {formatInTz(row.date, row.start_time, row.timezone) || `${row.date} ${row.start_time}`}
          </p>
          <p className="text-xs text-muted-foreground">{row.duration_minutes} min</p>
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
            <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
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
      header: 'Actions',
      cell: (row) => {
        const busy = actingId === row.id;
        const canCancel = ['pending', 'confirmed'].includes(row.status);
        const canFinish = row.status === 'confirmed';
        if (!canCancel && !canFinish) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {canFinish && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => markStatus(row, 'complete')}
                className="h-7 text-xs text-green-400 hover:text-green-400 hover:bg-green-500/10"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" /> Complete
              </Button>
            )}
            {canFinish && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => markStatus(row, 'noShow')}
                className="h-7 text-xs text-yellow-500 hover:text-yellow-500 hover:bg-yellow-500/10"
              >
                <UserX className="w-3 h-3 mr-1" aria-hidden="true" /> No-show
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setCancelTarget(row)}
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <XCircle className="w-3 h-3 mr-1" aria-hidden="true" /> Cancel
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">ALL BOOKINGS</h1>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 bg-secondary border-border" aria-label="Filter bookings by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No-show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sessions are server-managed: cancellations, completions, and no-shows route through the booking
          function so credit policy, notifications, and emails stay consistent. Records cannot be deleted.
        </p>

        {loading ? (
          <div className="space-y-3 py-6" aria-busy="true" aria-label="Loading bookings">
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-secondary/50" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            searchFields={['client_name', 'client_email', 'coach_name']}
            searchPlaceholder="Search by client or coach…"
            emptyMessage="No bookings found."
          />
        )}
      </div>
      {cancelTarget && (
        <CancelDialog
          session={cancelTarget}
          actor={user}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setSessions((prev) => prev.map((s) => (s.id === cancelTarget.id ? { ...s, status: 'cancelled' } : s)));
            setCancelTarget(null);
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
