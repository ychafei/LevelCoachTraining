import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { homePathForRole } from '@/lib/roleHome';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, user: authedUser } = useAuth();
  const userId = params.get('userId');
  const secret = params.get('secret');
  const ran = useRef(false);

  const [state, setState] = useState(params.get('userId') ? 'verifying' : 'invalid'); // verifying|success|invalid|error
  const [errMsg, setErrMsg] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!userId || !secret) { setState('invalid'); return; }
    (async () => {
      try {
        const user = await auth.completeEmailVerification(userId, secret);
        setState('success');
        setTimeout(() => navigate(homePathForRole(user), { replace: true }), 1500);
      } catch (err) {
        setErrMsg(err?.message || 'This verification link is invalid or expired.');
        setState('error');
      }
    })();
  }, [userId, secret, navigate]);

  const resend = async () => {
    setResendError('');
    setResending(true);
    try {
      await auth.resendVerification();
      setResent(true);
    } catch (err) {
      setResendError(err?.message || 'Could not send a new verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md bg-[#FFFFFF] text-[#0F172A] rounded-2xl shadow-2xl p-8 sm:p-10 space-y-5 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em]">
          Email verification
        </h1>

        {state === 'verifying' && (
          <p className="text-sm text-neutral-600">Verifying your email…</p>
        )}

        {state === 'success' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md py-3 px-4" role="status">
            Email verified. Redirecting…
          </p>
        )}

        {(state === 'invalid' || state === 'error') && (
          <>
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md py-3 px-4" role="alert">
              {state === 'invalid'
                ? 'This verification link is invalid.'
                : errMsg}
            </p>

            {isAuthenticated && authedUser && !authedUser.email_verified && (
              <div className="space-y-2">
                {resent ? (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md py-3 px-4" role="status">
                    A new verification link is on its way to {authedUser.email}.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={resend}
                    disabled={resending}
                    className="w-full rounded-md bg-[#0F172A] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resending ? 'Sending…' : `Send a new link to ${authedUser.email}`}
                  </button>
                )}
                {resendError && <p className="text-xs text-red-600">{resendError}</p>}
              </div>
            )}

            <Link
              to="/login"
              className="inline-block text-sm text-[#0F172A] underline underline-offset-4 hover:opacity-80"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
