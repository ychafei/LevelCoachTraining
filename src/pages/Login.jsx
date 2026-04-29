import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PROVIDERS = [
  { id: 'google',    label: 'Google',    icon: GoogleIcon },
  { id: 'microsoft', label: 'Microsoft', icon: MicrosoftIcon },
  { id: 'facebook',  label: 'Facebook',  icon: FacebookIcon },
  { id: 'apple',     label: 'Apple',     icon: AppleIcon },
];

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetchUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const next = params.get('next') || '/dashboard';

  useEffect(() => {
    if (params.get('reset') === '1') {
      setInfo('Password updated — sign in to continue.');
    }
    if (params.get('oauth_error') === '1') {
      setError('Sign-in with that provider failed. Try another method.');
    }

    // Magic-link return path (kept for any outstanding magic-link emails).
    const userId = params.get('userId');
    const secret = params.get('secret');
    if (userId && secret) {
      (async () => {
        try {
          setSubmitting(true);
          await auth.completeMagicLink(userId, secret);
          await refetchUser();
          navigate(next, { replace: true });
        } catch (err) {
          setError(err?.message || 'Sign-in link is invalid or expired.');
          setSubmitting(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOAuth = (provider) => {
    setError(null);
    try {
      auth.createOAuthSession(provider, next);
    } catch (err) {
      setError(
        err?.code === 'general_provider_disabled' || /disabled/i.test(err?.message || '')
          ? `${provider} sign-in isn't configured yet.`
          : err?.message || 'Could not start sign-in.',
      );
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md bg-[#F7F5EF] text-[#0B0B0B] rounded-2xl shadow-2xl p-8 sm:p-10 space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-white p-2 shadow-md">
            <img src="/logo.png" alt="LC Training" className="h-20 w-20 rounded-full object-cover" />
          </div>
          <div className="text-center">
            <h1 className="font-oswald text-2xl sm:text-3xl font-bold tracking-wide">
              Welcome to LC Training
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Sign in to continue</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {PROVIDERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleOAuth(id)}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 border border-neutral-200 hover:border-neutral-400 transition rounded-md py-2.5 text-sm font-medium bg-white"
            >
              <Icon />
              <span>Continue with {label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs uppercase tracking-widest text-neutral-400">or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-neutral-700">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                required
                className="pl-9 bg-white text-[#0B0B0B] placeholder:text-neutral-400 border-neutral-300"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-neutral-700">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                className="pl-9 bg-white text-[#0B0B0B] placeholder:text-neutral-400 border-neutral-300"
              />
            </div>
          </div>

          {info  && <p className="text-sm text-emerald-600">{info}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#0B0B0B] hover:bg-black text-white py-2.5 rounded-md"
          >
            Sign in
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-neutral-600 hover:text-[#0B0B0B] underline-offset-4 hover:underline">
            Forgot password?
          </Link>
          <span className="text-neutral-500">
            Need an account?{' '}
            <Link to="/signup" className="font-semibold text-[#0B0B0B] underline-offset-4 hover:underline">
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.12a6.6 6.6 0 0 1 0-4.24V7.04H2.18a11 11 0 0 0 0 9.92l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="2"  y="2"  width="9" height="9" fill="#F25022"/>
      <rect x="13" y="2"  width="9" height="9" fill="#7FBA00"/>
      <rect x="2"  y="13" width="9" height="9" fill="#00A4EF"/>
      <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#000" d="M16.37 12.51c-.02-2.27 1.85-3.36 1.94-3.41-1.06-1.55-2.71-1.76-3.3-1.79-1.4-.14-2.74.83-3.45.83-.72 0-1.81-.81-2.97-.79-1.53.02-2.94.89-3.73 2.26-1.59 2.76-.41 6.85 1.14 9.1.76 1.1 1.66 2.34 2.84 2.3 1.14-.05 1.57-.74 2.95-.74 1.37 0 1.77.74 2.97.71 1.23-.02 2-1.12 2.75-2.23.87-1.28 1.22-2.52 1.24-2.59-.03-.01-2.39-.92-2.41-3.65zM14.13 5.78c.62-.76 1.04-1.81.93-2.86-.9.04-2 .6-2.65 1.35-.58.66-1.09 1.74-.95 2.76 1.01.08 2.04-.51 2.67-1.25z"/>
    </svg>
  );
}
