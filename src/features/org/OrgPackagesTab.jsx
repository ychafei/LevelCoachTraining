import React, { useEffect, useState } from 'react';
import { organizationRepo, pricingPackageRepo } from '@/api/repo';
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

export default function OrgPackagesTab({ organizationId, isOrgAdmin }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Member-readable direct read of an org's active packages. pricing_packages is
  // PUBLIC read, so this works for billing/coach_manager/viewer roles that the
  // admin-only orgAdmin.listPackages call would 403 on.
  const loadReadOnly = () => pricingPackageRepo.listForOrg(organizationId);

  const load = () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    // Non-admins never have orgAdmin access — read directly. Admins use the
    // admin function (returns hidden packages too) but fall back to the public
    // read if it 403s rather than erroring the whole tab.
    const fetchPackages = isOrgAdmin
      ? organizationRepo.listPackages(organizationId).catch((err) => {
          if (err?.code === 403 || err?.status === 403) return loadReadOnly();
          throw err;
        })
      : loadReadOnly();
    fetchPackages
      .then((rows) => setPackages(rows || []))
      .catch((err) => toast.error(err?.message || 'Could not load your packages.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [organizationId, isOrgAdmin]);

  const startNew = () => setDraft({ ...emptyDraft });
  const optionDrafts = (pkg) => {
    const options = normalizeDurationOptions(pkg);
    return options.length ? options : [{ duration_minutes: Number(pkg.duration_minutes) || 60, price_cents: Number(pkg.price_cents) || 0 }];
  };
  const startEdit = (pkg) => setDraft({
    package_id: pkg.id,
    name: pkg.name,
    sessions: String(pkg.sessions),
    duration_minutes: String(pkg.duration_minutes),
    price_dollars: String(pkg.price_cents / 100),
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
    setSaving(true);
    try {
      await organizationRepo.savePackage({
        organization_id: organizationId,
        package_id: draft.package_id || undefined,
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
    if (!window.confirm(`Delete "${pkg.name}"? Your coaches will no longer be able to offer it.`)) return;
    setDeletingId(pkg.id);
    try {
      await organizationRepo.deletePackage(organizationId, pkg.id);
      toast.success('Package deleted');
      setPackages((cur) => cur.filter((p) => p.id !== pkg.id));
    } catch (err) {
      toast.error(err?.message || 'Could not delete the package.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading packages…</div>;
  }

  if (!isOrgAdmin) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Packages your coaches can offer.</p>
        {packages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <PackageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No packages yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{pkg.name}</p>
                  {pkg.badge ? <Badge variant="secondary" className="text-[10px]">{pkg.badge}</Badge> : null}
                  {!pkg.is_active ? <Badge variant="outline" className="text-[10px]">Hidden</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pkg.sessions} session{pkg.sessions === 1 ? '' : 's'} · {formatDurationMinutes((normalizeDurationOptions(pkg)[0] || {}).duration_minutes || pkg.duration_minutes)} · <span className="text-accent font-semibold">{usd((normalizeDurationOptions(pkg)[0] || {}).price_cents || pkg.price_cents)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {Array.isArray(pkg.sport_keys) && pkg.sport_keys.length ? pkg.sport_keys.map((sport) => SPORT_LABELS.get(sport) || sport).join(', ') : 'All sports'}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Only organization owners and admins can edit packages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong>Packages your coaches can offer.</strong> Athletes booking one of your affiliated coaches
        see these packages alongside the coach&apos;s own. Each package gives athletes credits to book sessions.
      </p>

      {packages.length === 0 && !draft ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <PackageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No packages yet. Add one to offer it through your coaches.</p>
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
              <Label htmlFor="org-pkg-name">Package name</Label>
              <Input id="org-pkg-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. 5-Session Skills Package" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="org-pkg-sessions">Sessions (credits)</Label>
              <Input id="org-pkg-sessions" type="number" min="1" max="100" value={draft.sessions} onChange={(e) => update({ sessions: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="org-pkg-type">Session type</Label>
              <Select value={draft.session_type} onValueChange={(v) => update({ session_type: v })}>
                <SelectTrigger id="org-pkg-type" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="org-pkg-badge">Badge (optional)</Label>
              <Input id="org-pkg-badge" value={draft.badge} onChange={(e) => update({ badge: e.target.value })} placeholder="Most popular" className="mt-1" />
            </div>
            <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Duration options</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Set the total package price for each session length. Discounts calculate from the shortest option.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addDurationOption}>Add duration</Button>
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
                        <Label className="text-[11px]">Total price cents</Label>
                        <Input inputMode="numeric" value={option.price_cents || ''} onChange={(e) => updateDurationOption(index, { price_cents: Number(e.target.value) || 0 })} placeholder="10000" className="mt-1" />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {option.price_cents > 0 ? `${usd(option.price_cents)} total${discount > 0 ? ` · ${discount}% off hourly rate` : ''}` : 'Use integer cents only'}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDurationOption(index)} aria-label="Remove duration option">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="org-pkg-desc">Description (optional)</Label>
              <Textarea id="org-pkg-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} rows={2} placeholder="What athletes get with this package." className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label>Sports</Label>
              <p className="mt-1 text-xs text-muted-foreground">Leave blank to offer this package for all roster sports.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SPORTS_CATALOG.map((sport) => (
                  <button
                    key={sport.sport_key}
                    type="button"
                    onClick={() => toggleList('sport_keys', sport.sport_key)}
                    aria-pressed={draft.sport_keys.includes(sport.sport_key)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${draft.sport_keys.includes(sport.sport_key) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30'}`}
                  >
                    {sport.display_name}
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
