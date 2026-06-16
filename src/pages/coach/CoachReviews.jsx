import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MessageSquareQuote, Star } from 'lucide-react';
import { coachReviewRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { formatInstantInTz } from '@/lib/scheduleET';
import { cn } from '@/lib/utils';

function RatingStars({ rating }) {
  const rounded = Math.round(Number(rating) || 0);
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" role="img" aria-label={`${Number(rating) || 0} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn('h-4 w-4', star <= rounded ? 'fill-current' : 'text-muted-foreground/30')} aria-hidden="true" />
      ))}
    </span>
  );
}

function reviewFeedbackText(review) {
  if (review?.session_feedback_key === 'other' && review.session_feedback_other) {
    return review.session_feedback_other;
  }
  return review?.session_feedback_label || '';
}

function SkeletonReviews() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-secondary/60" />
      ))}
    </div>
  );
}

export default function CoachReviews() {
  const { isAdmin } = useAuth();
  const { coach, loading: coachLoading } = useMyCoach();
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');

  const coachId = coach?.id || '';
  const tz = coach?.timezone || 'America/Detroit';

  const load = useCallback(async () => {
    if (!coachId) return;
    setError('');
    const rows = await coachReviewRepo.listPublished(coachId).catch((err) => {
      setError(err?.message || 'Could not load reviews.');
      return [];
    });
    setReviews(rows || []);
  }, [coachId]);

  useEffect(() => {
    if (coachLoading) return;
    if (!coachId) {
      setReviews([]);
      return;
    }
    void load();
  }, [coachId, coachLoading, load]);

  const distribution = useMemo(() => [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: (reviews || []).filter((review) => Number(review.rating) === star).length,
  })), [reviews]);

  if (coachLoading) {
    return (
      <div className="mx-auto max-w-[960px] space-y-4">
        <div className="h-9 w-44 animate-pulse rounded bg-secondary" />
        <SkeletonReviews />
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="mx-auto max-w-[860px] rounded-lg border border-destructive/30 bg-card p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold tracking-[-0.01em] text-foreground">No coach profile linked</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? 'Your admin account is not linked to a coach record, so there are no coach reviews to show.'
                : 'Reviews need a linked coach record. Ask an admin to link your account.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const ratingAvg = Number(coach.rating_avg) || 0;
  const reviewCount = Number(coach.review_count) || reviews?.length || 0;

  return (
    <div className="mx-auto max-w-[960px] space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground">Reviews</h1>
        <p className="text-muted-foreground">Published client reviews from completed sessions.</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div>
            <p className="font-display text-5xl font-extrabold text-foreground">
              {reviewCount > 0 ? ratingAvg.toFixed(1) : '—'}
            </p>
            <div className="mt-2">
              <RatingStars rating={ratingAvg} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {reviewCount} published review{reviewCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="space-y-2">
            {distribution.map(({ star, count }) => (
              <div key={star} className="grid grid-cols-[44px_1fr_32px] items-center gap-3 text-sm">
                <span className="font-semibold text-foreground">{star} star</span>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: reviewCount > 0 ? `${(count / reviewCount) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-right text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-bold tracking-[-0.01em] text-foreground">Published reviews</h2>
        {error && (
          <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {reviews === null ? (
          <SkeletonReviews />
        ) : reviews.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquareQuote className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">No published reviews yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Clients can review you after a completed session.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{review.reviewer_name || 'Client'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInstantInTz(review.created_date, tz, { hour: undefined, minute: undefined, timeZoneName: undefined })}
                    </p>
                  </div>
                  <RatingStars rating={review.rating} />
                </div>
                {reviewFeedbackText(review) && (
                  <p className="mt-3 rounded-md bg-secondary/60 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                    Session feedback: {reviewFeedbackText(review)}
                  </p>
                )}
                {review.comment && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.comment}</p>
                )}
                {review.coach_response && (
                  <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Your response</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{review.coach_response}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
