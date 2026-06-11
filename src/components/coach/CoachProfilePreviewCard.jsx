import React from 'react';
import { MapPin, BadgeCheck, Star, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getSport } from '@/lib/sportsCatalog';

// Public-facing coach card. Mirrors the marketplace aesthetic so a coach editing
// their profile sees exactly what a prospective client would see.
//
// `coach` may be a saved Coach record OR an in-progress draft (for live preview on
// /coach/profile). Missing fields render as muted placeholders so the editor
// surfaces gaps — only REAL data is ever shown as real.

function serviceLocationLabel(c) {
  const city = String(c.service_city || '').trim();
  const state = String(c.service_state || '').trim();
  if (city) return [city, state].filter(Boolean).join(', ');
  return '';
}

export default function CoachProfilePreviewCard({ coach, className = '' }) {
  const c = coach || {};
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Your name';
  const initials = `${(c.first_name || '?')[0] || ''}${(c.last_name || '')[0] || ''}`.toUpperCase() || '??';
  const location = serviceLocationLabel(c);
  const sports = Array.isArray(c.sports) ? c.sports : [];
  const priceCents = Number(c.price_hint_cents);
  const hasPriceHint = Number.isFinite(priceCents) && priceCents > 0;
  const ratingAvg = Number(c.rating_avg);
  const reviewCount = Number(c.review_count);

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
            <Badge className="bg-accent text-accent-foreground border-0 text-xs font-semibold">
              <Star className="w-3 h-3 mr-1" aria-hidden="true" /> Head coach
            </Badge>
          )}
          {c.intro_video_url && (
            <Badge variant="secondary" className="text-xs font-semibold">
              <Video className="w-3 h-3 mr-1" aria-hidden="true" /> Intro video
            </Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-6 -mt-16 relative">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            {location || c.training_area || 'Set your service area'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold tracking-[-0.01em] text-foreground">
            {fullName}
          </h3>
          {c.email_verified_at && (
            <BadgeCheck className="w-4 h-4 text-accent" aria-label="Verified contact email" />
          )}
        </div>

        {Number.isFinite(ratingAvg) && ratingAvg > 0 && Number.isFinite(reviewCount) && reviewCount > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Star className="w-3 h-3 text-amber-400 fill-current" aria-hidden="true" />
            <span className="text-foreground font-semibold">{ratingAvg.toFixed(1)}</span>
            ({reviewCount} review{reviewCount === 1 ? '' : 's'})
          </p>
        )}

        {sports.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sports.slice(0, 4).map((key) => (
              <Badge key={key} className="bg-accent/10 text-accent border border-accent/20 text-xs font-semibold">
                {getSport(key)?.display_name || key}
              </Badge>
            ))}
          </div>
        )}

        {c.training_area && location ? (
          <p className="text-sm text-muted-foreground mt-2">{c.training_area}</p>
        ) : !c.training_area && !location ? (
          <p className="text-sm text-muted-foreground/40 italic mt-2">Add a training area so clients know where you work</p>
        ) : null}

        {hasPriceHint && (
          <p className="text-sm text-foreground mt-2">
            From <span className="font-display font-bold">{(priceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            <span className="text-muted-foreground"> / session</span>
          </p>
        )}

        {c.specializations?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.specializations.slice(0, 4).map((spec) => (
              <Badge
                key={spec}
                variant="secondary"
                className="text-xs bg-secondary text-muted-foreground"
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
