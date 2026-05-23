import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  getMessages,
  sendMessage as apiSendMessage,
  markConversationRead,
  getConversationSummaries,
} from '../api/messages'
import type { Message } from '../types/message'
import type { ConversationSummary } from '../api/messages'

// ── Thread hook (with Realtime) ───────────────────────────────────────────────

interface UseMessagesResult {
  messages: Message[]
  loading: boolean
  sending: boolean
  send: (body: string, image?: { url: string; path: string } | null) => Promise<void>
}

export function useMessages(
  conversationId: string | null,
  currentUserId: string | undefined,
): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    if (!conversationId) {
      // Without a conversation we have nothing to load, but we also have to
      // clear the loading flag — otherwise the Skeleton sticks forever while
      // the page is still trying to resolve which conversation to open.
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getMessages(conversationId)
      setMessages(data)
      if (currentUserId) await markConversationRead(conversationId, currentUserId)
    } finally {
      setLoading(false)
    }
  }, [conversationId, currentUserId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]))
          if (currentUserId && msg.sender_id !== currentUserId) {
            void markConversationRead(conversationId, currentUserId)
          }
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, currentUserId])

  const send: UseMessagesResult['send'] = async (body, image) => {
    if (!conversationId || !currentUserId) return
    if (!body.trim() && !image) return
    setSending(true)
    try {
      const msg = await apiSendMessage(currentUserId, conversationId, body.trim(), image ?? null)
      setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]))
    } finally {
      setSending(false)
    }
  }

  return { messages, loading, sending, send }
}

// ── Conversations list hook ──────────────────────────────────────────────────

interface UseConversationsResult {
  conversations: ConversationSummary[]
  loading: boolean
  reload: () => Promise<void>
}

export function useConversations(currentUserId: string | undefined): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentUserId) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await getConversationSummaries(currentUserId)
      setConversations(data)
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel(`conversations:${currentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void load()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        void load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId, load])

  return { conversations, loading, reload: load }
}
