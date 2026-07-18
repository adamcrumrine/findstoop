import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// Headless accessible dialog wrapper — same focus-trap/Escape/focus-restore
// behavior as shared/Modal.tsx, but doesn't bake in a header/title bar.
// Payment modals (PayRent, PaymentMethodCard) need custom branded headers
// with a gradient + landlord logo, so they render their own chrome via the
// `children` render-prop and just attach `titleId` to their heading.
//
// Overlay/panel are plain className strings so each caller preserves its
// exact current layout (maxHeight, overflow, flex column, etc.) — this is
// a behavior retrofit, not a visual one.
interface DialogProps {
  open: boolean
  onClose: () => void
  children: (titleId: string) => React.ReactNode
  overlayClassName?: string
  panelClassName?: string
  panelStyle?: React.CSSProperties
}

export default function Dialog({ open, onClose, children, overlayClassName, panelClassName, panelStyle }: DialogProps) {
  const titleId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Callers pass inline closures, so onClose has a new identity every render.
  // Route it through a ref: the focus effect below must depend ONLY on
  // `open`, or a parent re-render while the dialog is open (e.g. Stripe
  // Elements/PaymentElement internal state changes) would re-run it and
  // yank focus back to the first focusable.
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
    <div className={overlayClassName} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={panelClassName}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children(titleId)}
      </div>
    </div>,
    document.body,
  )
}
