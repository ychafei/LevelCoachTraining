import React from 'react';
import { Calendar, Users, Trophy, Newspaper, MapPin, Clock, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ROSTER_PLACEHOLDERS = Array.from({ length: 8 });
const SCHEDULE_PLACEHOLDERS = Array.from({ length: 5 });

const COACHING_STAFF = [
  { role: 'Head Coach', name: 'TBA', initials: 'HC' },
  { role: 'Assistant Coach', name: 'TBA', initials: 'AC' },
  { role: 'Goalkeeper Coach', name: 'TBA', initials: 'GK' },
];

export default function Team() {
  return (
    <div>
      {/* Hero */}
      <section className="relative py-24 sm:py-32 overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
        <div className="absolute top-20 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <img
          src="/logo-shield.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute right-[-140px] top-1/2 -translate-y-1/2 w-[640px] opacity-[0.10] mix-blend-screen hidden lg:block"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-8">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-accent text-xs font-oswald tracking-widest uppercase">UPSL · Men's Team</span>
          </div>

          <h1 className="font-oswald text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight text-foreground leading-[0.9] mb-6">
            LCFC <span className="text-accent">UPSL</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed font-dm-sans">
            Detroit's home for elite men's soccer. Competing in the United Premier Soccer League — the largest national pro-development league in the United States.
          </p>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl">
            {[
              { label: 'League', value: 'UPSL' },
              { label: 'Division', value: 'Midwest' },
              { label: 'Season', value: '2026' },
              { label: 'Home', value: 'Metro Detroit' },
            ].map((item) => (
              <div key={item.label} className="border border-border bg-card/50 rounded-lg p-4">
                <div className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground mb-1">{item.label}</div>
                <div className="font-oswald text-xl tracking-wider text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coaching Staff */}
      <section className="py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Behind the Bench"
            title="COACHING STAFF"
            description="The minds shaping the team's identity on and off the pitch."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {COACHING_STAFF.map((c) => (
              <div key={c.role} className="bg-card border border-border rounded-lg p-6 flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center">
                  <span className="font-oswald text-lg tracking-wider text-muted-foreground">{c.initials}</span>
                </div>
                <div>
                  <p className="text-[10px] font-oswald tracking-widest uppercase text-accent mb-1">{c.role}</p>
                  <p className="font-oswald text-xl tracking-wider text-foreground">{c.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roster */}
      <section className="py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="The Squad"
            title="ROSTER"
            description="Player announcements coming soon. Stay tuned for the 2026 squad reveal."
            icon={Users}
            badge="Coming Soon"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-12">
            {ROSTER_PLACEHOLDERS.map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-card border border-border rounded-lg flex flex-col items-center justify-center relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-accent/5" />
                <div className="w-20 h-20 rounded-full bg-secondary border border-border flex items-center justify-center mb-4">
                  <span className="font-oswald text-3xl text-muted-foreground/40">#{i + 1}</span>
                </div>
                <p className="font-oswald text-sm tracking-wider text-muted-foreground/60 uppercase">Player TBA</p>
                <p className="text-[10px] font-oswald tracking-widest uppercase text-muted-foreground/40 mt-1">Position</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section className="py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Match Day"
            title="SCHEDULE"
            description="The 2026 fixture list will be released ahead of the season opener."
            icon={Calendar}
            badge="Coming Soon"
          />

          <div className="mt-12 bg-card border border-border rounded-lg overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-border bg-secondary/50">
              <div className="col-span-2 text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Date</div>
              <div className="col-span-2 text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Time</div>
              <div className="col-span-4 text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Opponent</div>
              <div className="col-span-3 text-[10px] font-oswald tracking-widest uppercase text-muted-foreground">Venue</div>
              <div className="col-span-1 text-[10px] font-oswald tracking-widest uppercase text-muted-foreground text-right">Result</div>
            </div>
            {SCHEDULE_PLACEHOLDERS.map((_, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-5 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors">
                <div className="md:col-span-2 flex items-center gap-2 text-muted-foreground/60">
                  <Calendar className="w-4 h-4 md:hidden" />
                  <span className="font-oswald tracking-wider text-sm">TBA</span>
                </div>
                <div className="md:col-span-2 flex items-center gap-2 text-muted-foreground/60">
                  <Clock className="w-4 h-4 md:hidden" />
                  <span className="font-oswald tracking-wider text-sm">—</span>
                </div>
                <div className="md:col-span-4 font-oswald tracking-wider text-foreground/60">vs. TBA</div>
                <div className="md:col-span-3 flex items-center gap-2 text-muted-foreground/60">
                  <MapPin className="w-4 h-4 md:hidden" />
                  <span className="text-sm">Metro Detroit</span>
                </div>
                <div className="md:col-span-1 text-right">
                  <Badge variant="secondary" className="text-[10px] font-oswald tracking-widest uppercase">TBA</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* League / Standings */}
      <section className="py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="The League"
            title="UPSL & STANDINGS"
            description="The United Premier Soccer League is the largest pro-development league in the United States — more than 400 clubs across the country competing for promotion."
            icon={Trophy}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-12">
            <div className="bg-card border border-border rounded-lg p-8">
              <p className="text-xs font-oswald tracking-widest uppercase text-accent mb-3">About UPSL</p>
              <h3 className="font-oswald text-2xl tracking-wider text-foreground mb-4">PRO-DEVELOPMENT FOOTBALL</h3>
              <ul className="space-y-3 text-muted-foreground text-sm leading-relaxed">
                <li className="flex gap-3"><ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />400+ clubs across the United States</li>
                <li className="flex gap-3"><ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />Promotion & relegation between Premier, Championship, and D2 divisions</li>
                <li className="flex gap-3"><ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />Spring and fall seasons with national playoffs</li>
                <li className="flex gap-3"><ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />Pathway for players, coaches, and front-office talent</li>
              </ul>
            </div>

            <div className="bg-card border border-border rounded-lg p-8 flex flex-col">
              <p className="text-xs font-oswald tracking-widest uppercase text-accent mb-3">Conference Standings</p>
              <h3 className="font-oswald text-2xl tracking-wider text-foreground mb-4">MIDWEST DIVISION</h3>
              <div className="flex-1 flex items-center justify-center py-8 border border-dashed border-border rounded-md">
                <div className="text-center">
                  <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-oswald tracking-wider text-muted-foreground/60 uppercase text-sm">Standings released at kickoff</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* News & Updates */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Press Room"
            title="NEWS & UPDATES"
            description="Signings, match recaps, and announcements from the front office."
            icon={Newspaper}
          />

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
                <div className="aspect-video bg-secondary border-b border-border flex items-center justify-center">
                  <Newspaper className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <p className="text-[10px] font-oswald tracking-widest uppercase text-accent mb-2">Coming Soon</p>
                  <h3 className="font-oswald text-lg tracking-wider text-foreground mb-2">Team Announcement</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">First press releases drop ahead of the 2026 season opener. Follow along for roster reveals and matchday news.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, icon: Icon, badge }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-oswald tracking-widest uppercase text-accent mb-3 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          {eyebrow}
        </p>
        <h2 className="font-oswald text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {badge && (
        <Badge className="bg-accent/10 text-accent border-accent/20 font-oswald tracking-widest uppercase text-[10px] self-start sm:self-end">
          {badge}
        </Badge>
      )}
    </div>
  );
}
