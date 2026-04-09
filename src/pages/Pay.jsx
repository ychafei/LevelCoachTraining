import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';

export default function Pay() {
  const { user } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [coaches, setCoaches] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const allSessions = await base44.entities.Session.filter({ client_email: user.email }, '-created_date');
      const pending = allSessions.filter(s => s.payment_status === 'unpaid' && s.status !== 'cancelled');
      setSessions(pending);
      const coachList = await base44.entities.Coach.list();
      const map = {};
      coachList.forEach(c => { map[c.id] = c; });
      setCoaches(map);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="py-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-4xl font-bold tracking-tight text-foreground mb-2">PAYMENT</h1>
        <p className="text-muted-foreground mb-10">Complete payment directly with your coach using the methods below.</p>

        {sessions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-lg">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No unpaid sessions found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sessions.map(session => {
              const coach = coaches[session.coach_id];
              return (
                <div key={session.id} className="bg-card border border-border rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-oswald text-lg font-bold tracking-wider">{format(new Date(session.date + 'T00:00:00'), 'EEEE, MMMM d')}</h3>
                      <p className="text-sm text-muted-foreground">{session.start_time} · {session.duration_minutes} min · {session.county}</p>
                    </div>
                    <Badge className="bg-accent/10 text-accent border-accent/20">Unpaid</Badge>
                  </div>
                  {coach && (
                    <div className="border-t border-border pt-4 mt-4">
                      <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground mb-3">
                        Pay {coach.first_name} {coach.last_name} via:
                      </p>
                      <div className="space-y-2 text-sm">
                        {coach.venmo && <div className="flex justify-between"><span className="text-muted-foreground">Venmo</span><span>{coach.venmo}</span></div>}
                        {coach.zelle && <div className="flex justify-between"><span className="text-muted-foreground">Zelle</span><span>{coach.zelle}</span></div>}
                        {coach.cashapp && <div className="flex justify-between"><span className="text-muted-foreground">Cash App</span><span>{coach.cashapp}</span></div>}
                        {coach.paypal && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">PayPal</span>
                            <a
                              href={`https://paypal.me/${coach.paypal.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//, '')}${session.total_price ? '/' + session.total_price : ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 underline hover:text-blue-300 font-medium"
                            >
                              Pay via PayPal{session.total_price ? ` ($${session.total_price})` : ''}
                            </a>
                          </div>
                        )}
                        {coach.cash_accepted && <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span>Accepted</span></div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}