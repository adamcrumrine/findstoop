import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'
import { BRAND } from '../../../lib/brand'

export default function SecurityDepositRules() {
  useRouteSeo('/education/security-deposit-rules-for-landlords')

  return (
    <EducationArticle
      category="Compliance"
      title="Security deposit rules for landlords — limits, timelines, and itemized deductions"
      subtitle="How much you can charge, what you can deduct, and how fast you have to give the rest back. A national overview, with a highlighted section on Ohio's specific rules."
      readMinutes={10}
      relatedLinks={[
        { to: '/education/move-in-checklist-guide', label: 'Move-in / move-out checklists — the deposit-saving guide' },
        { to: '/education/rental-application-process', label: 'The rental application process, step by step' },
        { to: '/education/lease-renewal-guide', label: 'Lease renewal — how and when to renew' },
      ]}
    >
      <p>
        A security deposit is the most disputed sum of money in the landlord-tenant relationship. It's
        small enough that the tenant fights for every dollar and large enough that the landlord wants to
        use it. Most disputes come down to the same three questions: how much did you charge, what did you
        deduct, and did you meet the deadline.
      </p>
      <p>
        Every state handles deposits a little differently, so this guide sticks to the patterns that hold
        true almost everywhere, then drills into the state we know best — Ohio.
      </p>
      <div className="callout">
        <p>
          <strong>This is not legal advice.</strong> Security deposit law is set state by state, and some
          cities layer on their own rules. Confirm the current statute for your property's location before
          you set a deposit policy or send a deduction letter.
        </p>
      </div>

      <h2>How much can you charge?</h2>
      <p>
        There's no single national rule. Some states cap the deposit at a fixed multiple of monthly rent —
        commonly one or two months. Other states, Ohio among them, set no statutory ceiling at all, which
        means the market (and what a tenant will actually agree to sign) does the capping instead. Before
        you set your number, check whether your state caps it — charging over a legal limit can force you
        to return the excess and, in some states, pay a penalty on top.
      </p>
      <p>
        A useful default even where there's no legal cap: one month's rent for a strong applicant, up to one
        and a half or two months for a marginal one (where that's legally allowed), rather than a flat
        policy that ignores risk entirely.
      </p>

      <h2>What you can deduct</h2>
      <p>
        Nearly every state uses some version of the same standard: you can deduct for damage beyond
        <strong> normal wear and tear</strong>, unpaid rent, and unpaid utility bills the tenant was
        responsible for. You generally cannot deduct for the ordinary effects of someone having lived in
        the unit.
      </p>
      <ul>
        <li><strong>Usually deductible</strong> — carpet stains from spills or pets, holes in walls beyond
        a few small nail holes, broken fixtures, excessive cleaning to remove filth, unpaid rent or fees
        specified in the lease.</li>
        <li><strong>Usually NOT deductible</strong> — faded paint, minor scuffs, worn carpet from years of
        normal foot traffic, small nail holes from hanging pictures, routine cleaning between tenants.</li>
      </ul>
      <p>
        The dividing line is whether a reasonable person would call it damage or just call it living there.
        When you're unsure which side of the line an item falls on, document it with photos and let the
        tenant weigh in before you finalize the deduction — a documented disagreement is far cheaper than a
        small-claims judgment.
      </p>

      <h2>Itemizing the deduction</h2>
      <p>
        Almost every state requires a written, itemized statement of deductions — not a lump-sum "$400
        withheld for damage." Line by line, with a dollar amount for each item, is the standard that holds
        up:
      </p>
      <ol>
        <li>Describe the specific damage or unpaid charge</li>
        <li>State the dollar amount attributed to it</li>
        <li>Attach a receipt or invoice where you can, especially for anything above a modest threshold</li>
        <li>Send the itemized statement together with any remaining balance of the deposit</li>
      </ol>
      <p>
        Photos from your move-in and move-out inspections are what make each line defensible. Without them,
        an itemized list is still just your word against the tenant's.
      </p>

      <h2>How fast you have to return it</h2>
      <p>
        Return windows vary by state — some are as short as two weeks, others run to 30 or 60 days. What's
        consistent is that missing the window is expensive: many states impose penalties for late or
        non-itemized returns that go well beyond the deposit amount itself, sometimes doubling or tripling
        it. Set a calendar reminder the day the tenant moves out; don't rely on remembering the deadline
        weeks later.
      </p>

      <div className="callout">
        <p>
          <strong>Ohio specifics.</strong> Under Ohio Revised Code § 5321.16, a landlord has 30 days after
          the tenancy ends and the tenant vacates to return the deposit balance along with an itemized list
          of any deductions. Ohio sets no statutory cap on how much you can charge. If the tenancy runs six
          months or longer, deposits over $50 or one month's rent (whichever is greater) accrue 5% annual
          interest, payable to the tenant. And if a landlord withholds a deposit in bad faith without cause,
          the tenant can recover the wrongfully withheld amount doubled, plus reasonable attorney fees.
        </p>
      </div>

      <h2>Where deposit disputes actually happen</h2>
      <p>
        In practice, the same handful of fights repeat across small-claims dockets:
      </p>
      <ul>
        <li><strong>"It was already like that."</strong> Solved entirely by a signed, photographed move-in
        checklist. See our{' '}
        <Link to="/education/move-in-checklist-guide">move-in / move-out checklist guide</Link> for the
        full walkthrough.</li>
        <li><strong>"You never sent an itemized list."</strong> A verbal explanation or a text message
        doesn't satisfy most states' written-itemization requirement. Put it in writing, every time.</li>
        <li><strong>"You missed the deadline."</strong> The most avoidable dispute on this list — track the
        move-out date and count forward immediately.</li>
        <li><strong>"That's normal wear and tear."</strong> Usually a genuine disagreement rather than bad
        faith on either side. Photos from both ends of the tenancy resolve it fastest.</li>
      </ul>

      <h2>A simple deposit policy that holds up</h2>
      <ol>
        <li>Set the deposit amount in writing in the lease, within any legal cap that applies.</li>
        <li>Do a documented, photographed move-in inspection with the tenant present.</li>
        <li>Do the same at move-out, ideally with the tenant there to see it.</li>
        <li>Compare the two, and only deduct for the difference that qualifies as damage.</li>
        <li>Send an itemized statement and any remaining balance inside your state's deadline.</li>
        <li>Keep every photo, receipt, and communication for at least a year past the tenancy.</li>
      </ol>

      <h2 className="faq">FAQ</h2>
      <h3>Can I charge a nonrefundable deposit?</h3>
      <p>
        In many states, a fee labeled "deposit" has to be refundable by law regardless of what you call it —
        some states do allow separate, clearly-labeled nonrefundable fees (like a pet fee or cleaning fee)
        as a distinct line item. Check your state's definition before you write "nonrefundable deposit"
        into a lease; the label alone doesn't control the legal outcome.
      </p>
      <h3>Can I use the deposit for the last month's rent?</h3>
      <p>
        Only if your lease and your state allow applying it that way, and generally only with the tenant's
        agreement. Using it unilaterally to cover the final month, then having nothing left to cover
        move-out damage, is a common way landlords end up unable to collect for real damage.
      </p>
      <h3>What if the damage costs more than the deposit?</h3>
      <p>
        You can pursue the tenant for the difference — typically in small-claims court, where the process is
        designed to be manageable without an attorney. Your itemized statement and your photographic record
        are the evidence that determines whether you win.
      </p>
      <h3>Does a security deposit need to be held in a separate account?</h3>
      <p>
        Some states require deposits to be held in a separate, sometimes interest-bearing, account and
        prohibit landlords from commingling deposit funds with personal or operating funds. Others don't
        specify. Check your state's rule — commingling in a state that prohibits it can itself trigger
        penalties, independent of any dispute over the deduction.
      </p>
      <h3>Does {BRAND.name} handle security deposits?</h3>
      <p>
        {BRAND.name} tracks the deposit amount per lease, stores the move-in and move-out inspection photos
        in one place, and generates an itemized deduction statement you can send straight to the tenant —
        so the paper trail this guide describes is already built when the tenancy ends.
      </p>
    </EducationArticle>
  )
}
