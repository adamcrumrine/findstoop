import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList, ShieldCheck, Loader2, ChevronRight, CheckCircle2, XCircle,
  Sparkles, Link as LinkIcon, Mail, Phone, Briefcase, Home as HomeIcon,
  Users as UsersIcon, Copy,
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

  const filtered = useMemo(
    () => filter === 'all' ? apps : apps.filter((a) => a.status === filter),
    [apps, filter],
  )
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
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'submitted', 'under_review', 'approved', 'declined'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === s ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {s === 'all' ? `All (${apps.length})` :
             s === 'under_review' ? `Reviewing (${apps.filter((a) => a.status === s).length})` :
             `${STATUS_LABEL[s]} (${apps.filter((a) => a.status === s).length})`}
          </button>
        ))}
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
  app, onStatus, onRequestScreening,
}: {
  app: Application
  onStatus: (status: AppStatus) => void
  onRequestScreening: () => void
}) {
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

      {/* Quick decisions */}
      <div className="p-5 border-b border-gray-100 grid grid-cols-3 gap-2">
        <button
          onClick={() => onStatus('approved')}
          disabled={app.status === 'approved'}
          className="inline-flex items-center justify-center gap-1.5 bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          Approve
        </button>
        <button
          onClick={() => onStatus('declined')}
          disabled={app.status === 'declined'}
          className="inline-flex items-center justify-center gap-1.5 bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          Decline
        </button>
        <button
          onClick={() => onStatus('under_review')}
          disabled={app.status === 'under_review'}
          className="inline-flex items-center justify-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
        >
          Review
        </button>
      </div>

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
