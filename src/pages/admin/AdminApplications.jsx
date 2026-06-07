import React, { useEffect, useState } from 'react';
import { coachApplicationRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import { logAdminAction } from '@/lib/audit';

const statusColor = {
  pending: 'bg-accent/10 text-accent border-accent/20',
  reviewed: 'bg-primary/10 text-primary border-primary/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
};

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'private_training_coach', label: 'Private Coach' },
  { value: 'general', label: 'General' },
];

const typeBadge = {
  private_training_coach: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  general: 'bg-secondary text-muted-foreground border-border',
};

const typeLabel = {
  private_training_coach: 'Private Coach',
  general: 'General',
};

export default function AdminApplications() {
  const { user, isAdmin } = useCurrentUser();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    coachApplicationRepo.list('-created_date').then(data => { setApps(data); setLoading(false); });
  }, []);

  const update = async (id, status) => {
    const previous = apps.find(a => a.id === id);
    await coachApplicationRepo.update(id, { status });
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    await logAdminAction({
      actor: user,
      action: 'application.status_change',
      entityType: 'CoachApplication',
      entityId: id,
      before: { status: previous?.status || 'pending' },
      after: { status },
      metadata: {
        applicant_email: previous?.email,
        applicant_name: `${previous?.first_name || ''} ${previous?.last_name || ''}`.trim(),
      },
    });
    toast.success('Status updated');
  };

  const visible = typeFilter === 'all'
    ? apps
    : apps.filter(a => (a.application_type || 'general') === typeFilter);

  const rows = visible.map(a => ({
    ...a,
    _name: `${a.first_name || ''} ${a.last_name || ''}`.trim(),
    _type: a.application_type || 'general',
  }));

  const columns = [
    {
      key: 'applicant',
      header: 'Applicant',
      sortable: true,
      sortAccessor: '_name',
      cell: (row) => (
        <div>
          <p className="font-display tracking-wider text-foreground text-sm">{row._name || '—'}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
          {row.dob && <p className="text-xs text-muted-foreground">DOB: {format(new Date(row.dob), 'MMM d, yyyy')}</p>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortAccessor: '_type',
      cell: (row) => (
        <Badge className={`${typeBadge[row._type] || typeBadge.general} border text-[10px] font-display tracking-widest uppercase`}>
          {typeLabel[row._type] || row._type}
        </Badge>
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
            <a href={row.resume_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline mt-1 inline-block">View Resume</a>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            BG Check: {row.background_check_consent ? '✓' : '✗'}
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
        <Badge className={`${statusColor[row.status] || statusColor.pending} border text-xs`}>{row.status}</Badge>
      ),
    },
    {
      key: 'action',
      header: 'Change',
      cell: (row) => (
        <Select value={row.status} onValueChange={v => update(row.id, v)}>
          <SelectTrigger className="w-32 h-7 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-6">APPLICATIONS</h1>

        <div className="flex items-center gap-1 mb-6 border-b border-border overflow-x-auto">
          {TYPE_TABS.map(t => {
            const count = t.value === 'all'
              ? apps.length
              : apps.filter(a => (a.application_type || 'general') === t.value).length;
            const active = typeFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`px-4 py-2 text-xs font-display tracking-wider uppercase transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label} <span className="ml-1 text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
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
    </div>
  );
}
