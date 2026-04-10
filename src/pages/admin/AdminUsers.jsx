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
import { Shield, Ban, UserPlus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsers() {
  const { isAdmin, isSuperAdmin, user: me } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [banDialog, setBanDialog] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);
  const [warnDialog, setWarnDialog] = useState(null);
  const [warnMessage, setWarnMessage] = useState('');

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

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Please enter an email'); return; }
    setInviting(true);
    await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
    if (inviteRole === 'coach') {
      await base44.entities.Coach.create({
        first_name: inviteEmail.split('@')[0],
        last_name: '',
        email: inviteEmail.trim(),
        county: 'Oakland',
        is_active: false,
      });
    }
    toast.success(`Invitation sent to ${inviteEmail}${inviteRole === 'coach' ? ' — a coach profile was created for them' : ''}`);
    setInviteDialog(false);
    setInviteEmail('');
    setInviteRole('user');
    setInviting(false);
  };

  const sendWarning = async () => {
    if (!warnMessage.trim()) { toast.error('Please enter a warning message'); return; }
    await base44.integrations.Core.SendEmail({
      to: warnDialog.email,
      subject: 'Account Warning — LC Training',
      body: `<p>Hi ${warnDialog.full_name || warnDialog.email},</p><p>${warnMessage}</p><p>If you have questions, reply to this email or contact support@lctrainings.com.</p><p>— LC Training Team</p>`,
    });
    toast.success(`Warning sent to ${warnDialog.email}`);
    setWarnDialog(null);
    setWarnMessage('');
  };

  const filtered = users.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground">USER MANAGEMENT</h1>
          <Button onClick={() => setInviteDialog(true)} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
            <UserPlus className="w-4 h-4 mr-2" /> Invite User
          </Button>
        </div>

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
                    <p className="font-oswald tracking-wider text-foreground">{u.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-oswald tracking-wide uppercase border ${
                        u.role === 'admin' ? 'bg-accent/10 text-accent border-accent/20' :
                        u.role === 'coach' ? 'bg-primary/10 text-primary border-primary/20' :
                        'bg-secondary text-muted-foreground border-border'
                      }`}>{u.role || 'user'}</span>
                      {isBanned && <Badge className="bg-destructive/10 text-destructive border-destructive/20 border text-xs">Banned</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={u.role || 'user'} onValueChange={v => updateRole(u.id, v)}>
                      <SelectTrigger className="w-28 h-7 text-xs bg-secondary border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Client</SelectItem>
                        <SelectItem value="coach">Coach</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" className="text-yellow-400 h-7 text-xs" onClick={() => { setWarnDialog(u); setWarnMessage(''); }}>
                      <AlertTriangle className="w-3 h-3 mr-1" /> Warn
                    </Button>
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

      {/* Invite Dialog */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald tracking-wider">INVITE NEW USER</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">They'll receive an email to set up their account and log in.</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Email Address</Label>
              <Input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-full mt-1 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Client — Regular user</SelectItem>
                  <SelectItem value="coach">Coach — Will have a coach profile</SelectItem>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                </SelectContent>
              </Select>
              {inviteRole === 'coach' && (
                <p className="text-xs text-accent mt-2">A coach profile will be auto-created. They'll be prompted to complete it on first login.</p>
              )}
              {inviteRole === 'admin' && (
                <p className="text-xs text-destructive mt-2">Admin users have full access to the admin panel.</p>
              )}
            </div>
          </div>
          <Button onClick={handleInvite} disabled={inviting} className="mt-6 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
            {inviting ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <Dialog open={!!warnDialog} onOpenChange={() => setWarnDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald tracking-wider">SEND WARNING</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{warnDialog?.full_name} ({warnDialog?.email})</p>
          <p className="text-xs text-muted-foreground mt-1">This will send a warning email directly to the user.</p>
          <div className="mt-4">
            <Label className="font-oswald tracking-wider uppercase text-xs">Warning Message</Label>
            <Textarea value={warnMessage} onChange={e => setWarnMessage(e.target.value)} placeholder="Describe the policy violation or issue..." className="bg-secondary border-border mt-1" rows={4} />
          </div>
          <Button onClick={sendWarning} className="mt-4 w-full bg-yellow-500 text-black font-oswald tracking-wider uppercase hover:bg-yellow-400">
            <AlertTriangle className="w-4 h-4 mr-2" /> Send Warning Email
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}