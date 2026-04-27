import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Trash2, Pencil, Zap, Plus, Minus, Undo2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { logAdminAction } from '@/lib/audit';

const ADJUST_TITLES = {
  add: 'Add Credits',
  remove: 'Remove Credits',
  refund: 'Refund Sessions',
};

const ADJUST_HELP = {
  add: 'Number of sessions to add to the total.',
  remove: 'Number of sessions to remove from the total.',
  refund: 'Number of used sessions to return (moves from "used" back to "remaining").',
};

function durationLabel(min) {
  if (!min) return 'N/A';
  return min >= 60 ? `${min / 60} hr${min > 60 ? 's' : ''}` : `${min} min`;
}

function AdjustDialog({ credit, mode, onClose, onSaved, actor }) {
  const [amount, setAmount] = useState(mode === 'refund' ? '1' : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!credit || !mode) return null;

  const total = credit.total_credits || 0;
  const used = credit.used_credits || 0;
  const remaining = total - used;
  const amt = parseInt(amount, 10);
  const amtValid = Number.isFinite(amt) && amt > 0;

  let nextTotal = total;
  let nextUsed = used;
  if (amtValid) {
    if (mode === 'add') nextTotal = total + amt;
    if (mode === 'remove') nextTotal = total - amt;
    if (mode === 'refund') nextUsed = used - amt;
  }
  const nextRemaining = nextTotal - nextUsed;

  const errors = [];
  if (!amtValid) errors.push('Enter a whole number greater than zero.');
  if (amtValid && mode === 'remove' && nextTotal < used) {
    errors.push(`Cannot drop total below used (${used}). Refund used sessions first if needed.`);
  }
  if (amtValid && mode === 'remove' && nextRemaining < 0) {
    errors.push('Remaining cannot go negative.');
  }
  if (amtValid && mode === 'refund' && nextUsed < 0) {
    errors.push(`Cannot refund more than ${used} used session${used === 1 ? '' : 's'}.`);
  }
  if (!reason.trim()) errors.push('A reason is required.');

  const isValid = errors.length === 0;

  const submit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    const before = { total_credits: total, used_credits: used };
    const after = { total_credits: nextTotal, used_credits: nextUsed };
    const patch = {};
    if (nextTotal !== total) patch.total_credits = nextTotal;
    if (nextUsed !== used) patch.used_credits = nextUsed;

    try {
      if (Object.keys(patch).length > 0) {
        await base44.entities.SessionCredit.update(credit.id, patch);
      }
      await logAdminAction({
        actor,
        action: `credit.${mode}`,
        entityType: 'SessionCredit',
        entityId: credit.id,
        before,
        after,
        reason: reason.trim(),
        metadata: {
          client_email: credit.client_email,
          package_name: credit.package_name || '',
          amount: amt,
        },
      });
      toast.success(`${ADJUST_TITLES[mode]} — ${amt} session${amt === 1 ? '' : 's'}`);
      onSaved({ ...credit, ...patch });
    } catch (err) {
      console.error('credit adjust failed', err);
      toast.error('Could not adjust credits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-oswald tracking-wider">{ADJUST_TITLES[mode].toUpperCase()}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {credit.client_name || credit.client_email} · {credit.package_name || 'Package'}
        </p>

        <div className="bg-secondary/50 border border-border rounded p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Total</p>
            <p className="font-oswald text-lg text-foreground">{total}</p>
          </div>
          <div>
            <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Used</p>
            <p className="font-oswald text-lg text-foreground">{used}</p>
          </div>
          <div>
            <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Remaining</p>
            <p className={`font-oswald text-lg ${remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`}>{remaining}</p>
          </div>
        </div>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="font-oswald tracking-wider uppercase text-xs">Amount</Label>
            <p className="text-[11px] text-muted-foreground mb-1">{ADJUST_HELP[mode]}</p>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label className="font-oswald tracking-wider uppercase text-xs">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this adjustment? (logged for audit)"
              rows={2}
              className="bg-secondary border-border mt-1"
            />
          </div>
        </div>

        {amtValid && (
          <div className="bg-secondary/50 border border-border rounded p-3 mt-2">
            <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground mb-2">After</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="font-oswald text-base text-foreground">
                  {nextTotal}
                  {nextTotal !== total && (
                    <span className={`text-xs ml-1 ${nextTotal > total ? 'text-green-400' : 'text-destructive'}`}>
                      ({nextTotal > total ? '+' : ''}{nextTotal - total})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Used</p>
                <p className="font-oswald text-base text-foreground">
                  {nextUsed}
                  {nextUsed !== used && (
                    <span className={`text-xs ml-1 ${nextUsed > used ? 'text-destructive' : 'text-green-400'}`}>
                      ({nextUsed > used ? '+' : ''}{nextUsed - used})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Remaining</p>
                <p className={`font-oswald text-base ${nextRemaining < 0 ? 'text-destructive' : 'text-accent'}`}>
                  {nextRemaining}
                </p>
              </div>
            </div>
          </div>
        )}

        {amtValid && errors.length > 0 && (
          <ul className="text-xs text-destructive space-y-1 mt-2 list-disc pl-5">
            {errors.filter((e) => e !== 'A reason is required.').map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        <Button
          onClick={submit}
          disabled={!isValid || saving}
          className="mt-4 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : `${ADJUST_TITLES[mode]}${amtValid ? ` (${amt})` : ''}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function EditInfoDialog({ credit, onClose, onSaved, actor }) {
  const [packageName, setPackageName] = useState(credit?.package_name || '');
  const [duration, setDuration] = useState(String(credit?.session_duration_minutes || 60));
  const [saving, setSaving] = useState(false);

  if (!credit) return null;

  const dirty =
    packageName !== (credit.package_name || '') ||
    parseInt(duration, 10) !== (credit.session_duration_minutes || 0);

  const submit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const patch = {
      package_name: packageName,
      session_duration_minutes: parseInt(duration, 10),
    };
    const before = {
      package_name: credit.package_name || '',
      session_duration_minutes: credit.session_duration_minutes || null,
    };
    try {
      await base44.entities.SessionCredit.update(credit.id, patch);
      await logAdminAction({
        actor,
        action: 'credit.edit_info',
        entityType: 'SessionCredit',
        entityId: credit.id,
        before,
        after: patch,
        metadata: { client_email: credit.client_email },
      });
      toast.success('Package info updated');
      onSaved({ ...credit, ...patch });
    } catch (err) {
      console.error(err);
      toast.error('Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-oswald tracking-wider">EDIT PACKAGE INFO</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{credit.client_name || credit.client_email}</p>
        <p className="text-[11px] text-muted-foreground">
          To change the credit count, use Add / Remove / Refund instead.
        </p>
        <div className="space-y-4 mt-4">
          <div>
            <Label className="font-oswald tracking-wider uppercase text-xs">Package Name</Label>
            <Input
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label className="font-oswald tracking-wider uppercase text-xs">Duration per Session</Label>
            <Select value={duration} onValueChange={setDuration}>
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
        <Button
          onClick={submit}
          disabled={!dirty || saving}
          className="mt-4 w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCredits() {
  const { user, isAdmin, isSuperAdmin } = useCurrentUser();
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
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
    if (!isAdmin) { setLoading(false); return; }
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
        'Prefer Remove credits with a reason for normal cleanup.',
        'This cannot be undone.',
      ],
      confirmLabel: 'Delete record',
      cancelLabel: 'Keep record',
      variant: 'destructive',
      requireTyped: 'DELETE',
    });
    if (!ok) return;

    const before = {
      total_credits: credit.total_credits,
      used_credits: credit.used_credits,
      package_name: credit.package_name,
    };
    try {
      await base44.entities.SessionCredit.delete(credit.id);
      setCredits((prev) => prev.filter((c) => c.id !== credit.id));
      await logAdminAction({
        actor: user,
        action: 'credit.delete',
        entityType: 'SessionCredit',
        entityId: credit.id,
        before,
        metadata: { client_email: credit.client_email },
      });
      toast.success('Credit record deleted.');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete credit.');
    }
  };

  const bulkDelete = async () => {
    if (!isSuperAdmin) {
      toast.error('Only a super admin can bulk-delete credit records.');
      return;
    }
    if (credits.length === 0) return;
    const ok = await confirm({
      title: `Delete all ${credits.length} credit records?`,
      description: 'Permanently removes every SessionCredit record. There is no undo.',
      consequences: [
        'Every client loses any remaining package credits.',
        'Existing Session bookings are not deleted — handle those separately.',
        'Use this for test data cleanup only.',
      ],
      confirmLabel: `Delete ${credits.length}`,
      cancelLabel: 'Cancel',
      variant: 'destructive',
      requireTyped: `DELETE ${credits.length}`,
    });
    if (!ok) return;

    const ids = credits.map((c) => c.id);
    const results = await Promise.allSettled(ids.map((id) => base44.entities.SessionCredit.delete(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const deletedSet = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
    setCredits((prev) => prev.filter((c) => !deletedSet.has(c.id)));
    await logAdminAction({
      actor: user,
      action: 'credit.bulk_delete',
      entityType: 'SessionCredit',
      metadata: {
        attempted: ids.length,
        deleted: deletedSet.size,
        failed,
        bulk_ids: Array.from(deletedSet),
      },
    });
    if (failed === 0) toast.success(`Deleted ${deletedSet.size} credit record${deletedSet.size === 1 ? '' : 's'}`);
    else toast.error(`Deleted ${deletedSet.size}, ${failed} failed — see console`);
  };

  const onAdjustSaved = (updated) => {
    setCredits((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setAdjustTarget(null);
  };

  const onEditSaved = (updated) => {
    setCredits((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditTarget(null);
  };

  const rows = useMemo(() => credits.map((c) => {
    const total = c.total_credits || 0;
    const used = c.used_credits || 0;
    return { ...c, _remaining: total - used, _durationLabel: durationLabel(c.session_duration_minutes) };
  }), [credits]);

  const totalsByMath = useMemo(() => {
    const totalRemaining = rows.reduce((sum, r) => sum + Math.max(0, r._remaining), 0);
    const records = rows.length;
    return { totalRemaining, records };
  }, [rows]);

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
      cell: (r) => (
        <span className={`text-sm font-medium ${r._remaining > 0 ? 'text-accent' : 'text-destructive'}`}>
          {r._remaining}
        </span>
      ),
    },
    { key: 'duration', header: 'Duration', sortable: true, sortAccessor: 'session_duration_minutes', cell: (r) => r._durationLabel },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center gap-1 justify-end flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-green-400 hover:text-green-400 hover:bg-green-500/10"
            onClick={() => setAdjustTarget({ credit: row, mode: 'add' })}
            title="Add credits to this record"
          >
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-yellow-400 hover:text-yellow-400 hover:bg-yellow-500/10"
            onClick={() => setAdjustTarget({ credit: row, mode: 'refund' })}
            title="Move credits from used back to remaining (e.g. exception refund)"
            disabled={(row.used_credits || 0) === 0}
          >
            <Undo2 className="w-3 h-3 mr-1" /> Refund
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-orange-400 hover:text-orange-400 hover:bg-orange-500/10"
            onClick={() => setAdjustTarget({ credit: row, mode: 'remove' })}
            title="Reduce the total — cannot drop below used"
            disabled={(row._remaining || 0) <= 0}
          >
            <Minus className="w-3 h-3 mr-1" /> Remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8"
            onClick={() => setEditTarget(row)}
            title="Edit package name / duration"
          >
            <Pencil className="w-3 h-3 mr-1" /> Info
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => handleDelete(row)}
            title="Permanently delete this credit record"
          >
            <Trash2 className="w-3 h-3" />
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
            <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground">SESSION CREDITS</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {totalsByMath.records} record{totalsByMath.records === 1 ? '' : 's'} ·
              <span className="text-accent font-medium ml-1">{totalsByMath.totalRemaining} session{totalsByMath.totalRemaining === 1 ? '' : 's'} outstanding</span>
            </p>
          </div>
          {isSuperAdmin && (
            <Button
              variant="outline"
              onClick={bulkDelete}
              disabled={credits.length === 0}
              className="font-oswald tracking-wider uppercase text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              title="Permanently delete every SessionCredit record (super admin)"
            >
              <Lock className="w-3 h-3 mr-1.5" />
              <Trash2 className="w-3 h-3 mr-1.5" /> Delete all {credits.length}
            </Button>
          )}
        </div>
        <div className="mb-6 mt-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Use <strong className="text-green-400">Add</strong> / <strong className="text-yellow-400">Refund</strong> / <strong className="text-orange-400">Remove</strong> for normal credit changes — every adjustment requires a reason and is written to the audit log.
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
          </div>
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

      {adjustTarget && (
        <AdjustDialog
          credit={adjustTarget.credit}
          mode={adjustTarget.mode}
          actor={user}
          onClose={() => setAdjustTarget(null)}
          onSaved={onAdjustSaved}
        />
      )}

      {editTarget && (
        <EditInfoDialog
          credit={editTarget}
          actor={user}
          onClose={() => setEditTarget(null)}
          onSaved={onEditSaved}
        />
      )}

      {confirmDialog}
    </div>
  );
}
