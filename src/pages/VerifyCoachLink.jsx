import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/auth';
import { coachLinkRequestRepo, coachRepo } from '@/api/repo';
import { Button } from '@/components/ui/button';

export default function VerifyCoachLink() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const { isAuthenticated, isLoadingAuth, user, refetchUser } = useAuth();

  const [state, setState] = useState('loading'); // loading|invalid|used|expired|mismatch|ready|success|error
  const [request, setRequest] = useState(null);
  const [coachName, setCoachName] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!token) { setState('invalid'); return; }
    if (!isAuthenticated) return; // render the "sign in" prompt below

    (async () => {
      try {
        const rows = await coachLinkRequestRepo.filter({ token });
        const req = rows?.[0];
        if (!req) { setState('invalid'); return; }
        if (req.status && req.status !== 'pending') { setState('used'); return; }
        if (req.expires_at && new Date(req.expires_at).getTime() < Date.now()) {
          setState('expired'); return;
        }
        if ((user?.email || '').toLowerCase() !== (req.email || '').toLowerCase()) {
          setRequest(req); setState('mismatch'); return;
        }
        setRequest(req);
        try {
          const c = await coachRepo.get(req.coach_id);
          setCoachName(`${c?.first_name || ''} ${c?.last_name || ''}`.trim() || 'a coach profile');
        } catch { setCoachName('a coach profile'); }
        setState('ready');
      } catch {
        setState('error');
        setErrMsg('Could not load this request. The coach_link_requests collection may not exist yet.');
      }
    })();
  }, [isLoadingAuth, isAuthenticated, token, user]);

  const confirm = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const keepAdmin = user?.role === 'admin' || user?.role === 'super_admin';
      await auth.updateCurrentUser({
        coach_id: request.coach_id,
        ...(keepAdmin ? {} : { role: 'coach' }),
      });
      await coachLinkRequestRepo.update(request.id, { status: 'verified' });
      await refetchUser();
      setState('success');
    } catch (err) {
      setErrMsg(err?.message || 'Could not complete verification.');
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/10">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5 ring-1 ring-blue-100">
          {state === 'success'
            ? <CheckCircle2 className="w-7 h-7 text-blue-600" />
            : state === 'invalid' || state === 'used' || state === 'expired' || state === 'error' || state === 'mismatch'
              ? <AlertTriangle className="w-7 h-7 text-blue-600" />
              : <ShieldCheck className="w-7 h-7 text-blue-600" />}
        </div>

        {isLoadingAuth || state === 'loading' ? (
          <p className="text-sm font-semibold text-slate-600">Loading...</p>
        ) : !isAuthenticated ? (
          <>
            <h1 className="font-display text-2xl font-bold text-slate-950 tracking-normal mb-2">Sign in to verify</h1>
            <p className="text-slate-600 text-sm mb-6">
              Sign in to the account that received this email to confirm the coach link.
            </p>
            <Button
              onClick={() => navigate(`/login?next=${encodeURIComponent(`/verify-coach-link?token=${token}`)}`)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Sign In
            </Button>
          </>
        ) : state === 'invalid' ? (
          <Msg title="Invalid link" body="This verification link is not valid." />
        ) : state === 'used' ? (
          <Msg title="Already used" body="This link has already been verified or cancelled." />
        ) : state === 'expired' ? (
          <Msg title="Link expired" body="Ask an administrator to send a new verification email." />
        ) : state === 'mismatch' ? (
          <>
            <h1 className="font-display text-2xl font-bold text-slate-950 tracking-normal mb-2">Wrong account</h1>
            <p className="text-slate-600 text-sm mb-6">
              You're signed in as <span className="font-semibold text-blue-700">{user?.email}</span>, but this link
              was sent to <span className="font-semibold text-blue-700">{request?.email}</span>. Sign in with that
              account to verify.
            </p>
            <Button
              onClick={async () => { await auth.signOut(); navigate(`/login?next=${encodeURIComponent(`/verify-coach-link?token=${token}`)}`); }}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Switch Account
            </Button>
          </>
        ) : state === 'success' ? (
          <>
            <h1 className="font-display text-2xl font-bold text-slate-950 tracking-normal mb-2">Verified</h1>
            <p className="text-slate-600 text-sm mb-6">Your account is now linked. Welcome aboard.</p>
            <Link to="/coach">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                Go to Coaching Portal
              </Button>
            </Link>
          </>
        ) : state === 'error' ? (
          <Msg title="Something went wrong" body={errMsg || 'Please try again later.'} />
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-slate-950 tracking-normal mb-2">Confirm coach link</h1>
            <p className="text-slate-600 text-sm mb-6">
              Link <span className="font-semibold text-blue-700">{user?.email}</span> to{' '}
              <span className="font-semibold text-blue-700">{coachName}</span>?
            </p>
            <Button
              onClick={confirm}
              disabled={busy}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {busy ? 'Verifying...' : 'Verify & Activate'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Msg({ title, body }) {
  return (
    <>
      <h1 className="font-display text-2xl font-bold text-slate-950 tracking-normal mb-2">{title}</h1>
      <p className="text-slate-600 text-sm">{body}</p>
    </>
  );
}
