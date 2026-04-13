import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Users, Send, Check, X, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function Matching() {
  const { user, isCoach, isAdmin } = useCurrentUser();
  const [clients, setClients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parentConsent, setParentConsent] = useState(false);

  const userAge = user?.dob ? Math.floor((Date.now() - new Date(user.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const isMinor = userAge !== null && userAge < 18;

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const res = await base44.functions.invoke('getMatchingPlayers', {});
    setClients(res.data.players || []);

    const reqs = await base44.entities.MatchRequest.filter({});
    setRequests(reqs.filter(r => r.requester_email === user.email || r.target_email === user.email));
    setLoading(false);
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

  if (isCoach || isAdmin) {
    return (
      <div className="py-24 text-center max-w-md mx-auto px-4">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-oswald text-2xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground text-sm">Player matching is for clients only.</p>
      </div>
    );
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

  // Parental consent gate for minors
  if (isMinor && !parentConsent) {
    return (
      <div className="py-24 max-w-md mx-auto px-4">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-oswald text-2xl font-bold tracking-tight text-foreground mb-2">PLAYER MATCHING</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Because you are under 18, a parent or guardian must consent to you using the player matching feature.
        </p>
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <p className="text-sm font-oswald tracking-wider text-foreground">Parent / Guardian Consent</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            By checking the box below, you (the parent or guardian) confirm that you have reviewed the LC Training{' '}
            <a href="/terms" target="_blank" className="text-accent underline">Terms of Service</a> and consent to your child participating in the player matching feature. You understand that this feature allows other players to see your child's first name and age.
          </p>
          <div className="flex items-start gap-3">
            <Checkbox id="parent-consent" checked={parentConsent} onCheckedChange={v => setParentConsent(!!v)} />
            <Label htmlFor="parent-consent" className="text-sm cursor-pointer leading-snug">
              I am the parent/guardian and I consent to my child using Player Matching.
            </Label>
          </div>
          <Button
            disabled={!parentConsent}
            onClick={() => setParentConsent(true)}
            className="w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90"
          >
            Continue to Matching
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