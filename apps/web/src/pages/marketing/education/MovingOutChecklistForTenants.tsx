import { Link } from 'react-router-dom'
import EducationArticle from '../../../components/marketing/EducationArticle'
import { useRouteSeo } from '../../../lib/useSeo'

export default function MovingOutChecklistForTenants() {
  useRouteSeo('/education/moving-out-checklist-for-tenants')

  return (
    <EducationArticle
      category="For Renters"
      title="Moving-out checklist for tenants — how to get your full deposit back"
      subtitle="Your landlord isn't required to give you the benefit of the doubt on your security deposit. This is the checklist that removes the doubt entirely."
      readMinutes={8}
      relatedLinks={[
        { to: '/deposit-check', label: 'Deposit Check — is your deduction fair?' },
        { to: '/deposit-demand', label: 'Generate a deposit demand letter' },
        { to: '/education/security-deposit-rules-for-landlords', label: 'The deposit rules your landlord has to follow' },
      ]}
    >
      <p>
        The single biggest mistake renters make when moving out is treating it like a normal cleanup day —
        empty the fridge, sweep the floors, hand back the keys, done. If you want your full deposit back,
        moving out is a documentation project, not a chores list. The good news: it takes an extra hour, and
        it puts you in a much stronger position if your landlord tries to deduct for something you don't
        think is fair.
      </p>
      <div className="callout">
        <p>
          <strong>This is general information, not legal advice.</strong> Security deposit law is set state
          by state — timelines, deduction rules, and your remedies if a landlord withholds unfairly all vary
          by where you live. When in doubt, check your state's specific tenant-rights resources.
        </p>
      </div>

      <h2>Start before you pack a single box</h2>
      <p>
        Pull out your move-in paperwork — the lease, any move-in inspection checklist you signed, and any
        photos from the day you moved in. You're about to compare "then" to "now," and you can't do that
        from memory. If you never got a move-in checklist or never took photos, do your best to reconstruct
        what you remember and move on — you can't fix that gap now, but everything from here forward you
        can control.
      </p>

      <h2>Give proper written notice</h2>
      <p>
        Check your lease for the required notice period before moving out — it's often 30 days, but leases
        and state law vary, so confirm your specific number rather than assuming. Give notice in writing
        (email counts, and creates a timestamp), not just a verbal heads-up in passing.
      </p>

      <h2>The room-by-room walkthrough</h2>
      <p>
        Go through every space the same way an inspector would, and take photos and short videos as you go:
      </p>
      <ul>
        <li><strong>Kitchen</strong> — inside the fridge and oven, under the sink, stovetop and hood,
        cabinets emptied</li>
        <li><strong>Bathrooms</strong> — tub/shower, toilet, sink, mirror, floor</li>
        <li><strong>Bedrooms and living areas</strong> — walls, floors or carpet, closets, windows and
        blinds</li>
        <li><strong>Doors, locks, and light fixtures</strong> — everything opens, closes, and lights up</li>
        <li><strong>Smoke and CO detectors</strong> — present and not disabled</li>
        <li><strong>Any area you personally modified</strong> — nail holes from art, a shelf you mounted, a
        smart-home device you installed — note what you removed and what remains</li>
      </ul>

      <h2>What makes your photos actually useful</h2>
      <ul>
        <li><strong>Take them the same day you move out</strong> — not a week before, when you might still
        change something.</li>
        <li><strong>Keep the phone's date stamp intact.</strong> Don't screenshot or forward photos in a way
        that strips the metadata — email them to yourself or upload them somewhere that preserves it.</li>
        <li><strong>Wide shots and close-ups.</strong> A wide shot proves which room; a close-up proves the
        specific condition of a surface.</li>
        <li><strong>Every room, even the ones that were never an issue.</strong> The room you skip is the
        one that becomes a dispute.</li>
      </ul>

      <h2>Clean, but don't over-clean the wrong things</h2>
      <p>
        You're generally responsible for returning the unit reasonably clean — but not for erasing every
        trace that a human being lived there for a year. Ordinary wear from normal living isn't something a
        landlord can charge you for; genuine damage or excessive filth generally is. A useful gut check:
        would this bother a new tenant moving in, or is it just the kind of light wear that any lived-in
        space has?
      </p>
      <p>
        Focus your cleaning energy on the kitchen and bathrooms — grease buildup, soap scum, and food residue
        are the items most likely to get flagged, and they're also the fastest to fix with an afternoon of
        real cleaning.
      </p>

      <h2>Request a walkthrough with your landlord</h2>
      <p>
        If your landlord is willing to walk the unit with you before you hand back the keys, take them up on
        it. Seeing an issue together, in person, resolves more disputes on the spot than any amount of
        photo evidence after the fact — you can point at something and either agree it's pre-existing wear
        or fix it right then. If a joint walkthrough isn't offered, ask for one.
      </p>

      <h2>Provide a forwarding address</h2>
      <p>
        Your landlord generally can't return your deposit — or the itemized statement of any deductions — if
        they don't know where to send it. Give a forwarding address in writing when you give notice, not as
        an afterthought on move-out day.
      </p>

      <h2>Know your state's timeline</h2>
      <p>
        Most states require landlords to return your deposit, along with a written itemized list of any
        deductions, within a set number of days after you move out — the specific window varies by state,
        commonly somewhere between two weeks and two months. If your landlord blows past that deadline
        without a word, that's often a violation in itself, separate from any dispute over the amount
        withheld. Check your specific state's rule so you know your own deadline to expect.
      </p>

      <h2>If a deduction shows up that you don't think is fair</h2>
      <ol>
        <li>Compare the itemized statement against your move-out photos, and your move-in photos if you
        have them.</li>
        <li>Write back promptly, in writing, listing specifically which deductions you're disputing and
        why — reference your photos.</li>
        <li>
          Use our free{' '}
          <Link to="/deposit-check">Deposit Check tool</Link> to get a plain read on which deductions look
          fair, questionable, or unfair based on what your landlord sent you.
        </li>
        <li>
          If your landlord doesn't respond or won't budge, our{' '}
          <Link to="/deposit-demand">deposit demand letter generator</Link> creates a print-ready formal
          demand, prefilled from your lease details.
        </li>
        <li>
          Small-claims court is designed to be usable without a lawyer, and it's the standard next step if a
          written demand doesn't resolve things. Bring your photos, your lease, and your written
          correspondence.
        </li>
      </ol>

      <h2>The one-page version</h2>
      <ol>
        <li>Give written notice with a forwarding address, on time per your lease.</li>
        <li>Compare current condition to your move-in photos before you touch anything.</li>
        <li>Photograph and video every room, same day as move-out, metadata intact.</li>
        <li>Clean — focus on kitchen and bathrooms — but don't panic-scrub normal wear.</li>
        <li>Request a joint walkthrough if your landlord offers one.</li>
        <li>Know your state's return deadline, and follow up in writing if it's missed.</li>
        <li>If a deduction looks wrong, dispute it in writing with your photos attached.</li>
      </ol>

      <h2 className="faq">FAQ</h2>
      <h3>Can my landlord charge me for normal wear and tear?</h3>
      <p>
        Generally no. Faded paint, minor scuffs, worn carpet from years of normal foot traffic, and small
        nail holes from hanging pictures are typically considered normal wear and tear, not damage. Actual
        damage — stains, holes, broken fixtures — is a different category and is generally deductible.
      </p>
      <h3>What if I never got a move-in checklist?</h3>
      <p>
        It makes disputes harder to win, but it's not fatal — any photos, texts, or emails from around your
        move-in date that show the unit's condition can help. Going forward, always ask for (or create your
        own) documented move-in condition report, even if your landlord doesn't offer one.
      </p>
      <h3>How long do I have to dispute a deduction?</h3>
      <p>
        There's no universal deadline for sending a written dispute, but don't wait — respond as soon as you
        receive the itemized statement, while your photos and memory of the unit's condition are freshest.
        If it ends up in small-claims court, your state's statute of limitations for that kind of claim
        applies; check your state's specific window.
      </p>
      <h3>Can my landlord keep the deposit for routine cleaning?</h3>
      <p>
        Charging for cleaning needed to bring the unit back to a reasonably clean, move-in-ready condition
        is generally allowed. Charging a flat "cleaning fee" regardless of actual condition, or charging for
        cleaning beyond what's needed to reach that standard, is generally not — but the specifics depend on
        your state and your lease.
      </p>
    </EducationArticle>
  )
}
