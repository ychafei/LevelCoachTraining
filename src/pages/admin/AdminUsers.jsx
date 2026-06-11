import React, { useEffect, useState } from 'react';
import { profileRepo, userBanRepo, sessionCreditRepo } from '@/api/repo';
import { auth } from '@/lib/auth';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Ban, UserPlus, AlertTriangle, Zap, Lock, Eye, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import { logAdminAction } from '@/lib/audit';
import UserDetailDialog from '@/features/admin/UserDetailDialog';
import RoleEditor from '@/features/admin/RoleEditor';

function displayName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || profile?.full_name
    || '';
}

// Display-only labels for stored role values.
const roleLabel = {
  user: 'User',
  coach: 'Coach',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export default function AdminUsers() {
  const { isAdmin, isSuperAdmin, user: me } = useCurrentUser();
  const isMasterAdmin = isSuperAdmin && me?.master_admin_locked === true;
  const [users, setUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [banDialog, setBanDialog] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [banSaving, setBanSaving] = useState(false);
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
  const [detailUser, setDetailUser] = useState(null);
  const [roleDialog, setRoleDialog] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [u, b] = await Promise.all([
          profileRepo.list(),
          userBanRepo.filter({ is_active: true }),
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

  // Moderation actions (ban/warn/credits) stay off your own row and off
  // super-admin targets unless you are the locked master admin. Role edits go
  // through the stacked RoleEditor (server-enforced: master admin only) and
  // ARE allowed on your own row — roles stack, and the server prevents the
  // locked master from dropping their own super_admin.
  const canEditUser = (target) => {
    if (!target) return false;
    if (target.email === me?.email) return false; // no self-moderation
    if ((target.role === 'super_admin' || target.is_super_admin || target.master_admin_locked) && !isMasterAdmin) return false;
    return true;
  };

  const onRolesSaved = async () => {
    setRoleDialog(null);
    const u = await profileRepo.list().catch(() => users);
    setUsers(u);
  };

  // Bans route through adminOps.banUser — the server records the ban, flags
  // the profile, audits the action, and enforces it at login + in functions.
  const banUser = async () => {
    if (!banReason.trim() || banReason.trim().length < 3) {
      toast.error('Please provide a reason (3+ characters)');
      return;
    }
    setBanSaving(true);
    try {
      await userBanRepo.ban(banDialog.id, banReason.trim(), true);
      toast.success('User banned');
      setBanDialog(null);
      setBanReason('');
      const b = await userBanRepo.filter({ is_active: true }).catch(() => bans);
      setBans(b);
    } catch (err) {
      toast.error(err?.message || 'Could not ban this user.');
    } finally {
      setBanSaving(false);
    }
  };

  const unban = async (row) => {
    try {
      await userBanRepo.unban(row.id);
      setBans(prev => prev.filter(b => b.banned_email !== row.email));
      toast.success('User unbanned');
    } catch (err) {
      toast.error(err?.message || 'Could not unban this user.');
    }
  };

  // Invites route through adminOps.inviteUser (user/coach only — platform
  // admin roles are granted afterwards from the master admin portal).
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Please enter an email'); return; }
    setInviting(true);
    try {
      await auth.inviteUser(inviteEmail.trim(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteDialog(false);
      setInviteEmail('');
      setInviteRole('user');
      const u = await profileRepo.list().catch(() => users);
      setUsers(u);
    } catch (err) {
      toast.error(err?.message || 'Invite failed.');
    } finally {
      setInviting(false);
    }
  };

  const sendWarning = async () => {
    if (!warnMessage.trim()) { toast.error('Please enter a warning message'); return; }
    // The open-relay email helper was removed in the production cutover —
    // warnings are recorded in the audit log only for now.
    await logAdminAction({
      actor: me,
      action: 'user.warn',
      entityType: 'User',
      entityId: warnDialog.id,
      reason: warnMessage,
      metadata: { target_email: warnDialog.email },
    });
    toast.success(`Warning recorded for ${warnDialog.email}`);
    setWarnDialog(null);
    setWarnMessage('');
  };

  const grantCredits = async () => {
    const count = parseInt(creditSessions, 10);
    if (!Number.isInteger(count) || count <= 0) return;
    setCreditSaving(true);
    try {
      await sessionCreditRepo.grant({
        client_profile_id: creditDialog.id,
        package_name: creditPackageName.trim() || 'Admin Grant',
        total_credits: count,
        session_duration_minutes: parseInt(creditDuration, 10),
      });
      toast.success(`${count} session(s) granted to ${creditDialog.email}`);
      setCreditDialog(null);
    } catch (err) {
      toast.error(err?.message || 'Could not grant credits.');
    } finally {
      setCreditSaving(false);
    }
  };

  const rows = users.map(u => ({
    ...u,
    _name: displayName(u),
    _is_banned: bans.some(b => b.banned_email === u.email),
    _role_label: u.role || 'user',
  }));

  const columns = [
    {
      key: 'user',
      header: 'User',
      sortable: true,
      sortAccessor: (r) => r._name || r.email,
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{row._name || '—'}</p>
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
          <span className={`text-xs px-2 py-0.5 rounded font-semibold border ${
            row.role === 'admin' || row.role === 'super_admin' ? 'bg-accent/10 text-accent border-accent/20' :
            row.role === 'coach' ? 'bg-primary/10 text-primary border-primary/20' :
            'bg-secondary text-muted-foreground border-border'
          }`}>{roleLabel[row.role] || row.role || 'User'}</span>
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
        const viewBtn = (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailUser(row)}>
            <Eye className="w-3 h-3 mr-1" aria-hidden="true" /> View
          </Button>
        );
        // Stacked role editing (coach + admin + super_admin) — master admin
        // only, available on every row including your own.
        const rolesBtn = isMasterAdmin && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRoleDialog(row)}>
            <Shield className="w-3 h-3 mr-1" aria-hidden="true" /> Roles
          </Button>
        );
        if (!editable) {
          return (
            <div className="flex items-center gap-2 justify-end">
              {viewBtn}
              {rolesBtn}
              {isSelf && <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-secondary/50 border border-border rounded">Your account</span>}
              {(row.role === 'super_admin' || row.is_super_admin) && (
                <span className="text-xs font-semibold text-accent px-2 py-1 bg-accent/10 border border-accent/20 rounded flex items-center gap-1">
                  <Lock className="w-3 h-3" aria-hidden="true" /> Super admin
                </span>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {viewBtn}
            {rolesBtn}
            <Button size="sm" variant="ghost" className="text-accent h-7 text-xs" onClick={() => { setCreditDialog(row); setCreditSessions(''); setCreditDuration('60'); setCreditPackageName('Admin Grant'); }}>
              <Zap className="w-3 h-3 mr-1" aria-hidden="true" /> Credits
            </Button>
            <Button size="sm" variant="ghost" className="text-yellow-400 h-7 text-xs" onClick={() => { setWarnDialog(row); setWarnMessage(''); }}>
              <AlertTriangle className="w-3 h-3 mr-1" aria-hidden="true" /> Warn
            </Button>
            {!row._is_banned ? (
              <Button size="sm" variant="ghost" className="text-destructive h-7 text-xs" onClick={() => { setBanDialog(row); setBanReason(''); }}>
                <Ban className="w-3 h-3 mr-1" aria-hidden="true" /> Ban
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-green-400 h-7 text-xs" onClick={() => unban(row)}>
                Unban
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">User management</h1>
            {isSuperAdmin && (
              <p className="text-xs font-semibold text-accent mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" aria-hidden="true" /> Super admin session
              </p>
            )}
          </div>
          <Button onClick={() => setInviteDialog(true)} className="bg-accent text-accent-foreground font-semibold text-xs hover:bg-accent/90">
            <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" /> Invite user
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3 py-6" aria-busy="true" aria-label="Loading users">
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-secondary/50" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchFields={['_name', 'email']}
            searchPlaceholder="Search by name or email…"
            emptyMessage="No users found."
          />
        )}
      </div>

      {detailUser && <UserDetailDialog profile={detailUser} onClose={() => setDetailUser(null)} />}

      {/* Stacked roles dialog — backed by grantAdminRole (master admin only). */}
      <Dialog open={!!roleDialog} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Stacked roles</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{displayName(roleDialog)} ({roleDialog?.email})</p>
          <p className="text-xs text-muted-foreground">
            Roles stack — someone can be Coach and Super admin at once. &ldquo;Coach&rdquo; grants the
            coach label; the coach record itself is created/linked from Admin → Coaches or
            application approval. Saving applies the exact set selected below.
          </p>
          <div className="mt-2">
            {roleDialog && <RoleEditor profile={roleDialog} onSaved={onRolesSaved} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!banDialog} onOpenChange={() => setBanDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Ban user</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{displayName(banDialog)} ({banDialog?.email})</p>
          <p className="text-xs text-muted-foreground">
            Banning drops their access immediately — enforced at sign-in and inside every server function.
          </p>
          <div className="mt-2">
            <Label htmlFor="ban-reason" className="text-xs font-semibold">Reason</Label>
            <Textarea id="ban-reason" value={banReason} onChange={e => setBanReason(e.target.value)} className="bg-secondary border-border mt-1" rows={3} />
          </div>
          <Button onClick={banUser} disabled={banSaving} className="mt-4 w-full bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90">
            {banSaving ? 'Banning...' : 'Confirm ban'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Invite new user</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">They&apos;ll receive an email with instructions to set a password and sign in.</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="invite-email" className="text-xs font-semibold">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-role" className="text-xs font-semibold">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role" className="w-full mt-1 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Client — Regular user</SelectItem>
                  <SelectItem value="coach">Coach — Granted the coach label</SelectItem>
                </SelectContent>
              </Select>
              {inviteRole === 'coach' && (
                <p className="text-xs text-accent mt-2">They get the coach label and complete coach onboarding (profile, legal packet, payouts) on first login.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">Platform admin access is granted separately from the master admin portal.</p>
            </div>
          </div>
          <Button onClick={handleInvite} disabled={inviting} className="mt-6 w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
            {inviting ? 'Sending...' : 'Send invitation'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Credits Dialog */}
      <Dialog open={!!creditDialog} onOpenChange={() => setCreditDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Issue sessions</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{displayName(creditDialog)} ({creditDialog?.email})</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="credit-count" className="text-xs font-semibold">Number of sessions</Label>
              <Input id="credit-count" type="number" value={creditSessions} onChange={e => setCreditSessions(e.target.value)} placeholder="e.g. 5" className="bg-secondary border-border mt-1" min="1" step="1" />
            </div>
            <div>
              <Label htmlFor="credit-duration" className="text-xs font-semibold">Duration per session</Label>
              <Select value={creditDuration} onValueChange={setCreditDuration}>
                <SelectTrigger id="credit-duration" className="w-full mt-1 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="150">2.5 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="credit-package" className="text-xs font-semibold">Package name</Label>
              <Input id="credit-package" value={creditPackageName} onChange={e => setCreditPackageName(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
          </div>
          <Button
            disabled={!creditSessions || parseInt(creditSessions, 10) <= 0 || creditSaving}
            onClick={grantCredits}
            className="mt-4 w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
          >
            {creditSaving ? 'Saving...' : `Issue ${creditSessions || '?'} session(s)`}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <Dialog open={!!warnDialog} onOpenChange={() => setWarnDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Record warning</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{displayName(warnDialog)} ({warnDialog?.email})</p>
          <p className="text-xs text-muted-foreground mt-1">The warning is recorded in the audit log. No email is sent.</p>
          <div className="mt-4">
            <Label htmlFor="warn-message" className="text-xs font-semibold">Warning message</Label>
            <Textarea id="warn-message" value={warnMessage} onChange={e => setWarnMessage(e.target.value)} placeholder="Describe the policy violation or issue..." className="bg-secondary border-border mt-1" rows={4} />
          </div>
          <Button onClick={sendWarning} className="mt-4 w-full bg-yellow-500 text-black font-semibold hover:bg-yellow-400">
            <AlertTriangle className="w-4 h-4 mr-2" aria-hidden="true" /> Record warning
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
