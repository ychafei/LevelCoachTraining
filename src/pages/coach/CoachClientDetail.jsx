import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { sessionRepo, sessionCreditRepo, profileRepo, conversationRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, User as UserIcon, MapPin, Users, Zap,
  Clock, CheckCircle2, XCircle, MessageSquare, StickyNote, Save, Check,
  ClipboardList, Lock, Eye,
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
      await sessionRepo.update(session.id, { notes: value });
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
          <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground flex items-center gap-1">
            <StickyNote className="w-3 h-3" /> Private Notes
          </p>
          <button type="button" onClick={() => setEditing(true)} className="text-[10px] font-display tracking-widest uppercase text-accent hover:underline">
            Edit
          </button>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">{session.notes}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1 flex items-center gap-1">
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
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
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

// ----- Coaching plan editor ------------------------------------------------
// Coach-private structured plan. Stored on the most relevant Session: the next
// upcoming session if one exists, otherwise the most recent past session. The
// plan reads from the most recent session that has any plan field populated, so
// older entries don't disappear when a new session is created.

const PLAN_FIELDS = [
  { key: 'training_plan',        label: 'Training Plan',        placeholder: 'Long-term plan for this client.',                        visibility: 'private' },
  { key: 'strengths',            label: 'Strengths',            placeholder: 'What this client does well.',                            visibility: 'private' },
  { key: 'weaknesses',           label: 'Weaknesses',           placeholder: 'Areas to develop.',                                      visibility: 'private' },
  { key: 'next_session_focus',   label: 'Next Session Focus',   placeholder: 'What to work on at the next session.',                   visibility: 'private' },
  { key: 'homework',             label: 'Homework',             placeholder: 'Between-session work — the client sees this.',           visibility: 'shared' },
  { key: 'client_visible_notes', label: 'Notes for Client',     placeholder: 'Anything else you want the client to see on their dashboard.', visibility: 'shared' },
];

function pickTargetSession(sessions) {
  if (!sessions || sessions.length === 0) return null;
  const upcoming = sessions
    .filter(s => s.status === 'pending' || s.status === 'confirmed')
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
  if (upcoming.length > 0) return upcoming[0];
  // Otherwise most recent by date (sessions list comes pre-sorted desc)
  return sessions[0];
}

function pickPlanSnapshot(sessions) {
  // Walk sessions from newest to oldest; the first non-empty value per field wins.
  const out = {};
  PLAN_FIELDS.forEach(f => { out[f.key] = ''; });
  for (const s of sessions) {
    PLAN_FIELDS.forEach(f => {
      if (!out[f.key] && s[f.key]) out[f.key] = s[f.key];
    });
    if (PLAN_FIELDS.every(f => out[f.key])) break;
  }
  return out;
}

function CoachingPlan({ sessions, onSaved }) {
  const targetSession = useMemo(() => pickTargetSession(sessions), [sessions]);
  const snapshot = useMemo(() => pickPlanSnapshot(sessions), [sessions]);
  const [draft, setDraft] = useState(snapshot);
  const [saving, setSaving] = useState(false);

  // Reset draft when the snapshot changes (e.g. after save propagates).
  useEffect(() => { setDraft(snapshot); }, [snapshot]);

  const dirty = useMemo(
    () => PLAN_FIELDS.some(f => (draft[f.key] || '') !== (snapshot[f.key] || '')),
    [draft, snapshot]
  );

  if (!targetSession) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="w-4 h-4 text-accent" />
          <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground">Coaching Plan</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          The plan saves to your most relevant session with this client. Book or hold a session first to start the plan.
        </p>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const patch = {};
      PLAN_FIELDS.forEach(f => { patch[f.key] = draft[f.key] || ''; });
      await sessionRepo.update(targetSession.id, patch);
      onSaved?.(targetSession.id, patch);
      toast.success('Coaching plan saved');
    } catch (err) {
      console.error('plan save failed', err);
      toast.error('Could not save coaching plan');
    } finally {
      setSaving(false);
    }
  };

  const targetLabel = (targetSession.status === 'pending' || targetSession.status === 'confirmed')
    ? `next session · ${formatLongDateET(targetSession.date)}`
    : `most recent session · ${formatLongDateET(targetSession.date)}`;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-accent" />
          <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground">Coaching Plan</h2>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Saves to your <span className="text-foreground">{targetLabel}</span>. Past entries stay attached to their session — this view always shows the latest values.
      </p>

      {/* Private — coach only */}
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-3 h-3 text-muted-foreground" />
        <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Private — coach only</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {PLAN_FIELDS.filter(f => f.visibility === 'private').map(f => (
          <div key={f.key} className={f.key === 'training_plan' ? 'md:col-span-2' : ''}>
            <label className="font-display tracking-wider uppercase text-xs text-muted-foreground">{f.label}</label>
            <Textarea
              value={draft[f.key] || ''}
              onChange={(e) => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              rows={f.key === 'training_plan' ? 4 : 3}
              className="bg-secondary border-border mt-1 text-sm"
            />
          </div>
        ))}
      </div>

      {/* Shared — visible to client */}
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-3 h-3 text-accent" />
        <p className="text-[10px] font-display tracking-widest uppercase text-accent">Shared — visible on client dashboard</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PLAN_FIELDS.filter(f => f.visibility === 'shared').map(f => (
          <div key={f.key}>
            <label className="font-display tracking-wider uppercase text-xs text-muted-foreground">{f.label}</label>
            <Textarea
              value={draft[f.key] || ''}
              onChange={(e) => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              rows={3}
              className="bg-secondary border-accent/30 mt-1 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 mt-4">
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(snapshot)}
            className="text-[11px] font-display tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            Revert
          </button>
        )}
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || saving}
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90 disabled:opacity-40"
        >
          <Save className="w-3 h-3 mr-1" /> {saving ? 'Saving…' : 'Save Plan'}
        </Button>
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
          sessionRepo.filter({ coach_id: user.coach_id, client_email: clientEmail }, '-date'),
          sessionCreditRepo.filter({ client_email: clientEmail }),
          profileRepo.filter({ email: clientEmail }),
          // NOTE: broad-fetch limitation — narrowed client-side. See risks in plan.
          conversationRepo.filter({}),
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
      await conversationRepo.create({
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
          <h2 className="font-display text-lg tracking-wider text-foreground uppercase">No record for {clientEmail}</h2>
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
              <h1 className="font-display text-2xl font-bold tracking-wider text-foreground truncate">{clientName}</h1>
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
                className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
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
              <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{s.label}</p>
              <p className="font-display text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Parent / guardian (minors only) */}
      {isMinor && clientUser && (clientUser.parent_email || clientUser.parent_phone || clientUser.parent_first_name) && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-3">Parent / Guardian</h2>
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
          <h2 className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-3">Active Credits</h2>
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
                  <span className={`font-display text-lg flex-shrink-0 ${remaining > 0 ? 'text-accent' : 'text-muted-foreground'}`}>{remaining}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coaching plan (coach-private; mirrors onto most relevant session) */}
      {sessions.length > 0 && (
        <CoachingPlan
          sessions={sessions}
          onSaved={(id, patch) => setSessions(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))}
        />
      )}

      {/* Session history */}
      <div>
        <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase mb-3">Session History</h2>
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
                      <p className="font-display tracking-wider text-foreground">{formatLongDateET(s.date)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimeET(s.date, s.start_time)} · {s.duration_minutes} min · {s.county}
                      </p>
                      {s.session_goals && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <span className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Goals: </span>
                          {s.session_goals}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Badge className={`${sc.color} border text-[10px] font-display tracking-widest uppercase`}>
                        <Icon className="w-3 h-3 mr-1" /> {sc.label}
                      </Badge>
                      {s.payment_method === 'cash' && s.payment_status === 'unpaid' && s.status !== 'cancelled' && (
                        <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border text-[10px] font-display tracking-widest uppercase">
                          Unpaid · ${s.total_price || 0}
                        </Badge>
                      )}
                      {s.payment_status === 'paid' && (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border text-[10px] font-display tracking-widest uppercase">
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
