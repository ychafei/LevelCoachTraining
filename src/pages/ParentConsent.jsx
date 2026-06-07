import React, { useEffect, useState } from 'react';
import { profileRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ShieldAlert, Users } from 'lucide-react';

export default function ParentConsent() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [status, setStatus] = useState('loading');
  const [child, setChild] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    profileRepo.filter({ parent_consent_token: token })
      .then((users) => {
        if (!users || users.length === 0) {
          setStatus('invalid');
          return;
        }
        const u = users[0];
        if (u.parent_consent_verified_at) {
          setChild(u);
          setStatus('already_verified');
          return;
        }
        setChild(u);
        setStatus('ready');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const childName = child ? `${child.first_name || ''} ${child.last_name || ''}`.trim() || child.email : '';
  const childAge = child?.dob ? Math.floor((Date.now() - new Date(child.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;

  const handleConsent = async () => {
    setSubmitting(true);
    try {
      await profileRepo.updateById(child.id, {
        parent_consent_verified_at: new Date().toISOString(),
        parent_consent_token: null,
      });
      setStatus('confirmed');
    } catch {
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await profileRepo.updateById(child.id, { parent_consent_token: null });
      setStatus('declined');
    } catch {
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {status === 'loading' && (
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {status === 'invalid' && (
          <div className="text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">LINK INVALID OR EXPIRED</h1>
            <p className="text-muted-foreground text-sm">
              This consent link is no longer valid. Ask your child to resend a new consent request from their LevelCoach Training account.
            </p>
          </div>
        )}

        {status === 'already_verified' && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">CONSENT ALREADY ON FILE</h1>
            <p className="text-muted-foreground text-sm">
              You've already consented for {childName}. No further action needed.
            </p>
          </div>
        )}

        {status === 'ready' && child && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex justify-center">
              <Users className="w-10 h-10 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground text-center">PARENT / GUARDIAN CONSENT</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{childName}</strong>{childAge ? ` (age ${childAge})` : ''} has requested your consent to use LevelCoach Training's Player Matching feature.
            </p>
            <div className="bg-secondary/50 border border-border rounded-lg p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
              <p>Player Matching lets your child discover other players in the Oakland, Macomb, and Wayne county areas:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Only first name and age are visible to other players.</li>
                <li>Messages between matched players are monitored for safety.</li>
                <li>You can revoke consent at any time by emailing support@levelcoach.com.</li>
              </ul>
              <p>
                Review the <a href="/terms" target="_blank" rel="noreferrer" className="text-accent underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer" className="text-accent underline">Privacy Policy</a> before consenting.
              </p>
            </div>
            <div className="space-y-2">
              <Button
                disabled={submitting}
                onClick={handleConsent}
                className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
              >
                {submitting ? 'Submitting...' : 'I Consent'}
              </Button>
              <Button
                disabled={submitting}
                onClick={handleDecline}
                variant="outline"
                className="w-full font-display tracking-wider uppercase"
              >
                I Do Not Consent
              </Button>
            </div>
          </div>
        )}

        {status === 'confirmed' && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">CONSENT RECORDED</h1>
            <p className="text-muted-foreground text-sm">
              Thank you. {childName} can now use Player Matching. You can close this page.
            </p>
          </div>
        )}

        {status === 'declined' && (
          <div className="text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">CONSENT DECLINED</h1>
            <p className="text-muted-foreground text-sm">
              Your response was recorded. {childName} will not be able to use Player Matching until a new consent is requested.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">SOMETHING WENT WRONG</h1>
            <p className="text-muted-foreground text-sm">
              We couldn't record your response. Please try again or contact support@levelcoach.com.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
