// Management team — invite, list, revoke.
//
// Only the primary sees the controls: they own the invoice and the portfolio,
// and a view-only member being able to widen the team would defeat the point.
// Everyone else sees who they share the account with, which is worth showing —
// a colleague appearing in a portfolio with no explanation is worse.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, UserPlus, Trash2, Users, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

interface MemberRow {
  user_id: string
  accepted_at: string | null
  revoked_at: string | null
  permissions: Record<string, string>
  profile: { full_name: string | null; email: string | null } | null
}

export default function TeamSettings() {
  const { profile } = useAuth()
  const [teamId, setTeamId] = useState<string | null>(null)
  const [isPrimary, setIsPrimary] = useState(false)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    setLoadError(null)

    // Errors are surfaced, not swallowed. An RLS failure here returns no rows,
    // which read as "you are not the primary" — so the primary was told they
    // lacked permission on their own account, and the real cause (a recursive
    // policy) never reached the screen.
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, primary_manager_id')
      .eq('primary_manager_id', profile.id)
      .maybeSingle()
    if (teamErr) { setLoadError(teamErr.message); setLoading(false); return }

    // Not the primary? Find the team they belong to instead.
    let id = (team as { id?: string } | null)?.id ?? null
    setIsPrimary(!!id)
    if (!id) {
      const { data: mine, error: mineErr } = await supabase
        .from('team_members').select('team_id').eq('user_id', profile.id).is('revoked_at', null).maybeSingle()
      if (mineErr) { setLoadError(mineErr.message); setLoading(false); return }
      id = (mine as { team_id?: string } | null)?.team_id ?? null
    }
    setTeamId(id)

    if (id) {
      const { data, error: memberErr } = await supabase
        .from('team_members')
        .select('user_id, accepted_at, revoked_at, permissions, profile:profiles!team_members_user_id_fkey(full_name, email)')
        .eq('team_id', id)
        .is('revoked_at', null)
      if (memberErr) { setLoadError(memberErr.message); setLoading(false); return }
      setMembers((data ?? []) as unknown as MemberRow[])
    }
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { void load() }, [load])

  const invite = async () => {
    if (!email.trim()) return
    setInviting(true)
    const { data, error } = await supabase.functions.invoke('invite-comanager', { body: { email: email.trim() } })
    setInviting(false)
    if (error) {
      let msg: string | null = null
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx?.json) msg = (await ctx.json())?.message ?? null
      } catch { /* fall through */ }
      toast.error(msg ?? error.message ?? 'Could not send the invitation')
      return
    }
    if (!data?.ok) { toast.error(data?.message ?? 'Could not send the invitation'); return }
    toast.success(`Invitation sent to ${data.invited}`)
    setEmail('')
    void load()
  }

  const revoke = async (userId: string, name: string) => {
    const { error } = await supabase
      .from('team_members')
      .update({ revoked_at: new Date().toISOString() })
      .eq('team_id', teamId).eq('user_id', userId)
    if (error) { toast.error(error.message); return }
    toast.success(`${name} removed from the team`)
    void load()
  }

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <Loader2 className="w-5 h-5 animate-spin text-mute" strokeWidth={1.75} />
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Management team</h2>
      </div>
      <p className="text-xs text-mute mb-4 leading-relaxed">
        Teammates can see the whole portfolio and message tenants. They can't change
        anything — leases, payments and settings stay yours. Billing is unaffected:
        the account is charged per unit, not per person.
      </p>

      {loadError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          Couldn't load your team: {loadError}
        </p>
      )}

      <ul className="divide-y divide-gray-100 border-y border-gray-100">
        {members.map((m) => {
          const name = m.profile?.full_name ?? m.profile?.email ?? 'Invited teammate'
          const isSelf = m.user_id === profile?.id
          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  {name}
                  {isSelf && <span className="text-mute font-normal"> (you)</span>}
                </p>
                <p className="text-xs text-mute truncate">
                  {m.profile?.email}
                  {!m.accepted_at && (
                    <span className="inline-flex items-center gap-1 ml-2 text-amber-700">
                      <Clock className="w-3 h-3" strokeWidth={2} /> Invitation pending
                    </span>
                  )}
                </p>
              </div>
              {isPrimary && !isSelf && (
                <button
                  type="button"
                  onClick={() => revoke(m.user_id, name)}
                  className="shrink-0 p-2 rounded-lg text-mute hover:text-red-700 hover:bg-red-50"
                  title={`Remove ${name}`}
                  aria-label={`Remove ${name}`}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {isPrimary ? (
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={invite}
            disabled={inviting || !email.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} /> : <UserPlus className="w-4 h-4" strokeWidth={1.75} />}
            Invite
          </button>
        </div>
      ) : (
        <p className="text-xs text-mute mt-4">
          Only the account primary can invite or remove teammates.
        </p>
      )}
    </section>
  )
}
