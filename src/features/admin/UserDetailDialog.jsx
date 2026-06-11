import React, { useEffect, useState } from 'react';
import {
  athleteProfileRepo, guardianAthleteRepo, legalAgreementRepo, coachApplicationRepo,
} from '@/api/repo';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

// Display-only humanizer for stored enum values ('pending_review' → 'Pending review').
function enumLabel(value) {
  if (!value) return value;
  const text = String(value).replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right break-words">{String(value)}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

// Read-only "what did this person submit" view for admins. Reads the profile
// plus its onboarding-related records (children, guardian links, signed legal
// docs, coach application). Admins hold label read on all of these.
export default function UserDetailDialog({ profile, onClose }) {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [guardianLinks, setGuardianLinks] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [application, setApplication] = useState(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [kids, links, agrs, apps] = await Promise.all([
        athleteProfileRepo.filter({ parent_profile_id: profile.id }).catch(() => []),
        guardianAthleteRepo.filter({ guardian_profile_id: profile.id }).catch(() => []),
        legalAgreementRepo.filter({ signer_profile_id: profile.id }).catch(() => []),
        profile.email ? coachApplicationRepo.filter({ email: profile.email }).catch(() => []) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setChildren(kids || []);
      setGuardianLinks(links || []);
      setAgreements(agrs || []);
      setApplication((apps || [])[0] || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  if (!profile) return null;
  const emergency = parseMaybeJson(profile.emergency_contact);

  return (
    <Dialog open={!!profile} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Section title="Identity">
            <Field label="Email" value={profile.email} />
            <Field label="Phone" value={profile.phone} />
            <Field label="Date of birth" value={fmtDate(profile.dob)} />
            <Field label="Minor" value={profile.is_minor ? 'Yes' : (profile.dob ? 'No' : undefined)} />
            <Field label="Location" value={profile.location_label} />
          </Section>

          <Section title="Account & onboarding">
            <Field label="Role" value={enumLabel(profile.role)} />
            <Field label="Onboarding role" value={enumLabel(profile.onboarding_role)} />
            <Field label="Onboarding status" value={enumLabel(profile.onboarding_status)} />
            <Field label="Profile complete" value={profile.profile_setup_complete ? 'Yes' : 'No'} />
            <Field label="Suspended" value={profile.suspended ? 'Yes' : undefined} />
            <Field label="Master admin locked" value={profile.master_admin_locked ? 'Yes' : undefined} />
            <Field label="Joined" value={fmtDate(profile.created_date || profile.$createdAt)} />
          </Section>

          {(profile.bio || profile.skill_level || profile.position || profile.health_notes || emergency) && (
            <Section title="Athlete details">
              <Field label="Skill level" value={profile.skill_level} />
              <Field label="Position" value={profile.position} />
              <Field label="Health notes" value={profile.health_notes} />
              {emergency && (
                <Field label="Emergency contact" value={[emergency.name, emergency.phone, emergency.relationship].filter(Boolean).join(' · ')} />
              )}
              {profile.bio && (
                <div className="mt-2 text-sm">
                  <span className="text-muted-foreground block mb-1">Submitted profile / notes</span>
                  <p className="text-foreground whitespace-pre-wrap text-xs leading-5 bg-background rounded p-2 border border-border">{profile.bio}</p>
                </div>
              )}
            </Section>
          )}

          {(profile.parent_first_name || profile.parent_email) && (
            <Section title="Parent / guardian on file">
              <Field label="Name" value={[profile.parent_first_name, profile.parent_last_name].filter(Boolean).join(' ')} />
              <Field label="Email" value={profile.parent_email} />
              <Field label="Phone" value={profile.parent_phone} />
              <Field label="Relationship" value={profile.parent_relationship} />
            </Section>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading records…</div>
          ) : (
            <>
              {children.length > 0 && (
                <Section title={`Child athletes (${children.length})`}>
                  {children.map((c) => (
                    <Field key={c.id} label={[c.first_name, c.last_name].filter(Boolean).join(' ')} value={`${(c.sports || []).join(', ') || 'athlete'}${c.dob ? ' · DOB ' + fmtDate(c.dob) : ''}`} />
                  ))}
                </Section>
              )}
              {guardianLinks.length > 0 && (
                <Section title={`Guardian links (${guardianLinks.length})`}>
                  {guardianLinks.map((l) => (
                    <Field key={l.id} label={l.relationship || 'guardian'} value={`athlete ${l.athlete_id}${l.can_book === false ? ' · cannot book' : ''}`} />
                  ))}
                </Section>
              )}
              <Section title={`Signed legal documents (${agreements.length})`}>
                {agreements.length === 0
                  ? <p className="text-sm text-muted-foreground">None signed yet.</p>
                  : agreements.map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-foreground">{a.template_key || a.template_id}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">v{a.template_version || '—'}</Badge>
                        <span className="text-muted-foreground text-xs">{fmtDate(a.signed_at || a.$createdAt)}</span>
                      </span>
                    </div>
                  ))}
              </Section>
              {application && (
                <Section title="Coach application">
                  <Field label="Status" value={enumLabel(application.status)} />
                  <Field label="County" value={application.county} />
                  <Field label="Background-check consent" value={application.background_check_consent ? 'Yes' : 'No'} />
                  <Field label="Submitted" value={fmtDate(application.created_date || application.$createdAt)} />
                  {application.coaching_background && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground block mb-1">Background</span>
                      <p className="text-foreground whitespace-pre-wrap text-xs leading-5 bg-background rounded p-2 border border-border">{application.coaching_background}</p>
                    </div>
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
