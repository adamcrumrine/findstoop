// Lightweight CSV parser for the Avail / TurboTenant / generic portfolio
// import wizard. Pure client-side — no dependency cost.
//
// Handles:
//   • Quoted fields with embedded commas, newlines, and double-quote escaping
//   • Trimmed values
//   • Case-insensitive header lookup with synonym mapping (so "Lease Start",
//     "lease_start", "Start Date" all map to the same canonical column)
//
// Returns rows as Record<canonical_key, string>. Callers do their own
// type-coercion + validation.

export interface ParsedCsv<TKey extends string> {
  rows: Array<Record<TKey, string>>
  unmatchedHeaders: string[]       // headers in the file with no synonym match
  matchedHeaders: Partial<Record<TKey, string>>  // canonical → actual header
  rowCount: number
}

export interface ColumnSchema<TKey extends string> {
  /** Canonical key the consumer will use. */
  key: TKey
  /** Human-readable label for previews. */
  label: string
  /** Case-insensitive header strings to match — first match wins. */
  synonyms: string[]
  required?: boolean
}

// ── Tokenizer ──────────────────────────────────────────────────────────────
function tokenizeCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const text = input.replace(/\r\n?/g, '\n')  // normalize CRLF / CR

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      cell += c
      i++
      continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(cell); cell = ''; i++; continue }
    if (c === '\n') { row.push(cell); rows.push(row); cell = ''; row = []; i++; continue }
    cell += c
    i++
  }
  // Trailing cell / row (no newline at EOF)
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
  // Drop trailing all-empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return rows
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
}

export function parseCsv<TKey extends string>(
  input: string,
  schema: ColumnSchema<TKey>[],
): ParsedCsv<TKey> {
  const tokens = tokenizeCsv(input)
  if (tokens.length < 1) {
    return { rows: [], unmatchedHeaders: [], matchedHeaders: {}, rowCount: 0 }
  }
  const headerRow = tokens[0]
  const headerLower = headerRow.map(normalizeHeader)

  // Build column index map — canonical key → file column index
  const colIndex: Partial<Record<TKey, number>> = {}
  const matchedHeaders: Partial<Record<TKey, string>> = {}
  for (const col of schema) {
    for (const syn of col.synonyms) {
      const idx = headerLower.indexOf(normalizeHeader(syn))
      if (idx >= 0) {
        colIndex[col.key] = idx
        matchedHeaders[col.key] = headerRow[idx]
        break
      }
    }
  }

  // Track unmatched file headers so we can warn the user
  const matchedSet = new Set(Object.values(colIndex) as number[])
  const unmatchedHeaders = headerRow
    .map((h, i) => (matchedSet.has(i) ? null : h))
    .filter((h): h is string => !!h && h.trim().length > 0)

  const rows: Array<Record<TKey, string>> = []
  for (let i = 1; i < tokens.length; i++) {
    const r = tokens[i]
    if (r.every((c) => c.trim() === '')) continue
    const obj = {} as Record<TKey, string>
    for (const col of schema) {
      const idx = colIndex[col.key]
      obj[col.key] = idx != null ? (r[idx] ?? '').trim() : ''
    }
    rows.push(obj)
  }

  return { rows, unmatchedHeaders, matchedHeaders, rowCount: rows.length }
}

// ── Canonical schemas the import wizard uses ──────────────────────────────
// Matches Avail's export columns first (their order), then common variants
// from TurboTenant / Innago / RentRedi / generic spreadsheets.

export type PropertyCsvKey =
  | 'name' | 'address' | 'city' | 'state' | 'zip'
  | 'property_type' | 'unit_count'

export const PROPERTY_SCHEMA: ColumnSchema<PropertyCsvKey>[] = [
  { key: 'name',          label: 'Property name',  synonyms: ['property name', 'property', 'name', 'building name', 'title'], required: false },
  { key: 'address',       label: 'Street address', synonyms: ['address', 'street address', 'street', 'address line 1', 'address1'], required: true },
  { key: 'city',          label: 'City',           synonyms: ['city'], required: true },
  { key: 'state',         label: 'State',          synonyms: ['state', 'province', 'st'], required: true },
  { key: 'zip',           label: 'ZIP code',       synonyms: ['zip', 'zip code', 'postal code', 'postcode'], required: true },
  { key: 'property_type', label: 'Property type',  synonyms: ['property type', 'type', 'building type'] },
  { key: 'unit_count',    label: 'Unit count',     synonyms: ['units', 'unit count', 'number of units', 'total units'] },
]

export type TenantCsvKey =
  | 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone'
  | 'property_match' | 'unit_number'
  | 'rent_amount' | 'security_deposit' | 'lease_start' | 'lease_end'
  | 'bedrooms' | 'bathrooms'

export const TENANT_SCHEMA: ColumnSchema<TenantCsvKey>[] = [
  { key: 'first_name',       label: 'First name',      synonyms: ['first name', 'firstname', 'given name'], required: false },
  { key: 'last_name',        label: 'Last name',       synonyms: ['last name', 'lastname', 'surname', 'family name'], required: false },
  // Combined-name fallback for vendors that ship a single "Resident Name"
  // column (AppFolio, Buildium, DoorLoop). The wizard splits on the last
  // space when first/last aren't present.
  { key: 'full_name',        label: 'Full name',       synonyms: ['name', 'tenant name', 'resident name', 'full name', 'resident'], required: false },
  { key: 'email',            label: 'Email',           synonyms: ['email', 'email address', 'e-mail', 'tenant email', 'resident email'], required: true },
  { key: 'phone',            label: 'Phone',           synonyms: ['phone', 'phone number', 'mobile', 'cell', 'mobile phone', 'tenant phone'] },
  { key: 'property_match',   label: 'Property',        synonyms: ['property', 'property name', 'building', 'building name', 'address', 'property address'], required: true },
  { key: 'unit_number',      label: 'Unit number',     synonyms: ['unit', 'unit number', 'unit #', 'apt', 'apartment', 'apartment number', 'unit name'], required: true },
  { key: 'rent_amount',      label: 'Monthly rent',    synonyms: ['rent', 'monthly rent', 'rent amount', 'lease rent', 'market rent', 'current rent'], required: true },
  { key: 'security_deposit', label: 'Security deposit', synonyms: ['security deposit', 'deposit', 'security', 'sec deposit'] },
  { key: 'lease_start',      label: 'Lease start',     synonyms: ['lease start', 'start date', 'lease start date', 'lease from', 'move in', 'move-in date', 'move in date'], required: true },
  { key: 'lease_end',        label: 'Lease end',       synonyms: ['lease end', 'end date', 'lease end date', 'lease to', 'move out', 'move-out date', 'move out date', 'expiration'], required: true },
  { key: 'bedrooms',         label: 'Bedrooms',        synonyms: ['bedrooms', 'beds', 'bed', 'br'] },
  { key: 'bathrooms',        label: 'Bathrooms',       synonyms: ['bathrooms', 'baths', 'bath', 'ba'] },
]

// Split a "Jane A. Smith" or "Smith, Jane" into first + last. Best-effort
// — when in doubt we leave the input alone and let the user fix it.
export function splitFullName(s: string | undefined): { first: string; last: string } {
  const t = (s ?? '').trim()
  if (!t) return { first: '', last: '' }
  // "Smith, Jane" → last="Smith", first="Jane"
  if (t.includes(',')) {
    const [last, ...rest] = t.split(',').map((x) => x.trim())
    return { first: rest.join(' ').trim(), last }
  }
  // "Jane A. Smith" → first="Jane A.", last="Smith"
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  const last = parts.pop()!
  return { first: parts.join(' '), last }
}

// ── Coercion helpers (used by the wizard preview + the edge function) ────
export function coerceMoney(s: string | undefined): number | null {
  if (!s) return null
  const cleaned = s.replace(/[$,]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function coerceInt(s: string | undefined): number | null {
  if (!s) return null
  const n = parseInt(s.replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

export function coerceDateISO(s: string | undefined): string | null {
  if (!s) return null
  // Accept MM/DD/YYYY, YYYY-MM-DD, M-D-YY, etc.
  const t = s.trim()
  if (!t) return null
  // Native Date.parse handles most US formats
  const d = new Date(t)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function normalizeState(s: string | undefined): string | null {
  if (!s) return null
  const t = s.trim().toUpperCase()
  if (t.length === 2) return t
  // Common full-name fallbacks for the major Avail markets
  const map: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
    MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
    VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI',
    WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
  }
  return map[t] ?? null
}
