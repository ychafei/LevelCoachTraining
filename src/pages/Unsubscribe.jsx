import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { unsubscribeRepo } from '@/api/repo';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2 } from 'lucide-react';

// Two supported flows, both handled by the emailDispatch function:
// 1. Email links carry ?email=…&token=… (HMAC token proves address ownership).
// 2. Signed-in members can manage their own address with no token — the
//    server verifies the session email matches.
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const { user, isAuthenticated } = useAuth();

  const linkEmail = params.get('email') || '';
  const token = params.get('token') || '';

  const [email, setEmail] = useState(linkEmail);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resubscribed, setResubscribed] = useState(false);
  const [error, setError] = useState('');

  // Prefill (and lock) the address for signed-in users without a link token.
  useEffect(() => {
    if (!linkEmail && isAuthenticated && user?.email) {
      setEmail(user.email);
    }
  }, [linkEmail, isAuthenticated, user?.email]);

  const emailLocked = Boolean(linkEmail) || (isAuthenticated && Boolean(user?.email));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await unsubscribeRepo.unsubscribe({ email, token, reason });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Could not update your email preferences.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubscribe = async () => {
    setSubmitting(true);
    setError('');
    try {
      await unsubscribeRepo.resubscribe({ email, token });
      setResubscribed(true);
    } catch (err) {
      setError(err?.message || 'Could not update your email preferences.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md space-y-4">
          <CheckCircle2 className="w-12 h-12 text-accent mx-auto" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {resubscribed ? 'Resubscribed' : 'Unsubscribed'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {resubscribed
              ? `${email} will receive our emails again.`
              : `${email} has been removed from our mailing list.`}
          </p>
          {!resubscribed && (
            <Button
              variant="outline"
              disabled={submitting}
              onClick={handleResubscribe}
              className="font-semibold"
            >
              {submitting ? 'Processing...' : 'Undo — resubscribe'}
            </Button>
          )}
          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="py-24">
      <div className="max-w-md mx-auto px-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-4">Unsubscribe</h1>
        <p className="text-muted-foreground mb-8">
          We're sorry to see you go. Confirm your email to unsubscribe from our mailing list.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="unsubscribe-email" className="text-xs font-semibold">Email</Label>
            <Input
              id="unsubscribe-email"
              required
              type="email"
              value={email}
              readOnly={emailLocked}
              onChange={e => setEmail(e.target.value)}
              className="bg-card border-border mt-1"
            />
            {!emailLocked && (
              <p className="text-xs text-muted-foreground mt-2">
                For your protection, you must be signed in with this address or use the
                unsubscribe link from one of our emails.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs font-semibold">Reason (optional)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-card border-border mt-1" aria-label="Reason for unsubscribing">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="too_many">Too many emails</SelectItem>
                <SelectItem value="not_relevant">Not relevant to me</SelectItem>
                <SelectItem value="never_signed_up">I never signed up</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
            {submitting ? 'Processing...' : 'Unsubscribe'}
          </Button>
        </form>
      </div>
    </div>
  );
}
