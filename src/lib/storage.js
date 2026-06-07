import { storage as appwriteStorage, ID } from '@/api/appwriteClient';

// Maps a logical bucket name (used at every call site today) to the actual
// Appwrite bucket id. Provisioner created these six buckets — keep this in
// sync if any are renamed.
const BUCKETS = {
  'coach-photos':        'coach-photos',
  'client-photos':       'client-photos',
  'blog-media':          'blog-media',
  'site-content':        'site-content',
  'coach-resumes':       'coach-resumes',
  'message-attachments': 'message-attachments',
  'legal-documents':     'legal-documents',
  'coach-documents':     'coach-documents',
  'org-logos':           'org-logos',
  'generated-receipts':  'generated-receipts',
};

export const storage = {
  // Returns { url, id } where url is a public file-view URL. Components
  // currently destructure `url` only.
  uploadFile: async (bucket, file) => {
    const bucketId = BUCKETS[bucket];
    if (!bucketId) {
      throw new Error(`Unknown storage bucket: ${bucket}`);
    }
    const created = await appwriteStorage.createFile(bucketId, ID.unique(), file);
    const url = appwriteStorage.getFileView(bucketId, created.$id).toString();
    return { url, id: created.$id };
  },

  getFileViewUrl: (bucket, fileId) => {
    const bucketId = BUCKETS[bucket];
    if (!bucketId) {
      throw new Error(`Unknown storage bucket: ${bucket}`);
    }
    if (!fileId) return '';
    return appwriteStorage.getFileView(bucketId, fileId).toString();
  },
};
