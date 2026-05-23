import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bug, Sparkles, MessageSquare, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'

interface FeedbackRow {
  id: string
  submitter_id: string
  submitter_email: string | null
  submitter_name: string | null
  kind: 'bug' | 'feature' | 'other'
  subject: string
  body: string
  page_url: string | null
  status: 'open' | 'triaged' | 'closed'
  admin_notes: string | null
  created_at: string
}

const KIND_ICON = {
  bug:     { Icon: Bug,           cls: 'text-red-700 bg-red-50 border-red-200' },
  feature: { Icon: Sparkles,      cls: 'text-brand-700 bg-brand-50 border-brand-200' },
  other:   { Icon: MessageSquare, cls: 'text-gray-700 bg-gray-100 border-gray-200' },
}

const STATUS_CLS = {
  open:    'text-amber-700 bg-amber-50 border-amber-200',
  triaged: 'text-blue-700 bg-blue-50 border-blue-200',
  closed:  'text-gray-600 bg-gray-100 border-gray-200',
}

export default function AdminFeedback() {
  const { profile, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'triaged' | 'closed'>('open')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) toast.error(error.message)
      else setRows((data ?? []) as FeedbackRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (!authLoading && profile && profile.role !== 'admin') {
    return <Navigate to="/manager/dashboard" replace />
  }

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  const setStatus = async (id: string, next: 'open' | 'triaged' | 'closed') => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)))
    const { error } = await supabase.from('feedback').update({ status: next }).eq('id', id)
    if (error) toast.error(error.message)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Feedback inbox</h1>
        <p className="text-sm text-mute mt-1">Bug reports + feature requests submitted by FindStoop users.</p>
      </header>

      <div className="flex gap-2 mb-4">
        {(['all', 'open', 'triaged', 'closed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === s ? 'bg-ink text-white' : 'bg-gray-100 text-mute hover:bg-gray-200'
            }`}
          >
            {s} ({s === 'all' ? rows.length : rows.filter((r) => r.status === s).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-mute">
          <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-mute py-16">Nothing to triage.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const cfg = KIND_ICON[r.kind]
            return (
              <article key={r.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                        <cfg.Icon className="w-3 h-3" strokeWidth={2} />
                        {r.kind}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLS[r.status]}`}>
                        {r.status}
                      </span>
                      <span className="text-xs text-mute">
                        {new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-ink mt-2">{r.subject}</h3>
                    <p className="text-xs text-mute mt-0.5">
                      {r.submitter_name ?? r.submitter_email ?? r.submitter_id}
                      {r.page_url && <> · <a href={r.page_url} target="_blank" rel="noreferrer" className="hover:text-ink underline-offset-2 hover:underline">{r.page_url.replace(window.location.origin, '')}</a></>}
                    </p>
                    <pre className="mt-3 text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3">
{r.body}
                    </pre>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5">
                    {r.status !== 'triaged' && (
                      <button type="button" onClick={() => setStatus(r.id, 'triaged')} className="text-xs px-3 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50">
                        Triage
                      </button>
                    )}
                    {r.status !== 'closed' && (
                      <button type="button" onClick={() => setStatus(r.id, 'closed')} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
                        Close
                      </button>
                    )}
                    {r.status !== 'open' && (
                      <button type="button" onClick={() => setStatus(r.id, 'open')} className="text-xs px-3 py-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
