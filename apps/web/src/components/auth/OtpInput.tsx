import { useRef } from 'react'

interface OtpInputProps {
  value: string[]
  onChange: (digits: string[]) => void
  disabled?: boolean
}

export default function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  const focus = (i: number) => refs[i]?.current?.focus()

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[i] = digit
    onChange(next)
    if (digit && i < 5) focus(i + 1)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (value[i]) {
        const next = [...value]
        next[i] = ''
        onChange(next)
      } else if (i > 0) {
        focus(i - 1)
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1)
    } else if (e.key === 'ArrowRight' && i < 5) {
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...value]
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? ''
    onChange(next)
    focus(Math.min(pasted.length, 5))
  }

  return (
    <div className="flex gap-2 justify-between">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`w-12 h-14 text-center text-xl font-semibold border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors disabled:opacity-40 ${
            digit ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
          }`}
        />
      ))}
    </div>
  )
}
