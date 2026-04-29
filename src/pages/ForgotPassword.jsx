import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setSubmitting(true);
      await auth.sendPasswordRecovery(email);
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Could not send the reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md bg-[#F7F5EF] text-[#0B0B0B] rounded-2xl shadow-2xl p-8 sm:p-10 space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-[#0B0B0B]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        <div>
          <h1 className="font-oswald text-2xl sm:text-3xl font-bold tracking-wide text-center">
            Reset your password
          </h1>
          <p className="text-sm text-neutral-500 mt-1 text-center">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md py-3 px-4">
              Check your inbox — we sent a reset link to <strong>{email}</strong>.
            </p>
            <p className="text-xs text-neutral-500">
              Didn&apos;t get it? Check spam, or{' '}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="underline underline-offset-4 hover:text-[#0B0B0B]"
              >
                try again
              </button>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0B0B0B] hover:bg-black text-white py-2.5 rounded-md"
            >
              Send reset link
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
