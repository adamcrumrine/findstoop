// Shared modal/bottom-sheet shell. Every overlay dialog in the app should
// render through this instead of hand-rolling a `fixed inset-0` wrapper,
// because it solves two problems those wrappers keep reintroducing:
//
// 1. Stacking: page content renders inside ManagerLayout's `relative z-10`
//    column, which caps any descendant's z-index below the fixed bottom nav
//    (z-20) — so a "z-50" overlay still paints UNDER the tab bar. Rendering
//    through a portal to document.body escapes that stacking context.
// 2. Viewport fit: on phones, a centered panel with its own max-height plus
//    header/footer easily exceeds the visual viewport, pushing the action
//    buttons off-screen behind the bottom nav. Here the panel is a flex
//    column capped to the dynamic viewport height (dvh tracks the collapsing
//    browser chrome), presented as a bottom sheet on small screens, with
//    safe-area padding so footers clear the iOS home indicator.
//
// The caller supplies header / body / footer as children; the body element
// must carry `flex-1 min-h-0 overflow-y-auto` so it scrolls while the header
// and footer stay pinned and visible.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalShellProps {
  onClose: () => void
  /** Tailwind max-width class for the panel, e.g. 'max-w-2xl'. */
  maxWidth?: string
  'aria-label'?: string
  children: React.ReactNode
}

export default function ModalShell({ onClose, maxWidth = 'max-w-2xl', 'aria-label': ariaLabel, children }: ModalShellProps) {
  // onClose is usually an inline closure; route Escape through a ref so the
  // effect doesn't re-subscribe every parent render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const trigger = (document.activeElement as HTMLElement) ?? null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      // Keep Tab cycling inside the dialog (same trap as shared Modal/Dialog).
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)

    // Initial focus: prefer the first form field so "open modal, start
    // typing" works; fall back to any focusable (often the close button).
    const initial =
      panelRef.current?.querySelector<HTMLElement>('input, select, textarea') ??
      panelRef.current?.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    initial?.focus()

    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handler)
      trigger?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`bg-white w-full ${maxWidth} shadow-xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-3rem)] sm:max-h-[90vh] pb-[env(safe-area-inset-bottom)]`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
