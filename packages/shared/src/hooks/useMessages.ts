import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  getMessages,
  sendMessage as apiSendMessage,
  markMessagesRead,
  getConversationSummaries,
} from '../api/messages'
import type { Message } from '../types/message'
import type { ConversationSummary } from '../api/messages'

// ── Thread hook (with Realtime) ───────────────────────────────────────────────

interface UseMessagesResult {
  messages: Message[]
  loading: boolean
  sending: boolean
  send: (body: string) => Promise<void>
}

export function useMessages(
  leaseId: string | null,
  currentUserId: string | undefined,
  recipientId: string | undefined
): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    if (!leaseId) return
    setLoading(true)
    try {
      const data = await getMessages(leaseId)
      setMessages(data)
      // Mark incoming messages as read
      if (currentUserId) await markMessagesRead(leaseId, currentUserId)
    } finally {
      setLoading(false)
    }
  }, [leaseId, currentUserId])

  useEffect(() => {
    load()
  }, [load])

  // Realtime subscription
  useEffect(() => {
    if (!leaseId) return

    const channel = supabase
      .channel(`messages:${leaseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `lease_id=eq.${leaseId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Mark as read if we're the recipient
          if (currentUserId && msg.recipient_id === currentUserId) {
            markMessagesRead(leaseId, currentUserId)
          }
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [leaseId, currentUserId])

  const send = async (body: string) => {
    if (!leaseId || !currentUserId || !recipientId || !body.trim()) return
    setSending(true)
    try {
      const msg = await apiSendMessage(currentUserId, recipientId, leaseId, body.trim())
      setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]))
    } finally {
      setSending(false)
    }
  }

  return { messages, loading, sending, send }
}

// ── Conversations list hook (manager) ────────────────────────────────────────

interface UseConversationsResult {
  conversations: ConversationSummary[]
  loading: boolean
  reload: () => void
}

export function useConversations(unitIds: string[], managerId: string | undefined): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!managerId || unitIds.length === 0) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await getConversationSummaries(unitIds, managerId)
      setConversations(data)
    } finally {
      setLoading(false)
    }
  }, [unitIds.join(','), managerId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Realtime: refresh conversation list on any new message
  useEffect(() => {
    if (!managerId) return
    const channel = supabase
      .channel(`conversations:${managerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [managerId, load])

  return { conversations, loading, reload: load }
}
