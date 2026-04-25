import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, User as UserIcon, MapPin, Users, Zap,
  Clock, CheckCircle2, XCircle, MessageSquare, StickyNote, Save, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatLongDateET, formatTimeET } from '@/lib/formatInET';

const statusConfig = {
  pending:   { icon: Clock, color: 'bg-accent/10 text-accent border-accent/20', label: 'Pending' },
  confirmed: { icon: CheckCircle2, color: 'bg-primary/10 text-primary border-primary/20', label: 'Confirmed' },
  completed: { icon: CheckCircle2, color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Completed' },
  cancelled: { icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Cancelled' },
};

function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

// ----- Inline notes editor -------------------------------------------------
// Coach-private in v1 (UI-only — see plan's server-side gap note).
function SessionNotesEditor({ session, onSaved }) {
  const [value, setValue] = useState(session.notes || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!session.notes);
  const isDirty = value !== (session.notes || '');

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Session.update(session.id, { notes: value });
      toast.success('Notes saved');
      setEditing(false);
      onSaved?.(session.id, value);
    } catch (err) {
      console.error('notes save failed', err);
      toast.error('Could not save notes.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing && session.notes) {
    return (
      <div className="mt-3 bg-secondary/50 border border-border rounded p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground flex items-center gap-1">
            <StickyNote className="w-3 h-3" /> Private Notes
          </p>
          <button type="button" onClick={() => setEditing(true)} className="text-[10px] font-oswald tracking-widest uppercase text-accent hover:underline">
            Edit
          </button>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">{session.notes}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground mb-1 flex items-center gap-1">
        <StickyNote className="w-3 h-3" /> Private Notes (only visible to you)
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What did you work on? What's next?"
        className="bg-background border-border text-sm"
        rows={3}
      />
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          onClick={save}
          disabled={saving || !isDirty}
          className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90"
        >
          {saving ? 'Saving...' : <><Save className="w-3 h-3 mr-1" /> Save</>}
        </Button>
        {session.notes && (
          <Button size="sm" variant="ghost" onClick={() => { setValue(session.notes || ''); setEditing(false); }} className="text-xs">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ----- Main page -----------------------------------------------------------

export default function CoachClientDetail() {
  const { clientEmail: raw } = useParams();
  const clientEmail = decodeURIComponent(raw || '');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [credits, setCredits] = useState([]);
  const [clientUser, setClientUser] = useState(null);
  const [existingConvo, setExistingConvo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingConvo, setCreatingConvo] = useState(false);

  useEffect(() => {
    if (!user?.coach_id || !clientEmail) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [ssns, crds, users, convos] = await Promise.all([
          base44.entities.Session.filter({ coach_id: user.coach_id, client_email: clientEmail }, '-date'),
          base44.entities.SessionCredit.filter({ client_email: clientEmail }),
          base44.entities.User.filter({ email: clientEmail }),
          // NOTE: broad-fetch limitation — narrowed client-side. See risks in plan.
          base44.entities.Conversation.filter({}),
        ]);
        if (cancelled) return;
        setSessions(ssns || []);
        setCredits(crds || []);
        setClientUser(users?.[0] || null);
        const convo = (convos || []).find(c =>
          !c.is_archived &&
          c.participant_emails?.includes(user.email) &&
          c.participant_emails?.includes(clientEmail)
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
  }, [user, clientEmail]);

  // Derived --------------------------------------------------------------
  const completed = sessions.filter(s => s.status === 'completed');
  const upcoming = sessions.filter(s => s.status === 'pending' || s.status === 'confirmed');
  const clientName = sessions[0]?.client_name
    || [clientUser?.first_name, clientUser?.last_name].filter(Boolean).join(' ')
    || clientUser?.full_name
    || clientEmail;
  const age = clientUser?.dob ? calcAge(clientUser.dob) : (sessions[0]?.client_age ?? null);
  const isMinor = age != null && age < 18;
  const county = sessions[0]?.county || clientUser?.county;

  const handleStartConversation = async () => {
    if (sessions.length === 0) {
      toast.error('You need at least one session with this client before messaging them.');
      return;
    }
    if (existingConvo) {
      navigate('/coach/messages');
      return;
    }
    setCreatingConvo(true);
    try {
      const coachFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
      await base44.entities.Conversation.create({
        type: 'coach_client',
        participant_emails: [String(user.email), String(clientEmail)],
        participant_names: [coachFullName, clientName],
        coach_id: user.coach_id,
      });
      toast.success('Conversation started');
      navigate('/coach/messages');
    } catch (err) {
      console.error('convo create failed', err);
      toast.error('Could not start conversation.');
    } finally {
      setCreatingConvo(false);
    }
  };

  // Render ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (sessions.length === 0 && !clientUser) {
    return (
      <div className="space-y-4">
        <Link to="/coach/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Clients
        </Link>
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-oswald text-lg tracking-wider text-foreground uppercase">No record for {clientEmail}</h2>
          <p className="text-sm text-muted-foreground mt-1">You haven't coached this client, and no user account matches.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/coach/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>

      {/* Header card */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="font-oswald text-2xl font-bold tracking-wider text-foreground truncate">{clientName}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-muted-foreground">
                {age != null && <span>Age {age}{isMinor && <span className="ml-1 text-accent">· minor</span>}</span>}
                {county && (
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {county} County</span>
                )}
                <span className="truncate">{clientEmail}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sessions.length > 0 && (
              <Button
                onClick={handleStartConversation}
                disabled={creatingConvo}
                className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90"
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                {existingConvo ? 'Open Chat' : (creatingConvo ? 'Starting...' : 'Start Chat')}
              </Button>
            )}
          </div>
        </div>

        {/* Summary row */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Total', value: sessions.length },
            { label: 'Completed', value: completed.length },
            { label: 'Upcoming', value: upcoming.length },
            { label: 'Credits', value: credits.reduce((sum, c) => sum + Math.max(0, (c.total_credits || 0) - (c.used_credits || 0)), 0) },
          ].map(s => (
            <div key={s.label} className="bg-secondary/40 border border-border rounded p-3 text-center">
              <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">{s.label}</p>
              <p className="font-oswald text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Parent / guardian (minors only) */}
      {isMinor && clientUser && (clientUser.parent_email || clientUser.parent_phone || clientUser.parent_first_name) && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground mb-3">Parent / Guardian</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {(clientUser.parent_first_name || clientUser.parent_last_name) && (
              <div>
                <span className="text-muted-foreground">Name: </span>
                <span className="text-foreground">{[clientUser.parent_first_name, clientUser.parent_last_name].filter(Boolean).join(' ')}</span>
              </div>
            )}
            {clientUser.parent_email && (
              <div>
                <span className="text-muted-foreground">Email: </span>
                <a href={`mailto:${clientUser.parent_email}`} className="text-accent hover:underline">{clientUser.parent_email}</a>
              </div>
            )}
            {clientUser.parent_phone && (
              <div>
                <span className="text-muted-foreground">Phone: </span>
                <a href={`tel:${clientUser.parent_phone}`} className="text-foreground">{clientUser.parent_phone}</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credits */}
      {credits.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground mb-3">Active Credits</h2>
          <div className="space-y-2">
            {credits.map(c => {
              const remaining = Math.max(0, (c.total_credits || 0) - (c.used_credits || 0));
              const durLabel = c.session_duration_minutes ? `${c.session_duration_minutes} min` : null;
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Zap className={`w-4 h-4 flex-shrink-0 ${remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{c.package_name || 'Credit package'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.used_credits || 0} / {c.total_credits || 0} used{durLabel ? ` · ${durLabel}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`font-oswald text-lg flex-shrink-0 ${remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`}>{remaining}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session history */}
      <div>
        <h2 className="font-oswald text-lg font-bold tracking-wider text-foreground uppercase mb-3">Session History</h2>
        {sessions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            No sessions with this client yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => {
              const sc = statusConfig[s.status] || statusConfig.pending;
              const Icon = sc.icon;
              return (
                <div key={s.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-oswald tracking-wider text-foreground">{formatLongDateET(s.date)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimeET(s.date, s.start_time)} · {s.duration_minutes} min · {s.county}
                      </p>
                      {s.session_goals && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <span className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Goals: </span>
                          {s.session_goals}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Badge className={`${sc.color} border text-[10px] font-oswald tracking-widest uppercase`}>
                        <Icon className="w-3 h-3 mr-1" /> {sc.label}
                      </Badge>
                      {s.payment_method === 'cash' && s.payment_status === 'unpaid' && s.status !== 'cancelled' && (
                        <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border text-[10px] font-oswald tracking-widest uppercase">
                          Unpaid · ${s.total_price || 0}
                        </Badge>
                      )}
                      {s.payment_status === 'paid' && (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border text-[10px] font-oswald tracking-widest uppercase">
                          <Check className="w-3 h-3 mr-1" /> Paid
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Notes editor — always available, even for upcoming (pre-session plan) */}
                  <SessionNotesEditor
                    session={s}
                    onSaved={(id, notes) => setSessions(prev => prev.map(x => x.id === id ? { ...x, notes } : x))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
