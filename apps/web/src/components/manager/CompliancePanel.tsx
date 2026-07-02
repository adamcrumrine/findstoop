// Compliance panel — the property's state landlord-tenant rules as topic
// cards, each fact with its statutory citation, plus contextual checks that
// compare THIS landlord's actual setup (Settings late-fee config, deposits
// held on this property's leases) against the state rule.
//
// Legal caution is the feature: facts + citations + disclaimers, never
// advice. Topics we don't have on file render "check your state's statutes"
// instead of a guess (see lib/complianceRules.ts for the editorial rule).
// The UI stays thin — all rule logic lives in lib/complianceRules.ts.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CheckCircle2, DoorOpen, FileText, Info,
  Loader2, PiggyBank, Scale, Timer,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { BRAND } from '../../lib/brand'
import {
  getComplianceRules, getRequiredDisclosures, getDepositCompliance, notOnFileNote,
  checkLateFeeCompliance, checkDepositCap, UNKNOWN_STATE_DEADLINE_NOTE,
  type ComplianceFlag, type LateFeeConfigLike,
} from '../../lib/complianceRules'

/** The slice of a lease the deposit-cap check needs. */
export interface ComplianceLeaseLike {
  id: string
  status: string
  rent_amount: number
  security_deposit: number | null
}

export default function CompliancePanel({ property, leases }: {
  property: { state: string }
  leases: ComplianceLeaseLike[]
}) {
  const { profile } = useAuth()
  const rules = getComplianceRules(property.state)
  const stateLabel = rules?.stateName ?? property.state.trim().toUpperCase()
  const disclosures = getRequiredDisclosures(property.state)
  const { returnRule, capInfo } = getDepositCompliance(property.state)

  // The landlord's late-fee config lives on the profile (Settings → Late
  // fees). Fetched here so the panel can sanity-check it against state law.
  const [feeConfig, setFeeConfig] = useState<LateFeeConfigLike | null>(null)
  const [feeLoading, setFeeLoading] = useState(true)
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('late_fee_enabled, late_fee_amount, late_fee_grace_days, late_fee_type, late_fee_percent')
        .eq('id', profile.id)
        .single()
      if (cancelled) return
      if (data) {
        setFeeConfig({
          late_fee_enabled: data.late_fee_enabled ?? false,
          late_fee_amount: Number(data.late_fee_amount ?? 0),
          late_fee_grace_days: Number(data.late_fee_grace_days ?? 0),
          late_fee_type: (data.late_fee_type ?? 'flat') as 'flat' | 'percent',
          late_fee_percent: Number(data.late_fee_percent ?? 0),
        })
      }
      setFeeLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  const feeFlags = checkLateFeeCompliance(feeConfig, property.state)

  // Deposits actually held on this property vs the state cap.
  const depositFlags = leases
    .filter((l) => l.status === 'active' || l.status === 'upcoming')
    .map((l) => checkDepositCap(l.security_deposit, l.rent_amount, property.state))
    .filter((f): f is ComplianceFlag => f !== null)

  return (
    <div className="space-y-4">
      {/* Header + disclaimer. Same amber banner pattern as DisclaimerBanner,
          with copy written for statutory summaries rather than documents. */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink">
              Landlord rules for {stateLabel}
            </h2>
          </div>
          {rules && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-mute bg-gray-100 px-2 py-0.5 rounded-full">
              Last reviewed {rules.lastReviewed}
            </span>
          )}
        </div>
        <p className="text-xs text-mute mt-1.5 leading-relaxed">
          The state rules that apply to this property — entry notice, deposits, late fees, required
          disclosures — each with the statute it comes from, so you can verify any claim against the
          official text.
        </p>
        <div className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm text-amber-800 leading-relaxed">
            This is an informational summary, not legal advice — {BRAND.name} isn't your lawyer.
            Statutes change and cities add their own rules; verify against the cited text (and a
            licensed attorney for anything consequential).
          </p>
        </div>
        {!rules && (
          <div className="mt-3 flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-mute mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm text-mute leading-relaxed">
              {stateLabel || 'This state'} isn't in our rules database yet — federal requirements
              below still apply, and we'd rather show you nothing than a guess. Check {stateLabel || 'your state'}'s
              landlord-tenant statutes for entry notice, deposit, and late-fee rules.
            </p>
          </div>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Entry notice */}
        <TopicCard title="Entry notice" Icon={DoorOpen}>
          {rules?.entryNotice ? (
            <>
              <p className="text-sm text-ink font-medium">
                {rules.entryNotice.hours === 'reasonable'
                  ? 'Reasonable notice required before non-emergency entry.'
                  : `${rules.entryNotice.hours} hours’ notice before non-emergency entry.`}
              </p>
              {rules.entryNotice.note && <FactNote>{rules.entryNotice.note}</FactNote>}
              <CiteBadge cite={rules.entryNotice.statuteCite} />
            </>
          ) : (
            <NotOnFile state={property.state} />
          )}
        </TopicCard>

        {/* Security deposit — composes depositReturn's rule (deadline,
            itemization, penalty) with this module's cap facts + live check. */}
        <TopicCard title="Security deposit" Icon={PiggyBank}>
          {returnRule ? (
            <>
              <p className="text-sm text-ink font-medium">
                Return within {returnRule.deadlineDays} days of move-out
                {returnRule.requiresItemization ? ', with an itemized statement of deductions' : ''}.
              </p>
              {returnRule.forwardingAddressMatters && (
                <FactNote>The return clock is tied to the tenant providing a written forwarding address.</FactNote>
              )}
              <FactNote>{returnRule.penaltyNote}</FactNote>
              <CiteBadge cite={returnRule.statuteCite} />
            </>
          ) : (
            <FactNote>{UNKNOWN_STATE_DEADLINE_NOTE}</FactNote>
          )}
          {capInfo && (
            <>
              <FactNote>{capInfo.capNote}</FactNote>
              <CiteBadge cite={capInfo.statuteCite} />
            </>
          )}
          {!returnRule && !capInfo && <NotOnFile state={property.state} />}
          {depositFlags.map((f, i) => <FlagRow key={i} flag={f} />)}
          {capInfo?.maxDepositMonths != null && depositFlags.length === 0 && leases.some((l) => Number(l.security_deposit) > 0) && (
            <FlagRow flag={{ level: 'ok', message: 'No deposit on this property’s current leases is above the state cap.' }} />
          )}
        </TopicCard>

        {/* Late fees — state rule + check against the landlord's Settings. */}
        <TopicCard title="Late fees" Icon={Timer}>
          {rules?.lateFees ? (
            <>
              {rules.lateFees.graceDaysRequired != null && (
                <p className="text-sm text-ink font-medium">
                  No fee until rent is at least {rules.lateFees.graceDaysRequired} days late.
                </p>
              )}
              <FactNote>{rules.lateFees.capNote}</FactNote>
              {rules.lateFees.statuteCite && <CiteBadge cite={rules.lateFees.statuteCite} />}
            </>
          ) : (
            <NotOnFile state={property.state} />
          )}
          {feeLoading ? (
            <p className="text-xs text-mute inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> Checking your late-fee settings…
            </p>
          ) : feeConfig && !feeConfig.late_fee_enabled ? (
            <p className="text-xs text-mute">Late fees are turned off in your Settings — nothing to check.</p>
          ) : (
            feeFlags.map((f, i) => <FlagRow key={i} flag={f} />)
          )}
          <Link to="/manager/settings" className="text-xs font-medium text-brand-700 hover:underline">
            Review late-fee settings →
          </Link>
        </TopicCard>

        {/* Ending a month-to-month tenancy */}
        <TopicCard title="Notice to terminate" Icon={CalendarClock}>
          {rules?.noticeToTerminate ? (
            <>
              <p className="text-sm text-ink font-medium">
                Month-to-month: at least {rules.noticeToTerminate.monthToMonthDays} days’ written notice.
              </p>
              {rules.noticeToTerminate.note && <FactNote>{rules.noticeToTerminate.note}</FactNote>}
              <CiteBadge cite={rules.noticeToTerminate.statuteCite} />
            </>
          ) : (
            <NotOnFile state={property.state} />
          )}
        </TopicCard>

        {/* Required disclosures — federal items always apply; state items when
            on file. Each links to the in-app tool that satisfies it, if any. */}
        <section className="sm:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
            <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">Required disclosures</h3>
          </div>
          <ul className="space-y-3">
            {disclosures.map((d) => (
              <li key={d.id} className="border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-ink">{d.label}</p>
                <p className="text-xs text-mute mt-1 leading-relaxed">{d.when}</p>
                <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                  <CiteBadge cite={d.statuteCite} />
                  {d.linkTo && (
                    <Link to={d.linkTo} className="text-xs font-medium text-brand-700 hover:underline">
                      {d.linkLabel ?? 'Open the tool'} →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* No year_built on properties yet, so the lead-paint item stays
              conditional copy ("built before 1978") rather than a computed flag. */}
          <p className="text-[11px] text-mute mt-3 leading-relaxed">
            Disclosure templates and notices live in{' '}
            <Link to="/manager/documents" className="text-brand-700 hover:underline">Documents</Link>.
            Local ordinances (city or county) can add requirements beyond this list.
          </p>
        </section>
      </div>
    </div>
  )
}

// ── Presentational pieces ─────────────────────────────────────────────────────

function TopicCard({ title, Icon, children }: {
  title: string
  Icon: typeof Scale
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.75} />
        <h3 className="text-xs uppercase tracking-wider text-mute font-semibold">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function FactNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-mute leading-relaxed">{children}</p>
}

function CiteBadge({ cite }: { cite: string }) {
  return (
    <p className="text-[11px] text-mute">
      <span className="font-mono bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">{cite}</span>
    </p>
  )
}

function NotOnFile({ state }: { state: string }) {
  return (
    <p className="text-xs text-mute leading-relaxed inline-flex items-start gap-1.5">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{notOnFileNote(state)}</span>
    </p>
  )
}

/** One contextual-check result: warning (conflict), info (nuance), ok (clear). */
function FlagRow({ flag }: { flag: ComplianceFlag }) {
  const styles = {
    warning: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    ok: 'bg-green-50 border-green-200 text-green-800',
  }[flag.level]
  const FlagIcon = flag.level === 'warning' ? AlertTriangle : flag.level === 'ok' ? CheckCircle2 : Info
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-xs leading-relaxed ${styles}`}>
      <FlagIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>
        {flag.message}
        {flag.statuteCite && <span className="ml-1 font-mono opacity-80">({flag.statuteCite})</span>}
      </span>
    </div>
  )
}
