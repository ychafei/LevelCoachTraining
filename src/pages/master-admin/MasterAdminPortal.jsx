import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminAssignmentRepo, auditLogRepo, profileRepo } from '@/api/repo';
import { AlertTriangle, FileText, History, Lock, Shield, ShieldCheck, Users } from 'lucide-react';

const ADMIN_ROLES = ['admin', 'super_admin'];

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function displayName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
    || profile?.full_name
    || profile?.email
    || 'Unknown user';
}

export default function MasterAdminPortal() {
  const { user, refetchUser } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [message, setMessage] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingProfileId, setSavingProfileId] = useState('');
  const [targetProfileId, setTargetProfileId] = useState('');
  const [targetRole, setTargetRole] = useState('admin');
  const [search, setSearch] = useState('');

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [profileRows, assignmentRows, audit] = await Promise.all([
        profileRepo.list().catch(() => []),
        adminAssignmentRepo.list().catch(() => []),
        auditLogRepo.list('-created_date').catch(() => []),
      ]);
      setProfiles(profileRows);
      setAssignments(assignmentRows);
      setAuditRows(audit);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const bootstrap = async () => {
    setBootstrapping(true);
    setMessage('');
    try {
      await auth.bootstrapMasterAdmin();
      await refetchUser();
      await loadAdminData();
      setMessage('Master admin bootstrap completed.');
    } catch (err) {
      setMessage(err?.message || 'Could not bootstrap master admin.');
    } finally {
      setBootstrapping(false);
    }
  };

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.scope === 'platform' && !assignment.revoked_at),
    [assignments],
  );

  const platformAdmins = useMemo(() => {
    const activeProfileIds = new Set(activeAssignments.map((assignment) => assignment.profile_id));
    return profiles
      .filter((profile) => ADMIN_ROLES.includes(profile.role) || activeProfileIds.has(profile.id))
      .sort((a, b) => {
        if (a.master_admin_locked && !b.master_admin_locked) return -1;
        if (!a.master_admin_locked && b.master_admin_locked) return 1;
        return displayName(a).localeCompare(displayName(b));
      });
  }, [activeAssignments, profiles]);

  const grantCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles
      .filter((profile) => !profile.master_admin_locked)
      .filter((profile) => {
        if (!q) return true;
        return `${displayName(profile)} ${profile.email || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 25);
  }, [profiles, search]);

  const delegationAudit = useMemo(
    () => auditRows
      .filter((row) => String(row.action || '').startsWith('admin_assignment.') || row.action === 'master_admin.bootstrap')
      .slice(0, 8)
      .map((row) => ({
        ...row,
        before: parseJson(row.before),
        after: parseJson(row.after),
        metadata: parseJson(row.metadata),
      })),
    [auditRows],
  );

  const assignmentFor = (profileId) => activeAssignments.find((assignment) => assignment.profile_id === profileId);

  const updateDelegatedRole = async (profile, role) => {
    if (!profile?.id || profile.master_admin_locked) return;
    setSavingProfileId(profile.id);
    setMessage('');
    try {
      await auth.grantAdminRole({
        profileId: profile.id,
        role,
        allowSuperAdmin: role === 'super_admin',
      });
      setMessage(`${displayName(profile)} is now ${role === 'user' ? 'no longer a platform admin' : role}.`);
      await loadAdminData();
    } catch (err) {
      setMessage(err?.message || 'Could not update delegated admin role.');
    } finally {
      setSavingProfileId('');
    }
  };

  const grantSelected = async () => {
    const profile = profiles.find((item) => item.id === targetProfileId);
    if (!profile) {
      setMessage('Choose a user before granting access.');
      return;
    }
    await updateDelegatedRole(profile, targetRole);
    setTargetProfileId('');
    setSearch('');
    setTargetRole('admin');
  };

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Master Admin</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">Platform control</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Locked platform owner tools for admin delegation, legal template control, Stripe reconciliation, and audit oversight.
            </p>
          </div>
          <Lock className="h-10 w-10 text-accent" />
        </div>

        {!user?.master_admin_locked && (
          <div className="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-5">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Bootstrap Required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Run the server-side bootstrap after this account email is verified.
            </p>
            <Button onClick={bootstrap} disabled={bootstrapping} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
              {bootstrapping ? 'Bootstrapping...' : 'Bootstrap master admin'}
            </Button>
            {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
          </div>
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <AdminCard icon={Users} label="Delegated admins" href="/admin/users" />
          <AdminCard icon={FileText} label="Legal templates" href="/admin/legal-documents" />
          <AdminCard icon={Shield} label="Regular admin portal" href="/admin" />
        </div>

        <section className="mt-7 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Delegated Admins</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">Grant or revoke platform access</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Only this locked master-admin route can grant platform admin access. Regular admins can perform assigned operations but cannot create admins or alter the master account.
              </p>
            </div>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              Super admin grants should be rare and auditable.
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_190px_auto]">
            <div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users by name or email"
                className="bg-background"
              />
              {search && (
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-background">
                  {grantCandidates.length > 0 ? grantCandidates.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => {
                        setTargetProfileId(profile.id);
                        setSearch(`${displayName(profile)} · ${profile.email || ''}`);
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/5"
                    >
                      <span>
                        <span className="block font-semibold text-foreground">{displayName(profile)}</span>
                        <span className="text-xs text-muted-foreground">{profile.email || 'No email'}</span>
                      </span>
                      <span className="text-xs uppercase text-muted-foreground">{profile.role || 'user'}</span>
                    </button>
                  )) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No matching users.</p>
                  )}
                </div>
              )}
            </div>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={grantSelected} disabled={!targetProfileId || !!savingProfileId} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Grant Access
            </Button>
          </div>

          <div className="mt-6 divide-y divide-border rounded-lg border border-border">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading delegated admins...</p>
            ) : platformAdmins.length > 0 ? platformAdmins.map((profile) => {
              const assignment = assignmentFor(profile.id);
              const locked = !!profile.master_admin_locked;
              return (
                <div key={profile.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{displayName(profile)}</p>
                      {locked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                          <Lock className="h-3 w-3" />
                          Locked master
                        </span>
                      )}
                      {assignment && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          assignment active
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{profile.email || 'No email'} · current role: {profile.role || 'user'}</p>
                  </div>
                  {locked ? (
                    <ShieldCheck className="h-5 w-5 text-accent" />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={profile.role === 'admin' ? 'default' : 'outline'}
                        onClick={() => updateDelegatedRole(profile, 'admin')}
                        disabled={savingProfileId === profile.id}
                      >
                        Admin
                      </Button>
                      <Button
                        size="sm"
                        variant={profile.role === 'super_admin' ? 'default' : 'outline'}
                        onClick={() => updateDelegatedRole(profile, 'super_admin')}
                        disabled={savingProfileId === profile.id}
                      >
                        Super Admin
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateDelegatedRole(profile, 'user')}
                        disabled={savingProfileId === profile.id}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              );
            }) : (
              <p className="p-4 text-sm text-muted-foreground">No delegated platform admins yet.</p>
            )}
          </div>
        </section>

        <section className="mt-7 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Delegation audit trail</h2>
          </div>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {delegationAudit.length > 0 ? delegationAudit.map((entry) => (
              <div key={entry.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{entry.action}</p>
                  <p className="text-xs text-muted-foreground">{new Date(entry.created_date || entry.$createdAt).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actor_email || 'system'} changed {entry.metadata?.target_email || entry.entity_id || 'a profile'} from {entry.before?.role || '-'} to {entry.after?.role || '-'}.
                </p>
              </div>
            )) : (
              <p className="p-4 text-sm text-muted-foreground">No delegation audit entries yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminCard({ icon: Icon, label, href }) {
  return (
    <Link to={href} className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-accent/50">
      <Icon className="h-5 w-5 text-accent" />
      <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
    </Link>
  );
}
