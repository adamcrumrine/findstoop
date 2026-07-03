// Public applicant status tracker. No auth required.
// Applicant lands here from a landlord-shared link: /application-status/:token
//
// Shows ONLY what the token-keyed RPC returns — first name, property/unit
// label, submitted date, and a coarse status rendered as a stepper
// (received → under review → screening → decision). No messaging, no
// application details: the landlord contacts the applicant by email.

import { Link, useOutletContext, useParams } from 'react-router-dom'
import { Building2, Check, Loader2, CheckCircle2, XCircle, Undo2 } from 'lucide-react'
import { useSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'
import type { ApplicationStatusOutletContext } from '../../components/layout/ApplicationStatusLayout'
import type { PublicApplicationStatus } from '../../hooks/useApplicationStatus'

// Where each coarse status sits on the received → decision track.
const STEP_INDEX: Record<PublicApplicationStatus, number> = {
  received: 0,
  under_review: 1,
  screening_in_progress: 2,
  approved: 3,
  declined: 3,
  withdrawn: 3,
}

const DECIDED: ReadonlySet<PublicApplicationStatus> = new Set(['approved', 'declined', 'withdrawn'])

const STATUS_BLURB: Record<PublicApplicationStatus, string> = {
  received: 'Your application is in. The landlord has it and will start reviewing soon — no need to check in.',
  under_review: 'The landlord is reviewing your application now. If anything else is needed, they’ll reach out by email.',
  screening_in_progress: 'Screening is underway. Once it wraps up, the landlord will review the results and make a decision.',
  approved: 'Good news — your application was approved. The landlord will follow up by email with next steps.',
  declined: 'The landlord has made a decision on this application. Check your email for a note with more detail.',
  withdrawn: 'This application was withdrawn and is no longer being considered.',
}

export default function ApplicationStatus() {
  const { token } = useParams<{ token: string }>()
  // Status links are per-applicant and unguessable — keep them out of search.
  useSeo({
    title: 'Application status',
    description: 'Track the progress of your rental application — received, under review, screening, and decision.',
    path: `/application-status/${token ?? ''}`,
    noindex: true,
  })
  const { loading, result } = useOutletContext<ApplicationStatusOutletContext>()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  // Missing and revoked tokens look identical (the RPC returns nothing for
  // both) — one generic message, no way to probe which it was.
  if (!result) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-5 text-center">
        <Building2 className="w-12 h-12 mx-auto mb-4 text-mute-400" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold text-ink">Status page not found</h1>
        <p className="text-mute mt-2">
          This link doesn't match an application we can show. Reach out to the
          landlord who shared it — they may need to send a fresh link.
        </p>
        <Link to="/" className="mt-6 inline-block text-brand-600 font-medium hover:underline">← Back to {BRAND.name}</Link>
      </div>
    )
  }

  const { firstName, propertyName, unitNumber, submittedAt, status } = result
  const submitted = new Date(submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      {/* Application summary header — mirrors the apply page's unit card. */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">Application status</p>
          <h1 className="text-xl font-bold text-ink mt-0.5">{propertyName} — Unit {unitNumber}</h1>
          <p className="text-sm text-mute mt-0.5">
            Hi {firstName} — your application was submitted on {submitted}.
          </p>
        </div>
      </section>

      {/* Stepper */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <Stepper status={status} />
        <p className="mt-6 text-sm text-ink leading-relaxed">{STATUS_BLURB[status]}</p>
      </section>

      <p className="text-center text-xs text-mute mt-6">
        The landlord will contact you by email when there's an update —
        there's nothing you need to do here.
      </p>
    </div>
  )
}

function Stepper({ status }: { status: PublicApplicationStatus }) {
  const current = STEP_INDEX[status]
  const decided = DECIDED.has(status)

  const decisionLabel =
    status === 'approved' ? 'Approved'
    : status === 'declined' ? 'Declined'
    : status === 'withdrawn' ? 'Withdrawn'
    : 'Decision'

  const steps = [
    { label: 'Received', desc: 'Your application reached the landlord.' },
    { label: 'Under review', desc: 'The landlord is looking over your details.' },
    { label: 'Screening', desc: 'Verification checks, if the landlord requires them.' },
    { label: decisionLabel, desc: 'The landlord lets you know either way.' },
  ]

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const isDecisionStep = i === steps.length - 1
        const done = decided ? true : i < current
        const active = !decided && i === current
        return (
          <li key={step.label} className="flex gap-3">
            {/* Icon + connector column */}
            <div className="flex flex-col items-center">
              <StepDot done={done} active={active} isDecisionStep={isDecisionStep} status={status} />
              {i < steps.length - 1 && (
                <div className={`w-px flex-1 min-h-6 ${done ? 'bg-brand-300' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className={i === steps.length - 1 ? 'pb-0' : 'pb-6'}>
              <p className={`text-sm font-semibold leading-7 ${done || active ? 'text-ink' : 'text-mute'}`}>
                {step.label}
                {active && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
                    Current
                  </span>
                )}
              </p>
              <p className="text-xs text-mute mt-0.5">{step.desc}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepDot({ done, active, isDecisionStep, status }: {
  done: boolean
  active: boolean
  isDecisionStep: boolean
  status: PublicApplicationStatus
}) {
  // The decision dot carries the outcome: green approved, red declined,
  // gray withdrawn (semantic status colors, same as the manager UI).
  if (isDecisionStep && done) {
    if (status === 'approved') {
      return (
        <span className="w-7 h-7 rounded-full bg-green-50 border border-green-200 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-green-700" strokeWidth={2} />
        </span>
      )
    }
    if (status === 'declined') {
      return (
        <span className="w-7 h-7 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
          <XCircle className="w-4 h-4 text-red-700" strokeWidth={2} />
        </span>
      )
    }
    return (
      <span className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
        <Undo2 className="w-4 h-4 text-gray-500" strokeWidth={2} />
      </span>
    )
  }
  if (done) {
    return (
      <span className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
        <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
      </span>
    )
  }
  if (active) {
    return (
      <span className="w-7 h-7 rounded-full border-2 border-brand-500 bg-brand-50 flex items-center justify-center shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
      </span>
    )
  }
  return <span className="w-7 h-7 rounded-full border-2 border-gray-200 bg-white shrink-0" />
}
