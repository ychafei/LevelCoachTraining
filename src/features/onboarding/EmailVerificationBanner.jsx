import React, { useState } from 'react';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { auth } from '@/lib/auth';
import { isEmailVerified } from '@/lib/accountReadiness';

/**
 * Persistent "verify your email" banner. Shown wherever a signed-in user with
 * an unverified email lands during onboarding. Never blocks the flow — it only
 * prompts and offers a resend.
 */
export default function EmailVerificationBanner({ user, className = '' }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!user || isEmailVerified(user)) return null;

  const resend = async () => {
    setError('');
    setSending(true);
    try {
      await auth.resendVerification();
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Could not send the verification email. Try again in a minute.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className={`rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {sent ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-bold text-slate-900">
              {sent ? 'Verification email sent' : 'Verify your email address'}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              {sent
                ? `Check ${user.email} for the verification link (look in spam too).`
                : `We sent a verification link to ${user.email}. You can browse coach profiles while you finish setup, but credits, saving, messaging, booking, payments, and legal signing stay locked until your email is verified.`}
            </p>
            {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={resend}
          disabled={sending}
          className="shrink-0 self-start rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:self-center"
        >
          {sending ? 'Sending…' : sent ? 'Resend again' : 'Resend email'}
        </button>
      </div>
    </div>
  );
}
