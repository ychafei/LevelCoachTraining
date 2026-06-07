import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachRepo, sessionRepo, conversationRepo, messageRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, CalendarClock, ClipboardList, Users, MessageSquare, User as UserIcon,
  Clock, CheckCircle2, AlertTriangle, MapPin, StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatTimeET, formatLongDateET } from '@/lib/formatInET';
import { isSessionPast } from '@/lib/scheduleET';
import OnboardingChecklist, { computeChecklist } from '@/components/coach-portal/OnboardingChecklist';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';

// Helpers --------------------------------------------------------------------

function sameETDay(dateStr, nowMs = Date.now()) {
  // Compare session date (YYYY-MM-DD in ET) to "today in ET".
  const todayET = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
  return dateStr === todayET;
}

function daysBetween(dateStr) {
  // Rough day count from today to the given YYYY-MM-DD (ET).
  const todayET = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const a = new Date(`${todayET}T00:00:00Z`).getTime();
  const b = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// Component ------------------------------------------------------------------

export default function CoachOverview() {
  const { user, isAdmin } = useAuth();
  const [coach, setCoach] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [legalStatus, setLegalStatus] = useState(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      try {
        const coachRow = user.coach_id
          ? (await coachRepo.filter({ id: user.coach_id }))[0]
          : null;
        if (cancelled) return;
        setCoach(coachRow || null);

        const ssns = user.coach_id
          ? await sessionRepo.filter({ coach_id: user.coach_id }, '-date')
          : [];
        if (cancelled) return;
        setSessions(ssns);

        // Unread count: bounded by my conversations.
        const convos = await conversationRepo.filter({});
        const mine = convos.filter(c => c.participant_emails?.includes(user.email) && !c.is_archived);
        let unread = 0;
        if (mine.length > 0) {
          const batches = await Promise.all(
            mine.map(c => messageRepo.filter({ conversation_id: c.id }))
          );
          batches.forEach(msgs => msgs.forEach(m => {
            if (m.sender_email !== user.email && !m.read_by?.includes(user.email)) unread++;
          }));
        }
        if (!cancelled) setUnreadCount(unread);
      } catch (err) {
        console.error('CoachOverview load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  // Derived metrics ----------------------------------------------------------
  const { todaySessions, upcoming7, stats, unpaidCash, recentCompleted } = useMemo(() => {
    const active = sessions.filter(s => s.status !== 'cancelled');
    const todaySsns = active
      .filter(s => sameETDay(s.date) && (s.status === 'pending' || s.status === 'confirmed'))
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const nextWeek = active
      .filter(s => !sameETDay(s.date) && !isSessionPast(s.date, s.start_time) && (s.status === 'pending' || s.status === 'confirmed'))
      .filter(s => {
        const d = daysBetween(s.date);
        return d >= 0 && d <= 7;
      })
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));

    // Month-to-date for completed-and-paid
    const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit' }).format(new Date());
    const monthPrefix = todayET; // YYYY-MM
    const weekSessions = active.filter(s => {
      const d = daysBetween(s.date);
      return d >= 0 && d <= 7 && (s.status === 'pending' || s.status === 'confirmed');
    });
    const completedThisMonth = sessions.filter(s => s.status === 'completed' && s.date?.startsWith(monthPrefix));

    // Active clients: unique client emails with at least one session in last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentClientEmails = new Set();
    sessions.forEach(s => {
      const ms = new Date(`${s.date}T00:00:00Z`).getTime();
      if (ms >= cutoff) recentClientEmails.add(s.client_email);
    });

    const recent = sessions
      .filter(s => s.status === 'completed')
      .slice(0, 5);

    return {
      todaySessions: todaySsns,
      upcoming7: nextWeek,
      recentCompleted: recent,
      stats: {
        thisWeek: weekSessions.length,
        activeClients: recentClientEmails.size,
        completedThisMonth: completedThisMonth.length,
      },
    };
  }, [sessions, coach]);

  const checklist = useMemo(() => computeChecklist(user, coach), [user, coach]);

  // Alerts -------------------------------------------------------------------
  const alerts = [];
  if (!user?.coach_id) {
    alerts.push({
      tone: 'destructive',
      icon: AlertTriangle,
      text: 'Your user account is not linked to a coach profile. Ask an admin to link it before clients can book you.',
    });
  }
  if (coach && coach.is_active === false) {
    alerts.push({
      tone: 'warn',
      icon: AlertTriangle,
      text: 'Your profile is currently hidden from clients. Ask an admin to set it active when ready.',
    });
  }
  if (checklist.hasBlocking && user?.coach_id) {
    alerts.push({
      tone: 'warn',
      icon: AlertTriangle,
      text: 'Your availability is empty — clients cannot book you until you set weekly availability.',
      cta: { label: 'Set availability', href: '/coach/schedule' },
    });
  }
  if (user?.coach_id && legalStatus && !legalStatus.loading && !legalStatus.complete) {
    alerts.push({
      tone: 'warn',
      icon: AlertTriangle,
      text: legalStatus.hasTemplates
        ? 'Your coach legal packet is incomplete. Admins cannot activate your profile until all current documents are signed.'
        : 'Coach legal templates are not published yet. Admins cannot activate profiles until templates are seeded.',
    });
  }
  if (unreadCount > 0) {
    alerts.push({
      tone: 'info',
      icon: MessageSquare,
      text: `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}.`,
      cta: { label: 'Open messages', href: '/coach/messages' },
    });
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // Unlinked-admin empty state — admins visiting /coach without a coach_id.
  if (!user?.coach_id && isAdmin) {
    return (
      <div className="space-y-6">
        <div className="bg-card border border-accent/30 rounded-lg p-6">
          <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-2">Coach Portal</h2>
          <p className="text-sm text-muted-foreground mb-4">
            You're signed in as an admin without a linked coach profile. Link your admin account to a coach record (in
            the Users panel) if you want to use this portal with real data.
          </p>
          <Link to="/admin/users">
            <Button variant="outline" className="font-display tracking-wider uppercase text-xs">Open Users Panel</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero strip -------------------------------------------------- */}
      <div className="bg-card border border-border rounded-lg p-5 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {coach?.photo_url ? (
            <img src={coach.photo_url} alt="Coach" className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-7 h-7 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-foreground truncate">
            {coach ? `${coach.first_name} ${coach.last_name}` : 'Coach'}
          </h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {coach?.is_head_coach && (
              <Badge className="bg-accent/10 text-accent border-accent/20 border text-xs">Head Coach</Badge>
            )}
            {coach?.county && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {coach.county} County
              </span>
            )}
            {coach?.is_active === false && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/20 border text-xs">Hidden from clients</Badge>
            )}
            {coach?.is_active !== false && coach?.id && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border text-xs">Visible to clients</Badge>
            )}
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-[10px] font-display tracking-[0.25em] uppercase text-muted-foreground">Setup</p>
          <p className="font-display text-xl font-bold text-accent">{checklist.pct}%</p>
        </div>
      </div>

      {/* Alerts ------------------------------------------------------ */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const Icon = a.icon;
            const tone =
              a.tone === 'destructive' ? 'border-destructive/30 bg-destructive/10 text-destructive' :
              a.tone === 'warn'        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                                         'border-accent/30 bg-accent/10 text-accent';
            return (
              <div key={i} className={`rounded-lg border p-3 flex items-center gap-3 ${tone}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm flex-1">{a.text}</p>
                {a.cta && (
                  <Link to={a.cta.href}>
                    <Button variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs">
                      {a.cta.label}
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stat cards -------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'This Week',          value: stats.thisWeek,         icon: CalendarClock },
          { label: 'Active Clients 30d', value: stats.activeClients,    icon: Users },
          { label: 'Completed / Month',  value: stats.completedThisMonth, icon: CheckCircle2 },
          { label: 'Payout Setup',       value: coach?.stripe_account_id ? 'Connected' : 'Needed', icon: ClipboardList },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today + Upcoming (left 2/3) --------------------------------- */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">Today</h2>
              <span className="text-xs text-muted-foreground">{formatLongDateET(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date()))}</span>
            </div>
            {todaySessions.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No sessions today — enjoy the break.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySessions.map(s => (
                  <TodaySessionCard
                    key={s.id}
                    session={s}
                    onMarkCompleted={async () => {
                      try {
                        await sessionRepo.update(s.id, { status: 'completed' });
                        setSessions(prev => prev.map(x => x.id === s.id ? { ...x, status: 'completed' } : x));
                        toast.success('Session marked completed');
                      } catch (err) {
                        console.error(err);
                        toast.error('Could not mark as completed');
                      }
                    }}
                  />
                ))}
                <div className="text-right">
                  <Link to="/coach/sessions" className="text-xs font-display tracking-wider uppercase text-accent hover:underline">
                    View all sessions →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Next 7 days */}
          <div>
            <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">Next 7 Days</h2>
            {upcoming7.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <CalendarClock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Nothing booked in the next week.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming7.map(s => (
                  <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-center flex-shrink-0 w-14">
                        <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
                          {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', weekday: 'short' }).format(new Date(`${s.date}T12:00:00Z`))}
                        </p>
                        <p className="font-display text-lg font-bold text-foreground">
                          {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', day: 'numeric' }).format(new Date(`${s.date}T12:00:00Z`))}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-display tracking-wider text-foreground text-sm truncate">
                          {formatTimeET(s.date, s.start_time).replace(' ET', '')} · {s.client_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{s.duration_minutes} min · {s.county}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-display tracking-widest uppercase">
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: checklist + recent -------------------------- */}
        <div className="space-y-6">
          {user?.coach_id && (
            <LegalSignaturePanel
              signerRole="coach"
              coachId={user.coach_id}
              title="Coach Legal Packet"
              description="Sign independent contractor, safeguarding, credential, payout, and platform documents before activation."
              compact
              onStatusChange={setLegalStatus}
            />
          )}
          <OnboardingChecklist user={user} coach={coach} />

          <div>
            <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">Recently Completed</h2>
            {recentCompleted.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No completed sessions yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentCompleted.map(s => (
                  <Link
                    to={`/coach/clients/${encodeURIComponent(s.client_email)}`}
                    key={s.id}
                    className="block bg-card border border-border rounded-lg p-3 hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display tracking-wider text-foreground text-sm truncate">{s.client_name}</p>
                      <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground flex-shrink-0">
                        {formatLongDateET(s.date).split(',')[0]}
                      </span>
                    </div>
                    {s.notes ? (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        <StickyNote className="inline w-3 h-3 mr-1 -mt-0.5" />{s.notes}
                      </p>
                    ) : (
                      <p className="text-xs text-accent/70 mt-1">+ add notes</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="font-display text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3">Quick Actions</h3>
            <div className="space-y-1.5">
              <Link to="/coach/sessions" className="block">
                <Button variant="ghost" className="w-full justify-start text-sm">
                  <ClipboardList className="w-4 h-4 mr-2" /> Manage Sessions
                </Button>
              </Link>
              <Link to="/coach/schedule" className="block">
                <Button variant="ghost" className="w-full justify-start text-sm">
                  <CalendarClock className="w-4 h-4 mr-2" /> Edit Availability
                </Button>
              </Link>
              <Link to="/coach/clients" className="block">
                <Button variant="ghost" className="w-full justify-start text-sm">
                  <Users className="w-4 h-4 mr-2" /> View My Clients
                </Button>
              </Link>
              <Link to="/coach/profile" className="block">
                <Button variant="ghost" className="w-full justify-start text-sm">
                  <UserIcon className="w-4 h-4 mr-2" /> Edit Profile
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Today card — links to client detail and supports inline mark-completed.
function TodaySessionCard({ session: s, onMarkCompleted }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start justify-between gap-3 flex-wrap">
      <Link
        to={`/coach/clients/${encodeURIComponent(s.client_email)}`}
        className="flex items-center gap-3 min-w-0 flex-1 hover:text-accent transition-colors"
      >
        <div className="text-center flex-shrink-0">
          <p className="font-display text-xl font-bold text-accent leading-none">
            {formatTimeET(s.date, s.start_time).replace(' ET', '')}
          </p>
          <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mt-1">
            {s.duration_minutes} min
          </p>
        </div>
        <div className="min-w-0">
          <p className="font-display tracking-wider text-foreground truncate">
            {s.client_name}{s.client_age ? ` · ${s.client_age}` : ''}
          </p>
          {s.session_goals && (
            <p className="text-xs text-muted-foreground truncate">{s.session_goals}</p>
          )}
        </div>
      </Link>
      <div className="flex items-center gap-2 flex-wrap">
        {(s.status === 'pending' || s.status === 'confirmed') && (
          <Button
            size="sm"
            onClick={onMarkCompleted}
            className="bg-green-600 text-white font-display tracking-wider uppercase text-xs hover:bg-green-700"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
          </Button>
        )}
        <Link to="/coach/messages">
          <Button size="sm" variant="ghost" className="font-display tracking-wider uppercase text-xs">
            <MessageSquare className="w-3 h-3 mr-1" /> Chat
          </Button>
        </Link>
      </div>
    </div>
  );
}
