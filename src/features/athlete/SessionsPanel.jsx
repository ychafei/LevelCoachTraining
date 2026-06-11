import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, MessageSquareQuote, Star, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { coachReviewRepo, sessionRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import { CANCEL_POLICY_COPY } from '@/lib/policies';
import {
  formatInTz,
  formatRangeInTz,
  isWithinHoursFromNow,
  slotsForDate,
  formatTimeInTz,
} from '@/lib/scheduleET';
import {
  EmptyState,
  SessionStatusBadge,
  SkeletonRows,
  coachDisplayName,
  coachLocationLabel,
  isUpcomingSession,
  sessionStartMs,
} from '@/features/athlete/portalShared';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function SessionRow({ session, coach, athleteName, actions }) {
  return (
    <li className="rounded-md border border-border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {formatInTz(session.date, session.start_time, session.timezone) || `${session.date} ${session.start_time}`}
            </p>
            <SessionStatusBadge status={session.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formatRangeInTz(session.date, session.start_time, session.duration_minutes, session.timezone)
                || `${session.duration_minutes} min`}
            </span>
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {coachDisplayName(coach)}
            </span>
            {coachLocationLabel(coach) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {coachLocationLabel(coach)}
              </span>
            )}
            {athleteName && (
              <span className="inline-flex items-center gap-1 font-semibold text-foreground/80">
                For {athleteName}
              </span>
            )}
          </div>
          {session.client_visible_notes && (
            <div className="mt-3 flex gap-2 rounded-md border border-accent/20 bg-accent/5 p-3">
              <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{session.client_visible_notes}</p>
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </li>
  );
}

// Upcoming + past session lists with cancel / reschedule / post-session review
// flows. All mutations go through the function-backed repos; server error
// messages are surfaced verbatim.
export default function SessionsPanel({
  sessions = [],
  coachesById = {},
  loading = false,
  onChanged = () => {},
  athleteNamesById = {},
  reviewedSessionIds = null, // Set of session ids already reviewed; null hides review CTAs
  canManage = true,
  emptyUpcoming = null,
}) {
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up = [];
    const done = [];
    for (const session of sessions) {
      (isUpcomingSession(session, now) ? up : done).push(session);
    }
    up.sort((a, b) => (sessionStartMs(a) ?? 0) - (sessionStartMs(b) ?? 0));
    done.sort((a, b) => (sessionStartMs(b) ?? 0) - (sessionStartMs(a) ?? 0));
    return { upcoming: up, past: done };
  }, [sessions]);

  const openReschedule = async (session) => {
    setRescheduleTarget(session);
    setNewDate('');
    setNewTime('');
    setAvailability(null);
    setAvailabilityLoading(true);
    try {
      const res = await callFn('getCoachAvailability', {
        coach_id: session.coach_id,
        start_date: todayIso(),
        end_date: addDaysIso(60),
      });
      setAvailability(res);
    } catch (err) {
      toast.error(err?.message || 'Could not load coach availability.');
      setRescheduleTarget(null);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const result = await sessionRepo.cancel(cancelTarget.id, cancelReason.trim());
      toast.success(result.credit_restored
        ? 'Session cancelled — your credit was restored.'
        : 'Session cancelled. Per the 24-hour policy, the credit was not restored.');
      setCancelTarget(null);
      setCancelReason('');
      onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not cancel this session.');
    } finally {
      setCancelling(false);
    }
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !newDate || !newTime) return;
    setRescheduling(true);
    try {
      await sessionRepo.reschedule({
        session_id: rescheduleTarget.id,
        date: newDate,
        start_time: newTime,
      });
      toast.success('Session rescheduled.');
      setRescheduleTarget(null);
      onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not reschedule this session.');
    } finally {
      setRescheduling(false);
    }
  };

  const submitReview = async () => {
    if (!reviewTarget || reviewRating < 1) return;
    setReviewSaving(true);
    try {
      await coachReviewRepo.submit({
        session_id: reviewTarget.id,
        coach_id: reviewTarget.coach_id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      toast.success('Thanks — your review was submitted.');
      setReviewTarget(null);
      setReviewRating(0);
      setReviewComment('');
      onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not submit your review.');
    } finally {
      setReviewSaving(false);
    }
  };

  const slotOptions = (availability && newDate && rescheduleTarget)
    ? slotsForDate(availability, newDate, Number(rescheduleTarget.duration_minutes) || 60)
    : [];

  if (loading) return <SkeletonRows rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Upcoming sessions
        </h3>
        {upcoming.length === 0 ? (
          emptyUpcoming || (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming sessions"
              body="When a session is booked it will show up here with its date, time, and coach."
              cta={{ href: '/coaches', label: 'Find a coach' }}
              compact
            />
          )
        ) : (
          <ul className="space-y-3">
            {upcoming.map((session) => {
              const late = isWithinHoursFromNow(session.date, session.start_time, 24, Date.now(), session.timezone);
              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  coach={coachesById[session.coach_id]}
                  athleteName={athleteNamesById[session.athlete_id] || ''}
                  actions={canManage ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openReschedule(session)}
                      >
                        Reschedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-destructive/40 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => { setCancelTarget(session); setCancelReason(''); }}
                      >
                        Cancel{late ? ' (inside 24h)' : ''}
                      </Button>
                    </>
                  ) : null}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Past sessions
        </h3>
        {past.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="No past sessions yet"
            body="Completed and cancelled sessions appear here, along with any notes your coach shares."
            compact
          />
        ) : (
          <ul className="space-y-3">
            {past.map((session) => {
              const showReview = reviewedSessionIds !== null
                && session.status === 'completed'
                && !reviewedSessionIds.has(session.id);
              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  coach={coachesById[session.coach_id]}
                  athleteName={athleteNamesById[session.athlete_id] || ''}
                  actions={showReview ? (
                    <Button
                      size="sm"
                      className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90"
                      onClick={() => { setReviewTarget(session); setReviewRating(0); setReviewComment(''); }}
                    >
                      <Star className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Review session
                    </Button>
                  ) : null}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>{CANCEL_POLICY_COPY}</DialogDescription>
          </DialogHeader>
          {cancelTarget && isWithinHoursFromNow(cancelTarget.date, cancelTarget.start_time, 24, Date.now(), cancelTarget.timezone) && (
            <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-500">
              This session starts within 24 hours — cancelling now will forfeit the session credit.
            </p>
          )}
          <div>
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={500}
              className="mt-1 bg-background"
              placeholder="Let the coach know why you're cancelling."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep session</Button>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={confirmCancel}
            >
              {cancelling ? 'Cancelling…' : 'Cancel session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Reschedule session</DialogTitle>
            <DialogDescription>
              Pick a new time inside the coach&apos;s availability. The same {Number(rescheduleTarget?.duration_minutes) || 60}-minute
              duration applies, and the 24-hour cancellation policy carries over.
            </DialogDescription>
          </DialogHeader>
          {availabilityLoading ? (
            <SkeletonRows rows={2} />
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="reschedule-date">New date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  min={todayIso()}
                  max={addDaysIso(60)}
                  value={newDate}
                  onChange={(event) => { setNewDate(event.target.value); setNewTime(''); }}
                  className="mt-1 bg-background"
                />
              </div>
              <div>
                <Label htmlFor="reschedule-time">Open start times</Label>
                <Select value={newTime} onValueChange={setNewTime} disabled={!newDate || slotOptions.length === 0}>
                  <SelectTrigger id="reschedule-time" className="mt-1 bg-background">
                    <SelectValue placeholder={!newDate ? 'Choose a date first' : slotOptions.length === 0 ? 'No open times that day' : 'Select a time'} />
                  </SelectTrigger>
                  <SelectContent>
                    {slotOptions.map((slot) => (
                      <SelectItem key={slot} value={slot}>
                        {formatTimeInTz(newDate, slot, availability?.timezone) || slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newDate && slotOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Try another date — the coach has no open windows on that day.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTarget(null)}>Back</Button>
            <Button
              disabled={!newDate || !newTime || rescheduling}
              onClick={confirmReschedule}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {rescheduling ? 'Rescheduling…' : 'Confirm new time'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Review your session</DialogTitle>
            <DialogDescription>
              How was your session with {coachDisplayName(coachesById[reviewTarget?.coach_id])}? Your rating helps other athletes find great coaches.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Rating from 1 to 5 stars" className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={reviewRating === value}
                  aria-label={`${value} star${value > 1 ? 's' : ''}`}
                  onClick={() => setReviewRating(value)}
                  className="rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={value <= reviewRating ? 'h-7 w-7 fill-yellow-400 text-yellow-400' : 'h-7 w-7 text-muted-foreground'}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="review-comment">Comment (optional)</Label>
              <Textarea
                id="review-comment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                maxLength={5000}
                className="mt-1 bg-background"
                placeholder="What went well? What did you work on?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button
              disabled={reviewRating < 1 || reviewSaving}
              onClick={submitReview}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {reviewSaving ? 'Submitting…' : 'Submit review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
