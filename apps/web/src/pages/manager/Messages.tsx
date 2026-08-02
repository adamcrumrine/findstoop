import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { useProperties } from '@findstoop/shared/hooks/useProperties'
import { useUnits } from '@findstoop/shared/hooks/useUnits'
import { useLeases } from '@findstoop/shared/hooks/useLeases'
import { useScope, inScope } from '../../lib/scope'
import { useConversations, useMessages } from '@findstoop/shared/hooks/useMessages'
import { findOrCreateDirectConversation, createGroupConversation, uploadChatImage } from '@findstoop/shared/api/messages'
import type { ConversationSummary } from '@findstoop/shared/api/messages'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Users as UsersIcon, ImagePlus, Loader2, Plus, X, ArrowLeft, Check, Building2, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import Avatar from '../../components/shared/Avatar'
import FairHousingFindings from '../../components/manager/FairHousingFindings'
import ModalShell from '../../components/shared/ModalShell'
import AiFeedback from '../../components/shared/AiFeedback'
import { runFairHousingLint, applyLintSuggestion } from '../../lib/fairHousingLint'
import type { LintFinding, LintResult } from '../../lib/fairHousingLint'

function MessageBubble({ msg, isOwn, senderName }: {
  msg: { id: string; body: string; created_at: string; image_url?: string | null; image_purged_at?: string | null; sender_id: string }
  isOwn: boolean
  senderName: string | null
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
        {!isOwn && senderName && (
          <p className="text-[10px] font-semibold text-mute mb-0.5">{senderName}</p>
        )}
        {msg.image_url && !msg.image_purged_at && (
          <a href={msg.image_url} target="_blank" rel="noreferrer" className="block mb-1.5">
            <img src={msg.image_url} alt="" loading="lazy" decoding="async" className="max-w-full max-h-72 rounded-lg" />
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
        <MessageSquare className="w-10 h-10 mb-2 text-mute-400" strokeWidth={1.5} />
        <p className="text-sm text-gray-500">No conversations yet</p>
        <p className="text-xs text-gray-500 mt-1">Open any tenant card and tap the chat bubble to start one.</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map((c) => (
        <button
          key={c.conversationId}
          onClick={() => onSelect(c)}
          className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left ${
            selected?.conversationId === c.conversationId ? 'bg-brand-50' : ''
          }`}
        >
          {c.type === 'group' ? (
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
              <UsersIcon className="w-5 h-5" strokeWidth={1.75} />
            </div>
          ) : (
            <Avatar name={c.displayName} url={c.avatarUrl} size={40} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {c.displayName}
                {c.type === 'group' && <span className="ml-1.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">GROUP</span>}
              </p>
              {c.lastMessageAt && (
                <p className="text-[10px] text-gray-500 shrink-0">
                  {new Date(c.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-gray-500 truncate">{c.lastMessage ?? c.subtitle ?? 'No messages yet'}</p>
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
  const { messages, loading, sending, send } = useMessages(conversation.conversationId, managerId)
  const [draft, setDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  // Fair Housing check + AI reply draft — advisory only, never blocks sending.
  const [linting, setLinting] = useState(false)
  const [lintResult, setLintResult] = useState<LintResult | null>(null)
  const [lintOpen, setLintOpen] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [aiDraftNote, setAiDraftNote] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Switching threads discards composer-side AI state.
  useEffect(() => {
    setLintResult(null)
    setLintOpen(false)
    setAiDraftNote(false)
  }, [conversation.conversationId])

  const clearComposerAiState = () => {
    setLintResult(null)
    setLintOpen(false)
    setAiDraftNote(false)
  }

  const handleSend = async () => {
    if (!draft.trim() || sending) return
    const body = draft
    setDraft('')
    clearComposerAiState()
    await send(body)
  }

  const handleLint = async () => {
    const text = draft.trim()
    if (!text || linting) return
    setLinting(true)
    try {
      const result = await runFairHousingLint(text, 'message')
      setLintResult(result)
      setLintOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run the Fair Housing check.')
    } finally {
      setLinting(false)
    }
  }

  const handleUseSuggestion = (finding: LintFinding) => {
    const next = applyLintSuggestion(draft, finding)
    if (next == null) {
      toast.error("Couldn't find that phrase in your draft — it may have changed.")
      return
    }
    setDraft(next)
    // Drop the applied finding; when none remain, show the all-clear state.
    setLintResult((prev) => {
      if (!prev) return prev
      const remaining = prev.findings.filter((f) => f !== finding)
      return { clear: remaining.length === 0, findings: remaining }
    })
  }

  const handleDraftReply = async () => {
    if (drafting) return
    setDrafting(true)
    try {
      const { data, error } = await supabase.functions.invoke('draft-reply', {
        body: { conversation_id: conversation.conversationId },
      })
      if (error) throw new Error('Could not draft a reply. Please try again.')
      const res = data as { ok: boolean; draft?: string; message?: string }
      if (!res?.ok || !res.draft) throw new Error(res?.message || 'Could not draft a reply. Please try again.')
      setDraft(res.draft)
      setAiDraftNote(true)
      setLintResult(null)
      setLintOpen(false)
      // Quietly run the Fair Housing check on the draft; only surface it if
      // something is worth a look — an all-clear would just be noise here.
      void runFairHousingLint(res.draft, 'message')
        .then((result) => {
          if (!result.clear) {
            setLintResult(result)
            setLintOpen(true)
          }
        })
        .catch(() => { /* advisory only — never block the draft */ })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not draft a reply.')
    } finally {
      setDrafting(false)
    }
  }

  // Offer a draft when the thread's latest message is from the tenant side.
  const lastMessage = messages[messages.length - 1]
  const canDraftReply = !!lastMessage && lastMessage.sender_id !== managerId

  const handleImage = async (file: File) => {
    setUploading(true)
    try {
      const img = await uploadChatImage(conversation.conversationId, file)
      await send(draft.trim(), img)
      setDraft('')
      clearComposerAiState()
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

  // For group chats, label each non-own bubble with the sender's display name.
  // We don't have full profile rows here, but the participantIds let us at
  // least know it's a group; the conversation summary subtitle has the names.
  const isGroup = conversation.type === 'group'

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
        {isGroup ? (
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center">
            <UsersIcon className="w-5 h-5" strokeWidth={1.75} />
          </div>
        ) : (
          <Avatar name={conversation.displayName} url={conversation.avatarUrl} />
        )}
        <div>
          <p className="font-semibold text-gray-900 text-sm">{conversation.displayName}</p>
          <p className="text-xs text-gray-500">{conversation.subtitle ?? ''}</p>
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
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">Start a conversation with {conversation.displayName}</p>
            </div>
          )}
          {grouped.map(({ date, msgs }) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-500 font-medium">{date}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              {msgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={msg.sender_id === managerId}
                  senderName={isGroup ? null : null}
                />
              ))}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 shrink-0">
        {/* Fair Housing check results — advisory, dismissible, never blocks send. */}
        {lintOpen && lintResult && (
          <div className="mx-3 mt-3 border border-gray-200 rounded-xl bg-gray-50/60 px-3 py-3 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.75} />
                Fair Housing check
              </p>
              <button
                type="button"
                onClick={() => setLintOpen(false)}
                className="w-6 h-6 rounded-full hover:bg-gray-200 inline-flex items-center justify-center text-gray-500"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <FairHousingFindings
              clear={lintResult.clear}
              findings={lintResult.findings}
              onUseSuggestion={handleUseSuggestion}
            />
          </div>
        )}

        {/* Draft reply — fills the composer for editing; never auto-sends. */}
        {canDraftReply && !draft.trim() && (
          <div className="px-3 pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleDraftReply}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {drafting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                : <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />}
              {drafting ? 'Drafting…' : 'Draft reply'}
            </button>
          </div>
        )}

        {aiDraftNote && draft.trim() && (
          <p className="px-4 pt-2 text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
            AI draft — review before sending.
            <AiFeedback feature="draft-reply" referenceId={conversation.conversationId} />
          </p>
        )}

        <div className="px-3 py-3 flex items-end gap-2">
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
            disabled={uploading}
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full inline-flex items-center justify-center shrink-0 disabled:opacity-40"
            title="Send image"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <ImagePlus className="w-4 h-4" strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            onClick={handleLint}
            disabled={!draft.trim() || linting}
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full inline-flex items-center justify-center shrink-0 disabled:opacity-40"
            title="Check message for Fair Housing concerns"
          >
            {linting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            enterKeyHint="send"
            placeholder={`Message ${conversation.displayName}…`}
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
    </div>
  )
}

export default function ManagerMessages() {
  const { user } = useAuth()
  const managerId = user?.id
  const { conversations, loading, reload } = useConversations(managerId)

  // For the "Start new conversation" picker — load the manager's leases.
  const { properties } = useProperties(managerId)
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties])
  const { units } = useUnits(propertyIds)
  const unitIds = useMemo(() => units.map((u) => u.id), [units])
  const { leases } = useLeases(unitIds)
  const scope = useScope()
  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units])
  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties])

  const [selected, setSelected] = useState<ConversationSummary | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Picker is a two-step wizard: pick lease → multi-select tenants.
  const [pickerLeaseId, setPickerLeaseId] = useState<string | null>(null)
  const [pickerTenants, setPickerTenants] = useState<Array<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }>>([])
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  const [pickerTenantsLoading, setPickerTenantsLoading] = useState(false)
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  // Active + pending leases — expired/terminated leases aren't messaged.
  const pickableLeases = useMemo(
    () => leases.filter((l) =>
      (l.status === 'active' || l.status === 'pending') && inScope(scope, { unitId: l.unit_id })),
    [leases, scope],
  )

  // Step 2 of the picker — load every tenant on the selected lease.
  useEffect(() => {
    if (!pickerLeaseId) { setPickerTenants([]); setPickerSelected(new Set()); return }
    let cancelled = false
    setPickerTenantsLoading(true)
    ;(async () => {
      const [primaryRes, otherRes] = await Promise.all([
        supabase.from('leases').select('tenant_id, profile:profiles!leases_tenant_id_fkey(id, full_name, email, avatar_url)').eq('id', pickerLeaseId).maybeSingle(),
        supabase.from('lease_tenants').select('tenant_id, profile:profiles!lease_tenants_tenant_id_fkey(id, full_name, email, avatar_url)').eq('lease_id', pickerLeaseId),
      ])
      if (cancelled) return
      const tenants: Array<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }> = []
      const seen = new Set<string>()
      const pushFrom = (raw: any) => {
        const p = Array.isArray(raw) ? raw[0] : raw
        if (p?.id && !seen.has(p.id)) {
          seen.add(p.id)
          tenants.push({ id: p.id, full_name: p.full_name ?? null, email: p.email ?? null, avatar_url: p.avatar_url ?? null })
        }
      }
      pushFrom((primaryRes.data as any)?.profile)
      for (const row of otherRes.data ?? []) pushFrom((row as any).profile)
      setPickerTenants(tenants)
      setPickerTenantsLoading(false)
    })()
    return () => { cancelled = true }
  }, [pickerLeaseId])

  const togglePickerTenant = (id: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const closePicker = () => {
    setPickerOpen(false)
    setPickerLeaseId(null)
    setPickerSelected(new Set())
  }

  const startConversationFromPicker = async () => {
    if (pickerSelected.size === 0 || !pickerLeaseId) return
    setCreating(true)
    try {
      const ids = Array.from(pickerSelected)
      let convId: string
      if (ids.length === 1) {
        const conv = await findOrCreateDirectConversation(ids[0])
        convId = conv.id
      } else {
        const conv = await createGroupConversation(pickerLeaseId, ids)
        convId = conv.id
      }
      await reload()
      // Reach into the freshly-loaded list — useConversations updates state
      // via the reload, but our `conversations` ref above may be stale.
      // The conversations realtime subscription + reload will pick it up;
      // fall back to a deep-link if not yet visible.
      const match = conversations.find((c) => c.conversationId === convId)
      if (match) setSelected(match)
      closePicker()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start conversation')
    } finally {
      setCreating(false)
    }
  }

  // Deep-link: ?tenantId=... auto-selects (or creates) the 1:1 thread with
  // that tenant. Used by the chat-bubble on tenant cards + the tenant detail
  // page's "Message" button.
  useEffect(() => {
    const tenantId = searchParams.get('tenantId')
    if (!tenantId || !managerId) return

    // If conversations are still loading the existing-match check would
    // spuriously miss, so wait until the first load resolves.
    if (loading) return

    const existing = conversations.find((c) => c.type === 'direct' && c.otherUserId === tenantId)
    if (existing) {
      if (!selected || selected.conversationId !== existing.conversationId) {
        setSelected(existing)
      }
      setSearchParams({}, { replace: true })
      return
    }

    // No existing thread — create one via the RPC (which double-checks they
    // share a lease) and then reload the list and select.
    if (creating) return
    setCreating(true)
    findOrCreateDirectConversation(tenantId)
      .then(async () => {
        await reload()
        setSearchParams({}, { replace: true })
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not start conversation'))
      .finally(() => setCreating(false))
  }, [conversations, loading, managerId, searchParams, selected, creating, reload, setSearchParams])

  // Mobile: chat is a fixed overlay between the top header (~56px) and
  // the bottom nav (~64px + safe-area), so the message input never gets
  // clipped under the nav. md+: original inline flex layout (no nav).
  return (
    <div className="flex fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] md:static md:h-[100dvh] md:-m-6 bg-white">
      {/* Sidebar — conversation list */}
      <div className={`w-full md:w-80 flex flex-col border-r border-gray-200 bg-white shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-gray-900">Messages</h1>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {totalUnread} unread
                </span>
              )}
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={pickableLeases.length === 0}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-40"
                title="Start new conversation"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                New
              </button>
            </div>
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          loading={loading}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {/* Start-new-conversation picker — two steps: lease, then tenants. */}
      {pickerOpen && (
        <ModalShell onClose={closePicker} maxWidth="max-w-md" aria-label="Start a conversation">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {pickerLeaseId && (
                  <button
                    type="button"
                    onClick={() => { setPickerLeaseId(null); setPickerSelected(new Set()) }}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 inline-flex items-center justify-center text-mute"
                  >
                    <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink truncate">
                    {pickerLeaseId ? 'Pick tenants' : 'Start a conversation'}
                  </h3>
                  <p className="text-xs text-mute mt-0.5">
                    {pickerLeaseId
                      ? '1 tenant → direct message · 2+ tenants → group chat'
                      : 'Step 1: pick the unit / lease.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="w-8 h-8 rounded-full hover:bg-gray-100 inline-flex items-center justify-center text-mute shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 min-h-[320px]">
              {!pickerLeaseId ? (
                pickableLeases.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-mute">
                    No active or pending leases to message from yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {pickableLeases.map((l) => {
                      const unit = unitMap[l.unit_id]
                      const property = unit ? propertyMap[unit.property_id] : null
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => setPickerLeaseId(l.id)}
                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-brand-50 transition-colors text-left group"
                          >
                            <div className="w-10 h-10 rounded-xl bg-brand-50 inline-flex items-center justify-center shrink-0 group-hover:bg-brand-100 transition-colors">
                              <Building2 className="w-5 h-5 text-brand-600" strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-ink truncate">
                                {property?.name ?? 'Property'} · Unit {unit?.unit_number ?? '—'}
                              </p>
                              <p className="text-xs text-mute mt-0.5 truncate">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${l.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span>
                                <span className="ml-1.5">primary: {l.profile?.full_name ?? l.profile?.email ?? 'tenant'}</span>
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-mute group-hover:text-ink shrink-0" strokeWidth={1.75} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : (
                pickerTenantsLoading ? (
                  <div className="flex items-center justify-center py-10 text-mute">
                    <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
                  </div>
                ) : pickerTenants.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-mute">No tenants on this lease.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {pickerTenants.map((t) => {
                      const checked = pickerSelected.has(t.id)
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => togglePickerTenant(t.id)}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                          >
                            <Avatar url={t.avatar_url} name={t.full_name} email={t.email} size={36} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-ink truncate">
                                {t.full_name ?? t.email ?? 'Tenant'}
                              </p>
                              <p className="text-xs text-mute truncate">{t.email}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                              checked ? 'border-brand-500 bg-brand-500' : 'border-gray-300 bg-white'
                            }`}>
                              {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}
            </div>

            {pickerLeaseId && (
              <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-mute">
                  {pickerSelected.size === 0 && 'Select at least one tenant.'}
                  {pickerSelected.size === 1 && 'Will open a 1:1 direct message.'}
                  {pickerSelected.size > 1 && `Will create a group chat with ${pickerSelected.size} tenants + you.`}
                </p>
                <button
                  type="button"
                  onClick={startConversationFromPicker}
                  disabled={pickerSelected.size === 0 || creating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : null}
                  Start
                </button>
              </div>
            )}
        </ModalShell>
      )}

      {/* Thread panel */}
      <div className={`flex-1 flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected && managerId ? (
          <ChatThread
            conversation={selected}
            managerId={managerId}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageSquare className="w-12 h-12 mb-3 text-mute-400" strokeWidth={1.5} />
            <p className="text-sm">Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}
