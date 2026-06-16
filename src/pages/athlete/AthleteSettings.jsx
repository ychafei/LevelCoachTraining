import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  FileSignature,
  KeyRound,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { initialsOf } from '@/lib/displayName';
import { sportOptions } from '@/lib/sportsCatalog';
import { useMyAthlete } from '@/features/athlete/useMyAthlete';
import { sportIconFor } from '@/features/athlete/sportMeta';
import { parseJsonObject } from '@/features/athlete/portalShared';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { SignedAgreementsList } from '@/features/athlete/AthleteDocuments';
import USLocationFields from '@/components/forms/USLocationFields';
import { toStateCode } from '@/lib/usStates';

// Athlete settings — every saved control persists for real through the
// server-side `accountProfile.update` whitelist (via auth.updateCurrentUser).
// A self-managed (adult) athlete edits their own sports, skill level, and
// position here; they save to profiles.sports / skill_level / sport_position.
// Health notes remain family/coach-managed athlete_profiles data, shown
// read-only (never jammed into `bio`).

const SECTIONS = [
  { id: 'account', label: 'Account', sub: 'Name, photo, contact', icon: UserRound },
  { id: 'sport', label: 'Sport & profile', sub: 'Sports, level, location', icon: Trophy },
  { id: 'notifications', label: 'Notifications', sub: 'Email preferences', icon: Bell },
  { id: 'security', label: 'Security', sub: 'Password', icon: KeyRound },
  { id: 'legal', label: 'Legal documents', sub: 'Sign & download', icon: FileSignature },
];

const SECTION_ALIASES = { profile: 'account', sports: 'sport', password: 'security', documents: 'legal' };

// Self-service skill levels — must match the accountProfile.update whitelist
// and the profiles.skill_level enum in the provisioner.
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Competitive'];
const MAX_SPORTS = 12;

const NOTIFICATION_PREFS = [
  { key: 'session_reminders', label: 'Session reminders', sub: 'Reminders ahead of upcoming sessions.' },
  { key: 'booking_updates', label: 'Booking updates', sub: 'Confirmations, cancellations, and reschedules.' },
  { key: 'coach_feedback', label: 'Coach feedback & homework', sub: 'When your coach shares notes or assigns work.' },
  { key: 'messages', label: 'New messages', sub: 'When your coach sends you a message.' },
  { key: 'marketing', label: 'Product news', sub: 'Occasional feature announcements.', defaultOff: true },
  { key: 'marketing_sms', label: 'Marketing SMS/text', sub: 'Optional promotional texts. Consent is not required for purchase or platform use.', defaultOff: true },
];

function parseNotificationPrefs(raw) {
  const prefs = parseJsonObject(raw) || {};
  const out = {};
  for (const item of NOTIFICATION_PREFS) {
    const stored = prefs[item.key];
    out[item.key] = typeof stored === 'boolean' ? stored : !item.defaultOff;
  }
  return out;
}

// Parse a stored "City, ST" location_label into the structured location the
// shared USLocationFields component expects. Anything that doesn't match the
// "City, ST" shape is treated as a free-text city so nothing is lost.
function parseLocationLabel(label) {
  const text = String(label || '').trim();
  if (!text) return { city: '', state: '' };
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    const code = toStateCode(parts[parts.length - 1]);
    if (code) return { city: parts.slice(0, -1).join(', '), state: code };
  }
  return { city: text, state: '' };
}

function buildCityStateLabel(location) {
  return [String(location.city || '').trim(), location.state].filter(Boolean).join(', ');
}

function SettingsCard({ title, icon: Icon, blurb, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label={title}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
        <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h2>
      </div>
      {blurb && <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSection() {
  const { user, refetchUser } = useAuth();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', dob: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      phone: user?.phone || '',
      dob: user?.dob ? String(user.dob).slice(0, 10) : '',
    });
  }, [user?.first_name, user?.last_name, user?.phone, user?.dob]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const dirty = useMemo(() => (
    form.first_name !== (user?.first_name || '')
    || form.last_name !== (user?.last_name || '')
    || form.phone !== (user?.phone || '')
    || form.dob !== (user?.dob ? String(user.dob).slice(0, 10) : '')
  ), [form, user]);

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
      };
      if (form.dob) payload.dob = form.dob; // server recomputes is_minor
      await auth.updateCurrentUser(payload);
      await refetchUser();
      toast.success('Account details saved.');
    } catch (err) {
      toast.error(err?.message || 'Could not save your account details.');
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    try {
      await storage.uploadProfilePhoto(file);
      await refetchUser();
      toast.success('Photo updated.');
    } catch (err) {
      toast.error(err?.message || 'Could not upload your photo.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const verified = user?.email_verified === true;

  return (
    <SettingsCard
      title="Account"
      icon={UserRound}
      blurb="Your name and contact details. These are used on your sessions and shared with your coaches."
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Photo */}
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary/60 text-2xl font-bold text-muted-foreground">
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Your profile" className="h-full w-full object-cover" />
            ) : (
              initialsOf(user)
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload profile photo"
            onChange={onPhoto}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Uploading…</>
            ) : (
              <><Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Change photo</>
            )}
          </Button>
        </div>

        {/* Fields */}
        <div className="flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="acc-first">First name</Label>
              <Input
                id="acc-first"
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
                maxLength={100}
                className="mt-1 bg-background"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label htmlFor="acc-last">Last name</Label>
              <Input
                id="acc-last"
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
                maxLength={100}
                className="mt-1 bg-background"
                autoComplete="family-name"
              />
            </div>
            <div>
              <Label htmlFor="acc-phone">Phone</Label>
              <Input
                id="acc-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                maxLength={30}
                className="mt-1 bg-background"
                placeholder="(555) 123-4567"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="acc-dob">Date of birth</Label>
              <Input
                id="acc-dob"
                type="date"
                value={form.dob}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('dob', e.target.value)}
                className="mt-1 bg-background"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Used to apply guardian protections if you&apos;re under 18.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="acc-email">Email</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Input
                id="acc-email"
                value={user?.email || ''}
                readOnly
                disabled
                className="max-w-sm bg-secondary/40 text-muted-foreground"
              />
              {verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-500">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-xs font-semibold text-yellow-500">
                  Unverified
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Your sign-in email can&apos;t be changed here. Contact support to update it.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={save}
              disabled={saving || !dirty}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

// ── Sport & profile ─────────────────────────────────────────────────────────

function SportSection({ athlete }) {
  const { user, refetchUser } = useAuth();
  const allSports = useMemo(() => sportOptions(), []);

  // Pre-fill from the editable profile fields, falling back to the
  // family-managed athlete_profiles row the portal already reads for display.
  const initialSports = useMemo(() => {
    const fromProfile = Array.isArray(user?.sports) ? user.sports.filter(Boolean) : [];
    if (fromProfile.length > 0) return fromProfile;
    const fromAthlete = athlete.athleteProfile?.sports;
    return Array.isArray(fromAthlete) ? fromAthlete.filter(Boolean) : [];
  }, [user?.sports, athlete.athleteProfile?.sports]);

  const initialLevel = user?.skill_level || athlete.athleteProfile?.skill_level || '';
  const initialPosition = user?.sport_position || '';
  // Serialized so the reset effect can compare the sport list by value, not by
  // the fresh array reference produced each render.
  const initialSportsKey = initialSports.join('|');

  const [form, setForm] = useState({
    sports: initialSports,
    skill_level: initialLevel,
    sport_position: initialPosition,
    location: { city: '', state: '', zip: '', county: '', lat: undefined, lng: undefined },
    bio: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      sports: initialSports,
      skill_level: initialLevel,
      sport_position: initialPosition,
      location: {
        ...parseLocationLabel(user?.location_label),
        zip: '',
        county: '',
        // Load any saved proximity coords so they survive a save that doesn't
        // touch the location picker.
        lat: Number.isFinite(user?.location_lat) ? user.location_lat : undefined,
        lng: Number.isFinite(user?.location_lng) ? user.location_lng : undefined,
      },
      bio: user?.bio || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialSportsKey,
    initialLevel,
    initialPosition,
    user?.location_label,
    user?.location_lat,
    user?.location_lng,
    user?.bio,
  ]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const setLocation = (patch) => setForm((current) => ({ ...current, location: { ...current.location, ...patch } }));
  const locationLabel = buildCityStateLabel(form.location);

  const toggleSport = (key) => {
    setForm((current) => {
      const has = current.sports.includes(key);
      if (has) return { ...current, sports: current.sports.filter((s) => s !== key) };
      if (current.sports.length >= MAX_SPORTS) {
        toast.error(`You can select up to ${MAX_SPORTS} sports.`);
        return current;
      }
      return { ...current, sports: [...current.sports, key] };
    });
  };

  const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  const dirty = !sameSet(form.sports, initialSports)
    || form.skill_level !== initialLevel
    || form.sport_position !== initialPosition
    || locationLabel !== (user?.location_label || '')
    || form.bio !== (user?.bio || '');

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        sports: form.sports,
        skill_level: form.skill_level,
        sport_position: form.sport_position.trim(),
        location_label: locationLabel,
        bio: form.bio.trim(),
      };
      // Persist resolved coords (whitelisted by accountProfile.update) so coaches
      // can gauge proximity; only when the picker resolved finite values.
      if (Number.isFinite(form.location.lat)) payload.location_lat = form.location.lat;
      if (Number.isFinite(form.location.lng)) payload.location_lng = form.location.lng;
      await auth.updateCurrentUser(payload);
      await refetchUser();
      toast.success('Sport profile saved.');
    } catch (err) {
      toast.error(err?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const profile = athlete.athleteProfile;
  const healthNotes = profile?.health_notes || '';

  return (
    <SettingsCard
      title="Sport & profile"
      icon={Trophy}
      blurb="Set the sports you train, your level, and your position. These power your assessments and how coaches find you."
    >
      <div className="space-y-6">
        {/* Editable sports multi-select */}
        <fieldset>
          <legend className="text-sm font-semibold text-foreground">Your sports</legend>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Pick every sport you train in. Choose up to {MAX_SPORTS}.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allSports.map((sport) => {
              const Icon = sportIconFor(sport.value);
              const selected = form.sports.includes(sport.value);
              return (
                <button
                  key={sport.value}
                  type="button"
                  onClick={() => toggleSport(sport.value)}
                  aria-pressed={selected}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? 'border-accent/40 bg-accent/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-accent/30 hover:text-foreground'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${selected ? 'text-accent' : 'text-muted-foreground'}`} aria-hidden="true" />
                    {sport.label}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sport-level">Skill level</Label>
            <Select
              value={form.skill_level || undefined}
              onValueChange={(value) => set('skill_level', value)}
            >
              <SelectTrigger id="sport-level" className="mt-1 bg-background">
                <SelectValue placeholder="Select your level" />
              </SelectTrigger>
              <SelectContent>
                {SKILL_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">Helps coaches tailor sessions to you.</p>
          </div>

          <div>
            <Label htmlFor="sport-position">Position</Label>
            <Input
              id="sport-position"
              value={form.sport_position}
              onChange={(e) => set('sport_position', e.target.value)}
              maxLength={100}
              className="mt-1 bg-background"
              placeholder="e.g. Striker, Point Guard, Sprints"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Free-form since positions vary by sport. Leave blank if it doesn&apos;t apply.
            </p>
          </div>
        </div>

        {/* Editable: location + bio (whitelisted fields) */}
        <div>
          <Label htmlFor="sport-location-state">Training location</Label>
          <div className="mt-1">
            <USLocationFields
              idPrefix="sport-location"
              fields={['state', 'city', 'zip']}
              value={form.location}
              onChange={setLocation}
              columns="grid grid-cols-1 gap-4 sm:grid-cols-3"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Helps coaches gauge travel and venue fit.</p>
        </div>

        <div>
          <Label htmlFor="sport-bio">About you</Label>
          <Textarea
            id="sport-bio"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            maxLength={2000}
            className="mt-1 bg-background"
            placeholder="A few words about your goals, what you're working on, or what motivates you."
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Shared with coaches you train with.</p>
        </div>

        {/* Health notes are private athlete-profile data; show when present, read-only */}
        {healthNotes && (
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Health notes</p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{healthNotes}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Private to you, your coaches, and platform admins. Ask your coach or guardian to update these.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={saving || !dirty}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

function NotificationsSection() {
  const { user, refetchUser } = useAuth();
  const [prefs, setPrefs] = useState(() => parseNotificationPrefs(user?.notification_prefs));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setPrefs(parseNotificationPrefs(user?.notification_prefs));
    setDirty(false);
  }, [user?.notification_prefs]);

  const toggle = (key, value) => {
    setPrefs((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await auth.updateCurrentUser({ notification_prefs: prefs });
      await refetchUser();
      setDirty(false);
      toast.success('Notification preferences saved.');
    } catch (err) {
      toast.error(err?.message || 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Notifications"
      icon={Bell}
      blurb="Choose which emails you get. Transactional emails required for bookings always send."
    >
      <ul className="divide-y divide-border">
        {NOTIFICATION_PREFS.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <Label htmlFor={`pref-${item.key}`} className="text-sm font-medium text-foreground">{item.label}</Label>
              <p className="text-xs text-muted-foreground">{item.sub}</p>
            </div>
            <Switch
              id={`pref-${item.key}`}
              checked={prefs[item.key]}
              onCheckedChange={(value) => toggle(item.key, value)}
              aria-label={item.label}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={save}
          disabled={saving || !dirty}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </SettingsCard>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecuritySection() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  const sendReset = async () => {
    if (!user?.email) {
      toast.error('No email is on file for your account.');
      return;
    }
    setSending(true);
    try {
      await auth.sendPasswordRecovery(user.email);
      toast.success(`Password reset link sent to ${user.email}. Check your inbox.`);
    } catch (err) {
      toast.error(err?.message || 'Could not send the reset email. Try again shortly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingsCard
      title="Security"
      icon={KeyRound}
      blurb="Keep your account secure."
    >
      <div className="rounded-lg border border-border bg-background/40 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Change your password</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              We&apos;ll email a secure reset link to{' '}
              <span className="font-semibold text-foreground">{user?.email || 'your address'}</span>. Open it and
              choose a new password — the link expires for your safety. You stay signed in here.
            </p>
            <Button
              type="button"
              onClick={sendReset}
              disabled={sending}
              className="mt-3 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {sending ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> Sending…</>
              ) : (
                <><KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" /> Email me a reset link</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

// ── Legal documents ───────────────────────────────────────────────────────────

function LegalSection({ user }) {
  return (
    <div className="space-y-4">
      <LegalSignaturePanel
        signerRole="athlete"
        title="Athlete legal packet"
        description="Review and sign the current athlete participation, safety, and platform documents. Booking requires a complete packet."
      />
      <SignedAgreementsList user={user} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AthleteSettings() {
  const { user } = useAuth();
  const athlete = useMyAthlete(user);
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('section') || '';
  const resolved = SECTION_ALIASES[requested] || requested;
  const activeSection = SECTIONS.some((s) => s.id === resolved) ? resolved : 'account';

  const switchSection = (id) => {
    setSearchParams(id === 'account' ? {} : { section: id }, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background py-8 sm:py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link
          to="/athlete"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to portal
        </Link>

        <header className="mt-4">
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, sport profile, notifications, security, and legal documents.
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
          {/* Section nav */}
          <nav className="lg:col-span-1" aria-label="Settings sections">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = section.id === activeSection;
                return (
                  <li key={section.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => switchSection(section.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active
                          ? 'border border-accent/30 bg-accent/10 text-accent'
                          : 'border border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{section.label}</span>
                        <span className="hidden text-[11px] text-muted-foreground lg:block">{section.sub}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Active section */}
          <div className="lg:col-span-3">
            {activeSection === 'account' && <AccountSection />}
            {activeSection === 'sport' && <SportSection athlete={athlete} />}
            {activeSection === 'notifications' && <NotificationsSection />}
            {activeSection === 'security' && <SecuritySection />}
            {activeSection === 'legal' && <LegalSection user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}
