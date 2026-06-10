import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { rpc } from '@/lib/rpc';
import { toast } from 'sonner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultDay = () => ({ enabled: false, start: '08:00', end: '20:00' });

// Persist the weekly schedule through the coachSelf function (clients can no
// longer write `coaches` directly). Payload keeps the legacy weekly JSON shape:
// { Monday: { enabled, start, end }, ... }
export async function saveWeeklyAvailability(availability) {
  const res = await rpc.invoke('coachSelf', { action: 'setAvailability', availability });
  return res.data;
}

export function hasAvailabilityErrors(availability = {}) {
  return DAYS.some((day) => {
    const d = availability[day];
    if (!d?.enabled) return false;
    if (!d.start || !d.end) return true;
    return d.start >= d.end;
  });
}

export default function WeeklyAvailabilityEditor({
  availability = {},
  onChange,
  onSaved = null,
  showSaveButton = true,
}) {
  const [saving, setSaving] = useState(false);
  const getDay = (day) => availability[day] || defaultDay();

  const updateDay = (day, field, value) => {
    onChange({
      ...availability,
      [day]: { ...getDay(day), [field]: value },
    });
  };

  const handleSave = async () => {
    if (hasAvailabilityErrors(availability)) {
      toast.error('Fix the highlighted time windows before saving.');
      return;
    }
    setSaving(true);
    try {
      await saveWeeklyAvailability(availability);
      toast.success('Weekly availability saved.');
      onSaved?.(availability);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save availability.');
    } finally {
      setSaving(false);
    }
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
                aria-label={`${day} availability`}
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
                    aria-label={`${day} start time`}
                    className={`bg-secondary w-32 text-sm ${isInvalid ? 'border-destructive' : 'border-border'}`}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={d.end}
                    onChange={(e) => updateDay(day, 'end', e.target.value)}
                    aria-invalid={isInvalid}
                    aria-label={`${day} end time`}
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
      {showSaveButton && (
        <div className="flex justify-end pt-1">
          <Button
            onClick={handleSave}
            disabled={saving || hasAvailabilityErrors(availability)}
            className="h-10 font-display tracking-wider uppercase"
          >
            {saving ? 'Saving...' : 'Save Weekly Availability'}
          </Button>
        </div>
      )}
    </div>
  );
}
