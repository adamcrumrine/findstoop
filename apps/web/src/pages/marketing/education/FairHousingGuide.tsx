import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useSeo } from '../../../lib/useSeo'

export default function FairHousingGuide() {
  useSeo({
    title: 'Fair Housing Act — a small landlord\'s compliance guide for 2026',
    description: 'A plain-English guide to the Fair Housing Act for individual landlords: protected classes, what you can and can\'t ask, advertising rules, reasonable accommodations, and the costliest mistakes to avoid.',
    path: '/education/fair-housing-act-guide',
  })

  return (
    <EducationArticle
      category="Compliance"
      title="Fair Housing Act — a small landlord's compliance guide for 2026"
      subtitle="What the federal Fair Housing Act actually requires of you, the seven protected classes, and the questions that quietly land landlords in court."
      readMinutes={11}
      relatedLinks={[
        { to: '/education/how-to-screen-tenants', label: 'How to screen tenants — complete guide' },
        { to: '/education/lead-based-paint-disclosure', label: 'Federal lead-based paint disclosure' },
        { to: '/fair-housing', label: 'FindStoop\'s Fair Housing posture' },
      ]}
    >
      <p>
        The Fair Housing Act (FHA) — Title VIII of the Civil Rights Act of 1968, codified at 42 U.S.C. § 3601
        and onward — is the single most important law a landlord needs to understand. Violations are expensive
        (HUD fines start at $25,597 for a first offense and climb to $127,983 for repeat violations as of 2024),
        and most happen by accident: a casual question to an applicant, a poorly-worded listing, a
        well-meaning policy that disproportionately excludes a protected class.
      </p>
      <p>
        This guide is written for individual landlords — the 73% of US rental properties owned by people, not
        institutions. It covers the seven federal protected classes, the practical rules for screening and
        advertising, and the specific pitfalls that send small landlords to housing court.
      </p>
      <div className="callout">
        <p>
          <strong>This is not legal advice.</strong> Fair Housing is federal law, but many states and cities
          add further protections. Before you finalize a screening policy, talk to a real estate attorney
          familiar with your state's law.
        </p>
      </div>

      <h2>The seven federal protected classes</h2>
      <p>
        Under the FHA, it is unlawful to refuse to rent, set different terms, discourage application, or
        otherwise discriminate based on any of:
      </p>
      <ol>
        <li><strong>Race</strong></li>
        <li><strong>Color</strong></li>
        <li><strong>National origin</strong></li>
        <li><strong>Religion</strong></li>
        <li><strong>Sex</strong> — including gender identity and sexual orientation (HUD guidance,
        <em>Bostock v. Clayton County</em> read into Title VIII)</li>
        <li><strong>Familial status</strong> — the presence of children under 18 in the household; protects
        pregnant women and people in the process of adopting</li>
        <li><strong>Disability</strong> — physical, mental, or sensory impairments that substantially limit
        a major life activity</li>
      </ol>

      <h2>State and local protected classes</h2>
      <p>
        Many states and cities add further protected classes — and these are usually <em>where landlords
        get caught</em>, because the federal list doesn't include them. Examples by category:
      </p>
      <ul>
        <li><strong>Source of income</strong> (the big one in 2024–2026) — protects Section 8 vouchers,
        Social Security, child support, alimony, and other lawful income. <strong>Active in:</strong>
        California, Colorado, Connecticut, Delaware, Illinois, Maryland, Massachusetts, Minnesota, New
        Jersey, New York, North Dakota, Oregon, Vermont, Washington, and many cities including Chicago,
        Dallas, Memphis, Philadelphia, and Seattle.</li>
        <li><strong>Age</strong> — most states protect against age discrimination above 18.</li>
        <li><strong>Marital status</strong> — protected in roughly half of states.</li>
        <li><strong>Military or veteran status</strong> — protected federally (the Servicemembers Civil
        Relief Act) and in most states.</li>
        <li><strong>Ancestry</strong>, <strong>citizenship status</strong>, <strong>genetic
        information</strong>, and <strong>survivors of domestic violence</strong> — various state-level
        protections.</li>
      </ul>
      <p>
        Always operate from the most-expansive set of protections that applies at your property's address.
      </p>

      <h2>What you can NEVER ask</h2>
      <p>
        These questions are illegal under federal law, full stop. They sound innocent. They are not.
      </p>
      <ul>
        <li>"Where are you originally from?" — national origin probe</li>
        <li>"How many children do you have?" — familial status probe</li>
        <li>"Are you married / planning to have kids?" — sex + familial status</li>
        <li>"What's your first language?" — national origin</li>
        <li>"Do you have any medical conditions?" — disability</li>
        <li>"What church do you go to?" — religion</li>
        <li>"Is your boyfriend/girlfriend going to live with you?" — relationship status + sex</li>
        <li>"Will your service animal be a problem?" (re. an emotional support animal) — disability</li>
      </ul>
      <p>
        The bright line is this: if you wouldn't ask the question to every single applicant in exactly the
        same way, don't ask it. Curiosity is not a defense.
      </p>

      <h2>What you CAN ask</h2>
      <p>
        Anything related to the four legitimate tenancy factors:
      </p>
      <ol>
        <li><strong>Ability to pay rent</strong> (income, employment, prior rent history)</li>
        <li><strong>Identity</strong> (name, government-issued ID)</li>
        <li><strong>Tenancy history</strong> (prior landlord references, evictions on record)</li>
        <li><strong>Capacity to comply with the lease</strong> (criminal background where lawful, household
        composition for occupancy limits within legal bounds)</li>
      </ol>
      <p>
        These are the same four signals that go into a Tenability™ score. Everything else is off-limits.
      </p>

      <h2>Advertising rules</h2>
      <p>
        The FHA's reach extends to your listing copy. Some phrasing that gets landlords in trouble:
      </p>
      <ul>
        <li><strong>"No children"</strong> or <strong>"Adult community"</strong> — familial status
        discrimination unless the property qualifies for the "housing for older persons" exemption</li>
        <li><strong>"Christian neighborhood"</strong>, <strong>"family-oriented"</strong>, <strong>"perfect
        for singles"</strong> — religion / familial / sex steering</li>
        <li><strong>"Walking distance to St. Mary's"</strong> — implicit religious steering</li>
        <li>Photo selection — using only photos featuring residents of one demographic suggests steering</li>
      </ul>
      <p>
        Safe phrasing focuses on the unit and the lease: "2-bedroom, 1-bath, $1,500/month, no smoking, 1 cat
        OK, available June 1." Describe the property, never the person you imagine living in it.
      </p>

      <h2>Reasonable accommodations and modifications</h2>
      <p>
        A tenant or applicant with a disability has the right to request:
      </p>
      <ul>
        <li>A <strong>reasonable accommodation</strong> — a change to a rule, policy, service, or procedure.
        Examples: allowing an emotional support animal in a "no pets" building, accepting a third-party
        payor for rent, allowing a live-in aide.</li>
        <li>A <strong>reasonable modification</strong> — a physical change to the unit, paid for by the
        tenant (in private housing). Examples: grab bars in the bathroom, a ramp at the entrance.</li>
      </ul>
      <p>
        You must engage in an "interactive process" — a good-faith discussion — and grant requests unless
        they impose an undue financial or administrative burden, or fundamentally alter the program. A blanket
        "no" without engagement is a Fair Housing violation.
      </p>
      <p>
        Two specific notes:
      </p>
      <ul>
        <li><strong>Emotional support animals are not pets.</strong> Pet deposits and pet rent cannot be
        charged for an ESA. You can require documentation from a healthcare provider that the animal is
        needed; you cannot demand specific medical diagnosis.</li>
        <li><strong>Service animals under the ADA</strong> are a separate category and even more protected;
        only two questions are permitted (is it required for a disability, and what work is it trained to
        perform).</li>
      </ul>

      <h2>Disparate impact — the policy that looks neutral but isn't</h2>
      <p>
        A screening policy that doesn't mention any protected class can still violate the FHA if it
        <strong> disproportionately excludes</strong> a protected group. Examples HUD has acted on:
      </p>
      <ul>
        <li>Blanket bans on applicants with any criminal record — the Supreme Court (<em>Texas Dept. of
        Housing v. Inclusive Communities</em>, 2015) and HUD guidance (2016) hold these can be unlawfully
        disparate in impact.</li>
        <li>Refusing to rent to anyone receiving public assistance, in jurisdictions where source of income
        is protected.</li>
        <li>Minimum-income requirements set higher than necessary (e.g., 5× rent) that disproportionately
        screen out single mothers.</li>
      </ul>
      <p>
        The cure isn't to drop the criterion — it's to make it individualized. A criminal-history policy that
        considers the nature and recency of the offense and gives the applicant a chance to explain is far
        more defensible than a blanket bar.
      </p>

      <h2>The three rules that catch most violations</h2>
      <p>
        If you take nothing else from this guide, take these three:
      </p>
      <ol>
        <li>
          <strong>Write your screening criteria down before you advertise the unit.</strong> Pre-committed
          criteria are evidence you're not making it up as you go.
        </li>
        <li>
          <strong>Apply the criteria identically to every applicant in the pool.</strong> If you waive a
          rule for one applicant, document why, and be ready to defend the waiver as not pretextual.
        </li>
        <li>
          <strong>Document every decision in writing.</strong> One paragraph per applicant. "Approved —
          income 3.5×, no derogatories, clean prior-landlord reference." Or "Denied — declined a credit
          check, did not provide income documents within 7 days." If a complaint is ever filed, this is the
          only thing that proves what happened.
        </li>
      </ol>

      <h2>What to do if you receive a complaint</h2>
      <p>
        HUD complaints can be filed within one year of the alleged violation. If you're notified:
      </p>
      <ol>
        <li><strong>Do not contact the complainant directly.</strong> Anything you say can be used in the
        investigation.</li>
        <li><strong>Hire a real estate attorney immediately.</strong> The FHA conciliation process can
        resolve cases for far less if you engage early; the worst outcomes come from ignoring the complaint.</li>
        <li><strong>Preserve every record.</strong> Application, screening notes, communications, lease,
        prior tenant files for the same unit. Spoliation of evidence creates an inference of guilt.</li>
        <li><strong>Engage with the investigation cooperatively.</strong> HUD investigators are not your
        enemy — non-cooperation is.</li>
      </ol>

      <h2 className="faq">FAQ</h2>
      <h3>Does the Fair Housing Act apply to small landlords?</h3>
      <p>
        Mostly yes. There's a narrow exemption ("Mrs. Murphy") for owner-occupied buildings with four or
        fewer units, and for single-family homes rented without a broker. But the exemption does not apply
        to <strong>advertising</strong> — so even an exempt landlord cannot publish a discriminatory listing.
        And state law often closes the exemption entirely. Assume the FHA applies to you.
      </p>
      <h3>Can I prefer a tenant with no children for a small unit?</h3>
      <p>
        No. Familial status is protected. You can apply lawful occupancy limits (HUD's "two-per-bedroom"
        guideline as a starting point, though it's not a bright line), but you cannot prefer adults over
        families with children. The proper question is "how many people will live in the unit?" — not "do
        you have kids?"
      </p>
      <h3>I'm a small landlord — can I refuse Section 8?</h3>
      <p>
        Depends on your state and city. Federally, there's no requirement to accept vouchers. But the list of
        jurisdictions where source-of-income is protected has grown substantially since 2018; check your
        specific city before refusing. And even where it's legal to decline, doing so blanket-style increases
        your disparate-impact risk.
      </p>
      <h3>Is AI-driven tenant screening legal under Fair Housing?</h3>
      <p>
        Yes, when the AI is configured to ignore protected-class signals and the final rental decision stays
        with a human. HUD has issued guidance on automated decision systems, and several states regulate AI
        in housing decisions. Tools like the <Link to="/tenability">Tenability™ score</Link> are
        designed to be Fair-Housing-safe by ignoring race, color, national origin, religion, sex, familial
        status, disability, age, military status, and source-of-income protections — only the four lawful
        signals are considered.
      </p>
      <h3>What's the difference between HUD and state housing agencies?</h3>
      <p>
        HUD enforces federal Fair Housing law nationwide. Many states have parallel agencies (e.g.,
        California's Civil Rights Department, New York's Division of Human Rights) that enforce both federal
        and state law. Complaints can be filed with either; state agencies often process faster.
      </p>
    </EducationArticle>
  )
}
