// Fair Housing Statement — required posting for any platform that lists
// rental properties or matches tenants to landlords in the US. Covers the
// federal Fair Housing Act and incorporates the protected classes added
// by major state and local laws.

import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { useSeo } from '../../lib/useSeo'

export default function FairHousing() {
  useSeo({
    title: 'Fair Housing Statement',
    description: 'FindStoop is committed to equal housing opportunity. We comply with the federal Fair Housing Act and applicable state and local fair-housing laws.',
    path: '/fair-housing',
  })

  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      <Link to="/" className="text-sm text-brand-600 hover:underline">← FindStoop</Link>

      <div className="flex items-center gap-3 mt-4">
        <div className="w-12 h-12 rounded-lg bg-brand-50 inline-flex items-center justify-center text-brand-700">
          <Home className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-bold text-ink">Fair Housing Statement</h1>
      </div>

      <p className="text-sm text-mute mt-3">Effective May 23, 2026.</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-ink">

        <Sec title="Equal Housing Opportunity">
          FindStoop is committed to the principle of equal housing opportunity. We do not discriminate, and we do not
          permit our users to discriminate, in the sale, rental, financing, or advertising of housing on the basis of
          race, color, religion, sex, national origin, familial status, disability, or any other class protected by
          federal, state, or local law.
        </Sec>

        <Sec title="Federal Fair Housing Act">
          <p>
            FindStoop is a fair housing advocate. The federal Fair Housing Act (42 U.S.C. §§ 3601–3619) prohibits
            discrimination in housing-related transactions on the basis of:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Race</li>
            <li>Color</li>
            <li>National origin</li>
            <li>Religion</li>
            <li>Sex (including gender identity and sexual orientation, per HUD's 2021 implementation of Bostock)</li>
            <li>Familial status (the presence of children under 18, pregnancy, or pending adoption)</li>
            <li>Disability</li>
          </ul>
          <p className="mt-2">
            Many state and local jurisdictions extend these protections further. Examples include source of income (Section 8
            vouchers, public assistance), age, ancestry, citizenship status, military or veteran status, marital status,
            criminal history (HUD guidance under disparate impact), and others. <strong>FindStoop expects landlords using
            the platform to comply with the broadest applicable set of protections.</strong>
          </p>
        </Sec>

        <Sec title="What this means for landlords using FindStoop">
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li>You may not refuse to rent, set different terms, or advertise differently based on any protected class.</li>
            <li>You may not steer applicants toward or away from particular properties based on protected characteristics.</li>
            <li>You may not ask questions on the application that elicit protected-class information.</li>
            <li>Screening criteria must be applied consistently to every applicant. Using disparate criteria, or applying
              the same criteria selectively, is unlawful.</li>
            <li>Our AI rentability scoring is explicitly configured to exclude protected-class signals. You — the landlord —
              are responsible for the final rental decision and for documenting non-discriminatory reasons for any denial.</li>
          </ul>
        </Sec>

        <Sec title="What this means for renters using FindStoop">
          <p>
            You have the right to be free from housing discrimination. If you believe a landlord, listing, or application
            process on FindStoop discriminated against you on the basis of a protected class:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>File a complaint with HUD</strong> at <a href="https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">hud.gov/fair_housing_equal_opp</a>, or call 1-800-669-9777.</li>
            <li><strong>Contact your state attorney general</strong>, civil-rights commission, or a local fair-housing organization (NFHA: 202-898-1661).</li>
            <li><strong>Report the listing or landlord to FindStoop</strong> at <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a> with subject "Fair Housing Concern" so we can investigate and, where warranted, suspend the landlord's account.</li>
          </ul>
        </Sec>

        <Sec title="Reasonable accommodations + modifications">
          The Fair Housing Act requires landlords to allow reasonable accommodations and modifications for applicants and
          tenants with disabilities. If you need an accommodation in the application or screening process — including, for
          example, an alternative format for documents, additional time to provide income verification, or assistance with
          uploads — contact <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a>{' '}
          and we will work with you.
        </Sec>

        <Sec title="Source-of-income protections">
          A growing number of states, counties, and cities prohibit discrimination based on lawful source of income — including
          Housing Choice (Section 8) vouchers, Social Security benefits, child support, alimony, and disability income.
          Landlords using FindStoop are responsible for knowing and complying with any source-of-income protections in
          their jurisdiction. FindStoop's screening tools accept and consider all lawful income sources equally.
        </Sec>

        <Sec title="HUD complaint contact">
          <p>
            U.S. Department of Housing and Urban Development<br />
            Office of Fair Housing and Equal Opportunity<br />
            451 7th Street SW, Room 5204<br />
            Washington, DC 20410-2000<br />
            <strong>1-800-669-9777</strong> · TTY: 1-800-927-9275<br />
            <a href="https://www.hud.gov/fairhousing" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">hud.gov/fairhousing</a>
          </p>
        </Sec>
      </section>

      <p className="text-xs text-mute mt-10">
        © {new Date().getFullYear()} Hawk Pig LLC, d/b/a FindStoop.
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
