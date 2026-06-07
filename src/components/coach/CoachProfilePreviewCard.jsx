import React from 'react';
import { MapPin, BadgeCheck, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Public-facing coach card. Mirrors the Landing CoachShowcase aesthetic so a coach editing
// their profile sees exactly what a prospective client would see.
//
// `coach` may be a saved Coach record OR an in-progress draft (for live preview on
// /coach/profile). Missing fields render as muted placeholders so the editor surfaces gaps.

export default function CoachProfilePreviewCard({ coach, className = '' }) {
  const c = coach || {};
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Your name';
  const initials = `${(c.first_name || '?')[0] || ''}${(c.last_name || '')[0] || ''}`.toUpperCase() || '??';

  return (
    <div className={`group relative bg-card border border-border rounded-lg overflow-hidden ${className}`}>
      {/* Photo */}
      <div className="aspect-[3/4] bg-secondary relative overflow-hidden">
        {c.photo_url ? (
          <img
            src={c.photo_url}
            alt={`Coach ${fullName}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-6xl font-bold text-muted-foreground/20">
              {initials}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        {/* Top-right badges */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          {c.is_head_coach && (
            <Badge className="bg-accent text-accent-foreground border-0 text-[10px] font-display tracking-widest uppercase">
              <Star className="w-3 h-3 mr-1" /> Head Coach
            </Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-6 -mt-16 relative">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-display tracking-wider uppercase text-accent">
            {c.county ? `${c.county} County` : 'Set your county'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl font-bold tracking-wider text-foreground">
            {fullName}
          </h3>
          {c.email_verified_at && (
            <BadgeCheck className="w-4 h-4 text-accent" title="Verified contact email" />
          )}
        </div>

        {c.training_area ? (
          <p className="text-sm text-muted-foreground mt-1">{c.training_area}</p>
        ) : (
          <p className="text-sm text-muted-foreground/40 italic mt-1">Add a training area so clients know where you work</p>
        )}

        {c.specializations?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.specializations.slice(0, 4).map((spec) => (
              <Badge
                key={spec}
                variant="secondary"
                className="text-xs font-display tracking-wide uppercase bg-secondary text-muted-foreground"
              >
                {spec}
              </Badge>
            ))}
          </div>
        )}

        {c.quote ? (
          <p className="text-sm text-muted-foreground italic mt-4 border-l-2 border-accent/30 pl-3">
            "{c.quote}"
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic mt-4 border-l-2 border-border pl-3">
            Add a quote — it's the first thing clients read.
          </p>
        )}

        {c.bio && (
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed whitespace-pre-line">
            {c.bio}
          </p>
        )}

      </div>
    </div>
  );
}
