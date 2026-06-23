import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  ExternalLink,
  Loader2,
  Save,
  Video,
  Wallet,
} from 'lucide-react';
import { coachRepo, coachSportProfileRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import PackagesManager from '@/features/coach/PackagesManager';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { getSport } from '@/lib/sportsCatalog';
import { toast } from 'sonner';

const SESSION_TYPE_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'small_group', label: 'Small group' },
  { value: 'team', label: 'Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'virtual', label: 'Virtual' },
];

function emptyEntry() {
  return {
    headline: '',
    bio: '',
    intro_video_url: '',
    credentials: '',
    specialties: [],
    levels: [],
    positions: [],
    session_types: [],
  };
}

function parseProfileSections(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null && value !== '';
}

function profileComplete(entry) {
  return (hasText(entry.bio) || hasText(entry.headline))
    && hasText(entry.credentials)
    && entry.specialties.length > 0
    && entry.levels.length > 0
    && entry.session_types.length > 0;
}

function MultiPick({ options, selected, onToggle, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const text = typeof option === 'string' ? option : option.label;
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" aria-hidden="true" />}
        <h2 className="text-sm font-bold tracking-[-0.01em] text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CoachSportProfile() {
  const { sportKey = '' } = useParams();
  const { coach, loading } = useMyCoach();
  const sport = getSport(sportKey);
  const [entry, setEntry] = useState(emptyEntry);
  const [initialEntry, setInitialEntry] = useState(emptyEntry);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coach?.id || !sportKey) return undefined;
    let cancelled = false;
    setProfileLoading(true);
    coachSportProfileRepo.filter({ coach_id: coach.id, sport_key: sportKey }).then((rows) => {
      if (cancelled) return;
      const row = rows?.[0] || null;
      const sections = parseProfileSections(row?.profile_sections);
      const next = {
        ...emptyEntry(),
        headline: sections.headline || '',
        bio: sections.bio || '',
        intro_video_url: sections.intro_video_url || '',
        credentials: row?.credentials || '',
        specialties: Array.isArray(row?.specialties) ? row.specialties : [],
        levels: Array.isArray(row?.levels) ? row.levels : [],
        positions: Array.isArray(row?.positions) ? row.positions : [],
        session_types: Array.isArray(row?.session_types) ? row.session_types : [],
      };
      setEntry(next);
      setInitialEntry(next);
    }).catch((err) => {
      toast.error(err?.message || 'Could not load this sport profile.');
    }).finally(() => {
      if (!cancelled) setProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [coach?.id, sportKey]);

  const savedSport = useMemo(
    () => (Array.isArray(coach?.sports) ? coach.sports : []).includes(sportKey),
    [coach?.sports, sportKey],
  );
  const dirty = JSON.stringify(entry) !== JSON.stringify(initialEntry);
  const done = profileComplete(entry);

  const updateEntry = (patch) => setEntry((current) => ({ ...current, ...patch }));
  const toggle = (field, value) => {
    setEntry((current) => {
      const list = Array.isArray(current[field]) ? current[field] : [];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [field]: next };
    });
  };

  const save = async () => {
    if (!sport) return;
    if (!savedSport) {
      toast.error(`Add ${sport.display_name} to your sports and save your main profile first.`);
      return;
    }
    setSaving(true);
    try {
      await coachRepo.setSportProfiles([{ sport_key: sportKey, ...entry }]);
      setInitialEntry(entry);
      toast.success(`${sport.display_name} profile saved`);
    } catch (err) {
      toast.error(err?.message || 'Could not save this sport profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading sport profile">
        <div className="h-8 w-56 animate-pulse rounded bg-secondary" />
        <div className="h-80 animate-pulse rounded-lg border border-border bg-secondary/50" />
      </div>
    );
  }

  if (!sport) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-sm font-bold text-foreground">Sport not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/coach/profile">Back to profile</Link>
        </Button>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-sm font-bold text-foreground">No coach profile linked</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 px-2 text-xs font-semibold text-muted-foreground">
            <Link to="/coach/profile">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Back to profile hub
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-foreground sm:text-3xl">
              {sport.display_name} profile
            </h1>
            <Badge className={`border text-xs ${done ? 'border-green-500/30 bg-green-500/10 text-green-700' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700'}`}>
              {done ? 'Profile content ready' : 'Needs profile content'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the focused profile athletes see when they are searching for {sport.display_name.toLowerCase()} coaching.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {coach.id && (
            <Button asChild variant="outline" className="h-10 text-xs font-semibold">
              <Link to={`/coaches/${encodeURIComponent(coach.id)}?sport=${encodeURIComponent(sportKey)}`}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Public view
              </Link>
            </Button>
          )}
          <Button onClick={save} disabled={saving || !dirty} className="h-10 bg-accent text-xs font-semibold text-accent-foreground hover:bg-accent/90">
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
            Save sport profile
          </Button>
        </div>
      </div>

      {!savedSport && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-700" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-foreground">Save this sport on your main profile first</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add {sport.display_name} in the sports picker, save the main profile, then come back here.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Section title="Public sport story" icon={Video}>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="sport-headline" className="text-xs font-semibold">Public headline</Label>
                <Input
                  id="sport-headline"
                  value={entry.headline}
                  onChange={(e) => updateEntry({ headline: e.target.value })}
                  className="mt-1 bg-secondary border-border"
                  placeholder={`${sport.display_name} training for focused athlete development`}
                />
              </div>
              <div>
                <Label htmlFor="sport-bio" className="text-xs font-semibold">Sport bio</Label>
                <Textarea
                  id="sport-bio"
                  value={entry.bio}
                  onChange={(e) => updateEntry({ bio: e.target.value })}
                  rows={6}
                  className="mt-1 bg-secondary border-border"
                  placeholder={`Describe your ${sport.display_name.toLowerCase()} background, training approach, and what athletes can expect.`}
                />
              </div>
              <div>
                <Label htmlFor="sport-video" className="text-xs font-semibold">Sport intro video URL</Label>
                <Input
                  id="sport-video"
                  type="url"
                  value={entry.intro_video_url}
                  onChange={(e) => updateEntry({ intro_video_url: e.target.value })}
                  className="mt-1 bg-secondary border-border"
                  placeholder="https://..."
                />
              </div>
            </div>
          </Section>

          <Section title="Credentials and focus" icon={BadgeCheck}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sport-credentials" className="text-xs font-semibold">Credentials or experience</Label>
                <Textarea
                  id="sport-credentials"
                  value={entry.credentials}
                  onChange={(e) => updateEntry({ credentials: e.target.value })}
                  rows={4}
                  className="mt-1 bg-secondary border-border"
                  placeholder={`Relevant ${sport.display_name.toLowerCase()} coaching, playing, certifications, or training experience.`}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Specialties</p>
                <MultiPick options={sport.specialties} selected={entry.specialties} onToggle={(value) => toggle('specialties', value)} label={`${sport.display_name} specialties`} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Levels you coach</p>
                <MultiPick options={sport.levels} selected={entry.levels} onToggle={(value) => toggle('levels', value)} label={`${sport.display_name} levels`} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Session types</p>
                <MultiPick options={SESSION_TYPE_OPTIONS} selected={entry.session_types} onToggle={(value) => toggle('session_types', value)} label={`${sport.display_name} session types`} />
              </div>
              {sport.positions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Positions</p>
                  <MultiPick options={sport.positions} selected={entry.positions} onToggle={(value) => toggle('positions', value)} label={`${sport.display_name} positions`} />
                </div>
              )}
            </div>
          </Section>

          <Section title={`${sport.display_name} packages and pricing`} icon={Wallet}>
            <PackagesManager sportFilterKey={sportKey} sportFilterLabel={sport.display_name} lockSport />
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-bold text-foreground">Profile checklist</p>
            <div className="mt-4 space-y-3 text-xs text-muted-foreground">
              <ChecklistRow done={hasText(entry.headline) || hasText(entry.bio)} label="Headline or sport bio" />
              <ChecklistRow done={hasText(entry.credentials)} label="Credentials or experience" />
              <ChecklistRow done={entry.specialties.length > 0} label="At least one specialty" />
              <ChecklistRow done={entry.levels.length > 0} label="At least one level" />
              <ChecklistRow done={entry.session_types.length > 0} label="At least one session type" />
            </div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-bold text-slate-950">Why this page matters</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Athletes land on a sport-specific profile, so your {sport.display_name.toLowerCase()} experience
              stands on its own instead of feeling blended with every sport you coach.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChecklistRow({ done, label }) {
  return (
    <div className="flex items-center gap-2">
      {done ? <BadgeCheck className="h-4 w-4 text-green-600" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 text-yellow-600" aria-hidden="true" />}
      <span className={done ? 'text-foreground' : ''}>{label}</span>
    </div>
  );
}
