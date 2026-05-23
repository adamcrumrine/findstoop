import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser, Pen } from 'lucide-react'

export interface SignaturePadHandle {
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

interface Props {
  height?: number
  onChange?: (hasInk: boolean) => void
}

// Canvas signature capture. Outputs base64 PNG via ref.
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Resize canvas to match display size, preserving DPI for crisp lines
  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const dpr = window.devicePixelRatio || 1
    const setSize = () => {
      const { width } = wrapper.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = '#3A3A3C'
      }
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [height])

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = getPoint(e)
  }

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const p = getPoint(e)
    const last = lastRef.current
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    lastRef.current = p
    if (!hasInk) {
      setHasInk(true)
      onChange?.(true)
    }
  }

  const end = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange?.(false)
  }

  useImperativeHandle(ref, () => ({
    toDataURL: () => (canvasRef.current && hasInk ? canvasRef.current.toDataURL('image/png') : null),
    clear,
    isEmpty: () => !hasInk,
  }))

  return (
    <div ref={wrapperRef} className="w-full">
      <div className="relative w-full bg-white border-2 border-dashed border-gray-300 rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasInk && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-mute">
            <Pen className="w-6 h-6 mb-1.5" strokeWidth={1.5} />
            <p className="text-sm">Draw your signature above</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-mute">
          By signing, you agree this is the legal equivalent of your handwritten signature.
        </p>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-mute hover:text-ink transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" strokeWidth={1.75} />
          Clear
        </button>
      </div>
    </div>
  )
})

export default SignaturePad
