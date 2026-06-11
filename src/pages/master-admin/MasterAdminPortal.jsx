import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminAssignmentRepo, auditLogRepo, coachRepo, profileRepo } from '@/api/repo';
import { AlertTriangle, FileText, History, Lock, MailCheck, Percent, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import RoleEditor from '@/features/admin/RoleEditor';

const DEFAULT_PLATFORM_FEE_BPS = 1500; // mirrors server env PLATFORM_FEE_BPS default

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

// Per-coach platform fee override (superadmin only — enforced again by
// adminOps.setCoachFee server-side). Percent in the UI, basis points on the wire.
function CoachFeeSection() {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    coachRepo.list()
      .then(setCoaches)
      .catch(() => setCoaches([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coaches
      .filter((coach) => {
        if (!q) return true;
        const name = [coach.first_name, coach.last_name].filter(Boolean).join(' ');
        return `${name} ${coach.email || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 15);
  }, [coaches, search]);

  const save = async (coach) => {
    const raw = drafts[coach.id];
    const bps = Math.round(Number(raw) * 100);
    if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
      toast.error('Platform fee must be between 0% and 50%.');
      return;
    }
    setSavingId(coach.id);
    try {
      await coachRepo.adminSetFee(coach.id, bps);
      setCoaches((prev) => prev.map((c) => (c.id === coach.id ? { ...c, platform_fee_bps: bps } : c)));
      setDrafts((prev) => { const next = { ...prev }; delete next[coach.id]; return next; });
      toast.success(`Platform fee for ${coach.first_name || 'coach'} set to ${(bps / 100).toLocaleString()}%`);
    } catch (err) {
      toast.error(err?.message || 'Could not set the platform fee.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <section className="mt-7 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Percent className="h-5 w-5 text-accent" aria-hidden="true" />
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Platform fee overrides</h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        The platform default fee is {(DEFAULT_PLATFORM_FEE_BPS / 100).toLocaleString()}%. Per-coach overrides
        apply to new checkouts only and require super admin authority (verified server-side).
      </p>
      <div className="mt-4 max-w-md">
        <label htmlFor="fee-coach-search" className="sr-only">Search coaches</label>
        <Input
          id="fee-coach-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search coaches by name or email"
          className="bg-background"
        />
      </div>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading coaches...</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {coaches.length === 0 ? 'No coaches exist yet.' : 'No coaches match the search.'}
          </p>
        ) : visible.map((coach) => {
          const currentBps = Number.isInteger(coach.platform_fee_bps) ? coach.platform_fee_bps : null;
          const draft = drafts[coach.id];
          return (
            <div key={coach.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {[coach.first_name, coach.last_name].filter(Boolean).join(' ') || coach.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {coach.email} · current fee: {currentBps === null
                    ? `platform default (${(DEFAULT_PLATFORM_FEE_BPS / 100).toLocaleString()}%)`
                    : `${(currentBps / 100).toLocaleString()}%`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`fee-${coach.id}`} className="sr-only">{`Platform fee percent for ${coach.email}`}</label>
                <Input
                  id={`fee-${coach.id}`}
                  type="number"
                  min="0"
                  max="50"
                  step="0.25"
                  inputMode="decimal"
                  value={draft ?? (currentBps === null ? '' : String(currentBps / 100))}
                  placeholder={(DEFAULT_PLATFORM_FEE_BPS / 100).toString()}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [coach.id]: event.target.value }))}
                  className="w-24 bg-background"
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
                <Button
                  size="sm"
                  onClick={() => save(coach)}
                  disabled={savingId === coach.id || draft === undefined || draft === ''}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {savingId === coach.id ? 'Saving...' : 'Set fee'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function MasterAdminPortal() {
  const { user, refetchUser } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapComplete, setBootstrapComplete] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [message, setMessage] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetProfileId, setTargetProfileId] = useState('');
  const [search, setSearch] = useState('');
  const masterEmailVerified = user?.email_verified === true || user?.emailVerification === true;
  const masterAdminLocked = user?.master_admin_locked === true || bootstrapComplete;

  // Bumped on every data reload so any RoleEditor that stays mounted across a
  // save (the search-panel one) remounts and refetches — a stale editor would
  // otherwise re-apply its old exact set on Save.
  const [rolesVersion, setRolesVersion] = useState(0);

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
      setRolesVersion((v) => v + 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  useEffect(() => {
    setBootstrapComplete(false);
  }, [user?.account_id]);

  useEffect(() => {
    if (user?.master_admin_locked === true) setBootstrapComplete(true);
  }, [user?.master_admin_locked]);

  const bootstrap = async () => {
    if (!masterEmailVerified) {
      setMessage('Verify this email in Appwrite before running the master admin bootstrap.');
      return;
    }
    setBootstrapping(true);
    setMessage('');
    try {
      await auth.bootstrapMasterAdmin();
      const fresh = await refetchUser();
      setBootstrapComplete(fresh?.master_admin_locked === true);
      await loadAdminData();
      setMessage('Master admin bootstrap completed.');
      setBootstrapComplete(true);
    } catch (err) {
      setMessage(err?.message || 'Could not bootstrap master admin.');
    } finally {
      setBootstrapping(false);
    }
  };

  const resendVerification = async () => {
    setSendingVerification(true);
    setMessage('');
    try {
      await auth.resendVerification();
      setMessage(`Verification email sent to ${user?.email}. Open that link, then sign back in and bootstrap again.`);
    } catch (err) {
      setMessage(err?.message || 'Could not send verification email.');
    } finally {
      setSendingVerification(false);
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

  const selectedTarget = useMemo(
    () => profiles.find((item) => item.id === targetProfileId) || null,
    [profiles, targetProfileId],
  );

  const onRolesSaved = async () => {
    setTargetProfileId('');
    setSearch('');
    await loadAdminData();
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

        {!masterAdminLocked && (
          <div className="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-5">
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Bootstrap Required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Run the server-side bootstrap after this account email is verified. The server only accepts the
              bootstrap from the authorized owner account configured in its environment.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-card/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Signed-in account</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{user?.email || 'Unknown email'}</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                  masterEmailVerified
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-yellow-500/10 text-yellow-700'
                }`}>
                  <MailCheck className="h-3.5 w-3.5" />
                  {masterEmailVerified ? 'Email verified' : 'Email not verified'}
                </span>
              </div>
              {!masterEmailVerified && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Appwrite blocks the master bootstrap until this exact account email is verified. If you signed in with password, use the verification email first; Google OAuth usually arrives verified.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={bootstrap} disabled={bootstrapping || !masterEmailVerified} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {bootstrapping ? 'Bootstrapping...' : 'Bootstrap master admin'}
              </Button>
              {!masterEmailVerified && (
                <Button variant="outline" onClick={resendVerification} disabled={sendingVerification}>
                  {sendingVerification ? 'Sending...' : 'Resend verification email'}
                </Button>
              )}
            </div>
            {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
          </div>
        )}

        {masterAdminLocked && message && (
          <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
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

          <div className="mt-5">
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
          </div>
          {selectedTarget && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">
                Roles for {displayName(selectedTarget)} <span className="text-muted-foreground">· {selectedTarget.email || 'no email'}</span>
              </p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Toggle any combination, then Save. “Coach” adds the coach label only — a coach record is still created via Admin → Applications/Coaches.
              </p>
              {masterAdminLocked ? (
                <RoleEditor key={`${selectedTarget.id}:${rolesVersion}`} profile={selectedTarget} onSaved={onRolesSaved} />
              ) : (
                <p className="text-xs text-muted-foreground">Only the locked master admin can change roles.</p>
              )}
            </div>
          )}

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
                  {masterAdminLocked ? (
                    <RoleEditor profile={profile} onSaved={loadAdminData} />
                  ) : (
                    <span className="text-xs uppercase text-muted-foreground">{profile.role || 'user'}</span>
                  )}
                </div>
              );
            }) : (
              <p className="p-4 text-sm text-muted-foreground">No delegated platform admins yet.</p>
            )}
          </div>
        </section>

        {user?.is_super_admin && <CoachFeeSection />}

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
