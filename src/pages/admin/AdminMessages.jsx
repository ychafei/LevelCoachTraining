import React, { useEffect, useState } from 'react';
import { conversationRepo, messageRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';

export default function AdminMessages() {
  const { isAdmin } = useCurrentUser();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    conversationRepo.list('-last_message_at').then(data => {
      setConversations(data);
      setLoading(false);
    });
  }, []);

  const openConvo = async (convo) => {
    setSelected(convo);
    const msgs = await messageRepo.filter({ conversation_id: convo.id }, 'created_date');
    setMessages(msgs);
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-8">CONVERSATIONS</h1>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List */}
            <div className="lg:col-span-1 space-y-2">
              {conversations.map(convo => (
                <button
                  key={convo.id}
                  onClick={() => openConvo(convo)}
                  className={`w-full text-left bg-card border rounded-lg p-3 transition-all hover:border-accent/30 ${selected?.id === convo.id ? 'border-accent/50' : 'border-border'}`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{convo.participant_names?.join(', ') || 'Unknown'}</p>
                      <Badge variant="secondary" className="text-xs mt-0.5">{convo.type}</Badge>
                    </div>
                  </div>
                  {convo.last_message && <p className="text-xs text-muted-foreground mt-1.5 truncate">{convo.last_message}</p>}
                </button>
              ))}
              {conversations.length === 0 && <p className="text-muted-foreground text-sm">No conversations.</p>}
            </div>

            {/* Messages */}
            <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4 min-h-[400px]">
              {!selected ? (
                <p className="text-muted-foreground text-sm text-center mt-16">Select a conversation</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_email === selected.participant_emails?.[0] ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[70%] bg-secondary rounded-lg px-3 py-2">
                        <p className="text-xs text-accent font-display tracking-wider mb-0.5">{msg.sender_name}</p>
                        <p className="text-sm text-foreground">{msg.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">{msg.created_date ? format(new Date(msg.created_date), 'MMM d, h:mm a') : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}