import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionRepo, coachRepo, profileRepo, coachApplicationRepo, sessionCreditRepo, auditLogRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import {
  Users, Calendar, FileText, DollarSign, Briefcase, PenTool, MessageSquare,
  Shield, MailX, Zap, CalendarClock, CheckCircle2, UserCheck, History,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const adminLinks = [
  { label: 'Coaches', path: '/admin/coaches', icon: Users, desc: 'Manage coach profiles' },
  { label: 'Bookings', path: '/admin/bookings', icon: Calendar, desc: 'View all sessions' },
  { label: 'Credits', path: '/admin/credits', icon: Zap, desc: 'Add, refund, or remove credits' },
  { label: 'Content', path: '/admin/content', icon: FileText, desc: 'Edit site content' },
  { label: 'Pricing', path: '/admin/pricing', icon: DollarSign, desc: 'Manage packages' },
  { label: 'Applications', path: '/admin/applications', icon: Briefcase, desc: 'Review applications' },
  { label: 'Blog', path: '/admin/blog', icon: PenTool, desc: 'Create & edit posts' },
  { label: 'Users', path: '/admin/users', icon: Shield, desc: 'Manage users & roles' },
  { label: 'Messages', path: '/admin/messages', icon: MessageSquare, desc: 'View conversations' },
  { label: 'Unsubscribes', path: '/admin/unsubscribes', icon: MailX, desc: 'Manage unsubscribes' },
];

function todayET() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function currentMonthPrefixET() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit',
  }).format(new Date());
}

function formatUSD(n) {
  return `$${(Math.round((n || 0) * 100) / 100).toLocaleString()}`;
}

function describeAuditEntry(entry) {
  const action = entry.action || 'unknown';
  const actor = (entry.actor_email || 'system').split('@')[0];
  const target = entry.metadata?.target_email || entry.metadata?.coach_name || entry.entity_id || '';
  const reason = entry.reason ? ` — "${entry.reason}"` : '';

  const verbs = {
    'session.delete': 'deleted a session',
    'session.bulk_delete': `bulk-deleted ${entry.metadata?.deleted ?? '?'} session${entry.metadata?.deleted === 1 ? '' : 's'}`,
    'session.status_change': `changed session status to ${entry.after?.status || '?'}`,
    'credit.add': `added ${entry.metadata?.amount ?? '?'} credit${entry.metadata?.amount === 1 ? '' : 's'}`,
    'credit.remove': `removed ${entry.metadata?.amount ?? '?'} credit${entry.metadata?.amount === 1 ? '' : 's'}`,
    'credit.refund': `refunded ${entry.metadata?.amount ?? '?'} session${entry.metadata?.amount === 1 ? '' : 's'}`,
    'credit.delete': 'deleted a credit record',
    'credit.bulk_delete': `bulk-deleted ${entry.metadata?.deleted ?? '?'} credit record${entry.metadata?.deleted === 1 ? '' : 's'}`,
    'credit.grant': `granted ${entry.after?.total_credits ?? '?'} credit${entry.after?.total_credits === 1 ? '' : 's'}`,
    'credit.edit_info': 'updated package info',
    'user.role_change': `changed role ${entry.before?.role || '?'} → ${entry.after?.role || '?'}`,
    'user.ban': 'banned a user',
    'user.unban': 'unbanned a user',
    'user.invite': `invited a ${entry.metadata?.invited_role || 'user'}`,
    'user.warn': 'sent a warning',
    'coach.create': 'created a coach profile',
    'coach.update': 'updated a coach profile',
    'coach.activate': 'activated a coach',
    'coach.deactivate': 'deactivated a coach',
    'coach.link_user': 'linked a user to a coach',
    'pricing.create': 'created a pricing package',
    'pricing.update': 'updated a pricing package',
    'pricing.delete': 'deleted a pricing package',
    'application.status_change': `marked application ${entry.after?.status || '?'}`,
  };

  return {
    actor,
    verb: verbs[action] || action,
    target,
    reason,
  };
}

function StatTile({ label, value, icon: Icon, hint, to }) {
  const inner = (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-accent/30 transition-colors h-full">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-accent" />
        <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">{label}</span>
      </div>
      <p className="font-oswald text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export default function AdminPanel() {
  const { user, isAdmin } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    sessions: [],
    coaches: [],
    users: [],
    pendingApps: [],
    credits: [],
  });
  const [auditLog, setAuditLog] = useState([]);
  const [auditLogAvailable, setAuditLogAvailable] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const [sessions, coaches, users, pendingApps, credits] = await Promise.all([
          sessionRepo.list('-date').catch((err) => { console.error('sessions load', err); return []; }),
          coachRepo.list().catch((err) => { console.error('coaches load', err); return []; }),
          profileRepo.list().catch((err) => { console.error('users load', err); return []; }),
          coachApplicationRepo.filter({ status: 'pending' }).catch(() => []),
          sessionCreditRepo.list().catch(() => []),
        ]);
        if (cancelled) return;
        setData({ sessions, coaches, users, pendingApps, credits });
        try {
          const audit = await auditLogRepo.list('-created_date');
          if (!cancelled) {
            setAuditLog(Array.isArray(audit) ? audit.slice(0, 10) : []);
            setAuditLogAvailable(true);
          }
        } catch {
          if (!cancelled) {
            setAuditLog([]);
            setAuditLogAvailable(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const stats = useMemo(() => {
    const today = todayET();
    const monthPrefix = currentMonthPrefixET();
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const upcomingSessions = data.sessions.filter(
      (s) => (s.status === 'pending' || s.status === 'confirmed') && s.date >= today,
    );
    const completedThisMonth = data.sessions.filter(
      (s) => s.status === 'completed' && (s.date || '').startsWith(monthPrefix),
    );
    const pendingCash = data.sessions.reduce((sum, s) => {
      if (s.status === 'cancelled') return sum;
      if (s.payment_method !== 'cash') return sum;
      if (s.payment_status === 'paid') return sum;
      return sum + (Number(s.total_price) || 0);
    }, 0);

    const activeClientEmails = new Set();
    data.sessions.forEach((s) => {
      if (!s.date) return;
      const ms = new Date(`${s.date}T00:00:00Z`).getTime();
      if (ms >= recentCutoff) activeClientEmails.add(s.client_email);
    });
    const activeCoaches = data.coaches.filter((c) => c.is_active !== false).length;
    const totalCoaches = data.coaches.length;

    const outstandingCredits = data.credits.reduce(
      (sum, c) => sum + Math.max(0, (c.total_credits || 0) - (c.used_credits || 0)),
      0,
    );

    return {
      upcomingSessions: upcomingSessions.length,
      completedThisMonth: completedThisMonth.length,
      pendingCash,
      activeCoaches,
      totalCoaches,
      activeClients: activeClientEmails.size,
      pendingApps: data.pendingApps.length,
      outstandingCredits,
    };
  }, [data]);

  if (!isAdmin) {
    return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;
  }

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-2">
          <div>
            <h1 className="font-oswald text-4xl font-bold tracking-tight text-foreground">ADMIN PANEL</h1>
            <p className="text-muted-foreground">Operations overview for LC Training.</p>
          </div>
          {user?.email && (
            <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground">
              Signed in as <span className="text-foreground">{user.email}</span>
            </p>
          )}
        </div>

        {/* Metrics grid */}
        <div className="mt-8">
          <h2 className="font-oswald text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" /> Snapshot
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4 h-[88px] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile
                label="Upcoming Sessions"
                value={stats.upcomingSessions}
                icon={CalendarClock}
                hint="pending + confirmed, today onward"
                to="/admin/bookings"
              />
              <StatTile
                label="Completed / Month"
                value={stats.completedThisMonth}
                icon={CheckCircle2}
                hint="this calendar month"
                to="/admin/bookings"
              />
              <StatTile
                label="Pending Cash"
                value={formatUSD(stats.pendingCash)}
                icon={DollarSign}
                hint="cash sessions awaiting payment"
                to="/admin/bookings"
              />
              <StatTile
                label="Active Coaches"
                value={`${stats.activeCoaches}${stats.totalCoaches !== stats.activeCoaches ? ` / ${stats.totalCoaches}` : ''}`}
                icon={UserCheck}
                hint="visible to clients"
                to="/admin/coaches"
              />
              <StatTile
                label="Active Clients 30d"
                value={stats.activeClients}
                icon={Users}
                hint="had a session in last 30 days"
                to="/admin/users"
              />
              <StatTile
                label="Pending Applications"
                value={stats.pendingApps}
                icon={Briefcase}
                hint="awaiting review"
                to="/admin/applications"
              />
              <StatTile
                label="Outstanding Credits"
                value={stats.outstandingCredits}
                icon={Zap}
                hint="unredeemed sessions across all clients"
                to="/admin/credits"
              />
              <StatTile
                label="Total Bookings"
                value={data.sessions.length}
                icon={Calendar}
                hint="all-time"
                to="/admin/bookings"
              />
            </div>
          )}
        </div>

        {/* Recent admin activity */}
        <div className="mt-10">
          <h2 className="font-oswald text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> Recent Admin Activity
          </h2>
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {!auditLogAvailable && !loading && (
              <div className="p-4 text-sm text-muted-foreground">
                Audit log collection isn't reachable. Check that the <code className="font-mono text-foreground bg-secondary px-1 py-0.5 rounded text-xs">audit_logs</code> collection exists in Appwrite and that the current user has read access.
              </div>
            )}
            {auditLogAvailable && !loading && auditLog.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No admin activity recorded yet.
              </div>
            )}
            {loading && (
              <div className="p-4">
                <div className="h-4 bg-secondary/50 rounded w-1/2 animate-pulse" />
              </div>
            )}
            {auditLog.map((entry) => {
              const { actor, verb, target, reason } = describeAuditEntry(entry);
              const when = entry.created_date
                ? formatDistanceToNow(new Date(entry.created_date), { addSuffix: true })
                : '';
              return (
                <div key={entry.id} className="p-3 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      <span className="font-oswald tracking-wider text-accent">{actor}</span>
                      <span className="text-muted-foreground"> {verb}</span>
                      {target && <span className="text-muted-foreground"> · {target}</span>}
                      {reason && <span className="text-muted-foreground italic">{reason}</span>}
                    </p>
                    {entry.entity_type && (
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                        {entry.action} · {entry.entity_type}{entry.entity_id ? ` #${entry.entity_id.slice(0, 8)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground flex-shrink-0">
                    {when}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation tiles (existing) */}
        <div className="mt-10">
          <h2 className="font-oswald text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3">
            Manage
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminLinks.map(({ label, path, icon: Icon, desc }) => (
              <Link
                key={path}
                to={path}
                className="bg-card border border-border rounded-lg p-6 hover:border-accent/30 transition-all group"
              >
                <Icon className="w-6 h-6 text-accent mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-oswald text-lg tracking-wider text-foreground">{label.toUpperCase()}</h3>
                <p className="text-xs text-muted-foreground mt-1">{desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
