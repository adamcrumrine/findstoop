import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const titleId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Callers pass inline closures, so onClose has a new identity every render.
  // Route it through a ref: the focus effect below must depend ONLY on `open`,
  // or each parent re-render (e.g. every keystroke in a controlled form)
  // re-runs it and yanks focus back to the dialog's first focusable — which
  // is the × close button.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    triggerRef.current = (document.activeElement as HTMLElement) ?? null
    document.body.style.overflow = 'hidden'

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
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
    // typing" works; fall back to any focusable (which may be the × button).
    const initial =
      dialogRef.current?.querySelector<HTMLElement>('input, select, textarea') ??
      dialogRef.current?.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    initial?.focus()

    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
      triggerRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  // Portal to <body>: page content sits inside a `relative z-10` layout
  // column, so without the portal the fixed bottom nav (z-20) paints over
  // the overlay on mobile.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[calc(100dvh-3rem)] sm:max-h-[90vh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2.5 -m-2.5 text-gray-500 hover:text-gray-600 text-xl leading-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 rounded"
          >
            ×
          </button>
        </div>
        <div className="p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
