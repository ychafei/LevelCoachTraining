import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowRight, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CoachShowcase() {
  const [coaches, setCoaches] = useState([]);

  useEffect(() => {
    base44.entities.Coach.filter({ is_active: true }, 'display_order').then(setCoaches);
  }, []);

  if (coaches.length === 0) return null;

  return (
    <section className="py-24 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="font-oswald text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            MEET THE COACHES
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Hand-picked professionals dedicated to developing the next generation of athletes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {coaches.map((coach) => (
            <Link
              key={coach.id}
              to={`/coaches/${coach.id}`}
              className="group relative bg-card border border-border rounded-lg overflow-hidden hover:border-accent/30 transition-all duration-500 block focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-label={`View profile for ${coach.first_name} ${coach.last_name}`}
            >
              {/* Photo */}
              <div className="aspect-[3/4] bg-secondary relative overflow-hidden">
                {coach.photo_url ? (
                  <img
                    src={coach.photo_url}
                    alt={`Coach ${coach.first_name} ${coach.last_name}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-oswald text-6xl font-bold text-muted-foreground/20">
                      {coach.first_name?.[0]}{coach.last_name?.[0]}
                    </span>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                {coach.is_head_coach && (
                  <Badge className="absolute top-3 right-3 bg-accent text-accent-foreground border-0 text-[10px] font-oswald tracking-widest uppercase">
                    <Star className="w-3 h-3 mr-1" /> Head Coach
                  </Badge>
                )}
              </div>

              {/* Info */}
              <div className="p-6 -mt-16 relative">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs font-oswald tracking-wider uppercase text-accent">{coach.county} County</span>
                </div>
                <h3 className="font-oswald text-xl font-bold tracking-wider text-foreground">
                  {coach.first_name} {coach.last_name}
                </h3>
                {coach.training_area && (
                  <p className="text-sm text-muted-foreground mt-1">{coach.training_area}</p>
                )}
                {coach.specializations?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {coach.specializations.slice(0, 3).map((spec) => (
                      <Badge key={spec} variant="secondary" className="text-xs font-oswald tracking-wide uppercase bg-secondary text-muted-foreground">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                )}
                {coach.quote && (
                  <p className="text-sm text-muted-foreground italic mt-4 border-l-2 border-accent/30 pl-3">
                    "{coach.quote}"
                  </p>
                )}
                <div className="mt-5 flex items-center gap-1 text-xs font-oswald tracking-widest uppercase text-accent group-hover:gap-2 transition-all">
                  View profile <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}