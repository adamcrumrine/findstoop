import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'
import { BRAND } from '../../../lib/brand'

export default function HowToCollectRentOnline() {
  useRouteSeo('/education/how-to-collect-rent-online')

  return (
    <EducationArticle
      category="Operations"
      title="How to collect rent online — a landlord's guide to ACH, cards, and checks"
      subtitle="Cash and paper checks still work. Online collection is faster to reconcile, easier to prove in a dispute, and cuts out a monthly trip to the bank. Here's how to actually set it up."
      readMinutes={9}
      relatedLinks={[
        { to: '/education/lease-renewal-guide', label: 'Lease renewal — how and when to renew' },
        { to: '/education/move-in-checklist-guide', label: 'Move-in / move-out checklists for landlords' },
        { to: '/features', label: `See every ${BRAND.name} feature` },
      ]}
    >
      <p>
        Rent collection is the one task that happens every single month, for every single lease, for as
        long as you're a landlord. Small inefficiencies here compound — a missed check, a bounced payment
        you don't discover for a week, a tenant who "mailed it" and you have no way to verify. Moving
        collection online doesn't eliminate every problem, but it removes most of the friction and gives
        you a record you can actually point to when something goes wrong.
      </p>

      <h2>The payment methods, compared</h2>
      <p>
        Every rent-collection method trades off cost, speed, and how much of a paper trail it leaves.
      </p>
      <ul>
        <li>
          <strong>Cash.</strong> No fees, but no paper trail unless you write a receipt every time, and it's
          the hardest method to prove in a dispute — "I paid you in cash" versus "no you didn't" is not a
          fight you want to be in.
        </li>
        <li>
          <strong>Paper check.</strong> Leaves a bank record, but takes days to clear, can bounce after
          you've already counted it as paid, and requires a trip to deposit it unless your bank offers
          remote deposit.
        </li>
        <li>
          <strong>Money order or cashier's check.</strong> Removes the bounce risk of a personal check, but
          costs the tenant a fee at the issuing bank or post office and still requires physical handling.
        </li>
        <li>
          <strong>ACH bank transfer.</strong> Money moves directly bank-to-bank. Typically the cheapest
          electronic option — often free or near-free to the payer — though it usually takes one to a few
          business days to fully clear, and can still be reversed in narrow cases (insufficient funds,
          unauthorized transaction).
        </li>
        <li>
          <strong>Debit or credit card.</strong> Clears fastest and is easiest for the tenant to set up, but
          card networks charge a processing fee — commonly in the 2.5–3.5% range — that someone has to
          absorb. Most rent-collection platforms pass this fee to the tenant as a surcharge rather than
          eating it, since absorbing a 3%+ fee on rent-sized payments adds up fast for the landlord.
        </li>
      </ul>

      <h2>Why online collection is worth setting up</h2>
      <p>
        The case for moving off cash and paper checks isn't about looking modern — it's about the specific
        failure modes online collection removes:
      </p>
      <ul>
        <li><strong>Automatic reconciliation.</strong> The payment and the record of the payment are the
        same event — no separate step where you write down that a check cleared.</li>
        <li><strong>A timestamped record.</strong> If a payment dispute ever reaches small-claims court, "the
        system shows it cleared on the 3rd" beats "I remember him handing me an envelope."</li>
        <li><strong>Fewer missed months.</strong> Autopay removes the step where a tenant has to actively
        remember to pay — the single biggest driver of "I forgot" late payments.</li>
        <li><strong>No more bank runs.</strong> Deposits happen electronically instead of requiring you to
        physically deposit a stack of checks every month.</li>
      </ul>

      <h2>Setting it up: the practical steps</h2>
      <ol>
        <li>
          <strong>Pick a collection method or platform.</strong> At minimum you need a way to accept ACH
          transfers; card acceptance is a useful add-on for tenants who prefer it, as long as the processing
          fee is charged to whoever should bear it rather than silently eaten by you.
        </li>
        <li>
          <strong>Set the rent amount and due date in writing</strong> — in the lease, not just verbally
          agreed. This is also where you specify any grace period and late fee.
        </li>
        <li>
          <strong>Offer autopay, but don't force it.</strong> Some tenants prefer to pay manually each month
          for budgeting reasons; requiring autopay can create friction (and, depending on state, may run
          into consumer-protection rules around mandatory electronic payment). Offer it as the easy default,
          not the only option.
        </li>
        <li>
          <strong>Confirm receipt automatically.</strong> Whatever system you use, make sure both you and
          the tenant get a notification the moment a payment clears — that shared visibility prevents most
          "did you get it?" back-and-forth.
        </li>
        <li>
          <strong>Keep a record outside the platform too.</strong> Export or download payment history
          periodically. Platforms can have outages or account issues; your own copy of the record is cheap
          insurance.
        </li>
      </ol>

      <h2>Late fees and grace periods</h2>
      <p>
        Late-fee rules vary by state — some cap the dollar amount or percentage you can charge, some require
        a minimum grace period before a fee applies, and some require the fee to be disclosed in the lease
        in specific language. Check your state's rule before setting a late-fee policy, and always put the
        exact terms — grace period length, flat fee or percentage, and when it starts accruing — directly in
        the lease rather than relying on a verbal understanding.
      </p>

      <h2>What to look for if you're choosing a rent-collection tool</h2>
      <ul>
        <li><strong>Who pays the card fee.</strong> Make sure it's charged to the party you intend, not
        silently absorbed into your revenue or the tenant's rent.</li>
        <li><strong>ACH cost to the tenant.</strong> Free ACH removes the biggest reason a tenant reaches
        for a card instead.</li>
        <li><strong>Payment history you can export.</strong> You'll want this for taxes (Schedule E) and for
        any dispute, so confirm you can pull a clean CSV or PDF whenever you need one.</li>
        <li><strong>Autopay with tenant control.</strong> The tenant should be able to turn it on, adjust
        it, or turn it off without calling you.</li>
        <li><strong>A visible confirmation trail for both sides.</strong> If only the landlord sees payment
        status, disputes take longer to resolve than they should.</li>
      </ul>
      <p>
        On {BRAND.name}, ACH rent transfers are free for tenants — the landlord's flat $9/unit/month
        subscription covers it — and card payments carry a 3.5% surcharge paid by the tenant at checkout,
        disclosed before they confirm the payment. Every payment posts to a shared ledger both the landlord
        and tenant can see, with CSV export for tax season.
      </p>

      <h2 className="faq">FAQ</h2>
      <h3>Is it legal to require tenants to pay rent electronically?</h3>
      <p>
        Depends on your state — some require you to offer at least one non-electronic option (like a money
        order) even if electronic payment is your preferred default. Check your state's rule before making
        electronic payment mandatory rather than just the default.
      </p>
      <h3>What happens if an ACH payment bounces?</h3>
      <p>
        Unlike a card payment, ACH transfers can fail a few days after they appear to have cleared, if the
        tenant's account has insufficient funds. Treat an ACH payment as provisional until it fully settles,
        and have a written NSF-fee policy in the lease for when it happens.
      </p>
      <h3>Should I charge the card processing fee to the tenant or absorb it myself?</h3>
      <p>
        Most landlords pass it to the tenant as a clearly disclosed surcharge at checkout, since absorbing a
        2.5–3.5% fee on rent-sized payments every month adds up to a real cost over a year. Whichever way
        you go, disclose it up front rather than surprising the tenant at payment time.
      </p>
      <h3>Do I need to report rent payments for taxes?</h3>
      <p>
        Rental income is reportable regardless of how it's collected. A digital payment history makes
        totaling the year's income for Schedule E far simpler than reconstructing it from a stack of
        deposited checks.
      </p>
    </EducationArticle>
  )
}
