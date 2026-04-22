import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Trash2, Pencil, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';

export default function AdminCredits() {
  const { isAdmin } = useCurrentUser();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const loadCredits = async () => {
    try {
      const all = await base44.entities.SessionCredit.list();
      setCredits(all);
    } catch (err) {
      console.error('AdminCredits load failed', err);
      toast.error('Could not load credits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadCredits();
  }, [isAdmin]);

  const handleDelete = async (credit) => {
    const remaining = (credit.total_credits || 0) - (credit.used_credits || 0);
    const ok = await confirm({
      title: 'Delete credit record?',
      description: `${credit.client_name || credit.client_email} · ${credit.package_name || 'Unknown package'}`,
      consequences: [
        `${remaining} session${remaining === 1 ? '' : 's'} remaining will be forfeited.`,
        `${credit.used_credits || 0} used / ${credit.total_credits || 0} total.`,
        'This cannot be undone.',
      ],
      confirmLabel: 'Delete record',
      variant: 'destructive',
    });
    if (!ok) return;
    await base44.entities.SessionCredit.delete(credit.id);
    setCredits(prev => prev.filter(c => c.id !== credit.id));
    toast.success('Credit record deleted.');
  };

  const openEdit = (credit) => {
    setEditDialog(credit);
    setEditForm({
      package_name: credit.package_name || '',
      total_credits: credit.total_credits || 0,
      used_credits: credit.used_credits || 0,
      session_duration_minutes: String(credit.session_duration_minutes || 60),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.SessionCredit.update(editDialog.id, {
      package_name: editForm.package_name,
      total_credits: parseInt(editForm.total_credits),
      used_credits: parseInt(editForm.used_credits),
      session_duration_minutes: parseInt(editForm.session_duration_minutes),
    });
    toast.success('Credit record updated.');
    setEditDialog(null);
    setSaving(false);
    loadCredits();
  };

  const rows = credits.map(c => {
    const total = c.total_credits || 0;
    const used = c.used_credits || 0;
    const remaining = total - used;
    const duration = c.session_duration_minutes;
    const durationLabel = duration ? (duration >= 60 ? `${duration / 60} hr${duration > 60 ? 's' : ''}` : `${duration} min`) : 'N/A';
    return { ...c, _remaining: remaining, _durationLabel: durationLabel };
  });

  const columns = [
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      sortAccessor: (r) => r.client_name || r.client_email,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 flex-shrink-0 ${row._remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`} />
          <div>
            <p className="font-oswald tracking-wider text-foreground text-sm">{row.client_name || row.client_email}</p>
            <p className="text-xs text-muted-foreground">{row.client_email}</p>
          </div>
        </div>
      ),
    },
    { key: 'package_name', header: 'Package', sortable: true, cell: (r) => r.package_name || '—' },
    {
      key: 'sessions',
      header: 'Used / Total',
      sortable: true,
      sortAccessor: 'used_credits',
      cell: (r) => <span className="text-sm">{r.used_credits || 0} / {r.total_credits || 0}</span>,
    },
    {
      key: 'remaining',
      header: 'Remaining',
      sortable: true,
      sortAccessor: '_remaining',
      cell: (r) => <span className={`text-sm font-medium ${r._remaining > 0 ? 'text-accent' : 'text-destructive'}`}>{r._remaining}</span>,
    },
    { key: 'duration', header: 'Duration', sortable: true, sortAccessor: 'session_duration_minutes', cell: (r) => r._durationLabel },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openEdit(row)}>
            <Pencil className="w-3 h-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(row)}>
            <Trash2 className="w-3 h-3 mr-1" /> Delete
          </Button>
        </div>
      ),
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-2">SESSION CREDITS</h1>
        <p className="text-muted-foreground text-sm mb-6">View, edit, or delete client session credit records.</p>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchFields={['client_email', 'client_name', 'package_name']}
            searchPlaceholder="Search by email, name, or package…"
            emptyMessage="No credit records found."
          />
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald tracking-wider">EDIT CREDIT RECORD</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{editDialog?.client_name} ({editDialog?.client_email})</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Package Name</Label>
              <Input
                value={editForm.package_name}
                onChange={e => setEditForm(f => ({ ...f, package_name: e.target.value }))}
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">Total Sessions</Label>
                <Input
                  type="number"
                  value={editForm.total_credits}
                  onChange={e => setEditForm(f => ({ ...f, total_credits: e.target.value }))}
                  className="bg-secondary border-border mt-1"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">Used Sessions</Label>
                <Input
                  type="number"
                  value={editForm.used_credits}
                  onChange={e => setEditForm(f => ({ ...f, used_credits: e.target.value }))}
                  className="bg-secondary border-border mt-1"
                  min="0"
                  step="1"
                />
              </div>
            </div>
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Duration per Session</Label>
              <Select value={editForm.session_duration_minutes} onValueChange={v => setEditForm(f => ({ ...f, session_duration_minutes: v }))}>
                <SelectTrigger className="w-full mt-1 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 Hour</SelectItem>
                  <SelectItem value="90">1.5 Hours</SelectItem>
                  <SelectItem value="120">2 Hours</SelectItem>
                  <SelectItem value="150">2.5 Hours</SelectItem>
                  <SelectItem value="180">3 Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-secondary/50 border border-border rounded-lg p-3 mt-2">
            <p className="text-xs text-muted-foreground">
              After saving: client will see <strong className="text-foreground">{(parseInt(editForm.total_credits) || 0) - (parseInt(editForm.used_credits) || 0)}</strong> {editForm.package_name} session(s) available to schedule at <strong className="text-foreground">{parseInt(editForm.session_duration_minutes) >= 60 ? `${parseInt(editForm.session_duration_minutes) / 60} hr(s)` : `${editForm.session_duration_minutes} min`}</strong> each.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
