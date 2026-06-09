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
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
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
  {
    id: 'account',
    label: 'Account',
    sub: 'Identity and photo',
    description: 'Identity, contact information, and account photo.',
    icon: UserRound,
  },
  {
    id: 'profile',
    label: 'Public Profile Settings',
    sub: 'Visibility and profile defaults',
    description: 'Public-facing coach details athletes see before booking.',
    icon: UserRound,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    sub: 'Alerts and reminders',
    description: 'Booking, session, message, and payment alerts.',
    icon: Bell,
  },
  {
    id: 'calendar',
    label: 'Availability Rules',
    sub: 'Booking windows and buffers',
    description: 'Bookable windows, blocked dates, and session spacing.',
    icon: Clock,
  },
  {
    id: 'payments',
    label: 'Payout Setup',
    sub: 'Stripe and receipts',
    description: 'Stripe status, payout account, and payment notifications.',
    icon: WalletCards,
  },
  {
    id: 'privacy',
    label: 'Privacy & Safety',
    sub: 'Discovery and trust',
    description: 'Public discovery, athlete contact, and account safety preferences.',
    icon: ShieldCheck,
  },
  {
    id: 'security',
    label: 'Security',
    sub: 'Password and 2FA',
    description: 'Password, two-factor authentication, and active sessions.',
    icon: Lock,
  },
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

const WEEK_DAYS = [
  { key: 'Monday', short: 'Mon', date: 'Mon 6/8' },
  { key: 'Tuesday', short: 'Tue', date: 'Tue 6/9' },
  { key: 'Wednesday', short: 'Wed', date: 'Wed 6/10' },
  { key: 'Thursday', short: 'Thu', date: 'Thu 6/11' },
  { key: 'Friday', short: 'Fri', date: 'Fri 6/12' },
  { key: 'Saturday', short: 'Sat', date: 'Sat 6/13' },
  { key: 'Sunday', short: 'Sun', date: 'Sun 6/14' },
];

const DEFAULT_AVAILABILITY = {
  Monday: { enabled: true, start: '06:00', end: '10:00', windows: [{ start: '06:00', end: '10:00' }, { start: '16:00', end: '19:00' }] },
  Tuesday: { enabled: true, start: '07:00', end: '11:00', windows: [{ start: '07:00', end: '11:00' }] },
  Wednesday: { enabled: false, start: '', end: '', windows: [] },
  Thursday: { enabled: true, start: '17:00', end: '20:00', windows: [{ start: '17:00', end: '20:00' }] },
  Friday: { enabled: true, start: '06:00', end: '12:00', windows: [{ start: '06:00', end: '12:00' }] },
  Saturday: { enabled: true, start: '09:00', end: '13:00', windows: [{ start: '09:00', end: '13:00' }] },
  Sunday: { enabled: false, start: '', end: '', windows: [] },
};

const DEFAULT_BLACKOUTS = [
  { id: 'family-event', date: 'Jun 12, 2026', label: 'Family event' },
  { id: 'tournament-travel', date: 'Jun 19 - Jun 21, 2026', label: 'Tournament travel' },
];

const DEFAULT_SESSION_TYPES = [
  { id: 'intro-session', name: 'Intro Session', duration: '30', available: true },
  { id: 'private-session', name: 'Private Session', duration: '60', available: true },
  { id: 'small-group-training', name: 'Small Group Training', duration: '60', available: true },
];

const BOOKING_RULE_OPTIONS = {
  introDuration: [
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '45', label: '45 minutes' },
    { value: '60', label: '60 minutes' },
  ],
  buffer: [
    { value: '0', label: 'No buffer' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
  ],
  minimumNotice: [
    { value: '12 hours', label: '12 hours' },
    { value: '24 hours', label: '24 hours' },
    { value: '48 hours', label: '48 hours' },
  ],
  maxAdvance: [
    { value: '14 days', label: '14 days' },
    { value: '30 days', label: '30 days' },
    { value: '60 days', label: '60 days' },
  ],
};

const PREVIEW_TIMES = ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

const TIME_OPTIONS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
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

function normalizeAvailability(raw = {}) {
  const normalized = {};
  WEEK_DAYS.forEach(({ key }) => {
    const source = raw?.[key] || DEFAULT_AVAILABILITY[key] || {};
    const fallback = DEFAULT_AVAILABILITY[key] || { enabled: false, windows: [] };
    const enabled = source.enabled ?? fallback.enabled ?? false;
    const sourceWindows = Array.isArray(source.windows) && source.windows.length
      ? source.windows
      : source.start && source.end
        ? [{ start: source.start, end: source.end }]
        : fallback.windows;
    const windows = enabled
      ? sourceWindows.slice(0, 2).map((window) => ({
        start: window.start || '',
        end: window.end || '',
      }))
      : [];
    normalized[key] = {
      enabled,
      start: enabled ? windows[0]?.start || source.start || fallback.start || '' : '',
      end: enabled ? windows[0]?.end || source.end || fallback.end || '' : '',
      windows,
    };
  });
  return normalized;
}

function formatTime(value) {
  if (!value) return '';
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function timeToTop(value) {
  if (!value) return 0;
  const [hourText, minuteText = '0'] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Math.max(0, Math.min(100, (((hour + minute / 60) - 6) / 15) * 100));
}

function timeToHeight(start, end) {
  if (!start || !end) return 16;
  const [startHour, startMin = '0'] = start.split(':').map(Number);
  const [endHour, endMin = '0'] = end.split(':').map(Number);
  const duration = (endHour + endMin / 60) - (startHour + startMin / 60);
  return Math.max(14, Math.min(42, (duration / 15) * 100));
}

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
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
      className={`flex min-h-[68px] w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition ${
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
          : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-blue-600' : 'text-slate-700'}`} />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{section.label}</span>
        <span className={`mt-1 hidden text-xs sm:block ${active ? 'text-blue-700/75' : 'text-slate-500'}`}>
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
  const [activeSection, setActiveSection] = useState('account');
  const [coach, setCoach] = useState(null);
  const [stripeAccount, setStripeAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [identity, setIdentity] = useState({
    fullName: '',
    email: '',
    phone: '',
  });
  const [profileDraft, setProfileDraft] = useState(() => toProfileDraft(null));
  const [specializationInput, setSpecializationInput] = useState('');
  const [programs, setPrograms] = useState(DEFAULT_PROGRAMS);
  const [availability, setAvailability] = useState(() => normalizeAvailability(DEFAULT_AVAILABILITY));
  const [blackouts, setBlackouts] = useState(DEFAULT_BLACKOUTS);
  const [sessionTypes, setSessionTypes] = useState(DEFAULT_SESSION_TYPES);
  const [lastSavedAvailability, setLastSavedAvailability] = useState('Last saved 2 minutes ago');
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
    minimumNotice: '24 hours',
    maxAdvance: '30 days',
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
  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) || settingsSections[0];

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
        setAvailability(normalizeAvailability(coachRow?.availability || DEFAULT_AVAILABILITY));
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

  const updateAvailabilityDay = (day, patch) => {
    setAvailability((current) => {
      const currentDay = current[day] || { enabled: false, windows: [] };
      const nextDay = { ...currentDay, ...patch };
      if (patch.windows) {
        nextDay.start = patch.windows[0]?.start || '';
        nextDay.end = patch.windows[0]?.end || '';
      }
      if (patch.enabled === true && !nextDay.windows.length) {
        nextDay.windows = [{ start: '08:00', end: '12:00' }];
        nextDay.start = '08:00';
        nextDay.end = '12:00';
      }
      if (patch.enabled === false) {
        nextDay.windows = [];
        nextDay.start = '';
        nextDay.end = '';
      }
      return { ...current, [day]: nextDay };
    });
  };

  const updateAvailabilityWindow = (day, index, field, value) => {
    setAvailability((current) => {
      const currentDay = current[day] || { enabled: true, windows: [] };
      const windows = [...(currentDay.windows || [])];
      windows[index] = { ...(windows[index] || { start: '', end: '' }), [field]: value };
      return {
        ...current,
        [day]: {
          ...currentDay,
          enabled: true,
          windows,
          start: windows[0]?.start || '',
          end: windows[0]?.end || '',
        },
      };
    });
  };

  const addAvailabilityWindow = (day) => {
    const currentDay = availability[day] || { enabled: false, windows: [] };
    const windows = currentDay.windows || [];
    if (windows.length >= 2) {
      toast.info('Two windows are shown in this settings view.');
      return;
    }
    const nextWindow = windows.length === 0
      ? { start: '08:00', end: '12:00' }
      : { start: '16:00', end: '19:00' };
    updateAvailabilityDay(day, {
      enabled: true,
      windows: [...windows, nextWindow],
    });
  };

  const saveAvailability = async () => {
    if (!coach?.id) {
      toast.error('Coach profile is still loading.');
      return;
    }
    setSavingAvailability(true);
    try {
      const normalized = normalizeAvailability(availability);
      const updated = await coachRepo.update(coach.id, { availability: normalized });
      setCoach((current) => ({ ...(current || coach), ...updated, availability: normalized }));
      setAvailability(normalized);
      setLastSavedAvailability('Saved just now');
      toast.success('Availability saved');
    } catch (err) {
      console.error('CoachSettings availability save failed', err);
      toast.error('Could not save availability.');
    } finally {
      setSavingAvailability(false);
    }
  };

  const addBlackout = () => {
    setBlackouts((current) => [
      ...current,
      { id: `blackout-${Date.now()}`, date: 'Jun 26, 2026', label: 'Unavailable' },
    ]);
  };

  const removeBlackout = (id) => {
    setBlackouts((current) => current.filter((block) => block.id !== id));
  };

  const updateSessionType = (id, patch) => {
    setSessionTypes((current) => current.map((type) => (
      type.id === id ? { ...type, ...patch } : type
    )));
  };

  const addSessionType = () => {
    setSessionTypes((current) => [
      ...current,
      { id: `session-${Date.now()}`, name: 'New Session Type', duration: '60', available: true },
    ]);
  };

  const removeSessionType = (id) => {
    setSessionTypes((current) => current.filter((type) => type.id !== id));
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

      <div className="min-w-0 space-y-4">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {settingsSections.map((section) => (
              <SectionButton
                key={section.id}
                section={section}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Settings Area</p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">{activeSectionMeta.label}</h2>
          <p className="mt-1 text-sm text-slate-600">{activeSectionMeta.description}</p>
        </section>

        {activeSection === 'calendar' ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <span className="hidden self-center text-sm font-medium text-slate-500 sm:inline">{lastSavedAvailability}</span>
              <Button
                type="button"
                onClick={saveAvailability}
                disabled={savingAvailability}
                className="h-11 bg-blue-600 px-7 font-bold text-white hover:bg-blue-700"
              >
                {savingAvailability ? 'Saving...' : 'Save availability'}
              </Button>
            </div>

            <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Card title="Weekly Availability" icon={Clock} className="2xl:row-span-2">
                <div className="overflow-x-auto">
                  <div className="min-w-[670px]">
                    <div className="grid grid-cols-[48px_78px_174px_174px_118px] gap-3 pb-3 text-xs font-bold text-slate-500">
                      <span>Day</span>
                      <span>Available</span>
                      <span>Window 1</span>
                      <span>Window 2</span>
                      <span>Actions</span>
                    </div>
                    <div className="space-y-3">
                      {WEEK_DAYS.map(({ key, short }) => {
                        const day = availability[key] || { enabled: false, windows: [] };
                        const windows = day.enabled ? day.windows || [] : [];
                        return (
                          <div key={key} className="grid grid-cols-[48px_78px_174px_174px_118px] items-center gap-3">
                            <p className="text-sm font-bold text-slate-700">{short}</p>
                            <Switch
                              checked={day.enabled}
                              onCheckedChange={(value) => updateAvailabilityDay(key, { enabled: value })}
                              className="data-[state=checked]:bg-blue-600"
                            />
                            {[0, 1].map((index) => {
                              const window = windows[index];
                              return window ? (
                                <div key={index} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <Select
                                    value={window.start}
                                    onValueChange={(value) => updateAvailabilityWindow(key, index, 'start', value)}
                                  >
                                    <SelectTrigger className="h-9 border-slate-200 bg-white text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIME_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>{formatTime(option)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-slate-400">-</span>
                                  <Select
                                    value={window.end}
                                    onValueChange={(value) => updateAvailabilityWindow(key, index, 'end', value)}
                                  >
                                    <SelectTrigger className="h-9 border-slate-200 bg-white text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIME_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>{formatTime(option)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <div key={index} className="flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
                                  -
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => addAvailabilityWindow(key)}
                              className="inline-flex items-center justify-start gap-1 text-sm font-bold text-blue-700 hover:text-blue-800"
                            >
                              <Plus className="h-4 w-4" />
                              Add window
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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

              <Card title="Booking Rules" icon={Clock}>
                <div className="space-y-3">
                  {[
                    ['Intro Session Duration', 'introDuration', BOOKING_RULE_OPTIONS.introDuration],
                    ['Buffer Before', 'bufferBefore', BOOKING_RULE_OPTIONS.buffer],
                    ['Buffer After', 'bufferAfter', BOOKING_RULE_OPTIONS.buffer],
                    ['Minimum Notice', 'minimumNotice', BOOKING_RULE_OPTIONS.minimumNotice],
                    ['Max Advance Booking', 'maxAdvance', BOOKING_RULE_OPTIONS.maxAdvance],
                  ].map(([label, key, options]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3">
                      <Label className="text-sm font-semibold text-slate-700">{label}</Label>
                      <Select
                        value={bookingPrefs[key] || options[0]}
                        onValueChange={(value) => setBookingPrefs((current) => ({ ...current, [key]: value }))}
                      >
                        <SelectTrigger className="h-9 border-slate-200 bg-white text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <label className="flex items-start gap-3 pt-1">
                    <Checkbox
                      checked={bookingPrefs.requireApproval}
                      onCheckedChange={(value) => setBookingPrefs((current) => ({ ...current, requireApproval: value === true }))}
                      className="mt-0.5 border-blue-600 data-[state=checked]:bg-blue-600"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">Require approval for all booking requests</span>
                      <span className="mt-0.5 block text-xs text-slate-500">You'll approve or decline each new request</span>
                    </span>
                  </label>
                </div>
              </Card>

              <Card title="Time Off & Blackouts" icon={Ban}>
                <div className="space-y-3">
                  {blackouts.map((block) => (
                    <div key={block.id} className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-3">
                      <CalendarDays className="h-5 w-5 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-950">{block.date}</p>
                        <p className="truncate text-xs text-slate-500">{block.label}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBlackout(block.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-red-600"
                        aria-label={`Remove ${block.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addBlackout}
                    className="mt-4 h-11 w-full border-blue-200 font-bold text-blue-700 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add unavailable time
                  </Button>
                </div>
              </Card>

              <Card title="Session Types" icon={UserRound}>
                <div className="space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_82px_74px_28px] gap-2 text-xs font-bold text-slate-500">
                    <span>Session Type</span>
                    <span>Duration</span>
                    <span>Available</span>
                    <span />
                  </div>
                  {sessionTypes.map((type) => (
                    <div key={type.id} className="grid grid-cols-[minmax(0,1fr)_82px_74px_28px] items-center gap-2">
                      <Input
                        value={type.name}
                        onChange={(event) => updateSessionType(type.id, { name: event.target.value })}
                        className="h-9 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
                      />
                      <Select
                        value={type.duration}
                        onValueChange={(value) => updateSessionType(type.id, { duration: value })}
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
                      <Switch
                        checked={type.available}
                        onCheckedChange={(value) => updateSessionType(type.id, { available: value })}
                        className="data-[state=checked]:bg-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeSessionType(type.id)}
                        className="grid h-8 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`Remove ${type.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSessionType}
                    className="mt-2 h-10 w-full border-slate-200 font-bold text-blue-700 hover:text-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add session type
                  </Button>
                </div>
              </Card>
            </div>

            <Card title="Calendar Preview" icon={CalendarDays}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-center gap-5 text-sm font-bold text-slate-950 sm:ml-[42%]">
                  <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Previous week">‹</button>
                  <span>Jun 8 - Jun 14</span>
                  <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Next week">›</button>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded bg-blue-200" />Available</span>
                  <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded bg-emerald-200" />Booked</span>
                  <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded bg-amber-200" />Blocked</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[900px] grid-cols-[70px_repeat(7,minmax(100px,1fr))] border-t border-l border-slate-200 text-xs">
                  <div className="border-r border-b border-slate-200 bg-white" />
                  {WEEK_DAYS.map((day) => (
                    <div key={day.key} className="border-r border-b border-slate-200 bg-white py-2 text-center font-bold text-slate-700">
                      {day.date}
                    </div>
                  ))}
                  <div className="relative h-[178px] border-r border-b border-slate-200 bg-white">
                    {PREVIEW_TIMES.map((time, index) => (
                      <div
                        key={time}
                        className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right font-bold text-slate-500"
                        style={{ top: `${(index / (PREVIEW_TIMES.length - 1)) * 100}%` }}
                      >
                        {time}
                      </div>
                    ))}
                  </div>
                  {WEEK_DAYS.map((day) => {
                    const dayAvailability = availability[day.key] || { windows: [] };
                    const previewWindows = dayAvailability.enabled ? dayAvailability.windows || [] : [];
                    return (
                      <div key={day.key} className="relative h-[178px] border-r border-b border-slate-200 bg-white">
                        {PREVIEW_TIMES.map((time, index) => (
                          <div
                            key={time}
                            className="absolute left-0 right-0 border-t border-slate-100"
                            style={{ top: `${(index / (PREVIEW_TIMES.length - 1)) * 100}%` }}
                          />
                        ))}
                        {previewWindows.map((window, index) => (
                          <div
                            key={`${day.key}-${index}`}
                            className="absolute left-3 right-3 rounded-md bg-blue-100 px-3 py-2 text-xs font-bold leading-tight text-blue-700"
                            style={{
                              top: `${timeToTop(window.start)}%`,
                              height: `${timeToHeight(window.start, window.end)}%`,
                            }}
                          >
                            {formatTime(window.start)}
                            <br />
                            {formatTime(window.end)}
                          </div>
                        ))}
                        {day.key === 'Friday' && (
                          <div className="absolute bottom-7 left-3 right-3 rounded-md bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700">
                            Family event
                          </div>
                        )}
                        {day.key === 'Saturday' && (
                          <div className="absolute bottom-1 left-3 right-3 rounded-md bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700">
                            Tournament travel
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        ) : activeSection === 'profile' ? (
          <div className="min-w-0 space-y-4">
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
        ) : activeSection === 'account' ? (
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

            <Card title="Account Photo">
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

            <Card title="Coach Account" icon={CheckCircle2}>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Role</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">Coach</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Profile Link</p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-950">{coach?.id || user?.coach_id || 'Pending'}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveSection('profile')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Public profile settings
                </Button>
              </div>
            </Card>
          </div>
        ) : activeSection === 'notifications' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
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
                title="Payout Alerts"
                subtitle="Transfers, receipts, and account updates"
                checked={notifications.payments}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, payments: value }))}
              />
              <PreferenceRow
                title="Product Updates"
                subtitle="Platform tips and release notes"
                checked={notifications.marketing}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, marketing: value }))}
              />
            </Card>

            <Card title="Alert Routing" icon={Bell}>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Primary Email</p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-950">{coachEmail}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Phone</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">{identity.phone || '+1 (313) 555-0198'}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveSection('account')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Edit account contact
                </Button>
              </div>
            </Card>
          </div>
        ) : activeSection === 'payments' ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Card title="Stripe Payout Status" icon={WalletCards}>
              <div className="flex min-h-[210px] flex-col justify-between">
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
                  <Link to="/coach/earnings">Open earnings dashboard</Link>
                </Button>
              </div>
            </Card>

            <Card title="Payout Destination" icon={DollarSign}>
              <div className="space-y-4">
                <Field label="Statement Email">
                  <Input value={coachEmail} readOnly className="h-10 border-slate-200 bg-white text-slate-700" />
                </Field>
                <Field label="Payout Schedule">
                  <Select defaultValue="weekly">
                    <SelectTrigger className="h-10 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Stripe payout schedule changes are managed in Stripe.')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Manage in Stripe
                </Button>
              </div>
            </Card>

            <Card title="Payout Alerts" icon={Bell}>
              <PreferenceRow
                title="Transfer Updates"
                subtitle="Notify me when a payout starts or completes"
                checked={notifications.payments}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, payments: value }))}
              />
              <PreferenceRow
                title="Booking Receipts"
                subtitle="Send receipts for paid coaching sessions"
                checked={notifications.bookingRequests}
                onCheckedChange={(value) => setNotifications((current) => ({ ...current, bookingRequests: value }))}
              />
            </Card>
          </div>
        ) : activeSection === 'privacy' ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Card title="Public Discovery" icon={Eye}>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">Public Profile Visibility</p>
                    <p className="mt-1 text-xs text-slate-500">Allow athletes to find this coach profile.</p>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveSection('profile')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Edit public profile settings
                </Button>
              </div>
            </Card>

            <Card title="Booking Safety" icon={ShieldCheck}>
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Checkbox
                  checked={bookingPrefs.requireApproval}
                  onCheckedChange={(value) => setBookingPrefs((current) => ({ ...current, requireApproval: value === true }))}
                  className="mt-0.5 border-blue-600 data-[state=checked]:bg-blue-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-950">Require booking approval</span>
                  <span className="mt-1 block text-xs text-slate-500">Review new booking requests before they are confirmed.</span>
                </span>
              </label>
            </Card>

            <Card title="Data Controls" icon={ShieldCheck}>
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Account data export queued.')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Export account data
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Privacy request workflow coming soon.')}
                  className="h-10 w-full border-slate-200 font-semibold"
                >
                  Contact privacy support
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
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
