import { makeRepo } from '@/api/repoFactory';
import { COL, mapDoc } from '@/api/appwriteClient';
import { callFn } from '@/lib/rpc';

const base = makeRepo(COL.Coach);

// `availability` is a String attribute in Appwrite holding JSON, but the whole
// app uses it as an object (coach.availability['Monday'] etc.). Centralise the
// deserialisation here so reads return an object.
function parseAvail(doc) {
  if (doc && typeof doc.availability === 'string' && doc.availability.trim()) {
    try {
      return { ...doc, availability: JSON.parse(doc.availability) };
    } catch {
      return { ...doc, availability: {} };
    }
  }
  return doc;
}

// Coaches are server-only writable. Coach self-service goes through the
// `coachSelf` function (whitelisted — never fee/verified/stripe/active
// fields); admin mutations go through `adminOps`. Public reads stay direct
// (collection read: any).
export const coachRepo = {
  list: async (sort) => (await base.list(sort)).map(parseAvail),
  filter: async (where, sort) => (await base.filter(where, sort)).map(parseAvail),
  get: async (id) => parseAvail(await base.get(id)),

  // --- Coach self-service (label `coach`) -----------------------------------

  // Owner-only read of the signed-in coach merged with their private contact
  // fields (email / email_verified_at / phone) from `coach_private`. Direct
  // reads of `coaches` no longer expose PII, so the portal loads through here.
  getSelf: async () => {
    const r = await callFn('coachSelf', { action: 'getSelf' });
    return r?.coach ? parseAvail(mapDoc(r.coach)) : (r?.coach || null);
  },

  // Whitelisted profile fields (bio, quote, training area, photo, …).
  updateSelf: async (data) => {
    const res = await callFn('coachSelf', { action: 'updateProfile', ...data });
    return res?.coach ? parseAvail(mapDoc(res.coach)) : res?.coach;
  },

  // Weekly availability object — serialised server-side.
  setAvailability: (availability) => callFn('coachSelf', { action: 'setAvailability', availability }),

  setBookingRules: (rules) => callFn('coachSelf', { action: 'setBookingRules', ...rules }),

  setSportProfiles: (profiles) => callFn('coachSelf', { action: 'setSportProfiles', profiles }),

  // Email-ownership verification (server-generated hashed codes).
  requestEmailCode: (email) => callFn('coachSelf', { action: 'requestEmailCode', ...(email ? { email } : {}) }),
  confirmEmailCode: (code) => callFn('coachSelf', { action: 'confirmEmailCode', code }),

  // Per-coach packages (the coach owns their own prices/offerings).
  listPackages: async () => (await callFn('coachSelf', { action: 'listPackages' }))?.packages || [],
  savePackage: (pkg) => callFn('coachSelf', { action: 'savePackage', ...pkg }),
  deletePackage: (package_id) => callFn('coachSelf', { action: 'deletePackage', package_id }),

  // Marketplace publication (server-gated: legal packet + Connect + verified
  // email + complete profile + at least one active package).
  publishChecklist: () => callFn('coachSelf', { action: 'publishChecklist' }),
  publish: () => callFn('coachSelf', { action: 'publish' }),
  unpublish: () => callFn('coachSelf', { action: 'unpublish' }),

  // --- Admin (label `admin`) -------------------------------------------------

  adminLinkAccount: (coach_id, profile_id) =>
    callFn('adminOps', { action: 'linkCoachAccount', coach_id, profile_id }),

  // Admin-gated read of a coach's private contact fields for the edit dialog
  // (email / phone / email_verified_at live in coach_private, not on the row).
  adminGetCoachContact: (coachId) =>
    callFn('adminOps', { action: 'getCoachContact', coach_id: coachId }),

  // Coaches are server-only writable, so admin CRUD routes through adminOps
  // (createCoach links a profile, deleteCoach unlinks the profile after the
  // delete succeeds, unlinkCoachAccount is the inverse of linkCoachAccount).
  adminCreateCoach: (fields, profileId) =>
    callFn('adminOps', { action: 'createCoach', fields, profile_id: profileId }),

  adminUpdateCoach: (coach_id, updates) =>
    callFn('adminOps', { action: 'updateCoach', coach_id, updates }),

  adminDeleteCoach: (coach_id) =>
    callFn('adminOps', { action: 'deleteCoach', coach_id }),

  adminUnlinkCoach: (coach_id) =>
    callFn('adminOps', { action: 'unlinkCoachAccount', coach_id }),

  adminSetFee: (coach_id, platform_fee_bps) =>
    callFn('adminOps', { action: 'setCoachFee', coach_id, platform_fee_bps }),

  adminSetActive: (coach_id, is_active) =>
    callFn('adminOps', { action: 'setCoachActive', coach_id, is_active }),
};
