import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Eye,
  Star,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { coachRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const toneClasses = {
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-orange-50 text-orange-500',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-500',
  indigo: 'bg-indigo-50 text-indigo-600',
};

const statCards = [
  {
    label: 'Upcoming Sessions',
    value: '8',
    action: 'View schedule',
    href: '/coach/schedule',
    icon: CalendarDays,
    tone: 'blue',
  },
  {
    label: 'Recently Booked',
    value: '3',
    action: 'View bookings',
    href: '/coach/sessions?view=bookings',
    icon: ClipboardList,
    tone: 'orange',
  },
  {
    label: 'Earnings This Month',
    value: '$2,450',
    action: 'View earnings',
    href: '/coach/earnings',
    icon: DollarSign,
    tone: 'green',
  },
  {
    label: 'Profile Views',
    value: '1,284',
    action: 'View analytics',
    href: '/coach/profile',
    icon: Eye,
    tone: 'indigo',
  },
  {
    label: 'Review Score',
    value: '4.9',
    action: 'View reviews',
    href: '/coach#reviews',
    icon: Star,
    tone: 'amber',
    rating: true,
  },
  {
    label: 'Stripe Status',
    value: 'Connected',
    action: 'Manage',
    href: '/coach/earnings',
    icon: CheckCircle2,
    tone: 'green',
    valueClassName: 'text-emerald-600 text-xl',
  },
];

const scheduleItems = [
  { time: '6:00 AM', title: 'Strength & Conditioning', type: '1-on-1 Session', status: 'Confirmed', tone: 'green' },
  { time: '8:00 AM', title: 'Speed & Agility', type: 'Small Group (4)', status: 'Confirmed', tone: 'green' },
  { time: '10:00 AM', title: 'Recovery & Mobility', type: '1-on-1 Session', status: 'Needs prep', tone: 'amber' },
  { time: '12:00 PM', title: 'Break', type: '', status: '---', tone: 'slate' },
  { time: '2:00 PM', title: 'Soccer Skills Training', type: 'Group Session (6)', status: 'Confirmed', tone: 'green' },
  { time: '4:00 PM', title: 'Game Analysis', type: '1-on-1 Session', status: 'Confirmed', tone: 'green' },
  { time: '6:00 PM', title: 'Evening Strength', type: 'Small Group (5)', status: 'Confirmed', tone: 'green' },
];

const weekDays = [
  { day: 'Mon', date: '2', sessions: 5 },
  { day: 'Tue', date: '3', sessions: 6 },
  { day: 'Wed', date: '4', sessions: 7 },
  { day: 'Thu', date: '5', sessions: 8, active: true },
  { day: 'Fri', date: '6', sessions: 6 },
  { day: 'Sat', date: '7', sessions: 4 },
  { day: 'Sun', date: '8', sessions: 3 },
];

const timeBars = [
  { label: '6A', value: 2 },
  { label: '', value: 3 },
  { label: '', value: 5 },
  { label: '9A', value: 8 },
  { label: '', value: 4 },
  { label: '', value: 5 },
  { label: '12P', value: 11 },
  { label: '', value: 6 },
  { label: '', value: 7 },
  { label: '3P', value: 6 },
  { label: '', value: 4 },
  { label: '', value: 9 },
  { label: '6P', value: 4 },
  { label: '', value: 5 },
  { label: '9P', value: 1 },
];

const people = {
  david: '/homepage-coach-marcus.png',
  sarah: '/homepage-coach-lisa.png',
  ethan: '/homepage-coach-jordan.png',
  team: '/levelcoach-mark.png',
};

const recentBookings = [
  {
    name: 'David Martinez',
    detail: '1-on-1 Session',
    when: 'Jun 7, 2026 · 10:00 AM',
    status: 'Booked',
    avatar: people.david,
  },
  {
    name: 'Sarah Johnson',
    detail: 'Small Group (4)',
    when: 'Jun 6, 2026 · 8:00 AM',
    status: 'Paid',
    avatar: people.sarah,
  },
  {
    name: 'Ethan Williams',
    detail: '1-on-1 Session',
    when: 'Jun 9, 2026 · 2:00 PM',
    status: 'Confirmed',
    avatar: people.ethan,
  },
];

const earningsData = [
  { date: 'May 5', value: 520 },
  { date: 'May 12', value: 1450 },
  { date: 'May 19', value: 980 },
  { date: 'May 26', value: 1850 },
  { date: 'Jun 2', value: 2450 },
];

const messages = [
  { name: 'David Martinez', message: 'Thanks for the great session today!', time: '10:24 AM', avatar: people.david },
  { name: 'Sarah Johnson', message: "Can we reschedule Friday's session?", time: '9:15 AM', avatar: people.sarah },
  { name: 'Team Elite Academy', message: 'Reminder: camp starts next Monday.', time: 'Yesterday', avatar: people.team },
  { name: 'Ethan Williams', message: 'Looking forward to our next session.', time: 'Yesterday', avatar: people.ethan },
];

const progressItems = [
  { name: 'David Martinez', program: 'Strength Program', score: 82, avatar: people.david },
  { name: 'Sarah Johnson', program: 'Speed Program', score: 75, avatar: people.sarah },
  { name: 'Ethan Williams', program: 'Skills Program', score: 68, avatar: people.ethan },
];

const checklistItems = [
  { label: 'Review 3 booked sessions', checked: true },
  { label: "Confirm tomorrow's sessions", checked: true },
  { label: 'Create new training program', checked: false },
  { label: 'Send weekly progress updates', checked: false },
  { label: 'Update availability for next week', checked: false },
];

const performanceRows = [
  { label: 'Client Satisfaction', value: '4.9/5', pct: 98 },
  { label: 'Sessions Completed', value: '92%', pct: 92 },
  { label: 'Response Time', value: '85%', pct: 85 },
  { label: 'Profile Engagement', value: '90%', pct: 90 },
];

const demoAvailability = {
  Monday: { enabled: true, start: '16:00', end: '19:00' },
  Tuesday: { enabled: true, start: '16:00', end: '19:00' },
  Wednesday: { enabled: false, start: '08:00', end: '20:00' },
  Thursday: { enabled: true, start: '16:00', end: '19:00' },
  Friday: { enabled: true, start: '15:00', end: '18:00' },
  Saturday: { enabled: true, start: '09:00', end: '13:00' },
  Sunday: { enabled: false, start: '08:00', end: '20:00' },
};

function splitName(user) {
  const fallbackName = user?.name || user?.full_name || '';
  const first = user?.first_name || fallbackName.trim().split(/\s+/)[0] || 'Demo';
  const last = user?.last_name || fallbackName.trim().split(/\s+/).slice(1).join(' ') || 'Coach';
  return { first, last };
}

function demoCoachPayload(user) {
  const { first, last } = splitName(user);
  const payload = {
    first_name: first,
    last_name: last,
    email: user?.email || 'coach@example.com',
    phone: user?.phone || '',
    county: 'Oakland',
    training_area: 'Metro Detroit speed, strength, and skills development',
    service_city: 'Royal Oak',
    service_state: 'MI',
    service_zip: '48067',
    service_radius_miles: 25,
    service_type: 'hybrid',
    service_venue: 'LevelCoach Training Fieldhouse',
    service_counties: ['Oakland', 'Wayne', 'Macomb'],
    location_lat: 42.4895,
    location_lng: -83.1446,
    bio: `${first} helps athletes build sharper movement, stronger habits, and more confidence through structured private training. This demo profile is ready to edit with your real specialties, service area, and availability.`,
    quote: 'Progress you can measure. Confidence you can feel.',
    photo_url: '/homepage-coach-marcus.png',
    specializations: [
      'Speed & Agility',
      'Strength & Conditioning',
      'Soccer Skills',
      '1-on-1 Sessions',
      'Small Group Training',
    ],
    availability: demoAvailability,
    is_active: false,
    is_head_coach: false,
    display_order: 999,
    platform_fee_type: 'none',
    platform_fee_value: 0,
    user_id: user?.account_id || user?.id || '',
  };
  if (user?.email_verified) payload.email_verified_at = new Date().toISOString();
  return payload;
}

function DashboardCard({ className, children, ...props }) {
  return (
    <section
      {...props}
      className={cn('rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]', className)}
    >
      {children}
    </section>
  );
}

function FirstLoginCoachStarter() {
  const { user, refetchUser } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const needsCoachProfile = !!user && !user.coach_id;
  const displayName = useMemo(() => {
    const { first, last } = splitName(user);
    return `${first} ${last}`.trim();
  }, [user]);

  if (!needsCoachProfile) return null;

  const createDemoProfile = async () => {
    setCreating(true);
    try {
      const accountId = user?.account_id || user?.id || '';
      const existing = accountId
        ? await coachRepo.filter({ user_id: accountId }).catch(() => [])
        : [];
      const coach = existing[0] || await coachRepo.create(demoCoachPayload(user));
      const rolePatch = user?.role === 'admin' || user?.role === 'super_admin'
        ? {}
        : { role: 'coach' };

      await auth.updateCurrentUser({
        ...rolePatch,
        coach_id: coach.id,
        onboarding_role: 'coach',
        onboarding_status: 'complete',
        profile_setup_complete: false,
      });
      await refetchUser();
      toast.success(existing[0] ? 'Demo coach profile linked' : 'Demo coach profile created');
      navigate('/coach/profile');
    } catch (error) {
      console.error('Could not create demo coach profile', error);
      toast.error(error?.message || 'Could not create the demo coach profile.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardCard className="overflow-hidden border-blue-200 bg-blue-50/55 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-[0_12px_26px_rgba(37,99,235,0.25)]">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">First coach login</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">
              Create a demo coaching profile for {displayName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This creates a hidden coach profile linked to your account so Profile Builder, Schedule, Payments,
              and Sessions have a real coach record to work with. You can edit every field before an admin activates it.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={createDemoProfile}
          disabled={creating}
          className="h-11 shrink-0 bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
        >
          {creating ? 'Creating profile...' : 'Create demo profile'}
        </Button>
      </div>
    </DashboardCard>
  );
}

function SectionHeader({ title, action, href = '/coach' }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {action && (
        <Link to={href} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          {action}
        </Link>
      )}
    </div>
  );
}

function Avatar({ src, alt }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-50 object-cover"
    />
  );
}

function StatusPill({ children, tone = 'green' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <span className={cn('inline-flex min-w-[76px] justify-center rounded-full px-3 py-1 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

function RatingStars() {
  return (
    <div className="flex items-center gap-0.5 text-amber-400">
      {[0, 1, 2, 3, 4].map((star) => (
        <Star key={star} className="h-4 w-4 fill-current" />
      ))}
    </div>
  );
}

function StatCard({ card }) {
  const Icon = card.icon;
  return (
    <DashboardCard className="group flex min-h-[176px] flex-col justify-between p-5">
      <div className="flex items-start gap-4">
        <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-lg', toneClasses[card.tone])}>
          <Icon className="h-6 w-6" />
        </div>
        <p className="min-h-[44px] text-[15px] font-semibold leading-snug text-slate-950">{card.label}</p>
      </div>
      <div>
        <p className={cn('text-3xl font-extrabold text-slate-950', card.valueClassName)}>{card.value}</p>
        {card.rating && <div className="mt-2"><RatingStars /></div>}
        <Link to={card.href} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
          {card.action}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </DashboardCard>
  );
}

function ScheduleCard() {
  return (
    <DashboardCard className="p-5 xl:col-span-4">
      <SectionHeader title="Today's Schedule" action="View full schedule" href="/coach/schedule" />
      <div className="relative space-y-3">
        <div className="absolute bottom-5 left-[88px] top-4 w-px bg-slate-200" />
        {scheduleItems.map((item, index) => (
          <div key={`${item.time}-${item.title}`} className="relative grid grid-cols-[72px_20px_minmax(0,1fr)_90px] items-center gap-3">
            <span className="text-sm text-slate-600">{item.time}</span>
            <span
              className={cn(
                'relative z-10 h-3 w-3 rounded-full border-2 border-white',
                index === 2 ? 'bg-amber-400' : index === 3 ? 'bg-slate-300' : 'bg-blue-600'
              )}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
              {item.type && <p className="truncate text-xs text-slate-500">{item.type}</p>}
            </div>
            <StatusPill tone={item.tone}>{item.status}</StatusPill>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function WeekCard() {
  return (
    <DashboardCard className="p-5 xl:col-span-4">
      <SectionHeader title="This Week" action="Jun 2 - Jun 8" />
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div
            key={day.day}
            className={cn(
              'rounded-lg px-2 py-3 text-center',
              day.active ? 'bg-blue-600 text-white shadow-[0_12px_26px_rgba(37,99,235,0.32)]' : 'bg-white text-slate-950'
            )}
          >
            <p className={cn('text-xs font-medium', day.active ? 'text-blue-100' : 'text-slate-600')}>{day.day}</p>
            <p className="mt-1 text-xl font-bold">{day.date}</p>
            <p className="mt-1 text-xs font-semibold">{day.sessions}</p>
            <p className={cn('text-[11px]', day.active ? 'text-blue-100' : 'text-slate-500')}>Sessions</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-700">You have 8 sessions scheduled</p>
      <div className="mt-3 h-[88px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={timeBars} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
            <Tooltip cursor={{ fill: 'rgba(37,99,235,0.08)' }} />
            <Bar dataKey="value" fill="#b7ccff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function RecentBookingsCard() {
  return (
    <DashboardCard className="p-5 xl:col-span-4">
      <SectionHeader title="Recently Booked" action="View all" href="/coach/sessions?view=bookings" />
      <div className="space-y-5">
        {recentBookings.map((booking) => (
          <Link
            to="/coach/sessions?view=bookings"
            key={booking.name}
            className="flex items-center gap-3 rounded-lg transition-colors hover:bg-slate-50"
          >
            <Avatar src={booking.avatar} alt={booking.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-950">{booking.name}</p>
              <p className="truncate text-xs text-slate-500">{booking.detail}</p>
              <p className="truncate text-xs text-slate-500">{booking.when}</p>
            </div>
            <StatusPill tone={booking.status === 'Paid' ? 'blue' : 'green'}>{booking.status}</StatusPill>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function EarningsCard() {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title="Earnings Overview" action="View full report" href="/coach/earnings" />
      <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
        <div>
          <p className="text-3xl font-extrabold text-slate-950">$2,450</p>
          <p className="mt-1 text-sm font-semibold text-emerald-600">↑ 18% vs last month</p>
          <div className="mt-4 h-[132px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={earningsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `$${value / 1000}K`} />
                <Tooltip formatter={(value) => [`$${value}`, 'Earnings']} />
                <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="#dbeafe" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-slate-500">Sessions</p>
            <p className="text-lg font-bold text-slate-950">28</p>
          </div>
          <div>
            <p className="text-slate-500">Avg. Per Session</p>
            <p className="text-lg font-bold text-slate-950">$87.50</p>
          </div>
          <div>
            <p className="text-slate-500">Payouts</p>
            <p className="text-lg font-bold text-slate-950">$2,325</p>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function MessagesCard() {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title="Recent Messages" action="View all" href="/coach/messages" />
      <div className="space-y-4">
        {messages.map((message) => (
          <Link to="/coach/messages" key={message.name} className="flex items-center gap-3 rounded-lg hover:bg-slate-50">
            <Avatar src={message.avatar} alt={message.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-950">{message.name}</p>
              <p className="truncate text-sm text-slate-500">{message.message}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-slate-500">{message.time}</span>
              <span className="h-2 w-2 rounded-full bg-blue-600" />
            </div>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function ProgressCard() {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title="Athlete Progress Highlights" action="View all" href="/coach/clients" />
      <div className="space-y-5">
        {progressItems.map((item) => (
          <Link to="/coach/clients" key={item.name} className="grid grid-cols-[40px_minmax(0,1fr)_minmax(120px,1.3fr)_42px] items-center gap-3 rounded-lg hover:bg-slate-50">
            <Avatar src={item.avatar} alt={item.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{item.name}</p>
              <p className="truncate text-xs text-slate-500">{item.program}</p>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${item.score}%` }} />
            </div>
            <span className="text-sm font-semibold text-slate-950">{item.score}%</span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function ChecklistCard() {
  return (
    <DashboardCard className="p-5">
      <SectionHeader title="Task Checklist" />
      <div className="grid gap-3 sm:grid-cols-2">
        {checklistItems.map((item) => (
          <label key={item.label} className="flex items-center gap-3 text-sm text-slate-600">
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded border',
                item.checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className={cn(item.checked && 'font-semibold text-slate-700')}>{item.label}</span>
          </label>
        ))}
      </div>
    </DashboardCard>
  );
}

function CoachPerformanceCard() {
  return (
    <DashboardCard id="reviews" className="p-5">
      <SectionHeader title="Coach Performance" action="View analytics" href="/coach/profile" />
      <div className="grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)]">
        <div className="grid place-items-center">
          <div
            className="grid h-28 w-28 place-items-center rounded-full"
            style={{ background: 'conic-gradient(#2563eb 0deg 313deg, #e2e8f0 313deg 360deg)' }}
            role="img"
            aria-label="87 percent overall score"
          >
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center">
              <div>
                <p className="text-2xl font-extrabold text-slate-950">87%</p>
                <p className="text-[11px] text-slate-500">Overall Score</p>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {performanceRows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{row.label}</span>
                <span className="font-semibold text-slate-950">{row.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}

export default function CoachOverview() {
  return (
    <div className="mx-auto max-w-[1540px] space-y-4">
      <FirstLoginCoachStarter />

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold text-slate-950 sm:text-4xl">Coach Dashboard</h1>
        <p className="text-lg text-slate-600">Your business at a glance.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ScheduleCard />
        <WeekCard />
        <RecentBookingsCard />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <EarningsCard />
        </div>
        <div className="xl:col-span-4">
          <MessagesCard />
        </div>
        <div className="xl:col-span-4">
          <ProgressCard />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ChecklistCard />
        </div>
        <div className="xl:col-span-6">
          <CoachPerformanceCard />
        </div>
      </div>
    </div>
  );
}
