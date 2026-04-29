import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const userId = params.get('userId');
  const secret = params.get('secret');
  const linkValid = !!userId && !!secret;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    try {
      setSubmitting(true);
      await auth.completePasswordRecovery(userId, secret, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setError(err?.message || 'This recovery link is invalid or expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md bg-[#F7F5EF] text-[#0B0B0B] rounded-2xl shadow-2xl p-8 sm:p-10 space-y-6">
        <div>
          <h1 className="font-oswald text-2xl sm:text-3xl font-bold tracking-wide text-center">
            Set a new password
          </h1>
        </div>

        {!linkValid ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md py-3 px-4">
              This recovery link is invalid or expired.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block text-sm text-[#0B0B0B] underline underline-offset-4 hover:opacity-80"
            >
              Request a new one
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-neutral-700">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                  minLength={8}
                  className="pl-9 bg-white text-[#0B0B0B] placeholder:text-neutral-400 border-neutral-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-sm font-medium text-neutral-700">Confirm new password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
              Reset password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
