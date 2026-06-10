import React, { useEffect, useState } from 'react';
import { unsubscribeRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { MailX } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';

export default function AdminUnsubscribes() {
  const { isAdmin } = useCurrentUser();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    unsubscribeRepo.list('-created_date').then(data => { setRecords(data); setLoading(false); });
  }, []);

  const columns = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      sortAccessor: 'email',
      cell: (row) => (
        <div>
          <p className="font-display tracking-wider text-foreground text-sm">{row.email}</p>
          {row.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">"{row.reason}"</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      sortAccessor: 'created_date',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.created_date ? format(new Date(row.created_date), 'MMM d, yyyy') : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (r) => (r.resubscribed ? 'z' : 'a'),
      cell: (row) => row.resubscribed
        ? <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border text-xs">Re-subscribed</Badge>
        : <Badge className="bg-destructive/10 text-destructive border-destructive/20 border text-xs"><MailX className="w-3 h-3 mr-1" />Unsubscribed</Badge>,
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-2">UNSUBSCRIBES</h1>
        <p className="text-muted-foreground mb-2">{records.length} total · {records.filter(r => !r.resubscribed).length} active</p>
        <p className="text-xs text-muted-foreground mb-8">
          This list is read-only: unsubscribe records are server-managed through the emailDispatch function
          (token or signed-in owner verification). Suppression is enforced automatically on every send.
        </p>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <DataTable
            columns={columns}
            data={records}
            searchFields={['email', 'reason']}
            searchPlaceholder="Search by email or reason…"
            emptyMessage="No unsubscribes yet."
          />
        )}
      </div>
    </div>
  );
}
