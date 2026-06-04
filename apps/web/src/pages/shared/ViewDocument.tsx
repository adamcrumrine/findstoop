// Tenant-facing read-only document view (/view/:id).
//
// A focused single-document page — branded shell, the rendered letter, and a
// download button. No app nav, no upsell. RLS scopes access to the addressed
// tenant (and the manager / admin).

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getDocumentForView, logEvent, type DocViewBundle } from '@findstoop/shared/api/generatedDocuments'
import Letterhead from '../../components/documents/Letterhead'
import DocPageShell from '../../components/documents/DocPageShell'
import { Loader2, Download } from 'lucide-react'

export default function ViewDocument() {
  const { id } = useParams<{ id: string }>()
  const { user, profile, loading: authLoading } = useAuth()
  const [bundle, setBundle] = useState<DocViewBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const opened = useRef(false)

  useEffect(() => {
    if (!id || authLoading) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const b = await getDocumentForView(id)
        if (cancelled) return
        setBundle(b)
        // Record the tenant opening it — once per mount.
        if (b && user?.id && profile?.role === 'tenant' && b.doc.tenant_id === user.id && !opened.current) {
          opened.current = true
          logEvent(id, 'opened', user.id).catch(() => {})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, authLoading, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-screen text-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  if (!user) {
    return (
      <DocPageShell senderName="your landlord">
        <div className="text-center py-16">
          <p className="text-ink">Please sign in to view this document.</p>
          <Link to="/login/renter" className="mt-4 inline-block bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Sign in</Link>
        </div>
      </DocPageShell>
    )
  }

  if (!bundle || !bundle.doc.generated_body) {
    return (
      <DocPageShell senderName="your landlord">
        <div className="text-center py-16 text-mute">This document isn't available.</div>
      </DocPageShell>
    )
  }

  const { doc, propertyName, propertyAddress, managerName, managerEmail } = bundle

  return (
    <DocPageShell senderName={managerName} propertyAddress={propertyName} contactEmail={managerEmail}>
      <div className="flex justify-end mb-3">
        <a
          href={`/document-print/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
        >
          <Download className="w-4 h-4" strokeWidth={1.75} /> Download PDF
        </a>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 sm:px-10 py-10">
        <Letterhead reference={doc.title} propertyAddress={propertyAddress} bodyHtml={doc.generated_body ?? ''} />
      </div>
    </DocPageShell>
  )
}
