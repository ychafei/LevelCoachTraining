import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachBlockRepo, sessionRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { rpc } from '@/lib/rpc';
import {
  formatInTz,
  isSessionPast,
  recurringWindowsByDay,
  slotsForDate,
  timezoneAbbreviation,
} from '@/lib/scheduleET';
import { formatAvailabilityTime } from '@/lib/publicCoach';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Ban,
  CalendarDays,
  Clock,
  Plus,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const RANGE_DAYS = 30;

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
  if (block.block_all_day !== false) return `${dateText} · All day`;
  return `${dateText} · ${formatAvailabilityTime(block.blocked_start_time)} - ${formatAvailabilityTime(block.blocked_end_time)}`;
}

const EMPTY_BLOCK = {
  label: '',
  start_date: '',
  end_date: '',
  block_all_day: true,
  blocked_start_time: '09:00',
  blocked_end_time: '17:00',
};

function SummaryCard({ title, icon: Icon, children, action = null }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <Icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CoachSchedule() {
  const { user } = useCurrentUser();
  const [av, setAv] = useState(null); // {windows, busy, availability, timezone, ...}
  const [blocks, setBlocks] = useState([]);
  const [blocksDirty, setBlocksDirty] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [newBlock, setNewBlock] = useState(EMPTY_BLOCK);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState('');
  const [cancelId, setCancelId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleId, setRescheduleId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  const load = useCallback(async () => {
    if (!user?.coach_id) return;
    const startDate = format(new Date(), 'yyyy-MM-dd');
    const endDate = format(addDays(new Date(), RANGE_DAYS), 'yyyy-MM-dd');
    const [avRes, blockRows, sessionRows] = await Promise.all([
      rpc.invoke('getCoachAvailability', {
        coach_id: user.coach_id,
        start_date: startDate,
        end_date: endDate,
      }).catch((err) => {
        console.warn('getCoachAvailability failed', err);
        return null;
      }),
      coachBlockRepo.filter({ coach_id: user.coach_id }, 'start_date').catch(() => []),
      sessionRepo.filter({ coach_id: user.coach_id }, '-date').catch(() => []),
    ]);
    setAv(avRes?.data || null);
    setBlocks((blockRows || []).map((block) => ({
      label: block.label || '',
      start_date: block.start_date || '',
      end_date: block.end_date || '',
      block_all_day: block.block_all_day !== false,
      blocked_start_time: block.blocked_start_time || '',
      blocked_end_time: block.blocked_end_time || '',
      is_active: block.is_active !== false,
    })));
    setBlocksDirty(false);
    setSessions(sessionRows || []);
  }, [user?.coach_id]);

  useEffect(() => {
    if (!user?.coach_id) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        console.error('CoachSchedule load failed', err);
        if (!cancelled) toast.error('Could not load schedule overview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.coach_id, load]);

  const tz = av?.timezone || '';
  const tzAbbr = timezoneAbbreviation(tz);
  const weeklyWindows = useMemo(() => recurringWindowsByDay(av), [av]);
  const availableDays = useMemo(() => (
    DAYS.map((day) => ({ day, windows: weeklyWindows[day] || [] }))
      .filter((item) => item.windows.length > 0)
  ), [weeklyWindows]);

  const actionableSessions = useMemo(() => (
    (sessions || [])
      .filter((s) => ['pending', 'confirmed'].includes(s.status))
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`))
  ), [sessions]);

  // All coach session actions go through the booking function — the server
  // re-validates conflicts, policy windows, and credit restoration.
  const runSessionAction = async (action, payload, successMessage) => {
    setActingId(payload.session_id);
    try {
      await rpc.invoke('booking', { action, ...payload });
      toast.success(successMessage);
      setCancelId('');
      setCancelReason('');
      setRescheduleId('');
      setRescheduleDate('');
      setRescheduleTime('');
      await load();
    } catch (err) {
      // Server validation errors are user-friendly — show them verbatim.
      toast.error(err?.data?.error || 'Could not update the session.');
    } finally {
      setActingId('');
    }
  };

  const rescheduleSlots = rescheduleDate
    ? slotsForDate(av, rescheduleDate, Number(
      actionableSessions.find((s) => s.id === rescheduleId)?.duration_minutes,
    ) || 60)
    : [];

  const addBlock = () => {
    if (!newBlock.start_date || !newBlock.end_date || newBlock.start_date > newBlock.end_date) {
      toast.error('Enter a valid start and end date for the block.');
      return;
    }
    if (newBlock.block_all_day === false
      && (!newBlock.blocked_start_time || !newBlock.blocked_end_time
        || newBlock.blocked_start_time >= newBlock.blocked_end_time)) {
      toast.error('Enter a valid blocked time window.');
      return;
    }
    setBlocks((prev) => [...prev, { ...newBlock, is_active: true }]);
    setBlocksDirty(true);
    setNewBlock(EMPTY_BLOCK);
    setShowBlockForm(false);
  };

  const removeBlock = (index) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setBlocksDirty(true);
  };

  // Blocks are saved as a full replacement set through coachSelf.setBlocks.
  const saveBlocks = async () => {
    setSavingBlocks(true);
    try {
      await rpc.invoke('coachSelf', {
        action: 'setBlocks',
        blocks: blocks.map((block) => ({
          label: block.label || '',
          start_date: block.start_date,
          end_date: block.end_date,
          block_all_day: block.block_all_day !== false,
          ...(block.block_all_day === false ? {
            blocked_start_time: block.blocked_start_time,
            blocked_end_time: block.blocked_end_time,
          } : {}),
          is_active: block.is_active !== false,
        })),
      });
      toast.success('Unavailable time saved.');
      await load();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save blocks.');
    } finally {
      setSavingBlocks(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center" role="status" aria-label="Loading schedule">
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
            The bookable rhythm your clients see, your upcoming sessions, and your unavailable time.
            {tzAbbr ? ` Times are shown in your coaching timezone (${tzAbbr}).` : ''}
          </p>
        </div>
        <Button asChild className="h-11 bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">
          <Link to="/coach/settings?section=calendar">
            <Settings className="h-4 w-4" />
            Manage availability rules
          </Link>
        </Button>
      </div>

      <SummaryCard title="Upcoming Sessions" icon={Users}>
        {actionableSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-500">
            No pending or confirmed sessions.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-500">
              Client cancellations 24 or more hours before the start restore the credit automatically.
              When you cancel, the client's credit is always restored.
            </p>
            {actionableSessions.map((s) => {
              const past = isSessionPast(s.date, s.start_time, Date.now(), s.timezone || tz);
              const busyActing = actingId === s.id;
              return (
                <div key={s.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">{s.client_name || 'Client'}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-600">
                        {formatInTz(s.date, s.start_time, s.timezone || tz)} · {s.duration_minutes || 60} min
                        {s.status === 'pending' ? ' · Pending' : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {past && s.status === 'confirmed' && (
                        <>
                          <Button size="sm" disabled={busyActing}
                            onClick={() => runSessionAction('complete', { session_id: s.id }, 'Session marked completed.')}
                            className="h-9 bg-emerald-600 font-bold text-white hover:bg-emerald-700">
                            Complete
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyActing}
                            onClick={() => runSessionAction('no_show', { session_id: s.id }, 'Session marked as a no-show.')}
                            className="h-9 font-bold">
                            No-show
                          </Button>
                        </>
                      )}
                      {!past && (
                        <Button size="sm" variant="outline" disabled={busyActing}
                          onClick={() => {
                            setRescheduleId(rescheduleId === s.id ? '' : s.id);
                            setRescheduleDate('');
                            setRescheduleTime('');
                            setCancelId('');
                          }}
                          className="h-9 font-bold">
                          Reschedule
                        </Button>
                      )}
                      <Button size="sm" variant="outline" disabled={busyActing}
                        onClick={() => {
                          setCancelId(cancelId === s.id ? '' : s.id);
                          setCancelReason('');
                          setRescheduleId('');
                        }}
                        className="h-9 font-bold text-red-600 hover:text-red-700">
                        Cancel
                      </Button>
                    </div>
                  </div>

                  {cancelId === s.id && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-white p-3">
                      <label htmlFor={`cancel-reason-${s.id}`} className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Cancellation reason (shared with the client)
                      </label>
                      <Textarea
                        id={`cancel-reason-${s.id}`}
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        rows={2}
                        className="mt-2 bg-white"
                        placeholder="Optional reason"
                      />
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" disabled={busyActing}
                          onClick={() => runSessionAction('cancel', { session_id: s.id, reason: cancelReason.trim() }, 'Session cancelled. The client\'s credit was restored.')}
                          className="h-9 bg-red-600 font-bold text-white hover:bg-red-700">
                          {busyActing ? 'Cancelling...' : 'Confirm Cancellation'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCancelId('')} className="h-9 font-bold">
                          Keep Session
                        </Button>
                      </div>
                    </div>
                  )}

                  {rescheduleId === s.id && (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">New date</span>
                          <Input
                            type="date"
                            min={format(new Date(), 'yyyy-MM-dd')}
                            value={rescheduleDate}
                            onChange={(event) => { setRescheduleDate(event.target.value); setRescheduleTime(''); }}
                            className="mt-1 bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            New time{tzAbbr ? ` (${tzAbbr})` : ''}
                          </span>
                          <select
                            value={rescheduleTime}
                            onChange={(event) => setRescheduleTime(event.target.value)}
                            disabled={!rescheduleDate}
                            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500"
                          >
                            <option value="">Select a time</option>
                            {rescheduleSlots.map((time) => (
                              <option key={time} value={time}>{formatAvailabilityTime(time)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {rescheduleDate && rescheduleSlots.length === 0 && (
                        <p className="mt-2 text-xs font-semibold text-slate-500">No open times on that date.</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" disabled={busyActing || !rescheduleDate || !rescheduleTime}
                          onClick={() => runSessionAction('reschedule', {
                            session_id: s.id,
                            date: rescheduleDate,
                            start_time: rescheduleTime,
                          }, 'Session rescheduled.')}
                          className="h-9 bg-blue-600 font-bold text-white hover:bg-blue-700">
                          {busyActing ? 'Rescheduling...' : 'Confirm Reschedule'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRescheduleId('')} className="h-9 font-bold">
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SummaryCard>

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
                        {formatAvailabilityTime(window.start)} - {formatAvailabilityTime(window.end)}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SummaryCard>

        <SummaryCard
          title="Unavailable Time"
          icon={Ban}
          action={(
            <Button size="sm" variant="outline" onClick={() => setShowBlockForm((open) => !open)} className="h-8 font-bold">
              <Plus className="h-3.5 w-3.5" />
              Add Block
            </Button>
          )}
        >
          {showBlockForm && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Label</span>
                <Input
                  value={newBlock.label}
                  onChange={(event) => setNewBlock((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="e.g. Vacation"
                  className="mt-1 bg-white"
                />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Start date</span>
                  <Input type="date" value={newBlock.start_date}
                    onChange={(event) => setNewBlock((prev) => ({ ...prev, start_date: event.target.value }))}
                    className="mt-1 bg-white" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">End date</span>
                  <Input type="date" value={newBlock.end_date}
                    onChange={(event) => setNewBlock((prev) => ({ ...prev, end_date: event.target.value }))}
                    className="mt-1 bg-white" />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Switch
                  checked={newBlock.block_all_day}
                  onCheckedChange={(value) => setNewBlock((prev) => ({ ...prev, block_all_day: value }))}
                  aria-label="Block the entire day"
                />
                <span className="text-sm font-semibold text-slate-700">All day</span>
              </div>
              {!newBlock.block_all_day && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
                    <Input type="time" value={newBlock.blocked_start_time}
                      onChange={(event) => setNewBlock((prev) => ({ ...prev, blocked_start_time: event.target.value }))}
                      className="mt-1 bg-white" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
                    <Input type="time" value={newBlock.blocked_end_time}
                      onChange={(event) => setNewBlock((prev) => ({ ...prev, blocked_end_time: event.target.value }))}
                      className="mt-1 bg-white" />
                  </label>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={addBlock} className="h-9 bg-blue-600 font-bold text-white hover:bg-blue-700">
                  Add to List
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowBlockForm(false)} className="h-9 font-bold">
                  Close
                </Button>
              </div>
            </div>
          )}

          {blocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-500">
              No blackout ranges are active.
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.map((block, index) => (
                <div key={`${block.start_date}-${block.end_date}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">{block.label || 'Unavailable'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{formatBlockRange(block)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeBlock(index)}
                    className="h-8 shrink-0 text-red-600 hover:text-red-700"
                    aria-label={`Remove block ${block.label || formatBlockRange(block)}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {blocksDirty && (
            <div className="mt-4 flex justify-end">
              <Button onClick={saveBlocks} disabled={savingBlocks} className="h-10 bg-blue-600 font-bold text-white hover:bg-blue-700">
                {savingBlocks ? 'Saving...' : 'Save Unavailable Time'}
              </Button>
            </div>
          )}
        </SummaryCard>
      </div>

      <SummaryCard title="Live Schedule" icon={CalendarDays}>
        <div className="grid gap-3 md:grid-cols-7">
          {DAYS.map((day) => {
            const windows = weeklyWindows[day] || [];
            return (
              <div key={day} className="min-h-[140px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{day.slice(0, 3)}</p>
                {windows.length ? (
                  <div className="mt-3 space-y-2">
                    {windows.map((window, index) => (
                      <div key={`${day}-preview-${index}`} className="rounded-md bg-blue-100 px-2 py-2 text-xs font-bold text-blue-700">
                        {formatAvailabilityTime(window.start)}
                        <br />
                        {formatAvailabilityTime(window.end)}
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
