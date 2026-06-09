import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachBlockRepo, coachRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import {
  Ban,
  CalendarDays,
  Clock,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(value) {
  if (!value) return '';
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatDateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function formatBlockRange(block) {
  if (!block?.start_date || !block?.end_date) return 'Date not set';
  const start = formatDateLabel(block.start_date);
  const end = formatDateLabel(block.end_date);
  const dateText = block.start_date === block.end_date ? start : `${start} - ${end}`;
  if (block.block_all_day) return `${dateText} · All day`;
  return `${dateText} · ${formatTime(block.blocked_start_time)} - ${formatTime(block.blocked_end_time)}`;
}

function windowsFor(dayAvailability) {
  if (!dayAvailability?.enabled) return [];
  if (Array.isArray(dayAvailability.windows) && dayAvailability.windows.length) {
    return dayAvailability.windows;
  }
  if (dayAvailability.start && dayAvailability.end) {
    return [{ start: dayAvailability.start, end: dayAvailability.end }];
  }
  return [];
}

function SummaryCard({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      {children}
    </section>
  );
}

export default function CoachSchedule() {
  const { user } = useCurrentUser();
  const [coach, setCoach] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.coach_id) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const [coachRow, blockRows] = await Promise.all([
          coachRepo.get(user.coach_id).catch(() => null),
          coachBlockRepo.filter({ coach_id: user.coach_id, is_active: true }, 'start_date').catch(() => []),
        ]);
        if (cancelled) return;
        setCoach(coachRow);
        setBlocks(blockRows || []);
      } catch (err) {
        console.error('CoachSchedule load failed', err);
        if (!cancelled) toast.error('Could not load schedule overview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.coach_id]);

  const availableDays = useMemo(() => (
    DAYS.map((day) => ({ day, windows: windowsFor(coach?.availability?.[day]) }))
      .filter((item) => item.windows.length > 0)
  ), [coach?.availability]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Coach Schedule</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-normal text-slate-950 sm:text-4xl">Schedule Overview</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            View the bookable rhythm your clients see. Availability windows, blackout ranges, buffers, and session types are configured in Availability Rules.
          </p>
        </div>
        <Button asChild className="h-11 bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">
          <Link to="/coach/settings?section=calendar">
            <Settings className="h-4 w-4" />
            Manage availability rules
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <SummaryCard title="Weekly Bookable Windows" icon={Clock}>
          {availableDays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-500">
              No weekly availability is active yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {availableDays.map(({ day, windows }) => (
                <div key={day} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-extrabold text-slate-950">{day}</p>
                  <div className="mt-2 space-y-1">
                    {windows.map((window, index) => (
                      <p key={`${day}-${index}`} className="text-sm font-semibold text-slate-700">
                        {formatTime(window.start)} - {formatTime(window.end)}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SummaryCard>

        <SummaryCard title="Unavailable Time" icon={Ban}>
          {blocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-500">
              No blackout ranges are active.
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.slice(0, 6).map((block) => (
                <div key={block.id} className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                  <p className="truncate text-sm font-extrabold text-slate-950">{block.label || 'Unavailable'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{formatBlockRange(block)}</p>
                </div>
              ))}
            </div>
          )}
        </SummaryCard>
      </div>

      <SummaryCard title="Live Schedule" icon={CalendarDays}>
        <div className="grid gap-3 md:grid-cols-7">
          {DAYS.map((day) => {
            const windows = windowsFor(coach?.availability?.[day]);
            return (
              <div key={day} className="min-h-[140px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{day.slice(0, 3)}</p>
                {windows.length ? (
                  <div className="mt-3 space-y-2">
                    {windows.map((window, index) => (
                      <div key={`${day}-preview-${index}`} className="rounded-md bg-blue-100 px-2 py-2 text-xs font-bold text-blue-700">
                        {formatTime(window.start)}
                        <br />
                        {formatTime(window.end)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-8 text-xs font-semibold text-slate-400">Off</p>
                )}
              </div>
            );
          })}
        </div>
      </SummaryCard>
    </div>
  );
}
