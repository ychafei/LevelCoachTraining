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

export default function AdminCredits() {
  const { isAdmin } = useCurrentUser();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const loadCredits = async () => {
    const all = await base44.entities.SessionCredit.list();
    setCredits(all);
    setLoading(false);
  };

  useEffect(() => { loadCredits(); }, []);

  const handleDelete = async (credit) => {
    const ok = confirm(`Delete credit record "${credit.package_name || 'Unknown'}" for ${credit.client_email}? This cannot be undone.`);
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

  const filtered = credits.filter(c =>
    !search ||
    c.client_email?.toLowerCase().includes(search.toLowerCase()) ||
    c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.package_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-2">SESSION CREDITS</h1>
        <p className="text-muted-foreground text-sm mb-6">View, edit, or delete client session credit records.</p>

        <Input
          placeholder="Search by email, name, or package..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-secondary border-border mb-6 max-w-sm"
        />

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No credit records found.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(credit => {
              const remaining = credit.total_credits - credit.used_credits;
              const duration = credit.session_duration_minutes;
              const durationLabel = duration ? (duration >= 60 ? `${duration / 60} hr${duration > 60 ? 's' : ''}` : `${duration} min`) : 'N/A';
              return (
                <div key={credit.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Zap className={`w-5 h-5 mt-0.5 flex-shrink-0 ${remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-oswald tracking-wider text-foreground">
                          {credit.client_name || credit.client_email}
                        </p>
                        <p className="text-xs text-muted-foreground">{credit.client_email}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                          <span className="text-muted-foreground">
                            Package: <span className="text-foreground font-medium">{credit.package_name || '—'}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Sessions: <span className="text-foreground font-medium">{credit.used_credits}/{credit.total_credits} used</span>
                          </span>
                          <span className="text-muted-foreground">
                            Remaining: <span className={`font-medium ${remaining > 0 ? 'text-accent' : 'text-destructive'}`}>{remaining}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Duration: <span className="text-foreground font-medium">{durationLabel}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openEdit(credit)}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(credit)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
    </div>
  );
}
