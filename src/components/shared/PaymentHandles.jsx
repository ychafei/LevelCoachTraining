import React from 'react';

export default function PaymentHandles({ coach, compact = false }) {
  const handles = [];
  if (coach?.venmo) handles.push({ name: 'Venmo', value: coach.venmo });
  if (coach?.zelle) handles.push({ name: 'Zelle', value: coach.zelle });
  if (coach?.cashapp) handles.push({ name: 'Cash App', value: coach.cashapp });
  if (coach?.paypal) handles.push({ name: 'PayPal', value: coach.paypal });
  if (coach?.cash_accepted) handles.push({ name: 'Cash', value: 'Accepted' });

  if (handles.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {handles.map(h => (
          <span key={h.name} className="text-xs bg-secondary px-2 py-1 rounded text-muted-foreground">
            {h.name}: {h.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs font-display tracking-widest uppercase text-muted-foreground mb-3">Payment Methods</p>
      <div className="space-y-2">
        {handles.map(h => (
          <div key={h.name} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{h.name}</span>
            <span className="text-foreground font-medium">{h.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}