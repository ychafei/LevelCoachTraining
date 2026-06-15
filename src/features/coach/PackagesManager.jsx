import React, { useEffect, useState } from 'react';
import { coachRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, Package as PackageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';

const SESSION_TYPES = [
  { value: 'private', label: 'Private (1-on-1)' },
  { value: 'small_group', label: 'Small group' },
  { value: 'team', label: 'Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'virtual', label: 'Virtual' },
];

const DURATIONS = [30, 45, 60, 75, 90, 120];
const LOCATION_FORMATS = [
  { value: 'training_facility', label: 'Training facility' },
  { value: 'coach_travels', label: 'Coach travels' },
  { value: 'online', label: 'Online' },
  { value: 'organization_facility', label: 'Organization/facility' },
  { value: 'hybrid', label: 'Hybrid' },
];

const emptyDraft = {
  package_id: null,
  name: '',
  sessions: '1',
  duration_minutes: '60',
  price_dollars: '',
  session_type: 'private',
  description: '',
  badge: '',
  sport_keys: [],
  location_formats: [],
  is_active: true,
};

const usd = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const SPORT_LABELS = new Map(SPORTS_CATALOG.map((sport) => [sport.sport_key, sport.display_name]));
const formatLabel = (value) => LOCATION_FORMATS.find((item) => item.value === value)?.label || value;

function PackageRow({ pkg, onEdit, onDelete, busy }) {
  const per = pkg.sessions > 1 ? ` · ${usd(Math.round(pkg.price_cents / pkg.sessions))}/session` : '';
  const sports = Array.isArray(pkg.sport_keys) ? pkg.sport_keys : [];
  const formats = Array.isArray(pkg.location_formats) ? pkg.location_formats : [];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-foreground truncate">{pkg.name}</p>
          {pkg.badge ? <Badge variant="secondary" className="text-[10px]">{pkg.badge}</Badge> : null}
          {!pkg.is_active ? <Badge variant="outline" className="text-[10px]">Hidden</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pkg.sessions} session{pkg.sessions === 1 ? '' : 's'} · {pkg.duration_minutes} min · <span className="text-accent font-semibold">{usd(pkg.price_cents)}</span>{per}
          {pkg.session_type ? ` · ${pkg.session_type.replace('_', ' ')}` : ''}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {sports.length ? sports.map((sport) => SPORT_LABELS.get(sport) || sport).join(', ') : 'All sports'}
          {' · '}
          {formats.length ? formats.map(formatLabel).join(', ') : 'All formats'}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => onEdit(pkg)} aria-label={`Edit ${pkg.name}`}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(pkg)} disabled={busy} aria-label={`Delete ${pkg.name}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
    </div>
  );
}

export default function PackagesManager() {
  const [coach, setCoach] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      coachRepo.listPackages(),
      coachRepo.getSelf().catch(() => null),
    ])
      .then(([rows, coachRow]) => {
        setPackages(rows || []);
        setCoach(coachRow);
      })
      .catch((err) => toast.error(err?.message || 'Could not load your packages.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startNew = () => setDraft({ ...emptyDraft });
  const startEdit = (pkg) => setDraft({
    package_id: pkg.id,
    name: pkg.name,
    sessions: String(pkg.sessions),
    duration_minutes: String(pkg.duration_minutes),
    price_dollars: String(pkg.price_cents / 100),
    session_type: pkg.session_type || 'private',
    description: pkg.description || '',
    badge: pkg.badge || '',
    sport_keys: Array.isArray(pkg.sport_keys) ? pkg.sport_keys : [],
    location_formats: Array.isArray(pkg.location_formats) ? pkg.location_formats : [],
    is_active: pkg.is_active !== false,
  });

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleList = (key, value) => {
    setDraft((d) => {
      const current = Array.isArray(d[key]) ? d[key] : [];
      return {
        ...d,
        [key]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  };

  const save = async () => {
    const priceDollars = Number(draft.price_dollars);
    if (!draft.name.trim()) return toast.error('Give your package a name.');
    if (!(priceDollars >= 5)) return toast.error('Price must be at least $5.');
    setSaving(true);
    try {
      await coachRepo.savePackage({
        package_id: draft.package_id || undefined,
        name: draft.name.trim(),
        sessions: Number(draft.sessions) || 1,
        duration_minutes: Number(draft.duration_minutes) || 60,
        price_cents: Math.round(priceDollars * 100),
        session_type: draft.session_type,
        description: draft.description.trim(),
        badge: draft.badge.trim(),
        sport_keys: draft.sport_keys,
        location_formats: draft.location_formats,
        is_active: draft.is_active,
      });
      toast.success(draft.package_id ? 'Package updated' : 'Package created');
      setDraft(null);
      load();
    } catch (err) {
      toast.error(err?.message || 'Could not save the package.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pkg) => {
    if (!window.confirm(`Delete "${pkg.name}"? Athletes will no longer be able to book it.`)) return;
    setDeletingId(pkg.id);
    try {
      await coachRepo.deletePackage(pkg.id);
      toast.success('Package deleted');
      setPackages((cur) => cur.filter((p) => p.id !== pkg.id));
    } catch (err) {
      toast.error(err?.message || 'Could not delete the package.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading your packages…</div>;
  }

  const coachSportOptions = (Array.isArray(coach?.sports) && coach.sports.length ? coach.sports : SPORTS_CATALOG.map((sport) => sport.sport_key))
    .map((sportKey) => ({ value: sportKey, label: SPORT_LABELS.get(sportKey) || sportKey }))
    .filter((item, index, arr) => item.value && arr.findIndex((other) => other.value === item.value) === index);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You set your own prices. Each package gives athletes credits to book sessions with you.
        Athletes only see <strong>your</strong> packages when they book.
      </p>

      {packages.length === 0 && !draft ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <PackageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No packages yet. Add at least one to accept bookings.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        {packages.map((pkg) => (
          <PackageRow key={pkg.id} pkg={pkg} onEdit={startEdit} onDelete={remove} busy={deletingId === pkg.id} />
        ))}
      </div>

      {draft ? (
        <div className="rounded-lg border border-accent/40 bg-card p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="pkg-name">Package name</Label>
              <Input id="pkg-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. 5-Session Skills Package" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pkg-sessions">Sessions (credits)</Label>
              <Input id="pkg-sessions" type="number" min="1" max="100" value={draft.sessions} onChange={(e) => update({ sessions: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pkg-duration">Session length</Label>
              <Select value={draft.duration_minutes} onValueChange={(v) => update({ duration_minutes: v })}>
                <SelectTrigger id="pkg-duration" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pkg-price">Total price (USD)</Label>
              <Input id="pkg-price" type="number" min="5" step="1" value={draft.price_dollars} onChange={(e) => update({ price_dollars: e.target.value })} placeholder="250" className="mt-1" />
              {Number(draft.price_dollars) > 0 && Number(draft.sessions) > 1 ? (
                <p className="text-[11px] text-muted-foreground mt-1">{usd(Math.round((Number(draft.price_dollars) * 100) / Number(draft.sessions)))} per session</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="pkg-type">Session type</Label>
              <Select value={draft.session_type} onValueChange={(v) => update({ session_type: v })}>
                <SelectTrigger id="pkg-type" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pkg-badge">Badge (optional)</Label>
              <Input id="pkg-badge" value={draft.badge} onChange={(e) => update({ badge: e.target.value })} placeholder="Most popular" className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pkg-desc">Description (optional)</Label>
              <Textarea id="pkg-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} rows={2} placeholder="What athletes get with this package." className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label>Sports</Label>
              <p className="mt-1 text-xs text-muted-foreground">Leave blank to offer this package for every sport on your profile.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {coachSportOptions.map((sport) => (
                  <button
                    key={sport.value}
                    type="button"
                    onClick={() => toggleList('sport_keys', sport.value)}
                    aria-pressed={draft.sport_keys.includes(sport.value)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${draft.sport_keys.includes(sport.value) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}
                  >
                    {sport.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Session formats</Label>
              <p className="mt-1 text-xs text-muted-foreground">Leave blank to offer this package for every format you have configured.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {LOCATION_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => toggleList('location_formats', format.value)}
                    aria-pressed={draft.location_formats.includes(format.value)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${draft.location_formats.includes(format.value) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => update({ is_active: e.target.checked })} />
              Visible to athletes (uncheck to hide without deleting)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save package'}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={startNew} className="gap-2"><Plus className="w-4 h-4" /> Add package</Button>
      )}
    </div>
  );
}
