import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BatteryCharging, CalendarDays, Flame, HeartPulse, Smile, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { trainingRepo } from '@/api/repo';
import { formatInTz, formatInstantInTz } from '@/lib/scheduleET';
import { EmptyState, SectionCard, SkeletonRows, sessionStartMs } from '@/features/athlete/portalShared';

const SCALES = [
  {
    key: 'energy',
    label: 'Energy',
    icon: BatteryCharging,
    low: 'Running on empty',
    high: 'Fully charged',
  },
  {
    key: 'soreness',
    label: 'Soreness',
    icon: Flame,
    low: 'Feeling fresh',
    high: 'Really sore',
  },
  {
    key: 'mood',
    label: 'Mood',
    icon: Smile,
    low: 'Tough day',
    high: 'Feeling great',
  },
];

function ScalePicker({ scale, value, onChange }) {
  return (
    <fieldset>
      <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <scale.icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {scale.label}
      </legend>
      <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-label={`${scale.label}, 1 to 10`}>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${scale.label} ${n} of 10`}
            onClick={() => onChange(n)}
            className={`h-9 rounded text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              value === n
                ? 'bg-accent text-accent-foreground'
                : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>1 · {scale.low}</span>
        <span>10 · {scale.high}</span>
      </div>
    </fieldset>
  );
}

function CheckInHistory({ checkIns, loading, sessionsById }) {
  return (
    <SectionCard title="Your check-in history" icon={HeartPulse}>
      {loading ? (
        <SkeletonRows rows={2} />
      ) : checkIns.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No check-ins yet"
          body="Quick check-ins help your coach plan sessions around how you actually feel. There are no wrong answers."
          compact
        />
      ) : (
        <ul className="space-y-2">
          {checkIns.map((checkIn) => {
            const session = sessionsById[checkIn.session_id];
            return (
              <li key={checkIn.id} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    {formatInstantInTz(checkIn.created_date)}
                  </p>
                  {session && (
                    <p className="text-[11px] text-muted-foreground">
                      Session: {formatInTz(session.date, session.start_time, session.timezone)}
                    </p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  {checkIn.energy != null && <span>Energy <strong className="text-foreground">{checkIn.energy}/10</strong></span>}
                  {checkIn.soreness != null && <span>Soreness <strong className="text-foreground">{checkIn.soreness}/10</strong></span>}
                  {checkIn.mood != null && <span>Mood <strong className="text-foreground">{checkIn.mood}/10</strong></span>}
                </div>
                {checkIn.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{checkIn.notes}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function todayInTz(timezone = 'America/Detroit') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function AthleteWellness({ user, athleteProfile, athleteIds, sessions = [] }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ energy: 0, soreness: 0, mood: 0 });
  const [notes, setNotes] = useState('');
  const [injury, setInjury] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [saving, setSaving] = useState(false);

  const key = athleteIds.join(',');
  const checkInsQuery = useQuery({
    queryKey: ['portal', 'checkIns', key],
    enabled: athleteIds.length > 0,
    queryFn: () => trainingRepo.listCheckIns({ athlete_id: athleteIds }),
  });

  // Wellness reports are day-of only and must be tied to the exact session so
  // the right coach receives read access.
  const todaySessions = useMemo(() => {
    return sessions
      .filter((session) => {
        const sessionDay = todayInTz(session.timezone || 'America/Detroit');
        return session.date === sessionDay && ['pending', 'confirmed'].includes(session.status);
      })
      .sort((a, b) => (sessionStartMs(a) ?? 0) - (sessionStartMs(b) ?? 0))
      .slice(0, 10);
  }, [sessions]);

  useEffect(() => {
    if (todaySessions.length === 1 && !sessionId) {
      setSessionId(todaySessions[0].id);
    }
    if (sessionId && !todaySessions.some((session) => session.id === sessionId)) {
      setSessionId('');
    }
  }, [sessionId, todaySessions]);

  const sessionsById = useMemo(() => {
    const map = {};
    for (const session of sessions) map[session.id] = session;
    return map;
  }, [sessions]);

  const ready = !!sessionId && values.energy > 0 && values.soreness > 0 && values.mood > 0;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const noteText = injury
        ? `INJURY FLAG: the athlete reported a possible injury.\n${notes.trim()}`.trim()
        : notes.trim();
      await trainingRepo.createCheckIn({
        athlete_id: athleteProfile?.id || user?.id || '',
        session_id: sessionId,
        energy: values.energy,
        soreness: values.soreness,
        mood: values.mood,
        notes: noteText,
        injury_flag: injury,
      });
      toast.success('Check-in saved. Thanks for sharing how you feel!');
      setValues({ energy: 0, soreness: 0, mood: 0 });
      setNotes('');
      setInjury(false);
      setSessionId('');
      queryClient.invalidateQueries({ queryKey: ['portal', 'checkIns'] });
    } catch (err) {
      toast.error(err?.message || 'Could not save your check-in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Session-day wellness report"
        icon={Sparkles}
        description="Submit this on the day of a scheduled session so that session's coach can plan around how you feel."
      >
        {todaySessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No session today"
            body="Wellness reports open on the day of a confirmed session. Once you have a session today, you can send that coach your readiness report."
            compact
          />
        ) : (
          <div className="space-y-5">
            <div>
              <Label htmlFor="checkin-session">Session today</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger id="checkin-session" className="mt-1 bg-background">
                  <SelectValue placeholder="Choose today's session" />
                </SelectTrigger>
                <SelectContent>
                  {todaySessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {formatInTz(session.date, session.start_time, session.timezone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {SCALES.map((scale) => (
              <ScalePicker
                key={scale.key}
                scale={scale}
                value={values[scale.key]}
                onChange={(n) => setValues((current) => ({ ...current, [scale.key]: n }))}
              />
            ))}

            <div>
              <Label htmlFor="checkin-notes">Anything else? (optional)</Label>
              <Textarea
                id="checkin-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={4000}
                className="mt-1 bg-background"
                placeholder="Sore spots, school stress, big wins — anything you want your coach to know."
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={injury}
                onChange={(event) => setInjury(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-red-500"
              />
              <span>
                <span className="font-semibold text-foreground">Something hurts or might be an injury.</span>{' '}
                Checking this flags it for your coach. If it&apos;s serious, tell a parent, guardian, or doctor right away.
              </span>
            </label>

            <Button
              disabled={!ready || saving}
              onClick={submit}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
            >
              {saving ? 'Saving…' : 'Save check-in'}
            </Button>
            {!ready && (
              <p className="text-xs text-muted-foreground">Choose today's session and pick a 1–10 score for energy, soreness, and mood to save.</p>
            )}
          </div>
        )}
      </SectionCard>

      <CheckInHistory
        checkIns={checkInsQuery.data || []}
        loading={checkInsQuery.isLoading && athleteIds.length > 0}
        sessionsById={sessionsById}
      />
    </div>
  );
}
