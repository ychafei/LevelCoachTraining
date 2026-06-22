import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Heart, MessageSquare, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { conversationRepo } from '@/api/repo';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/auth';
import { accountActionLock } from '@/lib/accountReadiness';
import { publicCoachDisplay } from '@/lib/publicCoach';
import { parseNotificationPrefs, savedCoachIdsFromPrefs } from '@/lib/savedCoachPrefs';

function stop(event) {
  event?.stopPropagation?.();
}

function currentPath(location) {
  return `${location.pathname}${location.search || ''}${location.hash || ''}`;
}

function savedCoachIds(user) {
  return savedCoachIdsFromPrefs(user?.notification_prefs);
}

function AuthGateDialog({ open, onOpenChange, coach, intent = 'continue', nextPath, lock = null }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const model = publicCoachDisplay(coach);
  const locked = lock && lock.type !== 'auth';
  const actionCopy = locked ? {
    title: lock.title || 'Finish account setup',
    body: lock.body || 'Finish your LevelCoach account before using this feature.',
  } : ({
    save: {
      title: `Save ${model.firstName} to your coach list`,
      body: 'Sign in with Google to keep a private list of coaches you want to compare later.',
    },
    message: {
      title: `Message ${model.firstName}`,
      body: 'Sign in with Google to start a secure LevelCoach conversation with this coach.',
    },
    book: {
      title: `Book with ${model.firstName}`,
      body: 'Sign in with Google to choose the athlete, confirm documents, and book training securely.',
    },
    continue: {
      title: 'Continue with LevelCoach',
      body: 'Sign in with Google to keep going.',
    },
  }[intent] || {});

  const startGoogle = async () => {
    setSubmitting(true);
    try {
      await auth.signOut();
      auth.createOAuthSession('google', nextPath || window.location.pathname);
    } catch (err) {
      setSubmitting(false);
      toast.error(err?.message || 'Could not start Google sign-in.');
    }
  };

  const continueLocked = () => {
    onOpenChange(false);
    const next = nextPath || window.location.pathname;
    if (lock?.type === 'setup') {
      navigate(`/onboarding?next=${encodeURIComponent(next)}`);
      return;
    }
    navigate(lock?.path || '/verify-email');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="coach-auth-gate"
        className="max-w-[440px] rounded-xl border-slate-200 bg-white p-0 text-slate-950 shadow-2xl shadow-slate-950/20"
        onClick={stop}
      >
        <div className="border-b border-slate-200 px-6 pb-5 pt-7 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogHeader className="mt-4 text-center">
            <DialogTitle className="font-display text-2xl font-extrabold tracking-normal text-slate-950">
              {actionCopy.title}
            </DialogTitle>
            <DialogDescription className="mx-auto max-w-sm text-sm leading-6 text-slate-600">
              {actionCopy.body}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5">
          {locked ? (
            <Button
              type="button"
              onClick={continueLocked}
              className="h-12 w-full rounded-lg bg-blue-600 text-sm font-extrabold text-white hover:bg-blue-700"
            >
              {lock?.cta || 'Continue'}
            </Button>
          ) : (
            <button
              type="button"
              onClick={startGoogle}
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-extrabold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon className="h-5 w-5" />
              {submitting ? 'Opening Google...' : 'Continue with Google'}
            </button>
          )}
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            {locked
              ? 'Public coach profiles stay open while you finish account setup.'
              : 'You can browse every public coach profile without signing in. Saving, messaging, and booking require an account.'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageCoachDialog({ open, onOpenChange, coach }) {
  const navigate = useNavigate();
  const model = publicCoachDisplay(coach);
  const [message, setMessage] = useState(
    `Hi ${model.firstName}, I’m interested in training. Are you available to talk?`,
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage(`Hi ${model.firstName}, I’m interested in training. Are you available to talk?`);
    }
  }, [open, model.firstName]);

  const send = async () => {
    const content = message.trim();
    if (!content) return;
    setSending(true);
    try {
      await conversationRepo.start({ coach_id: model.id, first_message: content });
      toast.success(`Message sent to ${model.firstName}.`);
      onOpenChange(false);
      navigate('/messages');
    } catch (err) {
      toast.error(err?.message || 'Could not start the conversation.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[520px] rounded-xl border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-950/20"
        onClick={stop}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-extrabold tracking-normal">
            Message {model.displayName}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Keep scheduling and training questions inside LevelCoach so both sides have a clear record.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor={`message-${model.id}`} className="mb-2 block text-sm font-bold text-slate-950">
            First message
          </label>
          <Textarea
            id={`message-${model.id}`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            className="resize-none border-slate-300 bg-white text-sm leading-6 focus-visible:ring-blue-100"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border-slate-200 font-bold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={send}
            disabled={sending || !message.trim()}
            className="rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {sending ? 'Sending...' : 'Send message'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaveCoachButton({
  coach,
  showLabel = false,
  className = '',
  iconClassName = '',
}) {
  const location = useLocation();
  const { isAuthenticated, user, refetchUser } = useAuth();
  const model = publicCoachDisplay(coach);
  const [gateOpen, setGateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimisticSaved, setOptimisticSaved] = useState(null);

  const saved = useMemo(
    () => (optimisticSaved == null ? savedCoachIds(user).includes(String(model.id)) : optimisticSaved),
    [model.id, optimisticSaved, user],
  );

  useEffect(() => { setOptimisticSaved(null); }, [user?.notification_prefs, model.id]);

  const toggle = async (event) => {
    stop(event);
    const lock = isAuthenticated ? accountActionLock(user) : null;
    if (!isAuthenticated || lock) {
      setGateOpen(true);
      return;
    }
    const nextSaved = !saved;
    setOptimisticSaved(nextSaved);
    setSaving(true);
    try {
      const prefs = parseNotificationPrefs(user?.notification_prefs);
      const ids = new Set(savedCoachIds(user));
      if (nextSaved) ids.add(String(model.id));
      else ids.delete(String(model.id));
      await auth.updateCurrentUser({
        notification_prefs: {
          ...prefs,
          saved_coach_ids: [...ids],
        },
      });
      await refetchUser?.();
      toast.success(nextSaved ? `${model.firstName} saved.` : `${model.firstName} removed from saved coaches.`);
    } catch (err) {
      setOptimisticSaved(!nextSaved);
      toast.error(err?.message || 'Could not update saved coaches.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        data-testid="save-coach-button"
        type="button"
        onClick={toggle}
        disabled={saving}
        className={className}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${model.displayName} from saved coaches` : `Save ${model.displayName}`}
        title={saved ? 'Saved coach' : 'Save coach'}
      >
        <Heart
          className={`${iconClassName} ${saved ? 'fill-blue-600 text-blue-600' : 'text-slate-700'}`}
          aria-hidden="true"
        />
        {showLabel && <span>{saved ? 'Saved' : 'Save'}</span>}
      </button>
      <AuthGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        coach={coach}
        intent="save"
        nextPath={currentPath(location)}
        lock={isAuthenticated ? accountActionLock(user) : null}
      />
    </>
  );
}

export function MessageCoachButton({
  coach,
  showLabel = false,
  className = '',
  iconClassName = '',
}) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const model = publicCoachDisplay(coach);
  const [gateOpen, setGateOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  const open = (event) => {
    stop(event);
    const lock = isAuthenticated ? accountActionLock(user) : null;
    if (!isAuthenticated || lock) setGateOpen(true);
    else setMessageOpen(true);
  };

  return (
    <>
      <button
        data-testid="message-coach-button"
        type="button"
        onClick={open}
        className={className}
        aria-label={`Message ${model.displayName}`}
        title={`Message ${model.displayName}`}
      >
        <MessageSquare className={iconClassName} aria-hidden="true" />
        {showLabel && <span>Message</span>}
      </button>
      <AuthGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        coach={coach}
        intent="message"
        nextPath={currentPath(location)}
        lock={isAuthenticated ? accountActionLock(user) : null}
      />
      <MessageCoachDialog open={messageOpen} onOpenChange={setMessageOpen} coach={coach} />
    </>
  );
}

export function BookCoachButton({
  coach,
  bookHref,
  showLabel = true,
  className = '',
  iconClassName = '',
}) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const model = publicCoachDisplay(coach);
  const [gateOpen, setGateOpen] = useState(false);

  const book = (event) => {
    stop(event);
    const lock = isAuthenticated ? accountActionLock(user) : null;
    if (!isAuthenticated || lock) setGateOpen(true);
    else navigate(bookHref);
  };

  return (
    <>
      <button
        data-testid="book-coach-button"
        type="button"
        onClick={book}
        className={className}
        aria-label={`Book training with ${model.displayName}`}
        title={`Book training with ${model.displayName}`}
      >
        <CalendarDays className={iconClassName} aria-hidden="true" />
        {showLabel && <span>Book session</span>}
      </button>
      <AuthGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        coach={coach}
        intent="book"
        nextPath={bookHref}
        lock={isAuthenticated ? accountActionLock(user) : null}
      />
    </>
  );
}

export function CoachActionPanel({ coach, bookHref, mode = 'card' }) {
  if (mode === 'profile') {
    return (
      <div data-testid="coach-action-panel" className="space-y-2">
        <BookCoachButton
          coach={coach}
          bookHref={bookHref}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
          iconClassName="h-4 w-4"
        />
        <div className="grid grid-cols-2 gap-2">
          <MessageCoachButton
            coach={coach}
            showLabel
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            iconClassName="h-4 w-4"
          />
          <SaveCoachButton
            coach={coach}
            showLabel
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
            iconClassName="h-4 w-4"
          />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="coach-action-panel" className="grid grid-cols-[40px_1fr] gap-2">
      <MessageCoachButton
        coach={coach}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
        iconClassName="h-4 w-4"
      />
      <BookCoachButton
        coach={coach}
        bookHref={bookHref}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        iconClassName="h-4 w-4"
      />
    </div>
  );
}
