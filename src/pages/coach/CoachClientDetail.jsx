import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { sessionRepo, conversationRepo } from '@/api/repo';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { useAuth } from '@/lib/AuthContext';
import TrainingToolkit from '@/features/coach/TrainingToolkit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, User as UserIcon, Users,
  Clock, CheckCircle2, XCircle, MessageSquare, StickyNote, Check, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatLongDateInTz, formatTimeInTz } from '@/lib/scheduleET';

const statusConfig = {
  pending:   { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' },
  confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' },
  completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Completed' },
  no_show:   { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'No-show' },
  cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' },
};

export default function CoachClientDetail() {
  const { clientEmail: raw } = useParams();
  const clientEmail = decodeURIComponent(raw || '');
  const { user, isAdmin } = useAuth();
  const { coach, loading: coachLoading } = useMyCoach();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [existingConvo, setExistingConvo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageOpen, setMessageOpen] = useState(false);
  const [firstMessage, setFirstMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (coachLoading) return undefined;
    if (!coach?.id || !clientEmail) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const [ssns, convos] = await Promise.all([
          sessionRepo.filter({ coach_id: coach.id, client_email: clientEmail }, '-date'),
          // Per-document grants scope this list to the caller's own threads.
          conversationRepo.list('-last_message_at').catch(() => []),
        ]);
        if (cancelled) return;
        setSessions(ssns || []);
        const convo = (convos || []).find(c =>
          !c.is_archived
          && (!user?.email || c.participant_emails?.includes(user.email))
          && c.participant_emails?.some((e) => String(e).toLowerCase() === clientEmail.toLowerCase())
        );
        setExistingConvo(convo || null);
      } catch (err) {
        console.error('CoachClientDetail load failed', err);
        toast.error('Could not load client details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coach?.id, coachLoading, clientEmail, user?.email]);

  // Derived --------------------------------------------------------------
  const completed = sessions.filter(s => s.status === 'completed');
  const upcoming = sessions.filter(s => s.status === 'pending' || s.status === 'confirmed');
  const clientName = sessions[0]?.client_name || clientEmail;
  const age = sessions[0]?.client_age ?? null;
  const athleteId = useMemo(
    () => sessions.find((s) => s.athlete_id)?.athlete_id || '',
    [sessions],
  );
  const bookerProfileId = useMemo(
    () => sessions.find((s) => s.booked_by_profile_id)?.booked_by_profile_id || '',
    [sessions],
  );
  // Fallback sport when the athlete has no training history yet: the coach's
  // primary (first selected) sport. TrainingToolkit prefers the athlete's own
  // sport derived from their existing assessments/goals/plans/homework.
  const defaultSportKey = Array.isArray(coach?.sports) && coach.sports.length > 0 ? coach.sports[0] : '';

  const openMessaging = () => {
    if (existingConvo) {
      navigate('/coach/messages');
      return;
    }
    if (!bookerProfileId) {
      toast.error('Messaging unlocks after this client books a session.');
      return;
    }
    setMessageOpen(true);
  };

  const sendFirstMessage = async () => {
    const content = firstMessage.trim();
    if (!content) return;
    setSendingMessage(true);
    try {
      await conversationRepo.start({
        recipient_profile_id: bookerProfileId,
        first_message: content,
      });
      toast.success('Message sent');
      setMessageOpen(false);
      setFirstMessage('');
      navigate('/coach/messages');
    } catch (err) {
      toast.error(err?.message || 'Could not start the conversation.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Render ---------------------------------------------------------------
  if (loading || coachLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading client">
        <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-secondary/50" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-secondary/50" />
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Coach profile not linked</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Your admin account is not linked to a coach record.'
              : 'Ask an admin to link your account to a coach record.'}
          </p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-4">
        <Link to="/coach/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to clients
        </Link>
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">No record for {clientEmail}</h2>
          <p className="text-sm text-muted-foreground mt-1">You haven't coached this client yet — their page unlocks after their first booking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/coach/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to clients
      </Link>

      {/* Header card */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground truncate">{clientName}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-muted-foreground">
                {age != null && <span>Age {age}</span>}
                <span className="truncate">{clientEmail}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={openMessaging}
              className="bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90"
            >
              <MessageSquare className="w-3 h-3 mr-1" aria-hidden="true" />
              {existingConvo ? 'Open chat' : 'Start chat'}
            </Button>
          </div>
        </div>

        {/* Summary row */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Total sessions', value: sessions.length },
            { label: 'Completed', value: completed.length },
            { label: 'Upcoming', value: upcoming.length },
          ].map(s => (
            <div key={s.label} className="bg-secondary/40 border border-border rounded p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{s.label}</p>
              <p className="font-display text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Training toolkit — goals, plans, homework, assessments, check-ins */}
      <TrainingToolkit coachId={coach.id} athleteId={athleteId} defaultSportKey={defaultSportKey} />

      {/* Session history */}
      <div>
        <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground mb-3">Session history</h2>
        <div className="space-y-3">
          {sessions.map(s => {
            const sc = statusConfig[s.status] || statusConfig.pending;
            const Icon = sc.icon;
            const tz = s.timezone || coach.timezone || undefined;
            return (
              <div key={s.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{formatLongDateInTz(s.date, tz)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTimeInTz(s.date, s.start_time, tz)} · {s.duration_minutes} min
                    </p>
                    {s.session_goals && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Goals: </span>
                        {s.session_goals}
                      </p>
                    )}
                    {s.cancellation_reason && (
                      <p className="text-xs text-destructive mt-1">Reason: {s.cancellation_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge className={`${sc.color} border text-xs font-semibold`}>
                      <Icon className="w-3 h-3 mr-1" aria-hidden="true" /> {sc.label}
                    </Badge>
                    {s.payment_status === 'paid' && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20 border text-xs font-semibold">
                        <Check className="w-3 h-3 mr-1" aria-hidden="true" /> Paid
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Session notes: sessions are server-only writable and the
                    training function has no session-notes action yet, so
                    editing is disabled rather than faked. */}
                {s.notes ? (
                  <div className="mt-3 bg-secondary/50 border border-border rounded p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1 mb-1">
                      <StickyNote className="w-3 h-3" aria-hidden="true" /> Booking notes
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{s.notes}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Per-session coach notes are coming soon — use Goals, Plans, and Homework above to track structured work in the meantime.
        </p>
      </div>

      {/* First-message dialog */}
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-[-0.01em]">Message {clientName}</DialogTitle>
            <DialogDescription>
              This starts a conversation in your inbox. The client (and their guardian, for athletes under 18) can read and reply.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="first-message" className="sr-only">First message</label>
            <Textarea
              id="first-message"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              rows={4}
              placeholder="Write your message…"
              className="bg-secondary border-border"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)} className="font-semibold">
              Cancel
            </Button>
            <Button
              onClick={sendFirstMessage}
              disabled={!firstMessage.trim() || sendingMessage}
              className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90"
            >
              {sendingMessage ? 'Sending…' : 'Send message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
