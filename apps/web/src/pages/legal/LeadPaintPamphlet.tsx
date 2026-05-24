// EPA / HUD lead-based paint pamphlet — "Protect Your Family from Lead in
// Your Home." Federal law (24 CFR 35.92) requires landlords of pre-1978
// housing to give tenants this EPA pamphlet AND a separate disclosure form
// before the lease is signed.
//
// We summarize the official EPA pamphlet content. The pamphlet is required
// reading; the separate disclosure (signed) lives at /legal/lead-disclosure/:leaseId.

import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, ExternalLink } from 'lucide-react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'

export default function LeadPaintPamphlet() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const back = profile?.role === 'tenant' ? '/tenant/documents'
             : profile?.role === 'manager' ? '/manager/documents'
             : '/'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="lease-pdf-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="lease-pdf-paper max-w-4xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none p-10 print:p-0">
        <header className="text-center border-b border-gray-300 pb-6 mb-8">
          <p className="text-xs uppercase tracking-widest text-mute">U.S. EPA · U.S. CPSC · U.S. HUD</p>
          <h1 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
            Protect Your Family From Lead in Your Home
          </h1>
          <p className="mt-2 text-sm text-mute italic">Required disclosure under 42 U.S.C. § 4852d (Residential Lead-Based Paint Hazard Reduction Act, 1992)</p>
        </header>

        <section className="prose prose-sm max-w-none space-y-4" style={{ fontFamily: 'Georgia, serif' }}>
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-sm font-semibold">
              If you live in housing built before 1978, you have important legal rights — and there may be lead in
              your home that could harm your children.
            </p>
          </div>

          <h2 className="text-lg font-semibold mt-6">Why is lead a problem?</h2>
          <p>
            Lead exposure can cause permanent damage — especially to children under six and pregnant women.
            Lead can affect almost every system in the body. Children's bodies absorb more lead than adults
            and their nervous systems are still developing.
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>In children:</strong> nervous-system damage, learning disabilities, slowed growth, hearing problems, behavior issues</li>
            <li><strong>In adults:</strong> reproductive problems, high blood pressure, nerve disorders, memory and concentration issues, muscle and joint pain</li>
            <li><strong>In pregnant women:</strong> harm to the developing fetus</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">Where does lead come from?</h2>
          <p>
            Most lead in homes comes from <strong>lead-based paint</strong>. The federal government banned lead-based paint
            from housing in 1978. About <strong>87% of homes built before 1940</strong>, <strong>69% built between 1940 and 1959</strong>,
            and <strong>24% built between 1960 and 1977</strong> contain some lead-based paint.
          </p>
          <p>
            Lead-based paint is most dangerous when it is <strong>peeling, chipping, chalking, or cracking</strong>, or
            when it is on surfaces children chew on (window sills, railings). The dust created when lead paint is
            disturbed — by renovation, repairs, normal wear, or friction — is the most common source of exposure.
          </p>

          <h2 className="text-lg font-semibold mt-6">Where to look</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Window frames and sills (rubbed by opening/closing)</li>
            <li>Doors and door frames</li>
            <li>Stairs, railings, banisters, porches, fences</li>
            <li>Old painted toys and furniture</li>
            <li>Imported pottery, food cans, and folk remedies</li>
            <li>Soil around old homes (from exterior paint or past gasoline use)</li>
            <li>Drinking water in homes with old plumbing</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">What can you do?</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Keep paint surfaces in good condition. Report peeling or chipping paint to your landlord.</li>
            <li>Clean floors, window frames, and other surfaces weekly with a wet mop and warm water.</li>
            <li>Wash children's hands, bottles, pacifiers, and toys often.</li>
            <li>Keep children from chewing on window sills or other painted surfaces.</li>
            <li>Clean dust off shoes before entering the home.</li>
            <li>Eat foods high in iron and calcium — they help reduce lead absorption.</li>
            <li>Have your child's blood lead level checked at ages 1 and 2.</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6">Your rights as a tenant</h2>
          <p>
            <strong>Federal law requires landlords to:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Give you this EPA-approved pamphlet before you sign a lease for any home built before 1978.</li>
            <li>Disclose any known lead-based paint or lead-paint hazards in the home, and any available reports.</li>
            <li>Include a federally-required lead warning statement and signed acknowledgment in your lease.</li>
            <li>Give you 10 days (unless you waive the period in writing) to have the home inspected for lead at your own expense.</li>
          </ul>
          <p className="mt-2">
            If you believe your landlord has not complied, contact the <strong>EPA National Lead Information Center</strong> at
            <span className="font-mono mx-1">1-800-424-LEAD (5323)</span> or the <strong>HUD Office of Lead Hazard Control</strong>.
          </p>

          <h2 className="text-lg font-semibold mt-6">Lead testing</h2>
          <p>
            You can find a certified lead inspector or risk assessor at <span className="font-mono">epa.gov/lead</span>.
            Most inspections cost between $300 and $500. If you have children under 6 and you live in pre-1978 housing,
            consider getting their blood lead levels tested — many state and county health departments offer free or
            low-cost testing.
          </p>

          <h2 className="text-lg font-semibold mt-6">For more information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              EPA full pamphlet (PDF):{' '}
              <a
                href="https://www.epa.gov/sites/default/files/2020-10/documents/lead-in-your-home-portrait-color-2020-508.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline inline-flex items-center gap-1"
              >
                epa.gov/lead
                <ExternalLink className="w-3 h-3" strokeWidth={2} />
              </a>
            </li>
            <li>National Lead Information Center: <span className="font-mono">1-800-424-LEAD (5323)</span></li>
            <li>CDC Lead Information: <span className="font-mono">cdc.gov/nceh/lead</span></li>
          </ul>
        </section>

        <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-mute text-center">
          <p>This summary is provided by FindStoop based on the official EPA / HUD / CPSC pamphlet. For the canonical document, see <span className="font-mono">epa.gov/lead</span>.</p>
          <p className="mt-2"><Link to={back} className="text-brand-700 hover:underline">Return to documents</Link></p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .lease-pdf-toolbar { display: none !important; }
          .lease-pdf-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}
