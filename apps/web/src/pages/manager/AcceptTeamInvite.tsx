// Landing page for a team invitation link.
//
// The link signs the invitee in; this page is what turns their pending
// membership into a real one. Until it runs they can see nothing — a pending
// row grants no access — so the whole job of this screen is to call the accept
// endpoint once and send them onward.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

export default function AcceptTeamInvite() {
  const { profile, loading: authLoading } = useAuth()
  const [state, setState] = useState<'working' | 'done' | 'nothing' | 'error'>('working')
  const [team, setTeam] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.functions.invoke('accept-team-invite', { body: {} })
      if (cancelled) return
      if (error || !data?.ok) {
        setMessage(data?.message ?? error?.message ?? 'Could not accept the invitation')
        setState('error')
        return
      }
      setTeam(data.team ?? null)
      setState(data.accepted > 0 ? 'done' : 'nothing')
    })()
    return () => { cancelled = true }
  }, [authLoading, profile?.id])

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center">
      {state === 'working' && (
        <>
          <Loader2 className="w-7 h-7 animate-spin text-brand-600 mx-auto mb-3" strokeWidth={1.75} />
          <p className="text-mute">Setting up your access…</p>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold text-ink">You're on the team</h1>
          <p className="text-sm text-mute mt-2">
            You can now see {team ? <strong>{team}</strong> : 'the'}&nbsp;portfolio and message tenants.
            Changes stay with the account primary.
          </p>
          <Link
            to="/manager/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium"
          >
            Go to the dashboard
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </>
      )}

      {state === 'nothing' && (
        <>
          <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto mb-3" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold text-ink">Nothing to accept</h1>
          <p className="text-sm text-mute mt-2">
            This invitation has already been accepted, or it was withdrawn.
          </p>
          <Link to="/manager/dashboard" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to the dashboard
          </Link>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold text-ink">Couldn't accept the invitation</h1>
          <p className="text-sm text-mute mt-2">{message}</p>
          <p className="text-xs text-mute mt-3">Ask whoever invited you to send it again.</p>
        </>
      )}
    </div>
  )
}
