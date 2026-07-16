// Plain-language screening terms shown when an applicant clicks the soft
// disclaimer link on the pre-qual intro card. Written to be readable, not
// scary — applicants are already mid-flow and we want to inform without
// raising red flags about AI involvement.

import { Link } from 'react-router-dom'
import { useRouteSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

export default function ScreeningTerms() {
  useRouteSeo('/screening-terms')
  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      <Link to="/" className="text-sm text-brand-600 hover:underline">← {BRAND.name}</Link>
      <h1 className="text-2xl font-bold text-ink mt-4">Screening Terms</h1>
      <p className="text-sm text-mute mt-2">
        Last updated May 23, 2026. Plain English. If anything's unclear, email{' '}
        <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>.
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-ink">
        <div>
          <h2 className="font-semibold text-ink">What pre-qualification does</h2>
          <p className="mt-1 text-mute">
            When you upload your driver's license and income documents, {BRAND.legalName} verifies that the
            information matches what you typed on your application, and prepares a short summary the
            landlord can use to make a decision. We do not pull your credit and we do not run a
            criminal background check at this step — those are part of a separate, optional full
            screening that the landlord can request later.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-ink">Use of automated tools, including AI</h2>
          <p className="mt-1 text-mute">
            We use automated software, including artificial intelligence, to read your documents,
            cross-check them against your application, and generate the landlord's summary. A human
            (the landlord) makes the final rental decision — the summary is a tool, not a decision.
            Our software is configured to ignore any factors protected under the Fair Housing Act and
            applicable state law.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-ink">What we collect</h2>
          <ul className="mt-1 text-mute list-disc pl-5 space-y-1">
            <li>Images of your driver's license (front + back) and an optional selfie</li>
            <li>Your two most recent paystubs, or equivalent income documents</li>
            <li>The information you typed on the application form</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-ink">How we use it</h2>
          <p className="mt-1 text-mute">
            Documents are stored privately and shown only to the landlord for the property you
            applied to. We never sell your data and we never share it with anyone outside the
            landlord and our payment processor (Stripe). After a decision is made, we delete the
            uploaded documents within 90 days.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-ink">Pre-qualification is not a consumer report</h2>
          <p className="mt-1 text-mute">
            The pre-qualification summary is a private signal between you and one landlord — not a
            credit report or background check under the Fair Credit Reporting Act. The landlord may
            choose to order a separate credit / criminal / eviction report from a third-party
            consumer reporting agency (such as TransUnion SmartMove); if they do, that report is
            ordered directly through the agency, not through {BRAND.legalName}.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-ink">Your rights</h2>
          <p className="mt-1 text-mute">
            You can ask us to delete your screening documents at any time by emailing{' '}
            <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>.
            The $5 pre-qualification fee is non-refundable once your documents have been
            processed (which happens immediately).
          </p>
        </div>
      </section>

      <p className="text-xs text-mute mt-10">
        © {new Date().getFullYear()} {BRAND.legalName}. Questions? <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>
      </p>
    </div>
  )
}
