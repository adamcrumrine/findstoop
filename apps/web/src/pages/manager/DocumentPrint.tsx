// Print-ready view of a generated document — the "PDF".
//
// Mirrors LeasePdf.tsx: a branded paper sheet the manager saves via the
// browser print dialog (window.print()). The @media print CSS strips the
// toolbar and chrome. RLS scopes access; a clean message covers the rest.

import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import { getGeneratedDocument } from '@findstoop/shared/api/generatedDocuments'
import type { GeneratedDocument } from '@findstoop/shared/types/generatedDocument'
import Letterhead from '../../components/documents/Letterhead'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'

export default function DocumentPrint() {
  const { id } = useParams<{ id: string }>()
  const { profile, loading: authLoading } = useAuth()
  const [doc, setDoc] = useState<GeneratedDocument | null>(null)
  const [propertyAddress, setPropertyAddress] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const d = await getGeneratedDocument(id)
        if (cancelled) return
        setDoc(d)
        if (d?.property_id) {
          const { data: p } = await supabase
            .from('properties')
            .select('name, address, city, state, zip')
            .eq('id', d.property_id)
            .maybeSingle()
          if (p && !cancelled) {
            setPropertyAddress([p.address, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(' · '))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-mute">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />

  if (!doc || !doc.generated_body) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-mute">This document isn't available.</p>
        <Link to="/manager/documents" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back to documents
        </Link>
      </div>
    )
  }

  const backTo = profile.role === 'tenant' ? '/tenant/documents' : '/manager/documents'

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Toolbar — hidden when printing */}
      <div className="doc-print-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-ink">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to documents
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Printer className="w-4 h-4" strokeWidth={1.75} />
            Print or save as PDF
          </button>
        </div>
      </div>

      {/* Paper */}
      <div className="doc-print-paper max-w-3xl mx-auto bg-white shadow-sm my-6 print:my-0 print:shadow-none">
        <div className="px-10 py-12 print:px-14 print:py-12">
          <Letterhead
            reference={`${doc.title} · ${String(doc.id).slice(0, 8).toUpperCase()}`}
            propertyAddress={propertyAddress}
            bodyHtml={doc.generated_body}
          />
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .doc-print-toolbar { display: none !important; }
          .doc-print-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { margin: 0.6in; size: letter; }
        }
      `}</style>
    </div>
  )
}
