import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { coachRepo, conversationRepo, messageRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Star,
  UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { coachBookHref, coachProfileHref, publicCoachDisplay } from '@/lib/publicCoach';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
];

function sameEmail(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase() && Boolean(a);
}

function formatTime(value, pattern, fallback = '') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern);
}

function coachName(coach) {
  return [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim() || coach?.name || 'LevelCoach Coach';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return `${first}${last}`.toUpperCase() || 'LC';
}

function participantName(conversation, user) {
  const emails = conversation?.participant_emails || [];
  const names = conversation?.participant_names || [];
  const idx = emails.findIndex((email) => !sameEmail(email, user?.email));
  if (idx >= 0) return names[idx] || emails[idx] || 'Conversation';
  return names[0] || emails[0] || 'Conversation';
}

function participantEmail(conversation, user) {
  const emails = conversation?.participant_emails || [];
  const idx = emails.findIndex((email) => !sameEmail(email, user?.email));
  if (idx >= 0) return emails[idx] || '';
  return emails[0] || '';
}

function messagePreview(message) {
  const content = String(message?.content || '').trim();
  if (!content) return 'No message preview yet';
  return content.length > 110 ? `${content.slice(0, 110)}...` : content;
}

function lastActivity(conversation, meta) {
  return meta?.lastAt || conversation?.last_message_at || conversation?.updated_date || conversation?.created_date || '';
}

function sortConversations(conversations, metaById) {
  return [...conversations].sort((a, b) => {
    const aTime = new Date(lastActivity(a, metaById[a.id]) || 0).getTime() || 0;
    const bTime = new Date(lastActivity(b, metaById[b.id]) || 0).getTime() || 0;
    return bTime - aTime;
  });
}

function ThreadAvatar({ name, photoUrl, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-lg' : 'h-11 w-11 text-sm';
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-blue-50 font-display font-extrabold text-blue-800 ring-1 ring-blue-100 ${sizeClass}`}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function ConversationDetails({
  conversation,
  draftCoach,
  coach,
  otherName,
  otherEmail,
  canSend,
  onArchive,
  archiving,
}) {
  const activeCoach = draftCoach || coach;
  const model = activeCoach ? publicCoachDisplay(activeCoach) : null;
  const displayName = model?.displayName || otherName || 'Select a conversation';
  const photoUrl = model?.photoUrl || '';
  const archived = conversation?.is_archived === true;
  const coachId = model?.id || activeCoach?.id || conversation?.coach_id || '';

  return (
    <aside className="hidden w-[320px] shrink-0 border-l border-slate-200 bg-white xl:flex xl:flex-col">
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="eyebrow text-slate-500">Details</p>
      </div>

      {conversation || draftCoach ? (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="text-center">
            <ThreadAvatar name={displayName} photoUrl={photoUrl} size="lg" />
            <h2 className="mt-4 font-display text-2xl font-bold text-slate-950">{displayName}</h2>
            {model?.ratingLabel ? (
              <p className="mt-2 inline-flex items-center justify-center gap-1 text-sm font-bold text-slate-700">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                {model.ratingLabel} · {model.reviewLabel}
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-slate-500">{model?.reviewLabel || otherEmail || 'Thread details'}</p>
            )}
          </div>

          {model && (
            <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
              <DetailRow label="Sport" value={model.primarySport} />
              <DetailRow label="Location" value={model.locationLabel} />
              <DetailRow label="Availability" value={model.availability} />
              <DetailRow label="Rate" value={model.rateLabel || 'Shown at booking'} />
            </div>
          )}

          <div className="mt-6 grid gap-2">
            {coachId && (
              <>
                <Button asChild className="h-11 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700">
                  <Link to={coachBookHref({ id: coachId }, { schedule: '1' })}>
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    Schedule training
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-lg border-blue-200 font-bold text-blue-700 hover:bg-blue-50">
                  <Link to={coachProfileHref({ id: coachId })}>View coach profile</Link>
                </Button>
              </>
            )}
            {conversation && canSend && (
              <Button
                type="button"
                variant="outline"
                onClick={onArchive}
                disabled={archiving}
                className="h-11 rounded-lg border-slate-200 font-bold text-slate-700 hover:bg-slate-50"
              >
                {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {archived ? 'Unarchive thread' : 'Archive thread'}
              </Button>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-slate-950">Safety monitored</p>
                <p className="mt-1 text-xs leading-5 text-slate-700">
                  Keep scheduling, payment, and training communication inside LevelCoach. Guardian-visible threads stay read-only unless the account is a direct participant.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <div>
            <MessageSquare className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-500">Select a thread to see coach and conversation details.</p>
          </div>
        </div>
      )}
    </aside>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="max-w-[170px] text-right font-bold text-slate-900">{value || 'Not set'}</span>
    </div>
  );
}

export default function Messages() {
  const { user, isAdmin, isCoach } = useCurrentUser();
  const [conversations, setConversations] = useState([]);
  const [conversationMeta, setConversationMeta] = useState({});
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [draftCoach, setDraftCoach] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState('');
  const [coaches, setCoaches] = useState([]);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState('');
  const [archivingId, setArchivingId] = useState('');
  const msgEndRef = useRef(null);

  const canParticipateIn = (convo) => {
    if (!convo || !user) return false;
    if ((convo.participant_emails || []).some((email) => sameEmail(email, user.email))) return true;
    return Boolean(isCoach && user?.coach_id && convo.coach_id === user.coach_id);
  };

  const loadMetaForConversation = async (convo) => {
    const rows = await messageRepo.filter({ conversation_id: convo.id }, '-created_date').catch(() => []);
    const unreadCount = rows.filter((message) => (
      !sameEmail(message.sender_email, user?.email)
      && !(message.read_by || []).some((email) => sameEmail(email, user?.email))
    )).length;
    const latestMessage = rows[0] || null;
    return {
      unreadCount,
      latestMessage,
      lastAt: latestMessage?.created_date || convo.last_message_at || '',
    };
  };

  const loadConversations = async () => {
    try {
      const all = await conversationRepo.list('-last_message_at');
      const visible = all.filter((c) => (
        !isAdmin || (c.participant_emails || []).some((email) => sameEmail(email, user.email))
      ));
      const metaEntries = await Promise.all(
        visible.map(async (convo) => [convo.id, await loadMetaForConversation(convo)]),
      );
      const meta = Object.fromEntries(metaEntries);
      setConversationMeta(meta);
      setConversations(sortConversations(visible, meta));
      return visible;
    } catch (err) {
      console.error('loadConversations failed', err);
      setConversations([]);
      setConversationMeta({});
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadConversations();
    coachRepo.filter({ is_active: true })
      .then((data) => setCoaches(data))
      .catch(() => setCoaches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markConversationRead = async (convo, currentMessages) => {
    if (!canParticipateIn(convo)) return currentMessages;
    await messageRepo.markRead(convo.id).catch(() => {});
    const readMessages = currentMessages.map((message) => {
      if (sameEmail(message.sender_email, user?.email)) return message;
      if ((message.read_by || []).some((email) => sameEmail(email, user?.email))) return message;
      return { ...message, read_by: [...(message.read_by || []), user.email].filter(Boolean) };
    });
    setConversationMeta((prev) => ({
      ...prev,
      [convo.id]: {
        ...(prev[convo.id] || {}),
        unreadCount: 0,
        latestMessage: readMessages[0] || prev[convo.id]?.latestMessage || null,
        lastAt: (readMessages[0] || prev[convo.id]?.latestMessage)?.created_date || convo.last_message_at || '',
      },
    }));
    return readMessages;
  };

  const loadMessages = async (convo) => {
    setSelectedConvo(convo);
    setDraftCoach(null);
    setShowNewConvo(false);
    setMenuOpenFor('');
    setMessageLoading(true);
    setMessageLoadError('');
    try {
      const rows = await messageRepo.filter({ conversation_id: convo.id }, 'created_date');
      const readRows = await markConversationRead(convo, rows);
      setMessages(readRows);
    } catch (err) {
      console.error('loadMessages failed', err);
      setMessages([]);
      setMessageLoadError(err?.message || 'Could not load this conversation.');
    } finally {
      setMessageLoading(false);
    }
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (!selectedConvo) return undefined;
    const unsub = messageRepo.subscribe((event) => {
      if (event.type !== 'create') return;
      const doc = event.payload;
      if (!doc || doc.conversation_id !== selectedConvo.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === doc.id)) return prev;
        return [...prev, doc];
      });
      setConversationMeta((prev) => ({
        ...prev,
        [selectedConvo.id]: {
          ...(prev[selectedConvo.id] || {}),
          latestMessage: doc,
          lastAt: doc.created_date,
          unreadCount: sameEmail(doc.sender_email, user?.email) ? 0 : prev[selectedConvo.id]?.unreadCount || 0,
        },
      }));
      if (!sameEmail(doc.sender_email, user?.email) && canParticipateIn(selectedConvo)) {
        messageRepo.markRead(selectedConvo.id).catch(() => {});
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo, user?.email, isCoach, user?.coach_id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedCoach = useMemo(() => {
    if (draftCoach) return draftCoach;
    if (!selectedConvo?.coach_id) return null;
    return coaches.find((coach) => coach.id === selectedConvo.coach_id || coach.$id === selectedConvo.coach_id) || null;
  }, [coaches, draftCoach, selectedConvo]);

  const chatTitle = selectedConvo
    ? participantName(selectedConvo, user)
    : draftCoach
      ? coachName(draftCoach)
      : '';
  const otherEmail = selectedConvo ? participantEmail(selectedConvo, user) : '';
  const canSend = Boolean(draftCoach) || canParticipateIn(selectedConvo);
  const chatOpen = Boolean(selectedConvo || draftCoach);

  const filterCounts = useMemo(() => ({
    all: conversations.filter((convo) => convo.is_archived !== true).length,
    unread: conversations.filter((convo) => convo.is_archived !== true && (conversationMeta[convo.id]?.unreadCount || 0) > 0).length,
    archived: conversations.filter((convo) => convo.is_archived === true).length,
  }), [conversations, conversationMeta]);

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortConversations(conversations, conversationMeta).filter((convo) => {
      const archived = convo.is_archived === true;
      const unread = (conversationMeta[convo.id]?.unreadCount || 0) > 0;
      if (filter === 'all' && archived) return false;
      if (filter === 'unread' && (archived || !unread)) return false;
      if (filter === 'archived' && !archived) return false;
      if (!term) return true;
      const haystack = [
        participantName(convo, user),
        participantEmail(convo, user),
        convo.last_message,
        conversationMeta[convo.id]?.latestMessage?.content,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, conversationMeta, filter, searchTerm, user]);

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
      read_by: [user.email],
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setNewMsg('');

    try {
      if (selectedConvo) {
        const sent = await messageRepo.send(selectedConvo.id, content);
        const timestamp = sent?.created_date || optimistic.created_date;
        setMessages((prev) => prev.map((message) => {
          if (message.id !== tempId) return message;
          return sent && !prev.some((item) => item.id === sent.id) ? sent : null;
        }).filter(Boolean));
        const updatedConvo = {
          ...selectedConvo,
          last_message: content.slice(0, 20000),
          last_message_at: timestamp,
        };
        setSelectedConvo(updatedConvo);
        setConversations((prev) => sortConversations(
          prev.map((convo) => (convo.id === selectedConvo.id ? updatedConvo : convo)),
          conversationMeta,
        ));
        setConversationMeta((prev) => ({
          ...prev,
          [selectedConvo.id]: {
            ...(prev[selectedConvo.id] || {}),
            latestMessage: sent || optimistic,
            unreadCount: 0,
            lastAt: timestamp,
          },
        }));
      } else {
        const { conversation, message } = await conversationRepo.start({
          coach_id: draftCoach.id,
          first_message: content,
        });
        setDraftCoach(null);
        const opened = conversation;
        if (opened) {
          setSelectedConvo(opened);
          setMessages(message ? [message] : []);
          setConversations((prev) => sortConversations(
            [opened, ...prev.filter((convo) => convo.id !== opened.id)],
            conversationMeta,
          ));
          setConversationMeta((prev) => ({
            ...prev,
            [opened.id]: {
              latestMessage: message || optimistic,
              unreadCount: 0,
              lastAt: message?.created_date || opened.last_message_at || optimistic.created_date,
            },
          }));
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setNewMsg(content);
      toast.error(err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const startConvoWithCoach = (coach) => {
    setShowNewConvo(false);
    const existing = coach.email
      ? conversations.find((convo) => (convo.participant_emails || []).some((email) => sameEmail(email, coach.email)))
      : conversations.find((convo) => convo.coach_id === coach.id);
    if (existing) {
      loadMessages(existing);
      return;
    }
    setSelectedConvo(null);
    setMessages([]);
    setDraftCoach(coach);
  };

  const archiveConversation = async (convo = selectedConvo, archived = !(selectedConvo?.is_archived === true)) => {
    if (!convo || !canParticipateIn(convo)) return;
    setArchivingId(convo.id);
    setMenuOpenFor('');
    try {
      const updated = await conversationRepo.archive(convo.id, archived);
      const next = updated || { ...convo, is_archived: archived };
      setConversations((prev) => sortConversations(
        prev.map((item) => (item.id === convo.id ? { ...item, ...next } : item)),
        conversationMeta,
      ));
      if (selectedConvo?.id === convo.id) setSelectedConvo((prev) => ({ ...prev, ...next }));
      toast.success(archived ? 'Conversation archived.' : 'Conversation restored.');
    } catch (err) {
      toast.error(err?.message || 'Could not update this conversation.');
    } finally {
      setArchivingId('');
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-blue-700">LevelCoach inbox</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-950">Messages</h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            Keep training communication, schedule changes, and parent-visible safety records inside LevelCoach.
          </p>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid min-h-[74vh] grid-cols-1 lg:grid-cols-[390px_1fr] xl:grid-cols-[390px_1fr_320px]">
            <div className={`border-r border-slate-200 bg-white ${chatOpen ? 'hidden lg:flex' : 'flex'} flex-col`}>
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search messages"
                      aria-label="Search messages"
                      className="h-10 rounded-lg border-slate-200 bg-slate-50 pl-9 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => setShowNewConvo((value) => !value)}
                    className="h-10 rounded-lg bg-blue-600 px-3 font-bold text-white hover:bg-blue-700"
                    aria-expanded={showNewConvo}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Message a coach</span>
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`rounded-md px-3 py-2 text-sm font-bold transition ${
                        filter === item.key
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {item.label}
                      <span className="ml-1 text-xs text-slate-400">{filterCounts[item.key] || 0}</span>
                    </button>
                  ))}
                </div>

                {showNewConvo && (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Message a coach</p>
                    <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                      {coaches.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-600">No coaches available yet.</p>
                      ) : coaches.slice(0, 12).map((coach) => {
                        const name = coachName(coach);
                        return (
                          <button
                            key={coach.id}
                            type="button"
                            onClick={() => startConvoWithCoach(coach)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white"
                          >
                            <ThreadAvatar name={name} photoUrl={coach.photo_url} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-slate-950">{name}</span>
                              <span className="block truncate text-xs font-semibold text-slate-600">{coach.primary_sport || coach.sport || 'Private coaching'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-8 py-16 text-center">
                    <div>
                      <Inbox className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
                      <p className="mt-3 text-sm font-bold text-slate-950">
                        {filter === 'archived' ? 'No archived threads' : filter === 'unread' ? 'No unread messages' : 'No conversations yet'}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {filter === 'all' ? 'Start a thread with a coach when you need to coordinate training.' : 'Try another inbox filter.'}
                      </p>
                    </div>
                  </div>
                ) : filteredConversations.map((convo) => {
                  const meta = conversationMeta[convo.id] || {};
                  const name = participantName(convo, user);
                  const unread = meta.unreadCount || 0;
                  const active = selectedConvo?.id === convo.id;
                  const rowCoach = convo.coach_id
                    ? coaches.find((coach) => coach.id === convo.coach_id || coach.$id === convo.coach_id)
                    : null;
                  const preview = meta.latestMessage?.content || convo.last_message || '';
                  const archived = convo.is_archived === true;

                  return (
                    <div key={convo.id} className={`group relative border-b border-slate-100 ${active ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'}`}>
                      <button
                        type="button"
                        onClick={() => loadMessages(convo)}
                        className="flex w-full min-w-0 gap-3 px-4 py-4 text-left"
                      >
                        <ThreadAvatar name={name} photoUrl={rowCoach?.photo_url} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="truncate text-sm font-extrabold text-slate-950">{name}</span>
                            <span className="shrink-0 text-xs font-semibold text-slate-500">
                              {formatTime(lastActivity(convo, meta), 'MMM d', '')}
                            </span>
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            {unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label={`${unread} unread`} />}
                            <span className={`line-clamp-2 text-sm leading-5 ${unread > 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                              {messagePreview({ content: preview })}
                            </span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                            {archived && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                                <Archive className="h-3 w-3" aria-hidden="true" />
                                Archived
                              </span>
                            )}
                            {canParticipateIn(convo) ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                                Direct thread
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <ShieldAlert className="h-3 w-3 text-blue-600" aria-hidden="true" />
                                Guardian view
                              </span>
                            )}
                          </span>
                        </span>
                      </button>

                      {canParticipateIn(convo) && (
                        <div className="absolute right-3 top-10">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenFor((id) => (id === convo.id ? '' : convo.id));
                            }}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-950 group-hover:opacity-100 focus:opacity-100"
                            aria-label="Conversation actions"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {menuOpenFor === convo.id && (
                            <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => archiveConversation(convo, !archived)}
                                disabled={archivingId === convo.id}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                              >
                                {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                {archived ? 'Unarchive' : 'Archive'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <main className={`${!chatOpen ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col bg-white`}>
              {chatOpen ? (
                <>
                  <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setSelectedConvo(null); setDraftCoach(null); setMessages([]); }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 lg:hidden"
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <ThreadAvatar name={chatTitle} photoUrl={selectedCoach?.photo_url} />
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-xl font-bold text-slate-950">{chatTitle}</h2>
                        <p className="truncate text-xs font-semibold text-slate-500">
                          {selectedConvo ? (
                            <>
                              <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                              Last active {formatTime(lastActivity(selectedConvo, conversationMeta[selectedConvo.id]), 'MMM d, h:mm a', 'recently')}
                            </>
                          ) : 'New conversation'}
                        </p>
                      </div>
                    </div>
                    {selectedConvo?.is_archived === true && (
                      <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 sm:inline-flex">Archived</span>
                    )}
                  </header>

                  <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 sm:px-5">
                    <p className="flex items-center gap-2 text-xs font-semibold leading-5 text-blue-800">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Messages are monitored for safety. Payments and scheduling should stay on LevelCoach.
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-5 sm:px-6">
                    {messageLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
                      </div>
                    ) : messageLoadError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
                        {messageLoadError}
                      </div>
                    ) : (
                      <div className="mx-auto max-w-3xl space-y-4">
                        {draftCoach && messages.length === 0 && (
                          <div className="rounded-lg border border-blue-100 bg-white p-5 text-center shadow-sm">
                            <MessageSquare className="mx-auto h-8 w-8 text-blue-600" aria-hidden="true" />
                            <p className="mt-2 text-sm font-bold text-slate-950">Start a conversation with {chatTitle}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">Ask about fit, training goals, or scheduling before you book.</p>
                          </div>
                        )}
                        {messages.map((msg) => {
                          const mine = sameEmail(msg.sender_email, user?.email);
                          return (
                            <div key={msg.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                              {!mine && <ThreadAvatar name={msg.sender_name || chatTitle} photoUrl={selectedCoach?.photo_url} />}
                              <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                                mine
                                  ? 'rounded-br-md bg-blue-600 text-white'
                                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                              } ${msg._optimistic ? 'opacity-70' : ''}`}
                              >
                                {!mine && msg.sender_name && (
                                  <p className="mb-1 text-xs font-extrabold text-slate-500">{msg.sender_name}</p>
                                )}
                                <p className="whitespace-pre-wrap text-sm leading-6">{msg.is_deleted ? 'This message was deleted.' : msg.content}</p>
                                <p className={`mt-1 text-[11px] font-semibold ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                                  {msg._optimistic ? 'Sending...' : formatTime(msg.created_date, 'h:mm a', '')}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={msgEndRef} />
                      </div>
                    )}
                  </div>

                  <footer className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
                    {canSend ? (
                      <div className="flex gap-2">
                        <Input
                          value={newMsg}
                          onChange={(event) => setNewMsg(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              handleSend();
                            }
                          }}
                          placeholder="Write a message"
                          aria-label="Message"
                          className="h-12 rounded-lg border-slate-200 bg-slate-50"
                        />
                        <Button
                          type="button"
                          onClick={handleSend}
                          disabled={sending || !newMsg.trim()}
                          aria-label="Send message"
                          className="h-12 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-700"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-blue-800">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          You can monitor this conversation, but only direct participants can send messages in this thread.
                        </p>
                      </div>
                    )}
                  </footer>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-8 text-center">
                  <div>
                    <UserRound className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
                    <h2 className="mt-4 font-display text-2xl font-bold text-slate-950">Select a conversation</h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      Pick a coach or client thread to review messages, schedule details, and safety context.
                    </p>
                  </div>
                </div>
              )}
            </main>

            <ConversationDetails
              conversation={selectedConvo}
              draftCoach={draftCoach}
              coach={selectedCoach}
              otherName={chatTitle}
              otherEmail={otherEmail}
              canSend={canSend}
              onArchive={() => archiveConversation(selectedConvo, !(selectedConvo?.is_archived === true))}
              archiving={Boolean(archivingId)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
