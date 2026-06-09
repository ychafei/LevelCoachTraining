import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { coachRepo, stripeConnectedAccountRepo } from '@/api/repo';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  Lock,
  MapPin,
  MoreVertical,
  Plus,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

const COACH_PROFILE_UPDATED_EVENT = 'levelcoach:coach-profile-updated';

const settingsSections = [
  { id: 'account', label: 'Account', sub: 'Manage your personal info', icon: UserRound },
  { id: 'profile', label: 'Coach Profile', sub: 'Edit your public profile', icon: UserRound },
  { id: 'notifications', label: 'Notifications', sub: 'Control your alerts', icon: Bell },
  { id: 'calendar', label: 'Calendar & Availability', sub: 'Set your availability', icon: CalendarDays },
  { id: 'payments', label: 'Payments', sub: 'Payment methods & payouts', icon: CreditCard },
  { id: 'privacy', label: 'Privacy & Safety', sub: 'Control your privacy', icon: ShieldCheck },
  { id: 'security', label: 'Security', sub: 'Password & 2FA', icon: Lock },
];

const DEFAULT_SPECIALIZATIONS = [
  'Speed & Agility',
  'Strength & Conditioning',
  'Soccer Skills',
  '1-on-1 Sessions',
  'Small Group Training',
];

const DEFAULT_PROGRAMS = [
  { id: 'intro', name: 'Intro Session', duration: '30', price: '49' },
  { id: 'private', name: 'Private Session', duration: '60', price: '99' },
  { id: 'group', name: 'Small Group', duration: '60', price: '69' },
];

function splitName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || '',
  };
}

function displayNameFor(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.full_name
    || user?.name
    || 'Demo Coach';
}

function initialsFor(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function coachDisplayName(coach, fallback = 'Demo Coach') {
  return [coach?.first_name, coach?.last_name].filter(Boolean).join(' ')
    || coach?.name
    || coach?.full_name
    || fallback;
}

function toProfileDraft(coach, fallbackEmail = '') {
  return {
    displayName: coachDisplayName(coach),
    email: coach?.email || fallbackEmail,
    training_area: coach?.training_area || 'Metro Detroit speed, strength, and skills development',
    bio: coach?.bio || 'I help athletes build sharper movement, stronger habits, and more confidence through structured private training.',
    quote: coach?.quote || 'Progress you can measure. Confidence you can feel.',
    specializations: Array.isArray(coach?.specializations) && coach.specializations.length
      ? coach.specializations
      : DEFAULT_SPECIALIZATIONS,
    is_active: coach?.is_active !== false,
  };
}

function profilePayloadFromDraft(draft) {
  const nameParts = splitName(draft.displayName);
  return {
    first_name: nameParts.first_name || 'Demo',
    last_name: nameParts.last_name || 'Coach',
    email: draft.email,
    training_area: draft.training_area,
    bio: draft.bio,
    quote: draft.quote,
    specializations: draft.specializations || [],
    is_active: draft.is_active !== false,
  };
}

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {Icon && <Icon className="h-5 w-5 text-slate-800" />}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function StatusPill({ children, tone = 'green' }) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold ${toneClass}`}>
      {children}
    </span>
  );
}

function SectionButton({ section, active, onClick }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-4 rounded-lg px-4 py-4 text-left transition ${
        active
          ? 'bg-blue-50 text-blue-700 shadow-sm'
          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'text-blue-600' : 'text-slate-700'}`} />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{section.label}</span>
        <span className={`mt-1 block text-xs ${active ? 'text-blue-700/75' : 'text-slate-500'}`}>
          {section.sub}
        </span>
      </span>
    </button>
  );
}

function PreferenceRow({ title, subtitle, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-950">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="data-[state=checked]:bg-blue-600" />
    </div>
  );
}

function CalendarConnection({ icon: Icon, name, email, connected, onMenu }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-950">{name}</p>
          {connected && <StatusPill>Connected</StatusPill>}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{email}</p>
      </div>
      <button
        type="button"
        onClick={onMenu}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        aria-label={`Manage ${name}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </div>
  );
}

function CoachAvatar({ src, initials, size = 'md', alt = 'Coach profile' }) {
  const sizeClass = {
    sm: 'h-14 w-14 text-sm',
    md: 'h-24 w-24 text-xl',
    lg: 'h-32 w-32 text-2xl',
  }[size];

  return (
    <span className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 font-bold text-slate-600`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export default function CoachSettings() {
  const { user, refetchUser } = useAuth();
  const fileInputRef = useRef(null);
  const [activeSection, setActiveSection] = useState('profile');
  const [coach, setCoach] = useState(null);
  const [stripeAccount, setStripeAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [identity, setIdentity] = useState({
    fullName: '',
    email: '',
    phone: '',
  });
  const [profileDraft, setProfileDraft] = useState(() => toProfileDraft(null));
  const [specializationInput, setSpecializationInput] = useState('');
  const [programs, setPrograms] = useState(DEFAULT_PROGRAMS);
  const [notifications, setNotifications] = useState({
    bookingRequests: true,
    sessionReminders: true,
    newMessages: true,
    payments: true,
    marketing: false,
  });
  const [bookingPrefs, setBookingPrefs] = useState({
    introDuration: '30',
    bufferBefore: '15',
    bufferAfter: '15',
    requireApproval: true,
  });
  const [securityPrefs, setSecurityPrefs] = useState({
    twoFactorEnabled: true,
  });

  const displayName = useMemo(() => displayNameFor(user), [user]);
  const initials = initialsFor(displayName);
  const coachEmail = coach?.email || user?.email || 'demo.coach@levelcoach.training';
  const avatarUrl = coach?.photo_url || user?.photo_url || '';
  const stripeReady = !!stripeAccount && stripeAccount.charges_enabled && stripeAccount.payouts_enabled;
  const previewName = profileDraft.displayName || displayName;
  const previewInitials = initialsFor(previewName);
  const previewTags = (profileDraft.specializations || []).slice(0, 3);

  useEffect(() => {
    setIdentity({
      fullName: displayNameFor(user),
      email: user?.email || '',
      phone: user?.phone || '',
    });
    if (!coach) {
      setProfileDraft((current) => ({
        ...current,
        displayName: displayNameFor(user),
        email: user?.email || current.email,
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!user?.coach_id) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const [coachRow, stripeRows] = await Promise.all([
          coachRepo.get(user.coach_id).catch(() => null),
          stripeConnectedAccountRepo
            .filter({ owner_type: 'coach', owner_id: user.coach_id })
            .catch(() => []),
        ]);
        if (cancelled) return;
        setCoach(coachRow);
        setProfileDraft(toProfileDraft(coachRow, user?.email || ''));
        setStripeAccount(stripeRows?.[0] || null);
      } catch (err) {
        console.error('CoachSettings load failed', err);
        toast.error('Could not load coach settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.coach_id]);

  const saveIdentity = async () => {
    setSaving(true);
    try {
      const parsedName = splitName(identity.fullName);
      await auth.updateCurrentUser({
        ...parsedName,
        phone: identity.phone,
      });
      await refetchUser();
      toast.success('Settings saved');
    } catch (err) {
      console.error('CoachSettings save failed', err);
      toast.error('Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (nextDraft = profileDraft, { silent = false } = {}) => {
    if (!coach) return null;
    setSavingProfile(true);
    try {
      const payload = profilePayloadFromDraft(nextDraft);
      const updated = await coachRepo.update(coach.id, payload);
      const nextCoach = { ...coach, ...updated, ...payload };
      setCoach(nextCoach);
      setProfileDraft(toProfileDraft(nextCoach, user?.email || ''));
      if (!silent) toast.success('Coach profile saved');
      return nextCoach;
    } catch (err) {
      console.error('CoachSettings profile save failed', err);
      if (!silent) toast.error('Could not save coach profile.');
      return null;
    } finally {
      setSavingProfile(false);
    }
  };

  const updateProfileDraft = (patch) => {
    setProfileDraft((current) => ({ ...current, ...patch }));
  };

  const addSpecialization = async () => {
    const value = specializationInput.trim();
    if (!value) return;
    const nextSpecializations = Array.from(new Set([...(profileDraft.specializations || []), value]));
    const nextDraft = { ...profileDraft, specializations: nextSpecializations };
    setSpecializationInput('');
    setProfileDraft(nextDraft);
    await saveProfile(nextDraft, { silent: true });
  };

  const removeSpecialization = async (value) => {
    const nextDraft = {
      ...profileDraft,
      specializations: (profileDraft.specializations || []).filter((item) => item !== value),
    };
    setProfileDraft(nextDraft);
    await saveProfile(nextDraft, { silent: true });
  };

  const updateProgram = (id, patch) => {
    setPrograms((current) => current.map((program) => (
      program.id === id ? { ...program, ...patch } : program
    )));
  };

  const addProgram = () => {
    setPrograms((current) => [
      ...current,
      { id: `program-${Date.now()}`, name: 'New Program', duration: '60', price: '79' },
    ]);
  };

  const removeProgram = (id) => {
    setPrograms((current) => current.filter((program) => program.id !== id));
  };

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !coach) return;
    setUploading(true);
    try {
      const { url } = await storage.uploadFile('coach-photos', file);
      const updated = await coachRepo.update(coach.id, { photo_url: url });
      const nextCoach = { ...coach, ...updated, photo_url: url };
      setCoach(nextCoach);
      window.dispatchEvent(new CustomEvent(COACH_PROFILE_UPDATED_EVENT, {
        detail: { coach: nextCoach },
      }));
      toast.success('Profile photo updated');
    } catch (err) {
      console.error('CoachSettings photo upload failed', err);
      toast.error('Photo upload failed.');
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1560px] space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-normal text-slate-950 sm:text-4xl">Coach Settings</h1>
        <p className="mt-2 text-base text-slate-600">
          Manage your account, profile preferences, notifications, scheduling, and security.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:min-h-[720px]">
          <div className="space-y-1">
            {settingsSections.map((section) => (
              <SectionButton
                key={section.id}
                section={section}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </div>
        </aside>

        {activeSection === 'profile' ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Card title="Public Profile" icon={UserRound}>
                <div className="space-y-4">
                  <Field label="Display Name">
                    <Input
                      value={profileDraft.displayName}
                      onChange={(event) => updateProfileDraft({ displayName: event.target.value })}
                      onBlur={() => saveProfile(profileDraft, { silent: true })}
                      className="h-10 border-slate-200 bg-white"
                    />
                  </Field>

                  <Field label="Public Email">
                    <div className="relative">
                      <Input
                        value={profileDraft.email}
                        onChange={(event) => updateProfileDraft({ email: event.target.value })}
                        onBlur={() => saveProfile(profileDraft, { silent: true })}
                        className="h-10 border-slate-200 bg-white pr-24"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <StatusPill>{coach?.email_verified_at ? 'Verified' : 'Saved'}</StatusPill>
                      </span>
                    </div>
                  </Field>

                  <Field label="Training Area">
                    <Input
                      value={profileDraft.training_area}
                      onChange={(event) => updateProfileDraft({ training_area: event.target.value })}
                      onBlur={() => saveProfile(profileDraft, { silent: true })}
                      className="h-10 border-slate-200 bg-white"
                    />
                  </Field>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">Profile Visibility</p>
                      <p className="mt-0.5 text-xs text-slate-500">Allow athletes to view your public profile</p>
                    </div>
                    <Switch
                      checked={profileDraft.is_active !== false}
                      onCheckedChange={(value) => {
                        const nextDraft = { ...profileDraft, is_active: value };
                        setProfileDraft(nextDraft);
                        void saveProfile(nextDraft, { silent: true });
                      }}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                </div>
              </Card>

              <Card title="Profile Photo">
                <div className="flex flex-col items-center text-center">
                  <CoachAvatar src={avatarUrl} initials={previewInitials} size="lg" />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={uploadPhoto}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !coach}
                    className="mt-7 h-11 w-full max-w-[240px] border-slate-200 font-bold"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading ? 'Uploading...' : 'Upload new photo'}
                  </Button>
                  <p className="mt-4 text-xs font-medium text-slate-500">JPG, PNG or GIF. Max 5MB.</p>
                </div>
              </Card>

              <Card title="Specializations" icon={Tag}>
                <div className="flex flex-wrap gap-2">
                  {(profileDraft.specializations || []).map((item) => (
                    <Badge
                      key={item}
                      variant="secondary"
                      className="gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-200"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeSpecialization(item)}
                        className="text-slate-500 hover:text-slate-950"
                        aria-label={`Remove ${item}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="mt-6 flex gap-2">
                  <Input
                    value={specializationInput}
                    onChange={(event) => setSpecializationInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void addSpecialization();
                      }
                    }}
                    placeholder="Add specialization"
                    className="h-10 border-slate-200 bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSpecialization}
                    className="h-10 border-slate-200 font-bold"
                  >
                    Add
                  </Button>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Card title="Bio & Quote">
                <div className="space-y-4">
                  <Field label="Bio">
                    <Textarea
                      value={profileDraft.bio}
                      onChange={(event) => updateProfileDraft({ bio: event.target.value })}
                      onBlur={() => saveProfile(profileDraft, { silent: true })}
                      className="min-h-[108px] resize-none border-slate-200 bg-white text-sm"
                    />
                  </Field>
                  <Field label="Quote">
                    <Input
                      value={profileDraft.quote}
                      onChange={(event) => updateProfileDraft({ quote: event.target.value })}
                      onBlur={() => saveProfile(profileDraft, { silent: true })}
                      className="h-10 border-slate-200 bg-white"
                    />
                  </Field>
                </div>
              </Card>

              <Card title="Programs & Rates" icon={DollarSign}>
                <div className="space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_86px_76px_32px] gap-2 text-xs font-bold text-slate-600">
                    <span>Program</span>
                    <span>Duration</span>
                    <span>Price</span>
                    <span />
                  </div>
                  {programs.map((program) => (
                    <div key={program.id} className="grid grid-cols-[minmax(0,1fr)_86px_76px_32px] items-center gap-2">
                      <Input
                        value={program.name}
                        onChange={(event) => updateProgram(program.id, { name: event.target.value })}
                        className="h-9 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
                      />
                      <Select
                        value={program.duration}
                        onValueChange={(value) => updateProgram(program.id, { duration: value })}
                      >
                        <SelectTrigger className="h-9 border-slate-200 bg-white text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 min</SelectItem>
                          <SelectItem value="45">45 min</SelectItem>
                          <SelectItem value="60">60 min</SelectItem>
                          <SelectItem value="90">90 min</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-2">
                        <span className="text-xs font-bold text-slate-500">$</span>
                        <input
                          value={program.price}
                          onChange={(event) => updateProgram(program.id, { price: event.target.value.replace(/[^\d]/g, '') })}
                          className="min-w-0 flex-1 bg-transparent pl-1 text-sm font-semibold text-slate-950 outline-none"
                          aria-label={`${program.name} price`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProgram(program.id)}
                        className="grid h-9 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`Remove ${program.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addProgram}
                    className="mt-1 h-10 border-slate-200 font-bold text-blue-700 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add program
                  </Button>
                </div>
              </Card>

              <Card title="Live Profile Preview" icon={Eye}>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-4">
                    <CoachAvatar src={avatarUrl} initials={previewInitials} size="sm" alt={`${previewName} profile`} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-extrabold text-slate-950">{previewName}</h3>
                      <div className="mt-1 flex items-center gap-1 text-sm text-slate-700">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">4.9</span>
                        <span className="text-slate-500">(112 reviews)</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        Metro Detroit
                      </p>
                    </div>
                  </div>
                  <div className="my-4 border-t border-slate-200" />
                  <p className="line-clamp-1 text-xs text-slate-500">
                    {previewTags.join(' · ') || 'Private training'}
                  </p>
                  <Button className="mt-4 h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-700">
                    Book intro
                  </Button>
                </div>
              </Card>
            </div>

            {savingProfile && (
              <p className="px-1 text-xs font-semibold text-slate-500">Saving coach profile...</p>
            )}
          </div>
        ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Card title="Account Identity" icon={UserRound}>
              <div className="space-y-4">
                <Field label="Full Name">
                  <Input
                    value={identity.fullName}
                    onChange={(event) => setIdentity((current) => ({ ...current, fullName: event.target.value }))}
                    className="h-10 border-slate-200 bg-white"
                  />
                </Field>

                <Field label="Email Address">
                  <div className="relative">
                    <Input
                      value={identity.email}
                      readOnly
                      className="h-10 border-slate-200 bg-white pr-24 text-slate-700"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <StatusPill>Verified</StatusPill>
                    </span>
                  </div>
                </Field>

                <Field label="Phone Number">
                  <div className="flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white">
                    <button
                      type="button"
                      className="flex w-16 shrink-0 items-center justify-center gap-1 border-r border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                      onClick={() => toast.info('US phone region selected')}
                    >
                      US
                    </button>
                    <input
                      value={identity.phone}
                      onChange={(event) => setIdentity((current) => ({ ...current, phone: event.target.value }))}
                      className="min-w-0 flex-1 px-3 text-sm text-slate-950 outline-none"
                      placeholder="+1 (313) 555-0198"
                    />
                  </div>
                </Field>

                <Button
                  type="button"
                  onClick={saveIdentity}
                  disabled={saving}
                  className="h-11 bg-blue-600 px-6 font-bold text-white hover:bg-blue-700"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </Card>

            <Card title="Profile Photo">
              <div className="flex flex-col items-center text-center">
                <CoachAvatar src={avatarUrl} initials={initials} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadPhoto}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !coach}
                  className="mt-5 h-10 w-full max-w-[240px] border-slate-200 font-bold"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? 'Uploading...' : 'Upload new photo'}
                </Button>
                <p className="mt-3 text-xs font-medium text-slate-500">JPG, PNG or GIF. Max 5MB.</p>
              </div>
            </Card>

            <Card title="Notification Preferences" icon={Bell}>
              <PreferenceRow
                title="New Booking Requests"
                subtitle="Get notified when athletes book"
                checked={notifications.bookingRequests}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, bookingRequests: value }))}
              />
              <PreferenceRow
                title="Session Reminders"
                subtitle="Reminders for upcoming sessions"
                checked={notifications.sessionReminders}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, sessionReminders: value }))}
              />
              <PreferenceRow
                title="New Messages"
                subtitle="Get notified for new messages"
                checked={notifications.newMessages}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, newMessages: value }))}
              />
              <PreferenceRow
                title="Payments & Payouts"
                subtitle="Payouts, transfers, and receipts"
                checked={notifications.payments}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, payments: value }))}
              />
              <PreferenceRow
                title="Marketing Updates"
                subtitle="Product updates and tips"
                checked={notifications.marketing}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, marketing: value }))}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Card title="Booking Preferences">
              <div className="space-y-3">
                <Field label="Intro Session Duration">
                  <Select
                    value={bookingPrefs.introDuration}
                    onValueChange={(value) => setBookingPrefs((current) => ({ ...current, introDuration: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Buffer Before Sessions">
                  <Select
                    value={bookingPrefs.bufferBefore}
                    onValueChange={(value) => setBookingPrefs((current) => ({ ...current, bufferBefore: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Buffer After Sessions">
                  <Select
                    value={bookingPrefs.bufferAfter}
                    onValueChange={(value) => setBookingPrefs((current) => ({ ...current, bufferAfter: value }))}
                  >
                    <SelectTrigger className="h-10 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <label className="flex items-start gap-3 rounded-lg pt-1">
                  <Checkbox
                    checked={bookingPrefs.requireApproval}
                    onCheckedChange={(value) => setBookingPrefs((current) => ({ ...current, requireApproval: value === true }))}
                    className="mt-0.5 border-blue-600 data-[state=checked]:bg-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">Require approval for all booking requests</span>
                    <span className="mt-0.5 block text-xs text-slate-500">You approve or decline each new request</span>
                  </span>
                </label>
              </div>
            </Card>

            <Card title="Calendar Sync" icon={CalendarDays}>
              <div className="space-y-3">
                <CalendarConnection
                  icon={CalendarDays}
                  name="Google Calendar"
                  email={coachEmail}
                  connected
                  onMenu={() => toast.info('Google Calendar connection options')}
                />
                <CalendarConnection
                  icon={CalendarDays}
                  name="Outlook Calendar"
                  email={coachEmail.replace('@', '+calendar@')}
                  connected
                  onMenu={() => toast.info('Outlook Calendar connection options')}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Calendar connection management coming soon')}
                  className="h-11 w-full border-slate-200 font-semibold"
                >
                  Manage Calendar Connections
                </Button>
              </div>
            </Card>

            <Card title="Stripe Payout Status" icon={WalletCards}>
              <div className="flex min-h-[190px] flex-col justify-between">
                <div>
                  <p className="text-sm text-slate-600">Manage your payout account and view status.</p>
                  <div className="mt-6 flex items-center gap-4">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-2xl font-black text-white">
                      S
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-4 w-4 ${stripeReady ? 'text-emerald-600' : 'text-blue-600'}`} />
                        <p className={`text-sm font-bold ${stripeReady ? 'text-emerald-700' : 'text-blue-700'}`}>
                          {stripeReady ? 'Connected' : stripeAccount ? 'Reviewing' : 'Setup needed'}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{coachEmail}</p>
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline" className="h-11 w-full border-slate-200 font-semibold">
                  <Link to="/coach/earnings">Manage Payout Settings</Link>
                </Button>
              </div>
            </Card>
          </div>

          <Card title="Security" icon={Lock}>
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <p className="text-sm font-bold text-slate-950">Password</p>
                <p className="mt-1 text-xs text-slate-500">Last changed 45 days ago</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Password change flow opens from account security')}
                  className="mt-4 h-10 border-slate-200 font-semibold"
                >
                  Change password
                </Button>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-950">Two-Factor Authentication</p>
                <p className="mt-1 text-xs text-slate-500">Add an extra layer of security</p>
                <button
                  type="button"
                  onClick={() => setSecurityPrefs((current) => ({ ...current, twoFactorEnabled: !current.twoFactorEnabled }))}
                  className="mt-4 inline-flex h-8 items-center gap-2 rounded-full bg-emerald-50 px-3 text-xs font-bold text-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {securityPrefs.twoFactorEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-950">Active Sessions</p>
                <p className="mt-1 text-xs text-slate-500">Manage where you're logged in</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Active session management coming soon')}
                  className="mt-4 h-10 border-slate-200 font-semibold"
                >
                  View active sessions
                </Button>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-600">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span>Your account is secure. We use industry-standard encryption to protect your data.</span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
