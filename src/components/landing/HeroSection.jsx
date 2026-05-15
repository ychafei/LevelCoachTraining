import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { siteContentRepo } from '@/api/repo';

export default function HeroSection() {
  const [headline, setHeadline] = useState('DOMINATE THE PITCH');
  const [subtext, setSubtext] = useState('Elite soccer training across Metro Detroit. Three counties. World-class coaching. Your next level starts here.');

  useEffect(() => {
    siteContentRepo.filter({ key: 'hero_headline' }).then(res => {
      if (res.length > 0) setHeadline(res[0].value);
    });
    siteContentRepo.filter({ key: 'hero_subtext' }).then(res => {
      if (res.length > 0) setSubtext(res[0].value);
    });
  }, []);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      
      {/* Diagonal accent line */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-accent/5 to-transparent skew-x-[-15deg] translate-x-20" />

      {/* Logo watermark — right side */}
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className="hidden md:block absolute right-[-4%] top-1/2 -translate-y-1/2 w-[55%] max-w-[720px] opacity-[0.08] pointer-events-none select-none"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-4xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-8">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-accent text-xs font-oswald tracking-widest uppercase">Metro Detroit's Premier Training</span>
          </div>

          {/* Headline */}
          <h1 className="font-oswald text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight text-foreground leading-[0.9] mb-8">
            {headline}
          </h1>

          {/* Subtext */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-dm-sans">
            {subtext}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-4">
            <Link to="/book">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-6 text-base font-oswald tracking-wider uppercase">
                Book a Session
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link to="/about">
              <Button variant="outline" className="px-8 py-6 text-base font-oswald tracking-wider uppercase border-border hover:bg-secondary">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </section>
  );
}