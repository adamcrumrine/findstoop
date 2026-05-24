import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useSeo } from '../../../lib/useSeo'

export default function HowToScreenTenants() {
  useSeo({
    title: 'How to screen tenants in 2026 — a complete guide for small landlords',
    description: 'A practical, jargon-free guide to tenant screening for small landlords: what to ask for, what the law allows, how to verify income, and where AI fits in. Updated for 2026.',
    path: '/education/how-to-screen-tenants',
  })

  return (
    <EducationArticle
      category="Screening"
      title="How to screen tenants in 2026 — a complete guide for small landlords"
      subtitle="Everything you need to do — and everything you must NOT do — when evaluating a rental applicant. Updated to reflect current Fair Housing rules and modern AI-driven verification."
      readMinutes={9}
      relatedLinks={[
        { to: '/education/fair-housing-act-guide', label: 'Fair Housing Act: a small landlord\'s compliance guide' },
        { to: '/education/move-in-checklist-guide', label: 'The move-in / move-out checklist that protects your deposit' },
        { to: '/tenability', label: 'What is a Tenability™ score?' },
      ]}
    >
      <p>
        Tenant screening is the single biggest decision a small landlord makes for any given property. A great
        applicant pays on time, keeps the unit in good shape, and renews. A bad one creates months of stress,
        legal cost, and lost rent. The difference between the two is rarely obvious from a 20-minute meeting at
        the door — which is why screening matters.
      </p>
      <p>
        This guide walks through the 2026 best-practice screening flow for landlords who own one rental, ten
        rentals, or are about to buy their first. It covers what you can ask, what you must not ask, how to
        verify income without spending three weeks chasing an HR department, and how modern AI tooling fits
        into the workflow.
      </p>

      <h2>The five-step screening flow</h2>
      <p>
        Every well-run screening process has the same five steps. The order matters — running them out of
        sequence costs you time and exposes you to legal risk.
      </p>
      <ol>
        <li><strong>Pre-qualify on the basics</strong> — income, prior address, intent to rent.</li>
        <li><strong>Verify identity</strong> — government-issued ID, ideally with a photo match.</li>
        <li><strong>Verify income</strong> — paystubs, 1099s, bank statements, or an offer letter.</li>
        <li><strong>Review credit + background</strong> — only with the applicant's written consent.</li>
        <li><strong>Make a decision and document it</strong> — same criteria for every applicant, in writing.</li>
      </ol>

      <h2>Step 1 — Pre-qualify on the basics</h2>
      <p>
        Before you spend money on anything, get four pieces of information from the applicant in writing:
      </p>
      <ul>
        <li>Their gross monthly income (the actual number, not "I make enough")</li>
        <li>Their current address and current monthly rent</li>
        <li>Their desired move-in date</li>
        <li>The names of everyone over 18 who will live in the unit</li>
      </ul>
      <p>
        Two simple math checks at this stage filter out 70% of mismatches before you spend a dollar:
      </p>
      <blockquote>
        <p>
          <strong>The 3x rule.</strong> Gross monthly income should be at least 3× the rent. A $1,500/month
          unit needs an applicant making at least $4,500/month gross. Some markets stretch to 2.5×; below that
          is where late-payment risk climbs sharply.
        </p>
      </blockquote>
      <p>
        Some states (notably New York City and many California cities) restrict the use of income ratios as
        a screening criterion or require you to accept housing-voucher income in the ratio. Check your local
        rules before applying a flat 3× cutoff.
      </p>

      <h2>Step 2 — Verify identity</h2>
      <p>
        Identity fraud in rentals is more common than landlords think. A renter posing as someone else passes
        the income check (the docs are real — they just don't belong to them), passes the credit check (same),
        and you don't find out until the first eviction.
      </p>
      <p>
        At minimum, ask for the front and back of a government-issued ID — driver's license, passport, or
        state ID. Modern tooling can cross-check the name and date of birth on the ID against the application
        in seconds, and a selfie match against the ID photo closes the identity-theft loophole almost entirely.
      </p>
      <p>
        Never accept a photo of an ID over text. Always require it to be uploaded through a screening system
        where the file is encrypted in transit and at rest, and where access is scoped to just you and the
        applicant.
      </p>

      <h2>Step 3 — Verify income</h2>
      <p>
        The old playbook is calling the applicant's employer or paying a vendor like Truework or The Work
        Number to do it for you. Truework typically takes <strong>three to seven business days</strong> and
        costs $20–40 per verification. In a competitive market, the applicant has already signed somewhere
        else by the time you hear back.
      </p>
      <p>
        The modern playbook is document-based AI verification. The applicant uploads two recent paystubs (or
        a 1099 + 90 days of bank statements for gig workers, or a 1040 Schedule C for the self-employed),
        and the system reads the actual numbers, checks that the math is internally consistent, and flags
        any obvious tampering. Results in seconds, not days.
      </p>
      <p>
        For non-W-2 applicants, the right document depends on how they earn:
      </p>
      <ul>
        <li><strong>W-2 employees:</strong> two most-recent paystubs from the same employer</li>
        <li><strong>1099 / gig workers:</strong> last 90 days of bank statements plus the most recent 1099</li>
        <li><strong>Self-employed:</strong> last filed 1040 with Schedule C</li>
        <li><strong>Retired / fixed income:</strong> SSA-1099, pension statement, or annuity statement</li>
        <li><strong>New hire (pre-paystubs):</strong> a signed offer letter on company letterhead</li>
      </ul>

      <h2>Step 4 — Credit + background</h2>
      <p>
        You can pull a credit report on an applicant only with their <strong>written authorization</strong>.
        The Fair Credit Reporting Act (FCRA, 15 U.S.C. § 1681b) requires it, and the form has to be specific —
        a generic "I authorize background checks" buried in the application doesn't cut it.
      </p>
      <p>
        Two paths to credit information for small landlords:
      </p>
      <ul>
        <li>
          <strong>Bureau-pulled report</strong> via a consumer reporting agency like TransUnion SmartMove,
          Experian RentBureau, or a screening service. Typical cost: $25–50. The report comes from the bureau
          directly, so the data is authoritative.
        </li>
        <li>
          <strong>Applicant-provided report</strong> from{' '}
          <a href="https://www.annualcreditreport.gov/" target="_blank" rel="noopener noreferrer">
            AnnualCreditReport.gov
          </a>
          {' '}— federally free for every consumer once per week per bureau. The applicant pulls and shares
          their own PDF. Cheaper for the applicant, faster, but technically the applicant's own disclosure
          rather than a bureau-issued document. Pair it with an attestation that the file is unmodified.
        </li>
      </ul>
      <p>
        For criminal and eviction history, you'll need a CRA-issued report. Be aware that several states and
        cities (including New Jersey, Illinois, Washington, California, and many others) restrict how
        criminal history can be used in a tenancy decision — generally requiring an individualized
        assessment rather than a blanket bar.
      </p>

      <div className="callout">
        <p>
          <strong>Adverse action notice required.</strong> If you deny an applicant based wholly or partly on
          a consumer report (credit, criminal, eviction), federal law requires you to give them written
          notice with the CRA's name, address, and phone, and tell them they can dispute the report's
          accuracy. Skipping this step is a textbook FCRA violation.
        </p>
      </div>

      <h2>Step 5 — Decide and document</h2>
      <p>
        Before you advertise the unit, write down your screening criteria. Use the same criteria for every
        applicant in the order they applied. The two big rules:
      </p>
      <ol>
        <li>
          <strong>Apply the criteria uniformly.</strong> If you're willing to accept a 600 credit score for
          one applicant, you have to accept it for everyone in the same applicant pool. Disparate application
          of "the rules" is one of the most common Fair Housing violations.
        </li>
        <li>
          <strong>Document why you said yes or no.</strong> A one-paragraph note ("approved — income 3.5×,
          ID verified, no derogatories") is enough. If you're ever challenged, this is the only thing
          standing between you and a "your word against theirs" lawsuit.
        </li>
      </ol>

      <h2>What you must NOT ask</h2>
      <p>
        The Fair Housing Act prohibits screening on any of the following — directly or indirectly:
      </p>
      <ul>
        <li>Race or color</li>
        <li>National origin or ancestry</li>
        <li>Religion</li>
        <li>Sex, including gender identity and sexual orientation</li>
        <li>Familial status (presence of children under 18)</li>
        <li>Disability or medical history</li>
      </ul>
      <p>
        Many states and cities add further protected classes: age, marital status, military or veteran status,
        source of income (including housing vouchers, child support, alimony, and public assistance),
        ancestry, and citizenship status. <strong>Source of income is the most-litigated 2024–2026 protected
        class</strong> — if your state or city protects voucher recipients, you cannot refuse a Section 8
        applicant solely because they pay with a voucher.
      </p>
      <p>
        For a complete walkthrough of Fair Housing compliance, see our{' '}
        <Link to="/education/fair-housing-act-guide">Fair Housing Act guide</Link>.
      </p>

      <h2>How long should screening take?</h2>
      <p>
        With modern tools, the entire flow above — pre-qualify → ID verify → income verify → AI summary →
        landlord decision — fits in <strong>under 24 hours</strong> on the landlord side. The applicant can
        complete their upload in 5 minutes. Compare that to the 3–7 business days a Truework employment
        verification takes by itself.
      </p>
      <p>
        Speed isn't just a nice-to-have. In a competitive rental market, the landlord who can credibly say
        "I'll have a decision by tomorrow" wins applicants the slow landlords lose. Verified applicants
        also tend to be the higher-quality ones — slower processes select for applicants who have no other
        options.
      </p>

      <h2>Where AI fits — and where it doesn't</h2>
      <p>
        AI is excellent at three specific jobs in screening:
      </p>
      <ul>
        <li><strong>Reading documents fast.</strong> Paystubs, 1099s, IDs — extracted in seconds.</li>
        <li><strong>Cross-checking facts.</strong> Does the income on the paystub match the YTD math? Does
        the name on the DL match the application? Anomalies surface automatically.</li>
        <li><strong>Summarizing.</strong> Twenty pages of documents collapse into a one-paragraph plain-English
        summary the landlord can read in 30 seconds.</li>
      </ul>
      <p>
        AI is <strong>not</strong> good at — and should not be used for — making the actual rental decision.
        That decision belongs to a human landlord who can weigh context the model can't see (a candid
        explanation for a credit hit, an unusual employment history, a great prior-landlord reference).
        At FindStoop, the AI produces a 0–100 Tenability™ score and a summary; you make the call.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>What credit score is "good enough" to rent to someone?</h3>
      <p>
        There's no universal answer. A 720+ is excellent and rare. 650–720 is solid. 580–649 is mixed — look
        at the reasons for any derogatories (a medical collection from 2018 reads very differently than three
        recent late credit-card payments). Below 580 isn't automatic denial; it's a "look harder" signal.
        Whatever cutoff you pick, apply it uniformly to every applicant.
      </p>
      <h3>Can I require first month, last month, AND a security deposit?</h3>
      <p>
        Depends on your state. Several states cap total move-in cost at 1–2 months' rent. California, Oregon,
        Washington, New York, and Massachusetts all have specific deposit caps. Check{' '}
        <a href="https://www.hud.gov/topics/rental_assistance/local_government/state-info" target="_blank" rel="noopener noreferrer">HUD's state-by-state directory</a>
        {' '}before posting your listing.
      </p>
      <h3>Should I ever waive my income-to-rent requirement?</h3>
      <p>
        Rarely, and only with structural compensation: a larger security deposit (within legal limits), a
        co-signer, or several months of rent paid up front. Document why you waived the criterion so the
        record shows you weren't applying the rule selectively.
      </p>
      <h3>Is using AI to screen tenants legal?</h3>
      <p>
        Yes, if the AI is configured to ignore protected-class signals and the final rental decision stays
        with a human. Several states (including New York City as of 2023) regulate automated employment
        decisions, and HUD has issued guidance on AI-driven housing decisions. Use tools that document their
        Fair Housing posture in writing.
      </p>
    </EducationArticle>
  )
}
