// Tenant header bell.
//
// Deliberately NOT a port of the manager's NotificationsBell — that one
// aggregates manager to-dos (inspections awaiting signature, leases needing a
// countersignature) and is 300+ lines of task plumbing. A tenant has two live
// signals and they already exist in useTenantBadges, so this stays a thin
// surface over them.
//
// It answers one question the bottom-nav dots can't: "is anything waiting for
// me?" — visible from any page, including the ones that aren't in the nav.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, FileText, MessageSquare } from 'lucide-react'
import type { TenantBadges } from '@findstoop/shared/hooks/useTenantBadges'

interface Props {
  badges: TenantBadges
  /** Header text colour — the portal header is a landlord's brand surface. */
  onBrandSurface?: boolean
}

export default function TenantNotificationsBell({ badges, onBrandSurface = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const items = [
    badges.documents && { key: 'documents', Icon: FileText, label: 'New document to review', to: '/tenant/documents' },
    badges.messages && { key: 'messages', Icon: MessageSquare, label: 'New message from your landlord', to: '/tenant/messages' },
  ].filter(Boolean) as Array<{ key: string; Icon: typeof FileText; label: string; to: string }>

  const hasAny = items.length > 0

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        // The count is what a screen reader needs; the dot is decorative.
        aria-label={hasAny ? `Notifications, ${items.length} new` : 'Notifications, nothing new'}
        className={`relative p-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          onBrandSurface ? 'text-white/90 hover:text-white' : 'text-mute hover:text-ink'
        }`}
      >
        <Bell className="w-5 h-5" strokeWidth={1.75} />
        {hasAny && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-30"
        >
          {!hasAny ? (
            <p className="px-4 py-3 text-sm text-mute">Nothing new right now.</p>
          ) : (
            items.map(({ key, Icon, label, to }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); navigate(to) }}
                className="w-full text-left px-4 py-3 text-sm text-ink hover:bg-gray-50 inline-flex items-center gap-2.5"
              >
                <Icon className="w-4 h-4 text-brand-600 shrink-0" strokeWidth={1.75} />
                {label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
