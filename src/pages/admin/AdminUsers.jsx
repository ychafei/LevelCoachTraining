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
import { Shield, Ban, UserPlus, AlertTriangle, Zap, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';

export default function AdminUsers() {
  const { isAdmin, isSuperAdmin, user: me } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [banDialog, setBanDialog] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);
  const [warnDialog, setWarnDialog] = useState(null);
  const [warnMessage, setWarnMessage] = useState('');
  const [creditDialog, setCreditDialog] = useState(null);
  const [creditSessions, setCreditSessions] = useState('');
  const [creditDuration, setCreditDuration] = useState('60');
  const [creditPackageName, setCreditPackageName] = useState('Admin Grant');
  const [creditSaving, setCreditSaving] = useState(false);

  // Only fetch user/ban data once admin status is confirmed.
  // The route guard also blocks non-admins, but this prevents a brief
  // window during auth transition where data would be fetched unnecessarily.
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [u, b] = await Promise.all([
          base44.entities.User.list(),
          base44.entities.UserBan.filter({ is_active: true }),
        ]);
        if (cancelled) return;
        setUsers(u);
        setBans(b);
      } catch (err) {
        console.error('AdminUsers load failed', err);
        if (!cancelled) toast.error('Could not load users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Non-super-admins cannot edit super-admins, cannot demote the last super-admin,
  // and cannot promote someone to admin. Super-admins are the only ones who can
  // escalate to admin. This is also enforced server-side in Base44 permissions
  // (see remaining-risks summary).
  const canEditUser = (target) => {
    if (!target) return false;
    if (target.email === me?.email) return false; // cannot self-edit
    if (target.is_super_admin && !isSuperAdmin) return false;
    return true;
  };

  const updateRole = async (targetUser, role) => {
    if (!canEditUser(targetUser)) {
      toast.error('You do not have permission to edit this user.');
      return;
    }
    // Only super admins can promote to admin.
    if (role === 'admin' && !isSuperAdmin) {
      toast.error('Only a super admin can promote a user to admin.');
      return;
    }
    // Prevent demoting an admin unless you are super admin (or they are non-super).
    if (targetUser.role === 'admin' && role !== 'admin' && !isSuperAdmin) {
      toast.error('Only a super admin can change an admin\'s role.');
      return;
    }
    await base44.entities.User.update(targetUser.id, { role });
    setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role } : u));
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
    if (inviteRole === 'admin' && !isSuperAdmin) {
      toast.error('Only a super admin can invite a new admin.');
      return;
    }
    setInviting(true);
    try {
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
    } catch (err) {
      toast.error(err?.message || 'Invite failed.');
    } finally {
      setInviting(false);
    }
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

  const rows = users.map(u => ({
    ...u,
    _is_banned: bans.some(b => b.banned_email === u.email),
    _role_label: u.role || 'user',
  }));

  const columns = [
    {
      key: 'user',
      header: 'User',
      sortable: true,
      sortAccessor: (r) => r.full_name || r.email,
      cell: (row) => (
        <div>
          <p className="font-oswald tracking-wider text-foreground text-sm">{row.full_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      sortAccessor: '_role_label',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-oswald tracking-wide uppercase border ${
            row.role === 'admin' ? 'bg-accent/10 text-accent border-accent/20' :
            row.role === 'coach' ? 'bg-primary/10 text-primary border-primary/20' :
            'bg-secondary text-muted-foreground border-border'
          }`}>{row.role || 'user'}</span>
          {row._is_banned && <Badge className="bg-destructive/10 text-destructive border-destructive/20 border text-xs">Banned</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => {
        const editable = canEditUser(row);
        const isSelf = row.email === me?.email;
        if (!editable) {
          return (
            <div className="flex items-center gap-2 justify-end">
              {isSelf && <span className="text-xs font-oswald tracking-wider text-muted-foreground px-2 py-1 bg-secondary/50 border border-border rounded">Your account</span>}
              {row.is_super_admin && (
                <span className="text-xs font-oswald tracking-wider text-accent px-2 py-1 bg-accent/10 border border-accent/20 rounded flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Super admin
                </span>
              )}
            </div>
          );
        }
        // Role options are filtered based on caller's privileges.
        const canAssignAdmin = isSuperAdmin;
        const canEditExistingAdmin = row.role !== 'admin' || isSuperAdmin;
        return (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Select
              value={row.role || 'user'}
              onValueChange={v => updateRole(row, v)}
              disabled={!canEditExistingAdmin}
            >
              <SelectTrigger className="w-28 h-7 text-xs bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Client</SelectItem>
                <SelectItem value="coach">Coach</SelectItem>
                {canAssignAdmin && <SelectItem value="admin">Admin</SelectItem>}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="text-accent h-7 text-xs" onClick={() => { setCreditDialog(row); setCreditSessions(''); setCreditDuration('60'); setCreditPackageName('Admin Grant'); }}>
              <Zap className="w-3 h-3 mr-1" /> Credits
            </Button>
            <Button size="sm" variant="ghost" className="text-yellow-400 h-7 text-xs" onClick={() => { setWarnDialog(row); setWarnMessage(''); }}>
              <AlertTriangle className="w-3 h-3 mr-1" /> Warn
            </Button>
            {!row._is_banned ? (
              <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs" onClick={() => { setBanDialog(row); setBanReason(''); }}>
                <Ban className="w-3 h-3 mr-1" /> Ban
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-green-400 h-7 text-xs" onClick={() => unban(row.email)}>
                Unban
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground">USER MANAGEMENT</h1>
            {isSuperAdmin && (
              <p className="text-xs text-accent font-oswald tracking-wider uppercase mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Super admin session
              </p>
            )}
          </div>
          <Button onClick={() => setInviteDialog(true)} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
            <UserPlus className="w-4 h-4 mr-2" /> Invite User
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchFields={['full_name', 'email']}
            searchPlaceholder="Search by name or email…"
            emptyMessage="No users found."
          />
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
                  {isSuperAdmin && <SelectItem value="admin">Admin — Full access</SelectItem>}
                </SelectContent>
              </Select>
              {inviteRole === 'coach' && (
                <p className="text-xs text-accent mt-2">A coach profile will be auto-created. They'll be prompted to complete it on first login.</p>
              )}
              {inviteRole === 'admin' && (
                <p className="text-xs text-destructive mt-2">Admin users have full access to the admin panel.</p>
              )}
              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground mt-2">Only a super admin can invite new admins.</p>
              )}
            </div>
          </div>
          <Button onClick={handleInvite} disabled={inviting} className="mt-6 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
            {inviting ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Credits Dialog */}
      <Dialog open={!!creditDialog} onOpenChange={() => setCreditDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-oswald tracking-wider">ISSUE SESSIONS</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{creditDialog?.full_name} ({creditDialog?.email})</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Number of Sessions</Label>
              <Input type="number" value={creditSessions} onChange={e => setCreditSessions(e.target.value)} placeholder="e.g. 5" className="bg-secondary border-border mt-1" min="1" step="1" />
            </div>
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Duration per Session</Label>
              <Select value={creditDuration} onValueChange={setCreditDuration}>
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
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Package Name</Label>
              <Input value={creditPackageName} onChange={e => setCreditPackageName(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
          </div>
          <Button
            disabled={!creditSessions || parseInt(creditSessions) <= 0 || creditSaving}
            onClick={async () => {
              setCreditSaving(true);
              await base44.entities.SessionCredit.create({
                client_email: creditDialog.email,
                client_name: creditDialog.full_name || creditDialog.email,
                package_id: 'admin_grant',
                package_name: creditPackageName,
                total_credits: parseInt(creditSessions),
                used_credits: 0,
                session_duration_minutes: parseInt(creditDuration),
              });
              toast.success(`${creditSessions} session(s) at ${parseInt(creditDuration) / 60} hr(s) added to ${creditDialog.email}`);
              setCreditDialog(null);
              setCreditSaving(false);
            }}
            className="mt-4 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
          >
            {creditSaving ? 'Saving...' : `Issue ${creditSessions || '?'} Session(s)`}
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
