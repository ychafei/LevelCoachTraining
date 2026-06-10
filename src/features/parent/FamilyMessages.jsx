import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, MessageSquare, MessagesSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { conversationRepo, messageRepo } from '@/api/repo';
import { formatInstantInTz } from '@/lib/scheduleET';
import { EmptyState, SectionCard, SkeletonRows } from '@/features/athlete/portalShared';

function sameEmail(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

function conversationTitle(conversation, userEmail) {
  const names = conversation.participant_names || [];
  const emails = conversation.participant_emails || [];
  const others = names.filter((_, index) => !sameEmail(emails[index], userEmail));
  return (others.length > 0 ? others : names).join(', ') || 'Conversation';
}

function MonitoredThreadDialog({ conversation, userEmail, onClose }) {
  const query = useQuery({
    queryKey: ['portal', 'thread', conversation?.id],
    enabled: !!conversation?.id,
    queryFn: () => messageRepo.filter({ conversation_id: conversation.id }, 'created_date'),
  });

  const messages = (query.data || []).filter((message) => !message.is_deleted);

  return (
    <Dialog open={!!conversation} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle>{conversation ? conversationTitle(conversation, userEmail) : ''}</DialogTitle>
          <DialogDescription>
            Read-only monitoring view of your child&apos;s conversation. You can see every message but cannot send on their behalf.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <SkeletonRows rows={3} />
        ) : messages.length === 0 ? (
          <p className="rounded-md border border-border bg-background/40 p-4 text-sm text-muted-foreground">
            No messages in this conversation yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-foreground">{message.sender_name || message.sender_email}</p>
                  <p className="text-[11px] text-muted-foreground">{formatInstantInTz(message.created_date)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.content}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Conversations readable by a guardian include their own threads plus any
// thread a linked minor participates in (per-document guardian read grants).
export default function FamilyMessages({ user }) {
  const [monitored, setMonitored] = useState(null);
  const query = useQuery({
    queryKey: ['portal', 'conversations', user?.id],
    enabled: !!user?.id,
    queryFn: () => conversationRepo.list('-last_message_at'),
  });

  const conversations = query.data || [];
  const mine = conversations.filter((c) => (c.participant_emails || []).some((email) => sameEmail(email, user?.email)));
  const monitoredThreads = conversations.filter((c) => !(c.participant_emails || []).some((email) => sameEmail(email, user?.email)));

  const renderList = (items, isMonitored) => (
    <ul className="space-y-2">
      {items.map((conversation) => (
        <li key={conversation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{conversationTitle(conversation, user?.email)}</p>
              {isMonitored && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Monitored</Badge>
              )}
            </div>
            {conversation.last_message && (
              <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted-foreground">{conversation.last_message}</p>
            )}
            {conversation.last_message_at && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">{formatInstantInTz(conversation.last_message_at)}</p>
            )}
          </div>
          {isMonitored ? (
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={() => setMonitored(conversation)}>
              <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> View (read-only)
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs">
              <Link to="/messages">Open in Messages</Link>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Your conversations"
        icon={MessageSquare}
        action={(
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <Link to="/messages">Go to Messages</Link>
          </Button>
        )}
      >
        {query.isLoading ? (
          <SkeletonRows rows={2} />
        ) : mine.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            body="Message a coach from their profile to ask questions before you book."
            cta={{ href: '/coaches', label: 'Browse coaches' }}
            compact
          />
        ) : renderList(mine, false)}
      </SectionCard>

      <SectionCard
        title="Your children's conversations"
        icon={MessagesSquare}
        description="For safety, you automatically get read access to every conversation your linked minor athletes are part of."
      >
        {query.isLoading ? (
          <SkeletonRows rows={2} />
        ) : monitoredThreads.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No monitored conversations"
            body="When a child on your account messages a coach, the thread shows up here for you to review."
            compact
          />
        ) : renderList(monitoredThreads, true)}
      </SectionCard>

      <MonitoredThreadDialog conversation={monitored} userEmail={user?.email} onClose={() => setMonitored(null)} />
    </div>
  );
}
