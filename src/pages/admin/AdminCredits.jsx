import React, { useEffect, useMemo, useState } from 'react';
import { coachRepo, profileRepo, sessionCreditRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Zap, Plus, Ban, Info } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';

function durationLabel(min) {
  if (!min) return 'N/A';
  return min >= 60 ? `${min / 60} hr${min > 60 ? 's' : ''}` : `${min} min`;
}

function profileName(profile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email;
}

// Grant a fresh credit package through adminOps.grantCredits (server-only
// writes — no direct session_credits inserts).
function GrantDialog({ onClose, onSaved }) {
  const [profiles, setProfiles] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [packageName, setPackageName] = useState('Admin Grant');
  const [totalCredits, setTotalCredits] = useState('');
  const [duration, setDuration] = useState('60');
  const [coachId, setCoachId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileRepo.list().then(setProfiles).catch(() => setProfiles([]));
    coachRepo.list().then(setCoaches).catch(() => setCoaches([]));
  }, []);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return profiles
      .filter((profile) => `${profileName(profile)} ${profile.email || ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [profiles, search]);

  const selected = profiles.find((profile) => profile.id === clientId);
  const credits = parseInt(totalCredits, 10);
  const valid = !!clientId && packageName.trim().length > 0 && Number.isInteger(credits) && credits > 0 && credits <= 1000;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await sessionCreditRepo.grant({
        client_profile_id: clientId,
        package_name: packageName.trim(),
        total_credits: credits,
        session_duration_minutes: parseInt(duration, 10),
        ...(coachId && coachId !== 'any' ? { coach_id: coachId } : {}),
      });
      toast.success(`Granted ${credits} session${credits === 1 ? '' : 's'} to ${selected ? profileName(selected) : 'client'}`);
      onSaved();
    } catch (err) {
      toast.error(err?.message || 'Could not grant credits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">GRANT CREDITS</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="grant-client" className="font-display tracking-wider uppercase text-xs">Client</Label>
            {selected ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="text-foreground">{profileName(selected)}</span>
                  <span className="ml-1 text-muted-foreground">{selected.email}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setClientId(''); setSearch(''); }}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="grant-client"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or email..."
                  className="mt-1 bg-secondary border-border"
                />
                {candidates.length > 0 && (
                  <ul className="mt-1 max-h-44 overflow-auto rounded-md border border-border bg-background">
                    {candidates.map((profile) => (
                      <li key={profile.id}>
                        <button
                          type="button"
                          onClick={() => setClientId(profile.id)}
                          className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/5 focus:outline-none focus-visible:bg-accent/10"
                        >
                          <span className="truncate text-foreground">{profileName(profile)}</span>
                          <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grant-count" className="font-display tracking-wider uppercase text-xs">Sessions</Label>
              <Input
                id="grant-count"
                type="number"
                min="1"
                max="1000"
                step="1"
                value={totalCredits}
                onChange={(event) => setTotalCredits(event.target.value)}
                placeholder="e.g. 5"
                className="mt-1 bg-secondary border-border"
              />
            </div>
            <div>
              <Label htmlFor="grant-duration" className="font-display tracking-wider uppercase text-xs">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="grant-duration" className="mt-1 w-full bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 Hour</SelectItem>
                  <SelectItem value="90">1.5 Hours</SelectItem>
                  <SelectItem value="120">2 Hours</SelectItem>
                  <SelectItem value="150">2.5 Hours</SelectItem>
                  <SelectItem value="180">3 Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="grant-package" className="font-display tracking-wider uppercase text-xs">Package name</Label>
            <Input
              id="grant-package"
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label htmlFor="grant-coach" className="font-display tracking-wider uppercase text-xs">Restrict to coach (optional)</Label>
            <Select value={coachId || 'any'} onValueChange={(value) => setCoachId(value === 'any' ? '' : value)}>
              <SelectTrigger id="grant-coach" className="mt-1 w-full bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any coach</SelectItem>
                {coaches.map((coach) => (
                  <SelectItem key={coach.id} value={coach.id}>
                    {[coach.first_name, coach.last_name].filter(Boolean).join(' ') || coach.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={submit}
          disabled={!valid || saving}
          className="mt-2 w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? 'Granting...' : 'Grant credits'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Revoke an entire package through adminOps.revokeCredits (reason required —
// the server marks all credits used and writes the audit entry).
function RevokeDialog({ credit, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const remaining = Math.max(0, (credit.total_credits || 0) - (credit.used_credits || 0));
  const valid = reason.trim().length >= 3;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await sessionCreditRepo.revoke(credit.id, reason.trim());
      toast.success('Credit package revoked');
      onSaved();
    } catch (err) {
      toast.error(err?.message || 'Could not revoke this credit package.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">REVOKE CREDITS</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {credit.client_name || credit.client_email} · {credit.package_name || 'Package'}
        </p>
        <p className="text-sm text-destructive">
          This forfeits the {remaining} remaining session{remaining === 1 ? '' : 's'} on this package. It cannot be undone from here.
        </p>
        <div>
          <Label htmlFor="revoke-reason" className="font-display tracking-wider uppercase text-xs">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="revoke-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this package being revoked? (logged for audit)"
            rows={2}
            className="mt-1 bg-secondary border-border"
          />
        </div>
        <Button
          onClick={submit}
          disabled={!valid || saving}
          className="mt-2 w-full bg-destructive text-destructive-foreground font-display tracking-wider uppercase hover:bg-destructive/90 disabled:opacity-50"
        >
          {saving ? 'Revoking...' : 'Revoke package'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCredits() {
  const { isAdmin } = useCurrentUser();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const loadCredits = async () => {
    try {
      const all = await sessionCreditRepo.list('-created_date');
      setCredits(all);
    } catch (err) {
      console.error('AdminCredits load failed', err);
      toast.error(err?.message || 'Could not load credits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    loadCredits();
     
  }, [isAdmin]);

  const rows = useMemo(() => credits.map((c) => {
    const total = c.total_credits || 0;
    const used = c.used_credits || 0;
    return { ...c, _remaining: total - used, _durationLabel: durationLabel(c.session_duration_minutes) };
  }), [credits]);

  const totals = useMemo(() => ({
    totalRemaining: rows.reduce((sum, r) => sum + Math.max(0, r._remaining), 0),
    records: rows.length,
  }), [rows]);

  const columns = [
    {
      key: 'client',
      header: 'Client',
      sortable: true,
      sortAccessor: (r) => r.client_name || r.client_email,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 flex-shrink-0 ${row._remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
          <div>
            <p className="font-display tracking-wider text-foreground text-sm">{row.client_name || row.client_email}</p>
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
      cell: (r) => (
        <span className={`text-sm font-medium ${r._remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`}>
          {r._remaining}
        </span>
      ),
    },
    { key: 'duration', header: 'Duration', sortable: true, sortAccessor: 'session_duration_minutes', cell: (r) => r._durationLabel },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setRevokeTarget(row)}
            disabled={row._remaining <= 0}
            title="Revoke the remaining sessions on this package"
          >
            <Ban className="w-3 h-3 mr-1" aria-hidden="true" /> Revoke
          </Button>
        </div>
      ),
    },
  ];

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">SESSION CREDITS</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totals.records} record{totals.records === 1 ? '' : 's'} ·
              <span className="text-accent font-medium ml-1">{totals.totalRemaining} session{totals.totalRemaining === 1 ? '' : 's'} outstanding</span>
            </p>
          </div>
          <Button
            onClick={() => setGrantOpen(true)}
            className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
          >
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Grant credits
          </Button>
        </div>
        <p className="mb-6 mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Credits are server-managed: grants and revocations go through the adminOps function and are
          audit-logged. Stripe-purchased packages adjust automatically through refunds on the Payments page.
        </p>

        {loading ? (
          <div className="space-y-3 py-6" aria-busy="true" aria-label="Loading credits">
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-secondary/50" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            searchFields={['client_email', 'client_name', 'package_name']}
            searchPlaceholder="Search by email, name, or package…"
            emptyMessage="No credit records yet — grant the first package above."
          />
        )}
      </div>

      {grantOpen && (
        <GrantDialog
          onClose={() => setGrantOpen(false)}
          onSaved={() => { setGrantOpen(false); void loadCredits(); }}
        />
      )}
      {revokeTarget && (
        <RevokeDialog
          credit={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onSaved={() => { setRevokeTarget(null); void loadCredits(); }}
        />
      )}
    </div>
  );
}
