import React, { useEffect, useMemo, useState } from 'react';
import {
  coachRepo,
  organizationCoachRepo,
  organizationRepo,
  payoutRuleRepo,
  pricingPackageRepo,
} from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { bpsToPercentLabel, formatCents } from '@/features/admin/money';
import { logAdminAction } from '@/lib/audit';
import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_PLATFORM_FEE_BPS = 1500;
const MIN_PRICE_CENTS = 500;
const MAX_PRICE_CENTS = 500000;

const SESSION_TYPES = [
  { value: 'private', label: 'Private' },
  { value: 'small_group', label: 'Small group' },
  { value: 'team', label: 'Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'virtual', label: 'Virtual' },
];

const empty = {
  name: '',
  sessions: '1',
  duration_minutes: '60',
  price_cents: '',
  session_type: 'private',
  description: '',
  includes: [],
  badge: '',
  is_active: true,
  is_visible: true,
  display_order: '0',
  coach_id: '',
  organization_id: '',
};

function parseInteger(value, min, max) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

function safeBps(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
}

function cleanString(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function getPackagePriceCents(pkg) {
  const cents = Number(pkg?.price_cents);
  if (Number.isSafeInteger(cents) && cents > 0) return cents;
  const dollars = Number(pkg?.price);
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
}

function getSessions(pkg) {
  const sessions = Number(pkg?.sessions);
  return Number.isSafeInteger(sessions) && sessions > 0 ? sessions : 1;
}

function perSessionCents(pkg) {
  return Math.round(getPackagePriceCents(pkg) / getSessions(pkg));
}

function coachName(coach, fallback = '') {
  if (!coach) return fallback ? `Coach ${fallback.slice(0, 8)}` : 'Selected coach';
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim()
    || coach.name
    || `Coach ${String(coach.id || fallback).slice(0, 8)}`;
}

function orgName(org, fallback = '') {
  if (!org) return fallback ? `Org ${fallback.slice(0, 8)}` : 'Selected organization';
  return org.name || org.slug || `Org ${String(org.id || fallback).slice(0, 8)}`;
}

function activeVisible(pkg) {
  return pkg?.is_active !== false && pkg?.is_visible !== false && getPackagePriceCents(pkg) > 0;
}

function activeOrgLink(orgLinks, organizationId, coachId) {
  if (!organizationId || !coachId) return false;
  return orgLinks.some((link) =>
    link.organization_id === organizationId
    && link.coach_id === coachId
    && link.status === 'active');
}

function packageScope(pkg, coachesById, orgsById) {
  const coachId = String(pkg?.coach_id || '');
  const orgId = String(pkg?.organization_id || '');
  if (coachId && orgId) return `${coachName(coachesById.get(coachId), coachId)} via ${orgName(orgsById.get(orgId), orgId)}`;
  if (coachId) return coachName(coachesById.get(coachId), coachId);
  if (orgId) return orgName(orgsById.get(orgId), orgId);
  return 'Platform default';
}

function draftFromPackage(pkg) {
  return {
    ...empty,
    ...pkg,
    sessions: String(getSessions(pkg)),
    duration_minutes: String(Number(pkg.duration_minutes) || 60),
    price_cents: String(getPackagePriceCents(pkg) || ''),
    session_type: pkg.session_type || 'private',
    description: pkg.description || '',
    includes: Array.isArray(pkg.includes) ? pkg.includes : [],
    badge: pkg.badge || '',
    is_active: pkg.is_active !== false,
    is_visible: pkg.is_visible !== false,
    display_order: String(Number(pkg.display_order) || 0),
    coach_id: pkg.coach_id || '',
    organization_id: pkg.organization_id || '',
  };
}

function normalizeForSave(draft, orgLinks) {
  const name = cleanString(draft.name, 200);
  const sessions = parseInteger(draft.sessions, 1, 100);
  const duration = parseInteger(draft.duration_minutes, 15, 480);
  const priceCents = parseInteger(draft.price_cents, MIN_PRICE_CENTS, MAX_PRICE_CENTS);
  const displayOrder = parseInteger(draft.display_order, 0, 9999);
  const coachId = String(draft.coach_id || '').trim();
  const orgId = String(draft.organization_id || '').trim();
  const sessionType = String(draft.session_type || '').trim();

  if (!name) return { error: 'Package name is required.' };
  if (sessions === null) return { error: 'Sessions must be an integer from 1 to 100.' };
  if (duration === null) return { error: 'Duration must be an integer from 15 to 480 minutes.' };
  if (priceCents === null) return { error: 'Price must be integer cents from 500 to 500000.' };
  if (displayOrder === null) return { error: 'Display order must be an integer from 0 to 9999.' };
  if (sessionType && !SESSION_TYPES.some((type) => type.value === sessionType)) {
    return { error: 'Invalid session type.' };
  }
  if (coachId && orgId && !activeOrgLink(orgLinks, orgId, coachId)) {
    return { error: 'That coach is not active in the selected organization.' };
  }

  const includes = Array.isArray(draft.includes)
    ? draft.includes.map((item) => cleanString(item, 500)).filter(Boolean).slice(0, 20)
    : [];

  return {
    data: {
      name,
      sessions,
      duration_minutes: duration,
      price_cents: priceCents,
      price: priceCents / 100,
      session_type: sessionType,
      description: cleanString(draft.description, 1000),
      includes,
      badge: cleanString(draft.badge, 100),
      is_active: draft.is_active === true,
      is_visible: draft.is_visible === true,
      display_order: displayOrder,
      coach_id: coachId,
      organization_id: orgId,
    },
  };
}

function resolveSplitPreview(pkg, { coachesById, orgsById, payoutRules }) {
  const priceCents = getPackagePriceCents(pkg);
  const coachId = String(pkg?.coach_id || '');
  const orgId = String(pkg?.organization_id || '');
  const coach = coachId ? coachesById.get(coachId) : null;
  const org = orgId ? orgsById.get(orgId) : null;
  let platformBps = safeBps(coach?.platform_fee_bps) ?? safeBps(org?.platform_fee_bps) ?? DEFAULT_PLATFORM_FEE_BPS;
  let coachBps = Math.max(0, 10000 - platformBps);
  let orgBps = 0;
  let source = coachId || !orgId ? 'Coach/default payout model' : 'Organization payout model';
  let note = '';

  if (orgId) {
    const activeRules = payoutRules.filter((rule) =>
      rule.organization_id === orgId && rule.active !== false);
    const exactRule = coachId
      ? activeRules.find((rule) => rule.coach_id === coachId)
      : null;

    if (exactRule) {
      const ruleCoach = safeBps(exactRule.coach_share_bps);
      const ruleOrg = safeBps(exactRule.org_share_bps);
      const rulePlatform = safeBps(exactRule.platform_share_bps);
      if (ruleCoach === null || ruleOrg === null || rulePlatform === null || ruleCoach + ruleOrg + rulePlatform !== 10000) {
        return { error: 'Invalid payout rule split.', priceCents };
      }
      coachBps = ruleCoach;
      orgBps = ruleOrg;
      platformBps = rulePlatform;
      source = 'Exact payout rule';
    } else if (org?.payout_model === 'organization') {
      coachBps = 0;
      orgBps = 10000 - platformBps;
      source = coachId ? 'Organization payout model' : 'Organization-owned payout preview';
    } else if (org?.payout_model === 'split' || org?.payout_model === 'split_future') {
      coachBps = 6000;
      orgBps = 10000 - platformBps - coachBps;
      source = coachId ? 'Default org split' : 'Default org split preview';
    } else {
      coachBps = 10000 - platformBps;
      orgBps = 0;
      source = coachId ? 'Coach payout through org' : 'Selected-coach payout preview';
    }

    if (!coachId && activeRules.length > 0) {
      note = `${activeRules.length} active coach rule${activeRules.length === 1 ? '' : 's'} may change the exact split at booking.`;
    }
  }

  if (coachBps < 0 || orgBps < 0 || platformBps < 0 || coachBps + orgBps + platformBps !== 10000) {
    return { error: 'Split must sum to 10000 bps.', priceCents };
  }

  const coachCents = Math.floor((priceCents * coachBps) / 10000);
  const orgCents = Math.floor((priceCents * orgBps) / 10000);
  const platformCents = priceCents - coachCents - orgCents;

  return {
    source,
    note,
    priceCents,
    platformBps,
    coachBps,
    orgBps,
    platformCents,
    coachCents,
    orgCents,
  };
}

function SplitPreview({ pkg, context, compact = false }) {
  const split = resolveSplitPreview(pkg, context);
  if (split.error) {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{split.error}</span>
      </div>
    );
  }

  const items = [
    ['Coach', split.coachBps, split.coachCents],
    ['Org', split.orgBps, split.orgCents],
    ['Platform', split.platformBps, split.platformCents],
  ];

  return (
    <div className={compact ? 'space-y-1' : 'rounded-lg border border-border bg-secondary/30 p-3'}>
      <p className="text-xs font-semibold text-muted-foreground">{split.source}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map(([label, bps, cents]) => (
          <span key={label} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground">
            {label}: {bpsToPercentLabel(bps)} ({formatCents(cents)})
          </span>
        ))}
      </div>
      {!compact && (
        <p className="mt-2 text-xs text-muted-foreground">
          Effective price: {formatCents(perSessionCents(pkg))}/session from {formatCents(split.priceCents)} total.
        </p>
      )}
      {split.note && <p className="mt-1 text-xs text-yellow-700">{split.note}</p>}
    </div>
  );
}

function ScopeIcon({ pkg }) {
  if (pkg.organization_id) return <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />;
  if (pkg.coach_id) return <UserRound className="h-4 w-4 text-accent" aria-hidden="true" />;
  return <CircleDollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export default function AdminPricing() {
  const { user, isAdmin } = useCurrentUser();
  const [packages, setPackages] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [payoutRules, setPayoutRules] = useState([]);
  const [orgLinks, setOrgLinks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [includeInput, setIncludeInput] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const coachesById = useMemo(() => new Map(coaches.map((coach) => [coach.id, coach])), [coaches]);
  const orgsById = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);
  const context = useMemo(() => ({ coachesById, orgsById, payoutRules }), [coachesById, orgsById, payoutRules]);

  const load = async () => {
    setLoading(true);
    try {
      const [pkgRows, coachRows, orgRows, ruleRows, linkRows] = await Promise.all([
        pricingPackageRepo.list('display_order').catch(() => []),
        coachRepo.list('display_order').catch(() => []),
        organizationRepo.list('name').catch(() => []),
        payoutRuleRepo.list().catch(() => []),
        organizationCoachRepo.list().catch(() => []),
      ]);
      setPackages(pkgRows || []);
      setCoaches(coachRows || []);
      setOrganizations(orgRows || []);
      setPayoutRules(ruleRows || []);
      setOrgLinks(linkRows || []);
    } catch (err) {
      toast.error(err?.message || 'Could not load pricing controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const platformDefaults = useMemo(
    () => packages.filter((pkg) => activeVisible(pkg) && !pkg.coach_id && !pkg.organization_id),
    [packages],
  );

  const coachWarnings = useMemo(() => {
    const activePublished = coaches.filter((coach) => coach.is_active === true && coach.published === true);
    return activePublished.filter((coach) => {
      const direct = packages.some((pkg) => activeVisible(pkg) && pkg.coach_id === coach.id);
      if (direct) return false;
      const activeOrgIds = orgLinks
        .filter((link) => link.coach_id === coach.id && link.status === 'active')
        .map((link) => link.organization_id);
      return !packages.some((pkg) =>
        activeVisible(pkg)
        && activeOrgIds.includes(pkg.organization_id)
        && (!pkg.coach_id || pkg.coach_id === coach.id));
    });
  }, [coaches, orgLinks, packages]);

  const filteredPackages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return packages
      .filter((pkg) => {
        if (scopeFilter === 'platform') return !pkg.coach_id && !pkg.organization_id;
        if (scopeFilter === 'coach') return !!pkg.coach_id;
        if (scopeFilter === 'organization') return !!pkg.organization_id;
        return true;
      })
      .filter((pkg) => {
        if (!needle) return true;
        const haystack = [
          pkg.name,
          pkg.badge,
          pkg.session_type,
          packageScope(pkg, coachesById, orgsById),
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0)
        || perSessionCents(a) - perSessionCents(b));
  }, [coachesById, orgsById, packages, query, scopeFilter]);

  const startNew = () => {
    setEditing({ ...empty, includes: [] });
    setIncludeInput('');
    setOpen(true);
  };

  const startEdit = (pkg) => {
    setEditing(draftFromPackage(pkg));
    setIncludeInput('');
    setOpen(true);
  };

  const addInclude = () => {
    const item = includeInput.trim();
    if (!item) return;
    setEditing((draft) => ({ ...draft, includes: [...(draft.includes || []), item] }));
    setIncludeInput('');
  };

  const save = async () => {
    const normalized = normalizeForSave(editing, orgLinks);
    if (normalized.error) {
      toast.error(normalized.error);
      return;
    }

    const data = normalized.data;
    const isUpdate = !!editing.id;
    const previous = isUpdate ? packages.find((pkg) => pkg.id === editing.id) : null;
    let savedId = editing.id;

    try {
      if (isUpdate) {
        await pricingPackageRepo.update(editing.id, data);
      } else {
        const created = await pricingPackageRepo.create(data);
        savedId = created?.id;
      }
    } catch (err) {
      toast.error(`Could not save package: ${err?.message || String(err)}`);
      return;
    }

    await logAdminAction({
      actor: user,
      action: isUpdate ? 'pricing.update' : 'pricing.create',
      entityType: 'PricingPackage',
      entityId: savedId || '',
      before: isUpdate ? {
        name: previous?.name,
        price_cents: previous?.price_cents,
        coach_id: previous?.coach_id,
        organization_id: previous?.organization_id,
        is_active: previous?.is_active,
        is_visible: previous?.is_visible,
      } : undefined,
      after: {
        name: data.name,
        price_cents: data.price_cents,
        coach_id: data.coach_id,
        organization_id: data.organization_id,
        is_active: data.is_active,
        is_visible: data.is_visible,
      },
    });

    toast.success('Package saved');
    setOpen(false);
    setEditing(null);
    await load();
  };

  const remove = async (pkg) => {
    const ok = await confirm({
      title: 'Delete this package?',
      description: `${pkg.name} - ${getSessions(pkg)} session${getSessions(pkg) === 1 ? '' : 's'} - ${formatCents(getPackagePriceCents(pkg))}`,
      consequences: [
        'Future checkouts and bookings will stop offering it.',
        'Existing reservations keep their price_snapshot_cents and payout_plan_snapshot.',
      ],
      confirmLabel: 'Delete package',
      cancelLabel: 'Keep package',
      variant: 'destructive',
      requireTyped: 'DELETE',
    });
    if (!ok) return;

    try {
      await pricingPackageRepo.delete(pkg.id);
      await logAdminAction({
        actor: user,
        action: 'pricing.delete',
        entityType: 'PricingPackage',
        entityId: pkg.id,
        before: {
          name: pkg.name,
          price_cents: pkg.price_cents,
          coach_id: pkg.coach_id,
          organization_id: pkg.organization_id,
          is_active: pkg.is_active,
          is_visible: pkg.is_visible,
        },
      });
      toast.success('Package deleted');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete package.');
    }
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.01em] text-foreground">Pricing packages</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Prices are stored as integer cents. Booking keeps price_snapshot_cents and payout_plan_snapshot,
              so edits here apply only to future purchases and reservations.
            </p>
          </div>
          <Button onClick={startNew} className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add package
          </Button>
        </div>

        {coachWarnings.length > 0 && (
          <section className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">Published coaches missing active visible pricing</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {platformDefaults.length > 0
                    ? 'Platform defaults exist, but these coaches do not have coach-specific or organization pricing.'
                    : 'These coaches have no coach-specific, organization, or platform fallback package.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {coachWarnings.slice(0, 12).map((coach) => (
                    <Badge key={coach.id} variant="outline" className="border-yellow-500/30 bg-background text-xs">
                      {coachName(coach)}
                    </Badge>
                  ))}
                  {coachWarnings.length > 12 && (
                    <Badge variant="outline" className="border-yellow-500/30 bg-background text-xs">
                      +{coachWarnings.length - 12} more
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">All packages</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{packages.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Active visible</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{packages.filter(activeVisible).length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Coach packages</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{packages.filter((pkg) => pkg.coach_id).length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Org packages</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{packages.filter((pkg) => pkg.organization_id).length}</p>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'All'],
              ['platform', 'Platform'],
              ['coach', 'Coach'],
              ['organization', 'Organization'],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={scopeFilter === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScopeFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search packages"
              className="border-border bg-card pl-9"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_190px_minmax(0,1.45fr)_120px] gap-4 border-b border-border bg-secondary/50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid">
            <span>Package</span>
            <span>Scope</span>
            <span>Price</span>
            <span>Split preview</span>
            <span className="text-right">Actions</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading pricing...
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No packages match this view.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredPackages.map((pkg) => {
                const active = pkg.is_active !== false;
                const visible = pkg.is_visible !== false;
                return (
                  <div
                    key={pkg.id}
                    className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_190px_minmax(0,1.45fr)_120px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-foreground">{pkg.name}</p>
                        {pkg.badge && <Badge className="border-accent/20 bg-accent/10 text-xs text-accent">{pkg.badge}</Badge>}
                        {!active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        {active && !visible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getSessions(pkg)} session{getSessions(pkg) === 1 ? '' : 's'} - {Number(pkg.duration_minutes) || 60} min
                        {pkg.session_type ? ` - ${String(pkg.session_type).replace('_', ' ')}` : ''}
                      </p>
                      {pkg.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{pkg.description}</p>}
                    </div>

                    <div className="flex min-w-0 items-start gap-2 text-sm">
                      <ScopeIcon pkg={pkg} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{packageScope(pkg, coachesById, orgsById)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {pkg.coach_id && pkg.organization_id ? 'Coach + organization' : pkg.organization_id ? 'Organization' : pkg.coach_id ? 'Coach' : 'Platform'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">{formatCents(getPackagePriceCents(pkg))}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatCents(perSessionCents(pkg))}/session</p>
                    </div>

                    <SplitPreview pkg={pkg} context={context} compact />

                    <div className="flex items-center justify-start gap-1 lg:justify-end">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(pkg)} aria-label={`Edit ${pkg.name}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(pkg)} aria-label={`Delete ${pkg.name}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit package' : 'Add package'}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="mt-2 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold">Coach</Label>
                  <Select
                    value={editing.coach_id || 'none'}
                    onValueChange={(value) => setEditing({ ...editing, coach_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="mt-1 border-border bg-secondary">
                      <SelectValue placeholder="Platform default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No coach</SelectItem>
                      {coaches.map((coach) => (
                        <SelectItem key={coach.id} value={coach.id}>{coachName(coach)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Organization</Label>
                  <Select
                    value={editing.organization_id || 'none'}
                    onValueChange={(value) => setEditing({ ...editing, organization_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="mt-1 border-border bg-secondary">
                      <SelectValue placeholder="Platform default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No organization</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{orgName(org)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Name</Label>
                <Input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="mt-1 border-border bg-secondary"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label className="text-xs font-semibold">Sessions</Label>
                  <Input
                    inputMode="numeric"
                    value={editing.sessions}
                    onChange={(event) => setEditing({ ...editing, sessions: event.target.value })}
                    className="mt-1 border-border bg-secondary"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Duration</Label>
                  <Input
                    inputMode="numeric"
                    value={editing.duration_minutes}
                    onChange={(event) => setEditing({ ...editing, duration_minutes: event.target.value })}
                    className="mt-1 border-border bg-secondary"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Price cents</Label>
                  <Input
                    inputMode="numeric"
                    value={editing.price_cents}
                    onChange={(event) => setEditing({ ...editing, price_cents: event.target.value })}
                    className="mt-1 border-border bg-secondary"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Order</Label>
                  <Input
                    inputMode="numeric"
                    value={editing.display_order}
                    onChange={(event) => setEditing({ ...editing, display_order: event.target.value })}
                    className="mt-1 border-border bg-secondary"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold">Session type</Label>
                  <Select
                    value={editing.session_type || 'none'}
                    onValueChange={(value) => setEditing({ ...editing, session_type: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="mt-1 border-border bg-secondary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any type</SelectItem>
                      {SESSION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Badge</Label>
                  <Input
                    value={editing.badge || ''}
                    onChange={(event) => setEditing({ ...editing, badge: event.target.value })}
                    className="mt-1 border-border bg-secondary"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Description</Label>
                <Textarea
                  value={editing.description || ''}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                  className="mt-1 border-border bg-secondary"
                  rows={3}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Includes</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={includeInput}
                    onChange={(event) => setIncludeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addInclude();
                      }
                    }}
                    className="border-border bg-secondary"
                  />
                  <Button type="button" variant="outline" onClick={addInclude}>Add</Button>
                </div>
                {editing.includes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editing.includes.map((item, index) => (
                      <Badge key={`${item}-${index}`} variant="secondary" className="gap-1 pr-1 text-xs">
                        <span>{item}</span>
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-background"
                          onClick={() => setEditing({
                            ...editing,
                            includes: editing.includes.filter((_, idx) => idx !== index),
                          })}
                          aria-label={`Remove ${item}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm font-medium">
                  <Checkbox
                    checked={editing.is_active === true}
                    onCheckedChange={(checked) => setEditing({ ...editing, is_active: checked === true })}
                  />
                  <span className="flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Active
                  </span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm font-medium">
                  <Checkbox
                    checked={editing.is_visible === true}
                    onCheckedChange={(checked) => setEditing({ ...editing, is_visible: checked === true })}
                  />
                  <span className="flex items-center gap-2">
                    {editing.is_visible === true
                      ? <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      : <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    Visible
                  </span>
                </label>
              </div>

              <SplitPreview pkg={editing} context={context} />

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="button" onClick={save} className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
                  Save package
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
