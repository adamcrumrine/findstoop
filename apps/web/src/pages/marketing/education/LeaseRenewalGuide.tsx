import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'
import { BRAND } from '../../../lib/brand'

export default function LeaseRenewalGuide() {
  useRouteSeo('/education/lease-renewal-guide')

  return (
    <EducationArticle
      category="Operations"
      title="Lease renewal — how and when to renew a tenant"
      subtitle="A good tenant renewing is the cheapest win in property management — no vacancy, no turnover cost, no new screening. Here's how to run the renewal conversation and decide when NOT to renew."
      readMinutes={8}
      relatedLinks={[
        { to: '/education/month-to-month-vs-fixed-term-lease', label: 'Month-to-month vs. fixed-term leases' },
        { to: '/education/rental-application-process', label: 'The rental application process, step by step' },
        { to: '/education/how-to-collect-rent-online', label: 'How to collect rent online' },
      ]}
    >
      <p>
        Turnover is expensive. Between the vacancy days, the cleaning and touch-up, the new listing, the new
        screening, and the risk that the next tenant is worse than the one who just left, replacing a
        decent tenant usually costs more than a modest rent increase would have earned you. That math is
        why renewal — not re-listing — should be the default plan for any tenant who's paid on time and
        taken care of the unit.
      </p>

      <h2>When to start the renewal conversation</h2>
      <p>
        Start earlier than feels necessary — 60 to 90 days before the lease ends is a reasonable target for
        most fixed-term leases. That gives both sides time to negotiate a rent adjustment, gives you a
        real runway to re-list if the tenant declines, and avoids the scramble of a last-minute vacancy.
      </p>
      <p>
        Many states also require a minimum notice period before you can decline to renew or change the
        terms of a tenancy, particularly for month-to-month arrangements — commonly somewhere in the range
        of 30 to 60 days, though the exact requirement varies by state and sometimes by how long the tenant
        has lived there. Check your state's specific notice requirement before you set your own timeline.
      </p>

      <h2>Deciding whether to renew</h2>
      <p>
        Run through a short checklist before you offer renewal:
      </p>
      <ul>
        <li><strong>Payment history</strong> — on time, consistently? A tenant who's late occasionally but
        always pays is a different risk than one who's chronically late.</li>
        <li><strong>Unit condition</strong> — normal wear, or signs of neglect that suggest bigger problems
        ahead?</li>
        <li><strong>Communication</strong> — do maintenance requests and lease questions go smoothly, or is
        every interaction a fight?</li>
        <li><strong>Neighbor and lease compliance</strong> — any complaints, unauthorized occupants, or
        unauthorized pets?</li>
      </ul>
      <p>
        If the answers are mostly good, renew. A tenant with a minor blemish (one late payment in a year,
        say) is usually still a better bet than an unknown new applicant.
      </p>

      <h2>Setting the renewal rent</h2>
      <p>
        A modest, predictable increase retains good tenants better than either extreme. Raising rent to
        aggressively chase market rate on every renewal pushes good tenants to start looking elsewhere —
        and the turnover cost you incur finding a replacement often exceeds the extra rent you'd have
        collected. Freezing rent indefinitely, on the other hand, leaves money on the table and makes a
        future correction feel like a shock to the tenant.
      </p>
      <p>
        A common approach: benchmark against comparable listings nearby, then land somewhere between "no
        increase" and "full market rate" — enough to track rising costs, not so much that the tenant starts
        comparison-shopping. Some states and cities cap how much or how often you can raise rent; check
        local rules before finalizing the number.
      </p>
      <p>
        Whatever the number, put it in writing with enough notice for the tenant to plan around it. A
        rent-increase notice sprung with two weeks' warning creates unnecessary friction even where it's
        legally allowed.
      </p>

      <h2>Fixed-term renewal vs. rolling to month-to-month</h2>
      <p>
        At renewal, you generally have two options: sign a new fixed-term lease, or let the tenancy roll to
        month-to-month (either because the lease says so by default, or because you offer it explicitly).
        Our <Link to="/education/month-to-month-vs-fixed-term-lease">month-to-month vs. fixed-term guide</Link>
        {' '}covers the tradeoffs in depth — in short, a new fixed term locks in predictable income and
        reduces near-term turnover risk, while month-to-month gives both sides more flexibility at the cost
        of that predictability.
      </p>

      <h2>Putting the renewal in writing</h2>
      <p>
        However you decide to structure it, get the terms in writing and signed by both parties — a lease
        addendum, a renewal letter, or an entirely new lease. Verbal agreements to renew ("yeah, let's just
        keep going") create ambiguity about the rent amount, the term length, and whether the old lease's
        terms still apply. Electronic signatures are legally valid for this in every state under the
        federal ESIGN Act.
      </p>

      <h2>When NOT to renew</h2>
      <p>
        Declining to renew is sometimes the right call, and you're generally allowed to simply not renew a
        fixed-term lease when it ends, without stating a reason — subject to your state's notice
        requirements and to the Fair Housing Act's prohibition on discriminatory reasons. Common legitimate
        reasons include:
      </p>
      <ul>
        <li>Chronic late payment, even if never severe enough to trigger eviction</li>
        <li>Repeated lease violations (unauthorized pets, unauthorized occupants, noise complaints)</li>
        <li>Plans to sell, renovate, or move a family member into the unit</li>
      </ul>
      <p>
        Whatever the reason, give the legally required notice in writing, and never let the actual reason
        be — even partly — one of the classes protected under the{' '}
        <Link to="/education/fair-housing-act-guide">Fair Housing Act</Link>.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>Can I raise the rent by any amount at renewal?</h3>
      <p>
        Outside of jurisdictions with rent-control or rent-stabilization rules, most states don't cap the
        percentage increase at renewal — but you still have to give proper notice, and an increase so large
        it functions as a de facto non-renewal can draw scrutiny. Check your state and city before setting
        the number.
      </p>
      <h3>What if the tenant wants to renew but I don't respond in time?</h3>
      <p>
        Depends on your lease and your state — some leases auto-renew or convert to month-to-month by
        default if neither party acts by a deadline written into the lease. Read your own lease's renewal
        clause; it may bind you even if you meant to let it lapse.
      </p>
      <h3>Should I run a new credit check at renewal?</h3>
      <p>
        Usually not necessary for a tenant with a clean payment history — you already have a year or more
        of real payment data, which is more predictive than a credit pull. It's more useful when you're
        adding a new occupant to the lease or restructuring the terms significantly.
      </p>
      <h3>Can I add new lease terms at renewal that weren't in the original lease?</h3>
      <p>
        Yes, with the tenant's agreement — renewal is a new contract, not an extension of the old one
        unless you frame it that way. Flag any material changes clearly rather than burying them in a long
        renewal document; a tenant who feels ambushed by a new term is a tenant who starts looking
        elsewhere.
      </p>
      <h3>How does {BRAND.name} help with renewals?</h3>
      <p>
        {BRAND.name} tracks each lease's end date and flags upcoming renewals so they don't sneak up on you,
        and lets you send a renewal offer or a new lease for e-signature without re-running the full
        application process.
      </p>
    </EducationArticle>
  )
}
