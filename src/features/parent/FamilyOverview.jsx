import React, { useState } from 'react';
import { PencilLine, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ChildForm from '@/features/parent/ChildForm';
import { sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import { EmptyState, SectionCard, SkeletonRows, ageFromDob } from '@/features/athlete/portalShared';

function ChildCard({ child, onView, onEdit }) {
  const age = ageFromDob(child.dob);
  const sports = Array.isArray(child.sports) ? child.sports : [];
  return (
    <article className="flex flex-col rounded-lg border border-border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold tracking-tight text-foreground">
            {[child.first_name, child.last_name].filter(Boolean).join(' ')}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {age !== null ? `${age} years old` : 'Age not set'}
            {child.skill_level && ` · ${child.skill_level}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs text-accent"
          onClick={() => onEdit(child)}
          aria-label={`Edit ${child.first_name || 'athlete'}'s profile`}
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {sports.length === 0 ? (
          <span className="text-xs text-muted-foreground">No sports selected yet</span>
        ) : (
          sports.map((sport) => {
            const Icon = sportIconFor(sport);
            return (
              <Badge key={sport} variant="outline" className="gap-1 border-accent/40 bg-accent/5 text-[11px] text-foreground">
                <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
                {sportDisplayName(sport)}
              </Badge>
            );
          })
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="mt-4 h-8 w-full text-xs"
        onClick={() => onView(child)}
      >
        View sessions, training & permissions
      </Button>
    </article>
  );
}

export default function FamilyOverview({ family, onViewChild }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingChild, setEditingChild] = useState(null);

  const openAdd = () => { setEditingChild(null); setFormOpen(true); };
  const openEdit = (child) => { setEditingChild(child); setFormOpen(true); };

  return (
    <SectionCard
      title="Your athletes"
      icon={Users}
      description="Each child gets their own athlete profile with sessions, training plans, and progress tracking."
      action={(
        <Button size="sm" onClick={openAdd} className="h-8 bg-accent text-xs text-accent-foreground hover:bg-accent/90">
          <UserPlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add child
        </Button>
      )}
    >
      {family.loading ? (
        <SkeletonRows rows={2} />
      ) : family.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {family.error?.message || 'Could not load your family.'}
        </p>
      ) : family.children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No athletes in your family yet"
          body="Add your child to manage their training, sign their documents, and book sessions on their behalf."
          cta={{ onClick: openAdd, label: 'Add your first child' }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {family.children.map((child) => (
            <ChildCard key={child.id} child={child} onView={onViewChild} onEdit={openEdit} />
          ))}
        </div>
      )}

      <ChildForm
        open={formOpen}
        onOpenChange={setFormOpen}
        child={editingChild}
        onSaved={family.refresh}
      />
    </SectionCard>
  );
}
