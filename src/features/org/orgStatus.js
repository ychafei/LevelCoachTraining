// Organization lifecycle status presentation — humanized labels + tone
// classes shared by the org portal surfaces. Display-only: the stored enum
// values ('pending_review', …) never change here.

export const ORG_STATUS_TONES = {
  draft: 'bg-secondary text-muted-foreground border-border',
  pending_review: 'bg-accent/10 text-accent border-accent/20',
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
  archived: 'bg-secondary text-muted-foreground border-border',
};

const ORG_STATUS_LABELS = {
  draft: 'Draft',
  pending_review: 'Pending review',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

export function orgStatusLabel(status) {
  return ORG_STATUS_LABELS[status] || status || 'Draft';
}

export function orgStatusTone(status) {
  return ORG_STATUS_TONES[status] || ORG_STATUS_TONES.draft;
}
