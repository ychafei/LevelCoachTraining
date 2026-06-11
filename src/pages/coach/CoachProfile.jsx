import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachRepo, coachSportProfileRepo } from '@/api/repo';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { US_TIMEZONES } from '@/features/coach/timezones';
import { SPORTS_CATALOG, getSport } from '@/lib/sportsCatalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Save, Upload, Mail, AlertTriangle, Eye, BadgeCheck, RotateCcw, Wallet, ExternalLink, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import CoachProfilePreviewCard from '@/components/coach/CoachProfilePreviewCard';
import PackagesManager from '@/features/coach/PackagesManager';
import USLocationFields from '@/components/forms/USLocationFields';

const COACH_PROFILE_UPDATED_EVENT = 'levelcoach:coach-profile-updated';
const RESEND_COOLDOWN_SECONDS = 60;

const SERVICE_TYPE_OPTIONS = [
  { value: 'facility', label: 'I host at a facility' },
  { value: 'travels', label: 'I travel to athletes' },
  { value: 'hybrid', label: 'Facility and travel' },
  { value: 'online', label: 'Online training only' },
];

// Fields editable through the coachSelf.updateProfile whitelist.
const EDITABLE_KEYS = [
  'bio', 'quote', 'training_area', 'specializations', 'sports',
  'service_city', 'service_state', 'service_zip', 'service_radius_miles',
  'service_type', 'service_venue', 'timezone', 'intro_video_url',
  'location_lat', 'location_lng',
];

function pickEditable(coach) {
  const c = coach || {};
  const out = {};
  for (const key of EDITABLE_KEYS) {
    if (key === 'specializations' || key === 'sports') {
      out[key] = Array.isArray(c[key]) ? [...c[key]] : [];
    } else if (key === 'service_radius_miles') {
      out[key] = c[key] != null && c[key] !== '' ? String(c[key]) : '';
    } else if (key === 'location_lat' || key === 'location_lng') {
      // Coords are kept as finite numbers (or null) — resolved from the
      // location picker, never typed by hand.
      out[key] = Number.isFinite(c[key]) ? c[key] : null;
    } else {
      out[key] = c[key] ?? '';
    }
  }
  // Money input is edited in dollars; stored as integer cents.
  const cents = Number(c.price_hint_cents);
  out.price_hint_dollars = Number.isFinite(cents) && cents > 0 ? String(cents / 100) : '';
  return out;
}

function draftsEqual(a, b) {
  const keys = [...EDITABLE_KEYS, 'price_hint_dollars'];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (av.length !== bv.length || av.some((v, i) => v !== bv[i])) return false;
    } else if (String(av ?? '') !== String(bv ?? '')) {
      return false;
    }
  }
  return true;
}

function draftToPayload(draft) {
  const payload = {
    bio: draft.bio || '',
    quote: draft.quote || '',
    training_area: draft.training_area || '',
    specializations: draft.specializations || [],
    sports: draft.sports || [],
    service_city: draft.service_city || '',
    service_state: draft.service_state || '',
    service_zip: draft.service_zip || '',
    service_type: draft.service_type || 'hybrid',
    service_venue: draft.service_venue || '',
    intro_video_url: draft.intro_video_url || '',
  };
  if (draft.timezone) payload.timezone = draft.timezone;
  // Proximity coords (coaches.location_lat / location_lng) — only persisted when
  // the picker resolved finite values; consumed by getPublicCoaches + CoachSearch.
  if (Number.isFinite(draft.location_lat)) payload.location_lat = draft.location_lat;
  if (Number.isFinite(draft.location_lng)) payload.location_lng = draft.location_lng;
  if (draft.service_radius_miles !== '') {
    const radius = Number(draft.service_radius_miles);
    if (Number.isInteger(radius) && radius >= 0) payload.service_radius_miles = radius;
  }
  if (draft.price_hint_dollars !== '') {
    const dollars = Number(draft.price_hint_dollars);
    if (Number.isFinite(dollars) && dollars >= 0) payload.price_hint_cents = Math.round(dollars * 100);
  } else {
    payload.price_hint_cents = 0;
  }
  return payload;
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-accent" aria-hidden="true" />}
        <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MultiPick({ options, selected, onToggle, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// ── Per-sport profiles editor (coachSelf.setSportProfiles) ────────────────────

function SportProfilesEditor({ coach, selectedSports }) {
  const [profiles, setProfiles] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!coach?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await coachSportProfileRepo.filter({ coach_id: coach.id }).catch(() => []);
        if (cancelled) return;
        const next = {};
        for (const row of rows || []) {
          next[row.sport_key] = {
            specialties: Array.isArray(row.specialties) ? row.specialties : [],
            levels: Array.isArray(row.levels) ? row.levels : [],
            positions: Array.isArray(row.positions) ? row.positions : [],
          };
        }
        setProfiles(next);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [coach?.id]);

  const entryFor = (sportKey) => profiles[sportKey] || { specialties: [], levels: [], positions: [] };

  const toggle = (sportKey, field, value) => {
    setProfiles((prev) => {
      const entry = prev[sportKey] || { specialties: [], levels: [], positions: [] };
      const list = entry[field] || [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [sportKey]: { ...entry, [field]: next } };
    });
    setDirty(true);
  };

  const save = async () => {
    const payload = selectedSports.map((sportKey) => ({
      sport_key: sportKey,
      ...entryFor(sportKey),
    }));
    if (payload.length === 0) {
      toast.error('Pick at least one sport above first.');
      return;
    }
    setSaving(true);
    try {
      await coachRepo.setSportProfiles(payload);
      setDirty(false);
      toast.success('Sport profiles saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save sport profiles.');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="h-24 animate-pulse rounded-lg bg-secondary/60" aria-hidden="true" />;
  }

  if (selectedSports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Pick your sports in the section above, save, then set per-sport specialties, levels, and positions here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {selectedSports.map((sportKey) => {
        const sport = getSport(sportKey);
        if (!sport) return null;
        const entry = entryFor(sportKey);
        return (
          <div key={sportKey} className="border border-border rounded-lg p-4">
            <p className="font-display tracking-wider uppercase text-sm text-foreground mb-3">{sport.display_name}</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1.5">Specialties</p>
                <MultiPick
                  options={sport.specialties}
                  selected={entry.specialties}
                  onToggle={(v) => toggle(sportKey, 'specialties', v)}
                  label={`${sport.display_name} specialties`}
                />
              </div>
              <div>
                <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1.5">Levels you coach</p>
                <MultiPick
                  options={sport.levels}
                  selected={entry.levels}
                  onToggle={(v) => toggle(sportKey, 'levels', v)}
                  label={`${sport.display_name} levels`}
                />
              </div>
              {sport.positions.length > 0 && (
                <div>
                  <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground mb-1.5">Positions</p>
                  <MultiPick
                    options={sport.positions}
                    selected={entry.positions}
                    onToggle={(v) => toggle(sportKey, 'positions', v)}
                    label={`${sport.display_name} positions`}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving || !dirty}
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
        >
          <Save className="w-3 h-3 mr-1" aria-hidden="true" /> {saving ? 'Saving…' : 'Save Sport Profiles'}
        </Button>
      </div>
    </div>
  );
}

// ── Email verification (coachSelf request/confirmEmailCode) ──────────────────

function EmailVerification({ coach, onVerified }) {
  const [pendingEmail, setPendingEmail] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [flow, setFlow] = useState('idle'); // idle | sending | code_sent | verifying
  const [status, setStatus] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((value) => {
        if (value <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  const requestCode = async () => {
    const email = pendingEmail.trim().toLowerCase();
    setStatus(null);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }
    const target = email || String(coach.email || '').trim().toLowerCase();
    if (!target) {
      setStatus({ kind: 'error', message: 'Enter the email address to verify.' });
      return;
    }
    setFlow('sending');
    try {
      // The server generates and emails the code — only its hash is stored.
      await coachRepo.requestEmailCode(email || undefined);
      setEnteredCode('');
      setFlow('code_sent');
      setStatus({ kind: 'success', message: `Code sent to ${target}. Check your inbox (and spam).` });
      startCooldown();
    } catch (err) {
      setFlow('idle');
      setStatus({ kind: 'error', message: err?.message || 'Could not send the verification code.' });
    }
  };

  const confirmCode = async () => {
    setFlow('verifying');
    try {
      const res = await coachRepo.confirmEmailCode(enteredCode.trim());
      setFlow('idle');
      setPendingEmail('');
      setEnteredCode('');
      setStatus({ kind: 'success', message: 'Email verified.' });
      toast.success('Email verified');
      onVerified?.(res?.email_verified_at || new Date().toISOString());
    } catch (err) {
      setFlow('code_sent');
      setStatus({ kind: 'error', message: err?.message || 'Could not verify the code.' });
    }
  };

  const cancelFlow = () => {
    setFlow('idle');
    setEnteredCode('');
    setPendingEmail('');
    setStatus(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        {coach.email_verified_at ? (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 border text-[10px] font-display tracking-widest uppercase">
            <BadgeCheck className="w-3 h-3 mr-1" aria-hidden="true" /> Verified
          </Badge>
        ) : coach.email ? (
          <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30 border text-[10px] font-display tracking-widest uppercase">
            Unverified
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] font-display tracking-widest uppercase">Not set</Badge>
        )}
      </div>
      {coach.email && (
        <p className="text-sm text-foreground">Current: <span className="text-muted-foreground">{coach.email}</span></p>
      )}
      <p className="text-xs text-muted-foreground">
        Clients and admins reach you here. Verifying a new address updates your contact email — required before publishing.
      </p>

      {status && (
        <div
          role="status"
          className={`text-xs rounded border p-3 break-words mt-3 ${
            status.kind === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-green-500/30 bg-green-500/10 text-green-700'
          }`}
        >
          {status.message}
        </div>
      )}

      {flow === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="flex-1">
            <Label htmlFor="pending-email" className="sr-only">New contact email</Label>
            <Input
              id="pending-email"
              type="email"
              placeholder={coach.email ? `Re-verify ${coach.email} or enter a new address` : 'you@example.com'}
              value={pendingEmail}
              onChange={e => setPendingEmail(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
          <Button
            onClick={requestCode}
            disabled={cooldown > 0}
            className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Code'}
          </Button>
        </div>
      )}

      {flow === 'sending' && (
        <p className="text-sm text-muted-foreground mt-3" role="status">Sending code…</p>
      )}

      {(flow === 'code_sent' || flow === 'verifying') && (
        <div className="space-y-3 mt-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from the email to confirm.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label htmlFor="verify-code" className="sr-only">6-digit verification code</Label>
              <Input
                id="verify-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={enteredCode}
                onChange={e => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="bg-secondary border-border tracking-[0.4em] font-mono text-center"
              />
            </div>
            <Button
              onClick={confirmCode}
              disabled={enteredCode.length !== 6 || flow === 'verifying'}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
            >
              {flow === 'verifying' ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={requestCode}
              disabled={cooldown > 0}
              className="text-accent hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <span className="text-muted-foreground" aria-hidden="true">·</span>
            <button type="button" onClick={cancelFlow} className="text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachProfile() {
  const { isAdmin } = useAuth();
  const { coach, setCoach, loading } = useMyCoach();
  const [draft, setDraft] = useState(pickEditable(null));
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [specInput, setSpecInput] = useState('');

  useEffect(() => {
    if (coach) setDraft(pickEditable(coach));
  }, [coach]);

  const dirty = useMemo(() => (coach ? !draftsEqual(draft, pickEditable(coach)) : false), [coach, draft]);

  // Live preview merges saved coach with in-progress draft (real fields only).
  const previewCoach = useMemo(() => {
    const payload = draftToPayload(draft);
    return { ...(coach || {}), ...payload };
  }, [coach, draft]);

  const updateDraft = (patch) => setDraft(prev => ({ ...prev, ...patch }));

  const addSpec = () => {
    const v = specInput.trim();
    if (!v) return;
    if (draft.specializations.includes(v)) { setSpecInput(''); return; }
    updateDraft({ specializations: [...draft.specializations, v] });
    setSpecInput('');
  };

  const removeSpec = (s) => updateDraft({ specializations: draft.specializations.filter(x => x !== s) });

  const toggleSport = (sportKey) => {
    const next = draft.sports.includes(sportKey)
      ? draft.sports.filter((s) => s !== sportKey)
      : [...draft.sports, sportKey];
    updateDraft({ sports: next });
  };

  const saveAll = async () => {
    if (!coach || !dirty) return;
    if (draft.price_hint_dollars !== '' && !(Number(draft.price_hint_dollars) >= 0)) {
      toast.error('Starting price must be a number (in dollars).');
      return;
    }
    setSaving(true);
    try {
      const updated = await coachRepo.updateSelf(draftToPayload(draft));
      const nextCoach = updated ? { ...coach, ...updated } : { ...coach, ...draftToPayload(draft) };
      setCoach(nextCoach);
      window.dispatchEvent(new CustomEvent(COACH_PROFILE_UPDATED_EVENT, { detail: { coach: nextCoach } }));
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const revert = () => coach && setDraft(pickEditable(coach));

  // Photo upload — saved immediately through the coachSelf whitelist.
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !coach) return;
    setUploadingPhoto(true);
    try {
      const { url: photo_url } = await storage.uploadFile('coach-photos', file);
      await coachRepo.updateSelf({ photo_url });
      const updatedCoach = { ...coach, photo_url };
      setCoach(updatedCoach);
      window.dispatchEvent(new CustomEvent(COACH_PROFILE_UPDATED_EVENT, { detail: { coach: updatedCoach } }));
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err?.message || 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading profile">
        <div className="h-9 w-52 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            {[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-secondary/50" />)}
          </div>
          <div className="lg:col-span-2 h-96 animate-pulse rounded-lg border border-border bg-secondary/50" />
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Your admin account is not linked to a coach record.'
              : 'Ask an admin to link your account before you can edit a public profile.'}
          </p>
        </div>
      </div>
    );
  }

  const bioLength = String(draft.bio || '').trim().length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Coach Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What clients see when picking a coach. Edit on the left, preview on the right.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={revert} className="text-muted-foreground text-xs font-display tracking-wider uppercase">
              <RotateCcw className="w-3 h-3 mr-1" aria-hidden="true" /> Revert
            </Button>
            <Button onClick={saveAll} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Save className="w-3 h-3 mr-2" aria-hidden="true" /> {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Editor — left 3/5 */}
        <div className="lg:col-span-3 space-y-5">
          {/* Photo */}
          <Section title="Photo">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-20 h-20 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center flex-shrink-0">
                {coach.photo_url ? (
                  <img src={coach.photo_url} alt="Your profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-xl text-muted-foreground/40">
                    {coach.first_name?.[0]}{coach.last_name?.[0]}
                  </span>
                )}
              </div>
              <label className="cursor-pointer">
                <span className="sr-only">Upload profile photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <Button type="button" variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs pointer-events-none">
                  <Upload className="w-3 h-3 mr-1" aria-hidden="true" /> {uploadingPhoto ? 'Uploading…' : 'Upload Photo'}
                </Button>
              </label>
              <p className="text-xs text-muted-foreground">JPG/PNG. A clear face shot works best. Required to publish.</p>
            </div>
          </Section>

          {/* About */}
          <Section title="About You">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bio" className="font-display tracking-wider uppercase text-xs">Bio</Label>
                <span className={`text-[11px] ${bioLength >= 80 ? 'text-muted-foreground' : 'text-yellow-700'}`}>
                  {bioLength}/80+ characters {bioLength < 80 && '(required to publish)'}
                </span>
              </div>
              <Textarea
                id="bio"
                value={draft.bio || ''}
                onChange={e => updateDraft({ bio: e.target.value })}
                className="bg-secondary border-border mt-1"
                rows={5}
                placeholder="Your background, coaching style, and what athletes can expect."
              />
            </div>
            <div className="mt-4">
              <Label htmlFor="quote" className="font-display tracking-wider uppercase text-xs">Quote</Label>
              <Input
                id="quote"
                value={draft.quote || ''}
                onChange={e => updateDraft({ quote: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="A short line that captures how you coach."
              />
            </div>
            <div className="mt-4">
              <Label htmlFor="intro-video" className="font-display tracking-wider uppercase text-xs">Intro Video URL</Label>
              <Input
                id="intro-video"
                type="url"
                value={draft.intro_video_url || ''}
                onChange={e => updateDraft({ intro_video_url: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="https://… (YouTube or Vimeo link)"
              />
            </div>
            <div className="mt-4">
              <Label htmlFor="price-hint" className="font-display tracking-wider uppercase text-xs">Starting Price (USD per session)</Label>
              <div className="relative mt-1 w-44">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">$</span>
                <Input
                  id="price-hint"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={draft.price_hint_dollars}
                  onChange={e => updateDraft({ price_hint_dollars: e.target.value })}
                  className="bg-secondary border-border pl-7"
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Shown as "From $X / session" on your card. Actual prices come from your packages.</p>
            </div>
          </Section>

          {/* Sports */}
          <Section title="Sports" icon={Trophy}>
            <p className="text-xs text-muted-foreground mb-2">Pick every sport you coach — at least one is required to publish.</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sports you coach">
              {SPORTS_CATALOG.map((sport) => {
                const active = draft.sports.includes(sport.sport_key);
                return (
                  <button
                    key={sport.sport_key}
                    type="button"
                    onClick={() => toggleSport(sport.sport_key)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-xs font-display tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {sport.display_name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <Label htmlFor="spec-input" className="font-display tracking-wider uppercase text-xs">General Specialties</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="spec-input"
                  value={specInput}
                  onChange={e => setSpecInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSpec())}
                  className="bg-secondary border-border"
                  placeholder="e.g. Finishing, 1v1 defending"
                />
                <Button type="button" onClick={addSpec} variant="outline" size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {draft.specializations?.map(s => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => removeSpec(s)}
                    title="Click to remove"
                  >
                    {s} ×
                  </Badge>
                ))}
                {!draft.specializations?.length && (
                  <span className="text-xs text-muted-foreground/60">No specialties yet.</span>
                )}
              </div>
            </div>
          </Section>

          {/* Sport-specific profiles */}
          <Section title="Per-Sport Details" icon={Trophy}>
            <SportProfilesEditor coach={coach} selectedSports={coach.sports || []} />
            {dirty && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Tip: save your sport selection above first — per-sport details apply to your saved sports.
              </p>
            )}
          </Section>

          {/* Packages & pricing — the coach sets their own prices */}
          <Section title="Packages & Pricing" icon={Wallet}>
            <PackagesManager />
          </Section>

          {/* Service area */}
          <Section title="Service Area">
            {/* Location entry — shared US fields: state dropdown, city type-ahead,
                zip auto-resolve. City/state/zip map onto service_*; resolved
                lat/lng persist to coaches.location_lat / location_lng for
                proximity search. County is not persisted. */}
            <div className="mb-3">
              <p className="font-display tracking-wider uppercase text-xs text-foreground mb-2">Location</p>
              <USLocationFields
                idPrefix="svc"
                fields={['state', 'city', 'zip']}
                columns="grid grid-cols-1 sm:grid-cols-3 gap-3"
                value={{
                  city: draft.service_city || '',
                  state: draft.service_state || '',
                  zip: draft.service_zip || '',
                }}
                onChange={(patch) => {
                  // Map the shared field names onto the coach's service_* draft
                  // keys; carry resolved coords into location_lat/location_lng.
                  const mapped = {};
                  if ('city' in patch) mapped.service_city = patch.city;
                  if ('state' in patch) mapped.service_state = patch.state;
                  if ('zip' in patch) mapped.service_zip = patch.zip;
                  if ('lat' in patch && Number.isFinite(patch.lat)) mapped.location_lat = patch.lat;
                  if ('lng' in patch && Number.isFinite(patch.lng)) mapped.location_lng = patch.lng;
                  if (Object.keys(mapped).length) updateDraft(mapped);
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="svc-radius" className="font-display tracking-wider uppercase text-xs">Travel Radius (miles)</Label>
                <Input
                  id="svc-radius"
                  type="number"
                  min="0"
                  max="250"
                  value={draft.service_radius_miles}
                  onChange={e => updateDraft({ service_radius_miles: e.target.value })}
                  className="bg-secondary border-border mt-1"
                  placeholder="25"
                />
              </div>
              <div>
                <Label htmlFor="svc-type" className="font-display tracking-wider uppercase text-xs">Service Type</Label>
                <Select value={draft.service_type || 'hybrid'} onValueChange={(v) => updateDraft({ service_type: v })}>
                  <SelectTrigger id="svc-type" className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="svc-tz" className="font-display tracking-wider uppercase text-xs">Timezone</Label>
                <Select value={draft.timezone || ''} onValueChange={(v) => updateDraft({ timezone: v })}>
                  <SelectTrigger id="svc-tz" className="bg-secondary border-border mt-1">
                    <SelectValue placeholder="Choose your timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">All your availability and sessions use this timezone.</p>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="svc-venue" className="font-display tracking-wider uppercase text-xs">Venue / Facility</Label>
              <Input
                id="svc-venue"
                value={draft.service_venue || ''}
                onChange={e => updateDraft({ service_venue: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="Where you usually train athletes (optional)"
              />
            </div>
            <div className="mt-3">
              <Label htmlFor="training-area" className="font-display tracking-wider uppercase text-xs">Training Area Summary</Label>
              <Input
                id="training-area"
                value={draft.training_area || ''}
                onChange={e => updateDraft({ training_area: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="One line clients see, e.g. 'Metro Detroit speed and skills development'"
              />
            </div>
          </Section>

          {/* Contact email + verification */}
          <Section title="Contact Email" icon={Mail}>
            <EmailVerification
              coach={coach}
              onVerified={(verifiedAt) => setCoach(prev => (prev ? { ...prev, email_verified_at: verifiedAt } : prev))}
            />
          </Section>

          {/* Payouts pointer */}
          <Section title="Payments" icon={Wallet}>
            <p className="text-xs text-muted-foreground mb-3">
              Client payments run through Stripe Checkout. Stripe Connect setup is managed from your Earnings page.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Stripe account: <span className="text-foreground">{coach.stripe_account_id ? 'Connected' : 'Not connected'}</span>
              </p>
              <Link to="/coach/earnings">
                <Button variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs">
                  <ExternalLink className="w-3 h-3 mr-1" aria-hidden="true" /> Manage Payouts
                </Button>
              </Link>
            </div>
          </Section>

          {/* Bottom save bar */}
          {dirty && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={revert} className="text-muted-foreground text-xs font-display tracking-wider uppercase">
                <RotateCcw className="w-3 h-3 mr-1" aria-hidden="true" /> Revert
              </Button>
              <Button onClick={saveAll} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
                <Save className="w-3 h-3 mr-2" aria-hidden="true" /> {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>

        {/* Live preview — right 2/5 */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase text-muted-foreground">
              <Eye className="w-3 h-3" aria-hidden="true" /> Live preview {dirty && <span className="text-yellow-600">· unsaved</span>}
            </div>
            <CoachProfilePreviewCard coach={previewCoach} />
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Roughly what clients see in the booking flow and marketplace. Some surfaces show fewer fields.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
