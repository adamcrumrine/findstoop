// Thumbs up/down for AI features. One tap, silent insert, thanks state —
// the lowest-friction signal loop that still tells us which AI surfaces
// deserve investment. Append-only (ai_feedback), admin-read-only.

import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'

export type AiFeature =
  | 'ask-lease' | 'self-triage' | 'draft-reply' | 'fair-housing-lint'
  | 'portfolio-physical' | 'explain-lease' | 'triage-maintenance' | 'parse-receipt'

export default function AiFeedback({ feature, referenceId, className = '' }: {
  feature: AiFeature
  referenceId?: string
  className?: string
}) {
  const { user } = useAuth()
  const [sent, setSent] = useState<'up' | 'down' | null>(null)

  if (!user) return null

  const send = async (verdict: 'up' | 'down') => {
    if (sent) return
    setSent(verdict) // optimistic; a lost row is acceptable for this signal
    await supabase.from('ai_feedback').insert({
      profile_id: user.id,
      feature,
      verdict,
      reference_id: referenceId ?? null,
    })
  }

  if (sent) {
    return <span className={`text-[11px] text-mute ${className}`}>Thanks — noted.</span>
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="text-[11px] text-mute mr-0.5">Helpful?</span>
      <button
        type="button"
        onClick={() => send('up')}
        aria-label="Helpful"
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-mute hover:text-emerald-700 hover:bg-emerald-50"
      >
        <ThumbsUp className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => send('down')}
        aria-label="Not helpful"
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-mute hover:text-red-700 hover:bg-red-50"
      >
        <ThumbsDown className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </span>
  )
}
