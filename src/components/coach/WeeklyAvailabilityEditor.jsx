import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultDay = () => ({ enabled: false, start: '08:00', end: '20:00' });

export default function WeeklyAvailabilityEditor({ availability = {}, onChange }) {
  const getDay = (day) => availability[day] || defaultDay();

  const updateDay = (day, field, value) => {
    onChange({
      ...availability,
      [day]: { ...getDay(day), [field]: value },
    });
  };

  return (
    <div className="space-y-3">
      {DAYS.map((day) => {
        const d = getDay(day);
        const isInvalid = d.enabled && d.start && d.end && d.start >= d.end;
        return (
          <div key={day} className={`p-3 rounded-lg bg-secondary/50 border ${isInvalid ? 'border-destructive/50' : 'border-border'}`}>
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                checked={d.enabled}
                onCheckedChange={(v) => updateDay(day, 'enabled', v)}
              />
              <span className={`font-display tracking-wider text-sm w-24 ${d.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                {day.toUpperCase()}
              </span>
              {d.enabled ? (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="time"
                    value={d.start}
                    onChange={(e) => updateDay(day, 'start', e.target.value)}
                    aria-invalid={isInvalid}
                    className={`bg-secondary w-32 text-sm ${isInvalid ? 'border-destructive' : 'border-border'}`}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={d.end}
                    onChange={(e) => updateDay(day, 'end', e.target.value)}
                    aria-invalid={isInvalid}
                    className={`bg-secondary w-32 text-sm ${isInvalid ? 'border-destructive' : 'border-border'}`}
                  />
                </div>
              ) : (
                <span className="ml-auto text-xs text-muted-foreground">Unavailable</span>
              )}
            </div>
            {isInvalid && (
              <p className="text-xs text-destructive mt-2 pl-[4.5rem]">End time must be after start time.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function hasAvailabilityErrors(availability = {}) {
  return DAYS.some((day) => {
    const d = availability[day];
    if (!d?.enabled) return false;
    if (!d.start || !d.end) return true;
    return d.start >= d.end;
  });
}
