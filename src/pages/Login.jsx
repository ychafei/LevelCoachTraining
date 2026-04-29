import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetchUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  const next = params.get('next') || '/dashboard';

  // If we arrived back from a magic link, finish the session.
  useEffect(() => {
    const userId = params.get('userId');
    const secret = params.get('secret');
    if (!userId || !secret) return;

    (async () => {
      try {
        setSubmitting(true);
        await auth.completeMagicLink(userId, secret);
        await refetchUser();
        navigate(next, { replace: true });
      } catch (err) {
        console.error('magic link failed', err);
        setError(err?.message || 'Sign-in link is invalid or expired.');
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    try {
      setSubmitting(true);
      const returnUrl = `${window.location.origin}/login?next=${encodeURIComponent(next)}`;
      await auth.sendMagicLink(email, returnUrl);
      setInfo('Check your inbox — we sent you a sign-in link.');
    } catch (err) {
      setError(err?.message || 'Could not send sign-in link.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setSubmitting(true);
      await auth.signInWithPassword(email, password);
      await refetchUser();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 border border-border rounded-lg p-6 bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a one-time sign-in link, or you can use your password.
          </p>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-3">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            Email me a sign-in link
          </Button>
        </form>

        <div className="border-t border-border pt-4">
          {!showPassword ? (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline"
              onClick={() => setShowPassword(true)}
            >
              Use a password instead
            </button>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
              <Button type="submit" variant="secondary" className="w-full" disabled={submitting}>
                Sign in with password
              </Button>
            </form>
          )}
        </div>

        {info  && <p className="text-sm text-emerald-600">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
