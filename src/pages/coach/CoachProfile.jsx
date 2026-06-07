import React, { useEffect, useMemo, useState } from 'react';
import { coachRepo } from '@/api/repo';
import { storage } from '@/lib/storage';
import { rpc } from '@/lib/rpc';
import { email as emailLib } from '@/lib/email';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Save, Upload, Mail, AlertTriangle, Eye, BadgeCheck, RotateCcw, Wallet, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import CoachProfilePreviewCard from '@/components/coach/CoachProfilePreviewCard';

// Editable sections of the Coach record. Photo and email are saved out-of-band (photo on
// upload, email after verification); payment handles are edited in /coach/earnings;
// everything else lives in `draft` and saves together.
const EDITABLE_KEYS = ['bio', 'quote', 'training_area', 'specializations'];

function pickEditable(coach) {
  if (!coach) return { specializations: [] };
  const out = {};
  EDITABLE_KEYS.forEach(k => { out[k] = coach[k] ?? (k === 'specializations' ? [] : ''); });
  return out;
}

function shallowEqual(a, b) {
  for (const k of EDITABLE_KEYS) {
    const av = a[k], bv = b[k];
    if (Array.isArray(av) || Array.isArray(bv)) {
      if (!Array.isArray(av) || !Array.isArray(bv)) return false;
      if (av.length !== bv.length || av.some((v, i) => v !== bv[i])) return false;
    } else if ((av || '') !== (bv || '')) {
      return false;
    }
  }
  return true;
}

export default function CoachProfile() {
  const { user } = useAuth();
  const [coach, setCoach] = useState(null);
  const [draft, setDraft] = useState({ specializations: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [specInput, setSpecInput] = useState('');

  // Email verification state machine — lifted from Settings.jsx
  const [pendingEmail, setPendingEmail] = useState('');
  const [expectedCode, setExpectedCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [emailFlow, setEmailFlow] = useState('idle');
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    if (!user?.coach_id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const rows = await coachRepo.filter({ id: user.coach_id });
        if (cancelled) return;
        const row = rows[0] || null;
        setCoach(row);
        setDraft(pickEditable(row));
      } catch (err) {
        console.error('CoachProfile load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Live preview merges saved coach with in-progress draft.
  const previewCoach = useMemo(() => ({ ...(coach || {}), ...draft }), [coach, draft]);
  const dirty = useMemo(() => coach ? !shallowEqual(draft, pickEditable(coach)) : false, [coach, draft]);

  const updateDraft = (patch) => setDraft(prev => ({ ...prev, ...patch }));

  const addSpec = () => {
    const v = specInput.trim();
    if (!v) return;
    if (draft.specializations.includes(v)) { setSpecInput(''); return; }
    updateDraft({ specializations: [...draft.specializations, v] });
    setSpecInput('');
  };

  const removeSpec = (s) => updateDraft({ specializations: draft.specializations.filter(x => x !== s) });

  const saveAll = async () => {
    if (!coach || !dirty) return;
    setSaving(true);
    try {
      await coachRepo.update(coach.id, draft);
      setCoach(prev => prev ? { ...prev, ...draft } : prev);
      toast.success('Profile saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const revert = () => coach && setDraft(pickEditable(coach));

  // Photo upload — saves immediately like AdminCoaches does.
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !coach) return;
    setUploadingPhoto(true);
    try {
      const { url: file_url } = await storage.uploadFile('coach-photos', file);
      await coachRepo.update(coach.id, { photo_url: file_url });
      setCoach(prev => prev ? { ...prev, photo_url: file_url } : prev);
      toast.success('Photo updated');
    } catch (err) {
      console.error(err);
      toast.error('Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ---- Email verification flow (lifted from Settings.jsx) ----
  const sendVerificationCode = async () => {
    const email = pendingEmail.trim().toLowerCase();
    setEmailStatus(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }
    if (coach?.email_verified_at && email === (coach.email || '').toLowerCase()) {
      setEmailStatus({ kind: 'error', message: 'That email is already verified.' });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setEmailFlow('sending');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0A0E14; color: #F8FAFC;">
        <h2 style="color: #2563EB; margin: 0 0 16px;">Verify your LevelCoach Training coach email</h2>
        <p style="color: #E2E8F0; line-height: 1.5;">Enter this 6-digit code in your Profile page to confirm <strong>${email}</strong> as your coach contact address.</p>
        <div style="text-align:center; margin: 24px 0;">
          <span style="display:inline-block; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #2563EB; background:#1a1a1a; padding: 16px 24px; border-radius: 8px;">${code}</span>
        </div>
        <p style="color: #94A3B8; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `;

    let serverFnError = null;
    let coreError = null;
    let delivered = false;

    try {
      const res = await rpc.invoke('sendCoachEmailVerification', { to: email, code });
      const payload = res?.data ?? res;
      if (payload?.error) throw new Error(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error));
      if (res?.status && res.status >= 400) throw new Error(`Server function returned ${res.status}`);
      delivered = true;
    } catch (err) {
      let detail = err?.message || String(err);
      try {
        if (err?.response?.json) detail = (await err.response.json())?.error || detail;
        else if (err?.response?.data) detail = JSON.stringify(err.response.data);
        else if (err?.data) detail = typeof err.data === 'string' ? err.data : JSON.stringify(err.data);
      } catch {}
      serverFnError = detail;
    }

    if (!delivered) {
      try {
        await emailLib.send({ to: email, subject: 'LevelCoach Training — Email Verification Code', body: emailHtml });
        delivered = true;
      } catch (err) {
        coreError = err?.message || String(err);
      }
    }

    if (delivered) {
      setExpectedCode(code);
      setEnteredCode('');
      setEmailFlow('code_sent');
      setEmailStatus({ kind: 'success', message: `Code sent to ${email}. Check your inbox (and spam).` });
    } else {
      setEmailFlow('idle');
      setEmailStatus({
        kind: 'error',
        message: `Could not send email. Server fn: ${serverFnError || 'n/a'}. Core.SendEmail: ${coreError || 'n/a'}.`,
      });
    }
  };

  const verifyAndSaveEmail = async () => {
    if (enteredCode.trim() !== expectedCode) {
      setEmailStatus({ kind: 'error', message: 'Incorrect code. Double-check the email we sent.' });
      return;
    }
    setEmailFlow('verifying');
    try {
      const newEmail = pendingEmail.trim().toLowerCase();
      const verifiedAt = new Date().toISOString();
      await coachRepo.update(coach.id, { email: newEmail, email_verified_at: verifiedAt });
      setCoach(prev => prev ? { ...prev, email: newEmail, email_verified_at: verifiedAt } : prev);
      setPendingEmail('');
      setEnteredCode('');
      setExpectedCode('');
      setEmailFlow('idle');
      setEmailStatus({ kind: 'success', message: 'Email verified and saved.' });
      toast.success('Email verified');
    } catch (err) {
      setEmailFlow('code_sent');
      setEmailStatus({ kind: 'error', message: err?.message || 'Could not save email.' });
    }
  };

  const cancelEmailFlow = () => {
    setEmailFlow('idle');
    setExpectedCode('');
    setEnteredCode('');
    setPendingEmail('');
    setEmailStatus(null);
  };

  // ---- Render ----
  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="bg-card border border-destructive/30 rounded-lg p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-display tracking-wider text-foreground uppercase text-sm">No coach profile linked</p>
          <p className="text-sm text-muted-foreground mt-1">Ask an admin to link your account before you can edit a public profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-foreground uppercase">Coach Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What clients see when picking a coach. Edit on the left, preview on the right.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={revert} className="text-muted-foreground text-xs font-display tracking-wider uppercase">
              <RotateCcw className="w-3 h-3 mr-1" /> Revert
            </Button>
            <Button onClick={saveAll} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90">
              <Save className="w-3 h-3 mr-2" /> {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Editor — left 3/5 */}
        <div className="lg:col-span-3 space-y-5">
          {/* Photo */}
          <Section title="Photo">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center flex-shrink-0">
                {coach.photo_url ? (
                  <img src={coach.photo_url} alt="Coach" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-xl text-muted-foreground/40">
                    {coach.first_name?.[0]}{coach.last_name?.[0]}
                  </span>
                )}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <Button type="button" variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs pointer-events-none">
                  <Upload className="w-3 h-3 mr-1" /> {uploadingPhoto ? 'Uploading…' : 'Upload Photo'}
                </Button>
              </label>
              <p className="text-xs text-muted-foreground">JPG/PNG. A clear face shot works best.</p>
            </div>
          </Section>

          {/* Identity */}
          <Section title="About You">
            <div>
              <Label className="font-display tracking-wider uppercase text-xs">Bio</Label>
              <Textarea
                value={draft.bio || ''}
                onChange={e => updateDraft({ bio: e.target.value })}
                className="bg-secondary border-border mt-1"
                rows={4}
                placeholder="A few sentences about your background and coaching style."
              />
            </div>
            <div className="mt-4">
              <Label className="font-display tracking-wider uppercase text-xs">Quote</Label>
              <Input
                value={draft.quote || ''}
                onChange={e => updateDraft({ quote: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="A short line that captures how you coach."
              />
            </div>
            <div className="mt-4">
              <Label className="font-display tracking-wider uppercase text-xs">Training Area</Label>
              <Input
                value={draft.training_area || ''}
                onChange={e => updateDraft({ training_area: e.target.value })}
                className="bg-secondary border-border mt-1"
                placeholder="e.g. Royal Oak, Beaumont Park"
              />
            </div>
            <div className="mt-4">
              <Label className="font-display tracking-wider uppercase text-xs">Specializations</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={specInput}
                  onChange={e => setSpecInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSpec())}
                  className="bg-secondary border-border"
                  placeholder="e.g. Finishing, 1v1 defending"
                />
                <Button type="button" onClick={addSpec} variant="outline" size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {draft.specializations?.map(s => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => removeSpec(s)}
                    title="Click to remove"
                  >
                    {s} ×
                  </Badge>
                ))}
                {!draft.specializations?.length && (
                  <span className="text-xs text-muted-foreground/60">No specializations yet.</span>
                )}
              </div>
            </div>
          </Section>

          {/* Contact email + verification */}
          <Section title="Contact Email" icon={Mail}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              {coach.email_verified_at ? (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/30 border text-[10px] font-display tracking-widest uppercase">
                  <BadgeCheck className="w-3 h-3 mr-1" /> Verified
                </Badge>
              ) : coach.email ? (
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 border text-[10px] font-display tracking-widest uppercase">
                  Unverified
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-display tracking-widest uppercase">Not set</Badge>
              )}
            </div>
            {coach.email && (
              <p className="text-sm text-foreground">Current: <span className="text-muted-foreground">{coach.email}</span></p>
            )}
            <p className="text-xs text-muted-foreground">Clients and admins reach you here. Changing it requires a code sent to the new address.</p>

            {emailStatus && (
              <div className={`text-xs rounded border p-3 break-words mt-3 ${
                emailStatus.kind === 'error'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : emailStatus.kind === 'success'
                  ? 'border-green-400/30 bg-green-400/10 text-green-300'
                  : 'border-border bg-secondary/50 text-muted-foreground'
              }`}>
                {emailStatus.message}
              </div>
            )}

            {emailFlow === 'idle' && (
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <Input
                  type="email"
                  placeholder="you@levelcoach.com"
                  value={pendingEmail}
                  onChange={e => setPendingEmail(e.target.value)}
                  className="bg-secondary border-border"
                />
                <Button
                  onClick={sendVerificationCode}
                  disabled={!pendingEmail.trim()}
                  className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
                >
                  Send Code
                </Button>
              </div>
            )}

            {emailFlow === 'sending' && (
              <p className="text-sm text-muted-foreground mt-3">Sending code to {pendingEmail}…</p>
            )}

            {(emailFlow === 'code_sent' || emailFlow === 'verifying') && (
              <div className="space-y-3 mt-3">
                <p className="text-sm text-muted-foreground">We sent a 6-digit code to <strong className="text-foreground">{pendingEmail}</strong>. Enter it to confirm.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={enteredCode}
                    onChange={e => setEnteredCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="bg-secondary border-border tracking-[0.4em] font-mono text-center"
                  />
                  <Button
                    onClick={verifyAndSaveEmail}
                    disabled={enteredCode.length !== 6 || emailFlow === 'verifying'}
                    className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90"
                  >
                    {emailFlow === 'verifying' ? 'Saving…' : 'Verify & Save'}
                  </Button>
                </div>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={sendVerificationCode} className="text-accent hover:underline">Resend code</button>
                  <span className="text-muted-foreground">·</span>
                  <button type="button" onClick={cancelEmailFlow} className="text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
              </div>
            )}
          </Section>

          {/* Payment — read-only summary; full editor lives in /coach/earnings */}
          <Section title="Payment" icon={Wallet}>
            <p className="text-xs text-muted-foreground mb-3">
              Payment handles and cash acceptance are managed from your Earnings page so they live next to your unpaid totals.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { key: 'venmo',   label: 'Venmo' },
                { key: 'zelle',   label: 'Zelle' },
                { key: 'cashapp', label: 'Cash App' },
                { key: 'paypal',  label: 'PayPal' },
              ].map(h => (
                <div key={h.key} className="bg-secondary/40 border border-border rounded p-2">
                  <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">{h.label}</p>
                  <p className="text-sm text-foreground truncate">{coach[h.key] || <span className="text-muted-foreground/60">—</span>}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Cash at session: <span className="text-foreground">{coach.cash_accepted ? 'Accepted' : 'Not accepted'}</span>
              </p>
              <Link to="/coach/earnings">
                <Button variant="outline" size="sm" className="font-display tracking-wider uppercase text-xs">
                  <ExternalLink className="w-3 h-3 mr-1" /> Manage in Earnings
                </Button>
              </Link>
            </div>
          </Section>

          {/* Bottom save bar (mirrors top one for long pages) */}
          {dirty && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={revert} className="text-muted-foreground text-xs font-display tracking-wider uppercase">
                <RotateCcw className="w-3 h-3 mr-1" /> Revert
              </Button>
              <Button onClick={saveAll} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
                <Save className="w-3 h-3 mr-2" /> {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>

        {/* Live preview — right 2/5 */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-display tracking-widest uppercase text-muted-foreground">
              <Eye className="w-3 h-3" /> Live preview {dirty && <span className="text-yellow-400">· unsaved</span>}
            </div>
            <CoachProfilePreviewCard coach={previewCoach} />
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Roughly what clients see in the booking flow and on the homepage. Some surfaces show fewer fields.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-accent" />}
        <h2 className="font-display text-sm font-bold tracking-widest uppercase text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}
