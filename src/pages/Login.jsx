import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { postAuthRedirectPath } from '@/lib/roleHome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

// auth.js throws { type: 'account_banned' } after dropping the session of a
// suspended account — surface that distinctly from bad credentials. Token
// failures (expired magic link / OAuth return) are also 401s but must not
// read as a password problem on a passwordless flow.
function loginErrorMessage(err, fallback) {
  if (err?.type === 'account_banned') {
    return `This account has been suspended and can no longer sign in. If you believe this is a mistake, contact ${SUPPORT_EMAIL}.`;
  }
  if (err?.type === 'user_invalid_token' || err?.type === 'user_session_already_exists') {
    return 'Sign-in could not be completed — the link or sign-in attempt is invalid or expired. Please try again.';
  }
  if (err?.code === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (err?.status === 429 || /too many requests|rate limit|could not process profile request|accountProfile failed/i.test(err?.message || '')) {
    return 'Your sign-in worked, but your profile is still loading. Wait a few seconds, then try again.';
  }
  if (err?.code === 401) return 'Invalid email or password.';
  return err?.message || fallback;
}

function shouldRefetchAfterTokenError(err) {
  if (!err) return false;
  if (err?.status === 429) return false;
  if (/too many requests|rate limit|could not process profile request|accountProfile failed/i.test(err?.message || '')) return false;
  return err?.code === 401 || err?.type === 'user_invalid_token' || err?.type === 'user_session_already_exists';
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refetchUser, adoptAuthenticatedUser, isAuthenticated, isLoadingAuth, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [info, setInfo] = useState(null);

  const explicitNext = params.get('next');
  const safeNext = getSafeNextPath(explicitNext);

  // While a token sign-in (OAuth return / magic link) is being completed, the
  // already-authenticated redirect must hold off — AuthContext's concurrent
  // session check could otherwise navigate away and unmount this page
  // mid-completion. Token completion navigates explicitly when it finishes.
  const completingToken = useRef(false);

  useEffect(() => {
    if (completingToken.current) return;
    if (!isLoadingAuth && isAuthenticated && user) {
      navigate(postAuthRedirectPath(user, safeNext), { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, safeNext, navigate]);

  useEffect(() => {
    if (params.get('reset') === '1') {
      setInfo('Password updated. Sign in to continue.');
    }
    if (params.get('oauth_error') === '1') {
      setFormError('Sign-in with that provider failed. Try another method.');
    }

    // OAuth (token flow) and magic links both return here with userId+secret.
    const userId = params.get('userId');
    const secret = params.get('secret');
    if (userId && secret) {
      completingToken.current = true;
      // Scrub the one-time secret from the address bar / history immediately.
      const scrubbed = new URLSearchParams(window.location.search);
      scrubbed.delete('userId');
      scrubbed.delete('secret');
      const qs = scrubbed.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      (async () => {
        try {
          setSubmitting(true);
          const fresh = await auth.completeTokenSession(userId, secret);
          adoptAuthenticatedUser(fresh);
          completingToken.current = false;
          navigate(postAuthRedirectPath(fresh, safeNext), { replace: true });
        } catch (err) {
          completingToken.current = false;
          setFormError(loginErrorMessage(err, 'Sign-in could not be completed — the link or sign-in attempt is invalid or expired. Please try again.'));
          setSubmitting(false);
          // Re-sync auth state: an existing session survives a stale token
          // (create-first semantics), and the redirect effect may then route
          // the still-signed-in user onward.
          if (shouldRefetchAfterTokenError(err)) refetchUser().catch(() => null);
        }
      })();
    }
     
  }, []);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setFormError(null);
    setInfo(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      await auth.signOut();
      const fresh = await auth.signInWithPassword(email.trim(), password);
      adoptAuthenticatedUser(fresh);
      navigate(postAuthRedirectPath(fresh, safeNext), { replace: true });
    } catch (err) {
      setFormError(loginErrorMessage(err, 'Invalid email or password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    setInfo(null);
    try {
      await auth.signOut();
      auth.createOAuthSession('google', safeNext || undefined);
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-in.');
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_70px_rgba(15,23,42,0.10)]">
            <div className="px-6 py-10 sm:px-10 lg:px-14">
              <div className="mx-auto w-full max-w-[460px]">
                <h1 className="text-4xl font-extrabold tracking-[-0.02em] text-slate-950 sm:text-5xl">
                  Welcome back
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  Sign in to continue to your LevelCoach account.
                </p>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={submitting}
                  className="mt-8 flex h-[58px] w-full items-center justify-center gap-4 rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon className="h-6 w-6" />
                  Continue with Google
                </button>

                <div className="my-8 flex items-center gap-4">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-base font-medium text-slate-500">or continue with</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <form onSubmit={handlePasswordLogin} noValidate className="space-y-6">
                  <AuthField
                    id="email"
                    label="Email address"
                    type="email"
                    icon={Mail}
                    autoComplete="email"
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    error={errors.email}
                  />

                  <AuthField
                    id="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    icon={Lock}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    error={errors.password}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />

                  <div className="flex items-center justify-end">
                    <Link
                      to="/forgot-password"
                      className="text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {info && (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      {info}
                    </p>
                  )}
                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-[52px] w-full items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? 'Signing in...' : 'Sign in'}
                  </button>
                </form>

                <p className="mt-8 text-center text-base text-slate-600">
                  Don&apos;t have an account?{' '}
                  <Link to="/create-account" className="font-semibold text-blue-700 hover:underline">
                    Create free account
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LoginFooter />
    </div>
  );
}

function getSafeNextPath(next) {
  if (!next) return null;

  try {
    const parsed = new URL(next, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;

    if (['/login', '/sign-in', '/signup', '/create-account', '/create-account/athlete'].includes(parsed.pathname)) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function AuthField({
  id,
  label,
  icon: Icon,
  error,
  trailing,
  ...inputProps
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-3 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          className={`h-[52px] w-full rounded-lg border bg-white pl-14 text-base text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            trailing ? 'pr-14' : 'pr-4'
          } ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
        {trailing && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function LoginFooter() {
  return (
    <footer className="bg-white">
      <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-6 px-4 py-7 sm:px-6 md:flex-row lg:px-8">
        <img src="/levelcoach-wordmark.png" alt="LevelCoach Training" className="h-12 w-auto object-contain" />

        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
          <Link to="/terms" className="text-slate-500 transition-colors hover:text-blue-700">
            Terms
          </Link>
          <Link to="/privacy" className="text-slate-500 transition-colors hover:text-blue-700">
            Privacy Notice
          </Link>
          <Link to="/resources" className="text-slate-500 transition-colors hover:text-blue-700">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
