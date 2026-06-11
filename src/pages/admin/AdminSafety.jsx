import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileRepo, safetyReportRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const STATUS_FILTERS = ['all', 'open', 'reviewing', 'resolved', 'dismissed'];

const STATUS_TONES = {
  open: 'bg-destructive/10 text-destructive border-destructive/20',
  reviewing: 'bg-accent/10 text-accent border-accent/20',
  resolved: 'bg-green-500/10 text-green-500 border-green-500/20',
  dismissed: 'bg-secondary text-muted-foreground border-border',
};

// Display-only labels for stored status values.
const STATUS_LABELS = {
  all: 'All',
  open: 'Open',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const CATEGORY_LABELS = {
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  spam: 'Spam',
  safety_concern: 'Safety concern',
  minor_safety: 'Minor safety',
  other: 'Other',
};

export default function AdminSafety() {
  const { isAdmin } = useCurrentUser();
  const [reports, setReports] = useState([]);
  const [reporters, setReporters] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const rows = await safetyReportRepo.list('-created_date');
      setReports(rows);
      const profileIds = [...new Set(rows.map((row) => row.reporter_profile_id).filter(Boolean))];
      if (profileIds.length > 0) {
        const profiles = await profileRepo.filter({ id: profileIds }).catch(() => []);
        const map = {};
        profiles.forEach((profile) => {
          map[profile.id] = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email;
        });
        setReporters(map);
      }
    } catch (err) {
      toast.error(err?.message || 'Could not load safety reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    void load();
     
  }, [isAdmin]);

  const visible = useMemo(
    () => (statusFilter === 'all' ? reports : reports.filter((row) => (row.status || 'open') === statusFilter)),
    [reports, statusFilter],
  );

  const counts = useMemo(() => {
    const map = { all: reports.length };
    for (const status of STATUS_FILTERS.slice(1)) {
      map[status] = reports.filter((row) => (row.status || 'open') === status).length;
    }
    return map;
  }, [reports]);

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to admin
            </Link>
            <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Safety reports</h1>
            <p className="text-muted-foreground">Reports filed by members from conversations and messages.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="font-semibold">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        </div>

        <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Safety reports are server-only writable and no function currently exposes status transitions
          (open → reviewing → resolved/dismissed), so this view is read-only. Track follow-up outside the
          report record until a moderation action ships.
        </p>

        <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(status)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {STATUS_LABELS[status] || status} <span className="ml-1 text-muted-foreground">({counts[status] ?? 0})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading safety reports">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-2/3" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              {reports.length === 0 ? 'No safety reports filed' : 'No reports match this filter'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {reports.length === 0
                ? 'Reports submitted from the messaging report flow will appear here.'
                : 'Try a different status filter above.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((report) => (
              <li key={report.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={`border text-xs ${STATUS_TONES[report.status || 'open'] || STATUS_TONES.open}`}>
                        {STATUS_LABELS[report.status || 'open'] || report.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {CATEGORY_LABELS[report.category] || report.category || 'Uncategorized'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {report.detail || 'No additional detail provided.'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reported by {reporters[report.reporter_profile_id] || `profile ${String(report.reporter_profile_id || '').slice(0, 8)}`}
                      {report.conversation_id ? ` · conversation ${String(report.conversation_id).slice(0, 8)}` : ''}
                      {report.message_id ? ` · message ${String(report.message_id).slice(0, 8)}` : ''}
                    </p>
                    {report.resolution_notes && (
                      <p className="mt-1 text-xs italic text-muted-foreground">Resolution: {report.resolution_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      {report.created_date ? formatDistanceToNow(new Date(report.created_date), { addSuffix: true }) : ''}
                    </span>
                    {report.conversation_id && (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link to="/admin/messages">Open conversations</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
