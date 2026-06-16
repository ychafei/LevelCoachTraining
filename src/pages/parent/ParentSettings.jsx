import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  FilePenLine,
  KeyRound,
  Loader2,
  PencilLine,
  Save,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { fullName, initialsOf } from '@/lib/displayName';
import { useFamily } from '@/features/parent/useFamily';
import ChildForm from '@/features/parent/ChildForm';
import LegalSignaturePanel from '@/components/legal/LegalSignaturePanel';
import { SignedAgreementsList } from '@/features/athlete/AthleteDocuments';
import { ageFromDob } from '@/features/athlete/portalShared';

const SECTIONS = [
  { id: 'account', label: 'Account', sub: 'Name, photo & authority', icon: UserCog },
  { id: 'children', label: 'Children', sub: 'Manage your athletes', icon: Users },
  { id: 'notifications', label: 'Notifications', sub: 'Email preferences', icon: Bell },
  { id: 'security', label: 'Security', sub: 'Password', icon: KeyRound },
  { id: 'legal', label: 'Legal documents', sub: 'Guardian packets', icon: FilePenLine },
];

const NOTIFICATION_PREFS = [
  { key: 'booking_updates', label: 'Booking updates', sub: 'New bookings, cancellations, and reschedules for your athletes.' },
  { key: 'session_reminders', label: 'Session reminders', sub: 'Reminders ahead of your athletes’ upcoming sessions.' },
  { key: 'messages', label: 'New messages', sub: 'When a coach messages you or one of your athletes.' },
  { key: 'payments', label: 'Payments & receipts', sub: 'Payment receipts and credit updates.' },
  { key: 'marketing', label: 'Product news', sub: 'Occasional feature announcements.', defaultOff: true },
  { key: 'marketing_sms', label: 'Marketing SMS/text', sub: 'Optional promotional texts. Consent is not required for purchase or platform use.', defaultOff: true },
];

const RELATIONSHIPS = ['Parent', 'Guardian', 'Grandparent', 'Other family'];

function Card({ title, icon: Icon, blurb, children, action }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />}
            <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h2>
          </div>
          {blurb && <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function parseNotificationPrefs(raw) {
  let prefs = raw;
  if (typeof prefs === 'string') {
    try { prefs = JSON.parse(prefs); } catch { prefs = null; }
  }
  const out = {};
  for (const item of NOTIFICATION_PREFS) {
    const stored = prefs?.[item.key];
    out[item.key] = typeof stored === 'boolean' ? stored : !item.defaultOff;
  }
  return out;
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSection({ user, refetchUser }) {
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
    parent_relationship: user?.parent_relationship || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      phone: user?.phone || '',
      parent_relationship: user?.parent_relationship || '',
    });
  }, [user?.first_name, user?.last_name, user?.phone, user?.parent_relationship]);

  const dirty = form.first_name !== (user?.first_name || '')
    || form.last_name !== (user?.last_name || '')
    || form.phone !== (user?.phone || '')
    || form.parent_relationship !== (user?.parent_relationship || '');

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      await auth.updateCurrentUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        parent_relationship: form.parent_relationship.trim(),
      });
      await refetchUser();
      toast.success('Account details saved.');
    } catch (err) {
      toast.error(err?.message || 'Could not save your account details.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url: photo_url } = await storage.uploadFile('coach-photos', file);
      await auth.updateCurrentUser({ photo_url });
      await refetchUser();
      toast.success('Photo updated.');
    } catch (err) {
      toast.error(err?.message || 'Photo upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <Card title="Account" icon={UserCog} blurb="Your contact details and how coaches reach you.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary">
          {user?.photo_url ? (
            <img src={user.photo_url} alt="Your profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground/60">{initialsOf(user)}</span>
          )}
        </div>
        <div>
          <label className="cursor-pointer">
            <span className="sr-only">Upload profile photo</span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} disabled={uploading} />
            <Button type="button" variant="outline" size="sm" className="pointer-events-none text-xs">
              {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
              {uploading ? 'Uploading…' : 'Upload photo'}
            </Button>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">JPG or PNG. A clear photo helps coaches recognize you.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="acct-first">First name *</Label>
          <Input id="acct-first" value={form.first_name} maxLength={100} onChange={(e) => set('first_name', e.target.value)} className="mt-1 bg-background" autoComplete="given-name" />
        </div>
        <div>
          <Label htmlFor="acct-last">Last name *</Label>
          <Input id="acct-last" value={form.last_name} maxLength={100} onChange={(e) => set('last_name', e.target.value)} className="mt-1 bg-background" autoComplete="family-name" />
        </div>
        <div>
          <Label htmlFor="acct-phone">Phone</Label>
          <Input id="acct-phone" type="tel" value={form.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} className="mt-1 bg-background" autoComplete="tel" placeholder="So coaches can reach you about a session" />
        </div>
        <div>
          <Label htmlFor="acct-relationship">Your relationship to your athletes</Label>
          <Select value={form.parent_relationship || undefined} onValueChange={(v) => set('parent_relationship', v)}>
            <SelectTrigger id="acct-relationship" className="mt-1 bg-background">
              <SelectValue placeholder="Select relationship" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIPS.map((rel) => (
                <SelectItem key={rel} value={rel}>{rel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="acct-email">Email</Label>
          <Input id="acct-email" value={user?.email || ''} disabled className="mt-1 bg-secondary/40 text-muted-foreground" />
          <p className="mt-1 text-xs text-muted-foreground">Your sign-in email can&apos;t be changed here. Contact support if it needs to change.</p>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Guardian authority</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              When you sign your athletes&apos; required documents you attest that you are their parent or legal
              guardian with authority to act on their behalf. Each attestation is recorded with your signature
              on the matching agreement.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving || !dirty} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save account'}
        </Button>
      </div>
    </Card>
  );
}

// ── Children quick-manage ──────────────────────────────────────────────────────

function ChildrenSection({ family }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingChild, setEditingChild] = useState(null);

  const openAdd = () => { setEditingChild(null); setFormOpen(true); };
  const openEdit = (child) => { setEditingChild(child); setFormOpen(true); };

  return (
    <Card
      title="Children"
      icon={Users}
      blurb="Edit your athletes' details, emergency contact, health notes, and what they can do on the platform."
      action={(
        <Button size="sm" onClick={openAdd} className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90">
          <Users className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add child
        </Button>
      )}
    >
      {family.loading ? (
        <div className="space-y-2" role="status" aria-label="Loading children">
          {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-secondary/50" />)}
        </div>
      ) : family.children.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/40 p-6 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">No athletes yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add your child to manage their training and sign their documents.
          </p>
          <Button size="sm" onClick={openAdd} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">Add your first child</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {family.children.map((child) => {
            const age = ageFromDob(child.dob);
            const link = family.linkByAthleteId[child.id];
            return (
              <li key={child.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {[child.first_name, child.last_name].filter(Boolean).join(' ') || 'Athlete'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {age !== null ? `${age} years old` : 'Age not set'}
                    {link && ` · ${[link.can_book !== false && 'Booking', link.can_pay !== false && 'Payments', link.can_message !== false && 'Messaging'].filter(Boolean).join(', ') || 'No permissions'}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(child)}>
                  <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Edit
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Open an athlete from the <Link to="/parent" className="text-accent hover:underline">Family</Link> tab to manage permissions and view their sessions and training.
      </p>

      <ChildForm open={formOpen} onOpenChange={setFormOpen} child={editingChild} onSaved={family.refresh} />
    </Card>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────────

function NotificationsSection({ user, refetchUser }) {
  const [prefs, setPrefs] = useState(() => parseNotificationPrefs(user?.notification_prefs));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setPrefs(parseNotificationPrefs(user?.notification_prefs));
    setDirty(false);
  }, [user?.notification_prefs]);

  const toggle = (key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
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
      toast.error(err?.message || 'Could not save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Notifications" icon={Bell} blurb="Which emails you receive. Transactional emails required for bookings always send.">
      <ul className="divide-y divide-border">
        {NOTIFICATION_PREFS.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <Label htmlFor={`pref-${item.key}`} className="text-sm font-medium text-foreground">{item.label}</Label>
              <p className="text-xs text-muted-foreground">{item.sub}</p>
            </div>
            <Switch id={`pref-${item.key}`} checked={prefs[item.key]} onCheckedChange={(v) => toggle(item.key, v)} aria-label={item.label} />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving || !dirty} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </Card>
  );
}

// ── Security ───────────────────────────────────────────────────────────────────

function SecuritySection({ user }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const sendReset = async () => {
    if (!user?.email) {
      toast.error('No email on file for this account.');
      return;
    }
    setSending(true);
    try {
      await auth.sendPasswordRecovery(user.email);
      setSent(true);
      toast.success('Password reset email sent. Check your inbox.');
    } catch (err) {
      toast.error(err?.message || 'Could not send the reset email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title="Security" icon={KeyRound} blurb="Keep your family account safe.">
      <div className="rounded-md border border-border bg-background/40 p-4">
        <p className="text-sm font-semibold text-foreground">Change your password</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email a secure link to <span className="font-medium text-foreground">{user?.email || 'your account'}</span> so you can set a new password.
        </p>
        <Button onClick={sendReset} disabled={sending} variant="outline" className="mt-3 text-sm">
          {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {sending ? 'Sending…' : sent ? 'Resend reset link' : 'Send password reset link'}
        </Button>
        {sent && (
          <p className="mt-2 text-xs text-green-600">
            Sent. The link expires shortly for your security — didn&apos;t get it? Check spam, then resend.
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Legal documents ────────────────────────────────────────────────────────────

function LegalSection({ user, family }) {
  const [athleteId, setAthleteId] = useState('');

  useEffect(() => {
    if (!athleteId && family.children.length > 0) setAthleteId(family.children[0].id);
  }, [athleteId, family.children]);

  const selected = family.children.find((child) => child.id === athleteId) || null;

  return (
    <div className="space-y-4">
      <Card title="Legal documents" icon={FilePenLine} blurb="Guardian documents are signed per athlete. Choose which child you're signing for.">
        {family.loading ? (
          <div className="h-9 w-full max-w-sm animate-pulse rounded-md bg-secondary/50" aria-hidden="true" />
        ) : family.children.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background/40 p-6 text-center">
            <FilePenLine className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Add a child first</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Guardian documents are bound to a specific athlete. Add your child, then sign their packet here.
            </p>
            <Button asChild size="sm" className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/parent/settings?section=children">Add a child</Link>
            </Button>
          </div>
        ) : (
          <div className="max-w-sm">
            <Label htmlFor="legal-athlete">Signing for</Label>
            <Select value={athleteId} onValueChange={setAthleteId}>
              <SelectTrigger id="legal-athlete" className="mt-1 bg-background">
                <SelectValue placeholder="Choose an athlete" />
              </SelectTrigger>
              <SelectContent>
                {family.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {[child.first_name, child.last_name].filter(Boolean).join(' ') || 'Athlete'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Card>

      {selected && (
        <LegalSignaturePanel
          key={selected.id}
          signerRole="guardian"
          athleteId={selected.id}
          title={`Guardian legal packet — ${[selected.first_name, selected.last_name].filter(Boolean).join(' ') || 'Athlete'}`}
          description="Guardian authority, minor participation, medical, media, and safety documents for this athlete. A complete packet is required before booking for them."
        />
      )}

      <SignedAgreementsList user={user} athleteNamesById={family.childNamesById} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ParentSettings() {
  const { user, refetchUser } = useAuth();
  const family = useFamily(user);
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('section') || '';
  const activeSection = SECTIONS.some((s) => s.id === requested) ? requested : 'account';

  const switchSection = (id) => {
    setSearchParams(id === 'account' ? {} : { section: id }, { replace: true });
  };

  const sectionMeta = useMemo(
    () => SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0],
    [activeSection],
  );

  return (
    <div className="py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link to="/parent" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to family
        </Link>
        <header className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Parent settings</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.01em] text-foreground">
            {fullName(user)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account, your athletes, notifications, security, and signed documents.
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
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

          <div className="lg:col-span-3" aria-label={sectionMeta.label}>
            {activeSection === 'account' && <AccountSection user={user} refetchUser={refetchUser} />}
            {activeSection === 'children' && <ChildrenSection family={family} />}
            {activeSection === 'notifications' && <NotificationsSection user={user} refetchUser={refetchUser} />}
            {activeSection === 'security' && <SecuritySection user={user} />}
            {activeSection === 'legal' && <LegalSection user={user} family={family} />}
          </div>
        </div>
      </div>
    </div>
  );
}
