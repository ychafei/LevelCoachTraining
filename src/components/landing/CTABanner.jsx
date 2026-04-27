import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function CTABanner() {
  const [headline, setHeadline] = useState('READY TO TRAIN?');
  const [subtext, setSubtext] = useState('Book your first session today and experience the LC Training difference.');

  useEffect(() => {
    base44.entities.SiteContent.filter({ key: 'cta_headline' }).then(res => {
      if (res.length > 0) setHeadline(res[0].value);
    });
    base44.entities.SiteContent.filter({ key: 'cta_subtext' }).then(res => {
      if (res.length > 0) setSubtext(res[0].value);
    });
  }, []);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="font-oswald text-4xl sm:text-6xl font-bold tracking-tight text-foreground mb-6">
          {headline}
        </h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
          {subtext}
        </p>
        <div className="flex flex-col items-center gap-4">
          <Link to="/book">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 px-10 py-6 text-base font-oswald tracking-wider uppercase">
              Book Now <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <p className="text-xs font-oswald tracking-widest uppercase text-muted-foreground">
            Coach? <Link to="/apply" className="text-accent hover:underline">Apply to join the staff →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}