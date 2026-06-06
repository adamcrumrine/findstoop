import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Bug, Sparkles, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
}

type Kind = 'bug' | 'feature' | 'other'

const KIND_CONFIG: Record<Kind, { Icon: typeof Bug; label: string; placeholder: string }> = {
  bug:     { Icon: Bug,            label: 'Bug',             placeholder: 'What went wrong? Steps to reproduce help a lot.' },
  feature: { Icon: Sparkles,       label: 'Feature request', placeholder: 'What would make Stoop better for you?' },
  other:   { Icon: MessageSquare,  label: 'Other',           placeholder: 'Tell us what\'s on your mind.' },
}

export default function FeedbackModal({ open, onClose }: Props) {
  const [kind, setKind] = useState<Kind>('bug')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const { pathname } = useLocation()

  // Reset on open/close so a stale draft doesn't linger.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setSubject(''); setBody(''); setKind('bug'); setDone(false) }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim() || submitting) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('submit-feedback', {
        body: {
          kind,
          subject: subject.trim(),
          body: body.trim(),
          page_url: typeof window !== 'undefined' ? `${window.location.origin}${pathname}` : pathname,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setDone(true)
      setTimeout(() => { onClose() }, 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-[10vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-t-2xl p-5 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-2.5 mb-2">
            <img src="/stoop_logo_square_trans.png" alt="Stoop" className="w-8 h-8 object-contain brightness-0 invert" />
            <span className="text-xs font-medium tracking-wide opacity-90">Stoop</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Send feedback</h2>
          <p className="text-sm text-white/85 mt-1">Found a bug? Want a feature? We read every one.</p>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-base font-semibold text-ink">Thanks — we got it.</p>
            <p className="text-sm text-mute mt-1">We'll follow up if we need more info.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            {/* Kind selector */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_CONFIG) as Kind[]).map((k) => {
                const cfg = KIND_CONFIG[k]
                const selected = kind === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border-2 transition-colors ${
                      selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <cfg.Icon className={`w-4 h-4 ${selected ? 'text-brand-700' : 'text-mute'}`} strokeWidth={1.75} />
                    <span className={`text-xs font-medium ${selected ? 'text-brand-700' : 'text-ink'}`}>{cfg.label}</span>
                  </button>
                )
              })}
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                maxLength={120}
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">Details</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={KIND_CONFIG[kind].placeholder}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !subject.trim() || !body.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
              {submitting ? 'Sending…' : 'Send feedback'}
            </button>
            <p className="text-[11px] text-mute text-center">
              Goes to Stoop support. We'll reply at your account email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
