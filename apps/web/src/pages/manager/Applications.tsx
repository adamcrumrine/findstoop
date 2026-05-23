import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList, ShieldCheck, Loader2, ChevronRight, CheckCircle2, XCircle,
  Sparkles, Link as LinkIcon, Mail, Phone, Briefcase, Home as HomeIcon,
  Users as UsersIcon, Copy, Archive, ArchiveRestore, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'

type AppStatus = 'submitted' | 'under_review' | 'approved' | 'declined' | 'withdrawn'
type ScreeningStatus = 'not_ordered' | 'requested' | 'in_progress' | 'complete' | 'failed'

interface Application {
  id: string
  unit_id: string
  status: AppStatus
  first_name: string
  last_name: string
  email: string
  phone: string | null
  current_address: string | null
  current_city: string | null
  current_state: string | null
  monthly_income: number | null
  employer: string | null
  job_title: string | null
  household_size: number | null
  has_pets: boolean
  pets_description: string | null
  desired_move_in_date: string | null
  reason_for_leaving: string | null
  screening_status: ScreeningStatus
  credit_score: number | null
  background_summary: string | null
  landlord_notes: string | null
  submitted_at: string
  archived_at: string | null
  unit?: {
    unit_number: string
    properties: { name: string }
  } | null
}

const STATUS_LABEL: Record<AppStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Reviewing',
  approved: 'Approved',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

const STATUS_COLOR: Record<AppStatus, string> = {
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  under_review: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  withdrawn: 'bg-gray-50 text-gray-500 border-gray-200',
}

const SCREEN_LABEL: Record<ScreeningStatus, string> = {
  not_ordered: 'Not ordered',
  requested: 'Requested',
  in_progress: 'In progress',
  complete: 'Complete',
  failed: 'Failed',
}

export default function Applications() {
  const { profile } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AppStatus | 'all'>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = async () => {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('applications')
      .select('*, unit:units(unit_number, properties(name))')
      .order('submitted_at', { ascending: false })
    setApps((data ?? []) as unknown as Application[])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => apps.filter((a) => showArchived ? a.archived_at != null : a.archived_at == null),
    [apps, showArchived],
  )
  const filtered = useMemo(
    () => filter === 'all' ? visible : visible.filter((a) => a.status === filter),
    [visible, filter],
  )
  const archivedCount = useMemo(() => apps.filter((a) => a.archived_at != null).length, [apps])
  const selected = useMemo(
    () => apps.find((a) => a.id === selectedId) ?? null,
    [apps, selectedId],
  )

  const updateStatus = async (id: string, status: AppStatus) => {
    setApps((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
    const { error } = await supabase
      .from('applications')
      .update({
        status,
        reviewed_at: status === 'under_review' ? new Date().toISOString() : undefined,
        decided_at: (status === 'approved' || status === 'declined') ? new Date().toISOString() : undefined,
      })
      .eq('id', id)
    if (error) toast.error(error.message)
    else toast.success(`Marked ${STATUS_LABEL[status]}`)
  }

  // Calls the application-decision edge function which:
  //   approve  → invites the applicant, creates a pending lease, parks unit
  //              at 'pending', sends acceptance email
  //   decline  → marks declined + sends a polite rejection email
  const submitDecision = async (id: string, decision: 'approve' | 'decline', declineReason?: string) => {
    const verb = decision === 'approve' ? 'Approving' : 'Declining'
    const toastId = toast.loading(`${verb} application…`)
    const { data, error } = await supabase.functions.invoke('application-decision', {
      body: { applicationId: id, decision, declineReason },
    })
    if (error || data?.error) {
      toast.error((error?.message ?? data?.error) || 'Decision failed', { id: toastId })
      return
    }
    if (decision === 'approve') {
      toast.success('Approved — acceptance email sent and draft lease created', { id: toastId, duration: 5000 })
    } else {
      toast.success('Decline email sent', { id: toastId })
    }
    refresh()
  }

  const setArchived = async (id: string, archived: boolean) => {
    const archived_at = archived ? new Date().toISOString() : null
    setApps((prev) => prev.map((a) => a.id === id ? { ...a, archived_at } : a))
    if (selectedId === id) setSelectedId(null)
    const { error } = await supabase
      .from('applications')
      .update({ archived_at })
      .eq('id', id)
    if (error) toast.error(error.message)
    else toast.success(archived ? 'Application archived' : 'Application unarchived')
  }

  const deleteApplication = async (id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
    const { error } = await supabase.from('applications').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
      // Roll back optimistic delete by refetching — safest given RLS.
      refresh()
    } else {
      toast.success('Application deleted')
    }
  }

  const requestScreening = async (id: string) => {
    setApps((prev) => prev.map((a) => a.id === id ? { ...a, screening_status: 'requested' } : a))
    const { error } = await supabase
      .from('applications')
      .update({ screening_status: 'requested', screening_requested_at: new Date().toISOString() })
      .eq('id', id)
    if (error) toast.error(error.message)
    else toast('Screening requested — you can run the report manually until the partner API is wired.', { icon: '🔎' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Applications</h1>
          <p className="text-sm text-mute mt-1">
            Prospective renters who've applied to your units. Share the apply
            link on any unit page to invite more.
          </p>
        </div>
        <ShareApplyLink units={apps} />
      </header>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {(['all', 'submitted', 'under_review', 'approved', 'declined'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {s === 'all' ? `All (${visible.length})` :
             s === 'under_review' ? `Reviewing (${visible.filter((a) => a.status === s).length})` :
             `${STATUS_LABEL[s]} (${visible.filter((a) => a.status === s).length})`}
          </button>
        ))}

        <div className="ml-auto" />

        <button
          onClick={() => { setShowArchived((v) => !v); setSelectedId(null) }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            showArchived
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-mute border-gray-200 hover:border-gray-300'
          }`}
          title="Toggle archived applications"
        >
          <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
          {showArchived ? `Viewing archived (${archivedCount})` : `Archived (${archivedCount})`}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-mute-400" strokeWidth={1.5} />
          <p className="font-semibold text-ink">No applications {filter === 'all' ? 'yet' : `in ${STATUS_LABEL[filter as AppStatus] ?? filter}`}</p>
          <p className="text-sm text-mute mt-1">Share an apply link on a vacant unit to start collecting applications.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-5">
          {/* List */}
          <div className="space-y-2">
            {filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-colors ${
                  selectedId === a.id ? 'border-brand-400 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{a.first_name} {a.last_name}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_COLOR[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <p className="text-xs text-mute mt-0.5">
                      {a.unit?.properties.name} — Unit {a.unit?.unit_number} · {a.email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                      {a.monthly_income != null && <span>Income: ${Number(a.monthly_income).toLocaleString()}/mo</span>}
                      {a.household_size != null && <span>Household: {a.household_size}</span>}
                      {a.has_pets && <span>Has pets</span>}
                      {a.screening_status !== 'not_ordered' && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                          {SCREEN_LABEL[a.screening_status]}
                          {a.credit_score && ` · ${a.credit_score}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-mute shrink-0 mt-1" strokeWidth={1.75} />
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            {selected ? (
              <ApplicationDetail
                app={selected}
                onStatus={(s) => updateStatus(selected.id, s)}
                onRequestScreening={() => requestScreening(selected.id)}
                onDecision={(decision, reason) => submitDecision(selected.id, decision, reason)}
                onArchiveToggle={() => setArchived(selected.id, selected.archived_at == null)}
                onDelete={() => deleteApplication(selected.id)}
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-mute text-sm">
                Select an application to see the full submission.
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function ApplicationDetail({
  app, onStatus, onRequestScreening, onDecision, onArchiveToggle, onDelete,
}: {
  app: Application
  onStatus: (status: AppStatus) => void
  onRequestScreening: () => void
  onDecision: (decision: 'approve' | 'decline', reason?: string) => void
  onArchiveToggle: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDecision, setConfirmDecision] = useState<'approve' | 'decline' | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const isArchived = app.archived_at != null
  const isDecided = app.status === 'approved' || app.status === 'declined'
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-1">
          Applied {new Date(app.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
        <h2 className="text-lg font-bold text-ink">{app.first_name} {app.last_name}</h2>
        <div className="mt-2 space-y-1 text-sm text-mute">
          <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" strokeWidth={1.75} /> {app.email}</p>
          {app.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" strokeWidth={1.75} /> {app.phone}</p>}
        </div>
      </div>

      {/* Decisions */}
      {!confirmDecision ? (
        <div className="p-5 border-b border-gray-100 grid grid-cols-3 gap-2">
          <button
            onClick={() => setConfirmDecision('approve')}
            disabled={app.status === 'approved'}
            className="inline-flex items-center justify-center gap-1.5 bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Approve
          </button>
          <button
            onClick={() => setConfirmDecision('decline')}
            disabled={app.status === 'declined'}
            className="inline-flex items-center justify-center gap-1.5 bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
            Decline
          </button>
          <button
            onClick={() => onStatus('under_review')}
            disabled={app.status === 'under_review' || isDecided}
            className="inline-flex items-center justify-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
          >
            Review
          </button>
        </div>
      ) : confirmDecision === 'approve' ? (
        <div className="p-5 border-b border-gray-100 bg-green-50">
          <p className="text-sm font-semibold text-green-900 mb-2">Approve {app.first_name} {app.last_name}?</p>
          <ul className="text-xs text-green-900 leading-relaxed space-y-1 mb-3 ml-4 list-disc">
            <li>Send an acceptance email with an account-setup link</li>
            <li>Create a draft (pending) lease prefilled from this application</li>
            <li>Park the unit at <strong>pending</strong> so it stops accepting new applicants</li>
          </ul>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDecision(null)}
              className="flex-1 text-xs font-semibold text-green-900 bg-white border border-green-200 hover:bg-green-100 px-3 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDecision(null); onDecision('approve') }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg"
            >
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              Approve & send email
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 border-b border-gray-100 bg-red-50">
          <p className="text-sm font-semibold text-red-900 mb-1">Decline {app.first_name} {app.last_name}?</p>
          <p className="text-xs text-red-900 leading-relaxed mb-3">
            A polite rejection email will be sent. Add an optional note if you'd like to explain — it appears in the email.
          </p>
          <textarea
            rows={2}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Optional note (e.g. selected a different applicant, income didn't meet 3× rent, etc.)"
            className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setConfirmDecision(null); setDeclineReason('') }}
              className="flex-1 text-xs font-semibold text-red-900 bg-white border border-red-200 hover:bg-red-100 px-3 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => { const r = declineReason; setConfirmDecision(null); setDeclineReason(''); onDecision('decline', r || undefined) }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg"
            >
              <XCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              Decline & send email
            </button>
          </div>
        </div>
      )}

      {/* Screening */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-mute font-semibold">Screening</p>
            <p className="text-sm text-ink mt-0.5 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.75} />
              {SCREEN_LABEL[app.screening_status]}
              {app.credit_score && <span className="text-mute">· Credit {app.credit_score}</span>}
            </p>
          </div>
          {app.screening_status === 'not_ordered' && (
            <button
              onClick={onRequestScreening}
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
              Request screening
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-mute leading-relaxed">
          TransUnion ShareAble integration ships separately. Until then, "Request screening" marks the application so you remember to run the report manually via the renter's chosen provider.
        </p>
      </div>

      {/* Income + employment */}
      <DetailBlock Icon={Briefcase} title="Employment & income">
        {app.employer && <Row label="Employer" value={`${app.employer}${app.job_title ? ' · ' + app.job_title : ''}`} />}
        {app.monthly_income != null && <Row label="Monthly income" value={`$${Number(app.monthly_income).toLocaleString()}`} />}
      </DetailBlock>

      {/* Current home */}
      <DetailBlock Icon={HomeIcon} title="Current address">
        {(app.current_address || app.current_city) && (
          <p className="text-sm text-ink">{[app.current_address, app.current_city, app.current_state].filter(Boolean).join(', ')}</p>
        )}
        {app.reason_for_leaving && (
          <Row label="Reason for moving" value={app.reason_for_leaving} multiline />
        )}
      </DetailBlock>

      {/* Household */}
      <DetailBlock Icon={UsersIcon} title="Household">
        {app.household_size != null && <Row label="Household size" value={String(app.household_size)} />}
        {app.has_pets && <Row label="Pets" value={app.pets_description ?? 'Yes'} multiline />}
        {app.desired_move_in_date && <Row label="Desired move-in" value={new Date(app.desired_move_in_date).toLocaleDateString()} />}
      </DetailBlock>

      {/* Footer actions: archive + delete */}
      <div className="p-5 bg-gray-50 border-t border-gray-100">
        {isArchived && (
          <p className="text-[11px] text-mute italic mb-3">
            Archived {new Date(app.archived_at!).toLocaleDateString()}. Hidden from the default list — unarchive to restore.
          </p>
        )}
        {!confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={onArchiveToggle}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-ink bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-3 py-2 rounded-lg"
              title={isArchived ? 'Unarchive this application' : 'Archive — hides from list but keeps the record'}
            >
              {isArchived
                ? <><ArchiveRestore className="w-3.5 h-3.5" strokeWidth={1.75} /> Unarchive</>
                : <><Archive className="w-3.5 h-3.5" strokeWidth={1.75} /> Archive</>}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg"
              title="Delete permanently — cannot be undone"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              Delete
            </button>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-900 mb-2">Permanently delete this application?</p>
            <p className="text-[11px] text-red-800 leading-relaxed mb-3">
              This removes the submission entirely. If you might want it later, archive it instead.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 text-xs font-semibold text-red-900 bg-white border border-red-200 hover:bg-red-100 px-3 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDelete(false); onDelete() }}
                className="flex-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg"
              >
                Delete forever
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailBlock({ Icon, title, children }: { Icon: typeof Mail; title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 border-b last:border-b-0 border-gray-100">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.75} />
        <p className="text-xs uppercase tracking-wider text-mute font-semibold">{title}</p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? '' : 'flex justify-between gap-3 text-sm'}>
      <span className="text-mute text-xs">{label}</span>
      <span className={`text-ink ${multiline ? 'block mt-0.5 text-sm' : ''}`}>{value}</span>
    </div>
  )
}

function ShareApplyLink({ units }: { units: Application[] }) {
  void units // placeholder param to keep shape for future per-unit links
  const [copied, setCopied] = useState(false)
  const exampleUrl = `${window.location.origin}/apply/[unit-id]`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exampleUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Apply link template copied — replace [unit-id] with a real unit id from your Units page')
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-2 rounded-lg transition-colors"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
      Copy apply link
      <LinkIcon className="w-3.5 h-3.5 ml-0.5" strokeWidth={1.75} />
    </button>
  )
}
