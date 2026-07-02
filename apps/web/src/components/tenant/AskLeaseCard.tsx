// "Ask about your lease" — tenant Q&A grounded in their own signed lease.
//
// Thin client over the ask-lease edge function: the tenant types a question,
// the function answers strictly from their lease document, and we render the
// answer with a muted not-legal-advice disclaimer. History is session-local
// component state only — nothing is persisted client-side.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MessageCircleQuestion, Loader2, Send } from 'lucide-react'

interface AskLeaseResponse {
  ok: boolean
  answer?: string
  disclaimer?: string
  code?: 'rate_limited' | 'unavailable' | 'bad_question'
  message?: string
}

interface QA {
  question: string
  answer: string
  disclaimer: string
}

const MAX_QUESTION_LEN = 500
const FALLBACK_DISCLAIMER =
  'This is general information based on your lease document, not legal advice. ' +
  'For legal questions, contact a licensed attorney or local tenant resources.'

export default function AskLeaseCard({ leaseId }: { leaseId: string }) {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [history, setHistory] = useState<QA[]>([])

  const ask = async () => {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    setError('')
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('ask-lease', {
        body: { lease_id: leaseId, question: q },
      })
      if (invokeErr) throw new Error('Could not reach the lease assistant. Please try again.')
      const res = data as AskLeaseResponse
      if (!res?.ok || !res.answer) {
        // "No readable lease" is a terminal state for this lease — swap the
        // input for a quiet explanation instead of an error banner.
        if (res?.code === 'unavailable') {
          setUnavailable(res.message ?? "Answers aren't available for this lease.")
          return
        }
        throw new Error(res?.message || 'Could not answer that just now. Please try again.')
      }
      setHistory((h) => [...h, { question: q, answer: res.answer as string, disclaimer: res.disclaimer ?? FALLBACK_DISCLAIMER }])
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
          <MessageCircleQuestion className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Ask about your lease</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pets, guests, landlord entry, breaking the lease — answered from your signed lease.
          </p>
        </div>
      </div>

      {/* Session-local Q&A history (cleared on page leave). */}
      {history.length > 0 && (
        <div className="space-y-3">
          {history.map((qa, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-sm font-medium text-gray-900">{qa.question}</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{qa.answer}</p>
              <p className="text-[11px] text-gray-400">{qa.disclaimer}</p>
            </div>
          ))}
        </div>
      )}

      {unavailable ? (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
          {unavailable}
        </p>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void ask() }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={MAX_QUESTION_LEN}
            placeholder='e.g. "Can I have a dog?"'
            disabled={busy}
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="p-2.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-40 shrink-0"
            title="Ask"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {busy && history.length === 0 && (
        <p className="text-xs text-gray-400">Reading your lease…</p>
      )}
    </section>
  )
}
