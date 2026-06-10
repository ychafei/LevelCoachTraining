import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { conversationRepo } from '@/api/repo';
import { callFn } from '@/lib/rpc';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Users, MessageSquare, ShieldCheck } from 'lucide-react';
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

export default function Matching() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [messageTarget, setMessageTarget] = useState(null);
  const [firstMessage, setFirstMessage] = useState('');
  const [sending, setSending] = useState(false);

  const userAge = calcAge(user?.dob);
  const isMinor = user?.is_minor === true || (userAge !== null && userAge < 18);
  const consentVerified = !!user?.parent_consent_verified_at;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Server-curated directory: display name + age group only, no emails.
        const res = await callFn('getMatchingPlayers', {});
        if (!cancelled) setPlayers(res?.players || []);
      } catch (err) {
        if (!cancelled) {
          setPlayers([]);
          setLoadError(err?.message || 'Could not load matching players.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const sendFirstMessage = async () => {
    if (!messageTarget || !firstMessage.trim()) return;
    setSending(true);
    try {
      // The messaging function resolves the recipient server-side, applies
      // block lists, and grants conversation read to both participants
      // (plus guardians of minor participants).
      await conversationRepo.start({
        recipient_profile_id: messageTarget.profile_id,
        first_message: firstMessage.trim(),
      });
      toast.success(`Message sent to ${messageTarget.first_name}`);
      setMessageTarget(null);
      setFirstMessage('');
      navigate('/messages');
    } catch (err) {
      toast.error(err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  if (!user?.matching_opted_in) {
    return (
      <div className="py-24 text-center max-w-md mx-auto px-4">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground text-sm mb-6">Opt in from Settings to discover other players in your area.</p>
        <Link to="/settings">
          <Button className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
            Go to Settings
          </Button>
        </Link>
      </div>
    );
  }

  // Parental consent gate for minors — consent is recorded server-side
  // through the parent/guardian flow; there is no self-service email loop.
  if (isMinor && !consentVerified) {
    return (
      <div className="py-24 max-w-md mx-auto px-4 text-center">
        <ShieldCheck className="w-12 h-12 text-accent mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground mb-2">PARENT CONSENT REQUIRED</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Because you are under 18, a parent or guardian must verify their consent before
          you can use Player Matching. Ask your parent or guardian to complete the consent
          step from their own LevelCoach Training account.
        </p>
        <p className="text-xs text-muted-foreground">
          Questions? Contact{' '}
          <a href="mailto:contact@levelcoachtraining.com" className="text-accent hover:underline">
            contact@levelcoachtraining.com
          </a>.
        </p>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground mb-10">Connect with other players in your area.</p>

        {/* Safety banner — privacy reminder for everyone */}
        <div className="mb-8 bg-card border border-border rounded-lg p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-display tracking-widest uppercase text-foreground text-[10px] mb-1">How matching keeps you safe</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Only your <strong className="text-foreground">first name</strong> and age group are shown to other players. Email and phone are never shared.</li>
            <li>Players under 18 need a parent/guardian to consent before matching unlocks.</li>
            <li>Messages route through LevelCoach Training so a coach or admin can step in if anything feels off — <a href="mailto:contact@levelcoachtraining.com" className="text-accent hover:underline">tell us</a>.</li>
            <li>You can opt out any time from <Link to="/settings" className="text-accent hover:underline">Settings</Link>.</li>
          </ul>
        </div>

        {/* Discover */}
        <h2 className="font-display text-lg tracking-widest uppercase text-muted-foreground mb-4">Discover Players</h2>
        {loadError && (
          <p className="text-destructive text-sm mb-4" role="alert">{loadError}</p>
        )}
        {players.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">No other players have opted in yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((player) => (
              <div key={player.profile_id} className="bg-card border border-border rounded-lg p-6 text-center hover:border-accent/30 transition-colors">
                <p className="font-display text-xl font-bold tracking-wider text-foreground">{player.first_name}</p>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {player.age_group && <p>Ages {player.age_group}</p>}
                  {player.position && <p>{player.position}</p>}
                  {player.skill_level && <p>{player.skill_level}</p>}
                </div>
                <Button
                  size="sm"
                  onClick={() => { setMessageTarget(player); setFirstMessage(''); }}
                  className="mt-4 bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
                >
                  <MessageSquare className="w-3 h-3 mr-1" /> Message
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* First-message dialog */}
        <Dialog open={!!messageTarget} onOpenChange={(open) => { if (!open) setMessageTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display tracking-wider uppercase">
                Message {messageTarget?.first_name}
              </DialogTitle>
              <DialogDescription>
                Your message starts a monitored conversation in Messages. Don't share
                contact details, addresses, or social handles.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="matching-first-message" className="font-display tracking-wider uppercase text-xs">Your message</Label>
              <Textarea
                id="matching-first-message"
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                rows={4}
                placeholder="Introduce yourself and what you'd like to train on..."
                className="bg-secondary border-border mt-1"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setMessageTarget(null)}
                className="font-display tracking-wider uppercase text-xs"
              >
                Cancel
              </Button>
              <Button
                disabled={sending || !firstMessage.trim()}
                onClick={sendFirstMessage}
                className="bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
              >
                {sending ? 'Sending...' : 'Send Message'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
