import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { useMessages } from '@findstoop/shared/hooks/useMessages'
import { supabase } from '../../lib/supabase'
import type { Profile } from '@findstoop/shared/types/profile'
import { MessageSquare } from 'lucide-react'

function Skeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
          <div className={`h-10 rounded-2xl animate-pulse ${i % 2 === 0 ? 'bg-brand-100 w-40' : 'bg-gray-200 w-52'}`} />
        </div>
      ))}
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

export default function TenantMessages() {
  const { user } = useAuth()
  const tenantId = user?.id
  const { lease } = useTenantDashboard(tenantId)
  const [manager, setManager] = useState<Profile | null>(null)

  // Fetch manager profile once we have the lease's unit
  useEffect(() => {
    if (!lease) return
    supabase
      .from('units')
      .select('property_id, properties:property_id(manager_id, profiles:manager_id(*))')
      .eq('id', lease.unit_id)
      .single()
      .then(({ data }: any) => {
        const p = data?.properties?.profiles
        if (p) setManager(Array.isArray(p) ? p[0] : p)
      })
  }, [lease?.unit_id])

  const { messages, loading, sending, send } = useMessages(
    lease?.id ?? null,
    tenantId,
    manager?.id
  )

  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new message
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

  const managerName = manager?.full_name ?? 'Property Manager'

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
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {managerName[0]?.toUpperCase() ?? 'M'}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{managerName}</p>
          <p className="text-xs text-gray-400">Property Manager</p>
        </div>
      </div>

      {/* No lease state */}
      {!lease && !loading && (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <MessageSquare className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
            <p className="text-sm text-gray-500">No active lease found. You'll be able to message your property manager once a lease is set up.</p>
          </div>
        </div>
      )}

      {/* Thread */}
      {lease && (
        <>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-2xl mb-1">👋</p>
                  <p className="text-sm">Send a message to your property manager</p>
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
                    <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === tenantId} />
                  ))}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="bg-white border-t border-gray-200 px-3 py-3 flex items-end gap-2 shrink-0">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your manager…"
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
        </>
      )}
    </div>
  )
}
