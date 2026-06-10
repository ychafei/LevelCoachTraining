import { makeRepo } from '@/api/repoFactory';
import { mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

// Reviews are server-only writable via the `reviews` function: submit is
// restricted to clients with a completed session with that coach (one per
// session), respond to the coach, moderate to admins. Published reviews get a
// per-document read-any grant, so public reads stay direct.
const base = makeRepo('coach_reviews');

export const coachReviewRepo = {
  list: base.list,
  filter: base.filter,
  get: base.get,

  // Publicly readable reviews for a coach, newest first.
  listPublished: (coachId) => base.filter({ coach_id: coachId, status: 'published' }, '-created_date'),

  // Client: { coach_id, session_id, rating, comment? }
  submit: async (payload) => {
    const res = await callFn('reviews', { action: 'submit', ...payload });
    return res?.review ? mapDoc(res.review) : res;
  },

  // Coach response to a review.
  respond: (review_id, response) => callFn('reviews', { action: 'respond', review_id, response }),

  // Admin moderation. decision: 'publish' | 'unpublish' | 'reject'.
  moderate: (review_id, decision) => callFn('reviews', { action: 'moderate', review_id, decision }),
};
