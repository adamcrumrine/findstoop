// Accessibility Statement — voluntary ADA / WCAG 2.1 commitment + report-an-issue
// process. Standard for any commercial website operating in the US after the
// 2024 DOJ Title II rule extension to web/app content.

import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import { BRAND } from '../../lib/brand'

export default function Accessibility() {
  useSeo({
    title: 'Accessibility Statement',
    description: `${BRAND.name}'s commitment to accessible design, the standards we follow, known limitations, and how to report accessibility barriers.`,
    path: '/accessibility',
  })

  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      <Link to="/" className="text-sm text-brand-600 hover:underline">← {BRAND.name}</Link>
      <h1 className="text-2xl font-bold text-ink mt-4">Accessibility Statement</h1>
      <p className="text-sm text-mute mt-2">Effective May 23, 2026.</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-ink">

        <Sec title="Our commitment">
          {BRAND.legalName} is built to be usable by as many people as possible, including people with disabilities. We aim to
          conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA, the de-facto standard referenced by
          the U.S. Department of Justice in connection with the Americans with Disabilities Act (ADA).
        </Sec>

        <Sec title="What we've built in">
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li>Keyboard navigation across all interactive elements (forms, modals, navigation)</li>
            <li>Visible focus indicators on all focusable controls</li>
            <li>Semantic HTML — proper headings, landmark regions, lists, and form labels</li>
            <li>Color contrast meeting WCAG AA on body text and primary interactive elements</li>
            <li>Alt text on meaningful images; decorative images marked appropriately</li>
            <li>Screen-reader–compatible form labels and error messages</li>
            <li>Resizable text up to 200% without loss of functionality</li>
            <li>Responsive layout that adapts to mobile, tablet, and desktop</li>
            <li>No flashing or strobing content</li>
          </ul>
        </Sec>

        <Sec title="Known limitations">
          <p>We're working on full WCAG 2.1 AA conformance. Known gaps as of the date above:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>The lease PDF preview is image-based in some views; the underlying HTML lease is screen-reader accessible</li>
            <li>Some third-party embedded forms (Stripe payment element) follow Stripe's accessibility standards rather than ours</li>
            <li>Decorative illustrations on marketing pages have minimal alt text — they don't carry information needed to use the Service</li>
          </ul>
        </Sec>

        <Sec title="Reasonable accommodations">
          If you need an accommodation to use {BRAND.name} — whether that's a different file format for a document, help with
          uploads, additional time to complete a screening, or anything else — please email{' '}
          <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a> and
          we'll work with you. We aim to respond within two business days.
        </Sec>

        <Sec title="Reporting accessibility barriers">
          <p>
            If you encounter content or a feature that's hard to use because of a disability, please tell us so we can fix
            it. Email <a href={`mailto:${BRAND.supportEmail}`} className="text-brand-600 hover:underline">{BRAND.supportEmail}</a>{' '}
            with subject line "Accessibility Issue" and include:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>The page or feature where you ran into the problem</li>
            <li>A description of what didn't work</li>
            <li>The assistive technology you were using, if any (screen reader, voice control, etc.)</li>
            <li>The device and browser</li>
          </ul>
          <p className="mt-2">We treat accessibility reports as a high priority and aim to acknowledge within two business days.</p>
        </Sec>

        <Sec title="Third-party content">
          {BRAND.legalName} relies on several third-party services (Supabase, Stripe, Anthropic, Twilio, Resend) whose
          accessibility we don't control. These vendors are mainstream platforms with their own accessibility commitments,
          but if you encounter a barrier within their components on {BRAND.name}, please report it to us and we'll
          coordinate with the vendor.
        </Sec>
      </section>

      <p className="text-xs text-mute mt-10">
        © {new Date().getFullYear()} {BRAND.legalName}.
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
