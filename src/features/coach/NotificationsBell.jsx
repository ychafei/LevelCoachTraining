import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Inbox } from 'lucide-react';
import { notificationRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { formatInstantInTz } from '@/lib/scheduleET';
import { cn } from '@/lib/utils';

// Org-invite notifications are actionable: deep-link the coach to the Pending
// Organization Invites panel on the dashboard (CoachOverview, #org-invites),
// where the invite can actually be accepted.
const ORG_INVITE_TYPES = new Set(['org_invite', 'org_member_invite']);
const ORG_INVITE_LINK = '/coach#org-invites';

// Real notifications bell, role-agnostic: reads the signed-in caller's own
// notifications rows (per-document grants scope listMine to the recipient),
// shows a real unread badge, and marks unread rows read when the panel opens.
// Used in the coach topbar (dark, default styles) and the platform Navbar
// (light — pass buttonClassName overrides; cn/twMerge resolves conflicts).
export default function NotificationsBell({ buttonClassName = '' }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const profileId = user?.id || '';

  const load = useCallback(async () => {
    if (!profileId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await notificationRepo.listMine(profileId);
      setItems(rows || []);
    } catch (err) {
      console.warn('Notifications load failed', err?.message || err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void load(); }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => n.read !== true);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (!next || unread.length === 0) return;
    // Mark read on open — the recipient's per-document update grant allows
    // exactly this write.
    const toMark = unread.slice(0, 50);
    setItems((prev) => prev.map((n) => (n.read === true ? n : { ...n, read: true })));
    await Promise.allSettled(toMark.map((n) => notificationRepo.markRead(n.id)));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          buttonClassName,
        )}
        aria-label={unread.length > 0 ? `Open notifications (${unread.length} unread)` : 'Open notifications'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-6 w-6" aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 text-foreground shadow-xl"
        >
          <p className="px-2 pb-2 text-sm font-semibold">Notifications</p>
          {loading ? (
            <div className="space-y-2 px-2 pb-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-secondary" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Booking and payment updates will show up here.</p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.slice(0, 25).map((n) => {
                const isOrgInvite = ORG_INVITE_TYPES.has(n.type);
                const actionLabel = isOrgInvite ? 'Review invitation' : (n.link ? 'Open' : '');
                return (
                  <li key={n.id} className="rounded-md px-2 py-2 hover:bg-secondary/60">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{n.title || 'Notification'}</p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                          {formatInstantInTz(n.created_date)}
                        </p>
                        {actionLabel && (
                          <Link
                            to={n.link || ORG_INVITE_LINK}
                            onClick={() => setOpen(false)}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                          >
                            {actionLabel}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
