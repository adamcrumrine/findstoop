// Privacy Policy — plain-English where possible. Standard SaaS coverage
// plus housing-specific data (screening docs, applicant SSN handled
// through Checkr) and AI-use disclosures.
//
// IMPORTANT: this is a working draft, not a substitute for attorney review.
// Specific state regimes (CCPA/CPRA, VCDPA, CPA, etc.) may require
// additional disclosures depending on residence of the visitor.

import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'

export default function Privacy() {
  useSeo({
    title: 'Privacy Policy',
    description: 'How FindStoop collects, uses, and protects landlord, tenant, and applicant data. What we share, what we don\'t, and your rights.',
    path: '/privacy',
  })

  return (
    <div className="max-w-2xl mx-auto py-10 px-5">
      <Link to="/" className="text-sm text-brand-600 hover:underline">← FindStoop</Link>
      <h1 className="text-2xl font-bold text-ink mt-4">Privacy Policy</h1>
      <p className="text-sm text-mute mt-2">
        Effective May 23, 2026. Questions: <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a>.
      </p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-ink">

        <Sec title="Who we are">
          FindStoop is operated by Hawk Pig LLC ("we", "us"), an Ohio limited liability company. We provide property
          management software for residential landlords and tenants. This policy explains what data we collect,
          how we use it, and the rights you have over it.
        </Sec>

        <Sec title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li><strong>Account data</strong> — name, email, phone, password (stored hashed), role (landlord/tenant/admin)</li>
            <li><strong>Property + lease data</strong> — addresses, unit details, rent amounts, lease terms, tenant assignments</li>
            <li><strong>Application + screening data</strong> — rental applications, uploaded driver's licenses, paystubs, optional selfies, AI-generated rentability summaries</li>
            <li><strong>Payment data</strong> — bank account or card details (tokenized through Stripe — we never store full numbers), payment history, surcharges</li>
            <li><strong>Communication data</strong> — in-app messages, support requests, feedback submissions</li>
            <li><strong>Device + usage data</strong> — IP address, browser type, pages viewed, clicks, session timestamps</li>
            <li><strong>Cookies + local storage</strong> — authentication tokens, session state, and (when you opt in) preference cookies</li>
          </ul>
        </Sec>

        <Sec title="How we use it">
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li>Operate the platform — let landlords list units, screen applicants, sign leases, collect rent</li>
            <li>Communicate with you — service emails, payment confirmations, maintenance updates, support replies</li>
            <li>Verify identity + income for tenant pre-qualification (automated analysis with AI)</li>
            <li>Detect fraud, abuse, and policy violations</li>
            <li>Comply with our legal obligations (taxes, subpoenas, fair housing reporting)</li>
            <li>Improve the platform — aggregated, de-identified usage analytics</li>
          </ul>
        </Sec>

        <Sec title="Who we share data with">
          <p className="mt-1">
            We never sell your personal data. We share it only with the service providers needed to run the platform,
            and only the minimum each needs to do their job:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Supabase</strong> — database hosting, authentication, file storage. SOC-2 certified.</li>
            <li><strong>Stripe</strong> — payment processing, payouts to landlords, subscription billing</li>
            <li><strong>Anthropic (Claude)</strong> — AI document analysis for screening (driver's licenses, paystubs). Documents are sent for processing only; Anthropic does not train on or retain customer data per their commercial terms.</li>
            <li><strong>Twilio</strong> — SMS messaging and two-factor authentication codes</li>
            <li><strong>Resend</strong> — transactional email delivery</li>
            <li><strong>Google Fonts</strong> — web typography</li>
            <li><strong>Consumer reporting agencies</strong> — when a landlord requests a regulated screening report, the applicant's identifying information is sent to the third-party reporting agency they choose. We do not store the report ourselves — the agency holds it under FCRA.</li>
            <li><strong>Law enforcement / regulators</strong> — only when legally required (subpoena, court order, statutory request)</li>
          </ul>
        </Sec>

        <Sec title="How long we keep it">
          <ul className="list-disc pl-5 space-y-1.5 mt-1">
            <li><strong>Account data</strong> — for as long as your account is active, plus 12 months after closure (for accounting + dispute resolution)</li>
            <li><strong>Screening uploads</strong> (driver's licenses, paystubs, selfies) — 90 days after the leasing decision, then deleted automatically</li>
            <li><strong>Lease + payment records</strong> — 7 years (IRS retention standard)</li>
            <li><strong>Communications + support tickets</strong> — 24 months</li>
            <li>You can request earlier deletion of any of the above by emailing <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a>.</li>
          </ul>
        </Sec>

        <Sec title="Use of automated tools, including artificial intelligence">
          <p className="mt-1">
            FindStoop uses automated software, including AI, to read documents (driver's licenses, paystubs), check
            for tampering, and produce a private "rentability" summary for the landlord. A human landlord — not the
            software — makes the final rental decision. Our AI is configured to ignore protected-class signals
            under the Fair Housing Act and applicable state law. If you'd like to learn more, see our{' '}
            <Link to="/screening-terms" className="text-brand-600 hover:underline">Screening Terms</Link>.
          </p>
        </Sec>

        <Sec title="Your rights">
          <p className="mt-1">You have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Access</strong> the personal data we hold about you</li>
            <li><strong>Correct</strong> inaccurate data</li>
            <li><strong>Delete</strong> data (subject to legal retention obligations for tax / lease records)</li>
            <li><strong>Port</strong> your data — receive a copy in machine-readable form</li>
            <li><strong>Object</strong> to automated decision-making (we'll route you to manual review)</li>
            <li><strong>Opt out</strong> of marketing emails (we never opt-in you to marketing; you'd have to subscribe explicitly)</li>
          </ul>
          <p className="mt-2">
            Email <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a> to exercise any of these. We respond within 30 days.
          </p>
        </Sec>

        <Sec title="California, Virginia, Colorado, and other state privacy rights">
          <p className="mt-1">
            Residents of states with consumer privacy laws (including California's CCPA/CPRA, Virginia's VCDPA, Colorado's CPA,
            Connecticut's CTDPA, and Utah's UCPA) have specific rights, including the right to know, delete, and opt
            out of "sale" or "sharing" of personal data. <strong>FindStoop does not sell personal information</strong>{' '}
            as defined under any of these laws. To exercise your state-specific rights, email{' '}
            <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a> with the subject line
            "Privacy Rights Request."
          </p>
        </Sec>

        <Sec title="Cookies + tracking">
          <p className="mt-1">
            We use only the cookies and local-storage entries needed to keep you signed in and remember your preferences.
            We do not use third-party advertising cookies, marketing pixels, or cross-site tracking. The minimal cookies
            we set are:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Supabase authentication tokens (session)</li>
            <li>Stripe iframe cookies (when paying — set by Stripe directly)</li>
            <li>Local storage entries for UI preferences (theme, dismissed banners)</li>
          </ul>
        </Sec>

        <Sec title="Children">
          FindStoop is not directed at people under 18. Renters must be at least 18 to apply or sign a lease through the
          platform. We do not knowingly collect personal information from anyone under 18; if you believe we have, email
          us and we'll delete it.
        </Sec>

        <Sec title="Security">
          <p className="mt-1">
            We host data on SOC-2 certified infrastructure (Supabase, Stripe). All data is encrypted in transit (TLS 1.2+)
            and at rest. We never store full payment-card numbers, full SSNs, or unencrypted passwords. Access to
            production data is limited to the platform operator and is logged.
          </p>
          <p className="mt-2">
            No system is perfectly secure. If we detect a security incident that affects your data, we'll notify you
            promptly as required by applicable law.
          </p>
        </Sec>

        <Sec title="International users">
          FindStoop is operated from the United States and stores data on US-based infrastructure. If you access the
          platform from outside the US, your data will be transferred to and processed in the US.
        </Sec>

        <Sec title="Changes to this policy">
          We may update this policy as the platform evolves or as the law changes. If we make material changes, we'll
          notify active users via email and update the "Effective" date at the top of this page.
        </Sec>

        <Sec title="Contact">
          <a href="mailto:support@findstoop.com" className="text-brand-600 hover:underline">support@findstoop.com</a>
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
      <div className="text-mute">{children}</div>
    </div>
  )
}
