import React, { useEffect, useState, useRef } from 'react';
import { coachRepo, conversationRepo, messageRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, ArrowLeft, AlertTriangle, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function Messages() {
  const { user } = useCurrentUser();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coaches, setCoaches] = useState([]);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const msgEndRef = useRef(null);

  useEffect(() => {
    // Defensive: route guard ensures user exists, but never sit on a spinner.
    if (!user) {
      setLoading(false);
      return;
    }
    loadConversations();
    coachRepo.filter({ is_active: true })
      .then(data => setCoaches(data.filter(c => c.email)))
      .catch(() => setCoaches([]));
  }, [user]);

  const loadConversations = async () => {
    try {
      // NOTE: legacy SDK doesn't expose an "array-contains" OR filter, so we
      // fetch all conversations and narrow client-side. When conversation
      // volume grows this should move behind a server function that returns
      // only rows the caller participates in.
      const all = await conversationRepo.filter({}, '-last_message_at');
      const mine = all.filter(c => c.participant_emails?.includes(user.email) && !c.is_archived);
      setConversations(mine);
    } catch (err) {
      console.error('loadConversations failed', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convo) => {
    setSelectedConvo(convo);
    const msgs = await messageRepo.filter({ conversation_id: convo.id }, 'created_date');
    setMessages(msgs);

    // Mark as read
    const unread = msgs.filter(m => m.sender_email !== user.email && !m.read_by?.includes(user.email));
    for (const m of unread) {
      await messageRepo.update(m.id, { read_by: [...(m.read_by || []), user.email] });
    }
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (!selectedConvo) return;
    const unsub = messageRepo.subscribe((event) => {
      if (event.data?.conversation_id === selectedConvo.id) {
        if (event.type === 'create') {
          setMessages(prev => [...prev, event.data]);
          if (event.data.sender_email !== user.email) {
            messageRepo.update(event.data.id, { read_by: [...(event.data.read_by || []), user.email] });
          }
        }
      }
    });
    return unsub;
  }, [selectedConvo, user]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedConvo) return;
    setSending(true);
    const senderFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
    await messageRepo.create({
      conversation_id: selectedConvo.id,
      sender_email: user.email,
      sender_name: senderFullName,
      content: newMsg.trim(),
      read_by: [user.email],
    });
    await conversationRepo.update(selectedConvo.id, {
      last_message: newMsg.trim(),
      last_message_at: new Date().toISOString(),
    });
    setNewMsg('');
    setSending(false);
  };

  const getOtherName = (convo) => {
    const idx = convo.participant_emails?.findIndex(e => e !== user.email);
    return convo.participant_names?.[idx] || convo.participant_emails?.[idx] || 'Unknown';
  };

  const startConvoWithCoach = async (coach) => {
    if (!coach.email) return;
    const all = await conversationRepo.filter({});
    let convo = all.find(c =>
      c.participant_emails?.includes(user.email) &&
      c.participant_emails?.includes(coach.email) &&
      !c.is_archived
    );
    if (!convo) {
      const userFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
      convo = await conversationRepo.create({
        type: 'coach_client',
        participant_emails: [String(user.email), String(coach.email)],
        participant_names: [userFullName, `${coach.first_name} ${coach.last_name}`],
        coach_id: coach.id,
      });
    }
    setShowNewConvo(false);
    await loadConversations();
    await loadMessages(convo);
  };

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-6">MESSAGES</h1>

        <div className="bg-card border border-border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
          <div className="flex h-full">
            {/* Conversation List */}
            <div className={`w-full sm:w-80 border-r border-border flex flex-col ${selectedConvo ? 'hidden sm:flex' : 'flex'}`}>
              <div className="p-3 border-b border-border">
                <Button
                  size="sm"
                  onClick={() => setShowNewConvo(!showNewConvo)}
                  className="w-full bg-accent text-accent-foreground font-display tracking-wider uppercase text-xs hover:bg-accent/90"
                >
                  <Plus className="w-3 h-3 mr-1" /> Message a Coach
                </Button>
                {showNewConvo && (
                  <div className="mt-2 space-y-1">
                    {coaches.map(c => (
                      <button
                        key={c.id}
                        onClick={() => startConvoWithCoach(c)}
                        className="w-full text-left px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm"
                      >
                        <span className="font-display tracking-wider">{c.first_name} {c.last_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{c.county}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No conversations yet.</div>
                ) : (
                  conversations.map(convo => (
                    <button
                      key={convo.id}
                      onClick={() => loadMessages(convo)}
                      className={`w-full text-left p-4 border-b border-border hover:bg-secondary/50 transition-colors ${selectedConvo?.id === convo.id ? 'bg-secondary' : ''}`}
                    >
                      <p className="font-display tracking-wider text-sm text-foreground">{getOtherName(convo)}</p>
                      {convo.last_message && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{convo.last_message}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col ${!selectedConvo ? 'hidden sm:flex' : 'flex'}`}>
              {selectedConvo ? (
                <>
                  {/* Header */}
                  <div className="p-4 border-b border-border flex items-center gap-3">
                    <button onClick={() => setSelectedConvo(null)} className="sm:hidden">
                      <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <p className="font-display tracking-wider text-foreground">{getOtherName(selectedConvo)}</p>
                  </div>

                  {/* Monitoring Disclaimer */}
                  <div className="px-4 py-2 bg-accent/5 border-b border-accent/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-accent shrink-0" />
                    <p className="text-xs text-accent/80">All messages are monitored for safety and quality purposes.</p>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_email === user.email ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                          msg.sender_email === user.email
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-secondary text-foreground'
                        }`}>
                          <p className="text-sm">{msg.content}</p>
                          <p className="text-[10px] opacity-60 mt-1">{format(new Date(msg.created_date), 'h:mm a')}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={msgEndRef} />
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t border-border">
                    <div className="flex gap-2">
                      <Input
                        value={newMsg}
                        onChange={e => setNewMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Type a message..."
                        className="bg-secondary border-border"
                      />
                      <Button onClick={handleSend} disabled={sending || !newMsg.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Select a conversation
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}