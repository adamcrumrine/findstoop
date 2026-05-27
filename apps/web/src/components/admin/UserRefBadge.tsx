// Anonymized user ref with tap-to-reveal name/email popover. Admin uses
// the 6-char ref as the default display so PII isn't on screen; tapping
// the ref calls the admin_user_names RPC and surfaces the real identity
// in a small popover above the badge. Non-admin callers of the RPC are
// rejected server-side, so this component is safe to render anywhere on
// the admin shell.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Identity {
  full_name: string | null
  email: string | null
}

// Tiny in-memory cache shared across all badges on a page so repeated
// taps (or two badges for the same user) don't hit the RPC twice.
const identityCache = new Map<string, Identity>()

interface Props {
  userId: string                // full UUID; not rendered, only used for lookup
  refLabel: string              // the 6-char ref shown by default
  className?: string
}

export default function UserRefBadge({ userId, refLabel, className }: Props) {
  const [open, setOpen] = useState(false)
  const [identity, setIdentity] = useState<Identity | null>(identityCache.get(userId) ?? null)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  // Dismiss on outside tap / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const reveal = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (identity || identityCache.has(userId)) return
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_user_names', { p_ids: [userId] })
    setLoading(false)
    if (error || !Array.isArray(data) || data.length === 0) {
      const fallback: Identity = { full_name: null, email: null }
      identityCache.set(userId, fallback)
      setIdentity(fallback)
      return
    }
    const row = data[0] as { full_name: string | null; email: string | null }
    identityCache.set(userId, { full_name: row.full_name, email: row.email })
    setIdentity({ full_name: row.full_name, email: row.email })
  }

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={reveal}
        className={`font-mono text-slate-700 hover:text-slate-900 hover:underline decoration-dotted underline-offset-2 cursor-pointer ${className ?? ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Tap to reveal identity"
      >
        {refLabel}
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-0 top-full mt-1 z-30 min-w-[180px] max-w-[260px] bg-slate-900 text-white rounded-lg shadow-lg px-3 py-2 text-xs"
        >
          {loading ? (
            <span className="text-slate-300">Loading…</span>
          ) : identity ? (
            identity.full_name || identity.email ? (
              <>
                {identity.full_name && (
                  <span className="block font-semibold truncate">{identity.full_name}</span>
                )}
                {identity.email && (
                  <span className="block text-slate-300 truncate">{identity.email}</span>
                )}
              </>
            ) : (
              <span className="text-slate-300 italic">No profile on file</span>
            )
          ) : null}
        </span>
      )}
    </span>
  )
}
