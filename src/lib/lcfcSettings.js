import { lcfcSettingsRepo } from '@/api/repo';

// The exact attribute set created on the lcfc_settings collection. Used to
// build a safe patch — Appwrite rejects writes containing unknown attributes,
// so we never send the synthetic `id`/timestamp fields back.
export const SETTINGS_FIELDS = [
  'hero_image_url', 'hero_heading', 'hero_subheading', 'hero_primary_text',
  'hero_primary_link', 'hero_secondary_text', 'hero_secondary_link', 'hero_enabled',
  'about_heading', 'about_body', 'quote_text', 'about_enabled',
  'overview_title', 'overview_bullets', 'overview_image_url',
  'overview_button_text', 'overview_button_link', 'overview_enabled',
  'tryouts_status', 'tryouts_dates', 'tryouts_start_time', 'tryouts_end_time',
  'tryouts_location', 'tryouts_registration_link', 'tryouts_notes',
  'tryouts_what_to_bring', 'tryouts_contact_email', 'tryouts_contact_phone',
  'tryouts_published',
  'roster_enabled', 'schedule_enabled', 'staff_enabled', 'news_enabled',
  'sponsors_enabled',
];

// Default copy. Used when the lcfc_settings collection/document does not exist
// yet (pre-provisioning) or a field is blank, so /lcfc always renders.
export const LCFC_DEFAULTS = {
  hero_image_url: '',
  hero_heading: "LCFC Men's Team",
  hero_subheading: 'The competitive club division of LC Training.',
  hero_primary_text: 'Tryouts Coming Soon',
  hero_primary_link: '#tryouts',
  hero_secondary_text: 'Follow LCFC',
  hero_secondary_link: '#news',
  hero_enabled: true,

  about_heading: 'About LCFC',
  about_body:
    'LCFC is the competitive men’s team division of LC Training. LC Training develops players through private and small-group training, while LCFC gives committed players a platform to compete in a serious team environment.',
  quote_text:
    'LC Training develops the player.\nLCFC gives the player a platform to compete.',
  about_enabled: true,

  overview_title: "Men's Team Overview",
  overview_bullets: [
    'High-level competition',
    'Professional coaching standards',
    'Strength and conditioning',
    'Video and match analysis',
    'Player development pathway',
    'Team culture and accountability',
  ].join('\n'),
  overview_image_url: '',
  overview_button_text: 'Learn More',
  overview_button_link: '#overview',
  overview_enabled: true,

  tryouts_status: 'coming_soon', // coming_soon | open | closed
  tryouts_dates: '',
  tryouts_start_time: '',
  tryouts_end_time: '',
  tryouts_location: '',
  tryouts_registration_link: '',
  tryouts_notes: '',
  tryouts_what_to_bring: '',
  tryouts_contact_email: '',
  tryouts_contact_phone: '',
  tryouts_published: false,

  roster_enabled: true,
  schedule_enabled: true,
  staff_enabled: true,
  news_enabled: true,
  sponsors_enabled: true,
};

// Split a newline-separated textarea value into trimmed non-empty lines.
export function toLines(value) {
  if (!value) return [];
  return String(value)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Load the single settings document, merged over defaults. Never throws — if
// the collection/document is missing the page falls back to defaults.
export async function loadLcfcSettings() {
  try {
    const rows = await lcfcSettingsRepo.list();
    const doc = rows?.[0] || {};
    const merged = { ...LCFC_DEFAULTS };
    for (const [k, v] of Object.entries(doc)) {
      if (v !== null && v !== undefined && v !== '') merged[k] = v;
    }
    merged.id = doc.id;
    return merged;
  } catch {
    return { ...LCFC_DEFAULTS };
  }
}

// Persist the single settings document. Creates it on first save, updates it
// thereafter. Only known schema attributes are sent. Returns the saved doc id.
export async function saveLcfcSettings(values, currentId) {
  const patch = {};
  for (const f of SETTINGS_FIELDS) {
    if (values[f] !== undefined) patch[f] = values[f];
  }
  let id = currentId;
  if (!id) {
    const rows = await lcfcSettingsRepo.list().catch(() => []);
    id = rows?.[0]?.id;
  }
  const saved = id
    ? await lcfcSettingsRepo.update(id, patch)
    : await lcfcSettingsRepo.create(patch);
  return saved.id;
}
