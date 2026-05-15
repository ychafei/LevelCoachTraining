import { Client, Account, Databases, Storage, Functions, Query, ID } from 'appwrite';

// Hardcoded fallbacks. Both values are public-by-design (Appwrite project IDs
// ship in every browser request anyway), so embedding them protects against
// the exact failure mode where a Vercel build runs without env vars and bakes
// `setProject(undefined)` into the bundle.
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const PROJECT  = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69efb263000fe1c34344';

export const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT);
export const account   = new Account(client);
export const databases = new Databases(client);
export const storage   = new Storage(client);
export const functions = new Functions(client);
export { Query, ID };

export const DB_ID = 'lctraining';

// Logical entity name → Appwrite collection id. Names match the Base44 entity
// names so legacy callers keep working.
export const COL = {
  Coach:             'coaches',
  Session:           'sessions',
  SessionCredit:     'session_credits',
  Conversation:      'conversations',
  Message:           'messages',
  MatchRequest:      'match_requests',
  CoachApplication:  'coach_applications',
  CoachBlock:        'coach_blocks',
  PricingPackage:    'pricing_packages',
  BlogPost:          'blog_posts',
  AuditLog:          'audit_logs',
  User:              'profiles',
  Profile:           'profiles',
  SiteContent:       'site_content',
  UnsubscribeRecord: 'unsubscribe_records',
  UserBan:           'user_bans',
  Player:            'players',
  TeamMatch:         'team_matches',
  GalleryItem:       'gallery_items',
  LcfcSettings:      'lcfc_settings',
  LcfcStaff:         'lcfc_staff',
  LcfcNews:          'lcfc_news',
  LcfcSponsor:       'lcfc_sponsors',
  CoachLinkRequest:  'coach_link_requests',
};

// Field-name aliases between Base44 and Appwrite system fields.
const SORT_ALIAS = {
  created_date: '$createdAt',
  updated_date: '$updatedAt',
  id: '$id',
};

// Translate a Base44-style sort string like "-created_date" or "display_order"
// into Appwrite Query orderAsc/orderDesc clauses.
export function parseSort(sort) {
  if (!sort) return [];
  const arr = Array.isArray(sort) ? sort : [sort];
  return arr.map((s) => {
    const desc = s.startsWith('-');
    const raw  = desc ? s.slice(1) : s;
    const field = SORT_ALIAS[raw] || raw;
    return desc ? Query.orderDesc(field) : Query.orderAsc(field);
  });
}

// Turn a {field: value} where-object into Appwrite Query.equal clauses. Arrays
// become Query.equal(field, [a,b,c]) which Appwrite treats as IN.
export function whereToQueries(where) {
  if (!where || typeof where !== 'object') return [];
  return Object.entries(where)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => Query.equal(k, v));
}

// Normalise an Appwrite document into a Base44-shaped record. Existing UI
// reads .id, .created_date, .updated_date — keep them as aliases so we don't
// have to touch every component.
export function mapDoc(doc) {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.$id,
    created_date: doc.$createdAt,
    updated_date: doc.$updatedAt,
  };
}
