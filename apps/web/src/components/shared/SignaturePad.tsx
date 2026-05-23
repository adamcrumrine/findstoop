import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser, Pen, Type, Upload, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export interface SignaturePadHandle {
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

type Mode = 'draw' | 'type' | 'upload'

interface Props {
  height?: number
  // Signer's full name — used to seed the typed-signature options.
  name?: string | null
  onChange?: (hasInk: boolean) => void
}

// Four script fonts so a typed signature doesn't look like a regular text field.
const TYPED_FONTS: Array<{ key: string; family: string; size: number }> = [
  { key: 'dancing', family: '"Dancing Script", cursive', size: 64 },
  { key: 'greatvibes', family: '"Great Vibes", cursive', size: 68 },
  { key: 'sacramento', family: '"Sacramento", cursive', size: 64 },
  { key: 'caveat', family: '"Caveat", cursive', size: 60 },
]

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2 MB

const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, name, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)

  const [mode, setMode] = useState<Mode>('draw')
  const [drawDirty, setDrawDirty] = useState(false)
  const [typedName, setTypedName] = useState((name ?? '').trim())
  const [typedFont, setTypedFont] = useState<string | null>(null)
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (name && !typedName) setTypedName(name.trim())
  }, [name])

  // Surface hasInk back to the parent whenever any mode produces output.
  const hasOutput =
    (mode === 'draw' && drawDirty) ||
    (mode === 'type' && !!typedFont && typedName.trim().length > 0) ||
    (mode === 'upload' && !!uploadDataUrl)

  useEffect(() => {
    onChange?.(hasOutput)
  }, [hasOutput, onChange])

  // Canvas DPI sizing — only relevant in draw mode.
  useEffect(() => {
    if (mode !== 'draw') return
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
  }, [height, mode])

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
    if (!drawDirty) setDrawDirty(true)
  }

  const end = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setDrawDirty(false)
  }

  const clearAll = () => {
    clearCanvas()
    setTypedFont(null)
    setUploadDataUrl(null)
  }

  // Render the typed signature into an offscreen canvas and return its PNG.
  const typedToDataURL = (): string | null => {
    if (!typedFont || !typedName.trim()) return null
    const font = TYPED_FONTS.find((f) => f.key === typedFont)
    if (!font) return null
    const dpr = window.devicePixelRatio || 1
    const w = 800
    const h = height
    const canvas = document.createElement('canvas')
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#3A3A3C'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.font = `${font.size}px ${font.family}`
    ctx.fillText(typedName.trim(), w / 2, h / 2)
    return canvas.toDataURL('image/png')
  }

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (mode === 'draw') {
        return canvasRef.current && drawDirty ? canvasRef.current.toDataURL('image/png') : null
      }
      if (mode === 'type') return typedToDataURL()
      if (mode === 'upload') return uploadDataUrl
      return null
    },
    clear: clearAll,
    isEmpty: () => !hasOutput,
  }))

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Image must be 2 MB or smaller')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') setUploadDataUrl(result)
    }
    reader.onerror = () => toast.error('Could not read that file')
    reader.readAsDataURL(file)
  }

  return (
    <div ref={wrapperRef} className="w-full">
      {/* Mode tabs */}
      <div className="inline-flex p-1 bg-gray-100 rounded-lg mb-3 text-sm">
        <ModeTab active={mode === 'draw'} onClick={() => setMode('draw')} icon={<Pen className="w-3.5 h-3.5" strokeWidth={1.75} />}>
          Draw
        </ModeTab>
        <ModeTab active={mode === 'type'} onClick={() => setMode('type')} icon={<Type className="w-3.5 h-3.5" strokeWidth={1.75} />}>
          Type
        </ModeTab>
        <ModeTab active={mode === 'upload'} onClick={() => setMode('upload')} icon={<Upload className="w-3.5 h-3.5" strokeWidth={1.75} />}>
          Upload
        </ModeTab>
      </div>

      {mode === 'draw' && (
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
          {!drawDirty && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-mute">
              <Pen className="w-6 h-6 mb-1.5" strokeWidth={1.5} />
              <p className="text-sm">Draw your signature above</p>
            </div>
          )}
        </div>
      )}

      {mode === 'type' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-mute mb-1.5">Full name</label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => { setTypedName(e.target.value); setTypedFont(null) }}
              placeholder="Type your full legal name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {TYPED_FONTS.map((f) => {
              const selected = typedFont === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setTypedFont(f.key)}
                  disabled={!typedName.trim()}
                  className={`relative w-full h-20 px-4 rounded-xl border-2 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed bg-white ${
                    selected ? 'border-brand-500 ring-2 ring-brand-100' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span
                    className="block truncate text-ink"
                    style={{ fontFamily: f.family, fontSize: 36, lineHeight: 1.4 }}
                  >
                    {typedName.trim() || 'Your name'}
                  </span>
                  {selected && (
                    <Check className="absolute top-1.5 right-1.5 w-4 h-4 text-brand-600" strokeWidth={2} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div>
          {uploadDataUrl ? (
            <div className="relative w-full bg-white border-2 border-gray-200 rounded-xl overflow-hidden" style={{ height }}>
              <img src={uploadDataUrl} alt="Signature" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setUploadDataUrl(null)}
                className="absolute top-2 right-2 px-2 py-1 bg-white/90 border border-gray-200 rounded-md text-xs font-medium text-mute hover:text-ink"
              >
                Replace
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) handleFile(file)
              }}
              className={`flex flex-col items-center justify-center w-full bg-white border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              style={{ height }}
            >
              <Upload className="w-6 h-6 text-mute mb-1.5" strokeWidth={1.5} />
              <p className="text-sm text-ink font-medium">Drag and drop your signature image</p>
              <p className="text-xs text-mute mt-0.5">or click to browse · PNG, JPG · up to 2 MB</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-mute">
          By signing, you agree this is the legal equivalent of your handwritten signature.
        </p>
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-mute hover:text-ink transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" strokeWidth={1.75} />
          Clear
        </button>
      </div>
    </div>
  )
})

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
        active ? 'bg-white text-ink shadow-sm' : 'text-mute hover:text-ink'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

export default SignaturePad
