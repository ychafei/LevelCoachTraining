import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Stub page — Wave-2b replaces this with the full admin experience.
export default function AdminReconciliation() {
  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-2">RECONCILIATION</h1>
        <p className="text-muted-foreground mb-8">This page is coming together.</p>
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-2/3" />
        </div>
      </div>
    </div>
  );
}
