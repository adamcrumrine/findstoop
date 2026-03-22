import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useConversations, useMessages } from '@findstoop/shared/hooks/useMessages'
import type { ConversationSummary } from '@findstoop/shared/api/messages'

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function MessageBubble({ msg, isOwn }: { msg: { id: string; body: string; created_at: string }; isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
          isOwn
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        <p className="leading-relaxed">{msg.body}</p>
        <p className={`text-[10px] mt-1 ${isOwn ? 'text-brand-200' : 'text-gray-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function ConversationList({
  conversations,
  loading,
  selected,
  onSelect,
}: {
  conversations: ConversationSummary[]
  loading: boolean
  selected: ConversationSummary | null
  onSelect: (c: ConversationSummary) => void
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
            <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center px-4 py-12">
        <p className="text-3xl mb-2">💬</p>
        <p className="text-sm text-gray-500">No tenant conversations yet</p>
        <p className="text-xs text-gray-400 mt-1">Conversations appear once tenants have active leases</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map((c) => (
        <button
          key={c.leaseId}
          onClick={() => onSelect(c)}
          className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left ${
            selected?.leaseId === c.leaseId ? 'bg-brand-50' : ''
          }`}
        >
          <Avatar name={c.tenantName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm text-gray-900 truncate">{c.tenantName}</p>
              {c.lastMessageAt && (
                <p className="text-[10px] text-gray-400 shrink-0">
                  {new Date(c.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-gray-500 truncate">{c.lastMessage ?? 'No messages yet'}</p>
              {c.unreadCount > 0 && (
                <span className="bg-brand-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                  {c.unreadCount > 9 ? '9+' : c.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function ChatThread({
  conversation,
  managerId,
  onBack,
}: {
  conversation: ConversationSummary
  managerId: string
  onBack: () => void
}) {
  const { messages, loading, sending, send } = useMessages(
    conversation.leaseId,
    managerId,
    conversation.tenantId
  )
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    const body = draft
    setDraft('')
    await send(body)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date
  const grouped: { date: string; msgs: typeof messages }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    })
    const last = grouped[grouped.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      grouped.push({ date, msgs: [msg] })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="md:hidden text-gray-500 hover:text-gray-700 mr-1"
        >
          ←
        </button>
        <Avatar name={conversation.tenantName} />
        <div>
          <p className="font-semibold text-gray-900 text-sm">{conversation.tenantName}</p>
          <p className="text-xs text-gray-400">{conversation.tenantEmail}</p>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-full px-4">
            {[1, 2].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className={`h-10 rounded-2xl animate-pulse ${i % 2 === 0 ? 'bg-brand-100 w-40' : 'bg-gray-200 w-52'}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-1">👋</p>
              <p className="text-sm">Start a conversation with {conversation.tenantName}</p>
            </div>
          )}
          {grouped.map(({ date, msgs }) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-400 font-medium">{date}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              {msgs.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === managerId} />
              ))}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-3 py-3 flex items-end gap-2 shrink-0">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${conversation.tenantName}…`}
          rows={1}
          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-28 overflow-y-auto"
          style={{ minHeight: '40px' }}
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="w-10 h-10 bg-brand-600 text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
        >
          <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function ManagerMessages() {
  const { user } = useAuth()
  const managerId = user?.id
  const { properties } = useProperties(managerId)
  const propertyIds = properties.map((p) => p.id)
  const { units } = useUnits(propertyIds)
  const unitIds = units.map((u) => u.id)
  const { conversations, loading } = useConversations(unitIds, managerId)

  const [selected, setSelected] = useState<ConversationSummary | null>(null)
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-0px)] -m-4 md:-m-6">
      {/* Sidebar — conversation list */}
      <div className={`w-full md:w-80 flex flex-col border-r border-gray-200 bg-white shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Messages</h1>
            {totalUnread > 0 && (
              <span className="bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalUnread} unread
              </span>
            )}
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          loading={loading}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {/* Thread panel */}
      <div className={`flex-1 flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected && managerId ? (
          <ChatThread
            conversation={selected}
            managerId={managerId}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-sm">Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}
