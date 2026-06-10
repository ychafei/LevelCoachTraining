import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useMyCoach } from '@/features/coach/useMyCoach';
import { coachBlockRepo, coachRepo, profileRepo } from '@/api/repo';
import WeeklyAvailabilityEditor from '@/components/coach/WeeklyAvailabilityEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  Ban,
  Bell,
  CalendarDays,
  Clock,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// Coach settings — every control on this page persists for real:
//  - Weekly availability   → coachSelf.setAvailability (via WeeklyAvailabilityEditor)
//  - Blackout dates        → coachSelf.setBlocks (full-set replace)
//  - Booking rules         → coachSelf.setBookingRules
//  - Notification prefs    → accountProfile.update (notification_prefs JSON)
// Fabricated calendar-sync / 2FA / active-session controls were removed.

const SECTIONS = [
  { id: 'availability', label: 'Availability', sub: 'Weekly booking windows', icon: Clock },
  { id: 'blocks', label: 'Blackout Dates', sub: 'Time off and travel', icon: Ban },
  { id: 'booking', label: 'Booking Rules', sub: 'Notice, buffers, advance limit', icon: CalendarDays },
  { id: 'notifications', label: 'Notifications', sub: 'Email alert preferences', icon: Bell },
];

// Legacy deep links (?section=calendar / profile) still resolve somewhere sane.
const SECTION_ALIASES = { calendar: 'availability', account: 'availability', profile: 'availability' };

const NOTIFICATION_PREFS = [
  { key: 'booking_updates', label: 'Booking updates', sub: 'New bookings, cancellations, and reschedules.' },
  { key: 'session_reminders', label: 'Session reminders', sub: 'Reminders ahead of upcoming sessions.' },
  { key: 'messages', label: 'New messages', sub: 'When a client sends you a message.' },
  { key: 'payments', label: 'Payments & payouts', sub: 'Payment receipts and payout updates.' },
  { key: 'marketing', label: 'Product news', sub: 'Occasional feature announcements.', defaultOff: true },
];

const EMPTY_BLOCK_FORM = {
  label: '',
  start_date: '',
  end_date: '',
  block_all_day: true,
  blocked_start_time: '09:00',
  blocked_end_time: '17:00',
};

function parseBookingRules(raw) {
  let rules = raw;
  if (typeof rules === 'string') {
    try { rules = JSON.parse(rules); } catch { rules = null; }
  }
  return {
    min_notice_hours: String(rules?.min_notice_hours ?? 24),
    buffer_minutes: String(rules?.buffer_minutes ?? 0),
    max_advance_days: String(rules?.max_advance_days ?? 60),
  };
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

function fmtBlockDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '';
  const [y, m, d] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function SectionCard({ title, icon: Icon, blurb, children }) {
  return (
    <section className="bg-card border border-border rounded-lg p-5" aria-label={title}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-accent" aria-hidden="true" />}
        <h2 className="font-display text-sm font-bold tracking-widest uppercase text-foreground">{title}</h2>
      </div>
      {blurb && <p className="text-xs text-muted-foreground mb-4">{blurb}</p>}
      {children}
    </section>
  );
}

// ── Blackout dates ────────────────────────────────────────────────────────────

function BlocksSection({ coach }) {
  const [blocks, setBlocks] = useState(null);
  const [form, setForm] = useState(EMPTY_BLOCK_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!coach?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await coachBlockRepo.filter({ coach_id: coach.id }, 'start_date');
        if (!cancelled) setBlocks(rows || []);
      } catch (err) {
        console.error('Blocks load failed', err);
        if (!cancelled) setBlocks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [coach?.id]);

  const persist = async (nextBlocks) => {
    setSaving(true);
    try {
      await coachBlockRepo.setBlocks(nextBlocks.map((b) => ({
        label: b.label || '',
        start_date: b.start_date,
        end_date: b.end_date,
        block_all_day: b.block_all_day !== false,
        ...(b.block_all_day === false ? {
          blocked_start_time: b.blocked_start_time,
          blocked_end_time: b.blocked_end_time,
        } : {}),
        is_active: b.is_active !== false,
      })));
      // Re-read so local ids match the server's replaced rows.
      const rows = await coachBlockRepo.filter({ coach_id: coach.id }, 'start_date').catch(() => nextBlocks);
      setBlocks(rows || nextBlocks);
      toast.success('Blackout dates saved');
      return true;
    } catch (err) {
      toast.error(err?.message || 'Could not save blackout dates.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async () => {
    if (!form.start_date || !form.end_date) {
      toast.error('Pick a start and end date.');
      return;
    }
    if (form.start_date > form.end_date) {
      toast.error('End date must be on or after the start date.');
      return;
    }
    if (!form.block_all_day && form.blocked_start_time >= form.blocked_end_time) {
      toast.error('Blocked end time must be after the start time.');
      return;
    }
    const ok = await persist([...(blocks || []), { ...form, is_active: true }]);
    if (ok) setForm(EMPTY_BLOCK_FORM);
  };

  const removeBlock = async (block) => {
    await persist((blocks || []).filter((b) => b !== block));
  };

  if (blocks === null) {
    return <div className="h-24 animate-pulse rounded-lg bg-secondary/60" aria-hidden="true" />;
  }

  return (
    <div className="space-y-4">
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No blackout dates. Add one below to block bookings while you're away.</p>
      ) : (
        <ul className="divide-y divide-border">
          {blocks.map((block, index) => (
            <li key={block.id || `${block.start_date}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{block.label || 'Blocked'}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtBlockDate(block.start_date)}
                  {block.end_date !== block.start_date && ` – ${fmtBlockDate(block.end_date)}`}
                  {block.block_all_day === false && ` · ${block.blocked_start_time}–${block.blocked_end_time}`}
                  {block.block_all_day !== false && ' · all day'}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => removeBlock(block)}
                className="text-destructive hover:text-destructive shrink-0"
                aria-label={`Remove blackout ${block.label || fmtBlockDate(block.start_date)}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Add blackout</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="block-label" className="font-display tracking-wider uppercase text-xs">Label</Label>
            <Input
              id="block-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Tournament travel"
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label htmlFor="block-start" className="font-display tracking-wider uppercase text-xs">Start date</Label>
            <Input
              id="block-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))}
              className="bg-secondary border-border mt-1"
            />
          </div>
          <div>
            <Label htmlFor="block-end" className="font-display tracking-wider uppercase text-xs">End date</Label>
            <Input
              id="block-end"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className="bg-secondary border-border mt-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="block-all-day"
              checked={form.block_all_day}
              onCheckedChange={(v) => setForm((f) => ({ ...f, block_all_day: v }))}
            />
            <Label htmlFor="block-all-day" className="text-sm text-foreground">All day</Label>
          </div>
          {!form.block_all_day && (
            <div className="flex items-center gap-2">
              <Label htmlFor="block-from" className="sr-only">Blocked from</Label>
              <Input
                id="block-from"
                type="time"
                value={form.blocked_start_time}
                onChange={(e) => setForm((f) => ({ ...f, blocked_start_time: e.target.value }))}
                className="bg-secondary border-border w-32"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Label htmlFor="block-to" className="sr-only">Blocked until</Label>
              <Input
                id="block-to"
                type="time"
                value={form.blocked_end_time}
                onChange={(e) => setForm((f) => ({ ...f, blocked_end_time: e.target.value }))}
                className="bg-secondary border-border w-32"
              />
            </div>
          )}
          <div className="ml-auto">
            <Button
              onClick={addBlock}
              disabled={saving}
              className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
            >
              <Plus className="w-3 h-3 mr-1" aria-hidden="true" /> {saving ? 'Saving…' : 'Add Blackout'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Booking rules ─────────────────────────────────────────────────────────────

function BookingRulesSection({ coach, onSaved }) {
  const [rules, setRules] = useState(() => parseBookingRules(coach?.booking_rules));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules(parseBookingRules(coach?.booking_rules));
  }, [coach?.booking_rules]);

  const save = async () => {
    const minNotice = Number(rules.min_notice_hours);
    const buffer = Number(rules.buffer_minutes);
    const maxAdvance = Number(rules.max_advance_days);
    setSaving(true);
    try {
      const res = await coachRepo.setBookingRules({
        min_notice_hours: minNotice,
        buffer_minutes: buffer,
        max_advance_days: maxAdvance,
      });
      onSaved?.(res?.booking_rules || { min_notice_hours: minNotice, buffer_minutes: buffer, max_advance_days: maxAdvance });
      toast.success('Booking rules saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save booking rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="rule-notice" className="font-display tracking-wider uppercase text-xs">Minimum notice</Label>
          <Select value={rules.min_notice_hours} onValueChange={(v) => setRules((r) => ({ ...r, min_notice_hours: v }))}>
            <SelectTrigger id="rule-notice" className="bg-secondary border-border mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['0', '2', '4', '12', '24', '48', '72'].map((h) => (
                <SelectItem key={h} value={h}>{h === '0' ? 'No minimum' : `${h} hours`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">How far in advance clients must book.</p>
        </div>
        <div>
          <Label htmlFor="rule-buffer" className="font-display tracking-wider uppercase text-xs">Buffer between sessions</Label>
          <Select value={rules.buffer_minutes} onValueChange={(v) => setRules((r) => ({ ...r, buffer_minutes: v }))}>
            <SelectTrigger id="rule-buffer" className="bg-secondary border-border mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['0', '15', '30', '45', '60'].map((m) => (
                <SelectItem key={m} value={m}>{m === '0' ? 'No buffer' : `${m} minutes`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">Breathing room before and after each session.</p>
        </div>
        <div>
          <Label htmlFor="rule-advance" className="font-display tracking-wider uppercase text-xs">Max advance booking</Label>
          <Select value={rules.max_advance_days} onValueChange={(v) => setRules((r) => ({ ...r, max_advance_days: v }))}>
            <SelectTrigger id="rule-advance" className="bg-secondary border-border mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['14', '30', '60', '90', '180'].map((d) => (
                <SelectItem key={d} value={d}>{d} days</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">How far into the future clients can book.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
        >
          <Save className="w-3 h-3 mr-1" aria-hidden="true" /> {saving ? 'Saving…' : 'Save Booking Rules'}
        </Button>
      </div>
    </div>
  );
}

// ── Notification preferences ──────────────────────────────────────────────────

function NotificationsSection() {
  const { user, refetchUser } = useAuth();
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
      await profileRepo.updateSelf({ notification_prefs: prefs });
      await refetchUser();
      setDirty(false);
      toast.success('Notification preferences saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border">
        {NOTIFICATION_PREFS.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <Label htmlFor={`pref-${item.key}`} className="text-sm text-foreground font-medium">{item.label}</Label>
              <p className="text-xs text-muted-foreground">{item.sub}</p>
            </div>
            <Switch
              id={`pref-${item.key}`}
              checked={prefs[item.key]}
              onCheckedChange={(v) => toggle(item.key, v)}
              aria-label={item.label}
            />
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving || !dirty}
          className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
        >
          <Save className="w-3 h-3 mr-1" aria-hidden="true" /> {saving ? 'Saving…' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachSettings() {
  const { isAdmin } = useAuth();
  const { coach, setCoach, loading } = useMyCoach();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('section') || '';
  const resolved = SECTION_ALIASES[requested] || requested;
  const activeSection = SECTIONS.some((s) => s.id === resolved) ? resolved : 'availability';

  const [availability, setAvailability] = useState({});

  useEffect(() => {
    if (coach?.availability && typeof coach.availability === 'object') {
      setAvailability(coach.availability);
    }
  }, [coach?.availability]);

  const switchSection = (id) => {
    setSearchParams(id === 'availability' ? {} : { section: id }, { replace: true });
  };

  const sectionMeta = useMemo(
    () => SECTIONS.find((s) => s.id === activeSection) || SECTIONS[0],
    [activeSection],
  );

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
        <div className="h-9 w-40 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="h-64 animate-pulse rounded-lg border border-border bg-secondary/50" />
          <div className="lg:col-span-3 h-96 animate-pulse rounded-lg border border-border bg-secondary/50" />
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Your admin account is not linked to a coach record, so there are no coach settings to manage.'
              : 'Ask an admin to link your account to a coach record before configuring availability and booking rules.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Availability, blackout dates, booking rules, and notifications.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Section nav */}
        <nav className="lg:col-span-1" aria-label="Settings sections">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <li key={section.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => switchSection(section.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active
                        ? 'bg-accent/10 border border-accent/30 text-accent'
                        : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="hidden lg:block text-[11px] text-muted-foreground">{section.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Active section */}
        <div className="lg:col-span-3 space-y-4">
          {activeSection === 'availability' && (
            <SectionCard
              title={sectionMeta.label}
              icon={sectionMeta.icon}
              blurb={`Weekly windows clients can book, in your timezone (${coach.timezone || 'America/Detroit'}). Saving replaces your previous schedule.`}
            >
              <WeeklyAvailabilityEditor
                availability={availability}
                onChange={setAvailability}
                onSaved={(saved) => setCoach((prev) => (prev ? { ...prev, availability: saved } : prev))}
              />
            </SectionCard>
          )}

          {activeSection === 'blocks' && (
            <SectionCard
              title={sectionMeta.label}
              icon={sectionMeta.icon}
              blurb="Dates (or partial days) when nobody can book you — vacations, tournaments, travel."
            >
              <BlocksSection coach={coach} />
            </SectionCard>
          )}

          {activeSection === 'booking' && (
            <SectionCard
              title={sectionMeta.label}
              icon={sectionMeta.icon}
              blurb="Enforced server-side on every booking and reschedule."
            >
              <BookingRulesSection
                coach={coach}
                onSaved={(rules) => setCoach((prev) => (prev ? { ...prev, booking_rules: JSON.stringify(rules) } : prev))}
              />
            </SectionCard>
          )}

          {activeSection === 'notifications' && (
            <SectionCard
              title={sectionMeta.label}
              icon={sectionMeta.icon}
              blurb="Which email notifications you receive. Transactional emails required for bookings always send."
            >
              <NotificationsSection />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
