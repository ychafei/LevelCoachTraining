import React, { useState } from 'react';
import { unsubscribeRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';

export default function Unsubscribe() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await unsubscribeRepo.create({ email, reason });
    setSubmitting(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <CheckCircle2 className="w-12 h-12 text-accent mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground mb-2">UNSUBSCRIBED</h1>
          <p className="text-muted-foreground text-sm">You've been removed from our mailing list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-24">
      <div className="max-w-md mx-auto px-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-4">UNSUBSCRIBE</h1>
        <p className="text-muted-foreground mb-8">We're sorry to see you go. Enter your email to unsubscribe from our mailing list.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="font-display tracking-wider uppercase text-xs">Email</Label>
            <Input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-card border-border mt-1" />
          </div>
          <div>
            <Label className="font-display tracking-wider uppercase text-xs">Reason (optional)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-card border-border mt-1"><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="too_many">Too many emails</SelectItem>
                <SelectItem value="not_relevant">Not relevant to me</SelectItem>
                <SelectItem value="never_signed_up">I never signed up</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
            {submitting ? 'Processing...' : 'Unsubscribe'}
          </Button>
        </form>
      </div>
    </div>
  );
}