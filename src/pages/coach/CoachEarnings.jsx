import React, { useEffect, useMemo, useState } from 'react';
import { coachRepo, sessionRepo, stripeConnectedAccountRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  RefreshCw,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency, summarizeSessions } from '@/lib/earnings';
import {
  createStripeConnectAccount,
  createStripeConnectOnboarding,
  refreshStripeConnectAccount,
} from '@/lib/stripeConnect';

function shortDate(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric' }).format(d);
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1 shadow-lg">
      <p className="font-display tracking-wider uppercase text-[10px] text-muted-foreground">
        {shortDate(b.weekStart)} - {shortDate(b.weekEnd)}
      </p>
      <p className="text-foreground">Net: <span className="font-display">{formatCurrency(b.net)}</span></p>
      {b.fees > 0 && <p className="text-muted-foreground">Gross: {formatCurrency(b.gross)} · Fee: {formatCurrency(b.fees)}</p>}
      <p className="text-muted-foreground">{b.sessions} session{b.sessions === 1 ? '' : 's'}</p>
    </div>
  );
}

function requirementsList(account) {
  try {
    const parsed = JSON.parse(account?.requirements_due || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function connectLabel(account) {
  if (!account) return { label: 'Not connected', tone: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
  if (account.charges_enabled && account.payouts_enabled) {
    return { label: 'Ready', tone: 'bg-green-500/10 text-green-500 border-green-500/20' };
  }
  if (account.details_submitted) return { label: 'Reviewing', tone: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
  return { label: 'Onboarding needed', tone: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
}

export default function CoachEarnings() {
  const { user } = useAuth();
  const [coach, setCoach] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [connectAccount, setConnectAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const coachRow = user.coach_id ? await coachRepo.get(user.coach_id).catch(() => null) : null;
    const ssns = user.coach_id ? await sessionRepo.filter({ coach_id: user.coach_id }, '-date') : [];
    const accountRows = user.coach_id
      ? await stripeConnectedAccountRepo.filter({ owner_type: 'coach', owner_id: user.coach_id }).catch(() => [])
      : [];
    setCoach(coachRow);
    setSessions(ssns);
    setConnectAccount(accountRows[0] || null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          console.error('CoachEarnings load failed', err);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const summary = useMemo(() => summarizeSessions(sessions, coach), [sessions, coach]);

  const startOnboarding = async () => {
    if (!user?.coach_id) return;
    setConnecting(true);
    try {
      const account = connectAccount || await createStripeConnectAccount({
        ownerType: 'coach',
        ownerId: user.coach_id,
        email: coach?.email || user.email,
      });
      if (!connectAccount && account?.record_id) await load();
      const link = await createStripeConnectOnboarding({ ownerType: 'coach', ownerId: user.coach_id });
      if (link?.url) window.location.href = link.url;
      else toast.error('Stripe did not return an onboarding link.');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not start Stripe onboarding');
    } finally {
      setConnecting(false);
    }
  };

  const refreshStatus = async () => {
    if (!user?.coach_id) return;
    setRefreshing(true);
    try {
      await refreshStripeConnectAccount({
        ownerType: 'coach',
        ownerId: user.coach_id,
        stripeAccountId: connectAccount?.stripe_account_id,
      });
      await load();
      toast.success('Stripe status refreshed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not refresh Stripe status');
    } finally {
      setRefreshing(false);
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
          <p className="font-display tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
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
  const status = connectLabel(connectAccount);
  const due = requirementsList(connectAccount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Earnings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Payouts are handled through Stripe Connect. {summary.hasFee
            ? <>Platform fee: <span className="text-foreground">{coach.platform_fee_type === 'percent' ? `${coach.platform_fee_value}%` : `${formatCurrency(coach.platform_fee_value)} per session`}</span>.</>
            : 'No platform fee - you keep 100%.'
          }
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'MTD Earnings', value: formatCurrency(summary.mtdNet), sub: mtdSubtitle, icon: DollarSign },
          { label: 'Stripe Payouts', value: status.label, sub: connectAccount?.stripe_account_id || 'Connect account required', icon: Wallet },
          { label: 'Paid This Month', value: summary.paidThisMonth, sub: 'sessions paid', icon: Receipt },
          { label: 'Lifetime', value: formatCurrency(summary.lifetimeNet), sub: summary.hasFee ? `Gross ${formatCurrency(summary.lifetimeGross)}` : 'all-time net', icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Stripe Connect</h2>
              <Badge className={`${status.tone} border`}>{status.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Complete Stripe onboarding so LevelCoach can route card payments to your payout account after verified checkout payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={startOnboarding}
              disabled={connecting}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {connectAccount ? 'Continue Onboarding' : 'Create Account'}
            </Button>
            <Button variant="outline" onClick={refreshStatus} disabled={!connectAccount || refreshing} className="font-display tracking-wider uppercase">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {[
            { label: 'Charges', done: !!connectAccount?.charges_enabled },
            { label: 'Payouts', done: !!connectAccount?.payouts_enabled },
            { label: 'Details', done: !!connectAccount?.details_submitted },
          ].map(item => (
            <div key={item.label} className="border border-border rounded-lg p-3 flex items-center gap-2">
              {item.done ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
              <span className="text-sm text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
        {(due.length > 0 || connectAccount?.disabled_reason) && (
          <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-500">
            {connectAccount?.disabled_reason && <p className="font-medium">Stripe status: {connectAccount.disabled_reason}</p>}
            {due.length > 0 && <p className="mt-1">Outstanding requirements: {due.slice(0, 6).join(', ')}</p>}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">8-Week Trend</h2>
          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Net per week</span>
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
    </div>
  );
}
