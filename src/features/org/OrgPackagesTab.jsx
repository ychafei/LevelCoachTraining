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

const SESSION_TYPES = [
  { value: 'private', label: 'Private (1-on-1)' },
  { value: 'small_group', label: 'Small group' },
  { value: 'team', label: 'Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'virtual', label: 'Virtual' },
];

const DURATIONS = [30, 45, 60, 75, 90, 120];

const emptyDraft = {
  package_id: null,
  name: '',
  sessions: '1',
  duration_minutes: '60',
  price_dollars: '',
  session_type: 'private',
  description: '',
  badge: '',
  is_active: true,
};

const usd = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function PackageRow({ pkg, onEdit, onDelete, busy }) {
  const per = pkg.sessions > 1 ? ` · ${usd(Math.round(pkg.price_cents / pkg.sessions))}/session` : '';
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
  const startEdit = (pkg) => setDraft({
    package_id: pkg.id,
    name: pkg.name,
    sessions: String(pkg.sessions),
    duration_minutes: String(pkg.duration_minutes),
    price_dollars: String(pkg.price_cents / 100),
    session_type: pkg.session_type || 'private',
    description: pkg.description || '',
    badge: pkg.badge || '',
    is_active: pkg.is_active !== false,
  });

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const priceDollars = Number(draft.price_dollars);
    if (!draft.name.trim()) return toast.error('Give your package a name.');
    if (!(priceDollars >= 5)) return toast.error('Price must be at least $5.');
    setSaving(true);
    try {
      await organizationRepo.savePackage({
        organization_id: organizationId,
        package_id: draft.package_id || undefined,
        name: draft.name.trim(),
        sessions: Number(draft.sessions) || 1,
        duration_minutes: Number(draft.duration_minutes) || 60,
        price_cents: Math.round(priceDollars * 100),
        session_type: draft.session_type,
        description: draft.description.trim(),
        badge: draft.badge.trim(),
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
                  {pkg.sessions} session{pkg.sessions === 1 ? '' : 's'} · {pkg.duration_minutes} min · <span className="text-accent font-semibold">{usd(pkg.price_cents)}</span>
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
              <Label htmlFor="org-pkg-duration">Session length</Label>
              <Select value={draft.duration_minutes} onValueChange={(v) => update({ duration_minutes: v })}>
                <SelectTrigger id="org-pkg-duration" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="org-pkg-price">Total price (USD)</Label>
              <Input id="org-pkg-price" type="number" min="5" step="1" value={draft.price_dollars} onChange={(e) => update({ price_dollars: e.target.value })} placeholder="250" className="mt-1" />
              {Number(draft.price_dollars) > 0 && Number(draft.sessions) > 1 ? (
                <p className="text-[11px] text-muted-foreground mt-1">{usd(Math.round((Number(draft.price_dollars) * 100) / Number(draft.sessions)))} per session</p>
              ) : null}
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
            <div className="sm:col-span-2">
              <Label htmlFor="org-pkg-desc">Description (optional)</Label>
              <Textarea id="org-pkg-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} rows={2} placeholder="What athletes get with this package." className="mt-1" />
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
