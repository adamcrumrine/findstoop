// Terms of Service. Working draft — needs attorney review before launch in
// any state with strong consumer-protection laws (NY, CA, WA, MA, IL).
// Specific high-risk clauses called out inline so a reviewer can find them.

import { Link } from 'react-router-dom'
import { useRouteSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

export default function Terms() {
  useRouteSeo('/terms')

  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      <Link to="/" className="text-sm text-brand-600 hover:underline">← {BRAND.name}</Link>
      <h1 className="text-2xl font-bold text-ink mt-4">Terms of Service</h1>
      <p className="text-sm text-mute mt-2">
        Effective May 23, 2026. Questions: <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>.
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-ink">

        <Sec title="1. Agreement">
          These Terms of Service ("Terms") form a binding agreement between you and {BRAND.legalName} ("we", "us"),
          covering your use of the website at {BRAND.domain} and the software services we provide there ("Service").
          By creating an account, accessing the Service, or applying to rent a property listed on it, you agree to these Terms.
          If you don't agree, don't use the Service.
        </Sec>

        <Sec title="2. Eligibility + geographic availability">
          <p>
            You must be at least 18 years old and capable of entering a binding contract under the laws of your jurisdiction
            to use the Service. The Service is offered to residents of the United States; access from outside the US is at
            your own risk and may not comply with local law.
          </p>
          <p className="mt-2">
            <strong>{BRAND.legalName} is currently paused for new account signups and property listings in New York, California,
            Washington, Massachusetts, and Illinois</strong> while we complete the state-specific compliance work each
            jurisdiction requires (including, where applicable, the Illinois Biometric Information Privacy Act, the
            California Consumer Privacy Act, and various tenant-screening statutes). Marketing pages remain open to
            visitors in those states. We'll lift the pause as state-specific compliance work concludes.
          </p>
        </Sec>

        <Sec title="3. Your account">
          You're responsible for keeping your login credentials secret, for everything that happens under your account, and
          for the accuracy of the information you provide. Don't share your account, and notify us immediately at{' '}
          <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a> if you
          suspect unauthorized access.
        </Sec>

        <Sec title="4. Subscriptions (landlords)">
          <p>
            Landlords subscribe at $9 per active unit per month (or $90 per unit per year). Charges are based on the number
            of units in your portfolio at the start of each billing cycle. Subscriptions auto-renew until cancelled. You can
            cancel anytime from your billing settings; cancellation takes effect at the end of the current billing period
            and is non-refundable except as required by law.
          </p>
          <p className="mt-2">
            <strong>Card surcharge.</strong> If you pay your subscription by credit or debit card, a 3.5% surcharge is added
            to recover the card-processing fees. ACH bank payment has no surcharge. The Service displays the total before
            you confirm.
          </p>
        </Sec>

        <Sec title="5. Tenant pre-qualification fees (applicants)">
          When you submit a rental application through the Service, the property's landlord may require you to complete a
          Tenability™ screening — either Tenability™ ($5: verified income + ID + score) or Tenability™ Pro ($25: adds
          selfie ID match and an applicant-provided credit report with authenticity scoring). This fee is paid directly to
          {BRAND.legalName} and is non-refundable once your documents have been processed — which happens immediately. Tenability™
          is not a consumer report under the Fair Credit Reporting Act. See our{' '}
          <Link to="/screening-terms" className="text-brand-600 hover:underline">Screening Terms</Link> for details.
        </Sec>

        <Sec title="6. Rent collection (tenants paying landlords)">
          <p>
            Rent payments are processed by Stripe, which holds appropriate money-transmitter licenses. Processing costs
            are passed through to the paying tenant: bank (ACH) payments carry a 0.8% fee capped at $5 per transaction,
            and card payments carry a 3.5% surcharge with no cap. Both are disclosed in dollars before you confirm, and
            the total charged is the amount you approve. Failed ACH returns may incur a fee (currently $5) charged to
            the tenant.
          </p>
          <p className="mt-2">
            {BRAND.legalName} is not a party to any rental agreement between landlord and tenant. We act as the technology facilitator
            for the payment; we do not control the lease, deposit handling, eviction processes, or any landlord-tenant relationship.
          </p>
        </Sec>

        <Sec title="7. Lease templates — not legal advice">
          The Service includes state-aware lease templates as a convenience. <strong>These templates are not legal advice
          and we are not a law firm.</strong> Local ordinances, condition of the property, and your specific situation may
          require modifications. We recommend having an attorney review any lease before signing.
        </Sec>

        <Sec title="8. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li>Use the Service to violate any law, including fair housing, FCRA, anti-discrimination, or consumer-protection statutes</li>
            <li>Misrepresent yourself, your income, your employment, or your rental history</li>
            <li>Scrape, copy, reverse-engineer, or build a competing service from the Service or its data</li>
            <li>Attempt to access another user's data without authorization, including via vulnerability probing without a coordinated disclosure agreement</li>
            <li>Send spam, phishing, or harassment through the in-app messaging</li>
            <li>Upload malware, illegal content, or content that infringes intellectual property</li>
          </ul>
        </Sec>

        <Sec title="9. Your content">
          You keep ownership of the content you upload (photos, applications, documents). By uploading, you grant {BRAND.legalName}
          a non-exclusive, royalty-free license to host, display, and process that content as needed to provide the Service
          — including transmitting it to the service providers listed in our <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
          This license ends when you delete the content or close your account, except where retention is required by law.
        </Sec>

        <Sec title="10. Our intellectual property">
          The Service software, design, brand, and content (excluding user content) are owned by {BRAND.legalName} and protected
          by US copyright and trademark law. You may not copy, modify, distribute, or create derivative works without our
          written permission.
        </Sec>

        <Sec title="11. Termination">
          You can close your account anytime from settings. We may suspend or terminate your account if you violate these
          Terms, if your account becomes inactive for 24+ months, or if required by law. We'll give reasonable notice
          except where immediate action is needed (e.g., suspected fraud or court order).
        </Sec>

        <Sec title="12. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
            INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DON'T
            WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
          </p>
          <p className="mt-2">
            Tenant pre-qualification scores are advisory signals, not predictions of tenant behavior or guarantees of
            any kind. The decision to rent to a particular applicant is the landlord's alone.
          </p>
        </Sec>

        <Sec title="13. Limitation of liability">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {BRAND.legalName.toUpperCase()}'S TOTAL LIABILITY UNDER OR RELATING TO THESE TERMS OR THE
          SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID {BRAND.legalName.toUpperCase()} IN THE TWELVE MONTHS BEFORE THE EVENT
          GIVING RISE TO THE CLAIM, OR (B) $100. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
          OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, OR BUSINESS INTERRUPTION, EVEN IF WE'VE BEEN ADVISED OF
          THE POSSIBILITY OF SUCH DAMAGES.
        </Sec>

        <Sec title="14. Indemnification">
          You agree to indemnify and hold harmless {BRAND.legalName} and its officers, employees, and contractors from any claim,
          demand, loss, or expense (including reasonable attorneys' fees) arising from your use of the Service, your
          content, or your violation of these Terms or applicable law.
        </Sec>

        <Sec title="15. Dispute resolution + binding arbitration">
          <p>
            <strong>Please read this section carefully.</strong> It affects your legal rights, including the right to a
            jury trial and to participate in a class action.
          </p>
          <p className="mt-2">
            Any dispute arising under these Terms or out of your use of the Service will be resolved by binding individual
            arbitration administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules,
            held in Franklin County, Ohio (or remotely if you reside outside Ohio). The arbitrator's decision is final and
            enforceable in any court of competent jurisdiction.
          </p>
          <p className="mt-2">
            <strong>Class action waiver.</strong> You and {BRAND.legalName} agree to bring disputes only in individual capacity, and
            not as a plaintiff or class member in a purported class or representative proceeding. The arbitrator may not
            consolidate more than one person's claims.
          </p>
          <p className="mt-2">
            Exceptions: either party may seek injunctive relief in court to protect intellectual property, and either party
            may bring an individual claim in small-claims court if it qualifies.
          </p>
        </Sec>

        <Sec title="16. Governing law">
          These Terms are governed by the laws of the State of Ohio, without regard to its conflict-of-laws rules. Subject
          to the arbitration provision above, the state and federal courts located in Franklin County, Ohio have exclusive
          jurisdiction over any non-arbitrable disputes.
        </Sec>

        <Sec title="17. Changes to these Terms">
          We may update these Terms as the Service evolves or as the law changes. We'll notify active users by email at
          least 14 days before material changes take effect. Continued use of the Service after the effective date counts
          as acceptance.
        </Sec>

        <Sec title="18. Miscellaneous">
          These Terms (with the Privacy Policy, Screening Terms, Fair Housing Statement, and Accessibility Statement) are
          the entire agreement between you and us regarding the Service. If a court finds any provision unenforceable,
          the rest stays in effect. Our failure to enforce any provision isn't a waiver of our right to enforce it later.
          You may not assign these Terms; we may assign them in connection with a merger, acquisition, or sale of assets.
        </Sec>

        <Sec title="Contact">
          <p>
            {BRAND.legalName}<br />
            <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>
          </p>
        </Sec>
      </section>

      <p className="text-xs text-mute mt-10">
        © {new Date().getFullYear()} {BRAND.legalName}.
      </p>
    </div>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-semibold text-ink">{title}</h2>
      <div className="text-mute mt-1">{children}</div>
    </div>
  )
}
