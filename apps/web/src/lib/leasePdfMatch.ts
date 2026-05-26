// Shared helpers for auto-matching signed-lease PDFs to lease records.
// Used in TWO places:
//   1. apps/web/src/pages/manager/ImportAvail.tsx — matching mid-migration
//      against the joined-leases array still in memory.
//   2. apps/web/src/pages/manager/AttachLeases.tsx — matching after-the-fact
//      against pending/upcoming leases already in the database.
//
// Both consumers reduce their lease records to the shape `MatchableLease`
// so the scoring function doesn't care where the data came from.

export interface MatchableLease {
  property_address: string         // street address (no city/state)
  unit_number: string              // may be empty
  tenants: { last_name: string }[] // for last-name corroboration
}

// ── PDF text extraction (lazy-loaded pdfjs) ───────────────────────────────
// Pdfjs-dist is ~600KB minified — only load when there's actually a PDF to
// parse so non-migration flows don't pay the cost. We grab the first page
// only; that's where the property address + tenant signature line usually
// is.
let pdfjsLoaded: Promise<typeof import('pdfjs-dist')> | null = null
function loadPdfjs() {
  if (!pdfjsLoaded) {
    pdfjsLoaded = (async () => {
      const lib = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })()
  }
  return pdfjsLoaded
}

export async function extractPdfFirstPageText(file: File): Promise<string> {
  try {
    const pdfjs = await loadPdfjs()
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buf }).promise
    // Lease term info usually appears on page 1 ("Term" section), but some
    // templates push it to page 2 (after recitals/parties). Read up to the
    // first 2 pages to cover both. Beyond 2 pages is rarely worth the cost.
    const pageCount = Math.min(2, pdf.numPages)
    const chunks: string[] = []
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      type TextItem = { str?: string }
      chunks.push(content.items.map((it) => (it as TextItem).str ?? '').join(' '))
    }
    return chunks.join(' ')
  } catch {
    return ''  // failure is non-fatal; fall back to filename matching alone
  }
}

// ── Lease commencement date extraction ───────────────────────────────────
// Reads PDF text and tries to find the lease's actual commencement date
// (vs. the rent-roll's recorded start, which may be wrong for upcoming
// leases that haven't started yet). Strategy:
//   1. Find the first occurrence of a commencement keyword.
//   2. Scan ~250 chars after it for the first valid date.
//   3. If nothing keyword-anchored is found, fall back to the *earliest*
//      year-bearing date on page 1 — this catches templates that show
//      "Term: <start> – <end>" without prose keywords.
//
// Returns YYYY-MM-DD or null. Year must be 2000–2099 to avoid grabbing
// "1099 Main St" address fragments or formatting artifacts.

const COMMENCEMENT_KEYWORDS = /\b(commenc|term\s*begin|begin\w*\s*on|start\s*date|effective\s*date|lease\s*term|term\s*of\s*lease|tenancy\s*begin)/i

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function tryParseDate(s: string): string | null {
  // "January 1, 2027" / "Jan 1 2027" / "January 1st, 2027"
  const m1 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i.exec(s)
  if (m1) {
    const day = m1[2].padStart(2, '0')
    const month = MONTH_MAP[m1[1].toLowerCase().slice(0, 3)]
    if (Number(day) <= 31) return `${m1[3]}-${month}-${day}`
  }
  // "1/15/2027" or "01-15-2027" — assumes US m/d/y
  const m2 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/.exec(s)
  if (m2) {
    const mm = m2[1].padStart(2, '0')
    const dd = m2[2].padStart(2, '0')
    if (Number(mm) <= 12 && Number(dd) <= 31) return `${m2[3]}-${mm}-${dd}`
  }
  // ISO: "2027-01-15"
  const m3 = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(s)
  if (m3) {
    const mm = m3[2].padStart(2, '0')
    const dd = m3[3].padStart(2, '0')
    if (Number(mm) <= 12 && Number(dd) <= 31) return `${m3[1]}-${mm}-${dd}`
  }
  return null
}

export function extractLeaseStartDate(text: string): string | null {
  if (!text) return null
  // Try keyword-anchored extraction first
  const kw = COMMENCEMENT_KEYWORDS.exec(text)
  if (kw) {
    const window = text.slice(kw.index, kw.index + 250)
    const hit = tryParseDate(window)
    if (hit) return hit
  }
  // Fall back to the earliest date appearing anywhere in the extracted text
  // — works for templates where the Term section is just "<date> to <date>".
  const candidates: string[] = []
  const patterns = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}\b/gi,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}\b/g,
    /\b20\d{2}-\d{1,2}-\d{1,2}\b/g,
  ]
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.exec(text)) !== null) {
      const parsed = tryParseDate(m[0])
      if (parsed) candidates.push(parsed)
    }
  }
  if (candidates.length === 0) return null
  candidates.sort()
  return candidates[0]   // earliest — best guess at lease start
}

// Score a (lease, pdf) pairing using filename tokens + extracted PDF text.
// Returns 0..1 where >0.4 is a confident match. Logic:
//   • Property street-address number (e.g. "301") — strong signal (0.4)
//   • Street name token (e.g. "14th", "main") — 0.2 per match, cap 0.4
//   • Unit number — 0.2 if present in pdf hints
//   • Tenant last name — 0.2 per match, cap 0.3
export function scoreLeasePdfMatch(
  lease: MatchableLease,
  pdfHints: string,                    // filename + extracted text, both lowercased
): number {
  if (!pdfHints) return 0
  const hay = pdfHints
  const addrTokens = lease.property_address.toLowerCase().split(/[\s,#]+/).filter(Boolean)
  const number = addrTokens.find((t) => /^\d+$/.test(t))
  const namedTokens = addrTokens.filter((t) => !/^\d+$/.test(t) && t.length >= 3)
  let score = 0
  if (number && hay.includes(number)) score += 0.4
  let nameHits = 0
  for (const tok of namedTokens) {
    if (hay.includes(tok)) { nameHits += 1; if (nameHits >= 2) break }
  }
  score += Math.min(0.4, nameHits * 0.2)
  const unit = lease.unit_number.toLowerCase().trim()
  if (unit && hay.includes(unit)) score += 0.2
  let nameMatches = 0
  for (const t of lease.tenants) {
    const ln = t.last_name.toLowerCase().trim()
    if (ln && ln.length >= 3 && hay.includes(ln)) { nameMatches += 1; if (nameMatches >= 2) break }
  }
  score += Math.min(0.3, nameMatches * 0.2)
  return Math.min(1, score)
}

// Greedy auto-assignment: for each PDF, pick the highest-scoring lease
// still free (and above the confidence threshold). Manual overrides in
// `preserve` are kept regardless of score.
export interface LeasePdfMatch {
  fileIndex: number
  score: number
  manuallyAssigned: boolean
}

export function autoMatchPdfs<TKey extends string | number>(
  leases: Array<MatchableLease & { key: TKey }>,
  pdfHints: string[],
  preserve: Record<TKey, LeasePdfMatch | undefined> = {} as Record<TKey, LeasePdfMatch | undefined>,
): Record<TKey, LeasePdfMatch | undefined> {
  const next: Record<TKey, LeasePdfMatch | undefined> = {} as Record<TKey, LeasePdfMatch | undefined>
  const taken = new Set<number>()
  for (const [key, m] of Object.entries(preserve) as Array<[TKey, LeasePdfMatch | undefined]>) {
    if (m?.manuallyAssigned) { next[key] = m; taken.add(m.fileIndex) }
  }
  const candidates: Array<{ key: TKey; fileIdx: number; score: number }> = []
  for (let f = 0; f < pdfHints.length; f++) {
    if (taken.has(f)) continue
    for (const lease of leases) {
      if (next[lease.key]) continue
      const score = scoreLeasePdfMatch(lease, pdfHints[f])
      if (score >= 0.4) candidates.push({ key: lease.key, fileIdx: f, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  for (const c of candidates) {
    if (next[c.key]) continue
    if (taken.has(c.fileIdx)) continue
    next[c.key] = { fileIndex: c.fileIdx, score: c.score, manuallyAssigned: false }
    taken.add(c.fileIdx)
  }
  return next
}
