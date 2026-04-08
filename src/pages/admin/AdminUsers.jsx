import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Ban } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsers() {
  const { isAdmin, isSuperAdmin, user: me } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [banDialog, setBanDialog] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [u, b] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.UserBan.filter({ is_active: true }),
      ]);
      setUsers(u);
      setBans(b);
      setLoading(false);
    };
    load();
  }, []);

  const updateRole = async (userId, role) => {
    await base44.entities.User.update(userId, { role });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    toast.success('Role updated');
  };

  const banUser = async () => {
    if (!banReason.trim()) { toast.error('Please provide a reason'); return; }
    await base44.entities.UserBan.create({
      banned_email: banDialog.email,
      banned_by_email: me.email,
      reason: banReason,
      is_permanent: true,
      is_active: true,
    });
    toast.success('User banned');
    setBanDialog(null);
    setBanReason('');
    const b = await base44.entities.UserBan.filter({ is_active: true });
    setBans(b);
  };

  const unban = async (email) => {
    const ban = bans.find(b => b.banned_email === email);
    if (ban) {
      await base44.entities.UserBan.update(ban.id, { is_active: false, unbanned_by_email: me.email, unbanned_at: new Date().toISOString() });
      setBans(prev => prev.filter(b => b.id !== ban.id));
      toast.success('User unbanned');
    }
  };

  const filtered = users.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-6">USER MANAGEMENT</h1>

        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-secondary border-border mb-6 max-w-sm"
        />

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => {
              const isBanned = bans.some(b => b.banned_email === u.email);
              return (
                <div key={u.id} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-oswald tracking-wider text-foreground">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {isBanned && <Badge className="bg-destructive/10 text-destructive border-destructive/20 border text-xs mt-1">Banned</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isSuperAdmin && (
                      <Select value={u.role || 'user'} onValueChange={v => updateRole(u.id, v)}>
                        <SelectTrigger className="w-28 h-7 text-xs bg-secondary border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {!isBanned ? (
                      <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs" onClick={() => { setBanDialog(u); setBanReason(''); }}>
                        <Ban className="w-3 h-3 mr-1" /> Ban
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-green-400 h-7 text-xs" onClick={() => unban(u.email)}>
                        Unban
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!banDialog} onOpenChange={() => setBanDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald tracking-wider">BAN USER</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{banDialog?.full_name} ({banDialog?.email})</p>
          <div className="mt-4">
            <Label className="font-oswald tracking-wider uppercase text-xs">Reason</Label>
            <Textarea value={banReason} onChange={e => setBanReason(e.target.value)} className="bg-secondary border-border mt-1" rows={3} />
          </div>
          <Button onClick={banUser} className="mt-4 w-full bg-destructive text-destructive-foreground font-oswald tracking-wider uppercase hover:bg-destructive/90">Confirm Ban</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}