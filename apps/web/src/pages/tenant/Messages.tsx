import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useTenantDashboard } from '@findstoop/shared/hooks/useTenantDashboard'
import { useMessages } from '@findstoop/shared/hooks/useMessages'
import { findOrCreateDirectConversation, uploadChatImage } from '@findstoop/shared/api/messages'
import { supabase } from '../../lib/supabase'
import type { Profile } from '@findstoop/shared/types/profile'
import { MessageSquare, ImagePlus, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import Avatar from '../../components/shared/Avatar'
import EmptyIllustration from '../../components/shared/EmptyIllustration'

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

function MessageBubble({ msg, isOwn }: {
  msg: { id: string; body: string; created_at: string; image_url?: string | null; image_purged_at?: string | null }
  isOwn: boolean
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
          isOwn
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {msg.image_url && !msg.image_purged_at && (
          <a href={msg.image_url} target="_blank" rel="noreferrer" className="block mb-1.5">
            <img src={msg.image_url} alt="" loading="lazy" decoding="async" className="max-w-full max-h-64 rounded-lg" />
          </a>
        )}
        {msg.image_purged_at && (
          <p className="text-xs italic opacity-70 mb-1.5">Image expired (older than 12 months)</p>
        )}
        {msg.body && <p className="leading-relaxed whitespace-pre-line">{msg.body}</p>}
        <p className={`text-[10px] mt-1 ${isOwn ? 'text-brand-200' : 'text-gray-500'}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// Retry remounts the whole subtree below, which re-runs every fetch in the
// chain (lease → manager profile → conversation → thread). Neither
// useTenantDashboard nor useMessages exposes a reload(), so a full remount
// is the simplest reliable "try again."
export default function TenantMessages() {
  const [retryCount, setRetryCount] = useState(0)
  return <TenantMessagesInner key={retryCount} onRetry={() => setRetryCount((c) => c + 1)} />
}

function TenantMessagesInner({ onRetry }: { onRetry: () => void }) {
  const { user } = useAuth()
  const tenantId = user?.id
  const { lease, error: leaseError } = useTenantDashboard(tenantId)
  const [manager, setManager] = useState<Profile | null>(null)
  const [managerError, setManagerError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationError, setConversationError] = useState<string | null>(null)

  // Fetch manager profile once we have the lease's unit
  useEffect(() => {
    if (!lease) return
    setManagerError(null)
    supabase
      .from('units')
      .select('property_id, properties:property_id(manager_id, profiles:manager_id(*))')
      .eq('id', lease.unit_id)
      .single()
      .then(({ data, error }: any) => {
        if (error) { setManagerError(error.message ?? 'Could not load your property manager'); return }
        const p = data?.properties?.profiles
        if (p) setManager(Array.isArray(p) ? p[0] : p)
      })
  }, [lease?.unit_id])

  // Resolve / create the 1:1 conversation with the manager.
  useEffect(() => {
    if (!manager?.id) return
    let cancelled = false
    setConversationError(null)
    findOrCreateDirectConversation(manager.id)
      .then((c) => { if (!cancelled) setConversationId(c.id) })
      .catch((e) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Could not open conversation'
        toast.error(msg)
        setConversationError(msg)
      })
    return () => { cancelled = true }
  }, [manager?.id])

  const error = leaseError || managerError || conversationError

  // markConversationRead fires from useMessages when the thread loads, which
  // clears unread for the participant row, which the badge hook re-checks
  // via realtime — so the green dot disappears once the tenant opens this
  // page. No extra write needed here.

  const { messages, loading, sending, send } = useMessages(conversationId, tenantId)

  const [draft, setDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleImage = async (file: File) => {
    if (!conversationId) return
    setUploading(true)
    try {
      const img = await uploadChatImage(conversationId, file)
      await send(draft.trim(), img)
      setDraft('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const companyName = (manager?.company_name ?? '').trim() || null
  const displayName = companyName ?? manager?.full_name ?? 'Property Manager'
  const displayLogo = manager?.company_logo_url ?? manager?.avatar_url ?? null
  const subtitle = companyName && manager?.full_name ? manager.full_name : 'Property Manager'

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
    <div className="flex flex-col bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-sm overflow-hidden max-w-3xl mx-auto" style={{ height: 'calc(100vh - 11rem)' }}>
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <Avatar url={displayLogo} name={displayName} email={manager?.email} size={36} />
        <div>
          <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {/* Couldn't load — lease, manager profile, or conversation creation
          failed. Distinct from "no lease" / "no messages yet" so a fetch
          failure doesn't masquerade as an empty state. */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <p className="text-sm font-medium text-ink">Couldn't load your messages.</p>
            <p className="text-xs text-mute mt-1">Check your connection and try again.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
              Check again
            </button>
          </div>
        </div>
      )}

      {/* No lease state */}
      {!lease && !loading && !error && (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <MessageSquare className="w-10 h-10 mx-auto mb-2 text-mute-400" strokeWidth={1.5} />
            <p className="text-sm text-gray-500">No active lease found. You'll be able to message your property manager once a lease is set up.</p>
          </div>
        </div>
      )}

      {/* Thread */}
      {lease && !error && (
        <>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <EmptyIllustration
                  name="messages"
                  Fallback={MessageSquare}
                  title="Start the conversation"
                  subtitle="Ping your property manager about anything — rent, maintenance, scheduling. Drag in an image if it helps."
                  size="md"
                />
              )}
              {grouped.map(({ date, msgs }) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] text-gray-500 font-medium">{date}</span>
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
          <div className="bg-gray-50 border-t border-gray-200 px-3 py-3 flex items-end gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); e.target.value = '' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!conversationId || uploading}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full inline-flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
              title="Send image"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <ImagePlus className="w-4 h-4" strokeWidth={1.75} />}
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint="send"
              placeholder="Message your manager…"
              rows={1}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-28 overflow-y-auto"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
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
