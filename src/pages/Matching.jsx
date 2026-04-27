import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Send, Check, X, MessageSquare, MailCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function generateToken() {
  const bytes = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export default function Matching() {
  const { user, refetch } = useCurrentUser();
  const [clients, setClients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parentEmailInput, setParentEmailInput] = useState('');
  const [sendingConsent, setSendingConsent] = useState(false);

  const userAge = calcAge(user?.dob);
  const isMinor = userAge !== null && userAge < 18;
  const consentVerified = !!user?.parent_consent_verified_at;
  const consentPending = !!user?.parent_consent_sent_at && !consentVerified;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const res = await base44.functions.invoke('getMatchingPlayers', {});
      setClients(res.data.players || []);

      // NOTE: MatchRequest has no participant query helper; we filter client-side.
      // This should move behind a server function once volume grows.
      const reqs = await base44.entities.MatchRequest.filter({});
      setRequests(reqs.filter(r => r.requester_email === user.email || r.target_email === user.email));
    } catch (err) {
      console.error('Matching load failed', err);
      setClients([]);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (target) => {
    const existing = requests.find(r =>
      (r.requester_email === user.email && r.target_email === target.email) ||
      (r.target_email === user.email && r.requester_email === target.email)
    );
    if (existing) {
      toast.info('A request already exists with this player.');
      return;
    }

    await base44.entities.MatchRequest.create({
      requester_email: user.email,
      requester_name: user.first_name || user.full_name?.split(' ')[0] || 'Player',
      requester_player_age: userAge,
      target_email: target.email,
      target_name: target.first_name,
      target_player_age: target.player_age,
      status: 'pending',
    });
    toast.success('Match request sent!');
    loadData();
  };

  const handleRequest = async (req, action) => {
    if (action === 'accepted') {
      const convo = await base44.entities.Conversation.create({
        type: 'client_match',
        participant_emails: [req.requester_email, req.target_email],
        participant_names: [req.requester_name, req.target_name],
        match_request_id: req.id,
      });
      await base44.entities.MatchRequest.update(req.id, { status: 'accepted', conversation_id: convo.id });
      toast.success('Match accepted! You can now message each other.');
    } else {
      await base44.entities.MatchRequest.update(req.id, { status: 'declined' });
      toast.info('Request declined.');
    }
    loadData();
  };

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  if (!user?.matching_opted_in) {
    return (
      <div className="py-24 text-center max-w-md mx-auto px-4">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-oswald text-2xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground text-sm mb-6">Opt in from Settings to discover other players in your area.</p>
        <Link to="/settings">
          <Button className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
            Go to Settings
          </Button>
        </Link>
      </div>
    );
  }

  // Parental consent gate for minors — emailed verification
  if (isMinor && !consentVerified) {
    const defaultEmail = user?.parent_email || '';
    const emailToUse = parentEmailInput || defaultEmail;

    const sendConsentEmail = async () => {
      if (!emailToUse || !/^\S+@\S+\.\S+$/.test(emailToUse)) {
        toast.error('Please enter a valid parent/guardian email.');
        return;
      }
      setSendingConsent(true);
      try {
        const token = generateToken();
        await base44.entities.User.update(user.id, {
          parent_consent_token: token,
          parent_consent_sent_at: new Date().toISOString(),
          parent_consent_email: emailToUse,
        });
        const childName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
        const consentUrl = `${window.location.origin}/parent-consent?token=${token}`;
        await base44.integrations.Core.SendEmail({
          to: emailToUse,
          subject: `Consent Requested: ${childName} wants to use LC Training Player Matching`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #B89A45;">LC Training — Parent/Guardian Consent</h2>
              <p>Hi,</p>
              <p><strong>${childName}</strong>${userAge ? ` (age ${userAge})` : ''} has requested your consent to use the Player Matching feature on LC Training.</p>
              <p>Player Matching lets your child connect with other players in the Oakland, Macomb, and Wayne county areas. Only first name and age are visible to other players, and all messages are monitored for safety.</p>
              <p style="margin: 24px 0;">
                <a href="${consentUrl}" style="background:#B89A45; color:#000; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold;">Review &amp; Respond</a>
              </p>
              <p style="font-size: 12px; color: #666;">Or copy this link into your browser:<br/>${consentUrl}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">If you did not expect this email, you can ignore it. Questions? <a href="mailto:support@lctrainings.com" style="color: #B89A45;">support@lctrainings.com</a></p>
            </div>
          `,
        });
        toast.success(`Consent email sent to ${emailToUse}.`);
        if (refetch) await refetch();
      } catch {
        toast.error('Could not send consent email. Please try again.');
      } finally {
        setSendingConsent(false);
      }
    };

    return (
      <div className="py-24 max-w-md mx-auto px-4">
        <ShieldCheck className="w-12 h-12 text-accent mx-auto mb-4" />
        <h1 className="font-oswald text-2xl font-bold tracking-tight text-foreground mb-2 text-center">PARENT CONSENT REQUIRED</h1>
        <p className="text-muted-foreground text-sm mb-6 text-center">
          Because you are under 18, a parent or guardian must consent before you can use Player Matching.
        </p>

        {consentPending && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-4 flex gap-3 items-start">
            <MailCheck className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-oswald tracking-wider text-accent text-sm uppercase">Consent email sent</p>
              <p className="text-xs text-muted-foreground mt-1">
                We sent a link to <strong className="text-foreground">{user.parent_consent_email}</strong>. Ask them to click it to unlock Player Matching. You can resend below if needed.
              </p>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div>
            <Label className="font-oswald tracking-wider uppercase text-xs">Parent / Guardian Email</Label>
            <Input
              type="email"
              value={parentEmailInput || defaultEmail}
              onChange={e => setParentEmailInput(e.target.value)}
              placeholder="parent@example.com"
              className="bg-secondary border-border mt-1"
            />
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              We'll email a secure link. Your parent clicks it to review and consent. Only first name and age are shown to other players.
            </p>
          </div>
          <Button
            disabled={sendingConsent}
            onClick={sendConsentEmail}
            className="w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
          >
            {sendingConsent ? 'Sending...' : consentPending ? 'Resend Consent Email' : 'Send Consent Email'}
          </Button>
        </div>
      </div>
    );
  }

  const incoming = requests.filter(r => r.target_email === user.email && r.status === 'pending');
  const matched = requests.filter(r =>
    (r.requester_email === user.email || r.target_email === user.email) && r.status === 'accepted'
  );

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground mb-10">Connect with other players in your area.</p>

        {/* Matched Players */}
        {matched.length > 0 && (
          <div className="mb-10">
            <h2 className="font-oswald text-lg tracking-widest uppercase text-green-400 mb-4">Your Matches</h2>
            <div className="space-y-3">
              {matched.map(req => {
                const otherName = req.requester_email === user.email ? req.target_name : req.requester_name;
                const otherAge = req.requester_email === user.email ? req.target_player_age : req.requester_player_age;
                return (
                  <div key={req.id} className="bg-card border border-green-500/20 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-oswald tracking-wider text-foreground">{otherName}</p>
                      {otherAge && <p className="text-xs text-muted-foreground">Age {otherAge}</p>}
                    </div>
                    {req.conversation_id && (
                      <Link to="/messages">
                        <Button size="sm" className="bg-primary text-primary-foreground font-oswald tracking-wider uppercase text-xs hover:bg-primary/90">
                          <MessageSquare className="w-3 h-3 mr-1" /> Message
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Incoming Requests */}
        {incoming.length > 0 && (
          <div className="mb-10">
            <h2 className="font-oswald text-lg tracking-widest uppercase text-accent mb-4">Incoming Requests</h2>
            <div className="space-y-3">
              {incoming.map(req => (
                <div key={req.id} className="bg-card border border-accent/20 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-oswald tracking-wider">{req.requester_name}</p>
                    {req.requester_player_age && <p className="text-xs text-muted-foreground">Age {req.requester_player_age}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleRequest(req, 'accepted')} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs">
                      <Check className="w-3 h-3 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRequest(req, 'declined')} className="font-oswald tracking-wider uppercase text-xs">
                      <X className="w-3 h-3 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Safety banner — privacy reminder for everyone */}
        <div className="mb-8 bg-card border border-border rounded-lg p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-oswald tracking-widest uppercase text-foreground text-[10px] mb-1">How matching keeps you safe</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Only your <strong className="text-foreground">first name</strong> and age are shown to other players. Email and phone are never shared.</li>
            <li>Players under 18 need a parent/guardian to consent before matching unlocks.</li>
            <li>Messages route through LC Training so a coach or admin can step in if anything feels off — <a href="mailto:support@lctrainings.com" className="text-accent hover:underline">tell us</a>.</li>
            <li>You can opt out any time from <Link to="/settings" className="text-accent hover:underline">Settings</Link>.</li>
          </ul>
        </div>

        {/* Discover */}
        <h2 className="font-oswald text-lg tracking-widest uppercase text-muted-foreground mb-4">Discover Players</h2>
        {clients.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">No other players have opted in yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => {
              const existingReq = requests.find(r =>
                (r.requester_email === user.email && r.target_email === client.email) ||
                (r.target_email === user.email && r.requester_email === client.email)
              );
              const hasPending = existingReq?.status === 'pending';
              const isMatched = existingReq?.status === 'accepted';
              if (isMatched) return null; // already shown in matched section
              return (
                <div key={client.email} className="bg-card border border-border rounded-lg p-6 text-center hover:border-accent/30 transition-colors">
                  <p className="font-oswald text-xl font-bold tracking-wider text-foreground">{client.first_name}</p>
                  {client.player_age && (
                    <p className="text-xs text-muted-foreground mt-1">Age {client.player_age}</p>
                  )}
                  <Button
                    size="sm"
                    disabled={hasPending}
                    onClick={() => sendRequest(client)}
                    className="mt-4 bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90"
                  >
                    {hasPending ? 'Request Sent' : <><Send className="w-3 h-3 mr-1" /> Connect</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}