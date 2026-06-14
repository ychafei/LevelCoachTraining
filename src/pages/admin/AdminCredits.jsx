import React, { useEffect, useMemo, useState } from 'react';
import { coachRepo, creditLedgerRepo, profileRepo, sessionCreditRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Ban, BookOpenText, Info, Plus, RotateCcw, Snowflake, Unlock, WalletCards, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import { formatCents, shortId } from '@/features/admin/money';

function profileName(profile) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email;
}

function cents(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function creditRemainingCents(credit) {
  const remaining = Number(credit.remaining_amount_cents);
  if (Number.isInteger(remaining)) return Math.max(0, remaining);
  const available = Number(credit.available_amount_cents);
  if (Number.isInteger(available)) return Math.max(0, available);
  const total = Number(credit.total_credits) || 0;
  const used = Number(credit.used_credits) || 0;
  const left = Math.max(0, total - used);
  const perSession = cents(credit.per_session_base_price_cents)
    || (total > 0 ? Math.floor((Number(credit.amount_cents) || 0) / total) : 0);
  return left * perSession;
}

function statusClass(status) {
  if (status === 'active') return 'border-green-500/20 bg-green-500/10 text-green-600';
  if (status === 'frozen') return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700';
  if (status === 'refunded') return 'border-blue-500/20 bg-blue-500/10 text-blue-600';
  return 'border-border bg-secondary text-muted-foreground';
}

function ledgerTypeClass(type) {
  if (type === 'purchase' || type === 'restore' || type === 'top_up') return 'border-green-500/20 bg-green-500/10 text-green-600';
  if (type === 'reserve') return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700';
  if (type === 'release') return 'border-primary/20 bg-primary/10 text-primary';
  if (type === 'refund' || type === 'dispute_freeze') return 'border-destructive/20 bg-destructive/10 text-destructive';
  return 'border-border bg-secondary text-muted-foreground';
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
  const [amountDollars, setAmountDollars] = useState('');
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
  const amountCents = Math.round(Number(amountDollars) * 100);
  const validAmount = Number.isInteger(amountCents) && amountCents > 0;
  const valid = !!clientId
    && packageName.trim().length > 0
    && Number.isInteger(credits)
    && credits > 0
    && credits <= 1000
    && validAmount;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await sessionCreditRepo.grant({
        client_profile_id: clientId,
        package_name: packageName.trim(),
        total_credits: credits,
        session_duration_minutes: parseInt(duration, 10),
        amount_cents: amountCents,
        ...(coachId && coachId !== 'any' ? { coach_id: coachId } : {}),
      });
      toast.success(`Granted ${formatCents(amountCents)} in credit to ${selected ? profileName(selected) : 'client'}`);
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
          <DialogTitle>Grant credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="grant-client" className="text-xs font-semibold">Client</Label>
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
              <Label htmlFor="grant-count" className="text-xs font-semibold">Sessions</Label>
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
              <Label htmlFor="grant-value" className="text-xs font-semibold">Credit value (USD)</Label>
              <Input
                id="grant-value"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amountDollars}
                onChange={(event) => setAmountDollars(event.target.value)}
                placeholder="e.g. 250.00"
                className="mt-1 bg-secondary border-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grant-duration" className="text-xs font-semibold">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="grant-duration" className="mt-1 w-full bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="150">2.5 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!validAmount && amountDollars && (
            <p className="text-xs text-destructive">Enter a positive credit value in dollars.</p>
          )}
          <div>
            <Label htmlFor="grant-package" className="text-xs font-semibold">Package name</Label>
            <Input
              id="grant-package"
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label htmlFor="grant-coach" className="text-xs font-semibold">Restrict to coach (optional)</Label>
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
          className="mt-2 w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90 disabled:opacity-50"
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
  const remaining = creditRemainingCents(credit);
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
          <DialogTitle>Revoke credits</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {credit.client_name || credit.client_email} · {credit.package_name || 'Package'}
        </p>
        <p className="text-sm text-destructive">
          This forfeits {formatCents(remaining)} of remaining value on this credit. It cannot be undone from here.
        </p>
        <div>
          <Label htmlFor="revoke-reason" className="text-xs font-semibold">
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
          className="mt-2 w-full bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-50"
        >
          {saving ? 'Revoking...' : 'Revoke package'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const CREDIT_ACTIONS = {
  freeze: {
    title: 'Freeze credit',
    button: 'Freeze credit',
    tone: 'bg-yellow-600 text-white hover:bg-yellow-700',
    needsAmount: false,
  },
  unfreeze: {
    title: 'Unfreeze credit',
    button: 'Unfreeze credit',
    tone: 'bg-accent text-accent-foreground hover:bg-accent/90',
    needsAmount: false,
  },
  adjust: {
    title: 'Admin adjustment',
    button: 'Apply adjustment',
    tone: 'bg-accent text-accent-foreground hover:bg-accent/90',
    needsAmount: true,
    signed: true,
  },
  restore: {
    title: 'Manual restore',
    button: 'Restore credit',
    tone: 'bg-accent text-accent-foreground hover:bg-accent/90',
    needsAmount: true,
    signed: false,
  },
};

function CreditActionDialog({ credit, action, onClose, onSaved }) {
  const meta = CREDIT_ACTIONS[action];
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const amountCents = Math.round(Number(amount) * 100);
  const validAmount = !meta.needsAmount
    || (Number.isInteger(amountCents) && (meta.signed ? amountCents !== 0 : amountCents > 0));
  const validReason = action === 'unfreeze' ? reason.trim().length <= 1000 : reason.trim().length >= 3;
  const valid = validAmount && validReason;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (action === 'freeze') await sessionCreditRepo.freeze(credit.id, reason.trim());
      if (action === 'unfreeze') await sessionCreditRepo.unfreeze(credit.id, reason.trim());
      if (action === 'adjust') await sessionCreditRepo.adjust(credit.id, amountCents, reason.trim());
      if (action === 'restore') await sessionCreditRepo.restore(credit.id, amountCents, reason.trim());
      toast.success(`${meta.title} saved`);
      onSaved();
    } catch (err) {
      toast.error(err?.message || `Could not ${meta.title.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
            <p className="font-semibold text-foreground">{credit.client_name || credit.client_email || credit.client_profile_id}</p>
            <p className="text-xs text-muted-foreground">
              {credit.package_name || 'Training package'} · {formatCents(creditRemainingCents(credit))} remaining · status {credit.status || 'active'}
            </p>
          </div>
          {meta.needsAmount && (
            <div>
              <Label htmlFor="credit-action-amount" className="text-xs font-semibold">
                Amount (USD){meta.signed ? ' — use negative to reduce' : ''}
              </Label>
              <Input
                id="credit-action-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={meta.signed ? '25.00 or -10.00' : '25.00'}
                className="mt-1 border-border bg-secondary"
              />
              {!validAmount && (
                <p className="mt-1 text-xs text-destructive">
                  {meta.signed ? 'Enter a non-zero dollar amount.' : 'Enter a positive dollar amount.'}
                </p>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="credit-action-reason" className="text-xs font-semibold">
              Reason{action === 'unfreeze' ? '' : ' *'}
            </Label>
            <Textarea
              id="credit-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Support note stored in audit and credit ledger metadata."
              className="mt-1 border-border bg-secondary"
            />
            {!validReason && action !== 'unfreeze' && (
              <p className="mt-1 text-xs text-destructive">Reason must be at least 3 characters.</p>
            )}
          </div>
        </div>
        <Button
          onClick={submit}
          disabled={!valid || saving}
          className={`mt-2 w-full font-semibold disabled:opacity-50 ${meta.tone}`}
        >
          {saving ? 'Saving...' : meta.button}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCredits() {
  const { isAdmin } = useCurrentUser();
  const [credits, setCredits] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);

  const loadCredits = async () => {
    try {
      setLoading(true);
      const [all, ledgerRows] = await Promise.all([
        sessionCreditRepo.list('-created_date'),
        creditLedgerRepo.list('-created_date').catch(() => []),
      ]);
      setCredits(all);
      setLedger(ledgerRows);
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
    const remainingCents = creditRemainingCents(c);
    return {
      ...c,
      _clientLabel: c.client_name || c.client_email || c.client_profile_id || c.owner_profile_id || '',
      _remaining_cents: remainingCents,
      _reserved_cents: cents(c.reserved_amount_cents),
      _spent_cents: cents(c.spent_amount_cents || c.earned_amount_cents),
      _original_cents: cents(c.original_amount_cents || c.amount_cents),
      _status: c.status || 'active',
    };
  }), [credits]);

  const totals = useMemo(() => ({
    totalRemainingCents: rows.reduce((sum, r) => sum + Math.max(0, r._remaining_cents), 0),
    totalReservedCents: rows.reduce((sum, r) => sum + Math.max(0, r._reserved_cents), 0),
    totalSpentCents: rows.reduce((sum, r) => sum + Math.max(0, r._spent_cents), 0),
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
          <Zap className={`w-4 h-4 flex-shrink-0 ${row._remaining_cents > 0 ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">{row.client_name || row.client_email}</p>
            <p className="text-xs text-muted-foreground">{row.client_email}</p>
          </div>
        </div>
      ),
    },
    { key: 'package_name', header: 'Package', sortable: true, cell: (r) => r.package_name || '—' },
    {
      key: 'remaining_value',
      header: 'Remaining',
      sortable: true,
      sortAccessor: '_remaining_cents',
      cell: (r) => (
        <span className={`text-sm font-semibold ${r._remaining_cents > 0 ? 'text-accent' : 'text-muted-foreground'}`}>
          {formatCents(r._remaining_cents)}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      sortable: true,
      sortAccessor: '_reserved_cents',
      cell: (r) => <span className="text-sm text-foreground">{formatCents(r._reserved_cents)}</span>,
    },
    {
      key: 'spent',
      header: 'Spent',
      sortable: true,
      sortAccessor: '_spent_cents',
      cell: (r) => <span className="text-sm text-foreground">{formatCents(r._spent_cents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: '_status',
      cell: (r) => <Badge className={`border text-[10px] ${statusClass(r._status)}`}>{r._status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          {row._status === 'frozen' ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-accent"
              onClick={() => setActionTarget({ credit: row, action: 'unfreeze' })}
              title="Unfreeze this credit"
            >
              <Unlock className="mr-1 h-3 w-3" aria-hidden="true" /> Unfreeze
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-yellow-700 hover:bg-yellow-500/10 hover:text-yellow-700"
              onClick={() => setActionTarget({ credit: row, action: 'freeze' })}
              title="Freeze this credit"
            >
              <Snowflake className="mr-1 h-3 w-3" aria-hidden="true" /> Freeze
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-accent"
            onClick={() => setActionTarget({ credit: row, action: 'adjust' })}
            title="Apply an admin adjustment"
          >
            <WalletCards className="mr-1 h-3 w-3" aria-hidden="true" /> Adjust
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-accent"
            onClick={() => setActionTarget({ credit: row, action: 'restore' })}
            title="Restore value for a support exception"
          >
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" /> Restore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setRevokeTarget(row)}
            disabled={row._remaining_cents <= 0}
            title="Revoke the remaining value on this package"
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
            <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Session credits</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totals.records} record{totals.records === 1 ? '' : 's'} ·
              <span className="text-accent font-medium ml-1">{formatCents(totals.totalRemainingCents)} held</span>
              <span className="ml-2">{formatCents(totals.totalReservedCents)} reserved</span>
              <span className="ml-2">{formatCents(totals.totalSpentCents)} spent</span>
            </p>
          </div>
          <Button
            onClick={() => setGrantOpen(true)}
            className="bg-accent text-accent-foreground font-semibold text-xs hover:bg-accent/90"
          >
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> Grant credits
          </Button>
        </div>
        <p className="mb-6 mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Credits are server-managed: grants, freezes, restores, adjustments, and revocations go through
          adminOps and write audit/credit-ledger rows. Clients never mutate balances directly.
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
            searchFields={['client_email', 'client_name', '_clientLabel', 'package_name', 'status']}
            searchPlaceholder="Search by email, name, or package…"
            emptyMessage="No credit records yet — grant the first package above."
          />
        )}

        <section className="mt-8 rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-foreground">
              <BookOpenText className="h-4 w-4 text-accent" aria-hidden="true" /> Credit ledger
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Append-only credit movements from checkout, reservation, release, refunds, and admin exceptions.</p>
          </div>
          {loading ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading credit ledger">
              <div className="h-10 animate-pulse rounded bg-secondary/50" />
              <div className="h-10 animate-pulse rounded bg-secondary/50" />
            </div>
          ) : ledger.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No credit ledger entries yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {ledger.slice(0, 50).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={`border text-[10px] ${ledgerTypeClass(entry.type)}`}>
                        {String(entry.type || 'entry').replace(/_/g, ' ')}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{shortId(entry.credit_id || entry.credit_lot_id)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {entry.session_id ? `Session ${shortId(entry.session_id)} · ` : ''}
                      {entry.payment_record_id ? `Payment ${shortId(entry.payment_record_id)} · ` : ''}
                      {entry.created_date ? new Date(entry.created_date).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="font-display font-bold text-foreground">{formatCents(entry.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
      {actionTarget && (
        <CreditActionDialog
          credit={actionTarget.credit}
          action={actionTarget.action}
          onClose={() => setActionTarget(null)}
          onSaved={() => { setActionTarget(null); void loadCredits(); }}
        />
      )}
    </div>
  );
}
