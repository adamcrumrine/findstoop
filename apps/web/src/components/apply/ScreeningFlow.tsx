// Post-application screening: verified pre-qualification.
//
// v1 surfaces the pre-qual product ($5) + optional selfie ID match (+$2).
// Manager toggles the selfie requirement per property. Regulated checks
// (credit / criminal / eviction) remain in the schema for future use but
// are not chargeable in v1 — landlords who want those reports order them
// directly from TransUnion SmartMove (outside Stoop).
//
// Pricing:
//   Pre-qual (always)   $5
//   Selfie ID match    +$2  (per-property opt-in by the landlord)
//
// Flow:
//   intro   →  applicant sees the breakdown
//   pay     →  Stripe PaymentElement; on success we get state='collecting'
//   id      →  upload DL front + back + selfie
//   income  →  pick income path, upload 2 paystubs (or alt docs)
//   review  →  spinner while dl-ocr + income-ocr + rentability-score run
//   done    →  "submitted" thanks screen
//
// The screening is OPTIONAL — managers can mark applications as decided
// without a pre-qual. But applicants who do it get prioritized in the
// manager UI and see a "✓ Verified" chip on their application.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  ShieldCheck, IdCard, FileText, CheckCircle2, Loader2, CreditCard,
  Upload, Camera, ArrowRight, Lock, Sparkles,
  ExternalLink, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { verifyDocMagicBytes } from '../../lib/fileValidation'
import { BRAND, brandColor } from '../../lib/brand'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')
  return stripePromise
}

type Step = 'intro' | 'pay' | 'id' | 'income' | 'credit_self' | 'review' | 'done'
type IncomePath = 'w2' | '1099' | 'self_employed' | 'fixed_income' | 'new_hire'
type DocKind = 'paystub' | 'ten99' | 'bank_statement' | 'tax_return' | 'ssa_1099' | 'offer_letter'

export interface ScreeningRequirements {
  selfie:                boolean
  credit_self_disclosed: boolean
  credit:                boolean
  criminal:              boolean
  eviction:              boolean
}

interface Props {
  applicationId: string
  applicantName: string
  applicantEmail: string
  // Manager-set via property setup. Applicant doesn't choose — they just see
  // the price and the upload steps the manager requires.
  requirements: ScreeningRequirements
}

const ADDON_PRICE_CENTS = {
  selfie:                 200,
  credit_self_disclosed: 2000,
  credit:                1500,
  criminal:              2500,
  eviction:              1000,
} as const
const BASE_PRICE_CENTS = 500

function computeTotalCents(req: ScreeningRequirements): number {
  // Selfie is bundled FREE with the applicant-provided credit tier — its $2
  // cost is absorbed because the authenticity check is materially stronger
  // when it can cross-reference the selfie against the DL photo.
  const selfieBundled = req.credit_self_disclosed
  return BASE_PRICE_CENTS
    + (req.selfie && !selfieBundled ? ADDON_PRICE_CENTS.selfie                : 0)
    + (req.credit_self_disclosed    ? ADDON_PRICE_CENTS.credit_self_disclosed : 0)
    + (req.credit                   ? ADDON_PRICE_CENTS.credit                : 0)
    + (req.criminal                 ? ADDON_PRICE_CENTS.criminal              : 0)
    + (req.eviction                 ? ADDON_PRICE_CENTS.eviction              : 0)
}

const PATH_OPTIONS: { id: IncomePath; label: string; kinds: DocKind[]; helper: string }[] = [
  { id: 'w2',            label: 'W-2 employee',          kinds: ['paystub', 'paystub'],          helper: 'Two most recent consecutive paystubs' },
  { id: '1099',          label: '1099 / gig worker',     kinds: ['ten99', 'bank_statement'],     helper: 'Most recent 1099 + last 90 days of bank statements' },
  { id: 'self_employed', label: 'Self-employed',         kinds: ['tax_return'],                  helper: 'Most recent 1040 with Schedule C' },
  { id: 'fixed_income',  label: 'Retired / fixed income', kinds: ['ssa_1099'],                   helper: 'SSA-1099 or pension statement' },
  { id: 'new_hire',      label: 'New hire (no paychecks yet)', kinds: ['offer_letter'],          helper: 'Signed offer letter from employer' },
]

export default function ScreeningFlow({ applicationId, applicantName, applicantEmail, requirements }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const [orderId, setOrderId] = useState<string | null>(null)
  // Per-order capability token from start-screening. Required by the OCR /
  // scoring edge functions, which have no logged-in user to authorize against.
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totalCents, setTotalCents] = useState(computeTotalCents(requirements))

  // ── Begin payment ────────────────────────────────────────────────────
  // Tapping Continue counts as consent to the AI screening process AND, for
  // any FCRA-regulated checks the manager required, the §1681b(a)(3)(F)
  // written authorization to procure a consumer report. We record the
  // timestamp once on the application.
  const startPayment = async () => {
    setError(null)
    await supabase
      .from('applications')
      .update({ ai_screening_consent_at: new Date().toISOString() })
      .eq('id', applicationId)
      .is('ai_screening_consent_at', null)
    const { data, error } = await supabase.functions.invoke('start-screening', {
      body: {
        applicationId,
        addons: {
          selfie_match:          requirements.selfie,
          credit_self_disclosed: requirements.credit_self_disclosed,
          credit_check:          requirements.credit,
          criminal_check:        requirements.criminal,
          eviction_check:        requirements.eviction,
        },
      },
    })
    if (error || !data?.clientSecret) {
      setError(error?.message ?? 'Could not start screening — try again')
      return
    }
    setOrderId(data.orderId)
    setAccessToken(data.accessToken ?? null)
    setClientSecret(data.clientSecret)
    setTotalCents(data.amount_cents ?? computeTotalCents(requirements))
    setStep('pay')
  }

  // ── Trigger OCR + vendor pulls + scoring once everything is uploaded ─
  // Fire all the paid-for checks in parallel — they're independent. Rentability
  // scoring runs last since it depends on dl-ocr + income-ocr output.
  const finishUploads = async () => {
    if (!orderId) return
    setStep('review')
    // Capability token gates every OCR/scoring call (the flow is anonymous).
    const token = accessToken
    try {
      await Promise.all([
        supabase.functions.invoke('dl-ocr',     { body: { orderId, token } }),
        supabase.functions.invoke('income-ocr', { body: { orderId, token } }),
        requirements.credit_self_disclosed
          ? supabase.functions.invoke('credit-report-ocr', { body: { orderId, token } })
          : null,
        requirements.credit   ? supabase.functions.invoke('run-credit-check',   { body: { orderId, token } }) : null,
        // ⚠️ INACTIVE: criminal (Checkr) and eviction (LexisNexis) are not live
        // integrations. The manager UI only offers them as disabled "Coming soon"
        // tiles, so requirements.criminal/eviction are never true and these never
        // fire. Left in place so enabling the prefs is all that's needed later.
        requirements.criminal ? supabase.functions.invoke('run-criminal-check', { body: { orderId, token } }) : null,
        requirements.eviction ? supabase.functions.invoke('run-eviction-check', { body: { orderId, token } }) : null,
      ].filter(Boolean))
      await supabase.functions.invoke('rentability-score', { body: { orderId, token } })
    } catch {
      // Edge fn failures aren't fatal for the applicant — the manager will
      // see "screening pending" and can reach out. We still mark them done.
    }
    setStep('done')
  }

  if (step === 'intro') {
    return (
      <IntroCard
        applicantName={applicantName}
        onStart={startPayment}
        requirements={requirements}
        error={error}
      />
    )
  }

  const totalDollars = (totalCents / 100).toFixed(totalCents % 100 === 0 ? 0 : 2)

  if (step === 'pay') {
    return (
      <div className="max-w-2xl mx-auto">
        <Header step={1} title={`Secure your application — $${totalDollars}`} sub="One-time pre-qualification fee." />
        {clientSecret ? (
          <Elements
            stripe={getStripe()}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: { colorPrimary: brandColor('400'), borderRadius: '8px', fontFamily: 'system-ui, -apple-system, sans-serif' },
              },
            }}
          >
            <PaymentInner
              total={totalDollars}
              receiptEmail={applicantEmail}
              onSuccess={() => setStep('id')}
            />
          </Elements>
        ) : (
          <div className="flex items-center justify-center py-12 text-mute">
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
          </div>
        )}
      </div>
    )
  }

  if (step === 'id' && orderId) {
    return <IdStep orderId={orderId} showSelfie={requirements.selfie} onContinue={() => setStep('income')} />
  }

  if (step === 'income' && orderId) {
    return <IncomeStep
      orderId={orderId}
      onContinue={() => requirements.credit_self_disclosed ? setStep('credit_self') : finishUploads()}
    />
  }

  if (step === 'credit_self' && orderId) {
    return <CreditSelfStep
      orderId={orderId}
      applicantName={applicantName}
      onContinue={finishUploads}
    />
  }

  if (step === 'review') {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-4">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-bold text-ink">Verifying your documents…</h2>
        <p className="text-sm text-mute mt-2">This takes about 20 seconds. We'll send your application to the landlord as soon as it's ready.</p>
      </div>
    )
  }

  return <DoneCard />
}

// ── Intro card ─────────────────────────────────────────────────────────
function IntroCard({ applicantName, onStart, requirements, error }: {
  applicantName: string
  onStart: () => void
  requirements: ScreeningRequirements
  error: string | null
}) {
  const total = computeTotalCents(requirements) / 100
  const hasFcraChecks = requirements.credit || requirements.criminal || requirements.eviction
  const tierLabel = requirements.credit_self_disclosed ? 'Tenability™ Pro' : 'Tenability™'
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-2xl p-7 mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-90 font-semibold">
          <Sparkles className="w-3.5 h-3.5" /> {tierLabel}
        </div>
        <h2 className="text-2xl font-bold mt-2">Nice work, {applicantName.split(' ')[0]} — one more step.</h2>
        <p className="text-sm text-white/90 mt-2 leading-relaxed">
          Spend 3 minutes verifying your income and ID. Verified applications land at the top of
          the landlord's review queue with your {tierLabel} score — most get a decision in under 24 hours.
        </p>
        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-4xl font-bold">${total}</span>
          <span className="text-sm text-white/80">one-time · all-in</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <Bullet
          Icon={IdCard}
          title="Verify your identity"
          body={requirements.selfie
            ? "Upload your driver's license (front and back) and a quick selfie. The landlord requires the selfie match for this property."
            : "Upload your driver's license — front and back."
          }
        />
        <Bullet Icon={FileText} title="Verify your income" body="Upload your two most recent paystubs. W-2 not needed." />
        {requirements.credit_self_disclosed && (
          <Bullet
            Icon={CreditCard}
            title="Share your free credit report"
            body="Download your free annual credit report from AnnualCreditReport.gov (federally guaranteed — no card needed) and upload the PDF. The landlord sees your report and our consistency check; we never pull the bureaus directly."
          />
        )}
        {hasFcraChecks && (
          <Bullet
            Icon={ShieldCheck}
            title="Background reports the landlord requested"
            body={[
              requirements.credit   && 'credit history',
              requirements.criminal && 'criminal background',
              requirements.eviction && 'eviction history',
            ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' — pulled from regulated consumer reporting agencies.'}
          />
        )}
        <Bullet Icon={ShieldCheck} title="Private + secure" body="Documents are encrypted, shown only to the landlord for this property, and deleted after a decision." />
      </div>

      {/* Price breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-mute font-semibold">What's included in {tierLabel}</p>
          {requirements.credit_self_disclosed && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded">
              Best value
            </span>
          )}
        </div>
        <dl className="space-y-1.5 text-sm">
          <Line label="Tenability™ — verified income + ID + 0–100 score" cents={BASE_PRICE_CENTS} />
          {requirements.selfie && (
            requirements.credit_self_disclosed
              ? <Line label="Selfie ID match" cents={ADDON_PRICE_CENTS.selfie} strikeCents includedLabel="Included" />
              : <Line label="Selfie ID match" cents={ADDON_PRICE_CENTS.selfie} />
          )}
          {requirements.credit_self_disclosed && <Line label="Applicant-provided credit + authenticity scoring" cents={ADDON_PRICE_CENTS.credit_self_disclosed} />}
          {requirements.credit                && <Line label="Bureau credit report"     cents={ADDON_PRICE_CENTS.credit} />}
          {requirements.criminal              && <Line label="Criminal background"      cents={ADDON_PRICE_CENTS.criminal} />}
          {requirements.eviction              && <Line label="Eviction history"         cents={ADDON_PRICE_CENTS.eviction} />}
        </dl>
        <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="text-xl font-bold text-ink">${total}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 text-sm px-4 py-3 rounded-xl mt-4">{error}</div>
      )}

      <p className="text-xs text-mute text-center mt-5 leading-relaxed max-w-md mx-auto">
        By continuing, you authorize {BRAND.name} to use automated tools, including AI, to verify
        your documents and prepare a private summary for the landlord.{hasFcraChecks ? ` You also authorize ${BRAND.name} and its consumer-reporting partners to obtain the consumer reports the landlord requested above, under 15 U.S.C. § 1681b(a)(3)(F).` : ''} See our{' '}
        <Link to="/screening-terms" target="_blank" className="text-mute underline hover:text-ink">screening&nbsp;terms</Link>.
      </p>

      <div className="mt-3">
        <button
          type="button"
          onClick={onStart}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <CreditCard className="w-4 h-4" strokeWidth={2} />
          Continue — ${total}
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
        <p className="text-[11px] text-mute text-center mt-2">
          Pre-qualification is required to complete your application.
        </p>
      </div>
    </div>
  )
}

function Line({ label, cents, strikeCents, includedLabel }: {
  label: string
  cents: number
  // When set, render the dollar amount with a strikethrough and append the
  // includedLabel chip — used for the selfie line when it's bundled free
  // with the applicant-provided credit tier.
  strikeCents?: boolean
  includedLabel?: string
}) {
  return (
    <div className="flex justify-between gap-3 items-baseline">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink tabular-nums inline-flex items-center gap-2">
        {strikeCents ? (
          <>
            <span className="line-through text-mute">${(cents / 100).toFixed(0)}</span>
            {includedLabel && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                {includedLabel}
              </span>
            )}
          </>
        ) : (
          <>${(cents / 100).toFixed(0)}</>
        )}
      </dd>
    </div>
  )
}

function Bullet({ Icon, title, body }: { Icon: typeof IdCard; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-50 text-brand-600 inline-flex items-center justify-center">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-mute leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  )
}

// ── Step header ────────────────────────────────────────────────────────
function Header({ step, title, sub }: { step: number; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs uppercase tracking-wider text-mute font-semibold">Step {step} of 3</p>
      <h2 className="text-xl font-bold text-ink mt-1">{title}</h2>
      {sub && <p className="text-sm text-mute mt-1">{sub}</p>}
    </div>
  )
}

// ── Payment step ───────────────────────────────────────────────────────
function PaymentInner({ total, receiptEmail, onSuccess }: { total: string; receiptEmail: string; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements || submittingRef.current) return
    submittingRef.current = true
    setProcessing(true)
    setErrMsg(null)
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href, receipt_email: receiptEmail },
    })
    submittingRef.current = false
    if (error) {
      setErrMsg(error.message ?? 'Payment failed')
      setProcessing(false)
      return
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      toast.success('Payment received')
      onSuccess()
      return
    }
    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6">
      <PaymentElement options={{ layout: 'tabs' }} />
      {errMsg && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{errMsg}</p>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full mt-5 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
      >
        {processing && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
        {processing ? 'Processing…' : `Pay $${total}`}
        {!processing && <Lock className="w-4 h-4" strokeWidth={2} />}
      </button>
      <p className="text-center text-xs text-mute mt-3">Secured by Stripe · one-time fee</p>
    </form>
  )
}

// ── ID step ────────────────────────────────────────────────────────────
function IdStep({ orderId, showSelfie, onContinue }: { orderId: string; showSelfie: boolean; onContinue: () => void }) {
  const [dlFront, setDlFront] = useState<File | null>(null)
  const [dlBack, setDlBack]   = useState<File | null>(null)
  const [selfie, setSelfie]   = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onUpload = async () => {
    if (!dlFront || !dlBack) {
      setErr('Front and back of license are required')
      return
    }
    if (showSelfie && !selfie) {
      setErr('Selfie required for the verification upgrade you selected')
      return
    }
    setUploading(true)
    setErr(null)
    try {
      // Magic-byte check on every uploaded file — reject anything that isn't
      // really an image (renamed scripts, etc.).
      for (const [label, f] of [['DL front', dlFront], ['DL back', dlBack], ['Selfie', selfie]] as const) {
        if (!f) continue
        const mime = await verifyDocMagicBytes(f)
        if (!mime || mime === 'application/pdf') {
          setErr(`${label} must be a real image (JPEG, PNG, HEIC). PDFs aren't allowed for identity uploads.`)
          setUploading(false)
          return
        }
      }
      const frontPath  = `${orderId}/dl-front.${dlFront.name.split('.').pop() || 'jpg'}`
      const backPath   = `${orderId}/dl-back.${dlBack.name.split('.').pop() || 'jpg'}`
      const selfiePath = selfie ? `${orderId}/dl-selfie.${selfie.name.split('.').pop() || 'jpg'}` : null

      const up = (path: string, file: File) =>
        supabase.storage.from('screening-docs').upload(path, file, { upsert: true, cacheControl: '3600' })

      const r1 = await up(frontPath, dlFront);  if (r1.error) throw r1.error
      const r2 = await up(backPath, dlBack);    if (r2.error) throw r2.error
      if (selfie && selfiePath) {
        const r3 = await up(selfiePath, selfie); if (r3.error) throw r3.error
      }

      const { error } = await supabase.from('screening_orders').update({
        dl_front_url: frontPath,
        dl_back_url: backPath,
        dl_selfie_url: selfiePath,
      }).eq('id', orderId)
      if (error) throw error

      onContinue()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Header step={2} title="Upload your driver's license" sub={showSelfie ? 'Front, back, and a selfie — confirms you are who you say you are.' : 'Front and back — confirms you are who you say you are.'} />
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <FileSlot Icon={IdCard} label="Driver's license — front" file={dlFront} onPick={setDlFront} accept="image/*" />
        <FileSlot Icon={IdCard} label="Driver's license — back" file={dlBack} onPick={setDlBack} accept="image/*" />
        {showSelfie && (
          <FileSlot Icon={Camera} label="Selfie (matched to your license photo)" file={selfie} onPick={setSelfie} accept="image/*" capture="user" />
        )}
      </div>
      {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{err}</p>}
      <button
        type="button"
        disabled={uploading || !dlFront || !dlBack}
        onClick={onUpload}
        className="w-full mt-5 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
      >
        {uploading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
        {uploading ? 'Uploading…' : 'Continue'}
        {!uploading && <ArrowRight className="w-4 h-4" strokeWidth={2} />}
      </button>
    </div>
  )
}

// ── Income step ────────────────────────────────────────────────────────
function IncomeStep({ orderId, onContinue }: { orderId: string; onContinue: () => void }) {
  const [path, setPath] = useState<IncomePath>('w2')
  const [files, setFiles] = useState<(File | null)[]>([null, null])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opt = PATH_OPTIONS.find((p) => p.id === path)!

  const upload = async () => {
    const filled = files.filter(Boolean) as File[]
    if (filled.length === 0) {
      setErr('Upload at least one document')
      return
    }
    setUploading(true)
    setErr(null)
    try {
      // Magic-byte check on every income doc — image OR PDF is fine here
      // (paystubs / 1099s / tax returns often arrive as PDFs).
      for (const f of filled) {
        const mime = await verifyDocMagicBytes(f)
        if (!mime) {
          setErr(`"${f.name}" isn't a recognized image or PDF.`)
          setUploading(false)
          return
        }
      }
      const urls: string[] = []
      const kinds: DocKind[] = []
      for (let i = 0; i < filled.length; i++) {
        const f = filled[i]
        const path = `${orderId}/income-${i}.${f.name.split('.').pop() || 'jpg'}`
        const { error } = await supabase.storage.from('screening-docs').upload(path, f, { upsert: true, cacheControl: '3600' })
        if (error) throw error
        urls.push(path)
        kinds.push(opt.kinds[i] ?? opt.kinds[0])
      }
      const { error } = await supabase.from('screening_orders').update({
        income_path: path,
        income_doc_urls: urls,
        income_doc_kinds: kinds,
      }).eq('id', orderId)
      if (error) throw error
      onContinue()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Header step={3} title="Verify your income" sub="Pick what fits your situation. Last 4 of SSN OK to leave visible." />

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-3">Income source</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {PATH_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPath(p.id); setFiles(p.kinds.map(() => null)) }}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                path === p.id
                  ? 'bg-brand-50 border-brand-400 text-brand-800'
                  : 'bg-white border-gray-300 text-ink hover:border-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-mute mt-4 mb-2">{opt.helper}</p>
        <div className="space-y-3">
          {opt.kinds.map((kind, i) => (
            <FileSlot
              key={i}
              Icon={FileText}
              label={`${prettyKind(kind)} ${opt.kinds.length > 1 ? `#${i + 1}` : ''}`}
              file={files[i]}
              onPick={(f) => setFiles((prev) => prev.map((p, idx) => idx === i ? f : p))}
              accept="image/*,application/pdf"
            />
          ))}
        </div>
      </div>

      {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{err}</p>}
      <button
        type="button"
        disabled={uploading}
        onClick={upload}
        className="w-full mt-5 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
      >
        {uploading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
        {uploading ? 'Uploading…' : 'Finish & submit'}
        {!uploading && <CheckCircle2 className="w-4 h-4" strokeWidth={2} />}
      </button>
    </div>
  )
}

function prettyKind(k: DocKind): string {
  switch (k) {
    case 'paystub':        return 'Paystub'
    case 'ten99':          return '1099 form'
    case 'bank_statement': return 'Bank statement'
    case 'tax_return':     return '1040 / Schedule C'
    case 'ssa_1099':       return 'SSA-1099 / pension statement'
    case 'offer_letter':   return 'Signed offer letter'
  }
}

// ── File picker slot ───────────────────────────────────────────────────
function FileSlot({ Icon, label, file, onPick, accept, capture }: {
  Icon: typeof IdCard
  label: string
  file: File | null
  onPick: (f: File | null) => void
  accept: string
  capture?: 'user' | 'environment'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed transition-colors ${
        file ? 'border-brand-400 bg-brand-50/50' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50/30'
      }`}
    >
      <div className={`shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center ${file ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-mute'}`}>
        {file ? <CheckCircle2 className="w-4 h-4" strokeWidth={2} /> : <Icon className="w-4 h-4" strokeWidth={1.75} />}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-medium text-ink truncate">{label}</p>
        <p className="text-xs text-mute truncate">{file ? file.name : 'Tap to upload — image or PDF'}</p>
      </div>
      <Upload className="w-4 h-4 text-mute shrink-0" strokeWidth={1.75} />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </button>
  )
}

// ── Done ───────────────────────────────────────────────────────────────
function DoneCard() {
  return (
    <div className="max-w-2xl mx-auto py-16 px-5 text-center">
      <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-green-600" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold text-ink">Application submitted</h1>
      <p className="text-mute mt-2 max-w-md mx-auto">
        The landlord will review your application and reach out via the email you provided.
        Verified applications are typically decided within 24 hours.
      </p>
      <Link to="/" className="mt-6 inline-block text-brand-600 font-medium hover:underline">← Back to {BRAND.name}</Link>
    </div>
  )
}

// ── Credit self-disclosure step ───────────────────────────────────────────
// Applicant pulls their own report from AnnualCreditReport.gov (federally
// guaranteed free under FCRA § 612), uploads the PDF here, and signs an
// attestation. The PDF lives in `screening-docs` under the order folder so
// the existing RLS already gates manager access. We DO NOT proxy the
// bureaus, iframe them, or "intercept the download" — the bureaus block
// framing and trying to scrape session cookies would violate their TOS,
// the CFAA, and would mislead the user. Open and obvious is the right
// pattern.
//
// Cost / margin: $20 add-on, ~$19.70 net after Stripe + ~$0.07 of Claude.
const BUREAU_LINKS = [
  { key: 'experian',   label: 'Experian',   href: 'https://www.annualcreditreport.gov/' },
  { key: 'equifax',    label: 'Equifax',    href: 'https://www.annualcreditreport.gov/' },
  { key: 'transunion', label: 'TransUnion', href: 'https://www.annualcreditreport.gov/' },
] as const

function CreditSelfStep({ orderId, applicantName, onContinue }: {
  orderId: string
  applicantName: string
  onContinue: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [signature, setSignature] = useState('')
  const [attested, setAttested] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = !!file && attested && signature.trim().length >= 3 && !submitting

  const handlePick = async (picked: File | null) => {
    setErr(null)
    if (!picked) { setFile(null); return }
    if (picked.size > 15 * 1024 * 1024) { setErr('File too large — keep it under 15 MB.'); return }
    const ok = await verifyDocMagicBytes(picked)
    if (!ok || ok !== 'application/pdf') { setErr('Upload the original PDF you downloaded from AnnualCreditReport.gov — not a screenshot or photo.'); return }
    setFile(picked)
  }

  const handleSubmit = async () => {
    if (!canSubmit || !file) return
    setSubmitting(true)
    setErr(null)
    try {
      const path = `${orderId}/credit-self/report-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('screening-docs').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf',
      })
      if (upErr) throw new Error(upErr.message)

      // Best-effort IP capture for the attestation audit trail. Falls back
      // to null — the timestamp + signature is the load-bearing piece.
      let ip: string | null = null
      try {
        const ipResp = await fetch('https://api.ipify.org?format=json').then((r) => r.json())
        ip = ipResp?.ip ?? null
      } catch { /* ignore */ }

      const { error: updateErr } = await supabase
        .from('screening_orders')
        .update({
          credit_self_pdf_url: path,
          credit_self_uploaded_at: new Date().toISOString(),
          credit_self_attestation_name: signature.trim(),
          credit_self_attestation_ip: ip,
          credit_self_attestation_at: new Date().toISOString(),
        })
        .eq('id', orderId)
      if (updateErr) throw new Error(updateErr.message)

      onContinue()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed — try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Header step={3} title="Share your free credit report" sub="$20 — required by this landlord." />

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm text-ink leading-relaxed">
          Federal law gives you a <span className="font-semibold">free credit report every week</span> from each
          of the three major bureaus through <span className="font-mono text-xs">AnnualCreditReport.gov</span>.
          Follow the three steps below, then come back here and upload the PDF.
        </p>

        <ol className="space-y-3 mt-4">
          {[
            { n: 1, text: 'Open AnnualCreditReport.gov in a new tab and pick any bureau.' },
            { n: 2, text: 'Verify your identity (name, address, SSN) — typically takes 2–3 minutes.' },
            { n: 3, text: 'Download the PDF report and return here. Do not edit or screenshot the file.' },
          ].map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-bold inline-flex items-center justify-center">{s.n}</span>
              <p className="text-sm text-ink leading-relaxed mt-0.5">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-3 gap-2 mt-4">
          {BUREAU_LINKS.map((b) => (
            <a
              key={b.key}
              href={b.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 text-xs font-semibold transition-colors"
            >
              {b.label}
              <ExternalLink className="w-3 h-3" strokeWidth={2} />
            </a>
          ))}
        </div>
      </div>

      {/* Full disclosure */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-semibold">This is not a credit check.</p>
          <p className="mt-1">
            You are providing the landlord with a copy of <em>your own</em> credit report. This is faster and cheaper
            than a bureau-pulled check, but it relies on your honesty. We run an automated consistency check against
            your other documents to flag obvious issues. Submitting an altered, photoshopped, or someone-else's report
            is fraud and will be referred to the landlord and, if requested, to law enforcement.
          </p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-4">
        <p className="text-xs uppercase tracking-wider text-mute font-semibold mb-2">Upload PDF</p>
        <label className="block">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
            file ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400'
          }`}>
            {file ? (
              <>
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-brand-600" strokeWidth={1.75} />
                <p className="text-sm font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-mute mt-0.5">{(file.size / 1024).toFixed(0)} KB · Tap to replace</p>
              </>
            ) : (
              <>
                <Upload className="w-7 h-7 mx-auto mb-2 text-mute" strokeWidth={1.75} />
                <p className="text-sm font-medium text-ink">Choose your credit report PDF</p>
                <p className="text-xs text-mute mt-0.5">Original PDF only · 15 MB max</p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Attestation */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-xs text-ink leading-relaxed">
            <span className="font-semibold">I certify under penalty of perjury</span> that the attached PDF is my genuine,
            unmodified credit report as downloaded directly from AnnualCreditReport.gov on or after the date shown above.
            I have not altered, photoshopped, or otherwise edited the file. I understand that submitting a falsified
            credit report is fraud.
          </span>
        </label>
        <div>
          <label htmlFor="credit-self-signature" className="block text-xs uppercase tracking-wider text-mute font-semibold mb-1.5">
            Type your full legal name to sign
          </label>
          <input
            id="credit-self-signature"
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={applicantName || 'Jane A. Smith'}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-serif italic focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-900 text-sm px-4 py-3 rounded-xl mt-4">{err}</div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Lock className="w-4 h-4" strokeWidth={2} />}
        {submitting ? 'Uploading…' : 'Submit credit report'}
      </button>
    </div>
  )
}
