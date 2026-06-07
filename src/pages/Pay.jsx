import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CreditCard, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function Pay() {
  const { user, loading } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLoadingRows(false);
      return;
    }
    const load = async () => {
      const allSessions = await sessionRepo.filter({ client_email: user.email }, '-created_date');
      setSessions(allSessions.filter(s => s.payment_status === 'unpaid' && s.status !== 'cancelled'));
      setLoadingRows(false);
    };
    load();
  }, [loading, user]);

  if (loading || loadingRows) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="py-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground mb-2">PAYMENT</h1>
        <p className="text-muted-foreground mb-8">
          LevelCoach payments are processed only through Stripe Checkout during booking.
        </p>

        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent grid place-items-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-wider text-foreground">Stripe Checkout</p>
              <p className="text-sm text-muted-foreground mt-1">
                Buy training credits from the booking flow. Credits are issued only after Stripe sends a verified webhook.
              </p>
              <Link to="/coaches" className="inline-flex mt-4">
                <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Book and Pay
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-14 bg-card border border-border rounded-lg">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No unpaid sessions found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <div key={session.id} className="bg-card border border-border rounded-lg p-5">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-wider">
                      {format(new Date(`${session.date}T00:00:00`), 'EEEE, MMMM d')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {session.start_time} · {session.duration_minutes} min · {session.county}
                    </p>
                  </div>
                  <Badge className="bg-accent/10 text-accent border-accent/20">Review</Badge>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                  <CalendarDays className="w-4 h-4 mt-0.5 text-accent flex-shrink-0" />
                  <span>
                    This unpaid session needs admin review. New payments must be completed through Stripe Checkout in the booking flow.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
