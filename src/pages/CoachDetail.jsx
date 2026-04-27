import React, { useEffect, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, MapPin, Star, BadgeCheck, ShieldCheck, Calendar } from 'lucide-react';

// Public coach profile. Driven by getPublicCoaches so unauthenticated visitors
// can read it. The "Book with this coach" CTA passes ?coach_id and ?county into
// /book, and the booking flow auto-selects them when present.

export default function CoachDetail() {
  const { coachId } = useParams();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('getPublicCoaches', {});
        if (cancelled) return;
        const list = res?.data?.coaches || res?.coaches || [];
        const match = list.find(c => c.id === coachId);
        if (!match) {
          setError(true);
        } else {
          setCoach(match);
        }
      } catch (err) {
        console.error('CoachDetail load failed', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachId]);

  if (loading) {
    return (
      <div className="py-32 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (error || !coach) {
    return <Navigate to="/" replace />;
  }

  const fullName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim();
  const initials = `${(coach.first_name || '?')[0] || ''}${(coach.last_name || '')[0] || ''}`.toUpperCase();
  const bookHref = `/book?coach_id=${encodeURIComponent(coach.id)}&county=${encodeURIComponent(coach.county || '')}`;

  return (
    <div>
      {/* Hero / overview */}
      <section className="relative py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs font-oswald tracking-widest uppercase text-muted-foreground hover:text-foreground mb-8"
          >
            <ArrowLeft className="w-3 h-3" /> Back to home
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {/* Photo */}
            <div className="lg:col-span-2">
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-secondary border border-border relative">
                {coach.photo_url ? (
                  <img src={coach.photo_url} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-oswald text-7xl font-bold text-muted-foreground/20">{initials}</span>
                  </div>
                )}
                {coach.is_head_coach && (
                  <Badge className="absolute top-4 right-4 bg-accent text-accent-foreground border-0 text-[10px] font-oswald tracking-widest uppercase">
                    <Star className="w-3 h-3 mr-1" /> Head Coach
                  </Badge>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-2 text-accent text-xs font-oswald tracking-widest uppercase mb-3">
                <MapPin className="w-3 h-3" /> {coach.county} County
                {coach.email_verified_at && (
                  <span className="inline-flex items-center gap-1 ml-2 text-muted-foreground">
                    <BadgeCheck className="w-3 h-3" /> Verified contact
                  </span>
                )}
              </div>

              <h1 className="font-oswald text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[0.95]">
                {fullName.toUpperCase() || 'COACH'}
              </h1>

              {coach.training_area && (
                <p className="text-lg text-muted-foreground mt-4">
                  Trains around <span className="text-foreground">{coach.training_area}</span>
                </p>
              )}

              {coach.quote && (
                <blockquote className="mt-6 border-l-2 border-accent/50 pl-4 italic text-muted-foreground text-lg">
                  "{coach.quote}"
                </blockquote>
              )}

              {coach.specializations?.length > 0 && (
                <div className="mt-6">
                  <p className="text-[10px] font-oswald tracking-[0.3em] uppercase text-muted-foreground mb-2">Specializations</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coach.specializations.map(s => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="text-xs font-oswald tracking-wide uppercase bg-secondary text-foreground"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={bookHref}>
                  <Button className="bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-6 text-base font-oswald tracking-wider uppercase">
                    <Calendar className="w-4 h-4 mr-2" /> Book with {coach.first_name}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link to="/book">
                  <Button variant="outline" className="px-8 py-6 text-base font-oswald tracking-wider uppercase border-border hover:bg-secondary">
                    Compare coaches
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bio */}
      {coach.bio && (
        <section className="py-16 border-t border-border">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-oswald tracking-[0.3em] uppercase text-accent mb-4">About</p>
            <h2 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-6">
              MEET {(coach.first_name || '').toUpperCase()}
            </h2>
            <div className="text-muted-foreground leading-relaxed whitespace-pre-line text-base">
              {coach.bio}
            </div>
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section className="py-12 border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <ShieldCheck className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="font-oswald tracking-wider text-sm text-foreground uppercase">Vetted &amp; Reviewed</p>
            <p className="text-xs text-muted-foreground mt-1">Coaches go through an application and review before they appear here.</p>
          </div>
          <div>
            <MapPin className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="font-oswald tracking-wider text-sm text-foreground uppercase">Local Sessions</p>
            <p className="text-xs text-muted-foreground mt-1">Training happens at parks and turf in {coach.county} County.</p>
          </div>
          <div>
            <Calendar className="w-6 h-6 text-accent mx-auto mb-2" />
            <p className="font-oswald tracking-wider text-sm text-foreground uppercase">Schedule Flexibly</p>
            <p className="text-xs text-muted-foreground mt-1">Buy a package now, schedule sessions whenever it fits your week.</p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-oswald text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
            READY TO TRAIN WITH {(coach.first_name || '').toUpperCase()}?
          </h2>
          <p className="text-muted-foreground mb-8">
            Pick a package, choose a duration, and lock in a time on {coach.first_name}'s calendar.
          </p>
          <Link to={bookHref}>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 px-10 py-6 text-base font-oswald tracking-wider uppercase">
              Book a Session <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
