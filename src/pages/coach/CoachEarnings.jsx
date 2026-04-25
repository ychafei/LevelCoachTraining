import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, TrendingUp, Wallet, Receipt, BarChart3, AlertTriangle, Save, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency, summarizeSessions } from '@/lib/earnings';
import { formatLongDateET } from '@/lib/formatInET';

const HANDLES = [
  { key: 'venmo',   label: 'Venmo' },
  { key: 'zelle',   label: 'Zelle' },
  { key: 'cashapp', label: 'Cash App' },
  { key: 'paypal',  label: 'PayPal' },
];

function shortDate(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric' }).format(d);
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1 shadow-lg">
      <p className="font-oswald tracking-wider uppercase text-[10px] text-muted-foreground">
        {shortDate(b.weekStart)} – {shortDate(b.weekEnd)}
      </p>
      <p className="text-foreground">Net: <span className="font-oswald">{formatCurrency(b.net)}</span></p>
      {b.fees > 0 && <p className="text-muted-foreground">Gross: {formatCurrency(b.gross)} · Fee: {formatCurrency(b.fees)}</p>}
      <p className="text-muted-foreground">{b.sessions} session{b.sessions === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function CoachEarnings() {
  const { user } = useAuth();
  const [coach, setCoach] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Handles editor — local draft state separate from `coach` so dirty tracking is simple.
  const [draftHandles, setDraftHandles] = useState({ venmo: '', zelle: '', cashapp: '', paypal: '', cash_accepted: false });
  const [savingHandles, setSavingHandles] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const coachRow = user.coach_id
          ? (await base44.entities.Coach.filter({ id: user.coach_id }))[0]
          : null;
        if (cancelled) return;
        setCoach(coachRow || null);
        if (coachRow) {
          setDraftHandles({
            venmo:   coachRow.venmo   || '',
            zelle:   coachRow.zelle   || '',
            cashapp: coachRow.cashapp || '',
            paypal:  coachRow.paypal  || '',
            cash_accepted: !!coachRow.cash_accepted,
          });
        }
        const ssns = user.coach_id
          ? await base44.entities.Session.filter({ coach_id: user.coach_id }, '-date')
          : [];
        if (!cancelled) setSessions(ssns);
      } catch (err) {
        console.error('CoachEarnings load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const summary = useMemo(() => summarizeSessions(sessions, coach), [sessions, coach]);

  const pendingCashSessions = useMemo(() => sessions
    .filter(s => s.payment_method === 'cash' && s.payment_status === 'unpaid' && s.status !== 'cancelled')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [sessions]);

  const markPaid = async (sessionId) => {
    try {
      await base44.entities.Session.update(sessionId, { payment_status: 'paid' });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, payment_status: 'paid' } : s));
      toast.success('Marked as paid');
    } catch (err) {
      toast.error('Could not mark as paid');
      console.error(err);
    }
  };

  const handlesDirty = useMemo(() => {
    if (!coach) return false;
    return draftHandles.venmo !== (coach.venmo || '')
      || draftHandles.zelle !== (coach.zelle || '')
      || draftHandles.cashapp !== (coach.cashapp || '')
      || draftHandles.paypal !== (coach.paypal || '')
      || draftHandles.cash_accepted !== !!coach.cash_accepted;
  }, [coach, draftHandles]);

  const saveHandles = async () => {
    if (!coach || !handlesDirty) return;
    setSavingHandles(true);
    try {
      await base44.entities.Coach.update(coach.id, draftHandles);
      setCoach(prev => prev ? { ...prev, ...draftHandles } : prev);
      toast.success('Payment handles saved');
    } catch (err) {
      toast.error('Could not save handles');
      console.error(err);
    } finally {
      setSavingHandles(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!user?.coach_id) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-oswald tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
          <p className="text-sm text-muted-foreground mt-1">Earnings need a linked coach record. Ask an admin to link your account.</p>
        </div>
      </div>
    );
  }

  const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'long', year: 'numeric' }).format(new Date());
  const trendIsEmpty = summary.weeklyTrend.every(b => b.sessions === 0);

  const mtdSubtitle = summary.hasFee
    ? `Gross ${formatCurrency(summary.mtdGross)} · Fee ${formatCurrency(summary.mtdFees)}`
    : monthLabel;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-oswald text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Earnings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Derived from your completed sessions. {summary.hasFee
            ? <>Platform fee: <span className="text-foreground">{coach.platform_fee_type === 'percent' ? `${coach.platform_fee_value}%` : `${formatCurrency(coach.platform_fee_value)} per session`}</span>.</>
            : 'No platform fee — you keep 100%.'
          }
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'MTD Earnings',     value: formatCurrency(summary.mtdNet),      sub: mtdSubtitle, icon: DollarSign },
          { label: 'Pending Cash',     value: formatCurrency(summary.pendingCashAmount), sub: `${summary.pendingCashCount} session${summary.pendingCashCount === 1 ? '' : 's'}`, icon: Wallet },
          { label: 'Paid This Month',  value: summary.paidThisMonth,                sub: 'sessions paid',           icon: Receipt },
          { label: 'Lifetime',         value: formatCurrency(summary.lifetimeNet),  sub: summary.hasFee ? `Gross ${formatCurrency(summary.lifetimeGross)}` : 'all-time net', icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-oswald text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase">8-Week Trend</h2>
          <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Net per week</span>
        </div>
        {trendIsEmpty ? (
          <div className="py-12 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Complete your first sessions to see your trend.</p>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.weeklyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={shortDate}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  width={50}
                />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} content={<TrendTooltip />} />
                <Bar dataKey="net" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pending cash list */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase">Pending Cash</h2>
          <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">{summary.pendingCashCount} unpaid</span>
        </div>
        {pendingCashSessions.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">All cash collected. Nice.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pendingCashSessions.map(s => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/coach/clients/${encodeURIComponent(s.client_email)}`}
                    className="font-oswald tracking-wider text-foreground text-sm hover:text-accent truncate block"
                  >
                    {s.client_name || s.client_email}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatLongDateET(s.date)} · {s.duration_minutes || ''} min
                  </p>
                </div>
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border text-xs">
                  {formatCurrency(s.total_price || 0)}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => markPaid(s.id)}
                  className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90"
                >
                  Mark Paid
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Handles editor */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase">Payment Handles</h2>
          {handlesDirty && <span className="text-[10px] font-oswald tracking-widest uppercase text-yellow-400">Unsaved</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-4">Shown to clients on the payment screen so they can pay you directly.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HANDLES.map(h => (
            <div key={h.key}>
              <Label className="font-oswald tracking-wider uppercase text-xs">{h.label}</Label>
              <Input
                value={draftHandles[h.key]}
                onChange={e => setDraftHandles(prev => ({ ...prev, [h.key]: e.target.value }))}
                className="bg-secondary border-border mt-1"
                placeholder={h.label === 'Cash App' ? '$cashtag' : `@${h.label.toLowerCase()}`}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Switch
              checked={draftHandles.cash_accepted}
              onCheckedChange={v => setDraftHandles(prev => ({ ...prev, cash_accepted: v }))}
            />
            <Label className="text-sm">Accept cash payments at sessions</Label>
          </div>
          <Button
            onClick={saveHandles}
            disabled={!handlesDirty || savingHandles}
            className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90 disabled:opacity-40"
          >
            <Save className="w-3 h-3 mr-2" /> {savingHandles ? 'Saving…' : 'Save Handles'}
          </Button>
        </div>
      </div>
    </div>
  );
}
