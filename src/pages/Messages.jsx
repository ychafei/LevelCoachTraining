import React, { useEffect, useState, useRef } from 'react';
import { coachRepo, conversationRepo, messageRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, ArrowLeft, AlertTriangle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function Messages() {
  const { user, isAdmin } = useCurrentUser();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  // Draft state: a coach picked from "Message a Coach" before any message
  // exists — the first send goes through messaging.start.
  const [draftCoach, setDraftCoach] = useState(null);
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
      .then(data => setCoaches(data))
      .catch(() => setCoaches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadConversations = async () => {
    try {
      // No participant filter: per-document grants already scope the result
      // to conversations the caller can read (their own, or their child's
      // for guardians). Admins hold a label read grant over the whole
      // collection, so for them we narrow to conversations they actually
      // participate in — the moderation view lives in /admin/messages.
      const all = await conversationRepo.list('-last_message_at');
      const visible = all.filter(c => !c.is_archived
        && (!isAdmin || c.participant_emails?.includes(user.email)));
      setConversations(visible);
      return visible;
    } catch (err) {
      console.error('loadConversations failed', err);
      setConversations([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convo) => {
    setSelectedConvo(convo);
    setDraftCoach(null);
    try {
      const msgs = await messageRepo.filter({ conversation_id: convo.id }, 'created_date');
      setMessages(msgs);
    } catch (err) {
      console.error('loadMessages failed', err);
      setMessages([]);
    }
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (!selectedConvo) return;
    // Appwrite realtime: the callback receives { events: string[], payload }
    // — messageRepo.subscribe normalises that to { events, type, payload }.
    const unsub = messageRepo.subscribe((event) => {
      if (event.type !== 'create') return;
      const doc = event.payload;
      if (!doc || doc.conversation_id !== selectedConvo.id) return;
      setMessages(prev => {
        // Dedupe against optimistic sends and replayed events.
        if (prev.some(m => m.id === doc.id)) return prev;
        return [...prev, doc];
      });
    });
    return unsub;
  }, [selectedConvo]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = newMsg.trim();
    if (!content || (!selectedConvo && !draftCoach)) return;
    setSending(true);

    const senderFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
    const tempId = `optimistic-${Date.now()}`;
    const optimistic = {
      id: tempId,
      conversation_id: selectedConvo?.id || '',
      sender_email: user.email,
      sender_name: senderFullName,
      content,
      created_date: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg('');

    try {
      if (selectedConvo) {
        // Sends are server-mediated: messaging.send binds the sender, checks
        // participation/blocks and bumps the conversation preview.
        const sent = await messageRepo.send(selectedConvo.id, content);
        setMessages(prev => prev.map(m => {
          if (m.id !== tempId) return m;
          // If realtime already delivered the real document, just drop the temp.
          return sent && !prev.some(x => x.id === sent.id) ? sent : null;
        }).filter(Boolean));
      } else {
        // First message to a coach — starts (or reuses) the conversation.
        const { conversation, message } = await conversationRepo.start({
          coach_id: draftCoach.id,
          first_message: content,
        });
        setDraftCoach(null);
        const refreshed = await loadConversations();
        const opened = refreshed.find(c => c.id === conversation?.id) || conversation;
        if (opened) {
          setSelectedConvo(opened);
          setMessages(message ? [message] : []);
        }
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setNewMsg(content);
      toast.error(err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const getOtherName = (convo) => {
    const idx = convo.participant_emails?.findIndex(e => e !== user.email);
    return convo.participant_names?.[idx] || convo.participant_emails?.[idx] || 'Unknown';
  };

  const startConvoWithCoach = (coach) => {
    setShowNewConvo(false);
    // Reuse an existing thread when one is already visible.
    const existing = coach.email
      ? conversations.find(c => c.participant_emails?.some(
          e => String(e).toLowerCase() === String(coach.email).toLowerCase(),
        ))
      : conversations.find(c => c.coach_id === coach.id);
    if (existing) {
      loadMessages(existing);
      return;
    }
    setSelectedConvo(null);
    setMessages([]);
    setDraftCoach(coach);
  };

  const chatTitle = selectedConvo
    ? getOtherName(selectedConvo)
    : draftCoach
      ? `${draftCoach.first_name || ''} ${draftCoach.last_name || ''}`.trim()
      : '';

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  const chatOpen = Boolean(selectedConvo || draftCoach);

  return (
    <div className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground mb-6">Messages</h1>

        <div className="bg-card border border-border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
          <div className="flex h-full">
            {/* Conversation List */}
            <div className={`w-full sm:w-80 border-r border-border flex flex-col ${chatOpen ? 'hidden sm:flex' : 'flex'}`}>
              <div className="p-3 border-b border-border">
                <Button
                  size="sm"
                  onClick={() => setShowNewConvo(!showNewConvo)}
                  className="w-full bg-accent text-accent-foreground font-semibold text-xs hover:bg-accent/90"
                >
                  <Plus className="w-3 h-3 mr-1" /> Message a coach
                </Button>
                {showNewConvo && (
                  <div className="mt-2 space-y-1">
                    {coaches.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No coaches available yet.</p>
                    ) : coaches.map(c => (
                      <button
                        key={c.id}
                        onClick={() => startConvoWithCoach(c)}
                        className="w-full text-left px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-sm"
                      >
                        <span className="font-semibold">{c.first_name} {c.last_name}</span>
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
                      <p className="text-sm font-semibold text-foreground">{getOtherName(convo)}</p>
                      {convo.last_message && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{convo.last_message}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col ${!chatOpen ? 'hidden sm:flex' : 'flex'}`}>
              {chatOpen ? (
                <>
                  {/* Header */}
                  <div className="p-4 border-b border-border flex items-center gap-3">
                    <button
                      onClick={() => { setSelectedConvo(null); setDraftCoach(null); }}
                      className="sm:hidden"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <p className="font-semibold text-foreground">{chatTitle}</p>
                  </div>

                  {/* Monitoring Disclaimer */}
                  <div className="px-4 py-2 bg-accent/5 border-b border-accent/20 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-accent shrink-0" />
                    <p className="text-xs text-accent/80">All messages are monitored for safety and quality purposes.</p>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {draftCoach && messages.length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-8">
                        Send a message to start the conversation with {chatTitle}.
                      </p>
                    )}
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_email === user.email ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                          msg.sender_email === user.email
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-secondary text-foreground'
                        } ${msg._optimistic ? 'opacity-70' : ''}`}>
                          <p className="text-sm">{msg.content}</p>
                          <p className="text-[10px] opacity-60 mt-1">
                            {msg._optimistic ? 'Sending…' : format(new Date(msg.created_date), 'h:mm a')}
                          </p>
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
                        aria-label="Message"
                        className="bg-secondary border-border"
                      />
                      <Button
                        onClick={handleSend}
                        disabled={sending || !newMsg.trim()}
                        aria-label="Send message"
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                      >
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
