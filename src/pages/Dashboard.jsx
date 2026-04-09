import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, MessageSquare, Settings, Shield, Clock, CheckCircle2, AlertCircle, XCircle, CreditCard } from 'lucide-react';
import { format, isBefore, addHours } from 'date-fns';
import PaymentHandles from '@/components/shared/PaymentHandles';

export default function Dashboard() {
  const { user, isAdmin, isCoach } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [coaches, setCoaches] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let allSessions;
      if (isCoach && user.coach_id) {
        allSessions = await base44.entities.Session.filter({ coach_id: user.coach_id }, '-date');
      } else {
        allSessions = await base44.entities.Session.filter({ client_email: user.email }, '-date');
      }
      setSessions(allSessions);

      const coachList = await base44.entities.Coach.list();
      const map = {};
      coachList.forEach(c => { map[c.id] = c; });
      setCoaches(map);

      const convos = await base44.entities.Conversation.filter({});
      const myConvos = convos.filter(c => c.participant_emails?.includes(user.email));
      const msgs = await base44.entities.Message.filter({});
      let unread = 0;
      msgs.forEach(m => {
        if (myConvos.some(c => c.id === m.conversation_id) && m.sender_email !== user.email && !m.read_by?.includes(user.email)) {
          unread++;
        }
      });
      setUnreadCount(unread);
      setLoading(false);
    };
    load();
  }, [user, isCoach]);

  const handleCancel = async (session) => {
    const now = new Date();
    const sessionTime = new Date(`${session.date}T${session.start_time}`);

    // Block cancellation on the day of or after the session
    if (!isBefore(now, new Date(session.date + 'T00:00:00'))) {
      alert('Sessions can only be cancelled before the day of the appointment.');
      return;
    }

    const isLateCancel = isBefore(sessionTime, addHours(now, 24));

    if (isLateCancel) {
      const ok = confirm('This session is within 24 hours. A late-cancellation fee may apply at the coach\'s discretion. Continue?');
      if (!ok) return;
    }

    await base44.entities.Session.update(session.id, { status: 'cancelled', cancellation_reason: isLateCancel ? 'Late cancellation' : '' });
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'cancelled' } : s));
  };

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  const upcoming = sessions.filter(s => s.status === 'pending' || s.status === 'confirmed');
  const past = sessions.filter(s => s.status === 'completed' || s.status === 'cancelled');

  const statusConfig = {
    pending: { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' },
    confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' },
    completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Completed' },
    cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' },
  };

  return (
    <div className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="font-oswald text-4xl font-bold tracking-tight text-foreground">DASHBOARD</h1>
            <p className="text-muted-foreground mt-1">
              {isCoach ? 'Manage your coaching sessions' : 'Track your training sessions'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/messages">
              <Button variant="outline" className="font-oswald tracking-wider uppercase text-xs relative">
                <MessageSquare className="w-4 h-4 mr-2" /> Messages
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="font-oswald tracking-wider uppercase text-xs">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                  <Shield className="w-4 h-4 mr-2" /> Admin Panel
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Upcoming', value: upcoming.length, icon: Calendar },
            { label: 'Total Sessions', value: sessions.length, icon: Clock },
            { label: 'Role', value: user?.role?.toUpperCase() || 'USER', icon: Shield },
            { label: 'Unread', value: unreadCount, icon: MessageSquare },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-accent" />
                <span className="text-xs font-oswald tracking-widest uppercase text-muted-foreground">{label}</span>
              </div>
              <span className="font-oswald text-2xl font-bold">{value}</span>
            </div>
          ))}
        </div>

        {/* Coach setup prompt */}
        {isCoach && user?.coach_id && !user?.profile_setup_complete && (
          <Link to="/coach-setup" className="block mb-8 p-4 bg-accent/10 border border-accent/20 rounded-lg hover:bg-accent/15 transition-colors">
            <p className="text-accent font-oswald tracking-wider uppercase text-sm">Complete Your Coach Profile →</p>
            <p className="text-xs text-muted-foreground mt-1">Set up your availability, payment handles, and bio.</p>
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sessions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming */}
            <div>
              <h2 className="font-oswald text-xl font-bold tracking-wider text-foreground mb-4">UPCOMING SESSIONS</h2>
              {upcoming.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming sessions.</p>
                  {!isCoach && (
                    <Link to="/book">
                      <Button className="mt-4 bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                        Book a Session
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(session => {
                    const coach = coaches[session.coach_id];
                    const sc = statusConfig[session.status];
                    const Icon = sc?.icon || Clock;
                    return (
                      <div key={session.id} className="bg-card border border-border rounded-lg p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-oswald text-lg font-bold tracking-wider">
                              {format(new Date(session.date + 'T00:00:00'), 'EEEE, MMMM d')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {session.start_time} · {session.duration_minutes} min · {session.county}
                            </p>
                            {isCoach ? (
                              <p className="text-sm text-muted-foreground mt-1">Client: {session.client_name}</p>
                            ) : coach ? (
                              <p className="text-sm text-muted-foreground mt-1">Coach: {coach.first_name} {coach.last_name}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${sc?.color} border`}>
                              <Icon className="w-3 h-3 mr-1" />{sc?.label}
                            </Badge>
                            {session.payment_status === 'unpaid' && (
                              <Badge className="bg-accent/10 text-accent border-accent/20 border">Unpaid</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          {session.payment_status === 'unpaid' && !isCoach && (
                            <Link to="/pay">
                              <Button size="sm" className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                                <CreditCard className="w-3 h-3 mr-1" /> Pay Now
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(session)}
                            className="font-oswald tracking-wider uppercase text-xs text-destructive hover:text-destructive"
                          >
                            Cancel
                          </Button>
                        </div>
                        {/* Cancellation policy reminder */}
                        <p className="text-xs text-muted-foreground/60 mt-3">
                          24h cancellation policy applies. Late cancellations may incur a fee.
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Past */}
            {past.length > 0 && (
              <div>
                <h2 className="font-oswald text-xl font-bold tracking-wider text-foreground mb-4">PAST SESSIONS</h2>
                <div className="space-y-3">
                  {past.slice(0, 10).map(session => {
                    const coach = coaches[session.coach_id];
                    const sc = statusConfig[session.status];
                    return (
                      <div key={session.id} className="bg-card border border-border rounded-lg p-4 opacity-75">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-oswald tracking-wider text-sm">
                               {format(new Date(session.date + 'T00:00:00'), 'MMM d, yyyy')} · {session.start_time}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isCoach ? session.client_name : coach ? `${coach.first_name} ${coach.last_name}` : ''}
                            </p>
                            {session.cancellation_reason && (
                              <p className="text-xs text-destructive mt-1">Reason: {session.cancellation_reason}</p>
                            )}
                          </div>
                          <Badge className={`${sc?.color} border`}>{sc?.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Coach payment handles (for coaches) */}
            {isCoach && user?.coach_id && coaches[user.coach_id] && (
              <PaymentHandles coach={coaches[user.coach_id]} />
            )}

            {/* Quick actions */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-oswald text-sm font-bold tracking-widest uppercase text-muted-foreground mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {!isCoach && (
                  <Link to="/book" className="block">
                    <Button variant="ghost" className="w-full justify-start text-sm">
                      <Calendar className="w-4 h-4 mr-2" /> Book a Session
                    </Button>
                  </Link>
                )}
                <Link to="/messages" className="block">
                  <Button variant="ghost" className="w-full justify-start text-sm">
                    <MessageSquare className="w-4 h-4 mr-2" /> Messages
                  </Button>
                </Link>
                <Link to="/settings" className="block">
                  <Button variant="ghost" className="w-full justify-start text-sm">
                    <Settings className="w-4 h-4 mr-2" /> Settings
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}