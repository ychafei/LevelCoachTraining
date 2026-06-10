import React, { useEffect, useMemo, useState } from 'react';
import {
  ledgerRepo,
  stripePaymentRecordRepo,
  stripeTransferRecordRepo,
  stripeWebhookEventRepo,
} from '@/api/repo';
import { refundPayment } from '@/lib/stripeConnect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCents, shortId } from '@/features/admin/money';
import { ArrowLeft, BookOpenText, CreditCard, RefreshCw, RotateCcw, Webhook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

function statusTone(status) {
  if (status === 'paid' || status === 'processed') return 'bg-green-500/10 text-green-500 border-green-500/20';
  if (status === 'refunded' || status === 'reversed') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (status === 'partially_refunded') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
  if (status === 'disputed') return 'bg-destructive/10 text-destructive border-destructive/20';
  if (status === 'failed' || status === 'cancelled') return 'bg-destructive/10 text-destructive border-destructive/20';
  return 'bg-muted text-muted-foreground border-border';
}

function remainingCents(payment) {
  return Math.max(0, (Number(payment.amount) || 0) - (Number(payment.refunded_amount) || 0));
}

function refundable(payment) {
  if (payment.state === 'disputed') return false;
  if (payment.status === 'refunded' || payment.state === 'refunded') return false;
  if (!['paid'].includes(payment.status) && payment.state !== 'partially_refunded') return false;
  if (!payment.charge_id && !payment.payment_intent_id) return false;
  return remainingCents(payment) > 0;
}

// Refund dialog. `request_id` is minted ONCE when the dialog opens — it is the
// Stripe idempotency anchor, so a retry of the same submission can never
// double-refund.
function RefundDialog({ payment, onClose, onDone }) {
  const remaining = remainingCents(payment);
  const [requestId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const amountCents = Math.round(Number(amount) * 100);
  const validAmount = Number.isInteger(amountCents) && amountCents > 0 && amountCents <= remaining;

  const submit = async () => {
    if (!validAmount || saving) return;
    setSaving(true);
    try {
      const result = await refundPayment({
        payment_record_id: payment.id,
        amount_cents: amountCents,
        request_id: requestId,
        reason: reason.trim() || undefined,
      });
      toast.success(
        result?.state === 'refunded'
          ? 'Payment fully refunded'
          : `Refunded ${formatCents(amountCents)} (partial)`,
      );
      onDone();
    } catch (err) {
      toast.error(err?.message || 'Could not refund this payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">REFUND PAYMENT</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {formatCents(payment.amount)} paid · {formatCents(payment.refunded_amount || 0)} already refunded ·{' '}
          <span className="text-foreground">{formatCents(remaining)} remaining</span>
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="refund-amount" className="font-display text-xs uppercase tracking-wider">Refund amount (USD)</Label>
            <Input
              id="refund-amount"
              type="number"
              min="0.01"
              max={(remaining / 100).toFixed(2)}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 bg-secondary border-border"
            />
            {!validAmount && (
              <p className="mt-1 text-xs text-destructive">Enter an amount between $0.01 and {formatCents(remaining)}.</p>
            )}
          </div>
          <div>
            <Label htmlFor="refund-reason" className="font-display text-xs uppercase tracking-wider">Reason</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Why is this payment being refunded? (stored on the refund + audit log)"
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Transfers to the coach/organization are reversed proportionally and linked credits are adjusted server-side.
          </p>
        </div>
        <Button
          onClick={submit}
          disabled={!validAmount || saving}
          className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-display uppercase tracking-wider"
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {saving ? 'Refunding...' : `Refund ${validAmount ? formatCents(amountCents) : ''}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [events, setEvents] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refundTarget, setRefundTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const [paymentRows, transferRows, eventRows, ledgerRows] = await Promise.all([
      stripePaymentRecordRepo.list('-created_date').catch(() => []),
      stripeTransferRecordRepo.list('-created_date').catch(() => []),
      stripeWebhookEventRepo.list('-created_date').catch(() => []),
      ledgerRepo.list('-created_date').catch(() => []),
    ]);
    setPayments(paymentRows);
    setTransfers(transferRows);
    setEvents(eventRows);
    setLedger(ledgerRows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const ledgerByPayment = useMemo(() => {
    const map = new Map();
    for (const entry of ledger) {
      if (!entry.payment_record_id) continue;
      if (!map.has(entry.payment_record_id)) map.set(entry.payment_record_id, []);
      map.get(entry.payment_record_id).push(entry);
    }
    return map;
  }, [ledger]);

  const stats = useMemo(() => {
    let paidAmount = 0;
    let paidCount = 0;
    let refundedAmount = 0;
    let disputedCount = 0;
    for (const payment of payments) {
      const state = payment.state || payment.status;
      if (['paid', 'partially_refunded', 'refunded'].includes(state) || payment.status === 'paid') {
        paidAmount += Number(payment.amount) || 0;
        paidCount += 1;
      }
      refundedAmount += Number(payment.refunded_amount) || 0;
      if (state === 'disputed') disputedCount += 1;
    }
    return { paidAmount, paidCount, refundedAmount, disputedCount };
  }, [payments]);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to admin
            </Link>
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">PAYMENTS</h1>
            <p className="text-muted-foreground">Stripe checkout, transfer, refund, ledger, and webhook reconciliation.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="font-display tracking-wider uppercase">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Paid Volume', value: formatCents(stats.paidAmount), sub: `${stats.paidCount} payments` },
            { label: 'Refunded', value: formatCents(stats.refundedAmount), sub: 'accumulated refund amounts' },
            { label: 'Disputed', value: stats.disputedCount, sub: 'payments in dispute' },
            { label: 'Webhook Events', value: events.length, sub: 'stored for idempotency' },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-foreground">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Stripe Payment Records</h2>
            </div>
            {loading ? (
              <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading payments">
                <div className="h-16 animate-pulse rounded bg-secondary/50" />
                <div className="h-16 animate-pulse rounded bg-secondary/50" />
              </div>
            ) : payments.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No Stripe payment records yet. Records appear after the first checkout completes.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {payments.map(payment => {
                  const legs = ledgerByPayment.get(payment.id) || [];
                  const refunded = Number(payment.refunded_amount) || 0;
                  return (
                    <div key={payment.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CreditCard className="h-4 w-4 text-accent" aria-hidden="true" />
                            <p className="font-display text-sm font-bold tracking-wider text-foreground">{formatCents(payment.amount)}</p>
                            <Badge className={`${statusTone(payment.status)} border`}>{payment.status || 'created'}</Badge>
                            {payment.state && payment.state !== payment.status && (
                              <Badge className={`${statusTone(payment.state)} border`}>{payment.state}</Badge>
                            )}
                          </div>
                          {refunded > 0 && (
                            <p className="mt-1 text-xs text-blue-500">
                              {formatCents(refunded)} refunded · {formatCents(remainingCents(payment))} remaining
                            </p>
                          )}
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <p>Checkout: <span className="font-mono text-foreground">{shortId(payment.checkout_session_id)}</span></p>
                            <p>Intent: <span className="font-mono text-foreground">{shortId(payment.payment_intent_id)}</span></p>
                            <p>Charge: <span className="font-mono text-foreground">{shortId(payment.charge_id)}</span></p>
                            <p>Credit: <span className="font-mono text-foreground">{shortId(payment.credit_id)}</span></p>
                            {payment.refund_id && (
                              <p>Refund: <span className="font-mono text-foreground">{shortId(payment.refund_id)}</span></p>
                            )}
                          </div>
                          {legs.length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-semibold text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                                <BookOpenText className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                                {legs.length} ledger entr{legs.length === 1 ? 'y' : 'ies'}
                              </summary>
                              <ul className="mt-2 space-y-1 border-l border-border pl-3">
                                {legs.map((entry) => (
                                  <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-muted-foreground">
                                      {entry.type} · {entry.owner_type}{entry.stripe_ref ? ` · ${shortId(entry.stripe_ref)}` : ''}
                                    </span>
                                    <span className="font-mono text-foreground">{formatCents(entry.amount_cents)}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRefundTarget(payment)}
                          disabled={!refundable(payment)}
                          className="font-display tracking-wider uppercase text-xs"
                        >
                          <RotateCcw className="mr-2 h-3 w-3" aria-hidden="true" />
                          Refund
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Transfers</h2>
              </div>
              <div className="divide-y divide-border">
                {transfers.slice(0, 12).map(transfer => (
                  <div key={transfer.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-foreground">{formatCents(transfer.amount || 0)}</span>
                      <Badge className={`${statusTone(transfer.status)} border`}>{transfer.status || 'pending'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Destination {shortId(transfer.destination_account_id)}
                      {transfer.reversal_id ? ` · reversal ${shortId(transfer.reversal_id)}` : ''}
                    </p>
                  </div>
                ))}
                {transfers.length === 0 && <div className="p-4 text-sm text-muted-foreground">No transfer records yet.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Webhook Events</h2>
              </div>
              <div className="divide-y divide-border">
                {events.slice(0, 12).map(event => (
                  <div key={event.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-foreground">
                        <Webhook className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
                        <span className="truncate">{event.type || 'event'}</span>
                      </span>
                      <Badge className={`${statusTone(event.status)} border`}>{event.status || 'stored'}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{shortId(event.stripe_event_id)}</p>
                  </div>
                ))}
                {events.length === 0 && <div className="p-4 text-sm text-muted-foreground">No webhook events yet.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {refundTarget && (
        <RefundDialog
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={() => { setRefundTarget(null); void load(); }}
        />
      )}
    </div>
  );
}
