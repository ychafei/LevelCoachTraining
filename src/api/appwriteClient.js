import { Client, Account, Databases, Storage, Functions, Query, ID } from 'appwrite';

// Hardcoded fallbacks. Both values are public-by-design (Appwrite project IDs
// ship in every browser request anyway), so embedding them protects against
// the exact failure mode where a Vercel build runs without env vars and bakes
// `setProject(undefined)` into the bundle.
const CONFIGURED_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const PROJECT = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69efb263000fe1c34344';

const LOCAL_DEV_HOSTS = new Set(['127.0.0.1', 'localhost']);
const USE_LOCAL_APPWRITE_PROXY =
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && LOCAL_DEV_HOSTS.has(window.location.hostname)
  && import.meta.env.VITE_APPWRITE_DISABLE_DEV_PROXY !== 'true';

const ENDPOINT = USE_LOCAL_APPWRITE_PROXY
  ? `${window.location.origin}/appwrite/v1`
  : CONFIGURED_ENDPOINT;

export const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT);
export const account   = new Account(client);
export const databases = new Databases(client);
export const storage   = new Storage(client);
export const functions = new Functions(client);
export { Query, ID };

export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'lctraining';
export const APPWRITE_PROJECT_ID = PROJECT;
export const APPWRITE_PUBLIC_ENDPOINT = CONFIGURED_ENDPOINT;

// Logical entity name → Appwrite collection id. Names match the legacy entity
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
  CoachLinkRequest:  'coach_link_requests',
  Organization:      'organizations',
  OrganizationMember:'organization_members',
  OrganizationCoach: 'organization_coaches',
  AthleteProfile:    'athlete_profiles',
  GuardianAthlete:   'guardian_athletes',
  Sport:             'sports',
  CoachSportProfile: 'coach_sport_profiles',
  AvailabilityBlock: 'availability_blocks',
  AthleteAvailabilityPreference: 'athlete_availability_preferences',
  LegalTemplate:     'legal_templates',
  LegalAgreement:    'legal_agreements',
  LegalAdminNote:    'legal_admin_notes',
  StripeConnectedAccount: 'stripe_connected_accounts',
  StripePaymentRecord:    'stripe_payment_records',
  StripeTransferRecord:   'stripe_transfer_records',
  StripeWebhookEvent:     'stripe_webhook_events',
  AdminAssignment:   'admin_assignments',
};

// Field-name aliases between legacy and Appwrite system fields.
const SORT_ALIAS = {
  created_date: '$createdAt',
  updated_date: '$updatedAt',
  id: '$id',
};

// Translate a legacy-style sort string like "-created_date" or "display_order"
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
// become Query.equal(field, [a,b,c]) which Appwrite treats as IN. legacy-style
// keys (`id`, `created_date`, `updated_date`) are aliased to Appwrite's system
// attributes ($id/$createdAt/$updatedAt) — without this, `.filter({ id })`
// silently matches nothing because there is no plain `id` attribute.
export function whereToQueries(where) {
  if (!where || typeof where !== 'object') return [];
  return Object.entries(where)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => Query.equal(SORT_ALIAS[k] || k, v));
}

// Normalise an Appwrite document into a app-shaped record. Existing UI
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
