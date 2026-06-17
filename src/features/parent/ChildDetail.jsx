import React, { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Lock,
  PencilLine,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { callFn } from '@/lib/rpc';
import { CANCEL_POLICY_COPY } from '@/lib/policies';
import { useMySessions, useMyTraining } from '@/features/athlete/useAthletePortalData';
import AthleteTraining from '@/features/athlete/AthleteTraining';
import SessionsPanel from '@/features/athlete/SessionsPanel';
import ChildForm from '@/features/parent/ChildForm';
import { sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import {
  EmptyState,
  SectionCard,
  ageFromDob,
  parseJsonObject,
} from '@/features/athlete/portalShared';

const PERMISSIONS = [
  {
    key: 'can_book',
    label: 'Booking',
    description: 'Allow sessions to be booked for this athlete.',
  },
  {
    key: 'can_pay',
    label: 'Payments',
    description: 'Allow purchases and credit use for this athlete.',
  },
  {
    key: 'can_message',
    label: 'Messaging',
    description: 'Allow this athlete to message coaches (you keep read access).',
  },
];

function PermissionsCard({ child, link, onChanged }) {
  const [savingKey, setSavingKey] = useState('');

  const toggle = async (key, value) => {
    setSavingKey(key);
    try {
      const res = await callFn('family', { action: 'setPermissions', athlete_id: child.id, [key]: value });
      if (res?.error) throw new Error(res.error);
      toast.success('Permissions updated.');
      onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not update permissions.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <SectionCard
      title="Guardian permissions"
      icon={ShieldCheck}
      description="You control what can happen on this athlete's behalf. Changes apply immediately."
    >
      {!link ? (
        <EmptyState
          icon={ShieldCheck}
          title="No guardian link found"
          body="Permissions are managed on your guardian link for this athlete. If this looks wrong, contact support."
          compact
        />
      ) : (
        <ul className="space-y-3">
          {PERMISSIONS.map((permission) => (
            <li key={permission.key} className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{permission.label}</p>
                <p className="text-xs text-muted-foreground">{permission.description}</p>
              </div>
              <Switch
                checked={link[permission.key] !== false}
                disabled={savingKey === permission.key}
                onCheckedChange={(value) => toggle(permission.key, value)}
                aria-label={`${permission.label} ${link[permission.key] !== false ? 'enabled' : 'disabled'}`}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EmergencyCard({ child, onEdit }) {
  const contact = parseJsonObject(child.emergency_contact);
  return (
    <SectionCard
      title="Emergency & medical info"
      icon={Phone}
      description="Private — visible only to you, this athlete's coaches, and platform admins."
      action={(
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEdit}>
          <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Edit
        </Button>
      )}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Emergency contact</p>
          {contact && (contact.name || contact.phone) ? (
            <p className="mt-1 text-sm text-foreground">
              {contact.name || 'Unnamed contact'}
              {contact.relationship && <span className="text-muted-foreground"> ({contact.relationship})</span>}
              {contact.phone && <span className="block text-muted-foreground">{contact.phone}</span>}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not set yet — add one so coaches can reach you fast.</p>
          )}
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" /> Health notes
          </p>
          {child.health_notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{child.health_notes}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No health notes on file.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export default function ChildDetail({
  user,
  child,
  link,
  onBack,
  onFamilyChanged,
  reviewedSessionIds = null,
  onReviewChanged = () => {},
}) {
  const [editOpen, setEditOpen] = useState(false);
  const sessionsData = useMySessions(user, [child.id]);
  const trainingData = useMyTraining(user, [child.id]);

  const childSessions = sessionsData.sessions.filter((session) => session.athlete_id === child.id);
  const age = ageFromDob(child.dob);
  const sports = Array.isArray(child.sports) ? child.sports : [];
  const fullName = [child.first_name, child.last_name].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> All athletes
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-foreground">{fullName}</h2>
          {age !== null && <span className="text-sm text-muted-foreground">{age} years old</span>}
          {child.skill_level && (
            <Badge variant="outline" className="text-xs text-muted-foreground">{child.skill_level}</Badge>
          )}
        </div>
        {sports.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sports.map((sport) => {
              const Icon = sportIconFor(sport);
              return (
                <Badge key={sport} variant="outline" className="gap-1 border-accent/40 bg-accent/5 text-[11px] text-foreground">
                  <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
                  {sportDisplayName(sport)}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PermissionsCard child={child} link={link} onChanged={onFamilyChanged} />
        <EmergencyCard child={child} onEdit={() => setEditOpen(true)} />
      </div>

      <SectionCard
        title={`${child.first_name || 'Athlete'}'s sessions`}
        icon={CalendarDays}
        description={CANCEL_POLICY_COPY}
      >
        <SessionsPanel
          sessions={childSessions}
          coachesById={sessionsData.coachesById}
          loading={sessionsData.loading}
          onChanged={sessionsData.refresh}
          reviewedSessionIds={reviewedSessionIds}
          onReviewChanged={onReviewChanged}
          canManage
          emptyUpcoming={(
            <EmptyState
              icon={CalendarDays}
              title={`No upcoming sessions for ${child.first_name || 'this athlete'}`}
              body="Book a session with one of our coaches to get training on the calendar."
              cta={{ href: '/coaches', label: 'Find a coach' }}
              compact
            />
          )}
        />
      </SectionCard>

      <AthleteTraining
        trainingData={trainingData}
        fallbackSport={sports[0] || ''}
        coachesById={sessionsData.coachesById}
        readOnly
      />

      <ChildForm
        open={editOpen}
        onOpenChange={setEditOpen}
        child={child}
        onSaved={onFamilyChanged}
      />
    </div>
  );
}
