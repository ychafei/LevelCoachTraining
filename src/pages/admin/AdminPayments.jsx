import React, { useEffect, useMemo, useState } from 'react';
import {
  stripePaymentRecordRepo,
  stripeTransferRecordRepo,
  stripeWebhookEventRepo,
} from '@/api/repo';
import { refundStripePayment } from '@/lib/stripeConnect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ArrowLeft, CreditCard, RefreshCw, RotateCcw, Webhook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

function formatCents(cents) {
  return `$${((Number(cents) || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortId(value) {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
}

function statusTone(status) {
  if (status === 'paid' || status === 'processed') return 'bg-green-500/10 text-green-500 border-green-500/20';
  if (status === 'refunded' || status === 'reversed') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (status === 'failed' || status === 'cancelled') return 'bg-destructive/10 text-destructive border-destructive/20';
  return 'bg-muted text-muted-foreground border-border';
}

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    const [paymentRows, transferRows, eventRows] = await Promise.all([
      stripePaymentRecordRepo.list('-created_date').catch(() => []),
      stripeTransferRecordRepo.list('-created_date').catch(() => []),
      stripeWebhookEventRepo.list('-created_date').catch(() => []),
    ]);
    setPayments(paymentRows);
    setTransfers(transferRows);
    setEvents(eventRows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const paid = payments.filter(p => p.status === 'paid');
    const refunded = payments.filter(p => p.status === 'refunded');
    const failed = payments.filter(p => p.status === 'failed' || p.status === 'cancelled');
    return {
      paidAmount: paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      paidCount: paid.length,
      refundedCount: refunded.length,
      failedCount: failed.length,
    };
  }, [payments]);

  const refundPayment = async (payment) => {
    const ok = await confirm({
      title: 'Refund this Stripe payment?',
      description: `This requests a full refund for ${formatCents(payment.amount)} and closes the linked credit package when applicable.`,
      confirmLabel: 'Refund payment',
      cancelLabel: 'Keep payment',
      variant: 'destructive',
    });
    if (!ok) return;
    setRefundingId(payment.id);
    try {
      await refundStripePayment({ paymentRecordId: payment.id, reason: 'Admin reconciliation refund' });
      toast.success('Refund requested');
      await load();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not refund payment');
    } finally {
      setRefundingId('');
    }
  };

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to admin
            </Link>
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">PAYMENTS</h1>
            <p className="text-muted-foreground">Stripe checkout, transfer, refund, and webhook reconciliation.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="font-display tracking-wider uppercase">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Paid Volume', value: formatCents(stats.paidAmount), sub: `${stats.paidCount} payments` },
            { label: 'Refunded', value: stats.refundedCount, sub: 'full refunds' },
            { label: 'Failed / Cancelled', value: stats.failedCount, sub: 'payment records' },
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
              <div className="p-6 text-sm text-muted-foreground">Loading payments...</div>
            ) : payments.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No Stripe payment records yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {payments.map(payment => (
                  <div key={payment.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CreditCard className="h-4 w-4 text-accent" />
                          <p className="font-display text-sm font-bold tracking-wider text-foreground">{formatCents(payment.amount)}</p>
                          <Badge className={`${statusTone(payment.status)} border`}>{payment.status || 'created'}</Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <p>Checkout: <span className="font-mono text-foreground">{shortId(payment.checkout_session_id)}</span></p>
                          <p>Intent: <span className="font-mono text-foreground">{shortId(payment.payment_intent_id)}</span></p>
                          <p>Charge: <span className="font-mono text-foreground">{shortId(payment.charge_id)}</span></p>
                          <p>Credit: <span className="font-mono text-foreground">{shortId(payment.credit_id)}</span></p>
                          <p>Fee: <span className="text-foreground">{formatCents(payment.application_fee || 0)}</span></p>
                          <p>Destination: <span className="font-mono text-foreground">{shortId(payment.transfer_destination)}</span></p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refundPayment(payment)}
                        disabled={payment.status !== 'paid' || !payment.payment_intent_id || refundingId === payment.id}
                        className="font-display tracking-wider uppercase text-xs"
                      >
                        <RotateCcw className="mr-2 h-3 w-3" />
                        Refund
                      </Button>
                    </div>
                  </div>
                ))}
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
                    <p className="mt-1 text-xs text-muted-foreground">Destination {shortId(transfer.destination_account_id)}</p>
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
                        <Webhook className="h-4 w-4 flex-shrink-0 text-accent" />
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
      {dialog}
    </div>
  );
}
