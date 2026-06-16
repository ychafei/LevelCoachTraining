import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { coachReviewRepo } from '@/api/repo';
import { coachDisplayName, sessionStartMs } from '@/features/athlete/portalShared';

export const SESSION_FEEDBACK_OPTIONS = [
  { value: 'great_fit', label: 'Great fit' },
  { value: 'helpful', label: 'Helpful session' },
  { value: 'okay', label: 'It was okay' },
  { value: 'not_right_fit', label: 'Not the right fit' },
  { value: 'other', label: 'Other' },
];

function buildReviewedIds(reviewedSessionIds, localReviewedIds) {
  const ids = new Set(reviewedSessionIds || []);
  for (const id of localReviewedIds) ids.add(id);
  return ids;
}

function firstPendingReviewSession(sessions, reviewedIds, dismissedIds) {
  return [...sessions]
    .filter((session) => (
      session.status === 'completed'
      && !reviewedIds.has(session.id)
      && !dismissedIds.has(session.id)
    ))
    .sort((a, b) => (sessionStartMs(b) ?? 0) - (sessionStartMs(a) ?? 0))[0] || null;
}

export function ReviewSessionDialog({
  open,
  session,
  coach,
  onOpenChange,
  onSubmitted,
}) {
  const [feedback, setFeedback] = useState('');
  const [other, setOther] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFeedback('');
    setOther('');
    setRating(0);
    setComment('');
  }, [open, session?.id]);

  const submitReview = async () => {
    if (!session || rating < 1) return;
    if (!feedback) {
      toast.error('Choose how the session felt first.');
      return;
    }
    if (feedback === 'other' && !other.trim()) {
      toast.error('Add a short note for Other.');
      return;
    }
    setSaving(true);
    try {
      await coachReviewRepo.submit({
        session_id: session.id,
        coach_id: session.coach_id,
        session_feedback_key: feedback,
        session_feedback_other: feedback === 'other' ? other.trim() : '',
        rating,
        comment: comment.trim(),
      });
      toast.success('Thanks. Your review was submitted.');
      onSubmitted?.(session.id);
    } catch (err) {
      toast.error(err?.message || 'Could not submit your review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle>How was your session with {coachDisplayName(coach)}?</DialogTitle>
          <DialogDescription>
            Share quick feedback first, then leave a public rating and review to help other athletes choose the right coach.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="review-feedback">Session feedback</Label>
            <Select
              value={feedback}
              onValueChange={(value) => {
                setFeedback(value);
                if (value !== 'other') setOther('');
              }}
            >
              <SelectTrigger id="review-feedback" className="mt-1 bg-background">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {SESSION_FEEDBACK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {feedback === 'other' && (
            <div>
              <Label htmlFor="review-other">Tell us what stood out</Label>
              <Textarea
                id="review-other"
                value={other}
                onChange={(event) => setOther(event.target.value)}
                maxLength={1000}
                className="mt-1 bg-background"
                placeholder="Add a short note about the session."
              />
            </div>
          )}
          <div role="radiogroup" aria-label="Rating from 1 to 5 stars" className="flex items-center gap-1">
            <span className="mr-2 text-sm font-medium text-foreground">Coach rating</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                onClick={() => setRating(value)}
                className="rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={value <= rating ? 'h-7 w-7 fill-yellow-400 text-yellow-400' : 'h-7 w-7 text-muted-foreground'}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="review-comment">Public review (optional)</Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={5000}
              className="mt-1 bg-background"
              placeholder="What went well? What did you work on?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button
            disabled={!feedback || (feedback === 'other' && !other.trim()) || rating < 1 || saving}
            onClick={submitReview}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {saving ? 'Submitting...' : 'Submit review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PostSessionReviewPrompt({
  sessions = [],
  coachesById = {},
  reviewedSessionIds = null,
  loading = false,
  onChanged = () => {},
}) {
  const [reviewTarget, setReviewTarget] = useState(null);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const [localReviewedIds, setLocalReviewedIds] = useState(() => new Set());

  const reviewedIds = useMemo(
    () => buildReviewedIds(reviewedSessionIds, localReviewedIds),
    [reviewedSessionIds, localReviewedIds],
  );

  const pendingSession = useMemo(() => {
    if (reviewedSessionIds === null) return null;
    return firstPendingReviewSession(sessions, reviewedIds, dismissedIds);
  }, [dismissedIds, reviewedIds, reviewedSessionIds, sessions]);

  useEffect(() => {
    if (loading || reviewTarget || !pendingSession) return;
    setReviewTarget(pendingSession);
  }, [loading, pendingSession, reviewTarget]);

  const handleOpenChange = (open) => {
    if (open) return;
    if (reviewTarget?.id) {
      setDismissedIds((prev) => new Set(prev).add(reviewTarget.id));
    }
    setReviewTarget(null);
  };

  const handleSubmitted = (sessionId) => {
    setLocalReviewedIds((prev) => new Set(prev).add(sessionId));
    setReviewTarget(null);
    onChanged();
  };

  return (
    <ReviewSessionDialog
      open={!!reviewTarget}
      session={reviewTarget}
      coach={coachesById[reviewTarget?.coach_id]}
      onOpenChange={handleOpenChange}
      onSubmitted={handleSubmitted}
    />
  );
}
