import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'
import { BRAND } from '../../../lib/brand'

export default function MonthToMonthVsFixedTerm() {
  useRouteSeo('/education/month-to-month-vs-fixed-term-lease')

  return (
    <EducationArticle
      category="Operations"
      title="Month-to-month vs. fixed-term leases — how to choose"
      subtitle="Neither structure is universally better. Here's what you're actually trading off, and how to decide which one fits a given property, tenant, and season."
      readMinutes={7}
      relatedLinks={[
        { to: '/education/lease-renewal-guide', label: 'Lease renewal — how and when to renew' },
        { to: '/education/security-deposit-rules-for-landlords', label: 'Security deposit rules for landlords' },
        { to: '/education/rental-application-process', label: 'The rental application process, step by step' },
      ]}
    >
      <p>
        Every lease is, at its core, an agreement about how much certainty each side gets. A fixed-term
        lease trades flexibility for predictability. A month-to-month lease trades predictability for
        flexibility. Neither is the "correct" default — the right choice depends on the property, the
        tenant, and what you're trying to optimize for right now.
      </p>

      <h2>Fixed-term leases</h2>
      <p>
        A fixed-term lease — most commonly 12 months, sometimes 6 or 24 — locks both parties into a set
        rent and a set end date. Neither side can unilaterally change the terms or end the tenancy early
        without cause (or without triggering an early-termination clause, if the lease has one).
      </p>
      <p><strong>What you get:</strong></p>
      <ul>
        <li>Predictable income for the full term — no surprise vacancy in month four</li>
        <li>Fewer turnovers per year, which means less cleaning, less re-listing, less re-screening cost</li>
        <li>A rent amount that's locked in, which cuts both ways — you also can't raise it mid-term if the
        market moves</li>
      </ul>
      <p><strong>What you give up:</strong></p>
      <ul>
        <li>The ability to remove a mediocre-but-not-lease-violating tenant before the term ends</li>
        <li>Flexibility if your own plans change — selling the property, moving a family member in, or
        renovating</li>
      </ul>

      <h2>Month-to-month leases</h2>
      <p>
        A month-to-month tenancy renews automatically each month until either party gives notice to end it.
        Some month-to-month tenancies start that way by design; others begin as fixed-term leases that roll
        over once the term ends.
      </p>
      <p><strong>What you get:</strong></p>
      <ul>
        <li>The ability to adjust rent or end the tenancy with proper notice, without waiting for a fixed
        term to expire</li>
        <li>Flexibility if your own plans for the property might change on short notice</li>
        <li>A pricing premium in many markets — tenants who need the flexibility often accept a modest rent
        premium for it</li>
      </ul>
      <p><strong>What you give up:</strong></p>
      <ul>
        <li>Income predictability — a tenant can also give notice and leave on short notice, leaving you
        with a vacancy to fill on their timeline, not yours</li>
        <li>Lower average tenancy length, which usually means more turnovers, more re-screening, and more
        cleaning and touch-up over a given multi-year period</li>
      </ul>
      <p>
        Ending or changing a month-to-month tenancy isn't instant on either side — most states require
        written notice, typically somewhere around 30 days, though some states and cities require longer,
        especially for tenants who've lived there a long time. Check your state's specific notice
        requirement before you plan around a particular timeline.
      </p>

      <h2>How to decide</h2>
      <ul>
        <li><strong>Stable rental market, you want predictable income</strong> — lean fixed-term.</li>
        <li><strong>You might sell, renovate, or move in within the next year</strong> — lean
        month-to-month.</li>
        <li><strong>New tenant, first lease</strong> — a shorter fixed term (six months) gives you a trial
        period before committing long-term, then reassess at renewal.</li>
        <li><strong>Excellent long-tenured tenant</strong> — either works; fixed-term locks in rent
        predictability, month-to-month if they specifically want the flexibility.</li>
        <li><strong>Seasonal or transitional market</strong> (college towns, corporate relocations) — lean
        month-to-month, often at a rent premium.</li>
      </ul>

      <h2>A hybrid approach: start fixed, roll to month-to-month</h2>
      <p>
        A common pattern that captures some of both: sign a 12-month fixed-term lease for a new tenant, then
        let it roll to month-to-month at renewal for a tenant who's proven reliable. You get the
        predictability during the highest-risk period (the first year, before you know how the tenant
        actually behaves) and the flexibility later, once the relationship is established and turnover risk
        has proven low in practice.
      </p>
      <p>
        Our <Link to="/education/lease-renewal-guide">lease renewal guide</Link> covers exactly how to run
        that renewal decision when a fixed term is ending.
      </p>

      <h2>Security deposits under each structure</h2>
      <p>
        Deposit rules generally apply the same way regardless of lease structure — the amount you can
        charge, what you can deduct, and how fast you have to return it are governed by your state's law,
        not by whether the lease is fixed-term or month-to-month. See our{' '}
        <Link to="/education/security-deposit-rules-for-landlords">security deposit rules guide</Link> for
        the specifics.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>Can I convert a fixed-term lease to month-to-month mid-term?</h3>
      <p>
        Only with both parties' agreement — a fixed-term lease binds both sides until the end date unless
        the lease itself allows early modification, or both parties sign an amendment.
      </p>
      <h3>Is rent typically higher on a month-to-month lease?</h3>
      <p>
        Often, yes — landlords frequently price in a premium for the flexibility a month-to-month
        arrangement gives the tenant, and for the higher turnover risk it carries for the landlord. It's
        not universal, and depends heavily on local market conditions.
      </p>
      <h3>Does a fixed-term lease automatically become month-to-month when it ends?</h3>
      <p>
        Depends on your lease and your state. Many leases include a clause specifying what happens if
        neither party acts by the end date — commonly a rollover to month-to-month, sometimes an automatic
        renewal for another fixed term. Read your own lease's renewal clause; don't assume.
      </p>
      <h3>Which is better for a first-time landlord?</h3>
      <p>
        A 12-month fixed-term lease is usually the simpler starting point — it gives you a predictable year
        of income and a clear point to reassess, without needing to actively manage a rolling notice
        process from day one.
      </p>
      <h3>How does {BRAND.name} handle either lease type?</h3>
      <p>
        {BRAND.name}'s lease templates support both fixed-term and month-to-month structures, and the
        system tracks renewal and notice dates for whichever structure you use, so neither one becomes a
        manual calendar-tracking chore.
      </p>
    </EducationArticle>
  )
}
