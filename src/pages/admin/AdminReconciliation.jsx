import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { databases, DB_ID, Query, mapDoc } from '@/api/appwriteClient';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { bpsToPercentLabel, formatCents, shortId } from '@/features/admin/money';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  CreditCard,
  Download,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 100;
const PAYMENT_LEDGER = 'payment_ledger_entries';
const CREDIT_LEDGER = 'credit_ledger_entries';

const PAYMENT_CHARGE_TYPES = new Set(['charge', 'checkout_charge']);
const PLATFORM_FEE_TYPES = new Set(['platform_fee', 'platform_fee_earned']);
const COACH_PAYOUT_TYPES = new Set(['coach_payout', 'coach_payout_earned']);
const ORG_PAYOUT_TYPES = new Set(['org_payout', 'org_payout_earned']);
const REFUND_TYPES = new Set(['refund', 'credit_refunded']);
const TRANSFER_REVERSAL_TYPES = new Set(['transfer_reversal', 'stripe_transfer_reversed']);

const CREDIT_PURCHASE_TYPES = new Set(['purchase', 'top_up', 'checkout_grant', 'top_up_grant', 'admin_grant', 'migration_import']);
const CREDIT_RESERVE_TYPES = new Set(['reserve', 'reservation_hold']);
const CREDIT_RESTORE_TYPES = new Set(['restore', 'reservation_release']);
const CREDIT_RELEASE_TYPES = new Set(['release', 'reservation_capture']);
const CREDIT_REFUND_TYPES = new Set(['refund', 'refund_debit', 'admin_debit', 'dispute_loss', 'legacy_advance_recovery']);
const CREDIT_FREEZE_TYPES = new Set(['dispute_freeze', 'credit_dispute_hold']);
const CREDIT_DISPUTE_RELEASE_TYPES = new Set(['dispute_release', 'credit_dispute_release']);

const QUEUE_STATUSES = new Set(['pending', 'held', 'processing']);
const FAILED_TRANSFER_STATUSES = new Set(['failed']);
const DISPUTED_STATES = new Set(['disputed', 'dispute_created', 'dispute_lost', 'chargeback']);

const LEDGER_TONES = {
  charge: 'bg-green-500/10 text-green-600 border-green-500/20',
  checkout_charge: 'bg-green-500/10 text-green-600 border-green-500/20',
  platform_fee: 'bg-accent/10 text-accent border-accent/20',
  coach_payout: 'bg-primary/10 text-primary border-primary/20',
  org_payout: 'bg-primary/10 text-primary border-primary/20',
  refund: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  transfer_reversal: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  dispute: 'bg-destructive/10 text-destructive border-destructive/20',
  purchase: 'bg-green-500/10 text-green-600 border-green-500/20',
  reserve: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  restore: 'bg-green-500/10 text-green-600 border-green-500/20',
  release: 'bg-primary/10 text-primary border-primary/20',
  top_up: 'bg-green-500/10 text-green-600 border-green-500/20',
  dispute_freeze: 'bg-destructive/10 text-destructive border-destructive/20',
  admin_adjustment: 'bg-accent/10 text-accent border-accent/20',
};

const LEDGER_LABELS = {
  charge: 'Charge',
  checkout_charge: 'Charge',
  platform_fee: 'Platform fee',
  platform_fee_earned: 'Platform fee',
  coach_payout: 'Coach payout',
  coach_payout_earned: 'Coach payout',
  org_payout: 'Org payout',
  org_payout_earned: 'Org payout',
  refund: 'Refund',
  credit_refunded: 'Refund',
  transfer_reversal: 'Transfer reversal',
  stripe_transfer_reversed: 'Transfer reversal',
  dispute: 'Dispute',
  purchase: 'Credit purchase',
  reserve: 'Credit reserve',
  restore: 'Credit restore',
  release: 'Credit release',
  transfer: 'Credit transfer',
  top_up: 'Credit top-up',
  dispute_freeze: 'Dispute freeze',
  admin_adjustment: 'Admin adjustment',
};

const emptyFilters = {
  date_from: '',
  date_to: '',
  coach_id: 'all',
  organization_id: 'all',
  athlete_id: '',
  payment_record_id: '',
  credit_id: '',
  session_id: '',
};

async function listAllDocuments(collectionId, queries = []) {
  const out = [];
  let cursor = null;
  while (true) {
    const page = await databases.listDocuments(DB_ID, collectionId, [
      ...queries,
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    out.push(...page.documents.map(mapDoc));
    if (page.documents.length < PAGE_SIZE) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return out;
}

function cents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function createdAt(row) {
  return row?.created_date || row?.created_at || row?.$createdAt || '';
}

function createdDay(row) {
  const raw = createdAt(row);
  return raw ? String(raw).slice(0, 10) : '';
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function rowType(row) {
  return String(row?.type || row?.entry_type || '').trim();
}

function rowPaymentId(row) {
  return String(row?.payment_record_id || row?.id || '').trim();
}

function rowCreditId(row) {
  return String(row?.credit_id || row?.credit_lot_id || '').trim();
}

function rowSessionId(row) {
  const meta = parseJson(row?.metadata);
  return String(row?.session_id || meta.session_id || '').trim();
}

function rowAthleteId(row) {
  const meta = parseJson(row?.metadata);
  return String(row?.athlete_id || meta.athlete_id || '').trim();
}

function rowCoachId(row) {
  const meta = parseJson(row?.metadata);
  return String(
    row?.coach_id
    || (row?.owner_type === 'coach' ? row?.owner_id : '')
    || row?.to_coach_id
    || row?.from_coach_id
    || meta.coach_id
    || meta.original_coach_id
    || meta.selected_coach_id
    || '',
  ).trim();
}

function rowOrgId(row) {
  const meta = parseJson(row?.metadata);
  return String(
    row?.organization_id
    || (row?.owner_type === 'org' ? row?.owner_id : '')
    || meta.organization_id
    || meta.originating_organization_id
    || '',
  ).trim();
}

function ownerLabel(row, coachNames, orgNames) {
  if (row.owner_type === 'coach') return coachNames[row.owner_id] || `Coach ${shortId(row.owner_id)}`;
  if (row.owner_type === 'org') return orgNames[row.owner_id] || `Org ${shortId(row.owner_id)}`;
  if (row.owner_type) return row.owner_type;
  return 'platform';
}

function coachName(coach) {
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim()
    || coach.name
    || `Coach ${shortId(coach.id)}`;
}

function athleteName(athlete) {
  return [athlete.first_name, athlete.last_name].filter(Boolean).join(' ').trim()
    || athlete.name
    || `Athlete ${shortId(athlete.id)}`;
}

function matchesFilters(row, filters) {
  const day = createdDay(row);
  if (filters.date_from && day && day < filters.date_from) return false;
  if (filters.date_to && day && day > filters.date_to) return false;
  if (filters.coach_id !== 'all' && rowCoachId(row) !== filters.coach_id) return false;
  if (filters.organization_id !== 'all' && rowOrgId(row) !== filters.organization_id) return false;
  if (filters.athlete_id && !rowAthleteId(row).includes(filters.athlete_id.trim())) return false;
  if (filters.payment_record_id && !rowPaymentId(row).includes(filters.payment_record_id.trim())) return false;
  if (filters.credit_id && !rowCreditId(row).includes(filters.credit_id.trim())) return false;
  if (filters.session_id && !rowSessionId(row).includes(filters.session_id.trim())) return false;
  return true;
}

function creditDelta(entry) {
  const type = rowType(entry);
  const amount = cents(entry.amount_cents);
  const hasAvailable = Number.isFinite(Number(entry.available_delta_cents));
  const hasReserved = Number.isFinite(Number(entry.reserved_delta_cents));
  let available = hasAvailable ? cents(entry.available_delta_cents) : 0;
  let reserved = hasReserved ? cents(entry.reserved_delta_cents) : 0;
  let released = 0;
  let refunded = 0;

  if (!hasAvailable && !hasReserved) {
    if (CREDIT_PURCHASE_TYPES.has(type)) available += amount;
    else if (CREDIT_RESERVE_TYPES.has(type)) { available -= amount; reserved += amount; }
    else if (CREDIT_RESTORE_TYPES.has(type)) available += amount;
    else if (CREDIT_RELEASE_TYPES.has(type)) { reserved -= amount; released += amount; }
    else if (CREDIT_REFUND_TYPES.has(type)) { available -= Math.abs(amount); refunded += Math.abs(amount); }
    else if (type === 'admin_adjustment') available += amount;
  } else {
    if (CREDIT_RELEASE_TYPES.has(type)) released += Math.abs(amount);
    if (CREDIT_REFUND_TYPES.has(type)) refunded += Math.abs(amount);
    if (type === 'admin_adjustment' && amount !== 0 && available === 0 && reserved === 0) available += amount;
  }

  return { available, reserved, released, refunded };
}

function buildCreditBalances(creditLedger) {
  const byCredit = new Map();
  for (const entry of creditLedger) {
    const creditId = rowCreditId(entry);
    if (!creditId) continue;
    const current = byCredit.get(creditId) || {
      credit_id: creditId,
      available_cents: 0,
      reserved_cents: 0,
      released_cents: 0,
      refunded_cents: 0,
      last_entry_at: '',
      frozen: false,
      freeze_count: 0,
    };
    const delta = creditDelta(entry);
    current.available_cents += delta.available;
    current.reserved_cents += delta.reserved;
    current.released_cents += delta.released;
    current.refunded_cents += delta.refunded;
    if (!current.last_entry_at || createdAt(entry) > current.last_entry_at) current.last_entry_at = createdAt(entry);
    if (CREDIT_FREEZE_TYPES.has(rowType(entry))) {
      current.frozen = true;
      current.freeze_count += 1;
    }
    if (CREDIT_DISPUTE_RELEASE_TYPES.has(rowType(entry))) current.frozen = false;
    byCredit.set(creditId, current);
  }
  return [...byCredit.values()].map((row) => ({
    ...row,
    available_cents: Math.max(0, row.available_cents),
    reserved_cents: Math.max(0, row.reserved_cents),
    liability_cents: Math.max(0, row.available_cents + row.reserved_cents),
  }));
}

function sumRows(rows, predicate) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? Math.abs(cents(row.amount_cents ?? row.amount)) : 0), 0);
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function buildMismatches(payments, paymentLedger, creditLedger) {
  const byPaymentLedger = groupBy(paymentLedger, rowPaymentId);
  const byCreditLedger = groupBy(creditLedger, rowPaymentId);

  return payments.flatMap((payment) => {
    const paymentId = payment.id;
    const paymentAmount = cents(payment.amount || payment.amount_cents);
    const paidLike = ['paid', 'refunded'].includes(payment.status) || ['paid', 'partially_refunded', 'refunded', 'disputed'].includes(payment.state);
    const payRows = byPaymentLedger.get(paymentId) || [];
    const creditRows = byCreditLedger.get(paymentId) || [];
    const chargeLedger = sumRows(payRows, (row) => PAYMENT_CHARGE_TYPES.has(rowType(row)));
    const creditPurchase = sumRows(creditRows, (row) => CREDIT_PURCHASE_TYPES.has(rowType(row)));
    const paymentRefund = sumRows(payRows, (row) => REFUND_TYPES.has(rowType(row)));
    const recordRefund = cents(payment.refunded_amount);
    const creditId = payment.credit_lot_id || payment.credit_id || creditRows[0]?.credit_id || creditRows[0]?.credit_lot_id || '';
    const reasons = [];

    if (paidLike && paymentAmount > 0 && chargeLedger !== paymentAmount) {
      reasons.push(`charge ledger ${formatCents(chargeLedger)} != Stripe record ${formatCents(paymentAmount)}`);
    }
    if (paidLike && creditId && paymentAmount > 0 && creditPurchase !== paymentAmount) {
      reasons.push(`credit purchase ledger ${formatCents(creditPurchase)} != Stripe record ${formatCents(paymentAmount)}`);
    }
    if (recordRefund > 0 && paymentRefund !== recordRefund) {
      reasons.push(`refund ledger ${formatCents(paymentRefund)} != Stripe refunded ${formatCents(recordRefund)}`);
    }
    if (DISPUTED_STATES.has(String(payment.state || '').toLowerCase()) || cents(payment.disputed_amount_cents) > 0) {
      const hasFreeze = creditRows.some((row) => CREDIT_FREEZE_TYPES.has(rowType(row)));
      if (creditId && !hasFreeze) reasons.push('disputed payment has no dispute freeze credit ledger row');
    }

    if (!reasons.length) return [];
    return [{
      id: paymentId,
      payment_record_id: paymentId,
      credit_id: creditId,
      amount_cents: paymentAmount,
      status: payment.state || payment.status || '',
      reasons,
      created_date: createdAt(payment),
    }];
  });
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCsv(filename, rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function moneyCard(label, value, Icon, hint, tone = 'text-accent') {
  return (
    <div key={label} className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LedgerBadge({ type }) {
  return (
    <Badge className={`border text-[10px] ${LEDGER_TONES[type] || 'bg-secondary text-muted-foreground border-border'}`}>
      {LEDGER_LABELS[type] || String(type || 'entry').replace(/_/g, ' ')}
    </Badge>
  );
}

function Section({ title, icon: Icon, children, description, action }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.01em] text-foreground">
            {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ children = 'No rows match these filters.' }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

function CompactTable({ headers, rows, renderRow, empty }) {
  if (!rows.length) return <EmptyRow>{empty}</EmptyRow>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {headers.map((header) => <th key={header} scope="col" className="p-3">{header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

export default function AdminReconciliation() {
  const { isAdmin } = useCurrentUser();
  const [filters, setFilters] = useState(emptyFilters);
  const [paymentLedger, setPaymentLedger] = useState([]);
  const [creditLedger, setCreditLedger] = useState([]);
  const [payments, setPayments] = useState([]);
  const [credits, setCredits] = useState([]);
  const [payoutObligations, setPayoutObligations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const coachNames = useMemo(() => Object.fromEntries(coaches.map((coach) => [coach.id, coachName(coach)])), [coaches]);
  const orgNames = useMemo(() => Object.fromEntries(organizations.map((org) => [org.id, org.name || `Org ${shortId(org.id)}`])), [organizations]);
  const athleteNames = useMemo(() => Object.fromEntries(athletes.map((athlete) => [athlete.id, athleteName(athlete)])), [athletes]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [
        paymentLedgerRows,
        creditLedgerRows,
        paymentRows,
        creditRows,
        obligationRows,
        transferRows,
        coachRows,
        orgRows,
        athleteRows,
      ] = await Promise.all([
        listAllDocuments(PAYMENT_LEDGER).catch(() => []),
        listAllDocuments(CREDIT_LEDGER).catch(() => []),
        listAllDocuments('stripe_payment_records').catch(() => []),
        listAllDocuments('session_credits').catch(() => []),
        listAllDocuments('payout_obligations').catch(() => []),
        listAllDocuments('stripe_transfer_records').catch(() => []),
        listAllDocuments('coaches').catch(() => []),
        listAllDocuments('organizations').catch(() => []),
        listAllDocuments('athlete_profiles').catch(() => []),
      ]);
      setPaymentLedger(paymentLedgerRows);
      setCreditLedger(creditLedgerRows);
      setPayments(paymentRows);
      setCredits(creditRows);
      setPayoutObligations(obligationRows);
      setTransfers(transferRows);
      setCoaches(coachRows);
      setOrganizations(orgRows);
      setAthletes(athleteRows);
    } catch (err) {
      const message = err?.message || 'Could not load reconciliation data.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    void load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const paymentLedgerRows = paymentLedger.filter((row) => matchesFilters(row, filters));
    const creditLedgerRows = creditLedger.filter((row) => matchesFilters(row, filters));
    const paymentRows = payments.filter((row) => matchesFilters(row, filters));
    const creditRows = credits.filter((row) => matchesFilters(row, filters));
    const obligationRows = payoutObligations.filter((row) => matchesFilters(row, filters));
    const transferRows = transfers.filter((row) => matchesFilters(row, filters));
    const mismatches = buildMismatches(paymentRows, paymentLedgerRows, creditLedgerRows);
    return {
      paymentLedger: paymentLedgerRows,
      creditLedger: creditLedgerRows,
      payments: paymentRows,
      credits: creditRows,
      payoutObligations: obligationRows,
      transfers: transferRows,
      mismatches,
    };
  }, [creditLedger, credits, filters, paymentLedger, payments, payoutObligations, transfers]);

  const summary = useMemo(() => {
    const creditBalances = buildCreditBalances(filtered.creditLedger);
    const pendingQueue = filtered.payoutObligations.filter((row) => QUEUE_STATUSES.has(row.status));
    const failedTransfers = filtered.transfers.filter((row) => FAILED_TRANSFER_STATUSES.has(row.status));
    const refundRows = filtered.paymentLedger.filter((row) => REFUND_TYPES.has(rowType(row)) || TRANSFER_REVERSAL_TYPES.has(rowType(row)));
    const disputePaymentRows = filtered.payments.filter((row) =>
      DISPUTED_STATES.has(String(row.state || row.status || '').toLowerCase()) || cents(row.disputed_amount_cents) > 0);
    const disputeCreditRows = filtered.creditLedger.filter((row) => CREDIT_FREEZE_TYPES.has(rowType(row)));
    const frozenCreditIds = new Set([
      ...disputeCreditRows.map(rowCreditId).filter(Boolean),
      ...filtered.credits.filter((credit) => credit.status === 'frozen').map((credit) => credit.id),
    ]);
    const frozenCredits = [...frozenCreditIds].map((creditId) => ({
      credit_id: creditId,
      credit: filtered.credits.find((credit) => credit.id === creditId) || null,
      freezes: disputeCreditRows.filter((row) => rowCreditId(row) === creditId),
    }));
    const releasedCreditCents = creditBalances.reduce((sum, row) => sum + Math.max(0, row.released_cents), 0);

    return {
      charge_cents: sumRows(filtered.paymentLedger, (row) => PAYMENT_CHARGE_TYPES.has(rowType(row))),
      active_credit_liability_cents: creditBalances.reduce((sum, row) => sum + row.liability_cents, 0),
      reserved_credit_cents: creditBalances.reduce((sum, row) => sum + row.reserved_cents, 0),
      released_credit_cents: releasedCreditCents,
      platform_fee_cents: sumRows(filtered.paymentLedger, (row) => PLATFORM_FEE_TYPES.has(rowType(row))),
      coach_payout_cents: sumRows(filtered.paymentLedger, (row) => COACH_PAYOUT_TYPES.has(rowType(row))),
      org_payout_cents: sumRows(filtered.paymentLedger, (row) => ORG_PAYOUT_TYPES.has(rowType(row))),
      refund_cents: sumRows(filtered.paymentLedger, (row) => REFUND_TYPES.has(rowType(row))),
      transfer_reversal_cents: sumRows(filtered.paymentLedger, (row) => TRANSFER_REVERSAL_TYPES.has(rowType(row))),
      pendingQueue,
      failedTransfers,
      refundRows,
      disputePaymentRows,
      disputeCreditRows,
      frozenCredits,
      creditBalances,
    };
  }, [filtered]);

  const activeFilterCount = Object.entries(filters)
    .filter(([key, value]) => value && value !== 'all' && value !== emptyFilters[key])
    .length;

  const exportAccountingCsv = () => {
    const summaryRows = [
      ['total_stripe_charges_collected_cents', summary.charge_cents],
      ['total_active_client_credit_liability_cents', summary.active_credit_liability_cents],
      ['total_reserved_credits_cents', summary.reserved_credit_cents],
      ['total_released_spent_credits_cents', summary.released_credit_cents],
      ['total_platform_fees_earned_cents', summary.platform_fee_cents],
      ['total_coach_payouts_released_cents', summary.coach_payout_cents],
      ['total_org_payouts_released_cents', summary.org_payout_cents],
      ['refunds_cents', summary.refund_cents],
      ['transfer_reversals_cents', summary.transfer_reversal_cents],
      ['pending_release_queue_count', summary.pendingQueue.length],
      ['failed_stripe_transfers_count', summary.failedTransfers.length],
      ['disputed_payments_count', summary.disputePaymentRows.length],
      ['frozen_dispute_credits_count', summary.frozenCredits.length],
      ['reconciliation_mismatches_count', filtered.mismatches.length],
    ].map(([metric, value]) => ({ section: 'summary', metric, value }));

    const rows = [
      ...summaryRows,
      ...filtered.paymentLedger.map((row) => ({
        section: 'payment_ledger_entries',
        id: row.id,
        created_at: createdAt(row),
        payment_record_id: row.payment_record_id,
        credit_id: row.credit_lot_id,
        session_id: row.session_id,
        type: rowType(row),
        owner_type: row.owner_type,
        owner_id: row.owner_id,
        coach_id: rowCoachId(row),
        organization_id: rowOrgId(row),
        amount_cents: cents(row.amount_cents),
        currency: row.currency || 'usd',
      })),
      ...filtered.creditLedger.map((row) => ({
        section: 'credit_ledger_entries',
        id: row.id,
        created_at: createdAt(row),
        payment_record_id: row.payment_record_id,
        credit_id: rowCreditId(row),
        session_id: rowSessionId(row),
        athlete_id: rowAthleteId(row),
        type: rowType(row),
        coach_id: rowCoachId(row),
        organization_id: rowOrgId(row),
        amount_cents: cents(row.amount_cents),
        available_delta_cents: row.available_delta_cents,
        reserved_delta_cents: row.reserved_delta_cents,
        currency: row.currency || 'usd',
      })),
      ...filtered.mismatches.map((row) => ({
        section: 'reconciliation_mismatch',
        payment_record_id: row.payment_record_id,
        credit_id: row.credit_id,
        amount_cents: row.amount_cents,
        status: row.status,
        reasons: row.reasons.join('; '),
      })),
    ];
    downloadCsv(`levelcoach-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-accent">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to admin
            </Link>
            <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Reconciliation</h1>
            <p className="text-muted-foreground">
              Delayed-payout accounting from payment_ledger_entries and credit_ledger_entries.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={load} disabled={loading} className="font-semibold">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
            <Button onClick={exportAccountingCsv} disabled={loading} className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
              <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV
            </Button>
          </div>
        </div>

        {error && (
          <p className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Search className="h-4 w-4 text-accent" aria-hidden="true" />
                Filters
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Filters apply to ledger rows, queues, transfer records, payments, and mismatch checks.
              </p>
            </div>
            {activeFilterCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
                Clear {activeFilterCount}
              </Button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs font-semibold">Date from</Label>
              <Input type="date" value={filters.date_from} onChange={(e) => updateFilter('date_from', e.target.value)} className="mt-1 border-border bg-secondary" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Date to</Label>
              <Input type="date" value={filters.date_to} onChange={(e) => updateFilter('date_to', e.target.value)} className="mt-1 border-border bg-secondary" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Coach</Label>
              <Select value={filters.coach_id} onValueChange={(value) => updateFilter('coach_id', value)}>
                <SelectTrigger className="mt-1 border-border bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coaches</SelectItem>
                  {coaches.map((coach) => <SelectItem key={coach.id} value={coach.id}>{coachName(coach)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Organization</Label>
              <Select value={filters.organization_id} onValueChange={(value) => updateFilter('organization_id', value)}>
                <SelectTrigger className="mt-1 border-border bg-secondary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organizations</SelectItem>
                  {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name || shortId(org.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Athlete ID</Label>
              <Input value={filters.athlete_id} onChange={(e) => updateFilter('athlete_id', e.target.value)} placeholder="athlete id" className="mt-1 border-border bg-secondary" list="athlete-filter-options" />
              <datalist id="athlete-filter-options">
                {athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athleteName(athlete)}</option>)}
              </datalist>
            </div>
            <div>
              <Label className="text-xs font-semibold">Payment record ID</Label>
              <Input value={filters.payment_record_id} onChange={(e) => updateFilter('payment_record_id', e.target.value)} placeholder="payment id" className="mt-1 border-border bg-secondary" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Credit ID</Label>
              <Input value={filters.credit_id} onChange={(e) => updateFilter('credit_id', e.target.value)} placeholder="credit id" className="mt-1 border-border bg-secondary" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Session ID</Label>
              <Input value={filters.session_id} onChange={(e) => updateFilter('session_id', e.target.value)} placeholder="session id" className="mt-1 border-border bg-secondary" />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading reconciliation">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
            <Skeleton className="h-52 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {moneyCard('Stripe charges collected', formatCents(summary.charge_cents), CreditCard, `${filtered.paymentLedger.length} payment ledger rows`)}
              {moneyCard('Active credit liability', formatCents(summary.active_credit_liability_cents), WalletCards, 'ledger-derived available + reserved')}
              {moneyCard('Reserved credits', formatCents(summary.reserved_credit_cents), Scale, 'held for booked sessions')}
              {moneyCard('Released/spent credits', formatCents(summary.released_credit_cents), TrendingUp, 'earned session value')}
              {moneyCard('Platform fees earned', formatCents(summary.platform_fee_cents), TrendingUp, 'platform_fee ledger rows')}
              {moneyCard('Coach payouts released', formatCents(summary.coach_payout_cents), WalletCards, 'coach_payout ledger rows')}
              {moneyCard('Org payouts released', formatCents(summary.org_payout_cents), WalletCards, 'org_payout ledger rows')}
              {moneyCard('Refunds and reversals', formatCents(summary.refund_cents + summary.transfer_reversal_cents), RotateCcw, `${summary.refundRows.length} ledger rows`)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {moneyCard('Pending release queue', String(summary.pendingQueue.length), AlertTriangle, 'pending, held, processing payout obligations', summary.pendingQueue.length ? 'text-yellow-700' : 'text-accent')}
              {moneyCard('Failed Stripe transfers', String(summary.failedTransfers.length), AlertTriangle, 'failed transfer records', summary.failedTransfers.length ? 'text-destructive' : 'text-accent')}
              {moneyCard('Disputed payments', String(summary.disputePaymentRows.length), AlertTriangle, `${summary.disputeCreditRows.length} dispute freeze rows`, summary.disputePaymentRows.length ? 'text-destructive' : 'text-accent')}
              {moneyCard('Frozen dispute credits', String(summary.frozenCredits.length), WalletCards, 'credits frozen from dispute state', summary.frozenCredits.length ? 'text-destructive' : 'text-accent')}
            </div>

            {filtered.mismatches.length > 0 ? (
              <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {filtered.mismatches.length} payment{filtered.mismatches.length === 1 ? '' : 's'} need reconciliation
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The Stripe payment record, payment ledger, and credit ledger do not agree for the rows below.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Scale className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Filtered payments reconcile</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Charge, refund, and purchase ledger checks match the loaded Stripe payment records.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Section title="Reconciliation mismatches" icon={AlertTriangle} description="Stripe record versus payment ledger versus credit ledger.">
                <CompactTable
                  headers={['Payment', 'Credit', 'Amount', 'Status', 'Issue']}
                  rows={filtered.mismatches.slice(0, 50)}
                  empty="No mismatches for these filters."
                  renderRow={(row) => (
                    <tr key={row.id}>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.payment_record_id)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.credit_id)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.amount_cents)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{String(row.status || '').replace(/_/g, ' ')}</td>
                      <td className="p-3 text-xs text-destructive">{row.reasons.join('; ')}</td>
                    </tr>
                  )}
                />
              </Section>

              <Section title="Pending release queue" icon={WalletCards} description="Payout obligations waiting on release or retry.">
                <CompactTable
                  headers={['Status', 'Owner', 'Session', 'Amount', 'Share']}
                  rows={summary.pendingQueue.slice(0, 50)}
                  empty="No pending release obligations."
                  renderRow={(row) => (
                    <tr key={row.id}>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{row.status}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{ownerLabel(row, coachNames, orgNames)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.session_id)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.amount_cents)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{bpsToPercentLabel(row.share_bps)}</td>
                    </tr>
                  )}
                />
              </Section>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Section title="Failed Stripe transfers" icon={AlertTriangle} description="Transfer records marked failed by delayed payout release.">
                <CompactTable
                  headers={['Transfer', 'Owner', 'Session', 'Amount', 'Payment']}
                  rows={summary.failedTransfers.slice(0, 50)}
                  empty="No failed Stripe transfers."
                  renderRow={(row) => (
                    <tr key={row.id}>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.transfer_id || row.id)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{ownerLabel(row, coachNames, orgNames)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.session_id)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.amount_cents || row.amount)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.payment_record_id)}</td>
                    </tr>
                  )}
                />
              </Section>

              <Section title="Refunds and disputes" icon={RotateCcw} description="Refund ledger rows, transfer reversals, and disputed payment records.">
                <CompactTable
                  headers={['Type', 'Payment', 'Credit/session', 'Amount', 'Date']}
                  rows={[
                    ...summary.refundRows.map((row) => ({ kind: 'ledger', ...row })),
                    ...summary.disputePaymentRows.map((row) => ({ kind: 'payment_dispute', ...row })),
                  ].slice(0, 50)}
                  empty="No refunds, reversals, or disputes for these filters."
                  renderRow={(row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td className="p-3">{row.kind === 'payment_dispute' ? <Badge className="border border-destructive/20 bg-destructive/10 text-xs text-destructive">Dispute</Badge> : <LedgerBadge type={rowType(row)} />}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.payment_record_id || row.id)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(rowCreditId(row) || rowSessionId(row))}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.kind === 'payment_dispute' ? row.disputed_amount_cents || row.amount : row.amount_cents)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{createdDay(row) || '-'}</td>
                    </tr>
                  )}
                />
              </Section>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Section title="Credits frozen due to disputes" icon={WalletCards} description="Frozen credit ids from dispute_freeze ledger rows or frozen credit state.">
                <CompactTable
                  headers={['Credit', 'Athlete', 'Balance', 'Freeze rows', 'Status']}
                  rows={summary.frozenCredits.slice(0, 50)}
                  empty="No frozen dispute credits."
                  renderRow={(row) => {
                    const balance = summary.creditBalances.find((credit) => credit.credit_id === row.credit_id);
                    return (
                      <tr key={row.credit_id}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.credit_id)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{athleteNames[row.credit?.athlete_id] || shortId(row.credit?.athlete_id)}</td>
                        <td className="p-3 font-semibold text-foreground">{formatCents(balance?.liability_cents || 0)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{row.freezes.length}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{row.credit?.status || 'ledger freeze'}</Badge></td>
                      </tr>
                    );
                  }}
                />
              </Section>

              <Section title="Credit balances from ledger" icon={BookOpenText} description="Append-only credit ledger balance rollup by credit id.">
                <CompactTable
                  headers={['Credit', 'Available', 'Reserved', 'Released', 'Refunded']}
                  rows={summary.creditBalances.sort((a, b) => b.liability_cents - a.liability_cents).slice(0, 50)}
                  empty="No credit ledger balances."
                  renderRow={(row) => (
                    <tr key={row.credit_id}>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.credit_id)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.available_cents)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.reserved_cents)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatCents(row.released_cents)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatCents(row.refunded_cents)}</td>
                    </tr>
                  )}
                />
              </Section>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              <Section title="Recent payment ledger" icon={CreditCard}>
                <CompactTable
                  headers={['Type', 'Payment', 'Owner', 'Session', 'Amount']}
                  rows={filtered.paymentLedger.slice(0, 50)}
                  empty="No payment ledger entries."
                  renderRow={(row) => (
                    <tr key={row.id}>
                      <td className="p-3"><LedgerBadge type={rowType(row)} /></td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.payment_record_id)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{ownerLabel(row, coachNames, orgNames)}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(row.session_id)}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.amount_cents)}</td>
                    </tr>
                  )}
                />
              </Section>

              <Section title="Recent credit ledger" icon={WalletCards}>
                <CompactTable
                  headers={['Type', 'Credit', 'Athlete', 'Session', 'Amount']}
                  rows={filtered.creditLedger.slice(0, 50)}
                  empty="No credit ledger entries."
                  renderRow={(row) => (
                    <tr key={row.id}>
                      <td className="p-3"><LedgerBadge type={rowType(row)} /></td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(rowCreditId(row))}</td>
                      <td className="p-3 text-xs text-muted-foreground">{athleteNames[rowAthleteId(row)] || shortId(rowAthleteId(row))}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{shortId(rowSessionId(row))}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCents(row.amount_cents)}</td>
                    </tr>
                  )}
                />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
