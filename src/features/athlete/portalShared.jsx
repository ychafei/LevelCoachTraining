import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { zonedStartUtcMs } from '@/lib/scheduleET';

// Shared primitives for the athlete + parent portals. Both portal areas are
// owned together, so the parent feature components import from here too.

// Render integer cents as USD. Money never renders from floats.
export function usd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// UTC ms for a session's start in its own timezone (null when malformed).
export function sessionStartMs(session) {
  if (session?.starts_at_utc) {
    const ms = Date.parse(session.starts_at_utc);
    if (Number.isFinite(ms)) return ms;
  }
  return zonedStartUtcMs(session?.date, session?.start_time, session?.timezone);
}

export function isUpcomingSession(session, nowMs = Date.now()) {
  if (!['pending', 'confirmed'].includes(session?.status)) return false;
  const ms = sessionStartMs(session);
  return ms !== null && ms > nowMs;
}

export function coachDisplayName(coach) {
  if (!coach) return 'Coach';
  return [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() || 'Coach';
}

export function coachLocationLabel(coach) {
  if (!coach) return '';
  if (coach.service_venue) return coach.service_venue;
  const cityState = [coach.service_city, coach.service_state].filter(Boolean).join(', ');
  return cityState || coach.training_area || '';
}

export function ageFromDob(dob) {
  const ms = Date.parse(String(dob || ''));
  if (!Number.isFinite(ms)) return null;
  const birth = new Date(ms);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// --- Layout primitives -------------------------------------------------------

export function SectionCard({ title, icon: Icon, description, action, children, className }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />}
              <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h2>
            </div>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, body, cta = null, compact = false }) {
  return (
    <div className={cn(
      'rounded-md border border-dashed border-border bg-background/40 text-center',
      compact ? 'p-5' : 'p-8',
    )}
    >
      {Icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>}
      {cta && (
        <Button asChild size="sm" className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
          {cta.href ? (
            <Link to={cta.href}>{cta.label}</Link>
          ) : (
            <button type="button" onClick={cta.onClick}>{cta.label}</button>
          )}
        </Button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 3, className }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-md bg-secondary/50" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5', className)} role="status" aria-label="Loading">
      <div className="h-5 w-40 animate-pulse rounded bg-secondary/60" />
      <div className="mt-4 h-20 animate-pulse rounded bg-secondary/40" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

const SESSION_STATUS_STYLES = {
  pending: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  confirmed: 'border-green-500/20 bg-green-500/10 text-green-500',
  completed: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  cancelled: 'border-border bg-secondary/50 text-muted-foreground',
  no_show: 'border-destructive/20 bg-destructive/10 text-destructive',
};

const SESSION_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export function SessionStatusBadge({ status }) {
  return (
    <Badge className={cn('shrink-0', SESSION_STATUS_STYLES[status] || SESSION_STATUS_STYLES.cancelled)}>
      {SESSION_STATUS_LABELS[status] || status || 'Unknown'}
    </Badge>
  );
}

// Simple 0-10 score bar used in assessments and goals.
export function ScoreBar({ value, max = 10, label }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100));
  return (
    <div
      className="h-2 w-full rounded-full bg-secondary"
      role="img"
      aria-label={label || `${value} out of ${max}`}
    >
      <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

// --- Motion + dashboard primitives -------------------------------------------

// Fade-and-rise reveal. Honors prefers-reduced-motion: when reduced motion is
// requested the element renders in its final state with no animation.
export function Reveal({ children, as = 'div', delay = 0, y = 12, className, ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className} {...rest}>{children}</Tag>;
  }
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// Compact dashboard stat tile. Renders a real number (or "—"/skeleton) with an
// icon, optional sub-line, and optional CTA. Used by the athlete hero row.
export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  href,
  action,
  loading = false,
  tone = 'accent',
}) {
  const toneRing = {
    accent: 'bg-accent/10 text-accent',
    green: 'bg-green-500/10 text-green-500',
    amber: 'bg-yellow-500/10 text-yellow-500',
    blue: 'bg-blue-500/10 text-blue-400',
  }[tone] || 'bg-accent/10 text-accent';

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', toneRing)}>
          {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
        </span>
        <p className="pt-1.5 text-sm font-semibold leading-snug text-foreground">{label}</p>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-secondary/60" aria-hidden="true" />
        ) : (
          <p className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</p>
        )}
        {sub && !loading && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        {href && action && !loading && (
          <Link
            to={href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}
