// Lease addenda panel (manager, shown on an executed lease).
//
// Lists every addendum on the lease with its signing progress, and launches the
// create-and-sign flow. An addendum is the sanctioned way to change a signed
// lease — see CreateAddendumModal.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listGeneratedDocumentsForLease, getDocumentSignatures,
} from '@findstoop/shared/api/generatedDocuments'
import type { GeneratedDocument } from '@findstoop/shared/types/generatedDocument'
import CreateAddendumModal from './CreateAddendumModal'
import { FilePlus2, Loader2, CheckCircle2, Clock, ChevronRight } from 'lucide-react'

interface Row { doc: GeneratedDocument; signed: number; required: number }

export default function LeaseAddenda({ leaseId }: { leaseId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const docs = (await listGeneratedDocumentsForLease(leaseId)).filter((d) => d.type === 'addendum')
      const withCounts = await Promise.all(docs.map(async (doc) => {
        const required = ((doc.meta as { required_signer_ids?: string[] })?.required_signer_ids ?? []).length
        let signed = 0
        try { signed = (await getDocumentSignatures(doc.id)).length } catch { /* ignore */ }
        return { doc, signed, required }
      }))
      // Newest first.
      withCounts.sort((a, b) => (a.doc.created_at < b.doc.created_at ? 1 : -1))
      setRows(withCounts)
    } finally {
      setLoading(false)
    }
  }, [leaseId])

  useEffect(() => { load() }, [load])

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-mute">Addenda</h2>
          <p className="text-xs text-mute mt-1">Amend this signed lease with a written addendum all parties sign.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg shrink-0"
        >
          <FilePlus2 className="w-4 h-4" strokeWidth={1.75} /> Create an addendum
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-mute py-3"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-mute py-2">No addenda yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ doc, signed, required }) => {
            const done = doc.status === 'signed'
            return (
              <Link
                key={doc.id}
                to={`/manager/documents/${doc.id}`}
                className="flex items-center gap-3 border border-gray-200 hover:border-brand-300 rounded-xl px-3 py-2.5 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ${done ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                  {done ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} /> : <Clock className="w-4 h-4" strokeWidth={1.75} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
                  <p className="text-xs text-mute">
                    {done ? 'Fully signed' : `Awaiting signatures — ${signed} of ${required} signed`}
                    {' · '}{new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-mute-400 group-hover:text-brand-600 shrink-0" strokeWidth={1.75} />
              </Link>
            )
          })}
        </div>
      )}

      <CreateAddendumModal
        leaseId={leaseId}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={load}
      />
    </section>
  )
}
