import React, { useEffect, useState } from 'react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Stacked role editor: toggle coach / admin / super_admin independently and
// save the full set at once (server: grantAdminRole, master-admin gated).
// Loads the target's current roles on mount; the server applies the EXACT set
// submitted, so the editor refuses to render chips (and Save) until the
// current set has actually loaded — a silently-empty set would demote the
// target on Save. The locked master admin always keeps super_admin (no
// self-lockout — enforced server-side too).
export default function RoleEditor({ profile, onSaved }) {
  const locked = !!profile.master_admin_locked;
  const [roles, setRoles] = useState(null);
  const [loadedRoles, setLoadedRoles] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRoles(null);
    setLoadedRoles(null);
    setLoadError(false);
    auth.getUserRoles(profile.id)
      .then((r) => {
        if (cancelled) return;
        if (!Array.isArray(r?.roles)) throw new Error('roles missing from response');
        setRoles(new Set(r.roles));
        setLoadedRoles(new Set(r.roles));
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [profile.id, reloadKey]);

  const toggle = (role) => {
    if (saving) return;
    if (locked && role === 'super_admin') return; // master keeps super_admin
    setRoles((prev) => {
      const next = new Set(prev);
      if (role === 'admin' && next.has('super_admin')) return next; // implied
      if (next.has(role)) {
        next.delete(role);
        // Un-checking Super Admin on a real super admin downgrades to Admin
        // (their admin label was implied); drop Admin separately for a full
        // demotion. If Super Admin was only just toggled on, this is an undo.
        if (role === 'super_admin' && loadedRoles?.has('super_admin')) next.add('admin');
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const save = async () => {
    if (!roles) return;
    setSaving(true);
    setError('');
    try {
      const list = [...roles];
      await auth.setUserRoles({ profileId: profile.id, roles: list, allowSuperAdmin: list.includes('super_admin') });
      toast.success(`Roles updated for ${profile.email || 'user'}`);
      await onSaved?.();
    } catch (err) {
      setError(err?.message || 'Could not save roles.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <span className="flex items-center gap-2 text-xs text-destructive">
        Could not load current roles.
        <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
      </span>
    );
  }
  if (roles === null) return <span className="text-xs text-muted-foreground">Loading roles…</span>;

  const chip = (role, label) => {
    const implied = role === 'admin' && roles.has('super_admin');
    const on = roles.has(role) || implied;
    const disabled = saving || implied || (locked && role === 'super_admin');
    return (
      <button
        type="button"
        onClick={() => toggle(role)}
        disabled={disabled}
        aria-pressed={on}
        title={implied ? 'Implied by Super Admin' : undefined}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:bg-accent/5'} ${disabled ? 'opacity-60' : ''}`}
      >
        {on ? '✓ ' : ''}{label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip('coach', 'Coach')}
      {chip('admin', 'Admin')}
      {chip('super_admin', 'Super Admin')}
      <Button size="sm" onClick={save} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
        {saving ? 'Saving…' : 'Save roles'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
