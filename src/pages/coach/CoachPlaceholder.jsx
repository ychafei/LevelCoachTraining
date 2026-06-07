import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

// Temporary placeholder for coach portal tabs that ship in later phases.
// Shows up inside CoachLayout so nav still works end-to-end.
export default function CoachPlaceholder({ title, blurb, phase, fallbackHref = '/coach', fallbackLabel = 'Back to Overview' }) {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-5 h-5 text-accent" />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-wider text-foreground uppercase mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-1">{blurb}</p>
      {phase && (
        <p className="text-[10px] font-display tracking-[0.3em] uppercase text-accent mt-3">{phase}</p>
      )}
      <div className="mt-6">
        <Link to={fallbackHref}>
          <Button variant="outline" className="font-display tracking-wider uppercase text-xs">{fallbackLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
