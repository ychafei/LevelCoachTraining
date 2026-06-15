import React, { useState } from 'react';
import { ChevronDown, DollarSign, MapPin, Package, Sparkles, Timer, User, WalletCards } from 'lucide-react';

// Persistent summary used inside the booking flow. Same content in two layouts:
//   - sidebar:     sticky panel for desktop (lg:)
//   - collapsible: mobile-friendly toggle for narrow viewports
//
// Driven entirely by props — no data fetching of its own. Steps in Book.jsx
// already hold all the relevant state.

function Row({ label, value, icon: Icon, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
      <div className="text-right min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{value || <span className="text-muted-foreground/60">—</span>}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function Body({
  coach,
  coachLocationLabel,
  pkg,
  duration,
  sessionPrice,
  packageTotal,
  usingCredit,
  creditRemaining,
  creditRemainingBalance,
  creditDurationMinutes,
  creditPackageName,
  sportLabel,
  sessionFormatLabel,
}) {
  const coachLabel = coach ? `${coach.first_name} ${coach.last_name}${coach.is_head_coach ? ' · Head' : ''}` : '';
  const pkgLabel = pkg ? pkg.name : '';
  const durationLabel = duration?.label || (creditDurationMinutes ? `${creditDurationMinutes / 60} hr${creditDurationMinutes > 60 ? 's' : ''}` : '');
  const bookingLocationLabel = sessionFormatLabel || coachLocationLabel || '';

  return (
    <div className="divide-y divide-border">
      <Row label="Coach" value={coachLabel} icon={User} />
      <Row label="Sport" value={sportLabel} icon={Sparkles} />
      <Row label="Format" value={bookingLocationLabel} icon={MapPin} />
      {usingCredit ? (
        <>
          <Row label="Package" value={creditPackageName} icon={Package} />
          <Row
            label="Credit"
            value={creditRemainingBalance != null ? `$${creditRemainingBalance}` : (creditRemaining != null ? `${creditRemaining}` : '')}
            icon={WalletCards}
            hint="using existing balance"
          />
          <Row label="Duration" value={durationLabel} icon={Timer} />
        </>
      ) : (
        <>
          <Row label="Package" value={pkgLabel} icon={Package} hint={pkg?.sessions > 1 ? `${pkg.sessions} sessions` : undefined} />
          <Row label="Duration" value={durationLabel} icon={Timer} hint={duration?.discount ? `−${Math.round(duration.discount * 100)}% multi-hour` : undefined} />
          <Row
            label="Per session"
            value={sessionPrice != null ? `$${sessionPrice}` : ''}
            icon={DollarSign}
          />
          {pkg?.sessions > 1 && sessionPrice != null && (
            <Row
              label="Package total"
              value={`$${packageTotal}`}
              icon={DollarSign}
              hint={`${pkg.sessions} × $${sessionPrice}`}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function BookingSummaryCard(props) {
  // Desktop sidebar — always expanded, sticky.
  // Mobile — collapsible card above the action buttons.
  const [open, setOpen] = useState(false);

  const headerLine = (() => {
    const parts = [];
    if (props.coach) parts.push(`${props.coach.first_name}`);
    if (props.usingCredit) {
      if (props.creditRemainingBalance != null) parts.push(`$${props.creditRemainingBalance} credit`);
      else if (props.creditRemaining != null) parts.push(`${props.creditRemaining} left`);
    } else if (props.pkg) {
      parts.push(props.pkg.name);
    }
    return parts.join(' · ') || 'Start by choosing a coach';
  })();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 bg-card border border-border rounded-lg p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Your selection</p>
          <Body {...props} />
        </div>
      </aside>

      {/* Mobile collapsible — render this where you want it inline */}
      <div className="lg:hidden bg-card border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Your selection</p>
            <p className="text-sm font-semibold text-foreground truncate">{headerLine}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="px-4 pb-4 -mt-1">
            <Body {...props} />
          </div>
        )}
      </div>
    </>
  );
}
