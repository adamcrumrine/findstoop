import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'
import { BRAND } from '../../../lib/brand'

export default function RentalApplicationProcess() {
  useRouteSeo('/education/rental-application-process')

  return (
    <EducationArticle
      category="Operations"
      title="The rental application process, step by step"
      subtitle="From the first inquiry to a signed lease — the sequence that keeps a vacancy short, keeps you out of legal trouble, and lands you a tenant you're not sorry you picked."
      readMinutes={8}
      relatedLinks={[
        { to: '/education/how-to-screen-tenants', label: 'How to screen tenants — complete guide' },
        { to: '/education/fair-housing-act-guide', label: `Fair Housing Act — a small landlord's compliance guide` },
        { to: '/education/security-deposit-rules-for-landlords', label: 'Security deposit rules for landlords' },
      ]}
    >
      <p>
        A vacant unit costs you money every single day it sits empty, so it's tempting to rush the
        application process to fill it faster. The landlords who do the process in a consistent order tend
        to fill vacancies just as fast, with fewer surprises three months in — because the order itself is
        what keeps you fast without being sloppy.
      </p>

      <h2>The seven stages</h2>
      <ol>
        <li><strong>List the vacancy</strong> — accurate description, real photos, a fair asking price.</li>
        <li><strong>Field inquiries and schedule showings</strong> — same information, same tour, for every
        prospect.</li>
        <li><strong>Collect the application</strong> — one standardized form for every applicant.</li>
        <li><strong>Screen</strong> — income, identity, credit and background where applicable.</li>
        <li><strong>Decide</strong> — apply your written criteria uniformly and document the decision.</li>
        <li><strong>Sign the lease</strong> — e-sign or wet-sign, with all required disclosures attached.</li>
        <li><strong>Collect move-in funds and hand over keys</strong> — first month's rent, deposit, and a
        signed move-in checklist.</li>
      </ol>

      <h2>1. List the vacancy honestly</h2>
      <p>
        The listing sets expectations for everyone who applies. Describe the unit accurately — square
        footage, bedroom and bathroom count, parking, pet policy, utilities included or not — and price it
        against comparable units nearby rather than against what you'd like to earn. An overpriced listing
        doesn't just sit longer; it also attracts applicants who are stretching their budget, which raises
        your risk of late payments down the line.
      </p>
      <p>
        Keep the listing copy focused on the property, not on the kind of person you imagine living there.
        Phrases like "perfect for a young professional" or "great for a small family" can create Fair
        Housing exposure even when they're meant innocently — see our{' '}
        <Link to="/education/fair-housing-act-guide">Fair Housing Act guide</Link> for the specifics.
      </p>

      <h2>2. Field inquiries and schedule showings</h2>
      <p>
        Answer every inquiry with the same core information: rent, deposit, application fee, move-in date,
        and pet policy. Consistency here matters for two reasons — it saves you from repeating yourself,
        and it's your best evidence that you're not steering some prospects toward or away from the unit
        based on anything other than the facts of the property.
      </p>
      <p>
        At the showing, give every prospect the same tour and the same amount of time. If you answer a
        question for one applicant ("is the third bedroom big enough for a crib?"), be ready for the same
        kind of question from anyone — and answer it the same way regardless of who's asking.
      </p>

      <h2>3. Collect a standardized application</h2>
      <p>
        Every applicant should fill out the same form, asking for the same information in the same order:
      </p>
      <ul>
        <li>Full legal name and contact information for every adult who will live in the unit</li>
        <li>Current address and current monthly rent</li>
        <li>Gross monthly income and employer (or income source)</li>
        <li>Desired move-in date and lease length</li>
        <li>Prior landlord reference, if available</li>
        <li>Pets, if your property allows them, with type and weight</li>
      </ul>
      <p>
        Some states cap what you can charge for an application fee, and some require you to refund the fee
        if it isn't used to cover actual screening costs. Check your state before you set yours — a modest,
        cost-covering fee is standard practice almost everywhere; padding it as a profit center invites
        scrutiny.
      </p>

      <h2>4. Screen against written criteria</h2>
      <p>
        This is the step landlords most often shortcut, and it's the one that causes the most expensive
        mistakes — both financial (a tenant who can't actually afford the rent) and legal (inconsistent
        treatment of applicants). We cover the full screening flow — income verification, identity checks,
        credit and background, and where AI genuinely helps — in our{' '}
        <Link to="/education/how-to-screen-tenants">tenant screening guide</Link>.
      </p>
      <p>
        The short version: write your criteria down before you list the unit, and apply the same criteria
        to every applicant in the order they applied.
      </p>

      <h2>5. Decide and document</h2>
      <p>
        Process applications in the order received, against your pre-written criteria. When you approve
        someone, note briefly why. When you deny someone, note briefly why — and if the denial is based on
        a credit or background report, federal law requires an adverse-action notice telling them which
        reporting agency to contact and that they have the right to dispute the report.
      </p>
      <p>
        A one-paragraph decision note per applicant, filed away, is the single cheapest form of legal
        protection available to a landlord. It costs two minutes and it's the difference between "here's
        exactly why" and "I don't really remember" if you're ever asked to explain a decision.
      </p>

      <h2>6. Sign the lease</h2>
      <p>
        Once you've approved an applicant, move fast — the best applicants often have other options in
        motion. Send the lease with every required disclosure attached (lead-based paint for pre-1978
        properties, any state-mandated addenda) and let them sign electronically if possible. Electronic
        signatures are legally valid nationwide under the federal ESIGN Act and state UETA laws.
      </p>

      <h2>7. Collect move-in funds and document the unit</h2>
      <p>
        Collect the first month's rent and security deposit before handing over keys, and walk the unit
        with the tenant using a signed, photographed move-in checklist — the single best piece of insurance
        against a deposit dispute eight months or two years later. Our{' '}
        <Link to="/education/move-in-checklist-guide">move-in checklist guide</Link> covers exactly what to
        document and how to photograph it defensibly.
      </p>

      <h2>How long should the whole process take?</h2>
      <p>
        With a standardized application and a fast screening flow, going from "application received" to
        "lease signed" comfortably fits inside a week for a straightforward applicant, and the screening
        portion itself can be same-day with modern document-based verification. The listing-to-showing and
        showing-to-application steps are usually the slower parts — the actual decision doesn't have to be.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>Can I charge different application fees to different applicants?</h3>
      <p>
        No. Set one fee for the unit and apply it to everyone who applies. Varying the fee by applicant
        invites a discrimination claim even if that's not your intent.
      </p>
      <h3>Do I have to accept the first qualified applicant?</h3>
      <p>
        Processing applications in the order received and accepting the first one who meets your written
        criteria is the safest practice. Skipping over an earlier qualified applicant in favor of a later
        one is where "why did you pick them instead" questions turn into legal exposure.
      </p>
      <h3>What if two applicants apply on the same day?</h3>
      <p>
        Use timestamps if your process captures them, or process by whichever was fully complete first —
        missing documents shouldn't hold a spot. Decide the tie-breaking rule before you need it, not in
        the moment.
      </p>
      <h3>Can I require a co-signer?</h3>
      <p>
        Yes, generally, if you apply the requirement consistently — for example, to every applicant whose
        income falls below your stated ratio, rather than selectively.
      </p>
      <h3>How does {BRAND.name} handle this process?</h3>
      <p>
        {BRAND.name} gives every applicant the same online form, runs document-based income and identity
        verification with a Tenability™ score attached, and moves the approved applicant straight into
        e-signing — so stages 3 through 6 above happen inside one connected flow instead of six separate
        tools.
      </p>
    </EducationArticle>
  )
}
