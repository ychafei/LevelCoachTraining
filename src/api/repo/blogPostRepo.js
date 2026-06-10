import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.BlogPost);

// Admins (label) can still create/update drafts directly, but publishing must
// go through adminOps.publishBlogPost — the server flips the per-document
// read-any grant that makes a post publicly readable. Drafts are only
// admin-readable; public lists therefore only ever see published posts.
export const blogPostRepo = {
  ...base,

  // publish(id) / publish(id, false) to unpublish.
  publish: (post_id, publish = true) =>
    callFn('adminOps', { action: 'publishBlogPost', post_id, publish }),
};
