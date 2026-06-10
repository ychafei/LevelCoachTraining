import React, { useEffect, useState } from 'react';
import { coachRepo, profileRepo } from '@/api/repo';
import { storage } from '@/lib/storage';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, MapPin, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { describeFee } from '@/lib/earnings';
import { logAdminAction } from '@/lib/audit';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getLegalPacketStatus } from '@/lib/legal';

const emptyCoach = { first_name: '', last_name: '', email: '', phone: '', county: '', training_area: '', bio: '', quote: '', specializations: [], is_active: true, is_head_coach: false, platform_fee_type: 'none', platform_fee_value: 0 };

export default function AdminCoaches() {
  const { user, isAdmin } = useCurrentUser();
  const [coaches, setCoaches] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkShowAll, setLinkShowAll] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkingEmail, setLinkingEmail] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [specInput, setSpecInput] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const visibleCoaches = coaches;

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { url: file_url } = await storage.uploadFile('coach-photos', file);
    setEditing(prev => ({ ...prev, photo_url: file_url }));
    setUploadingPhoto(false);
  };

  useEffect(() => {
    loadCoaches();
    profileRepo.list().then(setUsers);
  }, []);
  const loadCoaches = () => coachRepo.list('display_order').then(setCoaches);

  // Same email can map to multiple accounts/profiles (e.g. Google + password
  // sign-in). Gather every profile row sharing an email so link/unlink stamps
  // all of them — otherwise the coach portal breaks on the "other" account.
  const profilesForEmail = async (email, seed) => {
    const norm = (s) => (s || '').trim().toLowerCase();
    const target = norm(email);
    const map = new Map();
    if (seed) map.set(seed.id, seed);
    if (!target) return [...map.values()];
    // Index-free: match against the already-loaded profile list (no Appwrite
    // equality query, which would need an index on profiles.email).
    for (const u of users) if (norm(u.email) === target) map.set(u.id, u);
    // Re-pull the full list in case local state is stale.
    try {
      const all = await profileRepo.list();
      for (const p of all) if (norm(p.email) === target) map.set(p.id, p);
    } catch (err) {
      console.warn('profilesForEmail: list failed', err);
    }
    return [...map.values()];
  };

  const linkUser = async (userId) => {
    let seed = users.find(u => u.id === userId);
    if (!seed) seed = await profileRepo.get(userId).catch(() => null);
    if (!seed) { toast.error('Could not load that account.'); return; }

    const email = (seed.email || '').trim();
    const matches = await profilesForEmail(email, seed);
    const coach_id = linkDialog.id;

    for (const p of matches) {
      const upd = { coach_id };
      if (p.role !== 'admin' && p.role !== 'super_admin') upd.role = 'coach';
      await profileRepo.updateById(p.id, upd);
    }
    const ids = new Set(matches.map(p => p.id));
    setUsers(prev => prev.map(u => ids.has(u.id)
      ? { ...u, coach_id, ...(u.role !== 'admin' && u.role !== 'super_admin' ? { role: 'coach' } : {}) }
      : u));

    await logAdminAction({
      actor: user,
      action: 'coach.link_user',
      entityType: 'User',
      entityId: userId,
      before: { coach_id: seed.coach_id || null, role: seed.role || 'user' },
      after: { coach_id },
      metadata: {
        coach_id,
        coach_name: `${linkDialog.first_name || ''} ${linkDialog.last_name || ''}`.trim(),
        target_email: email,
        profiles_updated: matches.length,
      },
    });
    toast.success(matches.length > 1
      ? `Linked as coach (${matches.length} profiles for this email)`
      : 'User linked as coach');
    setLinkDialog(null);
  };

  // Manual link: admin types an email, we find that profile (even if it's
  // beyond the 500-row list cap) and link it. Requires the person to already
  // have an account — the browser SDK can't create accounts.
  const linkByEmail = async () => {
    const raw = linkEmail.trim();
    if (!raw) return;
    setLinkingEmail(true);
    try {
      const lower = raw.toLowerCase();
      let u = users.find((x) => (x.email || '').toLowerCase() === lower);
      if (!u) {
        const found = await profileRepo.filter({ email: raw }).catch(() => []);
        u = found[0] || (await profileRepo.filter({ email: lower }).catch(() => []))[0];
      }
      if (!u) {
        toast.error('No account found with that email. They must create an account first, then you can link it.');
        return;
      }
      await linkUser(u.id);
      setLinkEmail('');
    } finally {
      setLinkingEmail(false);
    }
  };

  // Server-validated path: adminOps.linkCoachAccount links the coach to the
  // account's profile, sets the `coach` label and writes the audit log. This
  // replaces the old email-token flow (coach_link_requests is server-only now).
  const sendVerifyLink = async () => {
    const raw = linkEmail.trim();
    if (!raw || !linkDialog) return;
    setSendingVerify(true);
    try {
      const lower = raw.toLowerCase();
      let u = users.find((x) => (x.email || '').toLowerCase() === lower);
      if (!u) {
        const found = await profileRepo.filter({ email: raw }).catch(() => []);
        u = found[0] || (await profileRepo.filter({ email: lower }).catch(() => []))[0];
      }
      if (!u) {
        toast.error('No account found with that email. They must create an account first, then you can link it.');
        return;
      }
      await coachRepo.adminLinkAccount(linkDialog.id, u.id);
      toast.success(`Coach access linked for ${raw}`);
      setLinkEmail('');
      setLinkDialog(null);
    } catch (err) {
      toast.error(err?.message || 'Could not link that account.');
    } finally {
      setSendingVerify(false);
    }
  };

  // Unlink: clear the profile's coach_id and drop the coach role back to
  // 'user' (admins keep their role). The coach profile itself is untouched.
  const unlinkUser = async (coach) => {
    const linked = users.find(u => u.coach_id === coach.id);
    if (!linked) return;
    const name = [linked.first_name, linked.last_name].filter(Boolean).join(' ').trim() || linked.email;
    const ok = await confirm({
      title: 'Unlink account?',
      description: `${name} will be unlinked from ${coach.first_name || ''} ${coach.last_name || ''}`.trim()
        + ' and lose coach access. The coach profile is kept.',
      confirmLabel: 'Unlink',
      variant: 'destructive',
    });
    if (!ok) return;

    // Clear the link on every profile sharing this email (duplicate accounts).
    const matches = await profilesForEmail(linked.email, linked);
    for (const p of matches) {
      const keepAdmin = p.role === 'admin' || p.role === 'super_admin';
      await profileRepo.updateById(p.id, { coach_id: null, ...(keepAdmin ? {} : { role: 'user' }) });
    }
    const ids = new Set(matches.map(p => p.id));
    setUsers(prev => prev.map(u => ids.has(u.id)
      ? { ...u, coach_id: null, ...(u.role === 'admin' || u.role === 'super_admin' ? {} : { role: 'user' }) }
      : u));

    await logAdminAction({
      actor: user,
      action: 'coach.unlink_user',
      entityType: 'User',
      entityId: linked.id,
      before: { coach_id: linked.coach_id || null, role: linked.role || 'user' },
      after: { coach_id: null },
      metadata: {
        coach_id: coach.id,
        coach_name: `${coach.first_name || ''} ${coach.last_name || ''}`.trim(),
        target_email: linked.email,
        profiles_updated: matches.length,
      },
    });
    toast.success(matches.length > 1
      ? `Account unlinked (${matches.length} profiles for this email)`
      : 'Account unlinked');
  };

  const save = async () => {
    const isUpdate = !!editing.id;
    const previous = isUpdate ? coaches.find(c => c.id === editing.id) : null;
    const willActivate = editing.is_active === true && (!isUpdate || previous?.is_active === false);
    if (willActivate) {
      const linkedProfile = users.find((u) => u.coach_id === editing.id);
      if (!isUpdate || !linkedProfile) {
        toast.error('Coach activation requires a linked coach account with signed legal documents.');
        return;
      }
      const legalStatus = await getLegalPacketStatus({
        user: linkedProfile,
        signerRole: 'coach',
        coachId: editing.id,
      });
      if (!legalStatus.complete) {
        toast.error(legalStatus.hasTemplates
          ? 'Coach legal packet is incomplete. Keep this coach inactive until all required documents are signed.'
          : 'Coach legal templates are not published. Seed legal templates before activating coaches.');
        return;
      }
    }

    if (isUpdate) {
      await coachRepo.update(editing.id, editing);
    } else {
      const created = await coachRepo.create(editing);
      // Capture the new id for audit metadata.
      if (created?.id) editing.id = created.id;
    }

    if (isUpdate && previous && previous.is_active !== editing.is_active) {
      await logAdminAction({
        actor: user,
        action: editing.is_active ? 'coach.activate' : 'coach.deactivate',
        entityType: 'Coach',
        entityId: editing.id,
        before: { is_active: previous.is_active },
        after: { is_active: editing.is_active },
        metadata: {
          coach_name: `${editing.first_name || ''} ${editing.last_name || ''}`.trim(),
        },
      });
    }
    await logAdminAction({
      actor: user,
      action: isUpdate ? 'coach.update' : 'coach.create',
      entityType: 'Coach',
      entityId: editing.id || '',
      before: isUpdate ? {
        first_name: previous?.first_name,
        last_name: previous?.last_name,
        county: previous?.county,
        is_active: previous?.is_active,
        is_head_coach: previous?.is_head_coach,
        platform_fee_type: previous?.platform_fee_type,
        platform_fee_value: previous?.platform_fee_value,
      } : undefined,
      after: {
        first_name: editing.first_name,
        last_name: editing.last_name,
        county: editing.county,
        is_active: editing.is_active,
        is_head_coach: editing.is_head_coach,
        platform_fee_type: editing.platform_fee_type,
        platform_fee_value: editing.platform_fee_value,
      },
    });

    toast.success('Coach saved');
    setOpen(false);
    loadCoaches();
  };

  const remove = async (coach) => {
    const fullName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim();
    const linkedUser = users.find(u => u.coach_id === coach.id);
    const consequences = [
      'The coach profile will be permanently removed.',
      linkedUser ? `The linked user (${linkedUser.email}) will be unlinked from this coach.` : null,
      'Existing sessions referencing this coach will keep their historical data.',
    ].filter(Boolean);
    const ok = await confirm({
      title: 'Delete coach?',
      description: `This will permanently delete ${fullName || 'this coach'}.`,
      consequences,
      confirmLabel: 'Delete coach',
      variant: 'destructive',
      requireTyped: fullName || 'DELETE',
    });
    if (!ok) return;

    try {
      if (linkedUser) {
        await profileRepo.updateById(linkedUser.id, { coach_id: null });
        setUsers(prev => prev.map(u => u.id === linkedUser.id ? { ...u, coach_id: null } : u));
      }
      await coachRepo.delete(coach.id);
      await logAdminAction({
        actor: user,
        action: 'coach.delete',
        entityType: 'Coach',
        entityId: coach.id,
        before: {
          first_name: coach.first_name,
          last_name: coach.last_name,
          email: coach.email,
          county: coach.county,
          is_active: coach.is_active,
          is_head_coach: coach.is_head_coach,
        },
        metadata: {
          coach_name: fullName,
          unlinked_user_id: linkedUser?.id,
          unlinked_user_email: linkedUser?.email,
        },
      });
      toast.success('Coach deleted');
      loadCoaches();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete coach');
    }
  };

  const addSpec = () => {
    if (specInput.trim()) {
      setEditing({ ...editing, specializations: [...(editing.specializations || []), specInput.trim()] });
      setSpecInput('');
    }
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">MANAGE COACHES</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing({...emptyCoach})} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
                <Plus className="w-4 h-4 mr-2" /> Add Coach
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-card border-border">
              <DialogHeader><DialogTitle className="font-display tracking-wider">{editing?.id ? 'EDIT COACH' : 'ADD COACH'}</DialogTitle></DialogHeader>
              {editing && (
                <div className="space-y-4 mt-4">
                  {/* Profile Photo */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center">
                      {editing.photo_url ? (
                        <img src={editing.photo_url} alt="Coach" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-display text-xl text-muted-foreground/40">{editing.first_name?.[0]}{editing.last_name?.[0]}</span>
                      )}
                    </div>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                      <Button type="button" variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs pointer-events-none">
                        <Upload className="w-3 h-3 mr-1" />{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                      </Button>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">First Name</Label>
                      <Input value={editing.first_name} onChange={e => setEditing({...editing, first_name: e.target.value})} className="bg-secondary border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Last Name</Label>
                      <Input value={editing.last_name} onChange={e => setEditing({...editing, last_name: e.target.value})} className="bg-secondary border-border mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Email</Label>
                      <Input value={editing.email} onChange={e => setEditing({...editing, email: e.target.value})} className="bg-secondary border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Phone</Label>
                      <Input value={editing.phone} onChange={e => setEditing({...editing, phone: e.target.value})} className="bg-secondary border-border mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">County</Label>
                    <Select value={editing.county} onValueChange={v => setEditing({...editing, county: v})}>
                      <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Oakland">Oakland</SelectItem>
                        <SelectItem value="Macomb">Macomb</SelectItem>
                        <SelectItem value="Wayne">Wayne</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Training Area</Label>
                    <Input value={editing.training_area || ''} onChange={e => setEditing({...editing, training_area: e.target.value})} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Bio</Label>
                    <Textarea value={editing.bio || ''} onChange={e => setEditing({...editing, bio: e.target.value})} className="bg-secondary border-border mt-1" rows={3} />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Quote</Label>
                    <Input value={editing.quote || ''} onChange={e => setEditing({...editing, quote: e.target.value})} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-display tracking-wider uppercase text-xs">Specializations</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={specInput} onChange={e => setSpecInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSpec())} className="bg-secondary border-border" placeholder="Add specialization" />
                      <Button type="button" onClick={addSpec} variant="outline" size="sm">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {editing.specializations?.map((s, i) => (
                        <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setEditing({...editing, specializations: editing.specializations.filter((_, idx) => idx !== i)})}>{s} ×</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3">
                    <Label className="font-display tracking-wider uppercase text-xs">Stripe Connect</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Coach payouts are managed through Stripe Connect from the coach Earnings page.
                    </p>
                    <p className="text-sm text-foreground mt-2 truncate">
                      {editing.stripe_account_id || 'No connected account yet'}
                    </p>
                  </div>
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <Label className="font-display tracking-wider uppercase text-xs">Platform Fee</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: 'none', label: 'None' },
                        { v: 'percent', label: 'Percent' },
                        { v: 'fixed', label: 'Fixed $' },
                      ].map(opt => {
                        const active = (editing.platform_fee_type || 'none') === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => setEditing({ ...editing, platform_fee_type: opt.v, platform_fee_value: opt.v === 'none' ? 0 : (editing.platform_fee_value || 0) })}
                            className={`px-3 py-2 text-xs font-display tracking-wider uppercase rounded border transition-colors ${active ? 'bg-accent text-accent-foreground border-accent' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {(editing.platform_fee_type === 'percent' || editing.platform_fee_type === 'fixed') && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm w-4">{editing.platform_fee_type === 'fixed' ? '$' : ''}</span>
                        <Input
                          type="number"
                          min="0"
                          max={editing.platform_fee_type === 'percent' ? 100 : undefined}
                          step={editing.platform_fee_type === 'percent' ? 1 : 0.5}
                          value={editing.platform_fee_value ?? 0}
                          onChange={e => setEditing({ ...editing, platform_fee_value: Number(e.target.value) })}
                          className="bg-secondary border-border"
                        />
                        <span className="text-muted-foreground text-sm w-4">{editing.platform_fee_type === 'percent' ? '%' : ''}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{describeFee(editing)}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2"><Switch checked={editing.is_active} onCheckedChange={v => setEditing({...editing, is_active: v})} /><Label className="text-sm">Active</Label></div>
                    <div className="flex items-center gap-2"><Switch checked={editing.is_head_coach} onCheckedChange={v => setEditing({...editing, is_head_coach: v})} /><Label className="text-sm">Head Coach</Label></div>
                  </div>
                  <Button onClick={save} className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">Save Coach</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {visibleCoaches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No coaches in this category yet.</div>
          ) : visibleCoaches.map(coach => (
            <div key={coach.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <span className="font-display text-sm text-muted-foreground">{coach.first_name?.[0]}{coach.last_name?.[0]}</span>
                </div>
                <div>
                  <p className="font-display tracking-wider text-foreground">{coach.first_name} {coach.last_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {coach.county && (
                      <span className="text-xs text-accent flex items-center gap-1"><MapPin className="w-3 h-3" />{coach.county}</span>
                    )}
                    {coach.is_head_coach && <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">Head Coach</Badge>}
                    {!coach.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const linked = users.find(u => u.coach_id === coach.id);
                  const linkedName = linked
                    ? ([linked.first_name, linked.last_name].filter(Boolean).join(' ').trim() || linked.email)
                    : '';
                  return linked ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-accent font-display tracking-wide">Linked: {linkedName}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-display tracking-wider uppercase h-7 hover:text-red-500 hover:border-red-500/50"
                        onClick={() => unlinkUser(coach)}
                      >
                        Unlink
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs font-display tracking-wider uppercase h-7" onClick={() => setLinkDialog(coach)}>
                      Link User
                    </Button>
                  );
                })()}
                <Button size="sm" variant="ghost" onClick={() => { setEditing({...coach}); setOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(coach)}
                  className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  aria-label="Delete coach"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={!!linkDialog}
        onOpenChange={(o) => { if (!o) { setLinkDialog(null); setLinkSearch(''); setLinkShowAll(false); setLinkEmail(''); } }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-display tracking-wider">LINK USER TO {linkDialog?.first_name?.toUpperCase()} {linkDialog?.last_name?.toUpperCase()}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Select the user account that belongs to this coach. Their role will be set to "coach".</p>
          <Input
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="bg-secondary border-border mb-2"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3 cursor-pointer">
            <input type="checkbox" checked={linkShowAll} onChange={(e) => setLinkShowAll(e.target.checked)} />
            Show accounts already linked to a coach
          </label>
          {(() => {
            const q = linkSearch.trim().toLowerCase();
            const list = users
              .filter((u) => linkShowAll || !u.coach_id || u.coach_id === linkDialog?.id)
              .filter((u) => {
                if (!q) return true;
                const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
                return name.includes(q) || (u.email || '').toLowerCase().includes(q);
              });
            return (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {list.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No matching accounts. Try “Show accounts already linked”.
                  </p>
                )}
                {list.map((u) => {
                  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
                  const linkedElsewhere = u.coach_id && u.coach_id !== linkDialog?.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => linkUser(u.id)}
                      className="w-full text-left p-3 rounded-lg border border-border bg-secondary hover:border-accent/50 transition-all"
                    >
                      <p className="font-display tracking-wide text-sm text-foreground">
                        {name || '(no name set)'}
                        {u.role && u.role !== 'user' && (
                          <span className="ml-2 text-[10px] uppercase text-accent">{u.role}</span>
                        )}
                        {linkedElsewhere && (
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground">already linked</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email || 'no email on profile'}</p>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div className="border-t border-border mt-4 pt-4">
            <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-2">
              Or link manually by email
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') linkByEmail(); }}
                placeholder="coach@example.com"
                className="bg-secondary border-border"
              />
              <Button
                onClick={linkByEmail}
                disabled={linkingEmail || sendingVerify || !linkEmail.trim()}
                variant="outline"
                className="font-display tracking-wider uppercase text-xs shrink-0 border-border"
              >
                {linkingEmail ? 'Linking…' : 'Link now'}
              </Button>
              <Button
                onClick={sendVerifyLink}
                disabled={sendingVerify || linkingEmail || !linkEmail.trim()}
                className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs shrink-0"
              >
                {sendingVerify ? 'Linking…' : 'Server link'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              <strong>Link now</strong>: instant, for an existing account.{' '}
              <strong>Server link</strong>: links through the audited admin
              function (sets the coach label on the account).
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Tip: the coach should verify their email (a verification link is
              sent at sign-up) — coach access only auto-applies on a verified account.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
