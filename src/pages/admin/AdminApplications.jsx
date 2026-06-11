import React, { useEffect, useState } from 'react';
import { coachApplicationRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';

const statusColor = {
  pending: 'bg-accent/10 text-accent border-accent/20',
  reviewed: 'bg-primary/10 text-primary border-primary/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
};

// Display-only labels for stored status values.
const statusLabel = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

// Approve/reject through the applications function — approval creates the
// coach record, assigns the coach label, and emails the applicant server-side.
function DecisionDialog({ app, decision, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const approving = decision === 'approve';

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await callFn('applications', {
        action: 'review',
        application_id: app.id,
        decision,
        notes: notes.trim(),
      });
      toast.success(approving
        ? 'Application approved — coach record created'
        : 'Application rejected');
      onDone(result?.status || (approving ? 'accepted' : 'rejected'));
    } catch (err) {
      toast.error(err?.message || 'Could not review this application.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>
            {approving ? 'Approve application' : 'Reject application'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {`${app.first_name || ''} ${app.last_name || ''}`.trim() || app.email} · {app.email}
        </p>
        <p className="text-xs text-muted-foreground">
          {approving
            ? 'Approval creates an unpublished coach record, links a verified account when one exists, and emails the applicant.'
            : 'The applicant receives a rejection email. This decision is final for this application.'}
        </p>
        <div>
          <Label htmlFor="review-notes" className="text-xs font-semibold">Review notes (internal)</Label>
          <Textarea
            id="review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Optional — stored on the audit log entry."
            className="mt-1 bg-secondary border-border"
          />
        </div>
        <Button
          onClick={submit}
          disabled={saving}
          className={`mt-2 w-full font-semibold ${
            approving
              ? 'bg-accent text-accent-foreground hover:bg-accent/90'
              : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          }`}
        >
          {saving ? 'Submitting...' : approving ? 'Approve & create coach' : 'Reject application'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminApplications() {
  const { isAdmin } = useCurrentUser();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decisionTarget, setDecisionTarget] = useState(null);

  useEffect(() => {
    coachApplicationRepo.list('-created_date')
      .then(data => { setApps(data); })
      .catch((err) => toast.error(err?.message || 'Could not load applications.'))
      .finally(() => setLoading(false));
  }, []);

  const rows = apps.map(a => ({
    ...a,
    _name: `${a.first_name || ''} ${a.last_name || ''}`.trim(),
  }));

  const columns = [
    {
      key: 'applicant',
      header: 'Applicant',
      sortable: true,
      sortAccessor: '_name',
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{row._name || '—'}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
          {row.dob && <p className="text-xs text-muted-foreground">DOB: {format(new Date(row.dob), 'MMM d, yyyy')}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      sortAccessor: 'county',
      cell: (row) => (
        <div>
          <p className="text-sm text-foreground">{row.phone || '—'}</p>
          <p className="text-xs text-muted-foreground">{row.county || '—'}</p>
        </div>
      ),
    },
    {
      key: 'background',
      header: 'Background',
      cell: (row) => (
        <div className="max-w-xs">
          {row.coaching_background ? (
            <p className="text-xs text-foreground/80 line-clamp-3">{row.coaching_background}</p>
          ) : <span className="text-xs text-muted-foreground">—</span>}
          {row.resume_url && (
            <a href={row.resume_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline mt-1 inline-block">View resume</a>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            BG check: {row.background_check_consent ? 'consented' : 'missing'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: 'status',
      cell: (row) => (
        <Badge className={`${statusColor[row.status] || statusColor.pending} border text-xs`}>{statusLabel[row.status] || row.status}</Badge>
      ),
    },
    {
      key: 'action',
      header: 'Review',
      cell: (row) => {
        if (['accepted', 'rejected'].includes(row.status)) {
          return <span className="text-xs text-muted-foreground">Decided</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDecisionTarget({ app: row, decision: 'approve' })}
              className="h-7 text-xs text-green-400 hover:text-green-400 hover:bg-green-500/10"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" /> Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDecisionTarget({ app: row, decision: 'reject' })}
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <XCircle className="w-3 h-3 mr-1" aria-hidden="true" /> Reject
            </Button>
          </div>
        );
      },
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground mb-6">Applications</h1>

        {loading ? (
          <div className="space-y-3 py-6" aria-busy="true" aria-label="Loading applications">
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-secondary/50" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchFields={['first_name', 'last_name', 'email', 'county']}
            searchPlaceholder="Search by name, email, or county…"
            emptyMessage="No applications yet."
          />
        )}
      </div>

      {decisionTarget && (
        <DecisionDialog
          app={decisionTarget.app}
          decision={decisionTarget.decision}
          onClose={() => setDecisionTarget(null)}
          onDone={(status) => {
            setApps(prev => prev.map(a => a.id === decisionTarget.app.id ? { ...a, status } : a));
            setDecisionTarget(null);
          }}
        />
      )}
    </div>
  );
}
