import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { MapPin, Target, Users, Trophy, Upload } from 'lucide-react';
import useCurrentUser from '@/hooks/useCurrentUser';

export default function About() {
  const [coaches, setCoaches] = useState([]);
  const [foundersPhoto, setFoundersPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    base44.entities.Coach.filter({ is_active: true }, 'display_order').then(setCoaches);
    base44.entities.SiteContent.filter({ key: 'founders_photo' }).then(results => {
      if (results.length > 0) setFoundersPhoto(results[0]);
    });
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    if (foundersPhoto) {
      await base44.entities.SiteContent.update(foundersPhoto.id, { value: file_url });
      setFoundersPhoto({ ...foundersPhoto, value: file_url });
    } else {
      const record = await base44.entities.SiteContent.create({ key: 'founders_photo', value: file_url, content_type: 'image' });
      setFoundersPhoto(record);
    }
    setUploading(false);
  };

  return (
    <div>
      {/* Hero */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-oswald text-5xl sm:text-7xl font-bold tracking-tight text-foreground mb-6">
              THE LC TRAINING STORY
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Founded with a passion for developing soccer talent in Metro Detroit, LC Training brings 
              elite-level coaching to Oakland, Macomb, and Wayne counties. We believe every player 
              deserves access to professional training, regardless of their starting point.
            </p>
          </div>
        </div>
      </section>

      {/* Founders Story */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Photo */}
            <div className="relative">
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-secondary border border-border relative group">
                {foundersPhoto?.value ? (
                  <img src={foundersPhoto.value} alt="LC Training Founders" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-muted-foreground text-sm font-oswald tracking-wider uppercase">Founders Photo</p>
                  </div>
                )}
                {isAdmin && (
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    <div className="text-center text-white">
                      <Upload className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-oswald tracking-wider">{uploading ? 'UPLOADING...' : 'UPLOAD PHOTO'}</p>
                    </div>
                  </label>
                )}
              </div>
              {/* Decorative accent line */}
              <div className="absolute -bottom-4 -left-4 w-32 h-1 bg-accent" />
            </div>

            {/* Story */}
            <div>
              <p className="text-xs font-oswald tracking-widest uppercase text-accent mb-4">Our Story</p>
              <h2 className="font-oswald text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-6">
                THREE TEAMMATES. ONE DREAM.
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  It started on a college soccer field — three young men from Metro Detroit who shared more than just a love 
                  for the beautiful game. We shared a belief that the players who never got the right guidance, the right 
                  coaching, the right push — were the ones who needed it most.
                </p>
                <p>
                  Through four years of early morning trainings, late-night film sessions, and the kind of brotherhood 
                  only a locker room can build, we made a pact: when our playing days were behind us, we'd come back home 
                  and give the next generation what we wished we'd had.
                </p>
                <p>
                  LC Training was born from that promise. We returned to Oakland, Macomb, and Wayne counties — the same 
                  fields where we first learned to love the game — and built something we're proud of. Not just a training 
                  program, but a community. A family.
                </p>
                <p className="text-foreground font-medium">
                  Every player we coach carries a piece of that college promise with them. That's why we show up every 
                  single day, cones in hand and hearts full.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Target, title: 'PRECISION', desc: 'Every session is tailored to the individual athlete.' },
              { icon: Users, title: 'COMMUNITY', desc: 'Building connections across Metro Detroit.' },
              { icon: Trophy, title: 'EXCELLENCE', desc: 'We push boundaries and raise the standard.' },
              { icon: MapPin, title: 'LOCAL', desc: 'Three counties, one mission.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-oswald text-lg font-bold tracking-wider text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-oswald text-4xl font-bold tracking-tight text-foreground mb-12 text-center">
            THE COACHING STAFF
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {coaches.map((coach) => (
              <div key={coach.id} className="bg-card border border-border rounded-lg p-6">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4 overflow-hidden">
                  {coach.photo_url ? (
                    <img src={coach.photo_url} alt={coach.first_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-oswald text-2xl font-bold text-muted-foreground/30">
                      {coach.first_name?.[0]}{coach.last_name?.[0]}
                    </span>
                  )}
                </div>
                <div className="text-center">
                  <h3 className="font-oswald text-xl font-bold tracking-wider text-foreground">
                    {coach.first_name} {coach.last_name}
                  </h3>
                  <div className="flex items-center justify-center gap-1.5 text-accent text-xs font-oswald tracking-wider uppercase mt-1">
                    <MapPin className="w-3 h-3" /> {coach.county} County
                  </div>
                  {coach.bio && (
                    <p className="text-sm text-muted-foreground mt-4">{coach.bio}</p>
                  )}
                  {coach.specializations?.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                      {coach.specializations.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}