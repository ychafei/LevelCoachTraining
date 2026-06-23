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
import {
  DEFAULT_PACKAGE_DURATIONS,
  discountPercentForOption,
  formatDurationMinutes,
  normalizeDurationOptions,
} from '@/lib/pricingDurations';

const SESSION_TYPES = [
  { value: 'private', label: 'Private (1-on-1)' },
  { value: 'small_group', label: 'Small group' },
  { value: 'team', label: 'Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'virtual', label: 'Virtual' },
];

const emptyDraft = {
  package_id: null,
  name: '',
  sessions: '1',
  duration_minutes: '60',
  price_dollars: '',
  duration_options: [{ duration_minutes: 60, price_cents: 0 }],
  session_type: 'private',
  description: '',
  badge: '',
  sport_keys: [],
  is_active: true,
};

const usd = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const SPORT_LABELS = new Map(SPORTS_CATALOG.map((sport) => [sport.sport_key, sport.display_name]));
const cleanPackageId = (value) => {
  const id = String(value || '').trim();
  return id && id !== 'null' && id !== 'undefined' ? id : '';
};
const priceInput = (cents) => {
  const value = Number(cents);
  if (!Number.isInteger(value) || value <= 0) return '';
  return String(value / 100);
};
const centsFromInput = (value) => {
  const dollars = Number(value);
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
};
const isSingleSessionPackage = (pkg) => (Number(pkg?.sessions) || 1) === 1;
const isStarterPackage = (pkg) =>
  isSingleSessionPackage(pkg) && String(pkg?.name || '').trim().toLowerCase() === 'single session';
const comparePackages = (a, b) => {
  if (isStarterPackage(a) !== isStarterPackage(b)) return isStarterPackage(a) ? -1 : 1;
  return (Number(a.display_order) || 0) - (Number(b.display_order) || 0)
    || (Number(a.price_cents) || 0) - (Number(b.price_cents) || 0);
};
const starterDraftFromCoach = (coach) => {
  const hint = Number(coach?.price_hint_cents);
  const priceCents = Number.isInteger(hint) && hint > 0 ? hint : 0;
  return {
    ...emptyDraft,
    name: 'Single Session',
    sessions: '1',
    duration_minutes: '60',
    price_dollars: priceInput(priceCents),
    duration_options: [{ duration_minutes: 60, price_cents: priceCents }],
    session_type: 'private',
    description: 'One private training session.',
    badge: '',
    sport_keys: [],
    is_active: true,
  };
};

function PackageRow({ pkg, onEdit, onDelete, busy }) {
  const options = normalizeDurationOptions(pkg);
  const primary = options[0] || { duration_minutes: pkg.duration_minutes || 60, price_cents: pkg.price_cents || 0 };
  const per = pkg.sessions > 1 ? ` · ${usd(Math.round(primary.price_cents / pkg.sessions))}/session` : '';
  const sports = Array.isArray(pkg.sport_keys) ? pkg.sport_keys : [];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-foreground truncate">{pkg.name}</p>
          {pkg.badge ? <Badge variant="secondary" className="text-[10px]">{pkg.badge}</Badge> : null}
          {!pkg.is_active ? <Badge variant="outline" className="text-[10px]">Hidden</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pkg.sessions} session{pkg.sessions === 1 ? '' : 's'} · {formatDurationMinutes(primary.duration_minutes)} · <span className="text-accent font-semibold">{usd(primary.price_cents)}</span>{per}
          {pkg.session_type ? ` · ${pkg.session_type.replace('_', ' ')}` : ''}
        </p>
        {options.length > 1 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Durations: {options.map((option) => `${formatDurationMinutes(option.duration_minutes)} ${usd(option.price_cents)}`).join(' · ')}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          {sports.length ? sports.map((sport) => SPORT_LABELS.get(sport) || sport).join(', ') : 'All sports'}
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
        const sorted = [...(rows || [])].sort(comparePackages);
        setPackages(sorted);
        setCoach(coachRow);
        if (!sorted.length) setDraft(starterDraftFromCoach(coachRow));
      })
      .catch((err) => toast.error(err?.message || 'Could not load your packages.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    const hasStarter = packages.some(isStarterPackage);
    setDraft(hasStarter ? { ...emptyDraft } : starterDraftFromCoach(coach));
  };
  const optionDrafts = (pkg) => {
    const options = normalizeDurationOptions(pkg);
    return options.length ? options : [{ duration_minutes: Number(pkg.duration_minutes) || 60, price_cents: Number(pkg.price_cents) || 0 }];
  };
  const startEdit = (pkg) => setDraft({
    package_id: cleanPackageId(pkg.id || pkg.$id),
    name: pkg.name,
    sessions: String(pkg.sessions),
    duration_minutes: String(pkg.duration_minutes),
    price_dollars: priceInput(pkg.price_cents),
    duration_options: optionDrafts(pkg),
    session_type: pkg.session_type || 'private',
    description: pkg.description || '',
    badge: pkg.badge || '',
    sport_keys: Array.isArray(pkg.sport_keys) ? pkg.sport_keys : [],
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
  const coachSportOptions = (Array.isArray(coach?.sports) && coach.sports.length ? coach.sports : SPORTS_CATALOG.map((sport) => sport.sport_key))
    .map((sportKey) => ({ value: sportKey, label: SPORT_LABELS.get(sportKey) || sportKey }))
    .filter((item, index, arr) => item.value && arr.findIndex((other) => other.value === item.value) === index);
  const requiresSportScopedPackages = coachSportOptions.length > 1;

  const updateDurationOption = (index, patch) => {
    setDraft((d) => ({
      ...d,
      duration_options: (Array.isArray(d.duration_options) ? d.duration_options : []).map((option, idx) =>
        idx === index ? { ...option, ...patch } : option),
    }));
  };

  const addDurationOption = () => {
    setDraft((d) => ({
      ...d,
      duration_options: [
        ...(Array.isArray(d.duration_options) ? d.duration_options : []),
        { duration_minutes: 90, price_cents: Number(d.price_dollars) > 0 ? Math.round(Number(d.price_dollars) * 100 * 1.5) : 0 },
      ],
    }));
  };

  const removeDurationOption = (index) => {
    setDraft((d) => {
      const next = (Array.isArray(d.duration_options) ? d.duration_options : []).filter((_, idx) => idx !== index);
      return { ...d, duration_options: next.length ? next : [{ duration_minutes: 60, price_cents: 0 }] };
    });
  };

  const save = async () => {
    const durationOptions = (Array.isArray(draft.duration_options) ? draft.duration_options : [])
      .map((option) => ({
        duration_minutes: Number(option.duration_minutes),
        price_cents: Number(option.price_cents),
      }))
      .filter((option) => Number.isInteger(option.duration_minutes) && Number.isInteger(option.price_cents));
    const primary = durationOptions[0];
    if (!draft.name.trim()) return toast.error('Give your package a name.');
    if (!primary) return toast.error('Add at least one duration option.');
    if (!durationOptions.every((option) => option.duration_minutes >= 15 && option.duration_minutes <= 480 && option.price_cents >= 500)) {
      return toast.error('Each duration needs 15-480 minutes and a price of at least $5.');
    }
    if (requiresSportScopedPackages && !draft.sport_keys.length) {
      return toast.error('Choose which sport this package belongs to.');
    }
    setSaving(true);
    try {
      await coachRepo.savePackage({
        ...(cleanPackageId(draft.package_id) ? { package_id: cleanPackageId(draft.package_id) } : {}),
        name: draft.name.trim(),
        sessions: Number(draft.sessions) || 1,
        duration_minutes: primary.duration_minutes,
        price_cents: primary.price_cents,
        duration_options: durationOptions,
        session_type: draft.session_type,
        description: draft.description.trim(),
        badge: draft.badge.trim(),
        sport_keys: draft.sport_keys,
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

  const singleSessionDraft = draft ? isStarterPackage(draft) : false;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your Single Session price is what athletes see first on your public coach card.
        Bundles can offer discounts, but they will not lower that public single-session price.
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
          {singleSessionDraft && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-sm font-bold text-slate-950">Default public package: Single Session</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Set your price below. This is the amount shown as your public “From $X / session” price.
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {singleSessionDraft ? (
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Package</Label>
                  <Input value="Single Session" readOnly className="mt-1 bg-secondary text-muted-foreground" />
                </div>
                <div>
                  <Label>Credits</Label>
                  <Input value="1 session" readOnly className="mt-1 bg-secondary text-muted-foreground" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Input value="Private (1-on-1)" readOnly className="mt-1 bg-secondary text-muted-foreground" />
                </div>
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <Label htmlFor="pkg-name">Package name</Label>
                  <Input id="pkg-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. 5-Session Skills Package" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="pkg-sessions">Sessions (credits)</Label>
                  <Input id="pkg-sessions" type="number" min="1" max="100" value={draft.sessions} onChange={(e) => update({ sessions: e.target.value })} className="mt-1" />
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
              </>
            )}
            <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Duration options</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {singleSessionDraft
                      ? 'The default is a one-hour private session. Change the duration only if your standard session is different.'
                      : 'Set the total package price for each session length. Discounts calculate from the shortest option.'}
                  </p>
                </div>
                {!singleSessionDraft && (
                  <Button type="button" variant="outline" size="sm" onClick={addDurationOption}>Add duration</Button>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {(draft.duration_options || []).map((option, index) => {
                  const pkgPreview = { sessions: Number(draft.sessions) || 1, duration_options: draft.duration_options };
                  const discount = discountPercentForOption(pkgPreview, option);
                  return (
                    <div key={`${option.duration_minutes}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <div>
                        <Label className="text-[11px]">Duration</Label>
                        <Select value={String(option.duration_minutes || 60)} onValueChange={(v) => updateDurationOption(index, { duration_minutes: Number(v) })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DEFAULT_PACKAGE_DURATIONS.map((m) => <SelectItem key={m} value={String(m)}>{formatDurationMinutes(m)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">{singleSessionDraft ? 'Session price (USD)' : 'Total package price (USD)'}</Label>
                        <Input
                          type="number"
                          min="5"
                          step="1"
                          inputMode="decimal"
                          value={priceInput(option.price_cents)}
                          onChange={(e) => updateDurationOption(index, { price_cents: centsFromInput(e.target.value) })}
                          placeholder="100"
                          className="mt-1"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {option.price_cents > 0 ? `${usd(option.price_cents)} total${discount > 0 ? ` · ${discount}% off hourly rate` : ''}` : 'Minimum $5'}
                        </p>
                      </div>
                      {!singleSessionDraft && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeDurationOption(index)} aria-label="Remove duration option">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {!singleSessionDraft && (
              <div className="sm:col-span-2">
                <Label htmlFor="pkg-desc">Description (optional)</Label>
                <Textarea id="pkg-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} rows={2} placeholder="What athletes get with this package." className="mt-1" />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Sports</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {requiresSportScopedPackages
                  ? 'Choose at least one sport so this package appears on the right public profile.'
                  : 'Leave blank to offer this package for every sport on your profile.'}
              </p>
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
